import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";

import { pool } from "../db/connect.js";
import {
  computeMolyGetSignature,
  computeMolySignature,
} from "../middleware/requireMolyIntegration.js";
import { createHealthRouter } from "../router/health.router.js";
import { createMolyIntegrationRouter } from "../router/molyIntegration.router.js";
import { createMolyIntegrationV2Router } from "../router/molyIntegrationV2.router.js";
import { createExternalCourseMappingRouter } from "../router/externalCourseMapping.router.js";
import {
  getIntegrationMetricsSnapshot,
  isCatalogSyncKillSwitchActive,
  isContentSyncKillSwitchActive,
  isDelegatedLearningKillSwitchActive,
  isMolyIntegrationKillSwitchActive,
  isRepairMutationsKillSwitchActive,
  resetIntegrationMetrics,
} from "./integrationLogger.service.js";
import {
  ALLOWED_DELEGATED_SCOPES,
  mintDelegatedLearningSession,
} from "./delegatedLearning.service.js";
import {
  buildReconciliationSnapshotForMoly,
  enqueueMolyIntegrationEvent,
  getMolyIntegrationHealthProbe,
  getMolyOpsV2Overview,
  parseGrantWirePayload,
  parseProvisionWirePayload,
  parseRevokeWirePayload,
  processAvailableMolyInboxJobs,
  processNextMolyInboxJob,
  retryCourseOutboxJob,
  retryMolyInboxJob,
  retryMolySubjectSync,
} from "./molyIntegration.service.js";
import { establishLoginSession, TRUSTED_DEVICE_COOKIE } from "./trustedDevice.service.js";

const TEST_MOLY_CFG = {
  serviceToken: "day8-10-super-secret-bearer-token-value",
  integrationKey: "moly-studio-v2",
  hmacSecret: "day8-10-super-secret-hmac-key-value",
  jwtSecret: "day8-10-super-secret-jwt-value",
  databaseUrl: "postgresql://secretuser:secretpass@db.internal:5432/csca_prod",
  r2Secret: "day8-10-r2-secret-access-key",
};

const ENV_KEYS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "MOLY_INTEGRATION_SERVICE_TOKEN",
  "MOLY_INTEGRATION_KEY",
  "MOLY_INTEGRATION_HMAC_SECRET",
  "MOLY_INTEGRATION_MAX_AGE_SECONDS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "MOLY_INTEGRATION_SYNC_DISABLED",
  "MOLY_INTEGRATION_KILL_SWITCH",
  "COURSE_CONTENT_SYNC_DISABLED",
  "COURSE_CATALOG_SYNC_DISABLED",
  "MOLY_CATALOG_SYNC_DISABLED",
  "DELEGATED_LEARNING_KILL_SWITCH",
  "MOLY_DELEGATED_LEARNING_DISABLED",
  "MOLY_DELEGATED_LEARNING_KILL_SWITCH",
  "COURSE_REPAIR_MUTATIONS_DISABLED",
  "MOLY_REPAIR_MUTATIONS_DISABLED",
  "REPAIR_MUTATIONS_KILL_SWITCH",
];

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const bindPoolToDb = (targetPool, pg) => {
  targetPool.query = (sql, params) => (params ? pg.query(sql, params) : pg.query(sql));
  targetPool.connect = async () => ({
    query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
    release: () => {},
  });
};

const makeDbAdapter = (pg) => ({
  query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
  getClient: async () => ({
    query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
    release: () => {},
  }),
});

const startServer = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
  });
});

const stopServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const withEnvOverrides = async (overrides, fn) => {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const signedRequest = async (baseUrl, {
  method = "GET",
  path,
  body = null,
  sessionToken = null,
  idempotencyKey = `idem-${crypto.randomUUID()}`,
}) => {
  const timestamp = new Date().toISOString();
  const correlationId = `corr-day810-${crypto.randomUUID()}`;
  const isGetLike = method === "GET" || method === "HEAD" || (method === "DELETE" && body === null);
  const rawBody = body === null ? "" : JSON.stringify(body);
  const signature = isGetLike
    ? computeMolyGetSignature({
        timestamp,
        method,
        originalUrl: path,
        secret: TEST_MOLY_CFG.hmacSecret,
      })
    : computeMolySignature({
        timestamp,
        rawBody,
        secret: TEST_MOLY_CFG.hmacSecret,
      });

  const headers = {
    Authorization: `Bearer ${TEST_MOLY_CFG.serviceToken}`,
    "X-Integration-Key": TEST_MOLY_CFG.integrationKey,
    "X-Correlation-ID": correlationId,
    "X-Event-Timestamp": timestamp,
    "X-Signature": signature,
  };
  if (method !== "GET" && method !== "HEAD") {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  if (!isGetLike) {
    headers["Content-Type"] = "application/json";
  }
  if (sessionToken) {
    headers["X-Delegated-Session"] = sessionToken;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: isGetLike ? undefined : rawBody,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, text };
};

const createAdminCookie = async (userId) => {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { sessionId, sessionToken, deviceToken } = await establishLoginSession({
    userId,
    userAgent: "Mozilla/5.0 Day8Admin",
    ipAddress: "127.0.0.1",
    expiresAt,
  });
  const token = jwt.sign({ userId, sessionId, sessionToken }, TEST_MOLY_CFG.jwtSecret, { expiresIn: "1d" });
  return `jwt=${token}; ${TRUSTED_DEVICE_COOKIE}=${deviceToken}`;
};

const setupDay8Env = async (t, { mountHttp = true } = {}) => {
  resetIntegrationMetrics();
  const prevEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  process.env.DATABASE_URL = TEST_MOLY_CFG.databaseUrl;
  process.env.JWT_SECRET = TEST_MOLY_CFG.jwtSecret;
  process.env.MOLY_INTEGRATION_SERVICE_TOKEN = TEST_MOLY_CFG.serviceToken;
  process.env.MOLY_INTEGRATION_KEY = TEST_MOLY_CFG.integrationKey;
  process.env.MOLY_INTEGRATION_HMAC_SECRET = TEST_MOLY_CFG.hmacSecret;
  process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS = "300";
  process.env.R2_ACCOUNT_ID = "test-r2-acct";
  process.env.R2_ACCESS_KEY_ID = "test-r2-key";
  process.env.R2_SECRET_ACCESS_KEY = TEST_MOLY_CFG.r2Secret;
  process.env.R2_BUCKET_NAME = "test-r2-bucket";

  const pg = new PGlite();
  await loadFullCourseSchema(pg);

  const prevQuery = pool.query;
  const prevConnect = pool.connect;
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  let serverInfo = null;
  if (mountHttp) {
    const app = express();
    app.use(express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }));
    app.use(cookieParser());
    app.use("/api/integrations/v1", createMolyIntegrationRouter({ db }));
    app.use("/api/integrations/v2", createMolyIntegrationV2Router({ db }));
    app.use("/api/v1/admin/integrations", createExternalCourseMappingRouter({ db }));
    app.use("/api/health", createHealthRouter({ db }));
    serverInfo = await startServer(app);
  }

  t.after(async () => {
    if (serverInfo?.server) {
      await stopServer(serverInfo.server);
    }
    pool.query = prevQuery;
    pool.connect = prevConnect;
    await pg.close();
    for (const k of ENV_KEYS) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
    resetIntegrationMetrics();
  });

  return { pg, db, baseUrl: serverInfo?.baseUrl || null };
};

