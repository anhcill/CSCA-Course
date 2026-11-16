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
import { recordVideoWatchProgress } from "./bunnyStream.service.js";
import {
  adoptMolySlotForCourseSso,
  bindMolyDeviceToTrustedSlot,
  buildSignedDeviceSlotProof,
  encodeDeviceSlotProofHeader,
} from "./delegatedDeviceBinding.service.js";
import { emitNativeProgressOutboxEvents } from "./delegatedLearning.service.js";
import {
  establishLoginSession,
  revokeTrustedDevice,
} from "./trustedDevice.service.js";

const TEST_MOLY_CFG = {
  serviceToken: "course-day4-bearer-secret",
  integrationKey: "moly-studio-v2",
  hmacSecret: "course-day4-hmac-secret",
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

const sha256Hex = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const buildSignedRequestHeaders = ({
  method = "POST",
  originalUrl,
  rawBody = "",
  idempotencyKey = null,
  extraHeaders = {},
}) => {
  const timestamp = new Date().toISOString();
  const signature = method === "GET"
    ? computeMolyGetSignature({
        timestamp,
        method,
        originalUrl,
        secret: TEST_MOLY_CFG.hmacSecret,
      })
    : computeMolySignature({
        timestamp,
        rawBody,
        secret: TEST_MOLY_CFG.hmacSecret,
      });

  return {
    Authorization: `Bearer ${TEST_MOLY_CFG.serviceToken}`,
    "X-Integration-Key": TEST_MOLY_CFG.integrationKey,
    "X-Correlation-ID": `corr-d4-${crypto.randomUUID()}`,
    "X-Event-Timestamp": timestamp,
    "X-Signature": signature,
    ...(rawBody ? { "Content-Type": "application/json" } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    ...extraHeaders,
  };
};

async function callV2(baseUrl, { method = "POST", path, body = null, idempotencyKey = undefined, extraHeaders = {} }) {
  const originalUrl = `/api/integrations/v2${path}`;
  const rawBody = body != null ? JSON.stringify(body) : "";
  const effectiveIdemKey = idempotencyKey === undefined
    ? (method !== "GET" ? `d4-idem-${crypto.randomUUID()}` : null)
    : idempotencyKey;
  const headers = buildSignedRequestHeaders({
    method,
    originalUrl,
    rawBody,
    idempotencyKey: effectiveIdemKey,
    extraHeaders,
  });
  const res = await fetch(`${baseUrl}${originalUrl}`, {
    method,
    headers,
    ...(body != null ? { body: rawBody } : {}),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function makeMolyProofHeader({
  externalUserId,
  molyRawToken,
  userAgent = "Mozilla/5.0 Chrome/126.0.0.0",
  ipAddress = "203.0.113.10",
  issuedAt = new Date().toISOString(),
  secret = TEST_MOLY_CFG.hmacSecret,
}) {
  const proof = buildSignedDeviceSlotProof({
    externalUserId,
    molyDeviceTokenHash: sha256Hex(molyRawToken),
    userAgent,
    ipAddress,
    issuedAt,
    secret,
  });
  return {
    hash: sha256Hex(molyRawToken),
    header: encodeDeviceSlotProofHeader(proof),
  };
}

async function setupDay4CourseEnv(t) {
  const pg = new PGlite();
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);

  const prevEnv = {
    MOLY_INTEGRATION_SERVICE_TOKEN: process.env.MOLY_INTEGRATION_SERVICE_TOKEN,
    MOLY_INTEGRATION_KEY: process.env.MOLY_INTEGRATION_KEY,
    MOLY_INTEGRATION_HMAC_SECRET: process.env.MOLY_INTEGRATION_HMAC_SECRET,
    MOLY_DEVICE_PROOF_SECRET: process.env.MOLY_DEVICE_PROOF_SECRET,
    DELEGATED_SESSION_SECRET: process.env.DELEGATED_SESSION_SECRET,
    BUNNY_STREAM_LIBRARY_ID: process.env.BUNNY_STREAM_LIBRARY_ID,
    BUNNY_STREAM_TOKEN_SECURITY_KEY: process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY,
    BUNNY_STREAM_CDN_HOSTNAME: process.env.BUNNY_STREAM_CDN_HOSTNAME,
    BUNNY_STREAM_CDN_TOKEN_SECURITY_KEY: process.env.BUNNY_STREAM_CDN_TOKEN_SECURITY_KEY,
    MOLY_DELEGATED_LEARNING_KILL_SWITCH: process.env.MOLY_DELEGATED_LEARNING_KILL_SWITCH,
    DELEGATED_LEARNING_KILL_SWITCH: process.env.DELEGATED_LEARNING_KILL_SWITCH,
    MOLY_DELEGATED_LEARNING_DISABLED: process.env.MOLY_DELEGATED_LEARNING_DISABLED,
    COURSE_REPAIR_MUTATIONS_DISABLED: process.env.COURSE_REPAIR_MUTATIONS_DISABLED,
    MOLY_INTEGRATION_SYNC_DISABLED: process.env.MOLY_INTEGRATION_SYNC_DISABLED,
  };

  process.env.MOLY_INTEGRATION_SERVICE_TOKEN = TEST_MOLY_CFG.serviceToken;
  process.env.MOLY_INTEGRATION_KEY = TEST_MOLY_CFG.integrationKey;
  process.env.MOLY_INTEGRATION_HMAC_SECRET = TEST_MOLY_CFG.hmacSecret;
  process.env.MOLY_DEVICE_PROOF_SECRET = TEST_MOLY_CFG.hmacSecret;
  process.env.DELEGATED_SESSION_SECRET = "day4-delegated-session-secret";
  process.env.BUNNY_STREAM_LIBRARY_ID = "99001";
  process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY = "bunny-embed-secret-day4";
  process.env.BUNNY_STREAM_CDN_HOSTNAME = "vz-day4.b-cdn.net";
  process.env.BUNNY_STREAM_CDN_TOKEN_SECURITY_KEY = "bunny-cdn-secret-day4";
  delete process.env.MOLY_DELEGATED_LEARNING_KILL_SWITCH;
  delete process.env.DELEGATED_LEARNING_KILL_SWITCH;
  delete process.env.MOLY_DELEGATED_LEARNING_DISABLED;
  delete process.env.COURSE_REPAIR_MUTATIONS_DISABLED;
  delete process.env.MOLY_INTEGRATION_SYNC_DISABLED;

  const teacher = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('teacher_d4', 'teacher_d4@csca.local', 'hash', 'admin')
       RETURNING id`,
    )
  ).rows[0];

  const learner1 = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role, lms_account_status)
       VALUES ('learner_d4_1', 'learner1@csca.local', 'hash', 'user', 'active')
       RETURNING id`,
    )
  ).rows[0];

  const learner2 = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role, lms_account_status)
       VALUES ('learner_d4_2', 'learner2@csca.local', 'hash', 'user', 'active')
       RETURNING id`,
    )
  ).rows[0];

  await pg.query(
    `INSERT INTO external_identities (user_id, source_system, external_user_id, status, source_updated_at)
     VALUES
       ($1, 'moly', 'moly:401', 'active', NOW()),
       ($2, 'moly', 'moly:402', 'active', NOW())`,
    [learner1.id, learner2.id],
  );

  const course = (
    await pg.query(
      `INSERT INTO courses (name, title, slug, description, category, level, author_id, is_published, price)
       VALUES ('CSCA Toan Day 4', 'CSCA Toan Day 4', 'csca-toan-day-4', 'Day 4 test', 'CSCA', 'intermediate', $1, TRUE, 599000)
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  const liveClass = (
    await pg.query(
      `INSERT INTO live_classes (course_id, instructor_id, title, status)
       VALUES ($1, $2, 'Lop Toan Day 4 Mirror', 'active')
       RETURNING id`,
      [course.id, teacher.id],
    )
  ).rows[0];

  const chapter = (
    await pg.query(
      `INSERT INTO class_chapters (live_class_id, title, position, created_by, updated_by)
       VALUES ($1, 'Chuong 1', 1, $2, $2)
       RETURNING id`,
      [liveClass.id, teacher.id],
    )
  ).rows[0];

  const session1 = (
    await pg.query(
      `INSERT INTO class_sessions (live_class_id, chapter_id, title, start_time, end_time, status, is_public_preview)
       VALUES ($1, $2, 'Buoi 1 Co Ban', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '2 hours', 'completed', TRUE)
       RETURNING id`,
      [liveClass.id, chapter.id],
    )
  ).rows[0];

  const session2 = (
    await pg.query(
      `INSERT INTO class_sessions (live_class_id, chapter_id, title, start_time, end_time, status, is_public_preview)
       VALUES ($1, $2, 'Buoi 2 Nang Cao', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 hours', 'completed', FALSE)
       RETURNING id`,
      [liveClass.id, chapter.id],
    )
  ).rows[0];

  const profile = (
    await pg.query(
      `INSERT INTO video_course_profiles (
         course_id, mode, source_live_class_id, management_class_id,
         device_limit, enforce_trusted_devices, allow_file_download, status
       )
       VALUES ($1, 'MIRROR', $2, 'MOLI-CLS-D4', 2, TRUE, TRUE, 'active')
       RETURNING id`,
      [course.id, liveClass.id],
    )
  ).rows[0];

  const asset1 = (
    await pg.query(
      `INSERT INTO video_assets (
         title, provider, provider_library_id, provider_video_id, playback_status,
         duration_seconds, thumbnail_url, uploaded_by, published_at
       )
       VALUES ('Video Buoi 1', 'bunny_stream', '99001', 'guid-buoi-1', 'ready', 100, 'https://vz-day4.b-cdn.net/guid-buoi-1/thumbnail.jpg', $1, NOW())
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  const asset2 = (
    await pg.query(
      `INSERT INTO video_assets (
         title, provider, provider_library_id, provider_video_id, playback_status,
         duration_seconds, thumbnail_url, uploaded_by, published_at
       )
       VALUES ('Video Buoi 2', 'bunny_stream', '99001', 'guid-buoi-2', 'ready', 100, 'https://vz-day4.b-cdn.net/guid-buoi-2/thumbnail.jpg', $1, NOW())
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  const assetProcessing = (
    await pg.query(
      `INSERT INTO video_assets (
         title, provider, provider_library_id, provider_video_id, playback_status,
         duration_seconds, uploaded_by, published_at
       )
       VALUES ('Video Dang Xu Ly', 'bunny_stream', '99001', 'guid-proc', 'processing', 100, $1, NOW())
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  await pg.query(
    `INSERT INTO class_session_videos (class_session_id, video_asset_id, title, video_type, sort_order, is_published, published_at)
     VALUES
       ($1, $2, 'Phan 1 Buoi 1', 'primary', 0, TRUE, NOW()),
       ($3, $4, 'Phan 1 Buoi 2', 'primary', 0, TRUE, NOW())`,
    [session1.id, asset1.id, session2.id, asset2.id],
  );

  const learners = [
    { uid: learner1.id, extId: "moly:401", grantId: "ext-ent-d4-1" },
    { uid: learner2.id, extId: "moly:402", grantId: "ext-ent-d4-2" },
  ];
  for (const { uid, extId, grantId } of learners) {
    await pg.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')`,
      [uid, course.id],
    );
    await pg.query(
      `INSERT INTO external_entitlements (source_system, external_grant_id, external_user_id, external_course_id, user_id, local_course_id, status, valid_from, source_updated_at)
       VALUES ('moly', $1, $2, $3, $4, $5, 'active', NOW() - INTERVAL '1 day', NOW())`,
      [grantId, extId, String(course.id), uid, course.id],
    );
  }

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    "/api/integrations/v2",
    createRequireMolyIntegration(),
    createMolyIntegrationV2Router({ db }),
  );

  const srv = await startServer(app);
  t.after(async () => {
    await stopServer(srv.server);
    await pg.close();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  return {
    pg,
    db,
    baseUrl: srv.baseUrl,
    teacher,
    learner1,
    learner2,
    course,
    liveClass,
    session1,
    session2,
    profile,
    asset1,
    asset2,
    assetProcessing,
  };
}

test("Day 4 cross-app 2-device slot sharing, 3rd browser block, 3rd-strike lock & outbox revocation", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const extUserId = "moly:401";

  // Browser 1 establishes trusted Course session AND links Moly token via Path A SSO -> counts as ONE shared slot
  const courseLogin1 = await establishLoginSession({
    userId: ctx.learner1.id,
    deviceToken: "course_b1_raw_token_day4_1234567890",
    userAgent: "Mozilla/5.0 Chrome/126.0.0.0",
    ipAddress: "203.0.113.10",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    clientFactory: ctx.db.getClient,
  });
  const molyProofB1 = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_b1_raw_token_day4_1234567890",
  });
  const adoptedB1 = await bindMolyDeviceToTrustedSlot({
    db: ctx.db,
    userId: ctx.learner1.id,
    externalUserId: extUserId,
    courseTrustedDeviceId: courseLogin1.trustedDeviceId,
    molyDeviceTokenHash: molyProofB1.hash,
    bindingSource: "sso_browser_tx",
    userAgent: "Mozilla/5.0 Chrome/126.0.0.0",
    ipAddress: "203.0.113.10",
  });
  assert.equal(adoptedB1.trustedDeviceId, courseLogin1.trustedDeviceId);

  // Mint delegated session from Moly using Browser 1 proof -> still reuses slot 1 (total active slots === 1)
  const mintB1 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-b1-1",
    extraHeaders: { "X-Device-Slot-Proof": molyProofB1.header },
    body: {
      externalUserId: extUserId,
      courseId: String(ctx.course.id),
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
      ttlSeconds: 300,
    },
  });
  assert.equal(mintB1.status, 201);
  assert.equal(mintB1.json.data.deviceSlot.trustedDeviceId, Number(courseLogin1.trustedDeviceId));

  const slotCountAfterB1 = Number(
    (await ctx.pg.query(
      `SELECT COUNT(*)::int AS cnt FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL`,
      [ctx.learner1.id],
    )).rows[0].cnt,
  );
  assert.equal(slotCountAfterB1, 1);

  // Browser 2 (Moly only via Path B delegated_proof) consumes slot #2 -> succeeds
  const molyProofB2 = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_b2_raw_token_day4_1234567890",
    userAgent: "Mozilla/5.0 Firefox/127.0",
    ipAddress: "203.0.113.20",
  });
  const mintB2 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-b2-1",
    extraHeaders: { "X-Device-Slot-Proof": molyProofB2.header },
    body: {
      externalUserId: extUserId,
      courseId: String(ctx.course.id),
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
      ttlSeconds: 300,
    },
  });
  assert.equal(mintB2.status, 201);

  const slotCountAfterB2 = Number(
    (await ctx.pg.query(
      `SELECT COUNT(*)::int AS cnt FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL`,
      [ctx.learner1.id],
    )).rows[0].cnt,
  );
  assert.equal(slotCountAfterB2, 2);

  // Verify playback token TTL is clamped <= 60s even when caller requests 900s
  const pbB2 = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: {
      "X-Delegated-Session": mintB2.json.data.sessionToken,
      "X-Device-Slot-Proof": molyProofB2.header,
    },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      ttlSeconds: 900,
    },
  });
  assert.equal(pbB2.status, 200);
  assert.equal(pbB2.json.data.ttlSeconds, 60);
  assert.ok(pbB2.json.data.embedUrl.startsWith("https://iframe.mediadelivery.net/embed/99001/guid-buoi-1?"));
  assert.ok(pbB2.json.data.hlsPlaylistUrl.startsWith("https://vz-day4.b-cdn.net/guid-buoi-1/playlist.m3u8?"));

  // Browser 3 attempts -> strike 1 & 2 return 403 DEVICE_SLOT_LIMIT_REACHED; strike 3 locks account (403 DEVICE_LIMIT_LOCKED)
  const molyProofB3 = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_b3_raw_token_day4_1234567890",
    userAgent: "Mozilla/5.0 Safari/17.5",
    ipAddress: "203.0.113.30",
  });
  const strike1 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-b3-s1",
    extraHeaders: { "X-Device-Slot-Proof": molyProofB3.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play"],
    },
  });
  assert.equal(strike1.status, 403);
  assert.equal(strike1.json.errorCode, "DEVICE_SLOT_LIMIT_REACHED");

  const strike2 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-b3-s2",
    extraHeaders: { "X-Device-Slot-Proof": molyProofB3.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play"],
    },
  });
  assert.equal(strike2.status, 403);
  assert.equal(strike2.json.errorCode, "DEVICE_SLOT_LIMIT_REACHED");

  const strike3 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-b3-s3",
    extraHeaders: { "X-Device-Slot-Proof": molyProofB3.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play"],
    },
  });
  assert.equal(strike3.status, 403);
  assert.equal(strike3.json.errorCode, "DEVICE_LIMIT_LOCKED");

  const lockedUser = (await ctx.pg.query(`SELECT is_locked, locked_reason FROM users WHERE id = $1`, [ctx.learner1.id])).rows[0];
  assert.equal(lockedUser.is_locked, true);

  const lockOutbox = (
    await ctx.pg.query(
      `SELECT event_type, payload FROM course_integration_outbox
       WHERE event_type = 'device.binding.revoked'
       ORDER BY id DESC LIMIT 1`,
    )
  ).rows[0];
  assert.ok(lockOutbox);
  assert.equal(lockOutbox.payload.payload.reason, "device_limit_locked");

  // Locked user can no longer mint playback tokens using earlier session
  const lockedPb = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: {
      "X-Delegated-Session": mintB2.json.data.sessionToken,
      "X-Device-Slot-Proof": molyProofB2.header,
    },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id) },
  });
  assert.ok(lockedPb.status === 401 || lockedPb.status === 403);
});

