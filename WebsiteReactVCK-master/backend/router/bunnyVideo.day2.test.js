import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const invokeRoute = async (router, method, path, reqProps) => {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()],
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} not found`);

  const headers = {};
  const res = {
    statusCode: 200,
    body: null,
    headers,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  const req = {
    params: {},
    query: {},
    body: {},
    cookies: {},
    headers: {},
    ip: "127.0.0.1",
    get(name) {
      return this.headers[name.toLowerCase()] || null;
    },
    ...reqProps,
  };

  // Run route handler (last middleware in stack after protectRoute/requireAdminOrTeacher)
  const handler = layer.route.stack.at(-1).handle;
  await handler(req, res);
  return res;
};

test("Day 2 Bunny Stream E2E: TUS upload intent, idempotent & out-of-order webhooks, publish gate, signed playback, anti-cheat progress, and Independent lesson content", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  process.env.BUNNY_STREAM_LIBRARY_ID = "998877";
  process.env.BUNNY_STREAM_API_KEY = "super-secret-bunny-api-key-never-leak";
  process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY = "super-secret-bunny-signing-key-never-leak";
  process.env.BUNNY_STREAM_CDN_HOSTNAME = "vz-test-moly.b-cdn.net";
  process.env.BUNNY_STREAM_CDN_TOKEN_SECURITY_KEY = "super-secret-cdn-token-key";
  process.env.BUNNY_STREAM_LIVE_HTTP = "false";

  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);

  const bunnyVideoRouter = (await import("./bunnyVideo.router.js")).default;
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  // Seed users: admin, record learner, and live-only sibling learner
  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('admin-bunny','admin@moly.test','admin') RETURNING id, email, role",
  )).rows[0];
  const recordStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('record-learner','record@moly.test','user',TRUE,'active')
     RETURNING id, email, role, is_management_managed, lms_account_status`,
  )).rows[0];
  const liveOnlyStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('live-only-learner','liveonly@moly.test','user',TRUE,'active')
     RETURNING id, email, role, is_management_managed, lms_account_status`,
  )).rows[0];

  // Seed MIRROR course & source live class
  const mirrorCourse = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('HSK 4 Mirror Video Course','hsk4-mirror-video',$1,TRUE,TRUE) RETURNING id`,
    [admin.id],
  )).rows[0];
  const sourceLiveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('HSK 4 Live Source K12',$1,$2,'active') RETURNING id`,
    [mirrorCourse.id, admin.id],
  )).rows[0];
  const session1 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buổi 1: Ngữ pháp trọng điểm HSK4',NOW() - INTERVAL '3 hours',NOW() - INTERVAL '1 hour','ended') RETURNING id`,
    [sourceLiveClass.id],
  )).rows[0];

  await db.query(
    `INSERT INTO video_course_profiles(course_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, 'MIRROR', $2, TRUE, 2, 'active')`,
    [mirrorCourse.id, sourceLiveClass.id],
  );

  // Both students have course grant, but only recordStudent has 'recording' class membership; liveOnlyStudent has 'live'
  for (const stu of [recordStudent, liveOnlyStudent]) {
    await db.query(
      `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
       VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
      [stu.id, mirrorCourse.id],
    );
  }
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','recording')`,
    [recordStudent.id, sourceLiveClass.id],
  );
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','live')`,
    [liveOnlyStudent.id, sourceLiveClass.id],
  );

  // 1. Admin creates TUS upload intent
  const uploadIntentRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/video-assets/upload-intent", {
    user: admin,
    body: {
      title: "HSK 4 Buổi 1 Full HD",
      fileSizeBytes: 250_000_000,
      mimeType: "video/mp4",
    },
  });
  assert.equal(uploadIntentRes.statusCode, 201, JSON.stringify(uploadIntentRes.body));
  const uploadData = uploadIntentRes.body.data;
  assert.equal(uploadData.provider, "bunny_stream");
  assert.equal(uploadData.playbackStatus, "uploading");
  assert.equal(uploadData.tusEndpoint, "https://video.bunnycdn.com/tusupload");
  assert.ok(uploadData.tusHeaders.AuthorizationSignature);
  assert.ok(uploadData.tusHeaders.AuthorizationExpire);
  assert.equal(uploadData.tusHeaders.LibraryId, "998877");
  // Ensure secret API key is NEVER leaked in response
  assert.equal(JSON.stringify(uploadIntentRes.body).includes("super-secret-bunny-api-key-never-leak"), false);

  const assetId = uploadData.assetId;
  const videoGuid = uploadData.providerVideoId;

  // 2. Attach video to session1 (unpublished initially)
  const attachRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/learning-units/:unitId/videos", {
    user: admin,
    params: { unitId: String(session1.id) },
    body: {
      videoAssetId: assetId,
      unitType: "class_session",
      title: "Phần 1: Ngữ pháp",
      videoType: "primary",
      isPublished: false,
    },
  });
  assert.equal(attachRes.statusCode, 201, JSON.stringify(attachRes.body));

  // 3. Attempting to publish while still 'uploading' must fail with 409 VIDEO_NOT_READY
  const prematurePublishRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/videos/:videoId/publish", {
    user: admin,
    params: { videoId: assetId },
  });
  assert.equal(prematurePublishRes.statusCode, 409);
  assert.equal(prematurePublishRes.body.errorCode, "VIDEO_NOT_READY");

  // 4. Bunny webhook sends Status=1 (processing), then Status=3 (ready)
  const webhookProcessingRes = await invokeRoute(bunnyVideoRouter, "post", "/webhooks/bunny-stream", {
    body: {
      EventId: "evt-proc-001",
      VideoLibraryId: "998877",
      VideoGuid: videoGuid,
      Status: 1,
    },
  });
  assert.equal(webhookProcessingRes.statusCode, 200);
  assert.equal(webhookProcessingRes.body.data.playbackStatus, "processing");

  // Learner trying to get playback token while processing -> blocked with 409
  const tokenWhileProcessing = await invokeRoute(bunnyVideoRouter, "post", "/videos/:videoId/playback-token", {
    user: recordStudent,
    params: { videoId: assetId },
  });
  assert.equal(tokenWhileProcessing.statusCode, 409);
  assert.equal(tokenWhileProcessing.body.errorCode, "VIDEO_NOT_READY");

  // Webhook Status=3 (ready) with duration 200s
  const webhookReadyRes = await invokeRoute(bunnyVideoRouter, "post", "/webhooks/bunny-stream", {
    body: {
      EventId: "evt-ready-002",
      VideoLibraryId: "998877",
      VideoGuid: videoGuid,
      Status: 3,
      Length: 200,
      AvailableResolutions: "360p,720p,1080p",
    },
  });
  assert.equal(webhookReadyRes.statusCode, 200);
  assert.equal(webhookReadyRes.body.data.playbackStatus, "ready");
  assert.equal(webhookReadyRes.body.data.duplicate, false);

  // Duplicate webhook with same EventId -> idempotent, duplicate: true
  const webhookDuplicateRes = await invokeRoute(bunnyVideoRouter, "post", "/webhooks/bunny-stream", {
    body: {
      EventId: "evt-ready-002",
      VideoLibraryId: "998877",
      VideoGuid: videoGuid,
      Status: 3,
      Length: 200,
    },
  });
  assert.equal(webhookDuplicateRes.statusCode, 200);
  assert.equal(webhookDuplicateRes.body.data.duplicate, true);

  // Out-of-order webhook (late 'uploading' Status=6 arriving after 'ready') -> ignored, status stays 'ready'
  const webhookOutOfOrderRes = await invokeRoute(bunnyVideoRouter, "post", "/webhooks/bunny-stream", {
    body: {
      EventId: "evt-late-upload-000",
      VideoLibraryId: "998877",
      VideoGuid: videoGuid,
      Status: 6,
    },
  });
  assert.equal(webhookOutOfOrderRes.statusCode, 200);
  assert.equal(webhookOutOfOrderRes.body.data.outOfOrder, true);
  assert.equal(webhookOutOfOrderRes.body.data.playbackStatus, "ready");

  // 5. Learner trying to get playback token while video is ready but UNPUBLISHED -> blocked 403 VIDEO_UNPUBLISHED
  const tokenWhileUnpublished = await invokeRoute(bunnyVideoRouter, "post", "/videos/:videoId/playback-token", {
    user: recordStudent,
    params: { videoId: assetId },
  });
  assert.equal(tokenWhileUnpublished.statusCode, 403);
  assert.equal(tokenWhileUnpublished.body.errorCode, "VIDEO_UNPUBLISHED");

  // 6. Admin publishes the ready video -> 200 OK
  const publishRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/videos/:videoId/publish", {
    user: admin,
    params: { videoId: assetId },
  });
  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.body.data.isPublished, true);

  // 7. Live-only sibling learner trying to access Record workspace or playback token -> blocked 403 RECORD_MEMBERSHIP_REQUIRED
  const siblingWorkspaceRes = await invokeRoute(videoCourseRouter, "get", "/:offeringId/workspace", {
    user: liveOnlyStudent,
    params: { offeringId: String(mirrorCourse.id) },
  });
  assert.equal(siblingWorkspaceRes.statusCode, 403);
  assert.equal(siblingWorkspaceRes.body.errorCode, "RECORD_MEMBERSHIP_REQUIRED");

  const siblingPlaybackRes = await invokeRoute(bunnyVideoRouter, "post", "/videos/:videoId/playback-token", {
    user: liveOnlyStudent,
    params: { videoId: assetId },
  });
  assert.equal(siblingPlaybackRes.statusCode, 403);
  assert.equal(siblingPlaybackRes.body.errorCode, "RECORD_MEMBERSHIP_REQUIRED");

  // 8. Record learner gets signed playback token -> 200 OK with private no-store header and signed URLs
  const playbackRes = await invokeRoute(bunnyVideoRouter, "post", "/videos/:videoId/playback-token", {
    user: recordStudent,
    params: { videoId: assetId },
    body: { unitId: String(session1.id) },
  });
  assert.equal(playbackRes.statusCode, 200, JSON.stringify(playbackRes.body));
  assert.equal(playbackRes.headers["cache-control"], "private, no-store");
  assert.ok(playbackRes.body.data.embedUrl.includes("https://iframe.mediadelivery.net/embed/998877/"));
  assert.ok(playbackRes.body.data.embedUrl.includes("token="));
  assert.ok(playbackRes.body.data.hlsUrl.includes("playlist.m3u8?token="));
  assert.equal(JSON.stringify(playbackRes.body).includes("super-secret-bunny-signing-key-never-leak"), false);

  // 9. Progress heartbeat anti-cheat & completion at >= 85%
  // Spoof attempt: sending 200s watched in a single heartbeat on a 200s video is clamped to max 90s (45%)
  const spoofProgressRes = await invokeRoute(bunnyVideoRouter, "put", "/videos/:videoId/progress", {
    user: recordStudent,
    params: { videoId: assetId },
    body: {
      unitId: String(session1.id),
      currentTimeSeconds: 200,
      watchedDeltaSeconds: 200,
      durationSeconds: 200,
    },
  });
  assert.equal(spoofProgressRes.statusCode, 200);
  assert.equal(spoofProgressRes.body.data.watchedSeconds, 90);
  assert.equal(spoofProgressRes.body.data.completionPercent, 45);
  assert.equal(spoofProgressRes.body.data.isCompleted, false);

  // Second heartbeat (+85s -> total 175s / 200s = 87.5% >= 85%) marks completed = true!
  const completeProgressRes = await invokeRoute(bunnyVideoRouter, "put", "/videos/:videoId/progress", {
    user: recordStudent,
    params: { videoId: assetId },
    body: {
      unitId: String(session1.id),
      currentTimeSeconds: 175,
      watchedDeltaSeconds: 85,
      durationSeconds: 200,
    },
  });
  assert.equal(completeProgressRes.statusCode, 200);
  assert.equal(completeProgressRes.body.data.watchedSeconds, 175);
  assert.equal(completeProgressRes.body.data.completionPercent, 87.5);
  assert.equal(completeProgressRes.body.data.isCompleted, true);

  // 10. Refund / revoke entitlement blocks subsequent playback token requests immediately
  await db.query(
    `UPDATE lms_access_grants SET access_status = 'revoked' WHERE user_id = $1 AND course_id = $2`,
    [recordStudent.id, mirrorCourse.id],
  );
  const revokedPlaybackRes = await invokeRoute(bunnyVideoRouter, "post", "/videos/:videoId/playback-token", {
    user: recordStudent,
    params: { videoId: assetId },
  });
  assert.equal(revokedPlaybackRes.statusCode, 403);
  assert.equal(revokedPlaybackRes.body.errorCode, "ENTITLEMENT_INACTIVE");

  // 11. Independent Lesson Content Authoring (Theory, Vocabulary, Formula, Notes)
  const indCourse = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('CSCA Vật Lý Độc Lập','csca-physics-independent',$1,TRUE,TRUE) RETURNING id`,
    [admin.id],
  )).rows[0];
  await db.query(
    `INSERT INTO video_course_profiles(course_id, mode, source_live_class_id, status)
     VALUES ($1, 'INDEPENDENT', NULL, 'active')`,
    [indCourse.id],
  );
  const indSection = (await db.query(
    `INSERT INTO sections(course_id, title, sort_order) VALUES ($1, 'Chương 1: Cơ học', 1) RETURNING id`,
    [indCourse.id],
  )).rows[0];
  const indLesson = (await db.query(
    `INSERT INTO lessons(course_id, section_id, name, title, duration_seconds, is_published, sort_order)
     VALUES ($1, $2, 'Bài 1', 'Bài 1: Định luật Newton', 1200, TRUE, 1) RETURNING id`,
    [indCourse.id, indSection.id],
  )).rows[0];
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [recordStudent.id, indCourse.id],
  );
  await db.query(
    `INSERT INTO class_enrollments(user_id, course_id, status, learning_mode)
     VALUES ($1, $2, 'active', 'recording')`,
    [recordStudent.id, indCourse.id],
  );

  // Author theory, vocabulary, formula on independent lesson
  const theoryRes = await invokeRoute(bunnyVideoRouter, "put", "/admin/learning-units/:unitId/theory", {
    user: admin,
    params: { unitId: String(indLesson.id) },
    body: {
      unitType: "lesson",
      title: "Lý thuyết Định luật II Newton",
      contentHtml: "<p>Gia tốc tỉ lệ thuận với hợp lực.</p>",
      summary: "Tóm tắt cơ học cổ điển",
      keyTakeaways: ["F = ma", "Quán tính"],
    },
  });
  assert.equal(theoryRes.statusCode, 200);

  const vocabRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/learning-units/:unitId/vocabulary", {
    user: admin,
    params: { unitId: String(indLesson.id) },
    body: {
      unitType: "lesson",
      term: "加速度",
      pinyin: "jiā sù dù",
      sinoVietnamese: "Gia tốc độ",
      meaning: "Gia tốc",
      partOfSpeech: "Danh từ",
    },
  });
  assert.equal(vocabRes.statusCode, 201);

  const formulaRes = await invokeRoute(bunnyVideoRouter, "post", "/admin/learning-units/:unitId/formulas", {
    user: admin,
    params: { unitId: String(indLesson.id) },
    body: {
      unitType: "lesson",
      subject: "Vật lý",
      chapterName: "Động lực học",
      nameVi: "Định luật II Newton",
      latexExpression: "\\vec{F}_{hl} = m \\cdot \\vec{a}",
      description: "Công thức cơ bản của động lực học",
    },
  });
  assert.equal(formulaRes.statusCode, 201);

  // Learner creates a timestamped personal note
  const noteRes = await invokeRoute(videoCourseRouter, "post", "/:offeringId/units/:unitId/notes", {
    user: recordStudent,
    params: { offeringId: String(indCourse.id), unitId: String(indLesson.id) },
    body: {
      timestampSeconds: 145,
      content: "Nhớ đổi đơn vị khối lượng sang kg trước khi nhân!",
      unitType: "lesson",
    },
  });
  assert.equal(noteRes.statusCode, 201);

  // Verify Independent workspace returns theory, vocabulary, formulas, and notes
  const indWorkspaceRes = await invokeRoute(videoCourseRouter, "get", "/:offeringId/workspace", {
    user: recordStudent,
    params: { offeringId: String(indCourse.id) },
  });
  assert.equal(indWorkspaceRes.statusCode, 200);
  const activeUnit = indWorkspaceRes.body.data.activeUnit;
  assert.equal(activeUnit.theory.title, "Lý thuyết Định luật II Newton");
  assert.equal(activeUnit.vocabulary.length, 1);
  assert.equal(activeUnit.vocabulary[0].term, "加速度");
  assert.equal(activeUnit.formulas.length, 1);
  assert.equal(activeUnit.formulas[0].nameVi, "Định luật II Newton");
  assert.equal(activeUnit.notes.length, 1);
  assert.equal(activeUnit.notes[0].timestampSeconds, 145);
});
