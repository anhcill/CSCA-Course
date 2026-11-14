import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { createMolyIntegrationRouter } from "../router/molyIntegration.router.js";
import { createSsoRouter } from "../router/sso.router.js";
import { computeMolySignature } from "../middleware/requireMolyIntegration.js";
import { buildCourseOutboundSignature, createCourseToMolyClient } from "./courseToMolyClient.js";
import { createMolySsoService } from "./molySso.service.js";
import { buildSsoCallbackUrl, resolveSsoTtlSeconds, validateSsoTargetPath } from "./ssoPathPolicy.service.js";
import { establishLoginSession } from "./trustedDevice.service.js";

const TEST_CFG = {
  // Course inbound credentials (used by Moly -> Course /sso/exchange)
  inboundToken: "moly-to-course-bearer-secret",
  inboundKey: "moly-studio-prod",
  inboundSecret: "moly-to-course-hmac-secret",
  // Course outbound credentials (used by Course -> Moly /sso/exchange)
  outboundToken: "course-to-moly-bearer-secret",
  outboundKey: "csca-course-prod",
  outboundSecret: "course-to-moly-hmac-secret",
  jwtSecret: "csca-day4-sso-jwt-secret",
};

async function loadCourseSchema(db) {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((m) => JSON.parse(m[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
}

async function startServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function parseSetCookies(res) {
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  const map = {};
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      map[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  return { raw, map };
}

function cookieHeaderFrom(map) {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
}

async function setupDay4CourseEnv(t) {
  const db = new PGlite();
  t.after(async () => {
    await db.close();
  });
  await loadCourseSchema(db);

  const prevEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    MOLY_INTEGRATION_SERVICE_TOKEN: process.env.MOLY_INTEGRATION_SERVICE_TOKEN,
    MOLY_INTEGRATION_KEY: process.env.MOLY_INTEGRATION_KEY,
    MOLY_INTEGRATION_HMAC_SECRET: process.env.MOLY_INTEGRATION_HMAC_SECRET,
    MOLY_INTEGRATION_MAX_AGE_SECONDS: process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS,
    MOLY_OUTBOUND_SERVICE_TOKEN: process.env.MOLY_OUTBOUND_SERVICE_TOKEN,
    MOLY_OUTBOUND_INTEGRATION_KEY: process.env.MOLY_OUTBOUND_INTEGRATION_KEY,
    MOLY_OUTBOUND_HMAC_SECRET: process.env.MOLY_OUTBOUND_HMAC_SECRET,
    MOLY_SSO_TTL_SECONDS: process.env.MOLY_SSO_TTL_SECONDS,
    MOLY_WEB_BASE_URL: process.env.MOLY_WEB_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  process.env.JWT_SECRET = TEST_CFG.jwtSecret;
  process.env.MOLY_INTEGRATION_SERVICE_TOKEN = TEST_CFG.inboundToken;
  process.env.MOLY_INTEGRATION_KEY = TEST_CFG.inboundKey;
  process.env.MOLY_INTEGRATION_HMAC_SECRET = TEST_CFG.inboundSecret;
  process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS = "300";
  process.env.MOLY_OUTBOUND_SERVICE_TOKEN = TEST_CFG.outboundToken;
  process.env.MOLY_OUTBOUND_INTEGRATION_KEY = TEST_CFG.outboundKey;
  process.env.MOLY_OUTBOUND_HMAC_SECRET = TEST_CFG.outboundSecret;
  process.env.MOLY_SSO_TTL_SECONDS = "90";
  process.env.MOLY_WEB_BASE_URL = "https://moly.example.test";
  process.env.NODE_ENV = "test";

  const { pool } = await import("../db/connect.js");
  const prevQuery = pool.query;
  const prevConnect = pool.connect;
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({
    query: (sql, params) => db.query(sql, params),
    release() {},
  });

  // Mock Moly Peer HTTP server that verifies inbound HMAC from Course
  let fakeClock = new Date("2026-11-15T10:00:00.000Z");
  const peerCalls = [];
  const boundIdentities = [];
  let exchangeHandler = async () => ({
    status: 401,
    body: { success: false, errorCode: "SSO_CODE_INVALID", message: "Unexpected exchange call" },
  });

  const peerApp = express();
  peerApp.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }));
  peerApp.post("/api/integrations/v1/sso/exchange", async (req, res) => {
    const auth = req.headers.authorization;
    const key = req.headers["x-integration-key"];
    const sig = req.headers["x-signature"];
    const ts = req.headers["x-event-timestamp"] || req.headers["x-timestamp"];
    const expectedSig = buildCourseOutboundSignature({
      timestamp: ts,
      rawBody: req.rawBody,
      secret: TEST_CFG.outboundSecret,
    });
    assert.equal(auth, `Bearer ${TEST_CFG.outboundToken}`);
    assert.equal(key, TEST_CFG.outboundKey);
    assert.equal(sig, expectedSig);
    peerCalls.push({ path: "/sso/exchange", body: req.body });
    const result = await exchangeHandler(req.body);
    return res.status(result.status || 200).json(result.body);
  });
  peerApp.post("/api/integrations/v1/sso/bind-identity", async (req, res) => {
    const sig = req.headers["x-signature"];
    const ts = req.headers["x-event-timestamp"] || req.headers["x-timestamp"];
    const expectedSig = buildCourseOutboundSignature({
      timestamp: ts,
      rawBody: req.rawBody,
      secret: TEST_CFG.outboundSecret,
    });
    assert.equal(sig, expectedSig);
    boundIdentities.push(req.body);
    peerCalls.push({ path: "/sso/bind-identity", body: req.body });
    return res.status(200).json({ success: true, data: { bound: true } });
  });

  const peerSrv = await startServer(peerApp);
  process.env.MOLY_API_BASE_URL = peerSrv.baseUrl;

  const molyClient = createCourseToMolyClient({
    config: {
      apiBaseUrl: peerSrv.baseUrl,
      webBaseUrl: "https://moly.example.test",
      serviceToken: TEST_CFG.outboundToken,
      integrationKey: TEST_CFG.outboundKey,
      hmacSecret: TEST_CFG.outboundSecret,
    },
  });

  const ssoService = createMolySsoService({
    db,
    molyClient,
    now: () => fakeClock,
  });

  const courseApp = express();
  courseApp.use(cookieParser());
  courseApp.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }));
  courseApp.get("/sso/callback", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.status(200).send("<html>callback</html>");
  });
  courseApp.use("/api/auth/sso", createSsoRouter({ ssoService }));
  courseApp.use("/api/integrations/v1", createMolyIntegrationRouter({ ssoService }));

  const courseSrv = await startServer(courseApp);

  t.after(async () => {
    await courseSrv.close();
    await peerSrv.close();
    pool.query = prevQuery;
    pool.connect = prevConnect;
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  return {
    db,
    ssoService,
    courseBaseUrl: courseSrv.baseUrl,
    peerCalls,
    boundIdentities,
    setNow: (date) => {
      fakeClock = date instanceof Date ? date : new Date(date);
    },
    setExchangeHandler: (fn) => {
      exchangeHandler = fn;
    },
  };
}

function signInboundMolyRequest(bodyObj, {
  secret = TEST_CFG.inboundSecret,
  token = TEST_CFG.inboundToken,
  key = TEST_CFG.inboundKey,
  timestamp = new Date().toISOString(),
} = {}) {
  const rawBody = JSON.stringify(bodyObj);
  const signature = computeMolySignature({ timestamp, rawBody, secret });
  return {
    rawBody,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Integration-Key": key,
      "X-Event-Timestamp": timestamp,
      "X-Signature": signature,
      "X-Correlation-ID": crypto.randomUUID(),
    },
  };
}

