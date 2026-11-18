import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";

import { pool } from "../db/connect.js";
import {
  computeMolyGetSignature,
  computeMolySignature,
  createRequireMolyIntegration,
} from "../middleware/requireMolyIntegration.js";
import assignmentRouter from "../router/assignment.router.js";
import fileRouter from "../router/file.router.js";
import { createMolyIntegrationV2Router } from "../router/molyIntegrationV2.router.js";
import videoCourseRouter from "../router/videoCourse.router.js";
import { exportCourseCurriculum } from "./courseCurriculumSync.service.js";
import {
  ALLOWED_DELEGATED_SCOPES,
  loadUnlockedUnitDetail,
  mintDelegatedLearningSession,
  resolveProfileAndCourse,
} from "./delegatedLearning.service.js";
import {
  recordLearningFileTombstonedOutbox,
  recordLearningFileUpsertedOutbox,
} from "./delegatedFiles.service.js";
import {
  uploadDelegatedSubmissionAsset,
} from "./delegatedAssessments.service.js";
import {
  buildContentDispositionHeader,
  MAX_SUBMISSION_AUDIO_SIZE_BYTES,
  MAX_SUBMISSION_FILE_SIZE_BYTES,
} from "./video.service.js";

const TEST_MOLY_CFG = {
  serviceToken: "course-day57-bearer-secret",
  integrationKey: "moly-studio-v2",
  hmacSecret: "course-day57-hmac-secret",
};

const bindPoolToDb = (targetPool, db) => {
  targetPool.query = (sql, params) => (params ? db.query(sql, params) : db.query(sql));
  targetPool.connect = async () => ({
    query: (sql, params) => (params ? db.query(sql, params) : db.query(sql)),
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

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const startServer = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    resolve({
      server,
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
  });
});

const stopServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const buildSignedRequestHeaders = ({
  method = "POST",
  originalUrl,
  rawBody = "",
  idempotencyKey = null,
  extraHeaders = {},
}) => {
  const timestamp = new Date().toISOString();
  const useGetStyle = (method === "GET" || method === "HEAD")
    || (method === "DELETE" && (!rawBody || rawBody.length === 0));
  const signature = useGetStyle
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
    "X-Correlation-ID": `corr-${crypto.randomUUID()}`,
    "X-Event-Timestamp": timestamp,
    "X-Signature": signature,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    ...(rawBody && !useGetStyle ? { "Content-Type": "application/json" } : {}),
    ...extraHeaders,
  };
};

const callV2 = async (baseUrl, {
  method = "GET",
  path,
  body = undefined,
  sessionToken = null,
  idempotencyKey = null,
  extraHeaders = {},
}) => {
  const originalUrl = `/api/integrations/v2${path}`;
  const rawBody = body !== undefined ? JSON.stringify(body) : "";
  const effectiveIdem = method === "GET" || method === "HEAD"
    ? null
    : (idempotencyKey || `idem-${crypto.randomUUID()}`);
  const headers = buildSignedRequestHeaders({
    method,
    originalUrl,
    rawBody,
    idempotencyKey: effectiveIdem,
    extraHeaders: {
      ...(sessionToken ? { "X-Delegated-Session": sessionToken } : {}),
      ...extraHeaders,
    },
  });

  const res = await fetch(`${baseUrl}${originalUrl}`, {
    method,
    headers,
    ...(rawBody ? { body: rawBody } : {}),
  });
  return res;
};

