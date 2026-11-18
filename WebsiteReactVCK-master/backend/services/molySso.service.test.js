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
import {
  buildSsoCallbackUrl,
  computePkceChallengeS256,
  generatePkceVerifier,
  resolveSsoTtlSeconds,
  validateSsoTargetPath,
} from "./ssoPathPolicy.service.js";
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

function createCourseFetchAgent(baseUrl) {
  const jar = new Map();
  const updateJar = (res) => {
    const rawCookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
    for (const entry of rawCookies) {
      const [pair] = entry.split(";");
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (!val || val === '""' || /max-age=0|expires=thu,\s*01\s+jan\s+1970/i.test(entry)) {
        jar.delete(name);
      } else {
        jar.set(name, val);
      }
    }
  };
  const request = async (path, { method = "GET", headers = {}, body } = {}) => {
    const cookieStr = Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
    const mergedHeaders = { ...headers };
    if (cookieStr) {
      mergedHeaders.Cookie = mergedHeaders.Cookie ? `${mergedHeaders.Cookie}; ${cookieStr}` : cookieStr;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: mergedHeaders,
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
      redirect: "manual",
    });
    updateJar(res);
    return res;
  };
  const startSso = async ({ targetPath = "/courses" } = {}) => {
    const res = await request("/api/auth/sso/moly/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { targetPath },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const authUrl = new URL(json.data.authorizeUrl);
    return {
      state: authUrl.searchParams.get("state"),
      codeChallenge: authUrl.searchParams.get("code_challenge"),
      codeChallengeMethod: authUrl.searchParams.get("code_challenge_method"),
      targetPath: json.data.targetPath,
      authorizeUrl: json.data.authorizeUrl,
    };
  };
  return { jar, request, startSso };
}

test("Happy path: Moly -> Course SSO JIT creates passwordless learner, binds peer identity, and issues native HttpOnly cookies", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const agentA = createCourseFetchAgent(ctx.courseBaseUrl);

  const usedCodes = new Set();
  const seenExchange = [];
  let expectedState = null;
  ctx.setExchangeHandler(async ({ code, nonce, code_verifier }) => {
    seenExchange.push({ code, nonce, code_verifier });
    assert.equal(nonce, expectedState);
    assert.ok(code_verifier && code_verifier.length >= 43);
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
          target_path: "/courses",
          scope_type: "account",
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

  // 2) Destination-initiated browser PKCE transaction + POST /api/auth/sso/consume
  const tx1 = await agentA.startSso({ targetPath: "/courses" });
  expectedState = tx1.state;
  assert.equal(tx1.codeChallengeMethod, "S256");
  assert.ok(tx1.codeChallenge && tx1.state);

  const res = await agentA.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "TestBrowser/1.0 DeviceA" },
    body: { code: "raw-moly-code-701", state: tx1.state },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("cache-control") || "", /no-store/);

  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.status, "AUTHENTICATED");
  assert.equal(json.data.redirectPath, "/courses");
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

  // 5) Same-tx replay blocked (tx cookie cleared/single-use) AND fresh tx still hits 409 SSO_CODE_ALREADY_USED
  const sameTxReplay = await agentA.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "raw-moly-code-701", state: tx1.state },
  });
  assert.equal(sameTxReplay.status, 403);
  assert.equal((await sameTxReplay.json()).errorCode, "SSO_BROWSER_BINDING_REQUIRED");

  const txReplay = await agentA.startSso({ targetPath: "/courses" });
  expectedState = txReplay.state;
  const replayRes = await agentA.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "raw-moly-code-701", state: txReplay.state },
  });
  assert.equal(replayRes.status, 409);
  const replayJson = await replayRes.json();
  assert.equal(replayJson.errorCode, "SSO_CODE_ALREADY_USED");
});