test("SSO path policy enforces strict 60..120s TTL, fragment delivery (#code), and rejects open redirects", () => {
  assert.equal(resolveSsoTtlSeconds(undefined), 90);
  assert.equal(resolveSsoTtlSeconds(15), 60);
  assert.equal(resolveSsoTtlSeconds(999), 120);
  assert.equal(resolveSsoTtlSeconds(75), 75);

  assert.equal(validateSsoTargetPath("/video-courses/off_101", { targetSystem: "csca-course" }), "/video-courses/off_101");
  assert.equal(validateSsoTargetPath("/khoa-hoc/toan-csca", { targetSystem: "moly" }), "/khoa-hoc/toan-csca");

  for (const badPath of [
    "https://evil.com/phish",
    "//evil.com",
    "/\\evil.com",
    "/%2f%2fevil.com",
    "/admin",
    "/lms/teach",
    "/video-courses/../admin",
    "/courses?code=leak",
    "/courses#frag",
  ]) {
    assert.throws(() => validateSsoTargetPath(badPath, { targetSystem: "csca-course" }));
    assert.throws(() => validateSsoTargetPath(badPath, { targetSystem: "moly" }));
  }

  const url = new URL(buildSsoCallbackUrl({
    webBaseUrl: "https://course.example.com",
    code: "abc_123",
    state: "st_999",
  }));
  assert.equal(url.pathname, "/sso/callback");
  assert.equal(url.search, "");
  const frag = new URLSearchParams(url.hash.slice(1));
  assert.equal(frag.get("code"), "abc_123");
  assert.equal(frag.get("state"), "st_999");
});