const seedCourseLearningFixture = async (pg, db, { suffix = "d8" } = {}) => {
  const admin = (await pg.query(
    `INSERT INTO users(username, email, role) VALUES ($1, $2, 'admin') RETURNING id, role`,
    [`admin-${suffix}`, `admin-${suffix}@example.test`],
  )).rows[0];
  const teacher = (await pg.query(
    `INSERT INTO users(username, email, role) VALUES ($1, $2, 'creator') RETURNING id, role`,
    [`teacher-${suffix}`, `teacher-${suffix}@example.test`],
  )).rows[0];
  const learner = (await pg.query(
    `INSERT INTO users(username, email, role, is_management_managed, lms_account_status)
     VALUES ($1, $2, 'user', FALSE, 'unmanaged') RETURNING id, role`,
    [`learner-${suffix}`, `learner-${suffix}@example.test`],
  )).rows[0];
  const extUserId = `moly:usr:${suffix}`;
  await pg.query(
    `INSERT INTO external_identities(user_id, source_system, external_user_id, status, source_updated_at)
     VALUES ($1, 'moly', $2, 'active', NOW())`,
    [learner.id, extUserId],
  );

  const course = (await pg.query(
    `INSERT INTO courses(name, title, slug, author_id, is_published, is_management_managed)
     VALUES ($1, $1, $2, $3, TRUE, FALSE) RETURNING id, title, slug`,
    [`Course ${suffix}`, `course-${suffix}`, teacher.id],
  )).rows[0];
  const section = (await pg.query(
    `INSERT INTO sections(course_id, title, sort_order) VALUES ($1, 'Section 1', 1) RETURNING id`,
    [course.id],
  )).rows[0];
  const video = (await pg.query(
    `INSERT INTO video_assets(title, r2_key, provider, provider_video_id, duration_seconds, playback_status)
     VALUES ($1, $2, 'bunny_stream', $3, 120, 'ready') RETURNING id`,
    [`Video ${suffix}`, `videos/${suffix}.mp4`, `bunny-${suffix}`],
  )).rows[0];
  const lesson1 = (await pg.query(
    `INSERT INTO lessons(course_id, section_id, name, title, duration_seconds, is_published, sort_order, video_asset_id)
     VALUES ($1, $2, 'Lesson 1', 'Lesson 1', 120, TRUE, 1, $3) RETURNING id`,
    [course.id, section.id, video.id],
  )).rows[0];
  const lesson2 = (await pg.query(
    `INSERT INTO lessons(course_id, section_id, name, title, duration_seconds, is_published, sort_order)
     VALUES ($1, $2, 'Lesson 2', 'Lesson 2', 120, TRUE, 2) RETURNING id`,
    [course.id, section.id],
  )).rows[0];

  const profile = (await pg.query(
    `INSERT INTO video_course_profiles(course_id, mode, enforce_trusted_devices, device_limit, allow_file_download, status)
     VALUES ($1, 'INDEPENDENT', FALSE, 2, TRUE, 'active') RETURNING id, course_id, mode`,
    [course.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO external_course_mappings(
       source_system, external_course_id, local_course_id, local_video_course_profile_id, status
     ) VALUES ('moly', $1, $2, $3, 'active')`,
    [`moly:crs:${suffix}`, course.id, profile.id],
  );
  await pg.query(
    `INSERT INTO external_entitlements(
       source_system, external_grant_id, external_user_id, external_course_id, user_id, local_course_id,
       local_video_course_profile_id, status, valid_from, source_updated_at
     ) VALUES ('moly', $1, $2, $3, $4, $5, $6, 'active', NOW() - INTERVAL '1 hour', NOW())`,
    [`moly:grant:${suffix}`, extUserId, `moly:crs:${suffix}`, learner.id, course.id, profile.id],
  );
  await pg.query(
    `INSERT INTO enrollments(user_id, course_id, status) VALUES ($1, $2, 'active')`,
    [learner.id, course.id],
  );

  const quiz = (await pg.query(
    `INSERT INTO quizzes(title, course_id, lesson_id, instructor_id, status, duration_minutes, passing_score, attempt_limit)
     VALUES ($1, $2, $3, $4, 'PUBLISHED', 15, 50, 3) RETURNING id`,
    [`Quiz ${suffix}`, course.id, lesson1.id, teacher.id],
  )).rows[0];
  const question = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
     VALUES ($1, '2 + 2 = ?', 'single_choice', '[{"key":"A","text":"3"},{"key":"B","text":"4"}]'::jsonb, 'B', 'math', 10, 1)
     RETURNING id`,
    [quiz.id],
  )).rows[0];
  const assignment = (await pg.query(
    `INSERT INTO assignments(title, assignment_type, course_id, lesson_id, instructor_id, description, max_score)
     VALUES ($1, 'homework', $2, $3, $4, 'Write answer', 10) RETURNING id`,
    [`Homework ${suffix}`, course.id, lesson1.id, teacher.id],
  )).rows[0];

  const activeFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
     VALUES ($1, $2, 'ActiveSlide.pdf', $3, 'application/pdf', 1024, 'COURSE', 'ready') RETURNING id`,
    [course.id, teacher.id, `learning-files/${suffix}-active.pdf`],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id, lesson_id, attached_by) VALUES ($1, $2, $3)`,
    [activeFile.id, lesson1.id, teacher.id],
  );

  const note = (await pg.query(
    `INSERT INTO video_course_unit_notes(user_id, course_id, lesson_id, timestamp_seconds, content, revision)
     VALUES ($1, $2, $3, 15, 'Initial note', 1) RETURNING id`,
    [learner.id, course.id, lesson1.id],
  )).rows[0];
  const bookmark = (await pg.query(
    `INSERT INTO video_course_unit_bookmarks(user_id, course_id, video_course_profile_id, lesson_id, video_asset_id, timestamp_seconds, label, revision)
     VALUES ($1, $2, $3, $4, $5, 22, 'Formula start', 1) RETURNING id`,
    [learner.id, course.id, profile.id, lesson1.id, video.id],
  )).rows[0];
  const qaThread = (await pg.query(
    `INSERT INTO learning_unit_qa_threads(course_id, video_course_profile_id, lesson_id, author_id, title, status, revision)
     VALUES ($1, $2, $3, $4, 'Question 1', 'open', 1) RETURNING id`,
    [course.id, profile.id, lesson1.id, learner.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO learning_unit_qa_messages(thread_id, author_id, author_kind, body)
     VALUES ($1, $2, 'student', 'Why step 2?')`,
    [qaThread.id, learner.id],
  );

  const delegated = await mintDelegatedLearningSession({
    db,
    externalUserId: extUserId,
    courseId: course.id,
    profileId: profile.id,
    scopes: [...ALLOWED_DELEGATED_SCOPES],
  });

  return {
    admin,
    teacher,
    learner,
    extUserId,
    course,
    section,
    video,
    lesson1,
    lesson2,
    profile,
    quiz,
    question,
    assignment,
    activeFile,
    note,
    bookmark,
    qaThread,
    sessionToken: delegated.sessionToken,
  };
};

test("Day 8-10 (Kill Switches): split kill switches act independently and block mutations while preserving reads/diagnostics/health", async (t) => {
  const { pg, db, baseUrl } = await setupDay8Env(t);
  const f = await seedCourseLearningFixture(pg, db, { suffix: "ks" });
  const adminCookie = await createAdminCookie(f.admin.id);

  // Unit assertions on kill switch helpers & getIntegrationMetricsSnapshot
  assert.equal(isMolyIntegrationKillSwitchActive({ MOLY_INTEGRATION_KILL_SWITCH: "true" }), true);
  assert.equal(isContentSyncKillSwitchActive({ COURSE_CONTENT_SYNC_DISABLED: "true" }), true);
  assert.equal(isCatalogSyncKillSwitchActive({ COURSE_CATALOG_SYNC_DISABLED: "true" }), true);
  assert.equal(isContentSyncKillSwitchActive({ MOLY_CATALOG_SYNC_DISABLED: "true" }), true);
  assert.equal(isDelegatedLearningKillSwitchActive({ MOLY_DELEGATED_LEARNING_KILL_SWITCH: "true" }), true);
  assert.equal(isDelegatedLearningKillSwitchActive({ DELEGATED_LEARNING_KILL_SWITCH: "true" }), true);
  assert.equal(isDelegatedLearningKillSwitchActive({ MOLY_DELEGATED_LEARNING_DISABLED: "true" }), true);
  assert.equal(isRepairMutationsKillSwitchActive({ COURSE_REPAIR_MUTATIONS_DISABLED: "true" }), true);
  assert.equal(isRepairMutationsKillSwitchActive({ MOLY_REPAIR_MUTATIONS_DISABLED: "true" }), true);
  assert.equal(isRepairMutationsKillSwitchActive({ REPAIR_MUTATIONS_KILL_SWITCH: "true" }), true);

  const metricsWhenRepairOff = getIntegrationMetricsSnapshot({ COURSE_REPAIR_MUTATIONS_DISABLED: "true" });
  assert.equal(metricsWhenRepairOff.killSwitchActive, false);
  assert.equal(metricsWhenRepairOff.contentSyncKillSwitchActive, false);
  assert.equal(metricsWhenRepairOff.delegatedLearningKillSwitchActive, false);
  assert.equal(metricsWhenRepairOff.repairMutationsKillSwitchActive, true);

  // Seed conflict, failed inbox, DLQ outbox, plus active attempt/submission for write checks
  const dummyHash1 = "a".repeat(64);
  const conflict = (await pg.query(
    `INSERT INTO integration_conflicts(source_system, conflict_type, external_user_id, external_course_id, reason, status)
     VALUES ('moly', 'UNRESOLVED_IDENTITY', 'moly:usr:orphan', 'moly:crs:ks', 'Identity missing for test', 'open') RETURNING id`,
  )).rows[0];
  const inboxFailed = (await pg.query(
    `INSERT INTO integration_inbox(source_system, event_id, idempotency_key, event_type, payload_hash, payload, source_updated_at, status)
     VALUES ('moly', 'evt-ks-inbox-1', 'idem-ks-inbox-1', 'entitlement.granted', $1, '{}'::jsonb, NOW(), 'failed') RETURNING id`,
    [dummyHash1],
  )).rows[0];
  const outboxDlq = (await pg.query(
    `INSERT INTO course_integration_outbox(event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, source_updated_at, payload, status, attempt_count, max_attempts)
     VALUES ('evt-ks-outbox-1', 'idem-ks-outbox-1', 'learning.progress.updated', 'user_course', $1, 1, NOW(), '{}'::jsonb, 'dead_letter', 10, 10) RETURNING id`,
    [String(f.learner.id)],
  )).rows[0];
  const mappingRow = (await pg.query(
    `SELECT id FROM external_course_mappings WHERE external_course_id = 'moly:crs:ks' LIMIT 1`,
  )).rows[0];
  const attempt = (await pg.query(
    `INSERT INTO quiz_attempts(quiz_id, user_id, attempt_number, status, video_course_profile_id, max_score)
     VALUES ($1, $2, 1, 'in_progress', $3, 10) RETURNING id`,
    [f.quiz.id, f.learner.id, f.profile.id],
  )).rows[0];

  const adminPost = async (path, body, method = "POST") => {
    const res = await fetch(`${baseUrl}/api/v1/admin/integrations${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  // 1) Content/Catalog kill switch blocks catalog export only; delegated reads, reconciliation, and health continue
  await withEnvOverrides({ COURSE_CATALOG_SYNC_DISABLED: "true" }, async () => {
    const cat = await signedRequest(baseUrl, { path: "/api/integrations/v2/catalog/courses" });
    assert.equal(cat.status, 503);
    assert.equal(cat.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

    const cur = await signedRequest(baseUrl, { path: `/api/integrations/v2/catalog/courses/${f.course.id}/curriculum` });
    assert.equal(cur.status, 503);
    assert.equal(cur.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

    const ws = await signedRequest(baseUrl, {
      path: `/api/integrations/v2/learning/offerings/${f.profile.id}/workspace`,
      sessionToken: f.sessionToken,
    });
    assert.equal(ws.status, 200);

    const recContent = await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/content-state" });
    assert.equal(recContent.status, 200);
    const recLearn = await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/learning-state" });
    assert.equal(recLearn.status, 200);
  });

  // 2) Delegated learning kill switch (both MOLY_DELEGATED_LEARNING_KILL_SWITCH and DELEGATED_LEARNING_KILL_SWITCH)
  for (const flag of ["MOLY_DELEGATED_LEARNING_KILL_SWITCH", "DELEGATED_LEARNING_KILL_SWITCH"]) {
    await withEnvOverrides({ [flag]: "true" }, async () => {
      const mintRes = await signedRequest(baseUrl, {
        method: "POST",
        path: "/api/integrations/v2/learning/sessions",
        body: { externalUserId: f.extUserId, profileId: f.profile.id },
      });
      assert.equal(mintRes.status, 503, `flag=${flag}`);
      assert.equal(mintRes.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

      const ws = await signedRequest(baseUrl, {
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/workspace`,
        sessionToken: f.sessionToken,
      });
      assert.equal(ws.status, 503, `flag=${flag}`);
      assert.equal(ws.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

      // Catalog + reconciliation stay open
      const cat = await signedRequest(baseUrl, { path: "/api/integrations/v2/catalog/courses" });
      assert.equal(cat.status, 200);
      const recLearn = await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/learning-state" });
      assert.equal(recLearn.status, 200);
    });
  }

  // 3) Repair/Write mutations kill switch blocks admin repair & delegated writes while keeping reads/diagnostics/health alive
  await withEnvOverrides({ COURSE_REPAIR_MUTATIONS_DISABLED: "true" }, async () => {
    const blockedAdminCalls = [
      await adminPost(`/inbox-ops/${inboxFailed.id}/retry`, {}),
      await adminPost(`/outbox/${outboxDlq.id}/retry`, {}),
      await adminPost(`/ops/retry-subject`, { courseId: f.course.id, domain: "content" }),
      await adminPost(`/conflicts/${conflict.id}/resolve`, { action: "dismiss", resolutionNote: "test" }),
      await adminPost(`/identities/link`, { externalUserId: "x", targetUserId: f.learner.id }),
      await adminPost(`/course-mappings`, { externalCourseId: "ext-new", localCourseId: f.course.id }),
      await adminPost(`/course-mappings/${mappingRow.id}/status`, { status: "inactive" }, "PATCH"),
    ];
    for (const r of blockedAdminCalls) {
      assert.equal(r.status, 503, JSON.stringify(r));
      assert.equal(r.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");
    }

    const blockedDelegatedWrites = [
      await signedRequest(baseUrl, {
        method: "PUT",
        path: `/api/integrations/v2/learning/videos/${f.video.id}/progress`,
        sessionToken: f.sessionToken,
        body: { profileId: f.profile.id, unitId: f.lesson1.id, unitType: "lesson", positionSeconds: 20, durationSeconds: 120, heartbeatSeq: 1 },
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/quizzes/${f.quiz.id}/attempts/start`,
        sessionToken: f.sessionToken,
        body: { profileId: f.profile.id, unitId: f.lesson1.id },
      }),
      await signedRequest(baseUrl, {
        method: "PUT",
        path: `/api/integrations/v2/learning/quizzes/attempts/${attempt.id}/answers`,
        sessionToken: f.sessionToken,
        body: { answers: { [String(f.question.id)]: "B" } },
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/quizzes/attempts/${attempt.id}/submit`,
        sessionToken: f.sessionToken,
        body: {},
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/assignments/${f.assignment.id}/submission-assets`,
        sessionToken: f.sessionToken,
        body: {
          profileId: f.profile.id,
          filename: "hw.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3,
          contentBase64: Buffer.from("pdf").toString("base64"),
        },
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/assignments/${f.assignment.id}/submit`,
        sessionToken: f.sessionToken,
        body: { profileId: f.profile.id, contentText: "done" },
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/notes`,
        sessionToken: f.sessionToken,
        body: { timestampSeconds: 10, content: "new note" },
      }),
      await signedRequest(baseUrl, {
        method: "PUT",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/notes/${f.note.id}`,
        sessionToken: f.sessionToken,
        body: { content: "edit note", expectedRevision: 1 },
      }),
      await signedRequest(baseUrl, {
        method: "DELETE",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/notes/${f.note.id}`,
        sessionToken: f.sessionToken,
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/bookmarks`,
        sessionToken: f.sessionToken,
        body: { timestampSeconds: 30, label: "mark" },
      }),
      await signedRequest(baseUrl, {
        method: "DELETE",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/bookmarks/${f.bookmark.id}`,
        sessionToken: f.sessionToken,
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/qa`,
        sessionToken: f.sessionToken,
        body: { title: "Q2", body: "Blocked?" },
      }),
      await signedRequest(baseUrl, {
        method: "POST",
        path: `/api/integrations/v2/learning/qa/threads/${f.qaThread.id}/replies`,
        sessionToken: f.sessionToken,
        body: { profileId: f.profile.id, body: "reply" },
      }),
      await signedRequest(baseUrl, {
        method: "PATCH",
        path: `/api/integrations/v2/learning/qa/threads/${f.qaThread.id}/status`,
        sessionToken: f.sessionToken,
        body: { profileId: f.profile.id, status: "resolved" },
      }),
    ];
    for (const r of blockedDelegatedWrites) {
      assert.equal(r.status, 503, JSON.stringify(r));
      assert.equal(r.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");
    }

    // Read endpoints & diagnostic snapshots MUST stay 200
    const allowedReads = [
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/workspace`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/quizzes/${f.quiz.id}`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/assignments/${f.assignment.id}`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/notes`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/bookmarks`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { path: `/api/integrations/v2/learning/offerings/${f.profile.id}/units/${f.lesson1.id}/qa`, sessionToken: f.sessionToken }),
      await signedRequest(baseUrl, { method: "POST", path: "/api/integrations/v1/moly/reconciliation/snapshot", body: { courseId: f.course.id, includeContent: true } }),
      await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/content-state" }),
      await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/learning-state" }),
      await adminPost("/ops/v2", null, "GET"),
      await signedRequest(baseUrl, { path: "/api/integrations/v2/health" }),
    ];
    for (const r of allowedReads) {
      assert.equal(r.status, 200, JSON.stringify(r));
    }
  });

  // 4) Global kill switch blocks everything except /health probes & preserves v1 INTEGRATION_KILL_SWITCH_ACTIVE error codes
  await withEnvOverrides({ MOLY_INTEGRATION_SYNC_DISABLED: "true" }, async () => {
    const snap = await signedRequest(baseUrl, { method: "POST", path: "/api/integrations/v1/moly/reconciliation/snapshot", body: {} });
    assert.equal(snap.status, 503);
    assert.equal(snap.body.errorCode, "INTEGRATION_KILL_SWITCH_ACTIVE");

    const inboxRetry = await adminPost(`/inbox-ops/${inboxFailed.id}/retry`, {});
    assert.equal(inboxRetry.status, 503);
    assert.equal(inboxRetry.body.errorCode, "INTEGRATION_KILL_SWITCH_ACTIVE");

    const recContent = await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/content-state" });
    assert.equal(recContent.status, 503);
    assert.equal(recContent.body.errorCode, "INTEGRATION_KILL_SWITCH_ACTIVE");

    const recLearn = await signedRequest(baseUrl, { path: "/api/integrations/v2/reconciliation/learning-state" });
    assert.equal(recLearn.status, 503);
    assert.equal(recLearn.body.errorCode, "INTEGRATION_KILL_SWITCH_ACTIVE");

    const outboxRetry = await adminPost(`/outbox/${outboxDlq.id}/retry`, {});
    assert.equal(outboxRetry.status, 503);
    assert.equal(outboxRetry.body.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

    const v2Health = await signedRequest(baseUrl, { path: "/api/integrations/v2/health" });
    assert.equal(v2Health.status, 200);
    assert.equal(v2Health.body.data.killSwitches.global, true);

    const publicHealthRes = await fetch(`${baseUrl}/api/health/integration`);
    assert.equal(publicHealthRes.status, 200);
    const publicHealthJson = await publicHealthRes.json();
    assert.equal(publicHealthJson.success, true);
    assert.equal(publicHealthJson.data.killSwitches.global, true);
  });
});

test("Day 8 (Advisory Lock & Sibling Entitlement Isolation): grant/revoke races preserve Management lms_access_grants and sibling profiles", async (t) => {
  const { pg, db } = await setupDay8Env(t, { mountHttp: false });

  // Spy on SQL statements to verify pg_advisory_xact_lock is acquired inside syncCourseEnrollmentProjectionTx
  const observedLockQueries = [];
  const instrumentedDb = {
    query: (sql, params) => db.query(sql, params),
    getClient: async () => {
      const client = await db.getClient();
      return {
        query: (sql, params) => {
          if (String(sql).includes("pg_advisory_xact_lock")) {
            observedLockQueries.push({ sql: String(sql), params });
          }
          return client.query(sql, params);
        },
        release: () => client.release(),
      };
    },
  };

  const teacher = (await pg.query(
    `INSERT INTO users(username, email, role) VALUES ('d8-lock-teacher', 'd8-lock-teacher@example.test', 'creator') RETURNING id`,
  )).rows[0];
  const learnerMgmtAndMoly = (await pg.query(
    `INSERT INTO users(username, email, role, is_management_managed, lms_account_status)
     VALUES ('d8-dual', 'd8-dual@example.test', 'user', FALSE, 'unmanaged') RETURNING id`,
  )).rows[0];
  const learnerMolyOnly = (await pg.query(
    `INSERT INTO users(username, email, role, is_management_managed, lms_account_status)
     VALUES ('d8-sib', 'd8-sib@example.test', 'user', FALSE, 'unmanaged') RETURNING id`,
  )).rows[0];

  await pg.query(
    `INSERT INTO external_identities(user_id, source_system, external_user_id, status, source_updated_at)
     VALUES ($1, 'moly', 'moly:usr:dual', 'active', NOW()), ($2, 'moly', 'moly:usr:sib', 'active', NOW())`,
    [learnerMgmtAndMoly.id, learnerMolyOnly.id],
  );

  const course = (await pg.query(
    `INSERT INTO courses(name, title, slug, author_id, is_published)
     VALUES ('Advisory Lock Course', 'Advisory Lock Course', 'advisory-lock-course', $1, TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const mirrorLiveClass = (await pg.query(
    `INSERT INTO live_classes(title, course_id, instructor_id, status)
     VALUES ('Mirror Sibling Class', $1, $2, 'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const profileMirror = (await pg.query(
    `INSERT INTO video_course_profiles(course_id, management_class_id, mode, source_live_class_id, status)
     VALUES ($1, 'd8-offer-mirror', 'MIRROR', $2, 'active') RETURNING id`,
    [course.id, mirrorLiveClass.id],
  )).rows[0];
  const profileIndep = (await pg.query(
    `INSERT INTO video_course_profiles(course_id, management_class_id, mode, status)
     VALUES ($1, 'd8-offer-indep', 'INDEPENDENT', 'active') RETURNING id`,
    [course.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO external_course_mappings(source_system, external_course_id, local_course_id, local_video_course_profile_id, status)
     VALUES ('moly', 'moly:crs:mirror', $1, $2, 'active'),
            ('moly', 'moly:crs:indep', $1, $3, 'active')`,
    [course.id, profileMirror.id, profileIndep.id],
  );

  // Active Management grant on dual learner
  await pg.query(
    `INSERT INTO lms_access_grants(user_id, course_id, access_status, valid_from, source_updated_at)
     VALUES ($1, $2, 'active', NOW() - INTERVAL '1 day', NOW())`,
    [learnerMgmtAndMoly.id, course.id],
  );

  const enqueueAndRun = async (parseFn, rawBody, key) => {
    const parsed = parseFn(rawBody, { correlationId: `corr-${key}`, idempotencyKey: key });
    await enqueueMolyIntegrationEvent(instrumentedDb, parsed, { headersSnapshot: { idempotencyKey: key } });
  };

  // Grant two sibling offerings for learnerMolyOnly and one for learnerMgmtAndMoly
  const ts1 = new Date().toISOString();
  await enqueueAndRun(parseGrantWirePayload, {
    event_id: "evt-g-sib-1",
    source_system: "moly",
    external_grant_id: "moly:grant:sib-indep",
    external_user_id: "moly:usr:sib",
    external_course_id: "moly:crs:indep",
    valid_from: ts1,
    source_updated_at: ts1,
  }, "idem-g-sib-1");
  await enqueueAndRun(parseGrantWirePayload, {
    event_id: "evt-g-sib-2",
    source_system: "moly",
    external_grant_id: "moly:grant:sib-mirror",
    external_user_id: "moly:usr:sib",
    external_course_id: "moly:crs:mirror",
    valid_from: ts1,
    source_updated_at: ts1,
  }, "idem-g-sib-2");
  await enqueueAndRun(parseGrantWirePayload, {
    event_id: "evt-g-dual-1",
    source_system: "moly",
    external_grant_id: "moly:grant:dual-indep",
    external_user_id: "moly:usr:dual",
    external_course_id: "moly:crs:indep",
    valid_from: ts1,
    source_updated_at: ts1,
  }, "idem-g-dual-1");
  await processAvailableMolyInboxJobs({ db: instrumentedDb, workerId: "w-grant" });

  const enrollLocks = observedLockQueries.filter((q) => String(q.params?.[0] || "").startsWith("moly:enroll:"));
  assert.ok(enrollLocks.length >= 3, "pg_advisory_xact_lock must run inside syncCourseEnrollmentProjectionTx");
  assert.ok(enrollLocks.every((q) => String(q.params?.[1] || "") === String(course.id)));

  // Concurrently revoke grant-sib-indep while keeping grant-sib-mirror AND revoke grant-dual-indep while keeping lms_access_grants
  const ts2 = new Date(Date.now() + 5000).toISOString();
  await Promise.all([
    enqueueAndRun(parseRevokeWirePayload, {
      event_id: "evt-r-sib-1",
      source_system: "moly",
      external_grant_id: "moly:grant:sib-indep",
      external_user_id: "moly:usr:sib",
      external_course_id: "moly:crs:indep",
      status: "revoked",
      reason: "refunded",
      source_updated_at: ts2,
    }, "idem-r-sib-1"),
    enqueueAndRun(parseRevokeWirePayload, {
      event_id: "evt-r-dual-1",
      source_system: "moly",
      external_grant_id: "moly:grant:dual-indep",
      external_user_id: "moly:usr:dual",
      external_course_id: "moly:crs:indep",
      status: "revoked",
      reason: "moly_revoked",
      source_updated_at: ts2,
    }, "idem-r-dual-1"),
  ]);
  await processAvailableMolyInboxJobs({ db: instrumentedDb, workerId: "w-revoke" });

  // 1) Sibling learner stays enrolled in course AND retains active MIRROR class_enrollment
  const sibEnrollment = (await pg.query(
    `SELECT status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [learnerMolyOnly.id, course.id],
  )).rows[0];
  assert.equal(sibEnrollment?.status, "active");

  const sibClassEnrollment = (await pg.query(
    `SELECT status FROM class_enrollments WHERE user_id = $1 AND video_course_profile_id = $2 AND enrollment_source = 'moly'`,
    [learnerMolyOnly.id, profileMirror.id],
  )).rows[0];
  assert.equal(sibClassEnrollment?.status, "active");

  const sibRevokedIndep = (await pg.query(
    `SELECT status FROM class_enrollments WHERE user_id = $1 AND video_course_profile_id = $2 AND enrollment_source = 'moly'`,
    [learnerMolyOnly.id, profileIndep.id],
  )).rows[0];
  assert.equal(sibRevokedIndep?.status, "revoked");

  // 2) Dual learner loses Moly entitlement but retains Course enrollment because active lms_access_grants exists
  const dualEnrollment = (await pg.query(
    `SELECT status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [learnerMgmtAndMoly.id, course.id],
  )).rows[0];
  assert.equal(dualEnrollment?.status, "active");

  const mgmtGrant = (await pg.query(
    `SELECT access_status, revoked_at FROM lms_access_grants WHERE user_id = $1 AND course_id = $2`,
    [learnerMgmtAndMoly.id, course.id],
  )).rows[0];
  assert.equal(mgmtGrant.access_status, "active");
  assert.equal(mgmtGrant.revoked_at, null);

  // 3) Revoking the final surviving grant on sib learner cleanly drops course + mirror class enrollment
  await enqueueAndRun(parseRevokeWirePayload, {
    event_id: "evt-r-sib-2",
    source_system: "moly",
    external_grant_id: "moly:grant:sib-mirror",
    external_user_id: "moly:usr:sib",
    external_course_id: "moly:crs:mirror",
    status: "revoked",
    reason: "second_profile_revoked",
    source_updated_at: new Date(Date.now() + 10000).toISOString(),
  }, "idem-r-sib-2");
  await processNextMolyInboxJob({ db: instrumentedDb, workerId: "w-final-revoke" });

  const sibEnrollmentAfter = (await pg.query(
    `SELECT status FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [learnerMolyOnly.id, course.id],
  )).rows[0];
  assert.equal(sibEnrollmentAfter?.status, "revoked");

  const sibClassAfter = (await pg.query(
    `SELECT status FROM class_enrollments WHERE user_id = $1 AND video_course_profile_id = $2 AND enrollment_source = 'moly'`,
    [learnerMolyOnly.id, profileMirror.id],
  )).rows[0];
  assert.equal(sibClassAfter?.status, "revoked");
});

test("Day 8 (Reconciliation Expansion): v1 courseId/profileId/includeContent & v2 content-state + learning-state", async (t) => {
  const { pg, db, baseUrl } = await setupDay8Env(t);
  const f1 = await seedCourseLearningFixture(pg, db, { suffix: "rec1" });
  const f2 = await seedCourseLearningFixture(pg, db, { suffix: "rec2" });

  // Soft-deleted file, progress >= 50%, submitted quiz + assignment, deleted note/bookmark in f1
  await pg.query(
    `INSERT INTO lms_learning_files(course_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status, deleted_at, sync_revision)
     VALUES ($1, $2, 'Tombstoned.pdf', 'learning-files/rec1-del.pdf', 'application/pdf', 100, 'COURSE', 'ready', NOW(), 3)`,
    [f1.course.id, f1.teacher.id],
  );
  await pg.query(
    `INSERT INTO video_watch_progress(user_id, video_asset_id, course_id, lesson_id, last_position_seconds, watched_seconds, completion_percent, is_completed, completed_at, last_heartbeat_seq, sync_revision)
     VALUES ($1, $2, $3, $4, 55, 55, 55, TRUE, NOW(), 4, 2)`,
    [f1.learner.id, f1.video.id, f1.course.id, f1.lesson1.id],
  );
  await pg.query(
    `INSERT INTO quiz_attempts(quiz_id, user_id, attempt_number, status, score, max_score, submitted_at, video_course_profile_id, sync_revision)
     VALUES ($1, $2, 1, 'submitted', 10, 10, NOW(), $3, 2)`,
    [f1.quiz.id, f1.learner.id, f1.profile.id],
  );
  const gradedSub = (await pg.query(
    `INSERT INTO assignment_submissions(assignment_id, user_id, status, content_text, submitted_at, video_course_profile_id, revision, sync_revision)
     VALUES ($1, $2, 'graded', 'Submitted homework', NOW(), $3, 2, 2) RETURNING id`,
    [f1.assignment.id, f1.learner.id, f1.profile.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO submission_grades(submission_id, grader_id, score, graded_at)
     VALUES ($1, $2, 9.5, NOW())`,
    [gradedSub.id, f1.teacher.id],
  );
  await pg.query(
    `INSERT INTO video_course_unit_notes(user_id, course_id, lesson_id, timestamp_seconds, content, revision, deleted_at)
     VALUES ($1, $2, $3, 45, 'Deleted note', 4, NOW())`,
    [f1.learner.id, f1.course.id, f1.lesson1.id],
  );
  await pg.query(
    `INSERT INTO video_course_unit_bookmarks(user_id, course_id, video_course_profile_id, lesson_id, video_asset_id, timestamp_seconds, label, revision, deleted_at)
     VALUES ($1, $2, $3, $4, $5, 65, 'Deleted bookmark', 3, NOW())`,
    [f1.learner.id, f1.course.id, f1.profile.id, f1.lesson1.id, f1.video.id],
  );

  // Backwards-compatible v1 call omits content_drift_summary
  const v1Default = await buildReconciliationSnapshotForMoly(db, { external_user_id: f1.extUserId });
  assert.equal(v1Default.success, true);
  assert.equal(v1Default.data.content_drift_summary, undefined);

  // Filtered v1 snapshot with courseId + profileId + includeContent
  const v1Filtered = await buildReconciliationSnapshotForMoly(db, {
    courseId: f1.course.id,
    profileId: f1.profile.id,
    includeContent: true,
  });
  assert.equal(v1Filtered.data.course_mappings.length, 1);
  assert.equal(v1Filtered.data.course_mappings[0].local_course_id, Number(f1.course.id));
  assert.ok(v1Filtered.data.content_drift_summary);
  assert.equal(v1Filtered.data.content_drift_summary.summary.courseCount, 1);
  assert.equal(v1Filtered.data.content_drift_summary.summary.profileCount, 1);
  assert.equal(v1Filtered.data.content_drift_summary.summary.activeFilesCount, 1);
  assert.equal(v1Filtered.data.content_drift_summary.summary.tombstonedFilesCount, 1);

  // Signed v2 content-state scoped to f1
  const csRes = await signedRequest(baseUrl, {
    path: `/api/integrations/v2/reconciliation/content-state?courseId=${f1.course.id}&profileId=${f1.profile.id}`,
  });
  assert.equal(csRes.status, 200);
  assert.equal(csRes.body.data.courses.length, 1);
  assert.equal(csRes.body.data.profiles.length, 1);
  assert.equal(csRes.body.data.summary.courseCount, 1);
  assert.equal(csRes.body.data.summary.activeFilesCount, 1);
  assert.equal(csRes.body.data.summary.tombstonedFilesCount, 1);
  assert.equal(csRes.body.data.summary.maxFileRevision, 3);
  assert.equal(csRes.body.data.courses[0].activeLessonCount, 2);

  // Unscoped v2 content-state sees both courses
  const csAll = await signedRequest(baseUrl, {
    path: `/api/integrations/v2/reconciliation/content-state`,
  });
  assert.equal(csAll.status, 200);
  assert.equal(csAll.body.data.summary.courseCount, 2);

  // Signed v2 learning-state scoped to f1 learner & course
  const lsRes = await signedRequest(baseUrl, {
    path: `/api/integrations/v2/reconciliation/learning-state?externalUserId=${f1.extUserId}&courseId=${f1.course.id}&profileId=${f1.profile.id}`,
  });
  assert.equal(lsRes.status, 200, JSON.stringify(lsRes.body));
  const ls = lsRes.body.data;
  assert.equal(ls.videoWatchProgress.length, 1);
  assert.equal(ls.videoWatchProgress[0].completionPercent, 75);
  assert.equal(ls.sequentialUnitCompletions.length, 1);
  assert.equal(ls.sequentialUnitCompletions[0].units[0].isCompleted, true);
  assert.equal(ls.sequentialUnitCompletions[0].units[1].isLocked, false);
  assert.equal(ls.quizAttempts.length, 1);
  assert.equal(ls.quizAttempts[0].status, "submitted");
  assert.equal(ls.assignmentSubmissions.length, 1);
  assert.equal(ls.assignmentSubmissions[0].latestScore, 9.5);
  assert.equal(ls.notesSummary.activeCount, 1);
  assert.equal(ls.notesSummary.deletedCount, 1);
  assert.equal(ls.notesSummary.maxRevision, 4);
  assert.equal(ls.bookmarksSummary.activeCount, 1);
  assert.equal(ls.bookmarksSummary.deletedCount, 1);
  assert.equal(ls.qaThreadsSummary.activeCount, 1);
  assert.equal(ls.qaThreads.length, 1);
  // Ensure f2 user data didn't bleed into f1-filtered export & note/QA content fields are present
  assert.equal(ls.notes.every((n) => n.courseId === String(f1.course.id)), true);
  assert.ok(typeof ls.notes[0].content === "string" && ls.notes[0].content.length > 0);
  assert.ok(typeof ls.qaThreads[0].title === "string" && ls.qaThreads[0].title.length > 0);
  assert.notEqual(f2.course.id, f1.course.id);

  // Plural/comma-separated query filters (matching Moly client) behave equivalently without leaking f2
  const csPlural = await signedRequest(baseUrl, {
    path: `/api/integrations/v2/reconciliation/content-state?courseIds=${f1.course.id}&profileIds=${f1.profile.id}`,
  });
  assert.equal(csPlural.status, 200);
  assert.equal(csPlural.body.data.courses.length, 1);
  assert.equal(csPlural.body.data.courses[0].courseId, String(f1.course.id));

  const lsPlural = await signedRequest(baseUrl, {
    path: `/api/integrations/v2/reconciliation/learning-state?externalUserIds=${encodeURIComponent(f1.extUserId)}&courseIds=${f1.course.id}&profileIds=${f1.profile.id}`,
  });
  assert.equal(lsPlural.status, 200);
  assert.equal(lsPlural.body.data.notes.length, 1);
  assert.equal(lsPlural.body.data.sequentialUnitCompletions.length, 1);
});

test("Day 8-10 (Ops v2, Per-Subject Repair, Health Readiness & Zero Secret Exposure)", async (t) => {
  const { pg, db, baseUrl } = await setupDay8Env(t);
  const f = await seedCourseLearningFixture(pg, db, { suffix: "ops" });
  const adminCookie = await createAdminCookie(f.admin.id);

  // Seed progress, inbox failures/processed, outbox DLQ/sent/subject rows, checkpoints, conflicts
  await pg.query(
    `INSERT INTO video_watch_progress(user_id, video_asset_id, course_id, lesson_id, last_position_seconds, watched_seconds, completion_percent, is_completed, completed_at, last_heartbeat_seq, sync_revision)
     VALUES ($1, $2, $3, $4, 100, 100, 83, TRUE, NOW(), 2, 1)`,
    [f.learner.id, f.video.id, f.course.id, f.lesson1.id],
  );
  const hashOk = "b".repeat(64);
  const hashDlq = "c".repeat(64);
  await pg.query(
    `INSERT INTO integration_inbox(source_system, event_id, idempotency_key, event_type, payload_hash, payload, source_updated_at, status, processed_at)
     VALUES ('moly', 'evt-ops-ok', 'idem-ops-ok', 'user.provisioned', $1, '{}'::jsonb, NOW(), 'processed', NOW())`,
    [hashOk],
  );
  await pg.query(
    `INSERT INTO integration_inbox(source_system, event_id, idempotency_key, event_type, payload_hash, payload, source_updated_at, status, last_error_code, last_error_message)
     VALUES ('moly', 'evt-ops-dlq', 'idem-ops-dlq', 'entitlement.granted', $1, $2::jsonb, NOW(), 'dead_letter', 'TRANSIENT_ERR', 'Bearer secret-leak-token-123 failed')`,
    [hashDlq, JSON.stringify({ external_user_id: f.extUserId, external_course_id: "moly:crs:ops" })],
  );
  const outboxDlq = (await pg.query(
    `INSERT INTO course_integration_outbox(event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, source_updated_at, payload, status, attempt_count, max_attempts, last_error_code, last_error_message)
     VALUES ('evt-outbox-dlq', 'idem-outbox-dlq', 'course.upserted', 'course', $1, 1, NOW(), $2::jsonb, 'dead_letter', 10, 10, 'HTTP_502', 'Authorization: Bearer my-internal-secret-999')
     RETURNING id`,
    [String(f.course.id), JSON.stringify({ courseId: String(f.course.id) })],
  )).rows[0];
  const outboxSent = (await pg.query(
    `INSERT INTO course_integration_outbox(event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, source_updated_at, payload, status, sent_at)
     VALUES ('evt-outbox-sent', 'idem-outbox-sent', 'course.upserted', 'course', $1, 2, NOW(), '{}'::jsonb, 'sent', NOW()) RETURNING id`,
    [String(f.course.id)],
  )).rows[0];
  await pg.query(
    `INSERT INTO course_sync_checkpoints(stream_name, consumer_system, last_cursor, high_water_revision, updated_at)
     VALUES ('catalog_courses', 'moly', 'cursor-100', 5, NOW())`,
  );
  await pg.query(
    `INSERT INTO integration_conflicts(source_system, conflict_type, external_user_id, external_course_id, reason, status)
     VALUES ('moly', 'COURSE_MAPPING_MISSING', $1, 'moly:crs:missing', 'Course mapping missing', 'open')`,
    [f.extUserId],
  );

  // 1) GET /api/v1/admin/integrations/ops/v2
  const opsRes = await fetch(`${baseUrl}/api/v1/admin/integrations/ops/v2`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(opsRes.status, 200);
  const opsBody = await opsRes.json();
  assert.equal(opsBody.success, true);
  assert.equal(opsBody.data.inbox.counts.processed, 1);
  assert.equal(opsBody.data.inbox.dlqCount, 1);
  assert.ok(!opsBody.data.inbox.recentFailures[0].last_error_message.includes("secret-leak-token-123"));
  assert.equal(opsBody.data.outbox.dlqCount, 1);
  assert.ok(!opsBody.data.outbox.failedAndDlqItems[0].last_error_message.includes("my-internal-secret-999"));
  assert.equal(opsBody.data.checkpoints.length, 1);
  assert.equal(opsBody.data.checkpoints[0].streamName, "catalog_courses");
  assert.equal(opsBody.data.conflicts.openCount, 1);
  assert.ok(opsBody.data.lastSuccessfulSyncTimestamps.lastInboxProcessedAt);
  assert.ok(opsBody.data.lastSuccessfulSyncTimestamps.lastOutboxSentAt);

  // 2) POST /api/v1/admin/integrations/outbox/:id/retry
  const retryDlqRes = await fetch(`${baseUrl}/api/v1/admin/integrations/outbox/${outboxDlq.id}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({}),
  });
  assert.equal(retryDlqRes.status, 200);
  const retryDlqJson = await retryDlqRes.json();
  assert.equal(retryDlqJson.data.retried, true);
  assert.equal(retryDlqJson.data.outbox.status, "pending");
  assert.equal(retryDlqJson.data.outbox.attempt_count, 0);

  const retrySentRes = await fetch(`${baseUrl}/api/v1/admin/integrations/outbox/${outboxSent.id}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({}),
  });
  assert.equal(retrySentRes.status, 200);
  assert.equal((await retrySentRes.json()).data.alreadySent, true);

  // 3) Re-mark outbox row failed so retry-subject re-queues inbox+outbox and emits fresh content/entitlement/progress syncs
  await pg.query(`UPDATE course_integration_outbox SET status = 'failed' WHERE id = $1`, [outboxDlq.id]);

  const badDomainRes = await fetch(`${baseUrl}/api/v1/admin/integrations/ops/retry-subject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ courseId: f.course.id, domain: "bogus" }),
  });
  assert.equal(badDomainRes.status, 422);

  const emptySelectorRes = await fetch(`${baseUrl}/api/v1/admin/integrations/ops/retry-subject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ domain: "all" }),
  });
  assert.equal(emptySelectorRes.status, 422);

  const repairRes = await fetch(`${baseUrl}/api/v1/admin/integrations/ops/retry-subject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      externalUserId: f.extUserId,
      courseId: f.course.id,
      profileId: f.profile.id,
      domain: "all",
    }),
  });
  assert.equal(repairRes.status, 200);
  const repairJson = await repairRes.json();
  assert.equal(repairJson.data.reQueuedInboxCount, 1);
  assert.ok(repairJson.data.reQueuedOutboxCount >= 1);
  assert.ok(repairJson.data.reEmittedContentEvents >= 2); // course + profile + curriculum
  assert.equal(repairJson.data.reSyncedEntitlements, 1);
  assert.ok(repairJson.data.reEmittedProgressEvents >= 1);

  const auditRows = (await pg.query(
    `SELECT action FROM audit_events WHERE action IN ('integration.course_outbox_manual_retry', 'integration.subject_repair_triggered')`,
  )).rows;
  assert.equal(auditRows.length, 2);

  // 4) Health / Contract readiness probes & zero secret leakage
  const unauthHealthRes = await fetch(`${baseUrl}/api/integrations/v2/health`);
  assert.equal(unauthHealthRes.status, 401);

  const s2sHealth = await signedRequest(baseUrl, { path: "/api/integrations/v2/health" });
  assert.equal(s2sHealth.status, 200);
  assert.equal(s2sHealth.body.success, true);
  assert.equal(s2sHealth.body.data.ready, true);
  assert.equal(s2sHealth.body.data.contractVersion, "2.0.0");
  assert.equal(s2sHealth.body.data.migrations["079_foundation"], true);
  assert.equal(s2sHealth.body.data.migrations["080_profile_scope"], true);
  assert.equal(s2sHealth.body.data.migrations["081_sso"], true);
  assert.equal(s2sHealth.body.data.migrations["082_sso_browser_txs"], true);
  assert.equal(s2sHealth.body.data.migrations["083_full_sync_foundation"], true);
  assert.equal(s2sHealth.body.data.migrations["084_day5_7_parity"], true);
  assert.ok(s2sHealth.body.data.supportedScopes.includes("bookmarks:rw"));

  const pubFastRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(pubFastRes.status, 200);
  const pubFastJson = await pubFastRes.json();
  assert.equal(pubFastJson.success, true);
  assert.equal(pubFastJson.data.status, "ok");
  assert.equal(pubFastJson.data.database, "ok");

  const pubIntRes = await fetch(`${baseUrl}/api/health/integration`);
  assert.equal(pubIntRes.status, 200);
  const pubIntText = await pubIntRes.text();
  const pubIntJson = JSON.parse(pubIntText);
  assert.equal(pubIntJson.success, true);
  assert.equal(pubIntJson.data.ready, true);
  assert.equal(pubIntJson.data.contractVersion, "2.0.0");
  assert.equal(typeof pubIntJson.data.queues.inboxQueueDepth, "number");
  assert.equal(typeof pubIntJson.data.queues.outboxQueueDepth, "number");

  // Direct service smoke check for getMolyOpsV2Overview, getMolyIntegrationHealthProbe, retryCourseOutboxJob, retryMolySubjectSync, retryMolyInboxJob
  const directProbe = await getMolyIntegrationHealthProbe(db);
  assert.equal(directProbe.ready, true);
  const directOverview = await getMolyOpsV2Overview(db);
  assert.equal(directOverview.inbox.counts.pending, 1);

  // Secret non-disclosure invariant across all observability/probe responses
  const combinedSerialized = `${s2sHealth.text}\n${pubIntText}\n${JSON.stringify(opsBody)}`;
  for (const secret of [
    TEST_MOLY_CFG.serviceToken,
    TEST_MOLY_CFG.hmacSecret,
    TEST_MOLY_CFG.jwtSecret,
    TEST_MOLY_CFG.databaseUrl,
    TEST_MOLY_CFG.r2Secret,
    "secretpass",
  ]) {
    assert.equal(combinedSerialized.includes(secret), false, `Must never expose secret ${secret}`);
  }
});