test("Course -> Moly outbound SSO: stores code_hash only, supports an isolated admin learner persona, and blocks unsafe privileged roles", async (t) => {
  const ctx = await setupDay4CourseEnv(t);

  // Seed active student and admin/creator
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

  // Legacy non-PKCE helper rejects fail-closed
  await assert.rejects(
    () => ctx.ssoService.issueCourseSsoCode({ userId: student.id, targetPath: "/khoa-hoc" }),
    (err) => err.code === "SSO_PKCE_REQUIRED" && err.status === 400,
  );

  // Creators/staff remain blocked; admins use a least-privilege learner persona below.
  await assert.rejects(
    () => ctx.ssoService.authorizeMolySsoRequest({
      userId: teacher.id,
      state: "teacher-pkce-state",
      codeChallenge: computePkceChallengeS256(generatePkceVerifier()),
      codeChallengeMethod: "S256",
      targetPath: "/khoa-hoc",
    }),
    (err) => err.code === "PRIVILEGED_ROLE_COLLISION" && err.status === 403,
  );

  // Create valid session cookies for student so HTTP /api/auth/sso/moly/intent & /authorize can run end-to-end
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
  const studentCookie = cookieHeaderFrom({ jwt: studentJwt, csca_trusted_device: session.deviceToken });

  // Disabled legacy POST /api/auth/sso/moly/launch returns 400 SSO_PKCE_REQUIRED
  const legacyRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: studentCookie },
    body: JSON.stringify({ targetPath: "/khoa-hoc/toan-csca" }),
  });
  assert.equal(legacyRes.status, 400);
  assert.equal((await legacyRes.json()).errorCode, "SSO_PKCE_REQUIRED");

  // Reject open redirect via HTTP /api/auth/sso/moly/authorize
  const badLaunchRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: studentCookie },
    body: JSON.stringify({
      state: "bad-redir-state-001",
      codeChallenge: computePkceChallengeS256(generatePkceVerifier()),
      codeChallengeMethod: "S256",
      targetPath: "https://evil.example.com",
    }),
  });
  assert.equal(badLaunchRes.status, 400);
  assert.equal((await badLaunchRes.json()).errorCode, "INVALID_SSO_TARGET_PATH");

  // Intent + Authorize via HTTP /api/auth/sso/moly/intent & /authorize
  const intentRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: studentCookie },
    body: JSON.stringify({ targetPath: "/khoa-hoc/toan-csca" }),
  });
  assert.equal(intentRes.status, 200);
  assert.match((await intentRes.json()).data.destinationStartUrl, /\/sso\/start/);

  const verifier1 = generatePkceVerifier();
  const challenge1 = computePkceChallengeS256(verifier1);
  const okLaunchRes = await fetch(`${ctx.courseBaseUrl}/api/auth/sso/moly/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: studentCookie },
    body: JSON.stringify({
      state: "http-auth-state-1",
      codeChallenge: challenge1,
      codeChallengeMethod: "S256",
      targetPath: "/khoa-hoc/toan-csca",
    }),
  });
  assert.equal(okLaunchRes.status, 200);
  const okLaunchJson = await okLaunchRes.json();
  assert.ok(okLaunchJson.data.launchUrl.startsWith("https://moly.example.test/sso/callback#"));

  // Mint via service so we have the raw code for S2S /sso/exchange verification
  const verifier2 = generatePkceVerifier();
  const challenge2 = computePkceChallengeS256(verifier2);
  const issued = await ctx.ssoService.authorizeMolySsoRequest({
    userId: student.id,
    state: "svc-auth-state-2",
    codeChallenge: challenge2,
    codeChallengeMethod: "S256",
    targetSystem: "moly",
    targetPath: "/khoa-hoc/toan-csca",
  });
  assert.ok(issued.launchUrl.startsWith("https://moly.example.test/sso/callback#"));
  assert.ok(!issued.launchUrl.includes("?code="), "must never leak code in query params");
  assert.equal(issued.expiresInSeconds, 90);

  // Verify raw code is NEVER stored in DB and PKCE S256 challenge IS persisted
  const rows = (await ctx.db.query("SELECT code_hash, nonce, pkce_challenge, pkce_method FROM integration_sso_codes ORDER BY id DESC")).rows;
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].code_hash, issued.code);
  assert.equal(rows[0].code_hash, crypto.createHash("sha256").update(issued.code).digest("hex"));
  assert.equal(rows[0].pkce_challenge, challenge2);
  assert.equal(rows[0].pkce_method, "S256");

  // Tampered HMAC signature on S2S /sso/exchange rejected
  const tamperedSigned = signInboundMolyRequest(
    { code: issued.code, nonce: issued.state, code_verifier: verifier2, consumer_system: "moly" },
    { secret: "wrong-secret" },
  );
  const badSigRes = await fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
    method: "POST",
    headers: tamperedSigned.headers,
    body: tamperedSigned.rawBody,
  });
  assert.equal(badSigRes.status, 401);

  // Concurrent 5x replay against S2S /sso/exchange: strictly 1 succeeds, 4 get 409 SSO_CODE_ALREADY_USED
  const validReq = signInboundMolyRequest({
    code: issued.code,
    nonce: issued.state,
    code_verifier: verifier2,
    consumer_system: "moly",
  });
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

  const adminVerifier = generatePkceVerifier();
  const adminIssued = await ctx.ssoService.authorizeMolySsoRequest({
    userId: admin.id,
    state: "admin-learning-persona-state",
    codeChallenge: computePkceChallengeS256(adminVerifier),
    codeChallengeMethod: "S256",
    targetPath: "/khoa-hoc",
  });
  const adminExchange = await ctx.ssoService.exchangeCourseSsoCode({
    code: adminIssued.code,
    nonce: adminIssued.state,
    codeVerifier: adminVerifier,
    consumerSystem: "moly",
  });
  assert.equal(adminExchange.role, "student");
  assert.equal(adminExchange.source_role, "admin");
  assert.equal(adminExchange.learning_persona, true);
  assert.equal(adminExchange.email, admin.email.toLowerCase());

  const adminBind = await ctx.ssoService.bindPeerIdentityFromMoly({
    externalUserId: "moly:99001",
    targetUserId: admin.id,
    email: admin.email,
    learningPersona: true,
  });
  assert.equal(adminBind.bound, true);

  // Expired code (> 90s TTL) fails with 401 SSO_CODE_EXPIRED
  const verifier3 = generatePkceVerifier();
  const issued2 = await ctx.ssoService.authorizeMolySsoRequest({
    userId: student.id,
    state: "svc-exp-state-003",
    codeChallenge: computePkceChallengeS256(verifier3),
    codeChallengeMethod: "S256",
    targetSystem: "moly",
    targetPath: "/khoa-hoc",
  });
  ctx.setNow(new Date("2026-11-15T10:02:00.000Z")); // +120s > 90s
  const expReq = signInboundMolyRequest({
    code: issued2.code,
    nonce: issued2.state,
    code_verifier: verifier3,
    consumer_system: "moly",
  });
  const expRes = await fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
    method: "POST",
    headers: expReq.headers,
    body: expReq.rawBody,
  });
  assert.equal(expRes.status, 401);
  assert.equal((await expRes.json()).errorCode, "SSO_CODE_EXPIRED");
});

test("Verified email linking + Safe Linking fallback + active session + privileged email collision", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const passwordHash = await bcrypt.hash("CorrectPass99!", 6);

  // 1) Existing unlinked Course student sharing email
  const existingLearner = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('legacy_student', 'collision@example.com', $1, 'user', false, false) RETURNING *`,
    [passwordHash],
  )).rows[0];
  const verifiedLearner = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('verified_student', 'verified.both@example.com', $1, 'user', true, false) RETURNING *`,
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
  const privAgent = createCourseFetchAgent(ctx.courseBaseUrl);
  const privTx = await privAgent.startSso({ targetPath: "/courses" });
  const privRes = await privAgent.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-priv", state: privTx.state },
  });
  assert.equal(privRes.status, 403);
  assert.equal((await privRes.json()).errorCode, "PRIVILEGED_ROLE_COLLISION");
  assert.ok(!parseSetCookies(privRes).map.jwt, "must not issue session jwt cookie on rejected login");

  // Course and Moly ids remain independent. A verified exact email match
  // links the existing Course learner and preserves that local account.
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200,
    body: {
      success: true,
      data: {
        source_system: "moly",
        source_user_id: "779",
        email: "verified.both@example.com",
        email_verified: true,
        role: "student",
        target_path: "/courses",
        nonce,
      },
    },
  }));
  const verifiedAgent = createCourseFetchAgent(ctx.courseBaseUrl);
  const verifiedTx = await verifiedAgent.startSso({ targetPath: "/courses" });
  const verifiedRes = await verifiedAgent.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-verified-email", state: verifiedTx.state },
  });
  assert.equal(verifiedRes.status, 200);
  const verifiedJson = await verifiedRes.json();
  assert.equal(verifiedJson.data.status, "AUTHENTICATED");
  assert.equal(Number(verifiedJson.data.user.id), Number(verifiedLearner.id));
  assert.equal((await ctx.db.query(
    "SELECT link_method FROM external_identities WHERE external_user_id = 'moly:779'",
  )).rows[0].link_method, "auto_safe_link");

  // If either side is not verified, require explicit owner verification.
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
  const agentA = createCourseFetchAgent(ctx.courseBaseUrl);
  const colTx = await agentA.startSso({ targetPath: "/courses" });
  const linkReqRes = await agentA.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-col-1", state: colTx.state },
  });
  assert.equal(linkReqRes.status, 200);
  const linkReqJson = await linkReqRes.json();
  assert.equal(linkReqJson.data.status, "LINK_REQUIRED");
  assert.ok(linkReqJson.data.linkToken);
  assert.equal(linkReqJson.data.hasPassword, true);
  assert.ok(!parseSetCookies(linkReqRes).map.jwt, "must NEVER issue session jwt before verification");
  assert.ok(parseSetCookies(linkReqRes).map.csca_sso_link, "must bind link challenge to initiating browser");

  // Refresh status endpoint on initiating browser
  const linkStatusRes = await agentA.request("/api/auth/sso/link/status");
  assert.equal(linkStatusRes.status, 200);
  const linkStatusJson = await linkStatusRes.json();
  assert.equal(linkStatusJson.data.status, "LINK_REQUIRED");
  assert.equal(linkStatusJson.data.email, "collision@example.com");
  assert.equal(linkStatusJson.data.hasPassword, true);

  const openConflict = (await ctx.db.query(
    "SELECT * FROM integration_conflicts WHERE external_user_id = 'moly:777' AND conflict_type = 'IDENTITY_EMAIL_COLLISION'",
  )).rows[0];
  assert.equal(openConflict.status, "open");

  // Wrong password -> 401 INVALID_CREDENTIALS
  const wrongPassRes = await agentA.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { linkToken: linkReqJson.data.linkToken, password: "WrongPassword!" },
  });
  assert.equal(wrongPassRes.status, 401);
  assert.ok(!parseSetCookies(wrongPassRes).map.jwt);

  // Right password -> binds identity, resolves conflict, sets HttpOnly cookies, notifies peer
  const rightPassRes = await agentA.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "SafeLinkUA/1.0" },
    body: { linkToken: linkReqJson.data.linkToken, password: "CorrectPass99!" },
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

  // Reusing consumed linkToken fails after cookie clear + completion
  const reuseRes = await agentA.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { linkToken: linkReqJson.data.linkToken, password: "CorrectPass99!" },
  });
  assert.equal(reuseRes.status, 403);
  assert.equal((await reuseRes.json()).errorCode, "SSO_BROWSER_BINDING_REQUIRED");

  // Active-session safe linking (when user already holds valid jwt + trusted device cookies)
  const noPassLearner = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('oauth_learner', 'active.session@example.com', NULL, 'user', false, false) RETURNING *`,
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
  const agentSess = createCourseFetchAgent(ctx.courseBaseUrl);
  const col2Tx = await agentSess.startSso({ targetPath: "/courses" });
  const col2Res = await agentSess.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-col-2", state: col2Tx.state },
  });
  const col2Json = await col2Res.json();
  assert.equal(col2Json.data.status, "LINK_REQUIRED");

  const confirmWithSession = await agentSess.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeaderFrom({ jwt: activeJwt, csca_trusted_device: activeSession.deviceToken }),
      "User-Agent": "ExistingDevice",
    },
    body: { linkToken: col2Json.data.linkToken },
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
  const revAgent = createCourseFetchAgent(ctx.courseBaseUrl);
  const revTx = await revAgent.startSso({ targetPath: "/courses" });
  const revRes = await revAgent.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-rev-1", state: revTx.state },
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
    const devAgent = createCourseFetchAgent(ctx.courseBaseUrl);
    const devTx = await devAgent.startSso({ targetPath: "/courses" });
    const okRes = await devAgent.request("/api/auth/sso/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ua },
      body: { code: `code-dev-${seq}`, state: devTx.state },
    });
    assert.equal(okRes.status, 200);
  }

  // Device 3 rejected with 403 DEVICE_LIMIT_REACHED and details.devices listed; attempts incremented to 3 without auto-lock
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    seq += 1;
    const rogueAgent = createCourseFetchAgent(ctx.courseBaseUrl);
    const rogueTx = await rogueAgent.startSso({ targetPath: "/courses" });
    const blockedRes = await rogueAgent.request("/api/auth/sso/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `Device-Rogue-${attempt}` },
      body: { code: `code-dev-${seq}`, state: rogueTx.state },
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

test("Codex: identity state, response binding, verification flags and durable conflict rejection", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const agent = createCourseFetchAgent(ctx.courseBaseUrl);
  const assertion = {
    source_system: "moly", source_user_id: "9501", email: "codex-unverified@test.local",
    email_verified: false, role: "student", target_path: "/courses",
  };
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200, body: { success: true, data: { ...assertion, nonce } },
  }));
  const consumeWithTx = async (code) => {
    const tx = await agent.startSso({ targetPath: "/courses" });
    return agent.request("/api/auth/sso/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Codex" },
      body: { code, state: tx.state },
    });
  };
  const loginRes = await consumeWithTx("codex-code-1");
  assert.equal(loginRes.status, 200);
  const userId = (await loginRes.json()).data.user.id;
  assert.equal((await ctx.db.query("SELECT email_verified FROM users WHERE id=$1", [userId])).rows[0].email_verified, false);
  await ctx.db.query("UPDATE external_identities SET status='expired' WHERE user_id=$1", [userId]);
  const expiredRes = await consumeWithTx("codex-code-2");
  assert.equal(expiredRes.status, 403);
  assert.equal((await expiredRes.json()).errorCode, "SSO_IDENTITY_REVOKED");
  ctx.setExchangeHandler(async () => ({
    status: 200, body: { success: true, data: { ...assertion, nonce: "other-browser-state" } },
  }));
  const mismatchRes = await consumeWithTx("codex-code-3");
  assert.equal((await mismatchRes.json()).errorCode, "SSO_INVALID_RESPONSE");

  await ctx.db.query("UPDATE users SET management_staff_source_id='staff-codex' WHERE id=$1", [userId]);
  await assert.rejects(() => ctx.ssoService.authorizeMolySsoRequest({
    userId,
    state: "codex-priv-state-001",
    codeChallenge: computePkceChallengeS256(generatePkceVerifier()),
    codeChallengeMethod: "S256",
  }), (e) => e.code === "PRIVILEGED_ROLE_COLLISION");
  assertion.source_user_id = "9502";
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200, body: { success: true, data: { ...assertion, nonce } },
  }));
  const privColRes = await consumeWithTx("codex-code-4");
  assert.equal(privColRes.status, 403);
  assert.equal((await privColRes.json()).errorCode, "PRIVILEGED_ROLE_COLLISION");
  const conflicts = (await ctx.db.query(
    "SELECT * FROM integration_conflicts WHERE external_user_id='moly:9502'",
  )).rows;
  assert.equal(conflicts.length, 1, "security conflict survives rejected provisioning transaction");

  await ctx.db.query("UPDATE users SET management_staff_source_id=NULL WHERE id=$1", [userId]);
  assertion.source_user_id = "9503";
  const challengeRes = await consumeWithTx("codex-code-5");
  assert.equal(challengeRes.status, 200);
  const challenge = (await challengeRes.json()).data;
  assert.equal(challenge.status, "LINK_REQUIRED");
  // Another actor binds this external ID after the challenge was issued.
  const other = (await ctx.db.query(
    "INSERT INTO users(username,email,role) VALUES ('codex-other','codex-other@test.local','user') RETURNING id",
  )).rows[0];
  await ctx.db.query(
    "INSERT INTO external_identities(source_system,external_user_id,user_id,status,source_updated_at) VALUES ('moly','moly:9503',$1,'active',NOW())",
    [other.id],
  );
  const linkSess = await establishLoginSession({
    userId,
    deviceToken: null,
    ipAddress: "127.0.0.1",
    userAgent: "CodexLink",
    expiresAt: new Date(Date.now() + 86400_000),
  });
  const jwtLib = await import("jsonwebtoken");
  const linkJwt = jwtLib.default.sign(
    { userId, role: "user", sessionId: linkSess.sessionId, sessionToken: linkSess.sessionToken },
    TEST_CFG.jwtSecret,
    { expiresIn: "1d" },
  );
  const driftRes = await agent.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "CodexLink",
      Cookie: cookieHeaderFrom({ jwt: linkJwt, csca_trusted_device: linkSess.deviceToken }),
    },
    body: { linkToken: challenge.linkToken },
  });
  assert.equal(driftRes.status, 409);
  assert.equal((await driftRes.json()).errorCode, "IDENTITY_ALREADY_LINKED");
  assert.equal((await ctx.db.query("SELECT completed_at FROM integration_sso_link_requests")).rows[0].completed_at, null);
});