test("Happy path: Moly -> Course SSO JIT creates passwordless learner, binds peer identity, and issues native HttpOnly cookies", async (t) => {
  const ctx = await setupDay4CourseEnv(t);

  const usedCodes = new Set();
  ctx.setExchangeHandler(async ({ code, nonce }) => {
    assert.equal(nonce, "state-happy-1");
    if (usedCodes.has(code)) {
      return { status: 409, body: { success: false, errorCode: "SSO_CODE_ALREADY_USED", message: "Replayed" } };
    }
    usedCodes.add(code);
    return {
      status: 200,
      body: {
        success: true,
        data: {
          source_system: "moly",
          source_user_id: "701",
          email: "jit.student@example.com",
          email_verified: true,
          username: "jit_student",
          display_name: "JIT Student",
          role: "student",
          linked_target_user_id: null,
          target_path: "/video-courses/off_101",
          scope_type: "course",
          scoped_local_course_id: 101,
          scoped_external_course_id: "off_101",
          nonce,
        },
      },
    };
  });

  // 1) Callback page sets Referrer-Policy & Cache-Control
  const cbRes = await fetch(`${ctx.courseBaseUrl}/sso/callback`);
  assert.equal(cbRes.status, 200);
  assert.equal(cbRes.headers.get("referrer-policy"), "no-referrer");
  assert.match(cbRes.headers.get("cache-control") || "", /no-store/);

  // 2) POST /api/auth/sso/consume
  const res = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "TestBrowser/1.0 DeviceA" },
    body: JSON.stringify({ code: "raw-moly-code-701", state: "state-happy-1" }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("cache-control") || "", /no-store/);

  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.status, "AUTHENTICATED");
  assert.equal(json.data.redirectPath, "/video-courses/off_101");
  assert.equal(json.data.user.email, "jit.student@example.com");

  const { map: cookies } = parseSetCookies(res);
  assert.ok(cookies.jwt, "must issue native jwt HttpOnly cookie");
  assert.ok(cookies.csca_trusted_device, "must issue native csca_trusted_device cookie");

  // 3) Verify JIT user flags & identity row
  const userRow = (await ctx.db.query("SELECT * FROM users WHERE email = $1", ["jit.student@example.com"])).rows[0];
  assert.equal(userRow.password_hash, null);
  assert.equal(userRow.oauth_provider, "local");
  assert.equal(userRow.is_management_managed, false);
  assert.equal(userRow.lms_account_status, "unmanaged");

  const ident = (await ctx.db.query(
    "SELECT * FROM external_identities WHERE source_system = 'moly' AND external_user_id = 'moly:701'",
  )).rows[0];
  assert.equal(Number(ident.user_id), Number(userRow.id));
  assert.equal(ident.link_method, "sso");
  assert.equal(ident.status, "active");

  // 4) Peer bind-identity sent symmetrically
  assert.equal(ctx.boundIdentities.length, 1);
  assert.equal(ctx.boundIdentities[0].external_user_id, String(userRow.id));
  assert.equal(ctx.boundIdentities[0].target_user_id, "701");

  // 5) Sequential replay blocked with 409 SSO_CODE_ALREADY_USED
  const replayRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "raw-moly-code-701", state: "state-happy-1" }),
  });
  assert.equal(replayRes.status, 409);
  const replayJson = await replayRes.json();
  assert.equal(replayJson.errorCode, "SSO_CODE_ALREADY_USED");
});

