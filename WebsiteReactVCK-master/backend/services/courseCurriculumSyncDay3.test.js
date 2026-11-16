import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import {
  computeMolyGetSignature,
  computeMolySignature,
  createRequireMolyIntegration,
} from "../middleware/requireMolyIntegration.js";
import { createMolyIntegrationV2Router } from "../router/molyIntegrationV2.router.js";
import {
  exportCourseCurriculum,
  recordCurriculumMutation,
  recordUnitContentMutation,
  resolveBeforeDeleteUnitSnapshot,
  sanitizeTheoryHtml,
} from "./courseCurriculumSync.service.js";
import {
  getDelegatedUnitDetail,
  getDelegatedWorkspace,
  mintDelegatedLearningSession,
} from "./delegatedLearning.service.js";

const TEST_MOLY_CFG = {
  serviceToken: "course-day3-bearer-secret",
  integrationKey: "moly-studio-v2",
  hmacSecret: "course-day3-hmac-secret",
};

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const makeDbAdapter = (pg) => ({
  query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
  getClient: async () => ({
    query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
    release: () => {},
  }),
});

const startServer = (app) =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });

const stopServer = (server) =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const signedGetHeaders = (originalUrl, extraHeaders = {}) => {
  const timestamp = new Date().toISOString();
  return {
    Authorization: `Bearer ${TEST_MOLY_CFG.serviceToken}`,
    "X-Integration-Key": TEST_MOLY_CFG.integrationKey,
    "X-Correlation-ID": `corr-day3-${crypto.randomUUID()}`,
    "X-Event-Timestamp": timestamp,
    "X-Signature": computeMolyGetSignature({
      timestamp,
      method: "GET",
      originalUrl,
      secret: TEST_MOLY_CFG.hmacSecret,
    }),
    ...extraHeaders,
  };
};