const invokeRouter = async (router, method, path, { params = {}, query = {}, body = {}, headers = {}, user } = {}) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} not found on router`);
  const normHeaders = {};
  for (const [k, v] of Object.entries(headers || {})) normHeaders[k.toLowerCase()] = v;

  const response = {
    statusCode: 200,
    body: null,
    location: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    redirect(code, location) { this.statusCode = code; this.location = location; return this; },
    set(values) {
      for (const [key, value] of Object.entries(values || {})) this.headers[key.toLowerCase()] = value;
      return this;
    },
  };
  await layer.route.stack.at(-1).handle({
    params,
    query,
    body,
    headers: normHeaders,
    user,
    ip: "127.0.0.1",
    get(name) { return normHeaders[String(name || "").toLowerCase()] || null; },
  }, response);
  return response;
};

const withTempR2Env = async (t) => {
  const keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "test-r2-acct";
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "test-r2-key";
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "test-r2-secret";
  process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-r2-bucket";
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
};

test("Day 5: migration 084 idempotency, file stream proxy (200/206/RFC5987/TTL<=60/watermark), soft-delete outbox, embargo & Moly entitlements", async (t) => {
  await withTempR2Env(t);
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  // Re-run migration 084 to prove strict idempotency
  await pg.exec(await fs.readFile("database/migrations/084_course_moly_sync_day5_7.sql", "utf8"));
  assert.ok(ALLOWED_DELEGATED_SCOPES.includes("bookmarks:rw"));

  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  // Verify RFC 5987 Unicode header helper preserves ASCII compat + adds UTF-8 filename*
  assert.equal(buildContentDispositionHeader("inline", "exam paper.pdf"), 'inline; filename="exam paper.pdf"');
  const unicodeDisp = buildContentDispositionHeader("inline", "Tài liệu Bài 1 中文.pdf");
  assert.ok(unicodeDisp.includes('filename="'));
  assert.ok(unicodeDisp.includes("filename*=UTF-8''T%C3%A0i%20li%E1%BB%87u%20B%C3%A0i%201%20%E4%B8%AD%E6%96%87.pdf"));

  const teacher = (await pg.query(
    `INSERT INTO users(username,email,role) VALUES ('d5-teacher','d5-teacher@example.test','creator') RETURNING id,role`,
  )).rows[0];
  const molyLearner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d5-moly-user','d5-moly@example.test','user',FALSE,'unmanaged') RETURNING id,role,is_management_managed`,
  )).rows[0];
  const revokedLearner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d5-revoked','d5-revoked@example.test','user',FALSE,'unmanaged') RETURNING id,role`,
  )).rows[0];

  const identityA = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at)
     VALUES ($1,'moly','moly-d5-1','active',NOW()) RETURNING id`,
    [molyLearner.id],
  )).rows[0];
  const identityRev = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at)
     VALUES ($1,'moly','moly-d5-rev','active',NOW()) RETURNING id`,
    [revokedLearner.id],
  )).rows[0];

  const course = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('Course D5','Course D5','course-d5',$1,TRUE,FALSE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const otherCourse = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('Other D5','Other D5','other-d5',$1,TRUE,FALSE) RETURNING id`,
    [teacher.id],
  )).rows[0];

  const profileIndep = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,mode,enforce_trusted_devices,device_limit,allow_file_download,status)
     VALUES ($1,'INDEPENDENT',FALSE,2,FALSE,'active') RETURNING id`,
    [course.id],
  )).rows[0];
  const otherProfile = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,mode,enforce_trusted_devices,device_limit,allow_file_download,status)
     VALUES ($1,'INDEPENDENT',FALSE,2,TRUE,'active') RETURNING id`,
    [otherCourse.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO external_entitlements
       (user_id,external_identity_id,source_system,external_grant_id,external_user_id,external_course_id,local_course_id,local_video_course_profile_id,status,valid_from,source_updated_at)
     VALUES ($1,$2,'moly','grant-d5-1','moly-d5-1','ext-course-d5',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW()),
            ($5,$6,'moly','grant-d5-rev','moly-d5-rev','ext-course-d5',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW())`,
    [molyLearner.id, identityA.id, course.id, profileIndep.id, revokedLearner.id, identityRev.id],
  );
  await pg.query(
    `INSERT INTO video_course_access_revocations(video_course_profile_id,user_id,revoked_by,reason)
     VALUES ($1,$2,$3,'Refunded')`,
    [profileIndep.id, revokedLearner.id, teacher.id],
  );

  const sec = (await pg.query(
    `INSERT INTO sections(course_id,title,sort_order) VALUES ($1,'Sec 1',1) RETURNING id`,
    [course.id],
  )).rows[0];
  const lesson1 = (await pg.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,sort_order,is_published,is_public_preview)
     VALUES ($1,$2,'Preview Lesson 1','Preview Lesson 1',120,1,TRUE,TRUE) RETURNING id`,
    [course.id, sec.id],
  )).rows[0];
  const lesson2 = (await pg.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,sort_order,is_published,is_public_preview)
     VALUES ($1,$2,'Locked Lesson 2','Locked Lesson 2',120,2,TRUE,FALSE) RETURNING id`,
    [course.id, sec.id],
  )).rows[0];

  const filePayloadBytes = Buffer.from("0123456789ABCDEF-SLIDES-CONTENT");
  const slideFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'Tài liệu Bài 1 中文.pdf','learning-files/slides-d5.pdf','application/pdf',$3,'COURSE','ready') RETURNING id`,
    [course.id, teacher.id, filePayloadBytes.length],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id,lesson_id,attached_by) VALUES ($1,$2,$3)`,
    [slideFile.id, lesson1.id, teacher.id],
  );
  const lockedFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'Unit2 Notes.pdf','learning-files/u2-d5.pdf','application/pdf',20,'COURSE','ready') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id,lesson_id,attached_by) VALUES ($1,$2,$3)`,
    [lockedFile.id, lesson2.id, teacher.id],
  );
  const privateFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'TeacherOnly.pdf','learning-files/priv.pdf','application/pdf',20,'PRIVATE','ready') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id,lesson_id,attached_by) VALUES ($1,$2,$3)`,
    [privateFile.id, lesson1.id, teacher.id],
  );
  const solutionFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'Solution Key.pdf','learning-files/sol.pdf','application/pdf',25,'COURSE','ready') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id,lesson_id,attached_by) VALUES ($1,$2,$3)`,
    [solutionFile.id, lesson1.id, teacher.id],
  );
  const embargoQuiz = (await pg.query(
    `INSERT INTO quizzes(title,course_id,lesson_id,instructor_id,status,review_policy,available_until,solution_file_id)
     VALUES ('Embargo Quiz',$1,$2,$3,'PUBLISHED','after_close',NOW() + INTERVAL '2 hours',$4) RETURNING id`,
    [course.id, lesson1.id, teacher.id, solutionFile.id],
  )).rows[0];

  const otherSec = (await pg.query(
    `INSERT INTO sections(course_id,title,sort_order) VALUES ($1,'Other Sec',1) RETURNING id`,
    [otherCourse.id],
  )).rows[0];
  const otherLesson = (await pg.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,sort_order,is_published)
     VALUES ($1,$2,'Other Lesson','Other Lesson',60,1,TRUE) RETURNING id`,
    [otherCourse.id, otherSec.id],
  )).rows[0];
  const otherFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'CrossProfile.pdf','learning-files/other.pdf','application/pdf',20,'COURSE','ready') RETURNING id`,
    [otherCourse.id, teacher.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO lesson_learning_file_placements(file_id,lesson_id,attached_by) VALUES ($1,$2,$3)`,
    [otherFile.id, otherLesson.id, teacher.id],
  );

  // Upsert outbox & curriculum metadata check
  const upsertedEnv = await recordLearningFileUpsertedOutbox({ db, fileId: slideFile.id, correlationId: "corr-d5-upsert" });
  assert.equal(upsertedEnv.eventType, "file.upserted");
  assert.equal(upsertedEnv.payload.originalFilename, "Tài liệu Bài 1 中文.pdf");

  const curr = await exportCourseCurriculum({ db, courseId: course.id });
  const unit1Curr = curr.profiles[0].units.find((u) => String(u.unitId) === String(lesson1.id));
  const exportedSlide = unit1Curr.files.find((f) => String(f.fileId) === String(slideFile.id));
  assert.ok(exportedSlide);
  assert.equal(exportedSlide.originalFilename, "Tài liệu Bài 1 中文.pdf");
  assert.equal(exportedSlide.allowView, true);
  assert.equal(exportedSlide.allowDownload, false);

  const profileRow = await resolveProfileAndCourse(db, profileIndep.id);
  const unitDetail = await loadUnlockedUnitDetail(db, {
    profileRow,
    unitMeta: { id: lesson1.id, type: "lesson", title: "Preview Lesson 1", sessionNumber: 1, sectionTitle: "Sec 1", videoDurationSeconds: 120 },
    userId: molyLearner.id,
  });
  assert.ok(unitDetail.files.some((f) => String(f.id) === String(slideFile.id) && f.allowView === true && f.allowDownload === false));

  // Mint delegated session for molyLearner (with BOTH file:view and file:download scopes)
  const minted = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d5-1",
    profileId: profileIndep.id,
    scopes: ["workspace:read", "file:view", "file:download"],
    ttlSeconds: 300,
    correlationId: "corr-d5-sess",
  });

  const app = express();
  app.use(express.json({ limit: "1mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });

  let lastUpstreamUrl = null;
  const mockStreamFetch = async (signedUrl, init = {}) => {
    lastUpstreamUrl = signedUrl;
    const rangeHeader = init.headers?.Range || "";
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), filePayloadBytes.length - 1) : filePayloadBytes.length - 1;
      const slice = filePayloadBytes.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-range": `bytes ${start}-${end}/${filePayloadBytes.length}`,
          "content-length": String(slice.length),
          "accept-ranges": "bytes",
        },
      });
    }
    return new Response(filePayloadBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(filePayloadBytes.length),
        "accept-ranges": "bytes",
      },
    });
  };

  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead,
    verifyWrite,
    fileStreamFetchImpl: mockStreamFetch,
  }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // 1) metadata mode: watermark + TTL <= 60s + RFC 5987 + NO R2 URL leak
  const metaRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}&mode=metadata&ttlSeconds=999`,
    sessionToken: minted.sessionToken,
  });
  const metaJson = await metaRes.json();
  assert.equal(metaRes.status, 200, JSON.stringify(metaJson));
  assert.equal(metaJson.data.ttlSeconds, 60);
  assert.equal(metaJson.data.watermark.externalUserId, "moly-d5-1");
  assert.ok(!JSON.stringify(metaJson).includes("r2.cloudflarestorage.com"));
  assert.ok(metaJson.data.contentDisposition.includes("filename*=UTF-8''"));

  // 2) full stream 200 + strict headers + TTL <= 60 in signed R2 URL
  const stream200Res = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}&disposition=inline`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(stream200Res.status, 200);
  assert.equal(Buffer.from(await stream200Res.arrayBuffer()).toString(), filePayloadBytes.toString());
  assert.equal(stream200Res.headers.get("accept-ranges"), "bytes");
  assert.equal(stream200Res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(stream200Res.headers.get("cache-control").includes("no-store"));
  assert.ok(stream200Res.headers.get("content-disposition").includes("filename*=UTF-8''"));
  assert.ok(lastUpstreamUrl.includes("X-Amz-Expires=60"));

  // 3) Range 206 Partial Content
  const rangeRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}&disposition=inline`,
    sessionToken: minted.sessionToken,
    extraHeaders: { Range: "bytes=0-4" },
  });
  assert.equal(rangeRes.status, 206);
  assert.equal(Buffer.from(await rangeRes.arrayBuffer()).toString(), "01234");
  assert.equal(rangeRes.headers.get("content-range"), `bytes 0-4/${filePayloadBytes.length}`);

  // 4) Policy denials: download forbidden, private file, unit locked, cross-profile, embargo, revoked user, preview fallback
  const dlDenied = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}&disposition=attachment`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(dlDenied.status, 403);
  assert.equal((await dlDenied.json()).errorCode, "FILE_DOWNLOAD_FORBIDDEN");

  const privDenied = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${privateFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(privDenied.status, 403);
  assert.equal((await privDenied.json()).errorCode, "FILE_ACCESS_FORBIDDEN");

  const lockDenied = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${lockedFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson2.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(lockDenied.status, 403);
  assert.equal((await lockDenied.json()).errorCode, "UNIT_LOCKED");

  const crossDenied = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${otherFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(crossDenied.status, 409);
  assert.equal((await crossDenied.json()).errorCode, "PROFILE_SCOPE_MISMATCH");

  const embargoDenied = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${solutionFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(embargoDenied.status, 403);
  assert.equal((await embargoDenied.json()).errorCode, "SOLUTION_EMBARGOED");

  // Native file download route MUST also block solution embargo and MUST allow active Moly external_entitlements user on normal unit file!
  const nativeEmbargo = await invokeRouter(fileRouter, "get", "/files/:fileId/download", {
    params: { fileId: String(solutionFile.id) },
    query: { videoCourseId: String(course.id), videoCourseProfileId: String(profileIndep.id) },
    user: { id: molyLearner.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeEmbargo.statusCode, 403);
  assert.equal(nativeEmbargo.body.errorCode, "SOLUTION_EMBARGOED");

  const nativeMolyFileOk = await invokeRouter(fileRouter, "get", "/files/:fileId/download", {
    params: { fileId: String(slideFile.id) },
    query: { videoCourseId: String(course.id), videoCourseProfileId: String(profileIndep.id) },
    user: { id: molyLearner.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeMolyFileOk.statusCode, 200);
  assert.ok(String(nativeMolyFileOk.body).includes("r2.cloudflarestorage.com"));

  // Once quiz closes, solution file unlocks cleanly on delegated stream!
  await pg.query(`UPDATE quizzes SET available_until = NOW() - INTERVAL '1 minute' WHERE id = $1`, [embargoQuiz.id]);
  const embargoOpened = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${solutionFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(embargoOpened.status, 200);

  // Public preview inline without session token succeeds on preview unit, fails on locked unit
  const previewOk = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}&disposition=inline`,
  });
  assert.equal(previewOk.status, 200);

  const previewLocked = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${lockedFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson2.id}&disposition=inline`,
  });
  assert.equal(previewLocked.status, 401);

  // Soft-delete file -> emits file.tombstoned, vanishes from export/unitDetail/stream
  const tomb = await recordLearningFileTombstonedOutbox({ db, fileId: slideFile.id, correlationId: "corr-d5-tomb" });
  assert.equal(tomb.eventType, "file.tombstoned");
  const afterTombStream = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${slideFile.id}/stream?profileId=${profileIndep.id}&unitId=${lesson1.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(afterTombStream.status, 404);
  const currAfter = await exportCourseCurriculum({ db, courseId: course.id });
  const unit1After = currAfter.profiles[0].units.find((u) => String(u.unitId) === String(lesson1.id));
  assert.equal(unit1After.files.some((f) => String(f.fileId) === String(slideFile.id)), false);

  // Revoked user cannot mint or access via native file route
  await assert.rejects(
    () => mintDelegatedLearningSession({ db, externalUserId: "moly-d5-rev", profileId: profileIndep.id, scopes: ["file:view"] }),
    (err) => err.statusCode === 403,
  );
  const nativeRevokedFile = await invokeRouter(fileRouter, "get", "/files/:fileId/download", {
    params: { fileId: String(solutionFile.id) },
    query: { videoCourseId: String(course.id), videoCourseProfileId: String(profileIndep.id) },
    user: { id: revokedLearner.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeRevokedFile.statusCode, 403);
});

test("Day 6: delegated quizzes & assignments, idempotency, attempt_limit + override, timeout, unlock outbox, native Moly entitlement & teacher grading outbox", async (t) => {
  await withTempR2Env(t);
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  const teacher = (await pg.query(
    `INSERT INTO users(username,email,role) VALUES ('d6-teacher','d6-teacher@example.test','creator') RETURNING id,role`,
  )).rows[0];
  const learner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d6-moly','d6-moly@example.test','user',FALSE,'unmanaged') RETURNING id,role,is_management_managed`,
  )).rows[0];
  const revokedUser = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d6-rev','d6-rev@example.test','user',FALSE,'unmanaged') RETURNING id,role`,
  )).rows[0];

  const idA = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at) VALUES ($1,'moly','moly-d6-1','active',NOW()) RETURNING id`,
    [learner.id],
  )).rows[0];
  const idR = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at) VALUES ($1,'moly','moly-d6-rev','active',NOW()) RETURNING id`,
    [revokedUser.id],
  )).rows[0];

  const course = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('Course D6','Course D6','course-d6',$1,TRUE,FALSE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await pg.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('D6 Live Class',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const profile = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,enforce_trusted_devices,device_limit,status)
     VALUES ($1,'MIRROR',$2,FALSE,2,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO external_entitlements
       (user_id,external_identity_id,source_system,external_grant_id,external_user_id,external_course_id,local_course_id,local_video_course_profile_id,status,valid_from,source_updated_at)
     VALUES ($1,$2,'moly','grant-d6-1','moly-d6-1','ext-course-d6',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW()),
            ($5,$6,'moly','grant-d6-rev','moly-d6-rev','ext-course-d6',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW())`,
    [learner.id, idA.id, course.id, profile.id, revokedUser.id, idR.id],
  );
  await pg.query(
    `INSERT INTO video_course_access_revocations(video_course_profile_id,user_id,revoked_by,reason) VALUES ($1,$2,$3,'Revoked')`,
    [profile.id, revokedUser.id, teacher.id],
  );

  // Two sequential units (class_session 1 & 2) + completed video on session 1 so quiz pass unlocks session 2!
  const video1 = (await pg.query(
    `INSERT INTO video_assets(title,r2_key,provider,provider_video_id,duration_seconds,playback_status)
     VALUES ('D6 Vid 1','videos/d6-vid-1.mp4','bunny_stream','bunny-d6-1',100,'ready') RETURNING id`,
  )).rows[0];
  const sess1 = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buổi 1',NOW() - INTERVAL '4 hours',NOW() - INTERVAL '3 hours','ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO class_session_videos(class_session_id,video_asset_id,title,video_type,sort_order,is_published)
     VALUES ($1,$2,'Part 1','primary',0,TRUE)`,
    [sess1.id, video1.id],
  );
  await pg.query(
    `INSERT INTO video_watch_progress(user_id,video_asset_id,course_id,live_class_id,class_session_id,watched_seconds,completion_percent,is_completed,completed_at)
     VALUES ($1,$2,$3,$4,$5,80,80,TRUE,NOW())`,
    [learner.id, video1.id, course.id, liveClass.id, sess1.id],
  );
  const sess2 = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buổi 2',NOW() - INTERVAL '2 hours',NOW() - INTERVAL '1 hour','ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];

  const quizSolution = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,live_class_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,$3,'Quiz Sol.pdf','learning-files/qsol.pdf','application/pdf',10,'COURSE','ready') RETURNING id`,
    [course.id, liveClass.id, teacher.id],
  )).rows[0];
  const quiz = (await pg.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score,attempt_limit,review_policy,solution_file_id)
     VALUES ('D6 Quiz 1',$1,$2,$3,$4,'PUBLISHED',30,50,1,'after_submit',$5) RETURNING id`,
    [course.id, liveClass.id, sess1.id, teacher.id, quizSolution.id],
  )).rows[0];
  const q1 = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'1 + 1 = ?','single_choice','[{"key":"A","text":"1"},{"key":"B","text":"2"},{"key":"C","text":"3"}]'::jsonb,'B','Because math',10,1) RETURNING id`,
    [quiz.id],
  )).rows[0];
  const q2 = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'Explain your reasoning','essay','[]'::jsonb,'','Rubric essay',10,2) RETURNING id`,
    [quiz.id],
  )).rows[0];

  const embargoedQuiz = (await pg.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score,attempt_limit,review_policy,solution_file_id)
     VALUES ('D6 Never Review Quiz',$1,$2,$3,$4,'PUBLISHED',30,50,2,'never',$5) RETURNING id`,
    [course.id, liveClass.id, sess2.id, teacher.id, quizSolution.id],
  )).rows[0];
  const qe1 = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'2 + 2 = ?','single_choice','[{"key":"A","text":"3"},{"key":"B","text":"4"}]'::jsonb,'B','Secret explanation',10,1) RETURNING id`,
    [embargoedQuiz.id],
  )).rows[0];

  const lockedUnitQuiz = (await pg.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score)
     VALUES ('D6 Unit 2 Quiz',$1,$2,$3,$4,'PUBLISHED',15,50) RETURNING id`,
    [course.id, liveClass.id, sess2.id, teacher.id],
  )).rows[0];

  const assignment = (await pg.query(
    `INSERT INTO assignments(title,assignment_type,course_id,live_class_id,class_session_id,instructor_id,description,max_score)
     VALUES ('D6 Homework','homework',$1,$2,$3,$4,'Write short essay',10) RETURNING id`,
    [course.id, liveClass.id, sess1.id, teacher.id],
  )).rows[0];
  await pg.query(
    `INSERT INTO assignment_rubrics(assignment_id,criteria_json)
     VALUES ($1,'[{"id":"r1","title":"Clarity","maxPoints":10}]'::jsonb)`,
    [assignment.id],
  );

  const minted = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d6-1",
    profileId: profile.id,
    scopes: ["workspace:read", "quiz:attempt", "assignment:submit"],
    ttlSeconds: 300,
    correlationId: "corr-d6-sess",
  });

  const app = express();
  app.use(express.json({ limit: "2mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead,
    verifyWrite,
    submissionUploadImpl: async () => ({ status: 200 }),
  }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // 1) Locked unit quiz denied 403 UNIT_LOCKED
  const lockedQuizRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${sess2.id}/quizzes/${lockedUnitQuiz.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(lockedQuizRes.status, 403);
  assert.equal((await lockedQuizRes.json()).errorCode, "UNIT_LOCKED");

  // 2) Quiz detail hides correct answers
  const quizDetailRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${sess1.id}/quizzes/${quiz.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(quizDetailRes.status, 200);
  const quizDetail = (await quizDetailRes.json()).data;
  assert.ok(Array.isArray(quizDetail.quiz.items) && quizDetail.quiz.items.length > 0);
  assert.equal(quizDetail.quiz.items[0].correct_answer, undefined);
  assert.equal(quizDetail.quiz.items[0].explanation, undefined);

  // 3) Start quiz idempotently
  const startRes1 = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess1.id },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-start-idem-1",
  });
  assert.equal(startRes1.status, 200);
  const startData1 = (await startRes1.json()).data;
  assert.ok(startData1.attempt?.id);

  const startResReplay = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess1.id },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-start-idem-1",
  });
  assert.equal((await startResReplay.json()).data.attempt.id, startData1.attempt.id);

  // 4) Save answers
  const saveRes = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/quizzes/attempts/${startData1.attempt.id}/answers`,
    body: { questionId: q1.id, answer: "B" },
    sessionToken: minted.sessionToken,
  });
  assert.equal(saveRes.status, 200);

  // 5) Submit idempotently -> unlocks sess2 + emits assessment.attempt.updated & learning.unit.completed!
  const submitRes1 = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/attempts/${startData1.attempt.id}/submit`,
    body: { answers: { [String(q1.id)]: "B", [String(q2.id)]: "My detailed answer" } },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-submit-idem-1",
  });
  assert.equal(submitRes1.status, 200);
  const submitData1 = (await submitRes1.json()).data;
  assert.equal(submitData1.score, 10);
  assert.equal(submitData1.passed, true);
  assert.equal(submitData1.canViewSolution, true);
  assert.ok(submitData1.solutionFileId);

  const submitReplay = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/attempts/${startData1.attempt.id}/submit`,
    body: { answers: { [String(q1.id)]: "B" } },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-submit-idem-1",
  });
  assert.equal((await submitReplay.json()).data.alreadySubmitted, true);

  // Late save after submission rejected 409 ATTEMPT_ALREADY_SUBMITTED
  const lateSave = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/quizzes/attempts/${startData1.attempt.id}/answers`,
    body: { questionId: q1.id, answer: "C" },
    sessionToken: minted.sessionToken,
  });
  assert.equal(lateSave.status, 409);
  assert.equal((await lateSave.json()).errorCode, "ATTEMPT_ALREADY_SUBMITTED");

  // Unit 2 is now unlocked!
  const unit2QuizNowOpen = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${sess2.id}/quizzes/${lockedUnitQuiz.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(unit2QuizNowOpen.status, 200);

  // Verify outbox emitted both assessment.attempt.updated & learning.unit.completed
  const outboxD6 = (await pg.query(
    `SELECT event_type, payload FROM course_integration_outbox ORDER BY aggregate_revision ASC`,
  )).rows;
  assert.ok(outboxD6.some((e) => e.event_type === "assessment.attempt.updated" && e.payload.payload.itemType === "quiz"));
  assert.ok(outboxD6.some((e) => e.event_type === "learning.unit.completed" && String(e.payload.payload.unitId) === String(sess1.id)));

  // 6) attempt_limit=1 blocks 2nd start -> accommodation override unlocks!
  const limitBlocked = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess1.id },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-start-idem-2",
  });
  assert.equal(limitBlocked.status, 409);
  assert.equal((await limitBlocked.json()).errorCode, "ATTEMPT_LIMIT_REACHED");

  await pg.query(
    `INSERT INTO assessment_accommodations(assessment_type,assessment_id,user_id,attempt_limit_override,reason,created_by,status)
     VALUES ('quiz',$1,$2,2,'Extra attempt',$3,'active')`,
    [quiz.id, learner.id, teacher.id],
  );
  const overrideStart = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess1.id },
    sessionToken: minted.sessionToken,
    idempotencyKey: "quiz-start-idem-override",
  });
  assert.equal(overrideStart.status, 200);
  const overrideAttemptId = (await overrideStart.json()).data.attempt.id;

  // Timer expiry auto-submits saved answers on PUT /answers and blocks with 409 QUIZ_ATTEMPT_EXPIRED
  await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/quizzes/attempts/${overrideAttemptId}/answers`,
    body: { questionId: q1.id, answer: "B" },
    sessionToken: minted.sessionToken,
  });
  await pg.query(`UPDATE quiz_attempts SET expires_at = NOW() - INTERVAL '5 seconds' WHERE id = $1`, [overrideAttemptId]);
  const expiredSave = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/quizzes/attempts/${overrideAttemptId}/answers`,
    body: { questionId: q1.id, answer: "A" },
    sessionToken: minted.sessionToken,
  });
  assert.equal(expiredSave.status, 409);
  assert.equal((await expiredSave.json()).errorCode, "QUIZ_ATTEMPT_EXPIRED");
  const expiredAttemptRow = (await pg.query(`SELECT status, auto_submitted, score FROM quiz_attempts WHERE id = $1`, [overrideAttemptId])).rows[0];
  assert.equal(expiredAttemptRow.status, "submitted");
  assert.equal(expiredAttemptRow.auto_submitted, true);
  assert.equal(Number(expiredAttemptRow.score), 10);

  // 7) review_policy = 'never' hides review & solutionFileId after submit
  const neverStart = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${embargoedQuiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess2.id },
    sessionToken: minted.sessionToken,
  });
  const neverAttemptId = (await neverStart.json()).data.attempt.id;
  const neverSubmit = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/attempts/${neverAttemptId}/submit`,
    body: { answers: { [String(qe1.id)]: "B" } },
    sessionToken: minted.sessionToken,
  });
  const neverData = (await neverSubmit.json()).data;
  assert.equal(neverData.canViewSolution, false);
  assert.deepEqual(neverData.review, []);
  assert.equal(neverData.solutionFileId, null);

  // 8) Assignment: detail, asset validation (oversize + MIME rejection), upload, submit, native Moly access, teacher return -> resubmit -> grade + quiz grade-essay outbox!
  const assignDetailRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${sess1.id}/assignments/${assignment.id}`,
    sessionToken: minted.sessionToken,
  });
  assert.equal(assignDetailRes.status, 200);
  assert.equal((await assignDetailRes.json()).data.assignment.rubric.length, 1);

  await assert.rejects(
    () => uploadDelegatedSubmissionAsset({
      db,
      sessionToken: minted.sessionToken,
      assignmentId: assignment.id,
      profileId: profile.id,
      unitId: sess1.id,
      assetKind: "file",
      filename: "huge.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX_SUBMISSION_FILE_SIZE_BYTES + 1,
      contentBuffer: Buffer.from("a"),
      uploadImpl: async () => ({ status: 200 }),
    }),
    (err) => err.statusCode === 422,
  );
  await assert.rejects(
    () => uploadDelegatedSubmissionAsset({
      db,
      sessionToken: minted.sessionToken,
      assignmentId: assignment.id,
      profileId: profile.id,
      unitId: sess1.id,
      assetKind: "audio",
      filename: "huge.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: MAX_SUBMISSION_AUDIO_SIZE_BYTES + 1,
      contentBuffer: Buffer.from("a"),
      uploadImpl: async () => ({ status: 200 }),
    }),
    (err) => err.statusCode === 422,
  );

  const badMimeRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/assignments/${assignment.id}/submission-assets`,
    body: {
      profileId: profile.id,
      unitId: sess1.id,
      assetKind: "file",
      filename: "malware.exe",
      mimeType: "application/x-msdownload",
      contentBase64: Buffer.from("bad").toString("base64"),
    },
    sessionToken: minted.sessionToken,
  });
  assert.equal(badMimeRes.status, 422);

  const assetUploadRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/assignments/${assignment.id}/submission-assets`,
    body: {
      profileId: profile.id,
      unitId: sess1.id,
      assetKind: "file",
      filename: "homework.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("%PDF-1.4 homework").toString("base64"),
    },
    sessionToken: minted.sessionToken,
  });
  assert.equal(assetUploadRes.status, 201);
  const uploadedAssetId = (await assetUploadRes.json()).data.assetId;

  // Verify native assignment.router.js allows active Moly external_entitlements user & blocks revoked user!
  const nativeAssignOk = await invokeRouter(assignmentRouter, "get", "/:assignmentId", {
    params: { assignmentId: String(assignment.id) },
    query: { videoCourseProfileId: String(profile.id) },
    user: { id: learner.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeAssignOk.statusCode, 200);

  const nativeAssignRevoked = await invokeRouter(assignmentRouter, "get", "/:assignmentId", {
    params: { assignmentId: String(assignment.id) },
    query: { videoCourseProfileId: String(profile.id) },
    user: { id: revokedUser.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeAssignRevoked.statusCode, 403);

  const nativeAssetAccessOk = await invokeRouter(assignmentRouter, "get", "/submission-assets/:assetId/access", {
    params: { assetId: String(uploadedAssetId) },
    user: { id: learner.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeAssetAccessOk.statusCode, 302);

  const subRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/assignments/${assignment.id}/submit`,
    body: {
      profileId: profile.id,
      unitId: sess1.id,
      contentText: "Here is my submission",
      fileAssetIds: [uploadedAssetId],
    },
    sessionToken: minted.sessionToken,
    idempotencyKey: "assign-sub-idem-1",
  });
  assert.equal(subRes.status, 200);
  const subData = (await subRes.json()).data;
  assert.equal(subData.status, "submitted");

  // Teacher return -> emits assessment.submission.graded (status: 'returned')
  const returnRes = await invokeRouter(assignmentRouter, "post", "/submissions/:submissionId/return", {
    params: { submissionId: subData.submissionId },
    body: { reason: "Please attach clear handwriting", resubmitUntil: new Date(Date.now() + 86400000).toISOString(), revision: 1 },
    user: { id: teacher.id, role: "creator" },
  });
  assert.equal(returnRes.statusCode, 200);

  // Learner resubmits
  const resubRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/assignments/${assignment.id}/submit`,
    body: {
      profileId: profile.id,
      unitId: sess1.id,
      contentText: "Updated clean submission",
      fileAssetIds: [uploadedAssetId],
    },
    sessionToken: minted.sessionToken,
    idempotencyKey: "assign-sub-idem-2",
  });
  assert.equal(resubRes.status, 200);
  assert.equal((await resubRes.json()).data.revision, 2);

  // Teacher grades assignment -> emits assessment.submission.graded (status: 'graded')
  const gradeRes = await invokeRouter(assignmentRouter, "post", "/submissions/:submissionId/grade", {
    params: { submissionId: subData.submissionId },
    body: { revision: 2, rubricScores: [{ criterionId: "r1", score: 9 }], feedbackText: "Well done" },
    user: { id: teacher.id, role: "creator" },
  });
  assert.equal(gradeRes.statusCode, 200);

  // Teacher grades quiz essay -> emits assessment.submission.graded (itemType: 'quiz')
  const gradeEssayRes = await invokeRouter(assignmentRouter, "post", "/teacher/quizzes/:quizId/attempts/:attemptId/grade-essay", {
    params: { quizId: String(quiz.id), attemptId: String(startData1.attempt.id) },
    body: { essayScore: 8, essayFeedback: "Clear proof" },
    user: { id: teacher.id, role: "creator" },
  });
  assert.equal(gradeEssayRes.statusCode, 200);

  const gradedOutbox = (await pg.query(
    `SELECT event_type, payload FROM course_integration_outbox WHERE event_type = 'assessment.submission.graded' ORDER BY aggregate_revision ASC`,
  )).rows;
  assert.ok(gradedOutbox.some((e) => e.payload.payload.itemType === "assignment" && e.payload.payload.status === "returned"));
  assert.ok(gradedOutbox.some((e) => e.payload.payload.itemType === "assignment" && e.payload.payload.status === "graded" && e.payload.payload.score === 9));
  assert.ok(gradedOutbox.some((e) => e.payload.payload.itemType === "quiz" && e.payload.payload.status === "graded" && e.payload.payload.score === 18));
});

test("Day 7: Notes, Bookmarks & Unit Q&A across lesson + class_session with optimistic conflicts, owner isolation, native parity & outbox", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  const teacher = (await pg.query(
    `INSERT INTO users(username,email,role) VALUES ('d7-teacher','d7-teacher@example.test','creator') RETURNING id,role`,
  )).rows[0];
  const studentA = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d7-stu-a','d7-a@example.test','user',FALSE,'unmanaged') RETURNING id,role,is_management_managed`,
  )).rows[0];
  const studentB = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('d7-stu-b','d7-b@example.test','user',FALSE,'unmanaged') RETURNING id,role,is_management_managed`,
  )).rows[0];

  const idA = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at) VALUES ($1,'moly','moly-d7-a','active',NOW()) RETURNING id`,
    [studentA.id],
  )).rows[0];
  const idB = (await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at) VALUES ($1,'moly','moly-d7-b','active',NOW()) RETURNING id`,
    [studentB.id],
  )).rows[0];

  // Setup BOTH an INDEPENDENT profile (lesson) AND a MIRROR profile (class_session)
  const courseIndep = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('D7 Indep','D7 Indep','d7-indep',$1,TRUE,FALSE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const profileIndep = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,mode,enforce_trusted_devices,device_limit,status)
     VALUES ($1,'INDEPENDENT',FALSE,2,'active') RETURNING id`,
    [courseIndep.id],
  )).rows[0];
  const sec = (await pg.query(`INSERT INTO sections(course_id,title,sort_order) VALUES ($1,'S1',1) RETURNING id`, [courseIndep.id])).rows[0];
  const lesson = (await pg.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,sort_order,is_published)
     VALUES ($1,$2,'D7 Lesson 1','D7 Lesson 1',120,1,TRUE) RETURNING id`,
    [courseIndep.id, sec.id],
  )).rows[0];

  const courseMirror = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('D7 Mirror','D7 Mirror','d7-mirror',$1,TRUE,FALSE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await pg.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('D7 Live Class',$1,$2,'active') RETURNING id`,
    [courseMirror.id, teacher.id],
  )).rows[0];
  const profileMirror = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,enforce_trusted_devices,device_limit,status)
     VALUES ($1,'MIRROR',$2,FALSE,2,'active') RETURNING id`,
    [courseMirror.id, liveClass.id],
  )).rows[0];
  const session = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'D7 Session 1',NOW() - INTERVAL '2 hours',NOW() - INTERVAL '1 hour','ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO external_entitlements
       (user_id,external_identity_id,source_system,external_grant_id,external_user_id,external_course_id,local_course_id,local_video_course_profile_id,status,valid_from,source_updated_at)
     VALUES ($1,$2,'moly','grant-d7-a1','moly-d7-a','ext-course-d7-i',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW()),
            ($1,$2,'moly','grant-d7-a2','moly-d7-a','ext-course-d7-m',$5,$6,'active',NOW() - INTERVAL '1 hour',NOW()),
            ($7,$8,'moly','grant-d7-b1','moly-d7-b','ext-course-d7-i',$3,$4,'active',NOW() - INTERVAL '1 hour',NOW())`,
    [studentA.id, idA.id, courseIndep.id, profileIndep.id, courseMirror.id, profileMirror.id, studentB.id, idB.id],
  );

  // Session for A without bookmarks:rw first -> test scope rejection, then full session with bookmarks:rw
  const sessionNoBookmark = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d7-a",
    profileId: profileIndep.id,
    scopes: ["workspace:read", "notes:rw", "qa:rw"],
    ttlSeconds: 300,
    correlationId: "corr-d7-nobm",
  });
  const sessionAIndep = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d7-a",
    profileId: profileIndep.id,
    scopes: ["workspace:read", "notes:rw", "bookmarks:rw", "qa:rw"],
    ttlSeconds: 300,
    correlationId: "corr-d7-a-indep",
  });
  const sessionAMirror = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d7-a",
    profileId: profileMirror.id,
    scopes: ["workspace:read", "notes:rw", "bookmarks:rw", "qa:rw"],
    ttlSeconds: 300,
    correlationId: "corr-d7-a-mir",
  });
  const sessionBIndep = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-d7-b",
    profileId: profileIndep.id,
    scopes: ["workspace:read", "notes:rw", "bookmarks:rw", "qa:rw"],
    ttlSeconds: 300,
    correlationId: "corr-d7-b-indep",
  });

  const app = express();
  app.use(express.json({ limit: "1mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({ db, verifyRead, verifyWrite }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // --- NOTES: Create + Idempotency + Update + 409 Conflict + Owner Isolation + Native Parity + Bodyless DELETE ---
  const noteCreate1 = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes`,
    body: { timestampSeconds: 42, content: "First delegated note" },
    sessionToken: sessionAIndep.sessionToken,
    idempotencyKey: "note-idem-1",
  });
  assert.equal(noteCreate1.status, 201);
  const createdNote = (await noteCreate1.json()).data.note;
  assert.equal(createdNote.revision, 1);

  const noteReplay = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes`,
    body: { timestampSeconds: 42, content: "First delegated note" },
    sessionToken: sessionAIndep.sessionToken,
    idempotencyKey: "note-idem-1",
  });
  assert.equal(noteReplay.status, 200);
  assert.equal((await noteReplay.json()).data.note.id, createdNote.id);

  // Student B cannot list, update, or delete Student A's private note
  const bNotesRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes`,
    sessionToken: sessionBIndep.sessionToken,
  });
  assert.equal((await bNotesRes.json()).data.notes.length, 0);

  const bUpdateNote = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes/${createdNote.id}`,
    body: { content: "Hacked!", expectedRevision: 1 },
    sessionToken: sessionBIndep.sessionToken,
  });
  assert.equal(bUpdateNote.status, 403);

  // Student A updates note -> rev 2; stale rev 1 triggers 409 REVISION_CONFLICT
  const aUpdateOk = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes/${createdNote.id}`,
    body: { content: "Edited delegated note", expectedRevision: 1 },
    sessionToken: sessionAIndep.sessionToken,
  });
  assert.equal(aUpdateOk.status, 200);
  assert.equal((await aUpdateOk.json()).data.note.revision, 2);

  const aStaleConflict = await callV2(baseUrl, {
    method: "PUT",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes/${createdNote.id}`,
    body: { content: "Stale edit", expectedRevision: 1 },
    sessionToken: sessionAIndep.sessionToken,
  });
  assert.equal(aStaleConflict.status, 409);
  const conflictJson = await aStaleConflict.json();
  assert.equal(conflictJson.errorCode, "REVISION_CONFLICT");
  assert.equal(conflictJson.details.currentRevision, 2);

  // Native note created on Course router reflects in delegated GET & emits outbox!
  const nativeNoteRes = await invokeRouter(videoCourseRouter, "post", "/:offeringId/units/:unitId/notes", {
    params: { offeringId: `profile-${profileIndep.id}`, unitId: String(lesson.id) },
    body: { timestampSeconds: 88, content: "Native Course note", unitType: "lesson" },
    user: { id: studentA.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeNoteRes.statusCode, 201);
  const nativeNoteId = nativeNoteRes.body.data.id;

  const delegatedNotesAfter = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes`,
    sessionToken: sessionAIndep.sessionToken,
  });
  const notesList = (await delegatedNotesAfter.json()).data.notes;
  assert.equal(notesList.length, 2);
  assert.ok(notesList.some((n) => n.id === nativeNoteId && n.content === "Native Course note"));

  // Bodyless DELETE on delegated note -> tombstone!
  const noteDelRes = await callV2(baseUrl, {
    method: "DELETE",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/notes/${createdNote.id}?expectedRevision=2`,
    sessionToken: sessionAIndep.sessionToken,
  });
  assert.equal(noteDelRes.status, 200);
  assert.equal((await noteDelRes.json()).data.deleted, true);

  // --- BOOKMARKS: Scope check, Create/List/Delete + Conflict + Native Parity ---
  const bmScopeDenied = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/bookmarks`,
    body: { timestampSeconds: 15, label: "No scope" },
    sessionToken: sessionNoBookmark.sessionToken,
  });
  assert.equal(bmScopeDenied.status, 403);
  assert.equal((await bmScopeDenied.json()).errorCode, "DELEGATED_SCOPE_DENIED");

  const bmCreate = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/bookmarks`,
    body: { timestampSeconds: 15, label: "Key formula" },
    sessionToken: sessionAIndep.sessionToken,
    idempotencyKey: "bm-idem-1",
  });
  assert.equal(bmCreate.status, 201);
  const bookmark = (await bmCreate.json()).data.bookmark;

  const nativeBmList = await invokeRouter(videoCourseRouter, "get", "/:offeringId/units/:unitId/bookmarks", {
    params: { offeringId: `profile-${profileIndep.id}`, unitId: String(lesson.id) },
    query: { unitType: "lesson" },
    user: { id: studentA.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(nativeBmList.statusCode, 200);
  assert.equal(nativeBmList.body.data.length, 1);

  const bmDelConflict = await callV2(baseUrl, {
    method: "DELETE",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/bookmarks/${bookmark.id}?expectedRevision=9`,
    sessionToken: sessionAIndep.sessionToken,
  });
  assert.equal(bmDelConflict.status, 409);

  const bmDelOk = await callV2(baseUrl, {
    method: "DELETE",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/bookmarks/${bookmark.id}?expectedRevision=1`,
    sessionToken: sessionAIndep.sessionToken,
  });
  assert.equal(bmDelOk.status, 200);

  // --- UNIT Q&A: Both INDEPENDENT lesson + MIRROR class_session, teacher reply -> answered, NO duplicate notifications! ---
  const qaLessonCreate = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/offerings/${profileIndep.id}/units/${lesson.id}/qa`,
    body: { title: "Lesson Q1", body: "Why is this formula squared?" },
    sessionToken: sessionAIndep.sessionToken,
    idempotencyKey: "qa-lesson-1",
  });
  assert.equal(qaLessonCreate.status, 201);
  const lessonThread = (await qaLessonCreate.json()).data.thread;
  assert.equal(lessonThread.unitType, "lesson");
  assert.equal(lessonThread.status, "open");

  const qaSessionNativeCreate = await invokeRouter(videoCourseRouter, "post", "/:offeringId/units/:unitId/qa", {
    params: { offeringId: `profile-${profileMirror.id}`, unitId: String(session.id) },
    body: { title: "Session Q1", body: "Please clarify slide 4", unitType: "class_session" },
    user: { id: studentA.id, role: "user", is_management_managed: false, lms_account_status: "unmanaged" },
  });
  assert.equal(qaSessionNativeCreate.statusCode, 201);
  const sessionThread = qaSessionNativeCreate.body.data;
  assert.equal(sessionThread.unitType, "class_session");

  // Visible in delegated GET for MIRROR session
  const mirrorQaList = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/units/${session.id}/qa`,
    sessionToken: sessionAMirror.sessionToken,
  });
  assert.equal(mirrorQaList.status, 200);
  assert.equal((await mirrorQaList.json()).data.threads.length, 1);

  // Teacher replies natively on MIRROR thread -> status transitions to 'answered', revision 2, zero duplicate notifications!
  const teacherReplyRes = await invokeRouter(videoCourseRouter, "post", "/qa/threads/:threadId/replies", {
    params: { threadId: sessionThread.id },
    body: { body: "Slide 4 uses Newton second law." },
    user: { id: teacher.id, role: "creator" },
  });
  assert.equal(teacherReplyRes.statusCode, 201);
  assert.equal(teacherReplyRes.body.data.thread.status, "answered");
  assert.equal(teacherReplyRes.body.data.thread.revision, 2);

  // Non-owner student B cannot resolve student A's lesson thread
  const bResolveForbidden = await callV2(baseUrl, {
    method: "PATCH",
    path: `/learning/qa/threads/${lessonThread.id}/status`,
    body: { status: "resolved" },
    sessionToken: sessionBIndep.sessionToken,
  });
  assert.equal(bResolveForbidden.status, 403);

  // Student A marks MIRROR thread read + resolved with expectedRevision: 2 (stale 1 -> 409)
  const staleQaStatus = await callV2(baseUrl, {
    method: "PATCH",
    path: `/learning/qa/threads/${sessionThread.id}/status`,
    body: { status: "resolved", markRead: true, expectedRevision: 1 },
    sessionToken: sessionAMirror.sessionToken,
  });
  assert.equal(staleQaStatus.status, 409);

  const resolveQaOk = await callV2(baseUrl, {
    method: "PATCH",
    path: `/learning/qa/threads/${sessionThread.id}/status`,
    body: { status: "resolved", markRead: true, expectedRevision: 2 },
    sessionToken: sessionAMirror.sessionToken,
  });
  assert.equal(resolveQaOk.status, 200);
  const resolvedThread = (await resolveQaOk.json()).data.thread;
  assert.equal(resolvedThread.status, "resolved");
  assert.equal(resolvedThread.hasUnreadReplies, false);

  // Verify outbox event types & ZERO duplicate notification rows
  const outboxD7 = (await pg.query(
    `SELECT event_type, aggregate_id, payload FROM course_integration_outbox ORDER BY aggregate_revision ASC`,
  )).rows;
  assert.ok(outboxD7.some((e) => e.event_type === "learning.note.upserted"));
  assert.ok(outboxD7.some((e) => e.event_type === "learning.note.tombstoned"));
  assert.ok(outboxD7.some((e) => e.event_type === "learning.bookmark.upserted"));
  assert.ok(outboxD7.some((e) => e.event_type === "learning.bookmark.tombstoned"));
  assert.ok(outboxD7.some((e) => e.event_type === "qa.thread.updated" && e.payload.payload.unitType === "lesson"));
  assert.ok(outboxD7.some((e) => e.event_type === "qa.thread.updated" && e.payload.payload.unitType === "class_session" && e.payload.payload.thread.status === "resolved"));

  const notifCount = Number((await pg.query(`SELECT COUNT(*)::int AS cnt FROM notifications`)).rows[0].cnt);
  assert.equal(notifCount, 0);
});

