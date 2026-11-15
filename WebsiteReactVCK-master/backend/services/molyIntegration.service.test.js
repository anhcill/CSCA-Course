import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { computeMolySignature, createRequireMolyIntegration } from "../middleware/requireMolyIntegration.js";
import requireActiveStudentLmsAccess, {
  hasActiveStudentLmsAccess,
} from "../middleware/requireActiveStudentLmsAccess.js";
import {
  resolveEffectiveStudentLmsAccess,
  hasEffectiveCourseEntitlement,
  hasActiveExternalLmsAccess,
} from "./externalEntitlementAccess.service.js";
import {
  upsertManualCourseMapping,
  updateCourseMappingStatus,
} from "./externalCourseMapping.service.js";
import { hasUnrevokedVideoCourseAccess } from "./videoCourseAccessRevocation.service.js";
import {
  TRUSTED_DEVICE_COOKIE,
  establishLoginSession,
} from "./trustedDevice.service.js";
import {
  enqueueMolyIntegrationEvent,
  linkExternalIdentityManually,
  processAvailableMolyInboxJobs,
  processNextMolyInboxJob,
  resolveIntegrationConflict,
  parseProvisionWirePayload,
  queryCourseOwnershipForMoly,
} from "./molyIntegration.service.js";
import { createMolyIntegrationRouter } from "../router/molyIntegration.router.js";
import { createExternalCourseMappingRouter } from "../router/externalCourseMapping.router.js";