const signedPostHeaders = (rawBody, idempotencyKey = `idem-${crypto.randomUUID()}`) => {
  const timestamp = new Date().toISOString();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TEST_MOLY_CFG.serviceToken}`,
    "X-Integration-Key": TEST_MOLY_CFG.integrationKey,
    "X-Correlation-ID": `corr-day3-${crypto.randomUUID()}`,
    "Idempotency-Key": idempotencyKey,
    "X-Event-Timestamp": timestamp,
    "X-Signature": computeMolySignature({
      timestamp,
      rawBody,
      secret: TEST_MOLY_CFG.hmacSecret,
    }),
  };
};

async function seedCourseFixture(pg) {
  const teacher = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role, management_display_name)
       VALUES ('teacher_d3', 'teacher_d3@csca.local', 'hash', 'admin', 'Thay Giao Day 3')
       RETURNING id`,
    )
  ).rows[0];

  const learner = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role, lms_account_status)
       VALUES ('learner_d3', 'learner_d3@csca.local', 'hash', 'user', 'active')
       RETURNING id`,
    )
  ).rows[0];

  await pg.query(
    `INSERT INTO external_identities (user_id, source_system, external_user_id, status, source_updated_at)
     VALUES ($1, 'moly', 'moly-user-301', 'active', NOW())`,
    [learner.id],
  );

  const course = (
    await pg.query(
      `INSERT INTO courses (name, title, slug, description, category, level, author_id, is_published, price)
       VALUES ('CSCA Toan Day 3', 'CSCA Toan Day 3', 'csca-toan-day-3', 'Day 3 test course', 'CSCA', 'intermediate', $1, TRUE, 599000)
       RETURNING id, slug`,
      [teacher.id],
    )
  ).rows[0];

  const otherCourse = (
    await pg.query(
      `INSERT INTO courses (name, title, slug, description, category, level, author_id, is_published, price)
       VALUES ('CSCA Ly Other', 'CSCA Ly Other', 'csca-ly-other', 'Other course', 'CSCA', 'beginner', $1, TRUE, 299000)
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  const liveClass = (
    await pg.query(
      `INSERT INTO live_classes (course_id, instructor_id, title, status)
       VALUES ($1, $2, 'Lop Toan Live Mirror', 'active')
       RETURNING id`,
      [course.id, teacher.id],
    )
  ).rows[0];

  const chapter = (
    await pg.query(
      `INSERT INTO class_chapters (live_class_id, title, position, created_by, updated_by)
       VALUES ($1, 'Chuong 1 Live Mirror', 1, $2, $2)
       RETURNING id`,
      [liveClass.id, teacher.id],
    )
  ).rows[0];

  const session1 = (
    await pg.query(
      `INSERT INTO class_sessions (live_class_id, chapter_id, title, start_time, end_time, status, is_public_preview)
       VALUES ($1, $2, 'Buoi 1 Preview', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '2 hours', 'completed', TRUE)
       RETURNING id`,
      [liveClass.id, chapter.id],
    )
  ).rows[0];

  const session2 = (
    await pg.query(
      `INSERT INTO class_sessions (live_class_id, chapter_id, title, start_time, end_time, status, is_public_preview)
       VALUES ($1, $2, 'Buoi 2 Khoa Tuan Tu', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 hours', 'completed', FALSE)
       RETURNING id`,
      [liveClass.id, chapter.id],
    )
  ).rows[0];

  const mirrorProfile = (
    await pg.query(
      `INSERT INTO video_course_profiles (
         course_id, mode, source_live_class_id, management_class_id,
         device_limit, enforce_trusted_devices, allow_file_download, status
       )
       VALUES ($1, 'MIRROR', $2, 'MOLI-CLS-D3-M', 2, TRUE, TRUE, 'active')
       RETURNING id`,
      [course.id, liveClass.id],
    )
  ).rows[0];

  const indProfile = (
    await pg.query(
      `INSERT INTO video_course_profiles (
         course_id, mode, management_class_id,
         device_limit, enforce_trusted_devices, allow_file_download, status
       )
       VALUES ($1, 'INDEPENDENT', 'MOLI-CLS-D3-I', 3, FALSE, FALSE, 'active')
       RETURNING id`,
      [course.id],
    )
  ).rows[0];

  const indSection = (
    await pg.query(
      `INSERT INTO sections (course_id, title, sort_order)
       VALUES ($1, 'Chuong 1 Independent', 1)
       RETURNING id`,
      [course.id],
    )
  ).rows[0];

  const lesson1 = (
    await pg.query(
      `INSERT INTO lessons (course_id, section_id, name, title, description, duration_seconds, sort_order, is_published, is_public_preview, is_preview, learning_url)
       VALUES ($1, $2, 'Bai 1 Independent', 'Bai 1 Independent', 'Mo ta bai 1', 1200, 1, TRUE, TRUE, TRUE, 'https://course.local/l1')
       RETURNING id`,
      [course.id, indSection.id],
    )
  ).rows[0];

  const lesson2 = (
    await pg.query(
      `INSERT INTO lessons (course_id, section_id, name, title, description, duration_seconds, sort_order, is_published, is_public_preview, is_preview, learning_url)
       VALUES ($1, $2, 'Bai 2 Independent Locked', 'Bai 2 Independent Locked', 'Mo ta bai 2', 1500, 2, TRUE, FALSE, FALSE, 'https://course.local/l2')
       RETURNING id`,
      [course.id, indSection.id],
    )
  ).rows[0];

  // Attach Bunny video parts, theory, vocabulary, formula, file, quiz, assignment to session1 & session2
  const asset1 = (
    await pg.query(
      `INSERT INTO video_assets (
         title, provider, provider_library_id, provider_video_id, playback_status,
         duration_seconds, thumbnail_url, uploaded_by, published_at
       )
       VALUES ('Video Phan 1', 'bunny_stream', 'lib-1', 'vid-s1-p1', 'ready', 600, 'https://cdn.example/v1.jpg', $1, NOW())
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  await pg.query(
    `INSERT INTO class_session_videos (class_session_id, video_asset_id, title, video_type, sort_order, is_published, published_at)
     VALUES ($1, $2, 'Phan 1: Khai niem', 'primary', 0, TRUE, NOW()),
            ($3, $2, 'Phan 1 Buoi 2', 'primary', 0, TRUE, NOW())`,
    [session1.id, asset1.id, session2.id],
  );
  await pg.query(
    `INSERT INTO class_session_videos (lesson_id, video_asset_id, title, video_type, sort_order, is_published, published_at)
     VALUES ($1, $2, 'Phan 1 Bai 1 Ind', 'primary', 0, TRUE, NOW())`,
    [lesson1.id, asset1.id],
  );

  // Dirty XSS in theory HTML to verify strict sanitization
  await pg.query(
    `INSERT INTO learning_unit_theory (class_session_id, title, summary, content_html, transcript, key_takeaways, timestamps_json)
     VALUES
       ($1, 'Ly thuyet Buoi 1', 'Tom tat B1', '<p onclick="evil()">Noi dung <a href="javascript:alert(1)">an toan</a></p><script>alert("xss")</script>', '[00:10] Xin chao cac ban', '["Nho cong thuc E=mc^2"]'::jsonb, '[{"time":"00:10","seconds":10,"label":"Mo dau"}]'::jsonb),
       ($2, 'Ly thuyet Bi Mat B2', 'Tom tat B2', '<p>Secret theory B2</p>', 'Secret transcript B2', '["Bi mat"]'::jsonb, '[]'::jsonb)`,
    [session1.id, session2.id],
  );

  await pg.query(
    `INSERT INTO session_vocabularies (session_id, class_id, term, pinyin, sino_vietnamese, meaning, created_by)
     VALUES ($1, $3, '函数', 'hánshù', 'Hàm số', 'Function', $4),
            ($2, $3, 'SECRET_VOCAB_B2', 'mimi', 'Bí mật', 'Locked meaning', $4)`,
    [session1.id, session2.id, liveClass.id, teacher.id],
  );

  await pg.query(
    `INSERT INTO session_formulas (session_id, class_id, subject, chapter_name, name_vi, latex_expression, created_by)
     VALUES ($1, $3, 'MATH', 'Chuong 1', 'Dinh ly Viet', 'x_1 + x_2 = -\\frac{b}{a}', $4),
            ($2, $3, 'MATH', 'Chuong 1', 'SECRET_FORMULA_B2', 'E = mc^2', $4)`,
    [session1.id, session2.id, liveClass.id, teacher.id],
  );

  const f1 = (
    await pg.query(
      `INSERT INTO lms_learning_files (course_id, live_class_id, class_session_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, 'TaiLieu_B1.pdf', 'r2://secret/bucket/b1.pdf', 'application/pdf', 204800, 'COURSE', 'ready')
       RETURNING id`,
      [course.id, liveClass.id, session1.id, teacher.id],
    )
  ).rows[0];
  await pg.query(
    `INSERT INTO lms_learning_file_placements (file_id, live_class_id, class_session_id, attached_by)
     VALUES ($1, $2, $3, $4)`,
    [f1.id, liveClass.id, session1.id, teacher.id],
  );

  const quiz1 = (
    await pg.query(
      `INSERT INTO quizzes (title, duration_minutes, passing_score, status, course_id, live_class_id, class_session_id, instructor_id)
       VALUES ('Quiz Buoi 1', 15, 60, 'PUBLISHED', $1, $2, $3, $4)
       RETURNING id`,
      [course.id, liveClass.id, session1.id, teacher.id],
    )
  ).rows[0];
  await pg.query(
    `INSERT INTO assignments (title, assignment_type, max_score, course_id, live_class_id, class_session_id, instructor_id)
     VALUES ('Bai tap Buoi 1', 'homework', 10, $1, $2, $3, $4)`,
    [course.id, liveClass.id, session1.id, teacher.id],
  );

  // Grant active external entitlement for course
  await pg.query(
    `INSERT INTO external_entitlements (source_system, external_grant_id, external_user_id, external_course_id, user_id, local_course_id, status, valid_from, source_updated_at)
     VALUES ('moly', 'ext-ent-d3-1', 'moly-user-301', $1, $2, $3, 'active', NOW() - INTERVAL '1 day', NOW())`,
    [String(course.id), learner.id, course.id],
  );

  return {
    teacher,
    learner,
    course,
    otherCourse,
    liveClass,
    chapter,
    session1,
    session2,
    mirrorProfile,
    indProfile,
    lesson1,
    lesson2,
    asset1,
    file1: f1,
    quiz1,
  };
}

test("Day 3 CSCA-Course HTML sanitizer removes executable vectors cleanly", () => {
  const dirty = '<div onclick="alert(1)"><script>fetch("/steal")</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(2)" style="color:expression(alert(3))">Click</a><p>Safe <strong>math</strong></p></div>';
  const clean = sanitizeTheoryHtml(dirty);
  assert.equal(/<script|<iframe|onclick|javascript:|expression\(/i.test(clean), false);
  assert.match(clean, /<p>Safe <strong>math<\/strong><\/p>/);
});

test("Day 3 CSCA-Course curriculum export covers MIRROR + INDEPENDENT with metadata-only privacy and cursor pagination", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);
  const fix = await seedCourseFixture(pg);

  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead: createRequireMolyIntegration({
      configOverrides: TEST_MOLY_CFG,
      requireIdempotencyKey: false,
      allowBodylessGet: true,
    }),
    verifyWrite: createRequireMolyIntegration({
      configOverrides: TEST_MOLY_CFG,
      requireIdempotencyKey: true,
    }),
  }));

  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // Page 1 with limit=2 across profiles
  const url1 = `/api/integrations/v2/catalog/courses/${fix.course.id}/curriculum?limit=2`;
  const res1 = await fetch(`${baseUrl}${url1}`, { headers: signedGetHeaders(url1) });
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  assert.equal(json1.success, true);
  assert.equal(json1.data.profiles.length, 2);
  assert.equal(json1.data.pagination.returnedUnits, 2);
  assert.equal(json1.data.pagination.totalUnits, 4);
  assert.equal(json1.data.pagination.hasMore, true);
  assert.ok(json1.data.pagination.nextCursor);

  const rawText = JSON.stringify(json1.data);
  // Assert NO secret or restricted payload is leaked in curriculum export
  assert.equal(rawText.includes("Secret theory B2"), false);
  assert.equal(rawText.includes("SECRET_VOCAB_B2"), false);
  assert.equal(rawText.includes("SECRET_FORMULA_B2"), false);
  assert.equal(rawText.includes("vid-s1-p1"), false);
  assert.equal(rawText.includes("r2://secret"), false);

  const mirrorProf = json1.data.profiles.find((p) => p.mode === "MIRROR");
  assert.ok(mirrorProf);
  assert.equal(mirrorProf.units[0].title, "Buoi 1 Preview");
  assert.equal(mirrorProf.units[0].counts.videos, 1);
  assert.equal(mirrorProf.units[0].counts.vocab, 1);
  assert.equal(mirrorProf.units[0].counts.formulas, 1);
  assert.equal(mirrorProf.units[0].counts.files, 1);
  assert.equal(mirrorProf.units[0].counts.quizzes, 1);
  assert.equal(mirrorProf.units[0].counts.assignments, 1);
  assert.equal(mirrorProf.units[0].theory.hasTheory, true);
  assert.equal(mirrorProf.units[0].theory.hasTranscript, true);

  // Page 2 using cursor returns remaining units cleanly
  const url2 = `/api/integrations/v2/catalog/courses/${fix.course.id}/curriculum?limit=2&cursor=${encodeURIComponent(json1.data.pagination.nextCursor)}`;
  const res2 = await fetch(`${baseUrl}${url2}`, { headers: signedGetHeaders(url2) });
  assert.equal(res2.status, 200);
  const json2 = await res2.json();
  const page2Units = json2.data.profiles.flatMap((p) => p.units);
  assert.ok(page2Units.some((u) => u.unitType === "lesson"));

  // Cross-course profileId mismatch returns 409 PROFILE_SCOPE_MISMATCH
  const mismatchUrl = `/api/integrations/v2/catalog/courses/${fix.otherCourse.id}/curriculum?profileId=${fix.mirrorProfile.id}`;
  const mismatchRes = await fetch(`${baseUrl}${mismatchUrl}`, { headers: signedGetHeaders(mismatchUrl) });
  assert.equal(mismatchRes.status, 409);
  const mismatchBody = await mismatchRes.json();
  assert.equal(mismatchBody.errorCode, "PROFILE_SCOPE_MISMATCH");
});

test("Day 3 CSCA-Course delegated learning enforces opaque TTL <=300s, sequential locks, sanitization, revocation, and public preview", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);
  const fix = await seedCourseFixture(pg);

  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead: createRequireMolyIntegration({
      configOverrides: TEST_MOLY_CFG,
      requireIdempotencyKey: false,
      allowBodylessGet: true,
    }),
    verifyWrite: createRequireMolyIntegration({
      configOverrides: TEST_MOLY_CFG,
      requireIdempotencyKey: true,
    }),
  }));

  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // 1. Mismatch courseId + profileId returns 409 PROFILE_SCOPE_MISMATCH
  const badMintBody = JSON.stringify({
    externalUserId: "moly-user-301",
    courseId: String(fix.otherCourse.id),
    profileId: String(fix.mirrorProfile.id),
  });
  const badMintRes = await fetch(`${baseUrl}/api/integrations/v2/learning/sessions`, {
    method: "POST",
    headers: signedPostHeaders(badMintBody),
    body: badMintBody,
  });
  assert.equal(badMintRes.status, 409);
  assert.equal((await badMintRes.json()).errorCode, "PROFILE_SCOPE_MISMATCH");

  // 2. Mint valid short-lived delegated session (requesting ttlSeconds=999 clamps to 300)
  const mintBody = JSON.stringify({
    externalUserId: "moly-user-301",
    courseId: String(fix.course.id),
    profileId: String(fix.mirrorProfile.id),
    scopes: ["workspace:read", "video:play"],
    ttlSeconds: 999,
  });
  const mintRes = await fetch(`${baseUrl}/api/integrations/v2/learning/sessions`, {
    method: "POST",
    headers: signedPostHeaders(mintBody),
    body: mintBody,
  });
  assert.equal(mintRes.status, 201);
  const mintJson = await mintRes.json();
  assert.equal(mintJson.data.ttlSeconds, 300);
  const token = mintJson.data.sessionToken;
  assert.ok(token.startsWith("dls_"));

  // Token stored as SHA-256 hash only (plaintext never persisted in DB)
  const dbSessions = await pg.query(`SELECT session_token_hash FROM delegated_learning_sessions`);
  assert.equal(dbSessions.rows.length, 1);
  assert.notEqual(dbSessions.rows[0].session_token_hash, token);

  // 3. Read workspace unlocked Unit 1 -> sanitized HTML & full learning materials
  const wsUrl = `/api/integrations/v2/learning/offerings/${fix.mirrorProfile.id}/workspace`;
  const wsRes = await fetch(`${baseUrl}${wsUrl}`, {
    headers: signedGetHeaders(wsUrl, { "X-Delegated-Session": token }),
  });
  assert.equal(wsRes.status, 200);
  const wsJson = await wsRes.json();
  assert.equal(wsJson.data.activeUnit.id, String(fix.session1.id));
  assert.equal(/<script|onclick|javascript:/i.test(wsJson.data.activeUnit.theory.contentHtml), false);
  assert.equal(wsJson.data.activeUnit.vocabulary.length, 1);
  assert.equal(wsJson.data.activeUnit.formulas.length, 1);
  assert.equal(wsJson.data.units[1].isLocked, true);

  // 4. Attempting locked Unit 2 directly returns 403 UNIT_LOCKED without leaking content
  const lockedUrl = `/api/integrations/v2/learning/offerings/${fix.mirrorProfile.id}/units/${fix.session2.id}`;
  const lockedRes = await fetch(`${baseUrl}${lockedUrl}`, {
    headers: signedGetHeaders(lockedUrl, { "X-Delegated-Session": token }),
  });
  assert.equal(lockedRes.status, 403);
  const lockedJson = await lockedRes.json();
  assert.equal(lockedJson.errorCode, "UNIT_LOCKED");
  assert.equal(JSON.stringify(lockedJson).includes("Secret theory B2"), false);
  assert.equal(JSON.stringify(lockedJson).includes("SECRET_VOCAB_B2"), false);

  // 5. Completing Unit 1 video >= 50% PLUS required quiz unlocks Unit 2 cleanly
  await pg.query(
    `INSERT INTO video_watch_progress (user_id, video_asset_id, class_session_id, last_position_seconds, completion_percent, is_completed, completed_at)
     VALUES ($1, $2, $3, 330, 55, TRUE, NOW())`,
    [fix.learner.id, fix.asset1.id, fix.session1.id],
  );
  // Video alone (with pending quiz) still keeps Unit 2 locked
  const stillLockedRes = await fetch(`${baseUrl}${lockedUrl}`, {
    headers: signedGetHeaders(lockedUrl, { "X-Delegated-Session": token }),
  });
  assert.equal(stillLockedRes.status, 403);

  await pg.query(
    `INSERT INTO quiz_attempts (quiz_id, user_id, status, score, max_score, submitted_at)
     VALUES ($1, $2, 'submitted', 90, 100, NOW())`,
    [fix.quiz1.id, fix.learner.id],
  );
  const unlockedRes = await fetch(`${baseUrl}${lockedUrl}`, {
    headers: signedGetHeaders(lockedUrl, { "X-Delegated-Session": token }),
  });
  assert.equal(unlockedRes.status, 200);
  const unlockedJson = await unlockedRes.json();
  assert.equal(unlockedJson.data.theory.summary, "Tom tat B2");
  assert.equal(unlockedJson.data.vocabulary[0].term, "SECRET_VOCAB_B2");

  // 6. Explicit public preview route allows preview unit without session, blocks non-preview unit
  const pubOkUrl = `/api/integrations/v2/learning/preview/offerings/${fix.mirrorProfile.id}/units/${fix.session1.id}`;
  const pubOkRes = await fetch(`${baseUrl}${pubOkUrl}`, { headers: signedGetHeaders(pubOkUrl) });
  assert.equal(pubOkRes.status, 200);
  const pubOkJson = await pubOkRes.json();
  assert.equal(pubOkJson.data.capabilities.isPublicPreviewAccess, true);
  assert.equal(pubOkJson.data.capabilities.allowFileDownload, false);

  const pubLockedUrl = `/api/integrations/v2/learning/preview/offerings/${fix.mirrorProfile.id}/units/${fix.session2.id}`;
  const pubLockedRes = await fetch(`${baseUrl}${pubLockedUrl}`, { headers: signedGetHeaders(pubLockedUrl) });
  assert.equal(pubLockedRes.status, 403);

  // 7. Expired delegated session rejects cleanly with 401
  await assert.rejects(
    () => getDelegatedUnitDetail({
      db,
      sessionToken: token,
      profileId: fix.mirrorProfile.id,
      unitId: fix.session1.id,
      now: () => new Date(Date.now() + 305_000),
    }),
    (err) => err.statusCode === 401 && err.errorCode === "DELEGATED_SESSION_EXPIRED",
  );

  // 8. Profile access revocation revokes existing token immediately
  await pg.query(
    `INSERT INTO video_course_access_revocations (user_id, video_course_profile_id, reason)
     VALUES ($1, $2, 'Refund processed')`,
    [fix.learner.id, fix.mirrorProfile.id],
  );
  await assert.rejects(
    () => getDelegatedWorkspace({ db, sessionToken: token, profileId: fix.mirrorProfile.id }),
    (err) => err.statusCode === 403,
  );
});

test("Day 3 CSCA-Course curriculum/content mutations enqueue outbox envelopes including tombstones", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);
  const fix = await seedCourseFixture(pg);

  const contentEnv = await recordUnitContentMutation({
    db,
    unitType: "class_session",
    unitId: fix.session1.id,
    correlationId: "corr-unit-upsert",
  });
  assert.equal(contentEnv.eventType, "unit_content.upserted");
  assert.equal(contentEnv.payload.unitId, String(fix.session1.id));

  const snapshot = await resolveBeforeDeleteUnitSnapshot(db, {
    unitType: "lesson",
    unitId: fix.lesson2.id,
  });
  await pg.query(`DELETE FROM lessons WHERE id = $1`, [fix.lesson2.id]);
  const tombEnv = await recordCurriculumMutation({
    db,
    courseId: fix.course.id,
    unitType: "lesson",
    unitId: fix.lesson2.id,
    eventType: "curriculum.tombstoned",
    deleted: true,
    beforeDeleteSnapshot: snapshot,
    correlationId: "corr-unit-tomb",
  });
  assert.equal(tombEnv.eventType, "curriculum.tombstoned");
  assert.equal(tombEnv.deleted, true);
  assert.equal(tombEnv.payload.tombstonedUnits[0].unitId, String(fix.lesson2.id));

  const rows = await pg.query(`SELECT event_type, deleted FROM course_integration_outbox ORDER BY aggregate_revision ASC`);
  assert.deepEqual(rows.rows.map((r) => r.event_type), ["unit_content.upserted", "curriculum.tombstoned"]);
});
