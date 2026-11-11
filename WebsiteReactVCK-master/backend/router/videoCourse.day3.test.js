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

  const handler = layer.route.stack.at(-1).handle;
  await handler(req, res);
  return res;
};

test("Day 3 Bunny Stream E2E: InternalManagement MIRROR & INDEPENDENT sync, Finance pending_payment/active/refunded lifecycle, Admin Curriculum Builder, 5-Point Publish Checklist, and Over-Limit Device Warning", async (t) => {
  process.env.BUNNY_STREAM_LIVE_HTTP = "false";
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

  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({
    query: (sql, params) => db.query(sql, params),
    release() {},
  });

  const { applyManagementEvent, SyncValidationError } = await import("../services/managementSync.service.js");
  const bunnyVideoRouter = (await import("./bunnyVideo.router.js")).default;
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  // 1. Seed Admin & Teacher
  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('admin-day3','admin-day3@moly.test','admin') RETURNING id, email, role",
  )).rows[0];
  const teacher = (await db.query(
    `INSERT INTO users(username,email,role,management_staff_source_id,is_management_managed,lms_account_status)
     VALUES ('teacher-day3','teacher-day3@moly.test','creator','teacher-src-day3',TRUE,'active') RETURNING id`,
  )).rows[0];

  // 2. Sync two courses from InternalManagement: one for MIRROR, one for INDEPENDENT (no live class)
  const mirrorCourseEvt = await applyManagementEvent(db, {
    eventType: "course.upserted",
    occurredAt: new Date("2026-11-10T01:00:00Z"),
    payload: {
      courseSourceId: "mgmt-course-mirror",
      title: "CSCA Toán Mirror Course",
      teacherSourceId: "teacher-src-day3",
      isPublished: true,
      sourceUpdatedAt: "2026-11-10T01:00:00Z",
    },
  });
  const mirrorCourseId = mirrorCourseEvt.entityId;

  const indepCourseEvt = await applyManagementEvent(db, {
    eventType: "course.upserted",
    occurredAt: new Date("2026-11-10T01:01:00Z"),
    payload: {
      courseSourceId: "mgmt-course-independent",
      title: "HSK 5 Video Tự Học Độc Lập",
      teacherSourceId: "teacher-src-day3",
      isPublished: false,
      sourceUpdatedAt: "2026-11-10T01:01:00Z",
    },
  });
  const indepCourseId = indepCourseEvt.entityId;

  // 3. Create active Live Class & cancelled Live Class on Mirror Course
  const activeLiveClass = (await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_course_source_id,
        management_source_updated_at,management_approval_status)
     VALUES ('CSCA Live K1',$1,$2,'active','live-class-active-src','mgmt-course-mirror',NOW(),'approved') RETURNING id`,
    [mirrorCourseId, teacher.id],
  )).rows[0];

  await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_course_source_id,
        management_source_updated_at,management_approval_status)
     VALUES ('CSCA Live Cancelled',$1,$2,'cancelled','live-class-cancelled-src','mgmt-course-mirror',NOW(),'rejected') RETURNING id`,
    [mirrorCourseId, teacher.id],
  );

  // 4. Test Section 10.1 & 10.4:
  // 4a. RECORDING + MIRROR pointing to cancelled source class must be rejected
  await assert.rejects(
    () => applyManagementEvent(db, {
      eventType: "class.upserted",
      occurredAt: new Date("2026-11-10T02:00:00Z"),
      payload: {
        classSourceId: "record-mirror-bad",
        courseSourceId: "mgmt-course-mirror",
        title: "Record Mirror Bad",
        classType: "RECORDING",
        recordingContentMode: "MIRROR",
        sourceClassSourceId: "live-class-cancelled-src",
        status: "active",
        sourceUpdatedAt: "2026-11-10T02:00:00Z",
      },
    }),
    SyncValidationError,
  );

  // 4b. RECORDING + MIRROR pointing to active source class succeeds and upserts video_course_profiles
  const mirrorSync = await applyManagementEvent(db, {
    eventType: "class.upserted",
    occurredAt: new Date("2026-11-10T02:01:00Z"),
    payload: {
      classSourceId: "record-mirror-good",
      courseSourceId: "mgmt-course-mirror",
      title: "CSCA Record Kế Thừa K1",
      classType: "RECORDING",
      recordingContentMode: "MIRROR",
      sourceClassSourceId: "live-class-active-src",
      status: "active",
      sourceUpdatedAt: "2026-11-10T02:01:00Z",
    },
  });
  assert.equal(mirrorSync.action, "class.recording_alias.synced");
  assert.equal(mirrorSync.data.recording_content_mode, "MIRROR");
  assert.equal(Number(mirrorSync.data.live_class_id), Number(activeLiveClass.id));

  const mirrorProfile = (await db.query(
    "SELECT mode, source_live_class_id, management_class_id FROM video_course_profiles WHERE course_id = $1",
    [mirrorCourseId],
  )).rows[0];
  assert.equal(mirrorProfile.mode, "MIRROR");
  assert.equal(Number(mirrorProfile.source_live_class_id), Number(activeLiveClass.id));
  assert.equal(mirrorProfile.management_class_id, "record-mirror-good");

  // 4c. RECORDING + INDEPENDENT with non-null sourceClassSourceId must be rejected
  await assert.rejects(
    () => applyManagementEvent(db, {
      eventType: "class.upserted",
      occurredAt: new Date("2026-11-10T02:02:00Z"),
      payload: {
        classSourceId: "record-indep-bad",
        courseSourceId: "mgmt-course-independent",
        title: "HSK 5 Independent Bad",
        classType: "RECORDING",
        recordingContentMode: "INDEPENDENT",
        sourceClassSourceId: "live-class-active-src",
        status: "active",
        sourceUpdatedAt: "2026-11-10T02:02:00Z",
      },
    }),
    SyncValidationError,
  );

  // 4d. RECORDING + INDEPENDENT without any Live class succeeds!
  const indepSync = await applyManagementEvent(db, {
    eventType: "class.upserted",
    occurredAt: new Date("2026-11-10T02:03:00Z"),
    payload: {
      classSourceId: "record-indep-good",
      courseSourceId: "mgmt-course-independent",
      title: "HSK 5 Video Tự Học Độc Lập - Lớp Record",
      classType: "RECORDING",
      recordingContentMode: "INDEPENDENT",
      sourceClassSourceId: null,
      status: "active",
      sourceUpdatedAt: "2026-11-10T02:03:00Z",
    },
  });
  assert.equal(indepSync.action, "class.recording_alias.synced");
  assert.equal(indepSync.data.recording_content_mode, "INDEPENDENT");
  assert.equal(indepSync.data.live_class_id, null);
  assert.equal(Number(indepSync.data.course_id), Number(indepCourseId));

  const indepProfile = (await db.query(
    "SELECT mode, source_live_class_id, management_class_id FROM video_course_profiles WHERE course_id = $1",
    [indepCourseId],
  )).rows[0];
  assert.equal(indepProfile.mode, "INDEPENDENT");
  assert.equal(indepProfile.source_live_class_id, null);

  // Verify NO live_classes, class_sessions, class_schedules, or attendance were created for INDEPENDENT course
  const indepLiveClassesCount = (await db.query(
    "SELECT COUNT(*)::int AS cnt FROM live_classes WHERE course_id = $1",
    [indepCourseId],
  )).rows[0].cnt;
  assert.equal(indepLiveClassesCount, 0);

  // 5. Test Admin Curriculum Builder & 5-Point Publish Checklist Gate on INDEPENDENT Course
  // 5a. Initially trying to publish INDEPENDENT course fails checklist (0 lessons, no thumbnail)
  const failPubRes = await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/courses/:courseId/publish",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: { isPublished: true },
    },
  );
  assert.equal(failPubRes.statusCode, 422);
  assert.equal(failPubRes.body.errorCode, "PUBLISH_CHECKLIST_FAILED");
  assert.equal(failPubRes.body.data.publishChecklist.checks.hasLessons.passed, false);
  assert.equal(failPubRes.body.data.publishChecklist.checks.hasThumbnail.passed, false);

  // 5b. Create 2 sections & 2 lessons and test reorder
  const sec1Res = await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/courses/:courseId/sections",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: { title: "Chương 1: Ngữ pháp HSK 5" },
    },
  );
  assert.equal(sec1Res.statusCode, 201);
  const sec1Id = sec1Res.body.data.id;

  const lesson1Res = await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/courses/:courseId/lessons",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: {
        sectionId: sec1Id,
        title: "Bài 1: Phó từ trình độ nâng cao",
        durationSeconds: 1200,
      },
    },
  );
  assert.equal(lesson1Res.statusCode, 201);
  const lesson1Id = lesson1Res.body.data.id;

  const lesson2Res = await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/courses/:courseId/lessons",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: {
        sectionId: sec1Id,
        title: "Bài 2: Cấu trúc câu nhấn mạnh",
        durationSeconds: 900,
      },
    },
  );
  assert.equal(lesson2Res.statusCode, 201);
  const lesson2Id = lesson2Res.body.data.id;

  // Reorder lessons (Lesson 2 before Lesson 1)
  const reorderRes = await invokeRoute(
    videoCourseRouter,
    "put",
    "/admin/courses/:courseId/reorder",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: {
        lessonsOrder: [
          { id: lesson2Id, sectionId: sec1Id, sortOrder: 0 },
          { id: lesson1Id, sectionId: sec1Id, sortOrder: 1 },
        ],
      },
    },
  );
  assert.equal(reorderRes.statusCode, 200);

  // 5c. Upload & encode ready Bunny videos for both lessons + set course thumbnail
  await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/profiles",
    {
      user: admin,
      body: {
        courseId: indepCourseId,
        mode: "INDEPENDENT",
        thumbnailUrl: "https://vz-test-moly.b-cdn.net/hsk5-course-thumb.jpg",
      },
    },
  );

  const assetIds = [];
  for (const [idx, lId] of [lesson1Id, lesson2Id].entries()) {
    const intentRes = await invokeRoute(
      bunnyVideoRouter,
      "post",
      "/admin/video-assets/upload-intent",
      {
        user: admin,
        body: { title: `HSK5 Video ${idx + 1}`, fileSizeBytes: 15_000_000 },
      },
    );
    const { assetId, providerVideoId, libraryId } = intentRes.body.data;
    assetIds.push(assetId);

    await invokeRoute(
      bunnyVideoRouter,
      "post",
      "/admin/learning-units/:unitId/videos",
      {
        user: admin,
        params: { unitId: String(lId) },
        body: { videoAssetId: Number(assetId), unitType: "lesson", videoType: "primary" },
      },
    );

    // Webhook Status 3 = Finished (ready)
    await invokeRoute(
      bunnyVideoRouter,
      "post",
      "/webhooks/bunny-stream",
      {
        body: {
          EventId: `evt-day3-ready-${lId}`,
          VideoLibraryId: libraryId,
          VideoGuid: providerVideoId,
          Status: 3,
          Length: 900,
          AvailableResolutions: "360p,720p,1080p",
        },
      },
    );
  }

  // 5d. Now publish the INDEPENDENT course -> all 5 Publish Checklist checks pass!
  const passPubRes = await invokeRoute(
    videoCourseRouter,
    "post",
    "/admin/courses/:courseId/publish",
    {
      user: admin,
      params: { courseId: String(indepCourseId) },
      body: { isPublished: true, autoPublishReadyVideos: true },
    },
  );
  assert.equal(passPubRes.statusCode, 200);
  assert.equal(passPubRes.body.data.isPublished, true);
  assert.equal(passPubRes.body.data.publishChecklist.isReadyToPublish, true);

  // 6. Test Finance & Entitlement Lifecycle (Section 10.3 & 12):
  // 6a. Provision learner with pending_payment + enroll in INDEPENDENT recording class
  const provRes = await applyManagementEvent(db, {
    eventType: "student.provisioned",
    occurredAt: new Date("2026-11-10T03:00:00Z"),
    payload: {
      studentSourceId: "stu-indep-001",
      fullName: "Học Viên Khóa Độc Lập",
      email: "stu-indep@moly.test",
      accountStatus: "pending_payment",
      sourceUpdatedAt: "2026-11-10T03:00:00Z",
    },
  });
  const indepLearnerId = provRes.entityId;
  const recordDevice = (await db.query(
    `INSERT INTO trusted_login_devices(user_id,device_token_hash,device_name)
     VALUES ($1,$2,'Day 3 record browser') RETURNING id`,
    [indepLearnerId, "day3-record-browser".padEnd(64, "0")],
  )).rows[0];

  const memRes = await applyManagementEvent(db, {
    eventType: "class.membership.changed",
    occurredAt: new Date("2026-11-10T03:01:00Z"),
    payload: {
      membershipSourceId: "mem-indep-001",
      classSourceId: "record-indep-good",
      studentSourceId: "stu-indep-001",
      status: "active",
      sourceUpdatedAt: "2026-11-10T03:01:00Z",
    },
  });
  assert.equal(memRes.action, "class.membership.synced");
  assert.equal(memRes.data.learning_mode, "recording");
  assert.equal(memRes.data.live_class_id, null);
  assert.equal(Number(memRes.data.course_id), Number(indepCourseId));

  // Approve membership in LMS
  await db.query(
    "UPDATE class_enrollments SET status = 'active', management_approval_status = 'approved' WHERE id = $1",
    [memRes.entityId],
  );

  // Pending payment learner tries to play video -> blocked with 403 LMS_ACCESS_INACTIVE
  let learnerUser = (await db.query(
    "SELECT id, email, role, is_management_managed, lms_account_status FROM users WHERE id = $1",
    [indepLearnerId],
  )).rows[0];
  assert.equal(learnerUser.lms_account_status, "pending_payment");

  const blockedPendingRes = await invokeRoute(
    bunnyVideoRouter,
    "post",
    "/videos/:videoId/playback-token",
    {
      user: learnerUser,
      authSession: { trustedDeviceId: recordDevice.id },
      params: { videoId: String(assetIds[0]) },
      body: { unitId: Number(lesson1Id), courseId: Number(indepCourseId) },
    },
  );
  assert.equal(blockedPendingRes.statusCode, 403);
  assert.equal(blockedPendingRes.body.errorCode, "LMS_ACCESS_INACTIVE");

  // 6b. Payment confirmed -> entitlement.changed (active) -> learner can play video!
  await applyManagementEvent(db, {
    eventType: "entitlement.changed",
    occurredAt: new Date("2026-11-10T03:05:00Z"),
    correlationId: "corr-paid-001",
    payload: {
      studentSourceId: "stu-indep-001",
      courseSourceIds: ["mgmt-course-independent"],
      accessStatus: "active",
      validFrom: "2026-11-10T00:00:00Z",
      sourceUpdatedAt: "2026-11-10T03:05:00Z",
    },
  });

  learnerUser = (await db.query(
    "SELECT id, email, role, is_management_managed, lms_account_status FROM users WHERE id = $1",
    [indepLearnerId],
  )).rows[0];
  assert.equal(learnerUser.lms_account_status, "active");

  const activePlayRes = await invokeRoute(
    bunnyVideoRouter,
    "post",
    "/videos/:videoId/playback-token",
    {
      user: learnerUser,
      authSession: { trustedDeviceId: recordDevice.id },
      params: { videoId: String(assetIds[0]) },
      body: { unitId: Number(lesson1Id), courseId: Number(indepCourseId) },
    },
  );
  assert.equal(activePlayRes.statusCode, 200);
  assert.ok(activePlayRes.body.data.embedUrl.includes("token="));

  // 6c. Payment refunded -> payment.refunded event -> playback immediately revoked (403)!
  await applyManagementEvent(db, {
    eventType: "payment.refunded",
    occurredAt: new Date("2026-11-10T03:10:00Z"),
    correlationId: "corr-refund-001",
    payload: {
      studentSourceId: "stu-indep-001",
      courseSourceIds: ["mgmt-course-independent"],
      reason: "Learner requested refund",
      sourceUpdatedAt: "2026-11-10T03:10:00Z",
    },
  });

  learnerUser = (await db.query(
    "SELECT id, email, role, is_management_managed, lms_account_status FROM users WHERE id = $1",
    [indepLearnerId],
  )).rows[0];
  assert.equal(learnerUser.lms_account_status, "revoked");

  const refundedPlayRes = await invokeRoute(
    bunnyVideoRouter,
    "post",
    "/videos/:videoId/playback-token",
    {
      user: learnerUser,
      params: { videoId: String(assetIds[0]) },
      body: { unitId: Number(lesson1Id), courseId: Number(indepCourseId) },
    },
  );
  assert.equal(refundedPlayRes.statusCode, 403);

  // 7. Test Section 5.1: Over-limit trusted devices (>2) warning & Admin manual device revoke
  for (let i = 1; i <= 2; i += 1) {
    await db.query(
      `INSERT INTO trusted_login_devices
         (user_id, device_token_hash, device_name, first_ip, last_ip, record_access_granted_at)
       VALUES ($1, $2, $3, '10.0.0.1'::inet, '10.0.0.1'::inet, NOW())`,
      [indepLearnerId, `legacy-hash-device-${i}`.padEnd(64, "0"), `Legacy Device #${i}`],
    );
  }

  const overviewRes = await invokeRoute(
    videoCourseRouter,
    "get",
    "/admin/courses",
    { user: admin },
  );
  assert.equal(overviewRes.statusCode, 200);
  const warnedAccount = overviewRes.body.data.overLimitDeviceAccounts.find(
    (a) => String(a.userId) === String(indepLearnerId),
  );
  assert.ok(warnedAccount, "Account with 3 active devices must appear in overLimitDeviceAccounts warning");
  assert.equal(warnedAccount.activeDeviceCount, 3);

  // Admin revokes 1 excess device -> count drops to 2 and warning clears
  const deviceToRevoke = warnedAccount.devices[0].id;
  const revokeDevRes = await invokeRoute(
    videoCourseRouter,
    "delete",
    "/admin/users/:userId/trusted-devices/:deviceId",
    {
      user: admin,
      params: { userId: String(indepLearnerId), deviceId: String(deviceToRevoke) },
    },
  );
  assert.equal(revokeDevRes.statusCode, 200);

  const overviewAfterRevoke = await invokeRoute(
    videoCourseRouter,
    "get",
    "/admin/courses",
    { user: admin },
  );
  assert.equal(overviewAfterRevoke.body.data.overLimitDeviceAccounts.length, 0);
});