test("Course -> Moly outbound SSO: stores code_hash only, blocks concurrent replay, expired codes, bad HMAC, and privileged roles", async (t) => {
  const ctx = await setupDay4CourseEnv(t);

  // Seed active student, admin, and locked student
  const student = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('csca_learner', 'csca.learner@example.com', 'hash', 'user', true, false) RETURNING *`,
  )).rows[0];
  const admin = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('csca_admin', 'csca.admin@example.com', 'hash', 'admin', true, false) RETURNING *`,
  )).rows[0];
  const teacher = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('csca_teacher', 'csca.teacher@example.com', 'hash', 'creator', true, false) RETURNING *`,
  )).rows[0];

  // Privileged users cannot launch outbound SSO
  await assert.rejects(
    () => ctx.ssoService.issueCourseSsoCode({ userId: admin.id, targetPath: "/khoa-hoc" }),
    (err) => err.code === "PRIVILEGED_ROLE_COLLISION" && err.status === 403,
  );
  await assert.rejects(
    () => ctx.ssoService.issueCourseSsoCode({ userId: teacher.id, targetPath: "/khoa-hoc" }),
    (err) => err.code === "PRIVILEGED_ROLE_COLLISION" && err.status === 403,
  );

  // Create valid session cookies for student so HTTP /api/auth/sso/moly/launch can run end-to-end
  const session = await establishLoginSession({
    userId: student.id,
    deviceToken: null,
    ipAddress: "127.0.0.1",
    userAgent: "TestUA",
    expiresAt: new Date(Date.now() + 86400_000),
  });
  assert.ok(session?.deviceToken);
  const jwtLib = await import("jsonwebtoken");
  const studentJwt = jwtLib.default.sign(
    { userId: student.id, role: student.role, sessionId: session.sessionId, sessionToken: session.sessionToken },
    TEST_CFG.jwtSecret,
    { expiresIn: "1d" },
  );

  // Reject open redirect via HTTP /api/auth/sso/moly/launch
  const badLaunchRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/launch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeaderFrom({ jwt: studentJwt, csca_trusted_device: session.deviceToken }),
    },
    body: JSON.stringify({ targetPath: "https://evil.example.com" }),
  });
  assert.equal(badLaunchRes.status, 400);

  // Valid launch via HTTP /api/auth/sso/moly/launch
  const okLaunchRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/launch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeaderFrom({ jwt: studentJwt, csca_trusted_device: session.deviceToken }),
    },
    body: JSON.stringify({ targetPath: "/khoa-hoc/toan-csca" }),
  });
  assert.equal(okLaunchRes.status, 200);
  const okLaunchJson = await okLaunchRes.json();
  assert.ok(okLaunchJson.data.launchUrl.startsWith("https://moly.example.test/sso/callback#"));

  // Mint via service so we have the raw code for S2S /sso/exchange verification
  const issued = await ctx.ssoService.issueCourseSsoCode({
    userId: student.id,
    targetSystem: "moly",
    targetPath: "/khoa-hoc/toan-csca",
  });
  assert.ok(issued.launchUrl.startsWith("https://moly.example.test/sso/callback#"));
  assert.ok(!issued.launchUrl.includes("?code="), "must never leak code in query params");
  assert.equal(issued.expiresInSeconds, 90);

  // Verify raw code is NEVER stored in DB
  const rows = (await ctx.db.query("SELECT code_hash, nonce FROM integration_sso_codes ORDER BY id DESC")).rows;
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].code_hash, issued.code);
  assert.equal(rows[0].code_hash, crypto.createHash("sha256").update(issued.code).digest("hex"));

  // Tampered HMAC signature on S2S /sso/exchange rejected
  const tamperedSigned = signInboundMolyRequest({ code: issued.code, nonce: issued.state, consumer_system: "moly" }, { secret: "wrong-secret" });
  const badSigRes = await fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
    method: "POST",
    headers: tamperedSigned.headers,
    body: tamperedSigned.rawBody,
  });
  assert.equal(badSigRes.status, 401);

  // Concurrent 5x replay against S2S /sso/exchange: strictly 1 succeeds, 4 get 409 SSO_CODE_ALREADY_USED
  const validReq = signInboundMolyRequest({ code: issued.code, nonce: issued.state, consumer_system: "moly" });
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
        method: "POST",
        headers: validReq.headers,
        body: validReq.rawBody,
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    ),
  );
  const succeeded = results.filter((r) => r.status === 200);
  const replayed = results.filter((r) => r.status === 409 && r.body.errorCode === "SSO_CODE_ALREADY_USED");
  assert.equal(succeeded.length, 1);
  assert.equal(replayed.length, 4);
  assert.equal(succeeded[0].body.data.source_user_id, String(student.id));
  assert.equal(succeeded[0].body.data.role, "student");

  // Expired code (> 90s TTL) fails with 401 SSO_CODE_EXPIRED
  const issued2 = await ctx.ssoService.issueCourseSsoCode({
    userId: student.id,
    targetSystem: "moly",
    targetPath: "/khoa-hoc",
  });
  ctx.setNow(new Date("2026-11-15T10:02:00.000Z")); // +120s > 90s
  const expReq = signInboundMolyRequest({ code: issued2.code, nonce: issued2.state, consumer_system: "moly" });
  const expRes = await fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
    method: "POST",
    headers: expReq.headers,
    body: expReq.rawBody,
  });
  assert.equal(expRes.status, 401);
  assert.equal((await expRes.json()).errorCode, "SSO_CODE_EXPIRED");
});

test("Safe Linking vs auto-merge prohibition + wrong/right password + active session + privileged email collision", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const passwordHash = await bcrypt.hash("CorrectPass99!", 6);

  // 1) Existing unlinked Course student sharing email
  const existingLearner = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('legacy_student', 'collision@example.com', $1, 'user', true, false) RETURNING *`,
    [passwordHash],
  )).rows[0];

  // 2) Existing Course teacher sharing another email
  await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('course_prof', 'prof@example.com', $1, 'creator', true, false)`,
    [passwordHash],
  );

  // Privileged email collision -> 403 PRIVILEGED_ROLE_COLLISION (even if Moly role says student)
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "888",
        email: "prof@example.com",
        email_verified: true,
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));
  const privRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "code-priv", state: "state-priv" }),
  });
  assert.equal(privRes.status, 403);
  assert.equal((await privRes.json()).errorCode, "PRIVILEGED_ROLE_COLLISION");
  assert.equal(parseSetCookies(privRes).raw.length, 0);

  // Unlinked learner collision -> NEVER auto-merges; returns LINK_REQUIRED without cookies
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "777",
        email: "collision@example.com",
        email_verified: true,
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));
  const linkReqRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "code-col-1", state: "state-col-1" }),
  });
  assert.equal(linkReqRes.status, 200);
  const linkReqJson = await linkReqRes.json();
  assert.equal(linkReqJson.data.status, "LINK_REQUIRED");
  assert.ok(linkReqJson.data.linkToken);
  assert.equal(linkReqJson.data.hasPassword, true);
  assert.equal(parseSetCookies(linkReqRes).raw.length, 0, "must NEVER issue session cookies before verification");

  const openConflict = (await ctx.db.query(
    "SELECT * FROM integration_conflicts WHERE external_user_id = 'moly:777' AND conflict_type = 'IDENTITY_EMAIL_COLLISION'",
  )).rows[0];
  assert.equal(openConflict.status, "open");

  // Wrong password -> 401 INVALID_CREDENTIALS
  const wrongPassRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/link/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkToken: linkReqJson.data.linkToken, password: "WrongPassword!" }),
  });
  assert.equal(wrongPassRes.status, 401);
  assert.equal(parseSetCookies(wrongPassRes).raw.length, 0);

  // Right password -> binds identity, resolves conflict, sets HttpOnly cookies, notifies peer
  const rightPassRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/link/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "SafeLinkUA/1.0" },
    body: JSON.stringify({ linkToken: linkReqJson.data.linkToken, password: "CorrectPass99!" }),
  });
  assert.equal(rightPassRes.status, 200);
  const rightPassJson = await rightPassRes.json();
  assert.equal(rightPassJson.data.status, "AUTHENTICATED");
  assert.equal(Number(rightPassJson.data.user.id), Number(existingLearner.id));
  assert.ok(parseSetCookies(rightPassRes).map.jwt);
  assert.ok(parseSetCookies(rightPassRes).map.csca_trusted_device);

  const resolvedConflict = (await ctx.db.query(
    "SELECT status FROM integration_conflicts WHERE id = $1",
    [openConflict.id],
  )).rows[0];
  assert.equal(resolvedConflict.status, "resolved");

  // Reusing consumed linkToken fails
  const reuseRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/link/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkToken: linkReqJson.data.linkToken, password: "CorrectPass99!" }),
  });
  assert.equal(reuseRes.status, 400);

  // Active-session safe linking (when user already holds valid jwt + trusted device cookies)
  const noPassLearner = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('oauth_learner', 'active.session@example.com', NULL, 'user', true, false) RETURNING *`,
  )).rows[0];
  const activeSession = await establishLoginSession({
    userId: noPassLearner.id,
    deviceToken: null,
    ipAddress: "127.0.0.1",
    userAgent: "ExistingDevice",
    expiresAt: new Date(Date.now() + 86400_000),
  });
  const jwtModule = await import("jsonwebtoken");
  const activeJwt = jwtModule.default.sign(
    {
      userId: noPassLearner.id,
      role: noPassLearner.role,
      sessionId: activeSession.sessionId,
      sessionToken: activeSession.sessionToken,
    },
    TEST_CFG.jwtSecret,
    { expiresIn: "1d" },
  );
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "778",
        email: "active.session@example.com",
        email_verified: true,
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));
  const col2Res = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "code-col-2", state: "state-col-2" }),
  });
  const col2Json = await col2Res.json();
  assert.equal(col2Json.data.status, "LINK_REQUIRED");

  const confirmWithSession = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/link/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeaderFrom({ jwt: activeJwt, csca_trusted_device: activeSession.deviceToken }),
      "User-Agent": "ExistingDevice",
    },
    body: JSON.stringify({ linkToken: col2Json.data.linkToken }),
  });
  assert.equal(confirmWithSession.status, 200);
  const sessJson = await confirmWithSession.json();
  assert.equal(sessJson.data.status, "AUTHENTICATED");
  assert.equal(Number(sessJson.data.user.id), Number(noPassLearner.id));
});