test("Day 6+ admin role bypasses sequential lock & attempt limits while fill_blank_pool exposes linkedOptions", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  const adminUser = (await pg.query(
    `INSERT INTO users (username, email, role, is_locked, is_management_managed, lms_account_status)
     VALUES ('admin-lms', 'admin@example.test', 'admin', FALSE, FALSE, 'active') RETURNING *`,
  )).rows[0];
  const course = (await pg.query(
    `INSERT INTO courses (name, title, slug, is_published, author_id)
     VALUES ('CSCA Admin Unlock Course', 'CSCA Admin Unlock Course', 'admin-unlock', TRUE, $1) RETURNING *`,
    [adminUser.id],
  )).rows[0];
  const liveClass = (await pg.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Admin Unlock Live Class',$1,$2,'active') RETURNING *`,
    [course.id, adminUser.id],
  )).rows[0];
  const profile = (await pg.query(
    `INSERT INTO video_course_profiles (course_id, mode, source_live_class_id, allow_file_download, status)
     VALUES ($1, 'MIRROR', $2, FALSE, 'active') RETURNING *`,
    [course.id, liveClass.id],
  )).rows[0];
  const l1 = (await pg.query(
    `INSERT INTO class_sessions (live_class_id, title, start_time, end_time, status)
     VALUES ($1, 'Unit 1', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours', 'ended') RETURNING *`,
    [liveClass.id],
  )).rows[0];
  const l2 = (await pg.query(
    `INSERT INTO class_sessions (live_class_id, title, start_time, end_time, status)
     VALUES ($1, 'Unit 2 (Locked for Student)', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'ended') RETURNING *`,
    [liveClass.id],
  )).rows[0];
  const l1Vid = (await pg.query(
    `INSERT INTO video_assets(title,r2_key,provider,provider_video_id,duration_seconds,playback_status)
     VALUES ('Admin Vid 1','videos/admin-v1.mp4','bunny_stream','bunny-adm-1',100,'ready') RETURNING *`,
  )).rows[0];
  await pg.query(
    `INSERT INTO class_session_videos(class_session_id,video_asset_id,title,video_type,sort_order,is_published)
     VALUES ($1,$2,'Part 1','primary',0,TRUE)`,
    [l1.id, l1Vid.id],
  );
  await pg.query(
    `INSERT INTO session_vocabularies (session_id, class_id, term, pinyin, meaning, order_index)
     VALUES ($1, $2, '高兴', 'gāoxìng', 'vui vẻ', 1)`,
    [l2.id, liveClass.id],
  );

  const quiz = (await pg.query(
    `INSERT INTO quizzes (course_id, live_class_id, class_session_id, instructor_id, title, status, passing_score, attempt_limit, review_policy, duration_minutes)
     VALUES ($1, $2, $3, $4, 'Quiz Bo Thu', 'PUBLISHED', 60, 1, 'after_submit', 10) RETURNING *`,
    [course.id, liveClass.id, l2.id, adminUser.id],
  )).rows[0];
  const grp = (await pg.query(
    `INSERT INTO quiz_question_groups (quiz_id, group_type, passage_text, linked_options, cloze_mode, sort_order)
     VALUES ($1, 'fill_blank_pool', 'Nối bộ thủ', $2::jsonb, 'sentences', 1) RETURNING *`,
    [quiz.id, JSON.stringify([{ key: "A", text: "Lời nói" }, { key: "C", text: "Bệnh tật" }])],
  )).rows[0];
  const qq = (await pg.query(
    `INSERT INTO quiz_questions (quiz_id, group_id, item_order, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
     VALUES ($1, $2, 1, '(1) Bộ 疒', 'fill_blank_item', '[]'::jsonb, 'C', 'Liên quan bệnh tật', 10, 1) RETURNING *`,
    [quiz.id, grp.id],
  )).rows[0];

  const app = express();
  app.use(express.json({ limit: "2mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({ db, verifyRead, verifyWrite }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // Direct S2S mint for Moly admin without external_identities link unlocks Unit 2 immediately
  const adminMintRes = await callV2(baseUrl, {
    method: "POST",
    path: "/learning/sessions",
    body: {
      externalUserId: "moly-5",
      profileId: profile.id,
      scopes: ["workspace:read", "quiz:attempt"],
      actorRole: "admin",
      actorEmail: "admin@example.test",
    },
    idempotencyKey: "mint-admin-direct-1",
  });
  assert.equal(adminMintRes.status, 201);
  const adminToken = (await adminMintRes.json()).data.sessionToken;

  const wsRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/workspace?unitId=${l2.id}`,
    sessionToken: adminToken,
  });
  assert.equal(wsRes.status, 200);
  const wsData = (await wsRes.json()).data;
  assert.equal(wsData.units.every((u) => u.isLocked === false), true);
  assert.equal(wsData.activeUnit.isLocked, false);
  assert.equal(wsData.activeUnit.vocabulary.length, 1);

  const quizDetailRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${l2.id}/quizzes/${quiz.id}`,
    sessionToken: adminToken,
  });
  assert.equal(quizDetailRes.status, 200);
  const qDetail = (await quizDetailRes.json()).data;
  assert.equal(qDetail.canStartAttempt, true);
  assert.equal(qDetail.quiz.items[0].kind, "fill_blank_group");
  assert.equal(qDetail.quiz.items[0].linkedOptions[1].text, "Bệnh tật");

  // Take 2 attempts despite attempt_limit = 1 because viewer is admin
  for (const idx of [1, 2]) {
    const sRes = await callV2(baseUrl, {
      method: "POST",
      path: `/learning/quizzes/${quiz.id}/attempts/start`,
      body: { profileId: profile.id, unitId: l2.id },
      sessionToken: adminToken,
      idempotencyKey: `admin-quiz-start-${idx}`,
    });
    assert.equal(sRes.status, 200);
    const attemptId = (await sRes.json()).data.attempt.id;
    const subRes = await callV2(baseUrl, {
      method: "POST",
      path: `/learning/quizzes/attempts/${attemptId}/submit`,
      body: { answers: { [String(qq.id)]: "C" } },
      sessionToken: adminToken,
      idempotencyKey: `admin-quiz-submit-${idx}`,
    });
    assert.equal(subRes.status, 200);
    const subData = (await subRes.json()).data;
    assert.equal(subData.score, 10);
    assert.equal(subData.review[0].options[1].text, "Bệnh tật");
  }
});