test("Codex: scoped SSO resolves real profile, preserves other grants and respects admin blocks", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const agent = createCourseFetchAgent(ctx.courseBaseUrl);
  const assertion = {
    source_system: "moly", source_user_id: "9601", email: "codex-scope@test.local",
    role: "student", target_path: "/courses",
  };
  ctx.setExchangeHandler(async ({ nonce }) => ({
    status: 200, body: { success: true, data: { ...assertion, nonce } },
  }));
  const consumeWithTx = async (code) => {
    const tx = await agent.startSso({ targetPath: "/courses" });
    return agent.request("/api/auth/sso/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Codex" },
      body: { code, state: tx.state },
    });
  };
  const firstRes = await consumeWithTx("scoped-code-1");
  assert.equal(firstRes.status, 200);
  const userId = (await firstRes.json()).data.user.id;
  assertion.scope_type = "course";
  assertion.scoped_external_course_id = "moly:codex-offer";
  assertion.target_path = "/video-courses/moly:codex-offer";
  const missingMapRes = await consumeWithTx("scoped-code-2");
  assert.equal((await missingMapRes.json()).errorCode, "COURSE_MAPPING_MISSING");

  const course = (await ctx.db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Scoped','codex-scoped',$1,TRUE) RETURNING id",
    [userId],
  )).rows[0];
  const profile = (await ctx.db.query(
    "INSERT INTO video_course_profiles(course_id,mode,status) VALUES ($1,'INDEPENDENT','active') RETURNING id",
    [course.id],
  )).rows[0];
  const { upsertManualCourseMapping } = await import("./externalCourseMapping.service.js");
  await upsertManualCourseMapping(ctx.db, {
    sourceSystem: "moly", externalCourseId: assertion.scoped_external_course_id,
    localCourseId: course.id, localVideoCourseProfileId: profile.id,
  });
  const { enqueueMolyIntegrationEvent, parseGrantWirePayload, processNextMolyInboxJob } = await import("./molyIntegration.service.js");
  for (const id of ["a", "b"]) {
    await enqueueMolyIntegrationEvent(ctx.db, parseGrantWirePayload({
      event_id: `moly:scope-${id}`, idempotency_key: `scope-${id}`, correlation_id: "scope",
      source_system: "moly", external_user_id: "moly:9601", external_course_id: assertion.scoped_external_course_id,
      external_grant_id: `moly:scope-${id}`, valid_from: "2020-01-01T00:00:00Z",
      source_updated_at: "2026-11-15T10:00:00Z",
    }));
    assert.equal((await processNextMolyInboxJob({ db: ctx.db })).status, "processed");
  }
  await ctx.db.query("UPDATE external_entitlements SET status='revoked', revoked_at=NOW(), source_updated_at=source_updated_at+INTERVAL '1 second' WHERE external_grant_id='moly:scope-a'");
  const activeRes = await consumeWithTx("scoped-code-3");
  assert.equal(activeRes.status, 200);
  assert.equal((await activeRes.json()).data.redirectPath, `/video-courses/profile-${profile.id}`);
  await ctx.db.query("INSERT INTO video_course_access_revocations(video_course_profile_id,user_id) VALUES ($1,$2)", [profile.id, userId]);
  const blockedRes = await consumeWithTx("scoped-code-4");
  assert.equal(blockedRes.status, 403);
  assert.equal((await blockedRes.json()).errorCode, "VIDEO_COURSE_ACCESS_REVOKED");
});