test("Revoked user/identity/entitlement are blocked and Course 2-device limit + lock is enforced across SSO logins", async (t) => {
  const ctx = await setupDay4CourseEnv(t);

  // Revoked identity blocked
  const revUser = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('revoked_u', 'revoked@example.com', NULL, 'user', true, false) RETURNING *`,
  )).rows[0];
  await ctx.db.query(
    `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
     VALUES ('moly', 'moly:901', $1, 'revoked', NOW())`,
    [revUser.id],
  );
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "901",
        email: "revoked@example.com",
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));
  const revRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "code-rev-1", state: "state-rev-1" }),
  });
  assert.equal(revRes.status, 403);
  assert.equal((await revRes.json()).errorCode, "SSO_IDENTITY_REVOKED");

  // Course 2-device limit across SSO logins
  const devUser = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('dev_u', 'devices@example.com', NULL, 'user', true, false) RETURNING *`,
  )).rows[0];
  await ctx.db.query(
    `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
     VALUES ('moly', 'moly:902', $1, 'active', NOW())`,
    [devUser.id],
  );

  let seq = 0;
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "902",
        email: "devices@example.com",
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));

  // Device 1 & Device 2 succeed
  for (const ua of ["Device-Alpha", "Device-Beta"]) {
    seq += 1;
    const okRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ua },
      body: JSON.stringify({ code: `code-dev-${seq}`, state: `state-dev-${seq}` }),
    });
    assert.equal(okRes.status, 200);
  }

  // Device 3 rejected with 403 DEVICE_LIMIT_REACHED and details.devices listed; attempts incremented to 3 without auto-lock
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    seq += 1;
    const blockedRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `Device-Rogue-${attempt}` },
      body: JSON.stringify({ code: `code-dev-${seq}`, state: `state-dev-${seq}` }),
    });
    assert.equal(blockedRes.status, 403);
    const blockedJson = await blockedRes.json();
    assert.ok(blockedJson.details?.devices?.length === 2);
    assert.equal(blockedJson.errorCode, "DEVICE_LIMIT_REACHED");
  }

  const devStateRow = (await ctx.db.query(
    "SELECT is_locked, device_limit_attempts FROM users WHERE id = $1",
    [devUser.id],
  )).rows[0];
  assert.equal(devStateRow.is_locked, false);
  assert.equal(Number(devStateRow.device_limit_attempts), 3);
});