test("Day 10 Live vs Record flow separation: live MIRROR learner bypasses locks, previews answers, and retries past attempt_limit while recording stays gated", async (t) => {
  await withTempR2Env(t);
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  const teacher = (await pg.query(
    `INSERT INTO users(username,email,role) VALUES ('sep-teacher','sep-teacher@example.test','creator') RETURNING id`,
  )).rows[0];
  const liveLearner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('sep-live','sep-live@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const recLearner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('sep-rec','sep-rec@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];

  await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at)
     VALUES ($1,'moly','moly-sep-live','active',NOW()), ($2,'moly','moly-sep-rec','active',NOW())`,
    [liveLearner.id, recLearner.id],
  );

  const course = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('Course Sep','Course Sep','course-sep',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await pg.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Sep Live Class',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const sess1 = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 1',NOW() - INTERVAL '3 days',NOW() - INTERVAL '3 days' + INTERVAL '1 hour','scheduled',FALSE) RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const sess2 = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 2',NOW() - INTERVAL '1 day',NOW() - INTERVAL '1 day' + INTERVAL '1 hour','scheduled',FALSE) RETURNING id`,
    [liveClass.id],
  )).rows[0];

  const v1 = (await pg.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Sep V1','bunny_stream','111','sep-v1','ready',120) RETURNING id`,
  )).rows[0];
  const v2 = (await pg.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Sep V2','bunny_stream','111','sep-v2','ready',120) RETURNING id`,
  )).rows[0];
  await pg.query(
    `INSERT INTO class_session_videos(class_session_id,video_asset_id,video_type,is_published)
     VALUES ($1,$2,'primary',TRUE), ($3,$4,'primary',TRUE)`,
    [sess1.id, v1.id, sess2.id, v2.id],
  );

  const profileMirror = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,management_class_id,mode,source_live_class_id,enforce_trusted_devices,allow_file_download,status)
     VALUES ($1,'sep-alias-1','MIRROR',$2,FALSE,FALSE,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$3,'active',NOW() - INTERVAL '1 hour',NOW()), ($2,$3,'active',NOW() - INTERVAL '1 hour',NOW())`,
    [liveLearner.id, recLearner.id, course.id],
  );
  await pg.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,course_id,learning_mode,status)
     VALUES ($1,$3,$4,'live','active'), ($2,$3,$4,'recording','active')`,
    [liveLearner.id, recLearner.id, liveClass.id, course.id],
  );

  const solBytes = Buffer.from("%PDF-1.4\nLIVE-SOLUTION\n");
  const solFile = (await pg.query(
    `INSERT INTO lms_learning_files(course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,'SepSolution.pdf','learning-files/sep-sol.pdf','application/pdf',$3,'COURSE','ready') RETURNING id`,
    [course.id, teacher.id, solBytes.length],
  )).rows[0];
  await pg.query(
    `INSERT INTO lms_learning_file_placements(file_id,live_class_id,class_session_id,attached_by,visibility)
     VALUES ($1,$2,$3,$4,'COURSE')`,
    [solFile.id, liveClass.id, sess2.id, teacher.id],
  );

  const quiz2 = (await pg.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score,attempt_limit,review_policy,available_until,solution_file_id)
     VALUES ('Quiz Buoi 2',$1,$2,$3,$4,'PUBLISHED',30,60,1,'never',NOW() + INTERVAL '2 days',$5) RETURNING id`,
    [course.id, liveClass.id, sess2.id, teacher.id, solFile.id],
  )).rows[0];
  const q1 = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'Chon nghia dung','single_choice',$2::jsonb,'A','Giai thich A',10,1) RETURNING id`,
    [quiz2.id, JSON.stringify([{ key: "A", text: "Chuan" }, { key: "B", text: "Sai" }])],
  )).rows[0];

  const liveSession = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-sep-live",
    profileId: profileMirror.id,
    scopes: ["workspace:read", "video:play", "progress:write", "file:view", "quiz:attempt", "assignment:submit"],
    ttlSeconds: 300,
    correlationId: "corr-sep-live",
  });
  const recSession = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-sep-rec",
    profileId: profileMirror.id,
    scopes: ["workspace:read", "video:play", "progress:write", "file:view", "quiz:attempt", "assignment:submit"],
    ttlSeconds: 300,
    correlationId: "corr-sep-rec",
  });

  const app = express();
  app.use(express.json({ limit: "2mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead,
    verifyWrite,
    fileStreamFetchImpl: async () => new Response(solBytes, {
      status: 200,
      headers: { "content-type": "application/pdf", "content-length": String(solBytes.length), "accept-ranges": "bytes" },
    }),
  }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // Record learner stays sequentially gated (Buoi 2 locked until Buoi 1 video >= 50% + quiz completed)
  const recWs = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/workspace`,
    sessionToken: recSession.sessionToken,
  });
  assert.equal(recWs.status, 200);
  const recWsData = (await recWs.json()).data;
  assert.equal(recWsData.capabilities.canReviewFreely, false);
  assert.equal(recWsData.units[1].isLocked, true);

  const recUnit2 = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/units/${sess2.id}`,
    sessionToken: recSession.sessionToken,
  });
  assert.equal(recUnit2.status, 403);
  assert.equal((await recUnit2.json()).errorCode, "UNIT_LOCKED");

  // Live learner opens workspace & Buoi 2 directly with zero prior video/BTVN progress
  const liveWs = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/workspace?unitId=${sess2.id}`,
    sessionToken: liveSession.sessionToken,
  });
  assert.equal(liveWs.status, 200);
  const liveWsData = (await liveWs.json()).data;
  assert.equal(liveWsData.capabilities.canReviewFreely, true);
  assert.equal(liveWsData.units[0].isLocked, false);
  assert.equal(liveWsData.units[1].isLocked, false);

  const liveUnit2 = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/units/${sess2.id}`,
    sessionToken: liveSession.sessionToken,
  });
  assert.equal(liveUnit2.status, 200);
  const liveUnit2Data = (await liveUnit2.json()).data;
  assert.equal(liveUnit2Data.quizzes[0].attemptLimit, null);
  assert.equal(liveUnit2Data.quizzes[0].canViewSolution, true);
  assert.equal(liveUnit2Data.quizzes[0].canStartAttempt, true);

  // Live quiz detail exposes instant reviewItems even with 0 attempts and review_policy='never'
  const liveQuizDetailRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profileMirror.id}/units/${sess2.id}/quizzes/${quiz2.id}`,
    sessionToken: liveSession.sessionToken,
  });
  assert.equal(liveQuizDetailRes.status, 200);
  const liveQuizDetail = (await liveQuizDetailRes.json()).data;
  assert.equal(liveQuizDetail.canReviewFreely, true);
  assert.equal(liveQuizDetail.quiz.attemptLimit, null);
  assert.equal(liveQuizDetail.quiz.canViewSolution, true);
  assert.equal(String(liveQuizDetail.quiz.solutionFileId), String(solFile.id));
  assert.ok(Array.isArray(liveQuizDetail.reviewItems) && liveQuizDetail.reviewItems.length === 1);
  assert.equal(liveQuizDetail.reviewItems[0].correct_answer ?? liveQuizDetail.reviewItems[0].correctAnswer, "A");

  // Live learner can complete 2+ attempts despite attempt_limit = 1
  for (let attemptNo = 1; attemptNo <= 2; attemptNo += 1) {
    const startRes = await callV2(baseUrl, {
      method: "POST",
      path: `/learning/quizzes/${quiz2.id}/attempts/start`,
      body: { profileId: profileMirror.id, unitId: sess2.id },
      sessionToken: liveSession.sessionToken,
      idempotencyKey: `live-sep-start-${attemptNo}`,
    });
    assert.equal(startRes.status, 200);
    const attemptId = (await startRes.json()).data.attempt.id;

    const subRes = await callV2(baseUrl, {
      method: "POST",
      path: `/learning/quizzes/attempts/${attemptId}/submit`,
      body: { answers: { [String(q1.id)]: "A" } },
      sessionToken: liveSession.sessionToken,
      idempotencyKey: `live-sep-sub-${attemptNo}`,
    });
    assert.equal(subRes.status, 200);
    const subData = (await subRes.json()).data;
    assert.equal(subData.score, 10);
    assert.ok(Array.isArray(subData.review) && subData.review.length === 1);
  }

  // Live learner streams solution PDF immediately despite review_policy='never' & available_until in future
  const liveSolRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/files/${solFile.id}/stream?profileId=${profileMirror.id}&unitId=${sess2.id}`,
    sessionToken: liveSession.sessionToken,
  });
  assert.equal(liveSolRes.status, 200);
});