test("Day 4 proof tampering, admin trusted device revocation, sequential lock, anti-cheat progress, monotonic sequences, and native outbox", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const extUserId = "moly:402";

  const proofA = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_l2_slot_A_token_1234567890",
  });
  const proofB = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_l2_slot_B_token_1234567890",
  });
  const badSigProof = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_l2_slot_A_token_1234567890",
    secret: "wrong-hmac-secret",
  });

  // 1) Bad HMAC proof rejected with 403 UNTRUSTED_DEVICE_PROOF
  const badMint = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "bad-proof-1",
    extraHeaders: { "X-Device-Slot-Proof": badSigProof.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
    },
  });
  assert.equal(badMint.status, 403);
  assert.equal(badMint.json.errorCode, "UNTRUSTED_DEVICE_PROOF");

  // 2) Session minted WITHOUT proof must fail closed on playback-token without proof
  const mintNoProof = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-no-proof",
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
    },
  });
  assert.equal(mintNoProof.status, 201);
  const pbWithoutProof = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: { "X-Delegated-Session": mintNoProof.json.data.sessionToken },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id) },
  });
  assert.equal(pbWithoutProof.status, 403);
  assert.equal(pbWithoutProof.json.errorCode, "UNTRUSTED_DEVICE_PROOF");

  // 3) Valid mint with Proof A, mismatching Proof B on playback -> 403 UNTRUSTED_DEVICE_PROOF; then Admin revokes device -> invalidates session + emits device.binding.revoked
  const mintA = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-proof-a",
    extraHeaders: { "X-Device-Slot-Proof": proofA.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
    },
  });
  assert.equal(mintA.status, 201);

  const pbMismatch = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: {
      "X-Delegated-Session": mintA.json.data.sessionToken,
      "X-Device-Slot-Proof": proofB.header,
    },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id) },
  });
  assert.equal(pbMismatch.status, 403);
  assert.equal(pbMismatch.json.errorCode, "UNTRUSTED_DEVICE_PROOF");

  await revokeTrustedDevice({
    userId: ctx.learner2.id,
    deviceId: mintA.json.data.deviceSlot.trustedDeviceId,
    revokedBy: ctx.teacher.id,
    db: ctx.db,
  });

  const revokeOutbox = (
    await ctx.pg.query(
      `SELECT payload FROM course_integration_outbox WHERE event_type = 'device.binding.revoked' ORDER BY id DESC LIMIT 1`,
    )
  ).rows[0];
  assert.ok(revokeOutbox);
  assert.deepEqual(revokeOutbox.payload.payload.molyDeviceTokenHashes, [proofA.hash]);

  const pbAfterRevoke = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: {
      "X-Delegated-Session": mintA.json.data.sessionToken,
      "X-Device-Slot-Proof": proofA.header,
    },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id) },
  });
  assert.ok(pbAfterRevoke.status === 401 || pbAfterRevoke.status === 403);

  // 4) New slot B -> locked session2 403 UNIT_LOCKED, processing video 409 VIDEO_NOT_READY, sequential progress + anti-cheat + monotonic sequence/timestamp
  const proofC = makeMolyProofHeader({
    externalUserId: extUserId,
    molyRawToken: "moly_l2_slot_C_token_1234567890",
  });
  const mintC = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-proof-c",
    extraHeaders: { "X-Device-Slot-Proof": proofC.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
    },
  });
  assert.equal(mintC.status, 201);
  const tokC = mintC.json.data.sessionToken;

  const lockedPb = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset2.id}/playback-token`,
    extraHeaders: { "X-Delegated-Session": tokC, "X-Device-Slot-Proof": proofC.header },
    body: { unitId: String(ctx.session2.id), profileId: String(ctx.profile.id), ttlSeconds: 45 },
  });
  assert.equal(lockedPb.status, 403);
  assert.equal(lockedPb.json.errorCode, "UNIT_LOCKED");

  await ctx.pg.query(`UPDATE video_assets SET playback_status = 'processing' WHERE id = $1`, [ctx.asset1.id]);
  const procPb = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: { "X-Delegated-Session": tokC, "X-Device-Slot-Proof": proofC.header },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id), ttlSeconds: 45 },
  });
  assert.equal(procPb.status, 409);
  assert.equal(procPb.json.errorCode, "VIDEO_NOT_READY");
  await ctx.pg.query(`UPDATE video_assets SET playback_status = 'ready' WHERE id = $1`, [ctx.asset1.id]);

  // Seek-jump cheat attempt: jump straight to 95s claiming watchedDeltaSeconds=500 -> capped to <=12s first heartbeat allowance
  const baseTs = Date.now() - 120_000;
  const hbCheat = await callV2(ctx.baseUrl, {
    method: "PUT",
    path: `/learning/videos/${ctx.asset1.id}/progress`,
    extraHeaders: { "X-Delegated-Session": tokC },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      currentTimeSeconds: 95,
      watchedDeltaSeconds: 500,
      durationSeconds: 9999,
      clientSequence: 1,
      eventTimestamp: new Date(baseTs).toISOString(),
    },
  });
  assert.equal(hbCheat.status, 200);
  assert.equal(hbCheat.json.data.stale, false);
  assert.ok(hbCheat.json.data.watchedSeconds <= 13);
  assert.equal(hbCheat.json.data.isUnitCompleted, false);

  // Stale clientSequence within same delegated session -> ignored safely
  const hbStaleSeq = await callV2(ctx.baseUrl, {
    method: "PUT",
    path: `/learning/videos/${ctx.asset1.id}/progress`,
    extraHeaders: { "X-Delegated-Session": tokC },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      currentTimeSeconds: 10,
      watchedDeltaSeconds: 10,
      clientSequence: 1,
      eventTimestamp: new Date(baseTs + 10_000).toISOString(),
    },
  });
  assert.equal(hbStaleSeq.status, 200);
  assert.equal(hbStaleSeq.json.data.stale, true);
  assert.equal(hbStaleSeq.json.data.ignoredReason, "STALE_CLIENT_SEQUENCE");

  // Legitimate advancing heartbeats crossing >=50% (while remaining <60%) -> completes session1 & unlocks session2
  const hb2 = await callV2(ctx.baseUrl, {
    method: "PUT",
    path: `/learning/videos/${ctx.asset1.id}/progress`,
    extraHeaders: { "X-Delegated-Session": tokC },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      currentTimeSeconds: 40,
      watchedDeltaSeconds: 28,
      clientSequence: 2,
      eventTimestamp: new Date(baseTs + 30_000).toISOString(),
    },
  });
  assert.equal(hb2.status, 200);
  assert.equal(hb2.json.data.isUnitCompleted, false);

  const hb3 = await callV2(ctx.baseUrl, {
    method: "PUT",
    path: `/learning/videos/${ctx.asset1.id}/progress`,
    extraHeaders: { "X-Delegated-Session": tokC },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      currentTimeSeconds: 52,
      watchedDeltaSeconds: 12,
      clientSequence: 3,
      eventTimestamp: new Date(baseTs + 43_000).toISOString(),
    },
  });
  assert.equal(hb3.status, 200);
  assert.equal(hb3.json.data.stale, false);
  assert.ok(hb3.json.data.completionPercent >= 50);
  assert.ok(hb3.json.data.completionPercent < 60);
  assert.equal(hb3.json.data.isVideoCompleted, true);
  assert.equal(hb3.json.data.isUnitCompleted, true);
  assert.equal(hb3.json.data.units[1].isLocked, false);
  assert.equal(hb3.json.data.courseProgress.completedUnits, 1);

  // Cross-tab stale eventTimestamp using another minted session -> rejected monotonically as STALE_EVENT_TIMESTAMP
  const mintC2 = await callV2(ctx.baseUrl, {
    path: "/learning/sessions",
    idempotencyKey: "mint-proof-c-tab2",
    extraHeaders: { "X-Device-Slot-Proof": proofC.header },
    body: {
      externalUserId: extUserId,
      profileId: String(ctx.profile.id),
      scopes: ["workspace:read", "video:play", "progress:write"],
    },
  });
  const hbStaleTs = await callV2(ctx.baseUrl, {
    method: "PUT",
    path: `/learning/videos/${ctx.asset1.id}/progress`,
    extraHeaders: { "X-Delegated-Session": mintC2.json.data.sessionToken },
    body: {
      unitId: String(ctx.session1.id),
      profileId: String(ctx.profile.id),
      currentTimeSeconds: 5,
      watchedDeltaSeconds: 5,
      clientSequence: 99,
      eventTimestamp: new Date(baseTs + 5_000).toISOString(),
    },
  });
  assert.equal(hbStaleTs.status, 200);
  assert.equal(hbStaleTs.json.data.stale, true);
  assert.equal(hbStaleTs.json.data.ignoredReason, "STALE_EVENT_TIMESTAMP");

  // Outbox received both learning.progress.updated & learning.unit.completed with unlockedNextUnitId
  const progEvents = (
    await ctx.pg.query(
      `SELECT event_type, aggregate_revision, payload FROM course_integration_outbox
       WHERE event_type IN ('learning.progress.updated', 'learning.unit.completed')
       ORDER BY id ASC`,
    )
  ).rows;
  const completedEvt = progEvents.find((e) => e.event_type === "learning.unit.completed");
  assert.ok(completedEvt);
  assert.equal(String(completedEvt.payload.payload.unlockedNextUnitId), String(ctx.session2.id));

  // Session 2 is now unlocked -> playback token returns 200 and session1 token preserves resumePositionSeconds
  const unlockedS2 = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset2.id}/playback-token`,
    extraHeaders: { "X-Delegated-Session": tokC, "X-Device-Slot-Proof": proofC.header },
    body: { unitId: String(ctx.session2.id), profileId: String(ctx.profile.id), ttlSeconds: 30 },
  });
  assert.equal(unlockedS2.status, 200);
  assert.equal(unlockedS2.json.data.ttlSeconds, 30);

  const resumeS1 = await callV2(ctx.baseUrl, {
    path: `/learning/videos/${ctx.asset1.id}/playback-token`,
    extraHeaders: { "X-Delegated-Session": tokC, "X-Device-Slot-Proof": proofC.header },
    body: { unitId: String(ctx.session1.id), profileId: String(ctx.profile.id), ttlSeconds: 30 },
  });
  assert.equal(resumeS1.status, 200);
  assert.equal(resumeS1.json.data.resumePositionSeconds, 52);

  // 5) Native CSCA-Course watch progress triggers outbox event toward Moly
  const nativeRec = await recordVideoWatchProgress({
    userId: ctx.learner2.id,
    videoAssetId: ctx.asset2.id,
    courseId: ctx.course.id,
    liveClassId: ctx.liveClass.id,
    classSessionId: ctx.session2.id,
    currentTimeSeconds: 12,
    watchedDeltaSeconds: 12,
    db: ctx.db,
  });
  const nativeOutbox = await emitNativeProgressOutboxEvents({
    db: ctx.db,
    userId: ctx.learner2.id,
    courseId: ctx.course.id,
    liveClassId: ctx.liveClass.id,
    classSessionId: ctx.session2.id,
    videoAssetId: ctx.asset2.id,
    videoProgress: nativeRec,
    wasCompletedBefore: false,
  });
  assert.equal(nativeOutbox.length, 1);
  assert.equal(nativeOutbox[0].eventType, "learning.progress.updated");
  assert.equal(nativeOutbox[0].payload.unitId, String(ctx.session2.id));
});