const TEST_MOLY_CFG = {
  serviceToken: "moly-day2-test-bearer-secret",
  integrationKey: "moly-studio-prod",
  hmacSecret: "moly-hmac-signing-secret-v1",
  jwtSecret: "csca-day2-jwt-test-secret",
};

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const setupMolyTestEnv = async (t) => {
  const db = new PGlite();
  t.after(async () => {
    await db.close();
  });
  await loadFullCourseSchema(db);

  const prevEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    MOLY_INTEGRATION_SERVICE_TOKEN: process.env.MOLY_INTEGRATION_SERVICE_TOKEN,
    MOLY_INTEGRATION_KEY: process.env.MOLY_INTEGRATION_KEY,
    MOLY_INTEGRATION_HMAC_SECRET: process.env.MOLY_INTEGRATION_HMAC_SECRET,
    MOLY_INTEGRATION_MAX_AGE_SECONDS: process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS,
  };

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  process.env.JWT_SECRET = TEST_MOLY_CFG.jwtSecret;
  process.env.MOLY_INTEGRATION_SERVICE_TOKEN = TEST_MOLY_CFG.serviceToken;
  process.env.MOLY_INTEGRATION_KEY = TEST_MOLY_CFG.integrationKey;
  process.env.MOLY_INTEGRATION_HMAC_SECRET = TEST_MOLY_CFG.hmacSecret;
  process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS = "300";

  const { pool } = await import("../db/connect.js");
  const prevQuery = pool.query;
  const prevConnect = pool.connect;
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({
    query: (sql, params) => db.query(sql, params),
    release() {},
  });

  t.after(() => {
    pool.query = prevQuery;
    pool.connect = prevConnect;
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const videoCourseRouter = (await import("../router/videoCourse.router.js")).default;
  const enrollmentRouter = (await import("../router/enrollment.router.js")).default;
  const courseRouter = (await import("../router/course.router.js")).default;

  const app = express();
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(cookieParser());
  app.use("/api/integrations/v1", createMolyIntegrationRouter({ db }));
  app.use("/api/admin/integrations", createExternalCourseMappingRouter({ db }));
  app.use("/api/video-courses", videoCourseRouter);
  app.use("/api/enrollments", enrollmentRouter);
  app.use("/api/courses", courseRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return { db, baseUrl };
};

const postMolySigned = async (baseUrl, path, bodyObj, options = {}) => {
  const rawBody = options.rawBody ?? JSON.stringify(bodyObj);
  const timestamp = options.timestamp ?? new Date().toISOString();
  const correlationId = options.correlationId ?? bodyObj?.correlation_id ?? `corr-${Date.now()}`;
  const idempotencyKey = options.idempotencyKey === undefined
    ? (bodyObj?.idempotency_key ?? `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    : options.idempotencyKey;
  const signature = options.signature ?? computeMolySignature({
    timestamp,
    rawBody,
    secret: options.hmacSecret ?? TEST_MOLY_CFG.hmacSecret,
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: options.authorization ?? `Bearer ${options.serviceToken ?? TEST_MOLY_CFG.serviceToken}`,
    "X-Integration-Key": options.integrationKey ?? TEST_MOLY_CFG.integrationKey,
    "X-Event-Timestamp": timestamp,
    "X-Correlation-ID": correlationId,
    "X-Signature": signature,
  };
  if (idempotencyKey !== null) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const res = await fetch(`${baseUrl}/api/integrations/v1${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const json = await res.json();
  return { status: res.status, body: json };
};

const createAuthCookieHeader = async (userId) => {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { sessionId, sessionToken, deviceToken } = await establishLoginSession({
    userId,
    userAgent: "Mozilla/5.0 Day2TestBrowser",
    ipAddress: "127.0.0.1",
    expiresAt,
  });
  const jwtToken = jwt.sign(
    { userId, sessionId, sessionToken },
    TEST_MOLY_CFG.jwtSecret,
    { expiresIn: "1d" },
  );
  return `jwt=${jwtToken}; ${TRUSTED_DEVICE_COOKIE}=${deviceToken}`;
};

const seedCourseWithIndependentProfiles = async (db, authorId, slug = "moly-math-1") => {
  const course = (await db.query(
    `INSERT INTO courses (name, title, slug, author_id, is_published, is_management_managed)
     VALUES ('CSCA Moly Math', 'CSCA Moly Math', $1, $2, TRUE, TRUE)
     RETURNING *`,
    [slug, authorId],
  )).rows[0];
  const section = (await db.query(
    `INSERT INTO sections (course_id, title, sort_order)
     VALUES ($1, 'Chương 1', 1) RETURNING id`,
    [course.id],
  )).rows[0];
  const lesson = (await db.query(
    `INSERT INTO lessons (course_id, section_id, name, title, duration_seconds, is_published, sort_order)
     VALUES ($1, $2, 'Bài 1', 'Bài 1: Giới hạn hàm số', 1200, TRUE, 1) RETURNING id`,
    [course.id, section.id],
  )).rows[0];
  const profileA = (await db.query(
    `INSERT INTO video_course_profiles
       (course_id, management_class_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, $2, 'INDEPENDENT', NULL, TRUE, 2, 'active') RETURNING *`,
    [course.id, `${slug}-offer-a`],
  )).rows[0];
  const profileB = (await db.query(
    `INSERT INTO video_course_profiles
       (course_id, management_class_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, $2, 'INDEPENDENT', NULL, TRUE, 2, 'active') RETURNING *`,
    [course.id, `${slug}-offer-b`],
  )).rows[0];
  return { course, section, lesson, profileA, profileB };
};

test("HTTP webhook security: rejects invalid auth/key/timestamp/signature and persists durable inbox idempotently", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);

  const validPayload = {
    event_id: "moly:evt:sec_1",
    idempotency_key: "idem-sec-1",
    correlation_id: "corr-sec-1",
    source_system: "moly",
    external_user_id: "moly:usr:sec_001",
    account_status: "active",
    source_updated_at: "2026-11-14T10:00:00.000Z",
    profile: { full_name: "Security Test", email_hint: "sec001@example.test", email_verified: true },
  };

  // Wrong Bearer token -> 401 before inbox write
  const badBearer = await postMolySigned(baseUrl, "/users/provision", validPayload, {
    serviceToken: "wrong-bearer",
  });
  assert.equal(badBearer.status, 401);
  assert.equal(badBearer.body.errorCode, "INVALID_SERVICE_TOKEN");

  // Wrong X-Integration-Key -> 401
  const badKey = await postMolySigned(baseUrl, "/users/provision", validPayload, {
    integrationKey: "wrong-key",
  });
  assert.equal(badKey.status, 401);
  assert.equal(badKey.body.errorCode, "INVALID_INTEGRATION_KEY");

  // Expired X-Event-Timestamp -> 401
  const expired = await postMolySigned(baseUrl, "/users/provision", validPayload, {
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.errorCode, "TIMESTAMP_EXPIRED");

  // Tampered HMAC signature -> 401
  const badSig = await postMolySigned(baseUrl, "/users/provision", validPayload, {
    signature: `sha256=${"a".repeat(64)}`,
  });
  assert.equal(badSig.status, 401);
  assert.equal(badSig.body.errorCode, "INVALID_SIGNATURE");

  // Validation guards: disallow email or non-moly source_system -> 422 before inbox write
  const nonMolySource = await postMolySigned(baseUrl, "/users/provision", {
    ...validPayload,
    source_system: "internal_management",
  });
  assert.equal(nonMolySource.status, 422);
  assert.equal(nonMolySource.body.errorCode, "INVALID_SOURCE_SYSTEM");

  const emailAsExtId = await postMolySigned(baseUrl, "/users/provision", {
    ...validPayload,
    external_user_id: "moly:user@example.com",
  });
  assert.equal(emailAsExtId.status, 422);

  assert.equal((await db.query("SELECT COUNT(*)::int AS cnt FROM integration_inbox")).rows[0].cnt, 0);

  // Valid signed request -> 202 queued durably in integration_inbox
  const ok = await postMolySigned(baseUrl, "/users/provision", validPayload);
  assert.equal(ok.status, 202, JSON.stringify(ok.body));
  assert.equal(ok.body.queued, true);
  assert.equal(ok.body.duplicate, undefined);
  const snapshot = (await db.query("SELECT headers_snapshot FROM integration_inbox")).rows[0].headers_snapshot;
  assert.deepEqual(Object.keys(snapshot).sort(), ["correlation_id", "event_timestamp", "idempotency_key"]);

  // Duplicate retry with same Idempotency-Key & payload -> 200 duplicate without inserting extra inbox row
  const replay = await postMolySigned(baseUrl, "/users/provision", validPayload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal((await db.query("SELECT COUNT(*)::int AS cnt FROM integration_inbox")).rows[0].cnt, 1);

  // Idempotency-Key reuse with conflicting payload -> 409 IDEMPOTENCY_KEY_CONFLICT
  const conflict = await postMolySigned(baseUrl, "/users/provision", {
    ...validPayload,
    event_id: "moly:evt:sec_2",
    external_user_id: "moly:usr:different_999",
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.errorCode, "IDEMPOTENCY_KEY_CONFLICT");

  // Signed status check endpoint returns the durable inbox row
  const statusCheck = await postMolySigned(
    baseUrl,
    "/moly/events/status",
    { event_id: "moly:evt:sec_1", correlation_id: "corr-status-1" },
    { idempotencyKey: null },
  );
  assert.equal(statusCheck.status, 200);
  assert.equal(statusCheck.body.data.length, 1);
  assert.equal(statusCheck.body.data[0].status, "pending");
});

test("provisioning isolation & conflict quarantine: safe new user, email collision quarantine, privileged role block, and admin resolution replay", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);

  const adminUser = (await db.query(
    `INSERT INTO users (username, email, role)
     VALUES ('day2admin', 'day2-admin@csca.local', 'admin') RETURNING *`,
  )).rows[0];
  const teacherUser = (await db.query(
    `INSERT INTO users (username, email, role)
     VALUES ('day2teacher', 'teacher-staff@csca.local', 'creator') RETURNING *`,
  )).rows[0];
  const existingStudent = (await db.query(
    `INSERT INTO users (username, email, role, is_management_managed, lms_account_status)
     VALUES ('existingstud', 'existing.student@csca.local', 'user', FALSE, 'unmanaged') RETURNING *`,
  )).rows[0];

  const { course, profileA } = await seedCourseWithIndependentProfiles(db, teacherUser.id, "quarantine-course");
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:crs:q_offer_a",
    localCourseId: course.id,
    localVideoCourseProfileId: profileA.id,
    actorId: adminUser.id,
    via: "admin_api",
  });

  // 1) Pure Moly user provision creates non-Management user with safe synthetic email & external_identities row
  const newProv = await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:prov_fresh",
    idempotency_key: "idem-prov-fresh",
    correlation_id: "corr-prov-fresh",
    source_system: "moly",
    external_user_id: "moly:usr:fresh_100",
    account_status: "active",
    source_updated_at: "2026-11-14T10:00:00.000Z",
    profile: { full_name: "Moly Learner 100", email_hint: "fresh100@moly.vn", email_verified: true },
  });
  assert.equal(newProv.status, 202);
  const processedFresh = await processNextMolyInboxJob({ db, workerId: "worker-1" });
  assert.equal(processedFresh.status, "processed");

  const provisionedRow = (await db.query(
    `SELECT u.*, ei.source_system, ei.external_user_id, ei.link_method, ei.email_snapshot
     FROM external_identities ei JOIN users u ON u.id = ei.user_id
     WHERE ei.source_system = 'moly' AND ei.external_user_id = 'moly:usr:fresh_100'`,
  )).rows[0];
  assert.ok(provisionedRow);
  assert.equal(provisionedRow.role, "user");
  assert.equal(provisionedRow.is_management_managed, false);
  assert.equal(provisionedRow.lms_account_status, "unmanaged");
  assert.equal(provisionedRow.external_student_id, null);
  assert.equal(provisionedRow.link_method, "provisioned");
  assert.equal(provisionedRow.email_snapshot, "fresh100@moly.vn");
  assert.equal(provisionedRow.email, "fresh100@moly.vn");

  // Provisioning without email_hint allocates safe synthetic @external.moly.invalid email
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:prov_no_email",
    idempotency_key: "idem-prov-no-email",
    correlation_id: "corr-prov-no-email",
    source_system: "moly",
    external_user_id: "moly:usr:no_email_101",
    account_status: "active",
    source_updated_at: "2026-11-14T10:00:00.000Z",
    profile: { full_name: "No Email Learner" },
  });
  await processNextMolyInboxJob({ db, workerId: "worker-1" });
  const noEmailRow = (await db.query(
    `SELECT u.email, u.is_management_managed, u.lms_account_status
     FROM external_identities ei JOIN users u ON u.id = ei.user_id
     WHERE ei.external_user_id = 'moly:usr:no_email_101'`,
  )).rows[0];
  assert.ok(noEmailRow.email.endsWith("@external.moly.invalid"), `Unexpected email: ${noEmailRow.email}`);
  assert.equal(noEmailRow.is_management_managed, false);
  assert.equal(noEmailRow.lms_account_status, "unmanaged");

  // Older provision timestamp is marked stale and ignored
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:prov_stale",
    idempotency_key: "idem-prov-stale",
    correlation_id: "corr-prov-stale",
    source_system: "moly",
    external_user_id: "moly:usr:fresh_100",
    account_status: "suspended",
    source_updated_at: "2026-11-14T09:00:00.000Z",
    profile: { full_name: "Stale Name", email_hint: "stale@moly.vn", email_verified: false },
  });
  const staleRes = await processNextMolyInboxJob({ db, workerId: "worker-1" });
  assert.equal(staleRes.status, "stale");
  const afterStaleId = (await db.query(
    "SELECT status, email_snapshot FROM external_identities WHERE external_user_id = 'moly:usr:fresh_100'",
  )).rows[0];
  assert.equal(afterStaleId.status, "active");

  for (const [suffix, status, timestamp, expected] of [
    ["suspend", "suspended", "2026-11-14T10:01:00.000Z", "processed"],
    ["equal-reactivate", "active", "2026-11-14T10:01:00.000Z", "stale"],
    ["new-reactivate", "active", "2026-11-14T10:02:00.000Z", "processed"],
  ]) {
    await postMolySigned(baseUrl, "/users/provision", {
      event_id: `moly:evt:${suffix}`, idempotency_key: `idem-${suffix}`,
      correlation_id: "identity-ordering", source_system: "moly",
      external_user_id: "moly:usr:fresh_100", account_status: status,
      source_updated_at: timestamp,
    });
    assert.equal((await processNextMolyInboxJob({ db })).status, expected);
    assert.equal((await db.query(
      "SELECT status FROM external_identities WHERE external_user_id = 'moly:usr:fresh_100'",
    )).rows[0].status, expected === "stale" ? "suspended" : status);
    if (suffix === "suspend") {
      await assert.rejects(() => linkExternalIdentityManually(db, {
        externalUserId: "moly:usr:fresh_100", targetUserId: provisionedRow.id,
        status: "active", sourceUpdatedAt: timestamp,
      }), (error) => error.errorCode === "STALE_EVENT");
    }
  }

  // 2) Student email collision must NOT auto-link -> quarantine in integration_conflicts + dead_letter
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:prov_stud_collision",
    idempotency_key: "idem-prov-stud-collision",
    correlation_id: "corr-stud-collision",
    source_system: "moly",
    external_user_id: "moly:usr:collide_stud_200",
    account_status: "active",
    source_updated_at: "2026-11-14T10:05:00.000Z",
    profile: { full_name: "Colliding Student", email_hint: existingStudent.email, email_verified: true },
  });
  const studColRes = await processNextMolyInboxJob({ db, workerId: "worker-1" });
  assert.equal(studColRes.status, "dead_letter");
  assert.equal(studColRes.errorCode, "IDENTITY_EMAIL_COLLISION");
  assert.ok(studColRes.conflictId);
  assert.equal(
    (await db.query("SELECT * FROM external_identities WHERE external_user_id = 'moly:usr:collide_stud_200'")).rows.length,
    0,
  );

  // Queue an entitlement for that unresolved Moly user -> exhausted -> quarantined as UNRESOLVED_IDENTITY
  await enqueueMolyIntegrationEvent(db, (await import("./molyIntegration.service.js")).parseGrantWirePayload({
    event_id: "moly:evt:grant_before_resolve",
    idempotency_key: "idem-grant-before-resolve",
    correlation_id: "corr-grant-before-resolve",
    source_system: "moly",
    external_user_id: "moly:usr:collide_stud_200",
    external_course_id: "moly:crs:q_offer_a",
    external_grant_id: "moly:grant:collide_200_a",
    status: "active",
    valid_from: "2026-11-14T10:06:00.000Z",
    source_updated_at: "2026-11-14T10:06:00.000Z",
  }), { maxAttempts: 1 });
  const grantUnresolvedRes = await processNextMolyInboxJob({ db, workerId: "worker-1", retryBaseSeconds: 0 });
  assert.equal(grantUnresolvedRes.status, "dead_letter");
  assert.equal(grantUnresolvedRes.errorCode, "UNRESOLVED_IDENTITY");

  // 3) Admin/Creator email collision -> PRIVILEGED_ROLE_COLLISION & blocked from manual linking
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:prov_admin_collision",
    idempotency_key: "idem-prov-admin-collision",
    correlation_id: "corr-admin-collision",
    source_system: "moly",
    external_user_id: "moly:usr:collide_admin_300",
    account_status: "active",
    source_updated_at: "2026-11-14T10:07:00.000Z",
    profile: { full_name: "Fake Admin", email_hint: adminUser.email, email_verified: true },
  });
  const adminColRes = await processNextMolyInboxJob({ db, workerId: "worker-1" });
  assert.equal(adminColRes.status, "dead_letter");
  assert.equal(adminColRes.errorCode, "PRIVILEGED_ROLE_COLLISION");

  await assert.rejects(
    () => linkExternalIdentityManually(db, {
      sourceSystem: "moly",
      externalUserId: "moly:usr:collide_admin_300",
      targetUserId: adminUser.id,
      actorId: adminUser.id,
    }),
    (err) => err.errorCode === "PRIVILEGED_ROLE_COLLISION",
  );

  // 4) Admin resolves student collision & replays BOTH conflicts via /api/admin/integrations HTTP API
  const adminCookie = await createAuthCookieHeader(adminUser.id);
  const listConflictsRes = await fetch(`${baseUrl}/api/admin/integrations/conflicts?status=open`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(listConflictsRes.status, 200);
  const openConflicts = (await listConflictsRes.json()).data;
  assert.ok(openConflicts.some((c) => c.id === String(studColRes.conflictId) || Number(c.id) === studColRes.conflictId));

  const resolveStudHttp = await fetch(`${baseUrl}/api/admin/integrations/conflicts/${studColRes.conflictId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      action: "link_existing",
      targetUserId: existingStudent.id,
      resolutionNote: "Verified student ownership manually",
      replayInbox: true,
    }),
  });
  assert.equal(resolveStudHttp.status, 200, JSON.stringify(await resolveStudHttp.clone().text()));

  // Also mark the unresolved-identity grant conflict resolved with replay so the grant applies cleanly
  await resolveIntegrationConflict(db, {
    conflictId: grantUnresolvedRes.conflictId,
    action: "resolved",
    resolutionNote: "Identity now linked",
    actorId: adminUser.id,
    replayInbox: true,
  });

  const drain = await processAvailableMolyInboxJobs({ db, workerId: "worker-replay", retryBaseSeconds: 0 });
  assert.equal(drain.length, 2);
  assert.ok(drain.every((r) => r.status === "processed"), JSON.stringify(drain));

  // Verify existing student stayed untouched on email & is_management_managed, while gaining Moly course entitlement
  const linkedStudent = (await db.query("SELECT * FROM users WHERE id = $1", [existingStudent.id])).rows[0];
  assert.equal(linkedStudent.email, "existing.student@csca.local");
  assert.equal(linkedStudent.is_management_managed, false);
  assert.equal(linkedStudent.lms_account_status, "unmanaged");
  assert.equal(await resolveEffectiveStudentLmsAccess({ user: linkedStudent, db }), true);
  assert.equal(hasActiveStudentLmsAccess(existingStudent), false);
  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: existingStudent.id, courseId: course.id }), true);
});

test("entitlement lifecycle, Day 1 Codex #9 audit log, retry/dead-letter, lease recovery, revoke-before-grant tombstone, and stale order", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);

  const adminUser = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('lcadmin', 'lcadmin@csca.local', 'admin') RETURNING *",
  )).rows[0];
  const teacherUser = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('lcteacher', 'lcteacher@csca.local', 'creator') RETURNING *",
  )).rows[0];
  const { course, profileA } = await seedCourseWithIndependentProfiles(db, teacherUser.id, "lifecycle-course");

  // Day 1 Codex #9 fix check: upsertManualCourseMapping + updateCourseMappingStatus inside CLI seed emits audit_events with before/after state
  const createdMap = await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:crs:lc_1",
    localCourseId: course.id,
    localVideoCourseProfileId: profileA.id,
    actorId: null,
  }, { auditMetadata: { via: "cli_seed" } });
  await updateCourseMappingStatus(db, {
    id: createdMap.id,
    status: "inactive",
    actorId: adminUser.id,
  }, { auditMetadata: { via: "admin_api" } });
  await updateCourseMappingStatus(db, {
    id: createdMap.id,
    status: "active",
    actorId: adminUser.id,
  }, { auditMetadata: { via: "admin_api" } });
  const mapAudits = (await db.query(
    "SELECT action, before_state, after_state, metadata FROM audit_events WHERE entity_type = 'external_course_mapping' ORDER BY id ASC",
  )).rows;
  assert.equal(mapAudits.length, 3);
  assert.equal(mapAudits[0].metadata.via, "cli_seed");
  assert.equal(
    Number(mapAudits[0].after_state.localVideoCourseProfileId ?? mapAudits[0].after_state.local_video_course_profile_id),
    Number(profileA.id),
  );
  assert.equal(mapAudits[1].before_state.status, "active");
  assert.equal(mapAudits[1].after_state.status, "inactive");

  // Provision Moly learner
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:lc_prov",
    idempotency_key: "idem-lc-prov",
    correlation_id: "corr-lc-prov",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    account_status: "active",
    source_updated_at: "2026-11-14T10:00:00.000Z",
    profile: { full_name: "Lifecycle User" },
  });
  await processNextMolyInboxJob({ db, workerId: "worker-lc" });

  // 1) Missing mapping goes immediately to terminal dead_letter + integration_conflicts quarantine
  const { parseGrantWirePayload } = await import("./molyIntegration.service.js");
  const unmappedGrant = await enqueueMolyIntegrationEvent(db, parseGrantWirePayload({
    event_id: "moly:evt:lc_unmapped",
    idempotency_key: "idem-lc-unmapped",
    correlation_id: "corr-lc-unmapped",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:does_not_exist",
    external_grant_id: "moly:grant:unmapped_1",
    status: "active",
    valid_from: "2026-11-14T10:01:00.000Z",
    source_updated_at: "2026-11-14T10:01:00.000Z",
  }), { maxAttempts: 3 });

  const unmappedDead = await processNextMolyInboxJob({ db, workerId: "worker-lc", retryBaseSeconds: 0 });
  assert.equal(unmappedDead.status, "dead_letter");
  assert.equal(unmappedDead.errorCode, "COURSE_MAPPING_MISSING");
  assert.ok(unmappedDead.conflictId);
  assert.equal(Number(unmappedGrant.inbox.id), Number(unmappedDead.inbox.id));

  // Retryable worker failure backs off then transitions to dead_letter when max_attempts is exhausted
  await enqueueMolyIntegrationEvent(db, parseGrantWirePayload({
    event_id: "moly:evt:lc_exhaust",
    idempotency_key: "idem-lc-exhaust",
    correlation_id: "corr-lc-exhaust",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:exhaust_1",
    status: "active",
    valid_from: "2026-11-14T10:02:00.000Z",
    source_updated_at: "2026-11-14T10:02:00.000Z",
  }), { maxAttempts: 2 });
  const retryFail1 = await processNextMolyInboxJob({
    db,
    workerId: "worker-lc",
    retryBaseSeconds: 0,
    handlers: { applyEntitlement: async () => { throw new Error("Simulated transient network timeout"); } },
  });
  assert.equal(retryFail1.status, "failed");
  assert.equal(Number(retryFail1.inbox.attempt_count), 1);

  const retryFail2 = await processNextMolyInboxJob({
    db,
    workerId: "worker-lc",
    retryBaseSeconds: 0,
    handlers: { applyEntitlement: async () => { throw new Error("Simulated transient network timeout"); } },
  });
  assert.equal(retryFail2.status, "dead_letter");
  assert.equal(Number(retryFail2.inbox.attempt_count), 2);

  // 2) Transient handler error retry + expired lease recovery
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:lc_g1",
    idempotency_key: "idem-lc-g1",
    correlation_id: "corr-lc-g1",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:lc_main",
    status: "active",
    valid_from: "2026-11-14T10:05:00.000Z",
    source_updated_at: "2026-11-14T10:05:00.000Z",
  });
  const transientFail = await processNextMolyInboxJob({
    db,
    workerId: "worker-transient",
    retryBaseSeconds: 0,
    handlers: {
      applyEntitlement: async () => {
        throw new Error("Transient DB hiccup");
      },
    },
  });
  assert.equal(transientFail.status, "failed");

  // Simulate another worker crashing mid-processing with an expired lease -> recovery succeeds!
  await db.query(
    `UPDATE integration_inbox
     SET status = 'processing',
         locked_by = 'dead-worker',
         locked_until = NOW() - INTERVAL '10 seconds'
     WHERE id = $1`,
    [transientFail.inbox.id],
  );
  const recoveredGrant = await processNextMolyInboxJob({ db, workerId: "worker-recovery", retryBaseSeconds: 0 });
  assert.equal(recoveredGrant.status, "processed");

  const grantRow = (await db.query(
    "SELECT * FROM external_entitlements WHERE external_grant_id = 'moly:grant:lc_main'",
  )).rows[0];
  assert.equal(grantRow.status, "active");
  assert.equal(Number(grantRow.local_video_course_profile_id), Number(profileA.id));

  const ceRows1 = (await db.query(
    "SELECT * FROM class_enrollments WHERE user_id = $1 AND enrollment_source = 'moly'",
    [grantRow.user_id],
  )).rows;
  assert.equal(ceRows1.length, 1);
  assert.equal(Number(ceRows1[0].video_course_profile_id), Number(profileA.id));
  assert.equal(ceRows1[0].status, "active");

  // Repeat active grant updates cleanly without duplicating class_enrollments or enrollments
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:lc_g2",
    idempotency_key: "idem-lc-g2",
    correlation_id: "corr-lc-g2",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:lc_main",
    status: "active",
    valid_from: "2026-11-14T10:05:00.000Z",
    source_updated_at: "2026-11-14T10:06:00.000Z",
  });
  await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS cnt FROM class_enrollments WHERE user_id = $1 AND enrollment_source = 'moly'", [grantRow.user_id])).rows[0].cnt,
    1,
  );
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS cnt FROM enrollments WHERE user_id = $1 AND course_id = $2", [grantRow.user_id, course.id])).rows[0].cnt,
    1,
  );

  // Revoke -> re-grant newer -> older stale ignored
  await postMolySigned(baseUrl, "/entitlements/revoke", {
    event_id: "moly:evt:lc_rev1",
    idempotency_key: "idem-lc-rev1",
    correlation_id: "corr-lc-rev1",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:lc_main",
    status: "revoked",
    reason: "refunded",
    source_updated_at: "2026-11-14T10:10:00.000Z",
  });
  await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: grantRow.user_id, courseId: course.id }), false);

  // Stale grant arriving at 10:09:00 must NOT reopen revoked 10:10:00 grant
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:lc_stale_reopen",
    idempotency_key: "idem-lc-stale-reopen",
    correlation_id: "corr-lc-stale-reopen",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:lc_main",
    status: "active",
    valid_from: "2026-11-14T10:09:00.000Z",
    source_updated_at: "2026-11-14T10:09:00.000Z",
  });
  const staleGrantRes = await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(staleGrantRes.status, "stale");
  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: grantRow.user_id, courseId: course.id }), false);

  // Newer re-grant at 10:15:00 restores access cleanly
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:lc_regrant",
    idempotency_key: "idem-lc-regrant",
    correlation_id: "corr-lc-regrant",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:lc_main",
    status: "active",
    valid_from: "2026-11-14T10:15:00.000Z",
    source_updated_at: "2026-11-14T10:15:00.000Z",
  });
  const regrantRes = await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(regrantRes.status, "processed");
  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: grantRow.user_id, courseId: course.id }), true);

  // 3) Revoke-before-grant tombstone on brand new grant_id
  await postMolySigned(baseUrl, "/entitlements/revoke", {
    event_id: "moly:evt:tomb_rev",
    idempotency_key: "idem-tomb-rev",
    correlation_id: "corr-tomb-rev",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:tombstone_first",
    status: "revoked",
    reason: "cancelled_in_flight",
    source_updated_at: "2026-11-14T12:00:00.000Z",
  });
  const tombCreated = await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(tombCreated.status, "processed");

  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:tomb_delayed_grant",
    idempotency_key: "idem-tomb-delayed-grant",
    correlation_id: "corr-tomb-delayed-grant",
    source_system: "moly",
    external_user_id: "moly:usr:lc_001",
    external_course_id: "moly:crs:lc_1",
    external_grant_id: "moly:grant:tombstone_first",
    status: "active",
    valid_from: "2026-11-14T11:55:00.000Z",
    source_updated_at: "2026-11-14T11:55:00.000Z",
  });
  const delayedBlocked = await processNextMolyInboxJob({ db, workerId: "worker-lc" });
  assert.equal(delayedBlocked.status, "stale");
  const tombRow = (await db.query(
    "SELECT status FROM external_entitlements WHERE external_grant_id = 'moly:grant:tombstone_first'",
  )).rows[0];
  assert.equal(tombRow.status, "revoked");
});

test("offering/profile isolation, InternalManagement coexistence, HTTP workspace/enrollment gates, and ownership/query", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);

  const adminUser = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('iso_admin', 'iso_admin@csca.local', 'admin') RETURNING *",
  )).rows[0];
  const teacherUser = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('iso_teacher', 'iso_teacher@csca.local', 'creator') RETURNING *",
  )).rows[0];
  const { course, profileA, profileB } = await seedCourseWithIndependentProfiles(db, teacherUser.id, "iso-course");

  // Map profileA and profileB to distinct external offerings on the SAME local_course_id
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:crs:iso_offer_a",
    localCourseId: course.id,
    localVideoCourseProfileId: profileA.id,
    actorId: adminUser.id,
    via: "admin_api",
  });
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:crs:iso_offer_b",
    localCourseId: course.id,
    localVideoCourseProfileId: profileB.id,
    actorId: adminUser.id,
    via: "admin_api",
  });

  // Pure Moly learner gets access ONLY to profileA
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:evt:iso_prov_1",
    idempotency_key: "idem-iso-prov-1",
    correlation_id: "corr-iso-prov-1",
    source_system: "moly",
    external_user_id: "moly:usr:iso_pure",
    account_status: "active",
    source_updated_at: "2026-11-14T10:00:00.000Z",
    profile: { full_name: "Isolated Pure Learner" },
  });
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:iso_grant_a",
    idempotency_key: "idem-iso-grant-a",
    correlation_id: "corr-iso-grant-a",
    source_system: "moly",
    external_user_id: "moly:usr:iso_pure",
    external_course_id: "moly:crs:iso_offer_a",
    external_grant_id: "moly:grant:iso_pure_a",
    status: "active",
    valid_from: "2026-11-14T10:01:00.000Z",
    source_updated_at: "2026-11-14T10:01:00.000Z",
  });
  await processAvailableMolyInboxJobs({ db, workerId: "worker-iso" });

  const pureIdentity = (await db.query(
    "SELECT user_id FROM external_identities WHERE external_user_id = 'moly:usr:iso_pure'",
  )).rows[0];
  const pureCookie = await createAuthCookieHeader(pureIdentity.user_id);

  // Profile A accessible, Sibling Profile B BLOCKED!
  const wsA = await fetch(`${baseUrl}/api/video-courses/profile-${profileA.id}/workspace`, {
    headers: { Cookie: pureCookie },
  });
  assert.equal(wsA.status, 200, JSON.stringify(await wsA.clone().text()));
  assert.equal(
    await hasUnrevokedVideoCourseAccess({
      db,
      userId: pureIdentity.user_id,
      courseId: course.id,
      profileId: profileA.id,
    }),
    true,
  );

  const wsB = await fetch(`${baseUrl}/api/video-courses/profile-${profileB.id}/workspace`, {
    headers: { Cookie: pureCookie },
  });
  assert.equal(wsB.status, 403);
  const wsBBody = await wsB.json();
  assert.equal(wsBBody.errorCode, "ENTITLEMENT_INACTIVE");
  assert.equal(
    await hasUnrevokedVideoCourseAccess({
      db,
      userId: pureIdentity.user_id,
      courseId: course.id,
      profileId: profileB.id,
    }),
    false,
  );

  // Enrollment check & /my reflect course access via Moly
  const enrollCheck = await fetch(`${baseUrl}/api/enrollments/check/${course.id}`, {
    headers: { Cookie: pureCookie },
  });
  assert.equal(enrollCheck.status, 200);
  const enrollCheckJson = await enrollCheck.json();
  assert.equal(enrollCheckJson.data.isEnrolled, true);
  assert.equal(enrollCheckJson.data.hasLmsAccess, true);

  const myEnrollments = await fetch(`${baseUrl}/api/enrollments/my`, {
    headers: { Cookie: pureCookie },
  });
  assert.equal(myEnrollments.status, 200);
  const myList = (await myEnrollments.json()).data;
  assert.equal(myList.length, 1);
  assert.equal(Number(myList[0].course_id || myList[0].id), Number(course.id));

  // Ownership query shows offer-a owned=true and offer-b owned=false
  const ownerBeforeRevoke = await postMolySigned(baseUrl, "/ownership/query", {
    correlation_id: "corr-own-1",
    subject: { source_system: "moly", external_user_id: "moly:usr:iso_pure" },
    external_course_ids: ["moly:crs:iso_offer_a", "moly:crs:iso_offer_b"],
  }, { idempotencyKey: null });
  assert.equal(ownerBeforeRevoke.status, 200);
  const itemsBefore = ownerBeforeRevoke.body.data.items;
  assert.equal(itemsBefore.find((i) => i.external_course_id === "moly:crs:iso_offer_a").owned, true);
  assert.equal(itemsBefore.find((i) => i.external_course_id === "moly:crs:iso_offer_b").owned, false);

  await db.query(
    "INSERT INTO video_course_access_revocations (video_course_profile_id, user_id) VALUES ($1, $2)",
    [profileA.id, pureIdentity.user_id],
  );
  const adminBlockedOwnership = await queryCourseOwnershipForMoly(db, {
    correlation_id: "admin-blocked", subject: { external_user_id: "moly:usr:iso_pure" },
    external_course_ids: ["moly:crs:iso_offer_a"],
  });
  assert.equal(adminBlockedOwnership.data.items[0].owned, false);
  await db.query(
    "DELETE FROM video_course_access_revocations WHERE video_course_profile_id = $1 AND user_id = $2",
    [profileA.id, pureIdentity.user_id],
  );

  // Revoke Moly grant -> immediately blocks workspace A and flips ownership to false
  await postMolySigned(baseUrl, "/entitlements/revoke", {
    event_id: "moly:evt:iso_rev_a",
    idempotency_key: "idem-iso-rev-a",
    correlation_id: "corr-iso-rev-a",
    source_system: "moly",
    external_user_id: "moly:usr:iso_pure",
    external_course_id: "moly:crs:iso_offer_a",
    external_grant_id: "moly:grant:iso_pure_a",
    status: "revoked",
    source_updated_at: "2026-11-14T10:10:00.000Z",
  });
  await processAvailableMolyInboxJobs({ db, workerId: "worker-iso" });

  const wsAAfterRevoke = await fetch(`${baseUrl}/api/video-courses/profile-${profileA.id}/workspace`, {
    headers: { Cookie: pureCookie },
  });
  assert.equal(wsAAfterRevoke.status, 403);

  const ownerAfterRevoke = await postMolySigned(baseUrl, "/ownership/query", {
    correlation_id: "corr-own-2",
    subject: { source_system: "moly", external_user_id: "moly:usr:iso_pure" },
    external_course_ids: ["moly:crs:iso_offer_a"],
  }, { idempotencyKey: null });
  assert.equal(ownerAfterRevoke.body.data.items[0].owned, false);

  // InternalManagement isolation (both directions):
  // A) Learner with BOTH active Management grant + linked Moly grant: revoking Moly keeps Management access alive
  const dualLearner = (await db.query(
    `INSERT INTO users (username, email, role, is_management_managed, lms_account_status, external_student_id)
     VALUES ('dual_stud', 'dual@csca.local', 'user', TRUE, 'active', 'mgmt-dual-1') RETURNING *`,
  )).rows[0];
  await db.query(
    `INSERT INTO lms_access_grants (user_id, course_id, access_status, valid_from, source_updated_at)
     VALUES ($1, $2, 'active', NOW() - INTERVAL '1 hour', NOW())`,
    [dualLearner.id, course.id],
  );
  await linkExternalIdentityManually(db, {
    sourceSystem: "moly",
    externalUserId: "moly:usr:dual_1",
    targetUserId: dualLearner.id,
    actorId: adminUser.id,
  });
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:dual_grant",
    idempotency_key: "idem-dual-grant",
    correlation_id: "corr-dual-grant",
    source_system: "moly",
    external_user_id: "moly:usr:dual_1",
    external_course_id: "moly:crs:iso_offer_a",
    external_grant_id: "moly:grant:dual_a",
    status: "active",
    valid_from: "2026-11-14T11:00:00.000Z",
    source_updated_at: "2026-11-14T11:00:00.000Z",
  });
  await postMolySigned(baseUrl, "/entitlements/revoke", {
    event_id: "moly:evt:dual_rev",
    idempotency_key: "idem-dual-rev",
    correlation_id: "corr-dual-rev",
    source_system: "moly",
    external_user_id: "moly:usr:dual_1",
    external_course_id: "moly:crs:iso_offer_a",
    external_grant_id: "moly:grant:dual_a",
    status: "revoked",
    source_updated_at: "2026-11-14T11:05:00.000Z",
  });
  await processAvailableMolyInboxJobs({ db, workerId: "worker-iso" });

  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: dualLearner.id, courseId: course.id }), true);
  assert.equal(
    (await db.query("SELECT access_status FROM lms_access_grants WHERE user_id = $1 AND course_id = $2", [dualLearner.id, course.id])).rows[0].access_status,
    "active",
  );

  // B) Management revoked account still keeps Moly workspace access if Moly grant is active!
  const mgmtRevokedLearner = (await db.query(
    `INSERT INTO users (username, email, role, is_management_managed, lms_account_status, external_student_id)
     VALUES ('mgmt_rev_stud', 'mgmtrev@csca.local', 'user', TRUE, 'revoked', 'mgmt-rev-2') RETURNING *`,
  )).rows[0];
  await db.query(
    `INSERT INTO lms_access_grants (user_id, course_id, access_status, valid_from, revoked_at, source_updated_at)
     VALUES ($1, $2, 'revoked', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW())`,
    [mgmtRevokedLearner.id, course.id],
  );
  await linkExternalIdentityManually(db, {
    sourceSystem: "moly",
    externalUserId: "moly:usr:mgmt_rev_2",
    targetUserId: mgmtRevokedLearner.id,
    actorId: adminUser.id,
  });
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:evt:mgmt_rev_moly_grant",
    idempotency_key: "idem-mgmt-rev-moly-grant",
    correlation_id: "corr-mgmt-rev-moly-grant",
    source_system: "moly",
    external_user_id: "moly:usr:mgmt_rev_2",
    external_course_id: "moly:crs:iso_offer_a",
    external_grant_id: "moly:grant:mgmt_rev_2_a",
    status: "active",
    valid_from: "2026-11-14T11:10:00.000Z",
    source_updated_at: "2026-11-14T11:10:00.000Z",
  });
  await processAvailableMolyInboxJobs({ db, workerId: "worker-iso" });

  // Middleware must still respect plain Management rule if has_external_lms_access is not set, and resolveEffectiveStudentLmsAccess must return true
  const mgmtRevCookie = await createAuthCookieHeader(mgmtRevokedLearner.id);
  const wsMgmtRevA = await fetch(`${baseUrl}/api/video-courses/profile-${profileA.id}/workspace`, {
    headers: { Cookie: mgmtRevCookie },
  });
  assert.equal(wsMgmtRevA.status, 200, JSON.stringify(await wsMgmtRevA.clone().text()));
  assert.equal(
    (await db.query("SELECT access_status FROM lms_access_grants WHERE user_id = $1", [mgmtRevokedLearner.id])).rows[0].access_status,
    "revoked",
  );
  // Existing Management test invariant: non-managed default user without external grant still fails requireActiveStudentLmsAccess
  assert.equal(hasActiveStudentLmsAccess({ role: "user", is_management_managed: false, lms_account_status: "active" }), false);
  let deniedStatus = null;
  requireActiveStudentLmsAccess(
    { user: { role: "user", is_management_managed: false, lms_account_status: "active" } },
    { status: (c) => ({ json: () => { deniedStatus = c; } }) },
    () => {},
  );
  assert.equal(deniedStatus, 403);
});

test("Codex: scheduled grants retain membership and revocation preserves the surviving grant reference", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);
  const admin = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('scheduled-admin', 'scheduled@test.local', 'admin') RETURNING id",
  )).rows[0];
  const { course, profileA } = await seedCourseWithIndependentProfiles(db, admin.id, "scheduled-course");
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly", externalCourseId: "moly:scheduled-offer",
    localCourseId: course.id, localVideoCourseProfileId: profileA.id,
  });
  const common = { correlation_id: "scheduled", source_system: "moly", external_user_id: "moly:scheduled-user" };
  await postMolySigned(baseUrl, "/users/provision", {
    ...common, event_id: "moly:scheduled-user", idempotency_key: "scheduled-user",
    source_updated_at: "2026-11-14T10:00:00Z",
  });
  await processNextMolyInboxJob({ db });
  const grant = {
    ...common, external_course_id: "moly:scheduled-offer", external_grant_id: "moly:scheduled-grant",
    event_id: "moly:scheduled-grant", idempotency_key: "scheduled-grant",
    valid_from: "2099-01-01T00:00:00Z", source_updated_at: "2026-11-14T10:01:00Z",
  };
  await postMolySigned(baseUrl, "/entitlements/grant", grant);
  assert.equal((await processNextMolyInboxJob({ db })).status, "processed");
  const saved = (await db.query("SELECT * FROM external_entitlements WHERE external_grant_id = $1", [grant.external_grant_id])).rows[0];
  assert.equal((await db.query("SELECT status FROM class_enrollments WHERE user_id = $1", [saved.user_id])).rows[0].status, "active");
  const cookie = await createAuthCookieHeader(saved.user_id);
  const workspace = () => fetch(`${baseUrl}/api/video-courses/profile-${profileA.id}/workspace`, { headers: { Cookie: cookie } });
  assert.equal((await workspace()).status, 403);
  // Move only the validity boundary to simulate arrival of the start date.
  await db.query(
    "UPDATE external_entitlements SET valid_from = '2020-01-01', source_updated_at = source_updated_at + INTERVAL '1 second' WHERE id = $1",
    [saved.id],
  );
  assert.equal((await workspace()).status, 200);
  await postMolySigned(baseUrl, "/entitlements/grant", {
    ...grant, event_id: "moly:second-grant", idempotency_key: "second-grant",
    external_grant_id: "moly:second-grant", valid_from: "2020-01-01T00:00:00Z",
    source_updated_at: "2026-11-14T10:02:00Z",
  });
  await processNextMolyInboxJob({ db });
  await postMolySigned(baseUrl, "/entitlements/revoke", {
    ...common, external_course_id: grant.external_course_id, external_grant_id: "moly:second-grant",
    event_id: "moly:second-revoke", idempotency_key: "second-revoke", source_updated_at: "2026-11-14T10:03:00Z",
  });
  await processNextMolyInboxJob({ db });
  const membership = (await db.query("SELECT * FROM class_enrollments WHERE user_id = $1", [saved.user_id])).rows[0];
  assert.equal(Number(membership.external_entitlement_id), Number(saved.id));
  assert.equal(membership.status, "active");
  assert.equal((await workspace()).status, 200);
});

test("Codex: raw-body verification fails closed", () => {
  const timestamp = new Date().toISOString();
  const body = { event_id: "moly:raw-body" };
  const headers = {
    authorization: `Bearer ${TEST_MOLY_CFG.serviceToken}`,
    "x-integration-key": TEST_MOLY_CFG.integrationKey,
    "x-correlation-id": "raw-body",
    "idempotency-key": "raw-body",
    "x-event-timestamp": timestamp,
    "x-signature": computeMolySignature({ timestamp, rawBody: JSON.stringify(body), secret: TEST_MOLY_CFG.hmacSecret }),
  };
  let response;
  createRequireMolyIntegration({ configOverrides: TEST_MOLY_CFG })(
    { body, headers },
    { status: (status) => ({ json: (result) => { response = { status, ...result }; } }) },
    () => assert.fail("Must not authenticate a reconstructed JSON body"),
  );
  assert.equal(response.errorCode, "RAW_BODY_REQUIRED");
});

test("Codex: reclaimed leases fence stale handlers and failure writes", async (t) => {
  const { db } = await setupMolyTestEnv(t);
  for (const failureRace of [false, true]) {
    const envelope = parseProvisionWirePayload({
      event_id: `moly:fence:${failureRace}`, idempotency_key: `fence-${failureRace}`,
      correlation_id: "fence", source_system: "moly", external_user_id: "moly:fenced-user",
      source_updated_at: "2026-11-14T10:00:00Z",
    });
    const queued = await enqueueMolyIntegrationEvent(db, envelope);
    let transactions = 0;
    let calls = 0;
    const adapter = {
      transaction: async (work) => {
        transactions += 1;
        if (transactions === (failureRace ? 3 : 2)) {
          await db.query(
            "UPDATE integration_inbox SET locked_by = 'replacement', attempt_count = attempt_count + 1 WHERE id = $1",
            [queued.inbox.id],
          );
        }
        return db.transaction(work);
      },
    };
    const outcome = await processNextMolyInboxJob({
      db: adapter,
      handlers: { applyUserProvision: async () => {
        calls += 1;
        throw new Error("Old worker failed");
      } },
    });
    assert.equal(outcome.status, "lease_lost");
    assert.equal(calls, failureRace ? 1 : 0);
    const saved = (await db.query("SELECT * FROM integration_inbox WHERE id = $1", [queued.inbox.id])).rows[0];
    assert.equal(saved.status, "processing");
    assert.equal(saved.locked_by, "replacement");
    assert.equal(saved.last_error_code, null);
  }
});

test("Codex: revoked identity cannot borrow a replacement identity's active status", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);
  const admin = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('identity-admin', 'identity-admin@test.local', 'admin') RETURNING id",
  )).rows[0];
  const { course, profileA } = await seedCourseWithIndependentProfiles(db, admin.id, "identity-binding");
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly", externalCourseId: "moly:binding-offer",
    localCourseId: course.id, localVideoCourseProfileId: profileA.id,
  });
  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:binding-provision", idempotency_key: "binding-provision", correlation_id: "binding",
    source_system: "moly", external_user_id: "moly:old-identity", source_updated_at: "2026-11-14T10:00:00Z",
  });
  await processNextMolyInboxJob({ db });
  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:binding-grant", idempotency_key: "binding-grant", correlation_id: "binding",
    source_system: "moly", external_user_id: "moly:old-identity", external_course_id: "moly:binding-offer",
    external_grant_id: "moly:binding-grant", valid_from: "2020-01-01T00:00:00Z",
    source_updated_at: "2026-11-14T10:01:00Z",
  });
  assert.equal((await processNextMolyInboxJob({ db })).status, "processed");
  const identity = (await db.query("SELECT * FROM external_identities WHERE external_user_id = 'moly:old-identity'")).rows[0];
  await db.query("UPDATE external_identities SET status = 'revoked' WHERE id = $1", [identity.id]);
  await linkExternalIdentityManually(db, {
    externalUserId: "moly:new-identity", targetUserId: identity.user_id,
  });
  assert.equal(await hasActiveExternalLmsAccess(identity.user_id, db), false);
  const ownership = await queryCourseOwnershipForMoly(db, {
    correlation_id: "binding", subject: { external_user_id: "moly:new-identity" },
    external_course_ids: ["moly:binding-offer"],
  });
  assert.equal(ownership.data.items[0].owned, false);
  // Legacy rows without an identity FK must still match the exact external ID.
  await db.query("UPDATE external_entitlements SET external_identity_id = NULL");
  assert.equal(await hasEffectiveCourseEntitlement({ db, userId: identity.user_id, courseId: course.id }), false);
});

test("Day 5: reconciliation snapshot, manual inbox retry, kill switch, and redacted logging", async (t) => {
  const { db, baseUrl } = await setupMolyTestEnv(t);
  const {
    REDACTED,
    redactSensitiveData,
    createIntegrationLogger,
    resetIntegrationMetrics,
    getIntegrationMetricsSnapshot,
  } = await import("./integrationLogger.service.js");
  resetIntegrationMetrics();

  const {
    buildReconciliationSnapshotForMoly,
    retryMolyInboxJob,
  } = await import("./molyIntegration.service.js");

  const admin = (await db.query(
    "INSERT INTO users (username, email, role) VALUES ('day5-admin', 'day5-admin@test.local', 'admin') RETURNING id",
  )).rows[0];
  const { course, profileA } = await seedCourseWithIndependentProfiles(db, admin.id, "day5-recon");
  await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:day5-offer",
    localCourseId: course.id,
    localVideoCourseProfileId: profileA.id,
  });

  await postMolySigned(baseUrl, "/users/provision", {
    event_id: "moly:d5-prov",
    idempotency_key: "d5-prov",
    correlation_id: "corr-d5-1",
    source_system: "moly",
    external_user_id: "moly:d5-user",
    source_updated_at: "2026-11-15T10:00:00Z",
  });
  await processNextMolyInboxJob({ db });

  await postMolySigned(baseUrl, "/entitlements/grant", {
    event_id: "moly:d5-grant",
    idempotency_key: "d5-grant",
    correlation_id: "corr-d5-2",
    source_system: "moly",
    external_user_id: "moly:d5-user",
    external_course_id: "moly:day5-offer",
    external_grant_id: "moly:grant:d5-1",
    valid_from: "2020-01-01T00:00:00Z",
    source_updated_at: "2026-11-15T10:01:00Z",
  });
  assert.equal((await processNextMolyInboxJob({ db })).status, "processed");

  // 1) Reconciliation snapshot includes active grant + mapped course
  const snapRes = await postMolySigned(baseUrl, "/moly/reconciliation/snapshot", {
    correlation_id: "corr-d5-snap",
  });
  assert.equal(snapRes.status, 200);
  assert.equal(snapRes.body.data.complete, true);
  const cappedSnapshot = await buildReconciliationSnapshotForMoly(db, { limit: 1 });
  assert.equal(cappedSnapshot.data.complete, false);
  const foundGrant = snapRes.body.data.entitlements.find((e) => e.external_grant_id === "moly:grant:d5-1");
  assert.equal(foundGrant?.effective_active, true);
  assert.equal(foundGrant?.external_course_id, "moly:day5-offer");

  // 2) Manual retry of a dead_letter inbox event resets & processes cleanly
  const dlqInsert = (await db.query(
    `INSERT INTO integration_inbox (
       source_system, event_id, idempotency_key, correlation_id, event_type,
       payload_hash, payload, source_updated_at, status, attempt_count, max_attempts,
       last_error_code, last_error_message
     ) VALUES (
       'moly', 'moly:d5-dlq-prov', 'd5-dlq-prov', 'corr-d5-dlq', 'user.provisioned',
       $1, $2::jsonb, '2026-11-15T10:02:00Z', 'dead_letter', 5, 5, 'TRANSIENT', 'Downstream failed'
     ) RETURNING id`,
    [
      "a".repeat(64),
      JSON.stringify({
        event_id: "moly:d5-dlq-prov",
        idempotency_key: "d5-dlq-prov",
        correlation_id: "corr-d5-dlq",
        source_system: "moly",
        external_user_id: "moly:d5-dlq-user",
        source_updated_at: "2026-11-15T10:02:00Z",
      }),
    ],
  )).rows[0];

  const retried = await retryMolyInboxJob(db, {
    inboxId: dlqInsert.id,
    actorId: admin.id,
    correlationId: "corr-d5-dlq",
  });
  assert.equal(retried.retried, true);
  assert.equal(retried.inbox.status, "pending");
  assert.equal(retried.inbox.max_attempts > 5, true);
  const processedAfterRetry = await processNextMolyInboxJob({ db });
  assert.equal(processedAfterRetry.status, "processed");

  // 3) Kill switch immediately stops inbox worker, manual retry, snapshot & signed endpoints
  const prevKill = process.env.MOLY_INTEGRATION_SYNC_DISABLED;
  process.env.MOLY_INTEGRATION_SYNC_DISABLED = "true";
  try {
    assert.equal(await processNextMolyInboxJob({ db }), null);
    assert.deepEqual(await processAvailableMolyInboxJobs({ db }), []);
    await assert.rejects(
      () => retryMolyInboxJob(db, { inboxId: dlqInsert.id }),
      (err) => err.statusCode === 503 && err.errorCode === "INTEGRATION_KILL_SWITCH_ACTIVE",
    );
    await assert.rejects(
      () => buildReconciliationSnapshotForMoly(db, { correlation_id: "corr-kill" }),
      (err) => err.statusCode === 503 && err.errorCode === "INTEGRATION_KILL_SWITCH_ACTIVE",
    );
    const blockedProvision = await postMolySigned(baseUrl, "/users/provision", {
      event_id: "moly:d5-blocked",
      idempotency_key: "d5-blocked",
      correlation_id: "corr-d5-kill",
      source_system: "moly",
      external_user_id: "moly:blocked",
      source_updated_at: "2026-11-15T10:03:00Z",
    });
    assert.equal(blockedProvision.status, 503);
    assert.equal(blockedProvision.body.errorCode, "INTEGRATION_KILL_SWITCH_ACTIVE");
  } finally {
    if (prevKill === undefined) delete process.env.MOLY_INTEGRATION_SYNC_DISABLED;
    else process.env.MOLY_INTEGRATION_SYNC_DISABLED = prevKill;
  }

  // 4) Structured logging & redaction checks
  const captured = [];
  const log = createIntegrationLogger({ component: "d5-course-test", sink: (e) => captured.push(e) });
  log.info("sso_exchange_debug", {
    serviceToken: "secret-srv-token",
    hmacSecret: "secret-hmac",
    codeVerifier: "pkce-secret-verifier",
    linkToken: "link-secret-tok",
    authorization: "Bearer jwt-999",
    url: "https://course.test/sso/cb?code=secretCode&token=secretTok&ok=1",
  }, "corr-log-d5");
  const serialized = JSON.stringify(captured[0]);
  assert.equal(captured[0].correlation_id, "corr-log-d5");
  assert.ok(serialized.includes(REDACTED));
  assert.ok(!serialized.includes("secret-srv-token"));
  assert.ok(!serialized.includes("secret-hmac"));
  assert.ok(!serialized.includes("pkce-secret-verifier"));
  assert.ok(!serialized.includes("link-secret-tok"));
  assert.ok(!serialized.includes("secretCode"));
  assert.ok(!serialized.includes("secretTok"));
  assert.equal(redactSensitiveData({ payment_payload: { x: 1 } }).payment_payload, REDACTED);
  assert.ok(typeof getIntegrationMetricsSnapshot().counters === "object");
});