test("Day 6 parity: delegated quiz essay asset upload, save/submit validation, and authenticated asset stream", async (t) => {
  await withTempR2Env(t);
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  bindPoolToDb(pool, pg);
  const db = makeDbAdapter(pg);

  const teacher = (await pg.query(
    `INSERT INTO users(username,email,role) VALUES ('qt-essay','qt@csca.vn','creator') RETURNING id`,
  )).rows[0];
  const learner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('qs-essay','qs@csca.vn','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const otherLearner = (await pg.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('qo-essay','qo@csca.vn','user',TRUE,'active') RETURNING id`,
  )).rows[0];

  await pg.query(
    `INSERT INTO external_identities(user_id,source_system,external_user_id,status,source_updated_at)
     VALUES ($1,'moly','moly-essay-s','active',NOW()), ($2,'moly','moly-essay-o','active',NOW())`,
    [learner.id, otherLearner.id],
  );

  const course = (await pg.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed)
     VALUES ('Essay Quiz Course','Essay Quiz Course','essay-quiz-course',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await pg.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Essay LC',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const sess1 = (await pg.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buoi 1 Essay',NOW() - INTERVAL '2 days',NOW() - INTERVAL '2 days' + INTERVAL '1 hour','scheduled') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const profile = (await pg.query(
    `INSERT INTO video_course_profiles(course_id,management_class_id,mode,source_live_class_id,enforce_trusted_devices,allow_file_download,status)
     VALUES ($1,'essay-alias-1','MIRROR',$2,FALSE,FALSE,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];

  await pg.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$3,'active',NOW() - INTERVAL '1 hour',NOW()), ($2,$3,'active',NOW() - INTERVAL '1 hour',NOW())`,
    [learner.id, otherLearner.id, course.id],
  );
  await pg.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,course_id,learning_mode,status)
     VALUES ($1,$3,$4,'live','active'), ($2,$3,$4,'live','active')`,
    [learner.id, otherLearner.id, liveClass.id, course.id],
  );

  const quizDescJson = JSON.stringify({
    text: "Bai thi co phan tu luan",
    essayConfig: { enabled: true, maxScore: 5, prompt: "Viet chi tiet" },
  });
  const quiz = (await pg.query(
    `INSERT INTO quizzes(title,description,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score,attempt_limit,review_policy)
     VALUES ('Quiz Essay',$1,$2,$3,$4,$5,'PUBLISHED',30,50,2,'after_submit') RETURNING id`,
    [quizDescJson, course.id, liveClass.id, sess1.id, teacher.id],
  )).rows[0];
  const essayQ = (await pg.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_text_cn,question_type,options_json,correct_answer,points,sort_order)
     VALUES ($1,'Viet doan van ngan','写一段短文','essay','[]'::jsonb,NULL,5,1) RETURNING id`,
    [quiz.id],
  )).rows[0];

  const learnerSession = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-essay-s",
    profileId: profile.id,
    scopes: ["workspace:read", "quiz:attempt", "assignment:submit"],
    ttlSeconds: 300,
    correlationId: "corr-essay-s",
  });
  const otherSession = await mintDelegatedLearningSession({
    db,
    externalUserId: "moly-essay-o",
    profileId: profile.id,
    scopes: ["workspace:read", "quiz:attempt"],
    ttlSeconds: 300,
    correlationId: "corr-essay-o",
  });

  const storedAssets = new Map();
  const imgBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  const app = express();
  app.use(express.json({ limit: "2mb", verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
  const verifyRead = createRequireMolyIntegration({ requireIdempotencyKey: false, allowBodylessGet: true, configOverrides: TEST_MOLY_CFG });
  const verifyWrite = createRequireMolyIntegration({ requireIdempotencyKey: true, allowBodylessDelete: true, configOverrides: TEST_MOLY_CFG });
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead,
    verifyWrite,
    submissionUploadImpl: async ({ filename, buffer }) => {
      const key = `submissions/test/${filename}`;
      storedAssets.set(key, buffer);
      return { storageKey: key };
    },
    fileReadStreamImpl: async ({ asset }) => ({
      status: 200,
      headers: { "content-type": asset.mime_type },
      body: storedAssets.get(asset.storage_key) || imgBytes,
    }),
  }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  const detailRes = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/offerings/${profile.id}/units/${sess1.id}/quizzes/${quiz.id}`,
    sessionToken: learnerSession.sessionToken,
  });
  assert.equal(detailRes.status, 200);
  const detailData = (await detailRes.json()).data;
  assert.equal(detailData.quiz.essayConfig?.maxScore, 5);
  assert.equal(detailData.quiz.description, "Bai thi co phan tu luan");

  const startRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/attempts/start`,
    body: { profileId: profile.id, unitId: sess1.id },
    sessionToken: learnerSession.sessionToken,
    idempotencyKey: "essay-start-1",
  });
  assert.equal(startRes.status, 200);
  const attemptId = (await startRes.json()).data.attempt.id;

  const uploadRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/${quiz.id}/submission-assets`,
    body: {
      profileId: profile.id,
      unitId: sess1.id,
      assetKind: "file",
      filename: "handwriting.png",
      mimeType: "image/png",
      sizeBytes: imgBytes.length,
      contentBase64: imgBytes.toString("base64"),
    },
    sessionToken: learnerSession.sessionToken,
    idempotencyKey: "essay-upload-1",
  });
  assert.equal(uploadRes.status, 201);
  const uploaded = (await uploadRes.json()).data;
  assert.equal(uploaded.status, "ready");
  assert.ok(uploaded.assetId);

  const subRes = await callV2(baseUrl, {
    method: "POST",
    path: `/learning/quizzes/attempts/${attemptId}/submit`,
    body: {
      answers: {
        [String(essayQ.id)]: {
          text: "Day la bai viet tay",
          notes: "Ghi chu",
          attachments: [{
            assetId: Number(uploaded.assetId),
            name: "handwriting.png",
            size: imgBytes.length,
            mimeType: "image/png",
          }],
        },
      },
    },
    sessionToken: learnerSession.sessionToken,
    idempotencyKey: "essay-submit-1",
  });
  assert.equal(subRes.status, 200);
  const subData = (await subRes.json()).data;
  assert.equal(subData.essay.byQuestion[String(essayQ.id)].attachments.length, 1);

  const ownerStream = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/submission-assets/${uploaded.assetId}/access?profileId=${profile.id}`,
    sessionToken: learnerSession.sessionToken,
  });
  assert.equal(ownerStream.status, 200);
  const gotBytes = Buffer.from(await ownerStream.arrayBuffer());
  assert.deepEqual(gotBytes, imgBytes);

  const otherStream = await callV2(baseUrl, {
    method: "GET",
    path: `/learning/submission-assets/${uploaded.assetId}/access?profileId=${profile.id}`,
    sessionToken: otherSession.sessionToken,
  });
  assert.equal(otherStream.status, 403);
  assert.equal((await otherStream.json()).errorCode, "ASSET_ACCESS_FORBIDDEN");
});