test("P1 Security (Course): 2-browser-context Login-CSRF & Safe-Link cookie isolation, passwordless candidate refresh, wrong PKCE verifier, tx expiry", async (t) => {
  const ctx = await setupDay4CourseEnv(t);
  const jwtLib = await import("jsonwebtoken");

  const victimB = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('victim_b', 'victim.b@example.com', NULL, 'user', true, false) RETURNING *`,
  )).rows[0];
  const pwlessLocal = (await ctx.db.query(
    `INSERT INTO users (username, email, password_hash, role, email_verified, is_locked)
     VALUES ('pwless_csca', 'pwless.csca@example.com', NULL, 'user', true, false) RETURNING *`,
  )).rows[0];

  const exchangeCalls = [];
  ctx.setExchangeHandler(async ({ code, nonce, code_verifier }) => {
    exchangeCalls.push({ code, nonce, code_verifier });
    return {
      status: 200,
      body: {
        success: true,
        data: {
          source_system: "moly",
          source_user_id: code === "code-pwless-csca" ? "8802" : "8801",
          email: code === "code-pwless-csca" ? "pwless.csca@example.com" : "attacker.csca@example.com",
          email_verified: true,
          role: "student",
          target_path: "/courses",
          nonce,
        },
      },
    };
  });

  // Context A starts incoming Moly -> Course SSO
  const contextA = createCourseFetchAgent(ctx.courseBaseUrl);
  const startA = await contextA.startSso({ targetPath: "/courses" });

  // Context B (separate cookie jar, logged in as Victim B) tries consuming leaked { code, startA.state }
  const victimSess = await establishLoginSession({
    userId: victimB.id,
    deviceToken: null,
    ipAddress: "127.0.0.1",
    userAgent: "VictimB",
    expiresAt: new Date(Date.now() + 86400_000),
  });
  const victimJwt = jwtLib.default.sign(
    { userId: victimB.id, role: "user", sessionId: victimSess.sessionId, sessionToken: victimSess.sessionToken },
    TEST_CFG.jwtSecret,
    { expiresIn: "1d" },
  );
  const victimCookie = cookieHeaderFrom({ jwt: victimJwt, csca_trusted_device: victimSess.deviceToken });

  const contextB = createCourseFetchAgent(ctx.courseBaseUrl);
  const csrfNoCookie = await contextB.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: victimCookie, "User-Agent": "VictimB" },
    body: { code: "code-attacker-csca", state: startA.state },
  });
  assert.equal(csrfNoCookie.status, 403);
  assert.equal((await csrfNoCookie.json()).errorCode, "SSO_BROWSER_BINDING_REQUIRED");
  assert.equal(exchangeCalls.length, 0);

  // Even after Context B starts its own txB, passing startA.state fails with 403 SSO_BROWSER_STATE_MISMATCH
  const startB = await contextB.startSso({ targetPath: "/courses" });
  assert.notEqual(startB.state, startA.state);
  const csrfWrongState = await contextB.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: victimCookie, "User-Agent": "VictimB" },
    body: { code: "code-attacker-csca", state: startA.state },
  });
  assert.equal(csrfWrongState.status, 403);
  assert.equal((await csrfWrongState.json()).errorCode, "SSO_BROWSER_STATE_MISMATCH");
  assert.equal(exchangeCalls.length, 0);

  // Expired tx fails closed before calling Moly
  const contextExp = createCourseFetchAgent(ctx.courseBaseUrl);
  const startExp = await contextExp.startSso({ targetPath: "/courses" });
  ctx.setNow(new Date("2026-11-15T10:04:00.000Z"));
  const expTxRes = await contextExp.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-exp", state: startExp.state },
  });
  assert.equal(expTxRes.status, 401);
  assert.equal((await expTxRes.json()).errorCode, "SSO_BROWSER_TX_EXPIRED");
  assert.equal(exchangeCalls.length, 0);
  ctx.setNow(new Date("2026-11-15T10:00:00.000Z"));

  // Safe-Linking bound to initiating browser + passwordless candidate + refresh recovery
  const txLink = await contextA.startSso({ targetPath: "/courses" });
  const colRes = await contextA.request("/api/auth/sso/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { code: "code-pwless-csca", state: txLink.state },
  });
  assert.equal(colRes.status, 200);
  const colJson = await colRes.json();
  assert.equal(colJson.data.status, "LINK_REQUIRED");
  assert.equal(colJson.data.hasPassword, false);

  const statusRefresh = await contextA.request("/api/auth/sso/link/status");
  assert.equal(statusRefresh.status, 200);
  assert.equal((await statusRefresh.json()).data.email, "pwless.csca@example.com");

  const stealAttempt = await contextB.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { linkToken: colJson.data.linkToken },
  });
  assert.equal(stealAttempt.status, 403);
  assert.equal((await stealAttempt.json()).errorCode, "SSO_BROWSER_BINDING_REQUIRED");

  const pwlessSess = await establishLoginSession({
    userId: pwlessLocal.id,
    deviceToken: null,
    ipAddress: "127.0.0.1",
    userAgent: "PwlessBrowser",
    expiresAt: new Date(Date.now() + 86400_000),
  });
  const pwlessJwt = jwtLib.default.sign(
    { userId: pwlessLocal.id, role: "user", sessionId: pwlessSess.sessionId, sessionToken: pwlessSess.sessionToken },
    TEST_CFG.jwtSecret,
    { expiresIn: "1d" },
  );
  const pwlessConfirm = await contextA.request("/api/auth/sso/link/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "PwlessBrowser",
      Cookie: cookieHeaderFrom({ jwt: pwlessJwt, csca_trusted_device: pwlessSess.deviceToken }),
    },
    body: {}, // omitted linkToken after page refresh relies strictly on HttpOnly csca_sso_link cookie
  });
  assert.equal(pwlessConfirm.status, 200);
  assert.equal(Number((await pwlessConfirm.json()).data.user.id), Number(pwlessLocal.id));

  // Wrong code_verifier on outbound PKCE exchange fails closed with 403 SSO_PKCE_MISMATCH
  const goodVerifier = generatePkceVerifier();
  const badVerifier = generatePkceVerifier();
  const outbound = await ctx.ssoService.authorizeMolySsoRequest({
    userId: pwlessLocal.id,
    state: "csca-pkce-verify-state-01",
    codeChallenge: computePkceChallengeS256(goodVerifier),
    codeChallengeMethod: "S256",
    targetSystem: "moly",
    targetPath: "/khoa-hoc",
  });
  const wrongPkceReq = signInboundMolyRequest({
    code: outbound.code,
    nonce: outbound.state,
    code_verifier: badVerifier,
    consumer_system: "moly",
  });
  const badPkceRes = await fetch(`${ctx.courseBaseUrl}/api/integrations/v1/sso/exchange`, {
    method: "POST",
    headers: wrongPkceReq.headers,
    body: wrongPkceReq.rawBody,
  });
  assert.equal(badPkceRes.status, 403);
  assert.equal((await badPkceRes.json()).errorCode, "SSO_PKCE_MISMATCH");
});
