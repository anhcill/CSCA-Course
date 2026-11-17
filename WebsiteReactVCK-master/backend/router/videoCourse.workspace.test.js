import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const bindPoolToDb = (pool, db) => {
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
};

const addTrustedDevice = async (db, userId, suffix) => (await db.query(
  `INSERT INTO trusted_login_devices(user_id,device_token_hash,device_name)
   VALUES ($1,$2,$3) RETURNING id`,
  [userId, String(suffix).padEnd(64, "0"), `Test browser ${suffix}`],
)).rows[0].id;

test("video course workspace: MIRROR mode returns sessions, theory and capabilities", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('mirror-teacher','mirror-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('mirror-student','mirror-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const trustedDeviceId = await addTrustedDevice(db, student.id, "mirror");
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('HSK Video Mirror','hsk-video-mirror',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Live Source Class',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1, 'Chương 1: Khởi động phát âm Pinyin', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO video_course_profiles
       (course_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, 'MIRROR', $2, TRUE, 2, 'active')`,
    [course.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','recording')`,
    [student.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );
  await db.query(
    `INSERT INTO learning_unit_theory
       (class_session_id, title, content_html, summary, key_takeaways)
     VALUES ($1, 'Lý thuyết Pinyin', '<p>Nội dung thanh mẫu</p>', 'Tóm tắt bài', '["Thanh mẫu", "Vận mẫu"]'::jsonb)`,
    [session.id],
  );
  const directSessionFile = (await db.query(
    `INSERT INTO lms_learning_files
       (live_class_id,course_id,class_session_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,$3,$4,'slide-buoi-hoc.pdf','learning-files/direct-slide.pdf','application/pdf',1024,'CLASS_ONLY','ready')
     RETURNING id`,
    [liveClass.id, course.id, session.id, teacher.id],
  )).rows[0];

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
  )).route;

  const overviewRoute = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/overview" && layer.route.methods.get
  )).route;
  const overviewRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await overviewRoute.stack.at(-1).handle({ params: { offeringId: String(course.id) } }, overviewRes);
  assert.equal(overviewRes.statusCode, 200, JSON.stringify(overviewRes.body));
  assert.equal(overviewRes.body.data.sections.length, 1);
  assert.equal(overviewRes.body.data.sections[0].lessons.length, 1);
  assert.equal(overviewRes.body.data.totalUnits, 1);

  const accessRoute = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/access" && layer.route.methods.get
  )).route;
  const accessRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await accessRoute.stack.at(-1).handle({
    user: {
      id: student.id,
      role: "user",
      is_management_managed: true,
      lms_account_status: "active",
    },
    params: { offeringId: String(course.id) },
  }, accessRes);
  assert.equal(accessRes.statusCode, 200, JSON.stringify(accessRes.body));
  assert.equal(accessRes.body.data.canLearn, true);
  assert.equal(accessRes.body.data.accessType, "RECORD");

  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await route.stack.at(-1).handle({
    user: {
      id: student.id,
      role: "user",
      is_management_managed: true,
      lms_account_status: "active",
    },
    authSession: { trustedDeviceId },
    params: { offeringId: String(course.id) },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.mode, "RECORD_MIRROR");
  assert.equal(res.body.data.capabilities.canPlayVideo, true);
  assert.equal(res.body.data.capabilities.canJoinLive, false);
  assert.equal(res.body.data.capabilities.showCalendar, false);
  assert.equal(res.body.data.capabilities.canCheckIn, false);
  assert.equal(res.body.data.units.length, 1);
  assert.equal(res.body.data.activeUnit.title, "Chương 1: Khởi động phát âm Pinyin");
  assert.equal(res.body.data.activeUnit.theory.title, "Lý thuyết Pinyin");
  assert.deepEqual(res.body.data.activeUnit.files.map((file) => file.id), [String(directSessionFile.id)]);
  assert.equal(res.body.data.activeUnit.files[0].fileName, "slide-buoi-hoc.pdf");
});

test("video course workspace: Live learner inherits only the matching MIRROR Record offering", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;
  const { verifyLearnerVideoAccess } = await import("./bunnyVideo.router.js");

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('inherit-teacher','inherit-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const learner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('inherit-learner','inherit-learner@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const wrongGrantLearner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('wrong-grant-learner','wrong-grant-learner@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const learnerDeviceId = await addTrustedDevice(db, learner.id, "inherit");
  const wrongDeviceId = await addTrustedDevice(db, wrongGrantLearner.id, "wrong");
  const liveCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published,is_management_managed) VALUES ('Live source','inherit-live',$1,TRUE,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const recordCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published,is_management_managed) VALUES ('Record mirror','inherit-record',$1,TRUE,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const unrelatedCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published,is_management_managed) VALUES ('Unrelated','inherit-unrelated',$1,TRUE,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Live source class',$1,$2,'active') RETURNING id",
    [liveCourse.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status) VALUES ($1,'Inherited lesson',NOW(),NOW() + INTERVAL '1 hour','scheduled') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const profile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,enforce_trusted_devices,device_limit,status)
     VALUES ($1,'MIRROR',$2,TRUE,2,'active') RETURNING id`,
    [recordCourse.id, liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$3,'active','live'),($2,$3,'active','live')`,
    [learner.id, wrongGrantLearner.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$3,'active',NOW() - INTERVAL '1 day',NOW()),
            ($2,$4,'active',NOW() - INTERVAL '1 day',NOW())`,
    [learner.id, wrongGrantLearner.id, liveCourse.id, unrelatedCourse.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
  )).route;
  const invoke = async (user, trustedDeviceId) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await route.stack.at(-1).handle({
      user: { id: user.id, role: "user", is_management_managed: true, lms_account_status: "active" },
      authSession: { trustedDeviceId },
      params: { offeringId: `profile-${profile.id}` },
      query: {},
    }, res);
    return res;
  };

  const inherited = await invoke(learner, learnerDeviceId);
  assert.equal(inherited.statusCode, 200, JSON.stringify(inherited.body));
  assert.equal(inherited.body.data.mode, "RECORD_MIRROR");
  assert.equal(inherited.body.data.activeUnit.id, String(session.id));
  assert.equal(inherited.body.data.capabilities.canJoinLive, false);
  assert.equal(inherited.body.data.capabilities.canReviewFreely, true);

  const playbackAccess = await verifyLearnerVideoAccess({
    user: { ...learner, role: "user", is_management_managed: true, lms_account_status: "active" },
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId: learnerDeviceId } },
    db,
  });
  assert.equal(playbackAccess.allowed, true, JSON.stringify(playbackAccess));

  const wrongPlaybackAccess = await verifyLearnerVideoAccess({
    user: { ...wrongGrantLearner, role: "user", is_management_managed: true, lms_account_status: "active" },
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId: wrongDeviceId } },
    db,
  });
  assert.equal(wrongPlaybackAccess.allowed, false);
  assert.equal(wrongPlaybackAccess.errorCode, "ENTITLEMENT_INACTIVE");

  const laterSession = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status) VALUES ($1,'Review later lesson',NOW() + INTERVAL '1 day',NOW() + INTERVAL '1 day 1 hour','ended') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const { isVideoCourseUnitUnlocked, hasLiveReviewMembership } = await import("../services/videoCourseUnitAccess.service.js");
  const unitOptions = { db, userId: learner.id, unitType: "class_session", unitId: laterSession.id, videoCourseProfileId: profile.id };
  const liveReview = await invoke(learner, learnerDeviceId);
  assert.equal(liveReview.body.data.units.find(u => u.id === String(laterSession.id)).isLocked, false);
  assert.equal(await isVideoCourseUnitUnlocked(unitOptions), true);
  assert.equal(await hasLiveReviewMembership(db, { id: profile.id, mode: "INDEPENDENT", source_live_class_id: liveClass.id }, learner.id), false);
  assert.equal(await hasLiveReviewMembership(db, { id: profile.id, mode: "MIRROR", source_live_class_id: 999999 }, learner.id), false);

  // The same source class in recording mode must still finish previous units.
  await db.query("UPDATE class_enrollments SET learning_mode = 'recording' WHERE user_id = $1", [learner.id]);
  const recordPlaybackWithoutRecordGrant = await verifyLearnerVideoAccess({
    user: { ...learner, role: "user", is_management_managed: true, lms_account_status: "active" },
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId: learnerDeviceId } },
    db,
  });
  assert.equal(recordPlaybackWithoutRecordGrant.allowed, false);
  assert.equal(recordPlaybackWithoutRecordGrant.errorCode, "ENTITLEMENT_INACTIVE");

  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [learner.id, recordCourse.id],
  );
  const recordPlaybackWithMirrorGrant = await verifyLearnerVideoAccess({
    user: { ...learner, role: "user", is_management_managed: true, lms_account_status: "active" },
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId: learnerDeviceId } },
    db,
  });
  assert.equal(recordPlaybackWithMirrorGrant.allowed, true, JSON.stringify(recordPlaybackWithMirrorGrant));

  const recordReview = await invoke(learner, learnerDeviceId);
  assert.equal(recordReview.body.data.capabilities.canReviewFreely, false);
  assert.equal(recordReview.body.data.units.find(u => u.id === String(laterSession.id)).isLocked, true);
  assert.equal(await isVideoCourseUnitUnlocked(unitOptions), false);
  await db.query("UPDATE class_enrollments SET learning_mode = 'live', status = 'revoked' WHERE user_id = $1", [learner.id]);
  assert.equal(await hasLiveReviewMembership(db, { id: profile.id, mode: "MIRROR", source_live_class_id: liveClass.id }, learner.id), false);

  const wrongGrant = await invoke(wrongGrantLearner, wrongDeviceId);
  assert.equal(wrongGrant.statusCode, 403, JSON.stringify(wrongGrant.body));
  assert.equal(wrongGrant.body.errorCode, "ENTITLEMENT_INACTIVE");
});

test("video course workspace: ordinary accounts can open only admin-selected preview units", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('preview-teacher','preview-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const visitor = (await db.query(
    "INSERT INTO users(username,email,role,is_management_managed,lms_account_status) VALUES ('preview-user','preview-user@example.test','user',FALSE,'pending_payment') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Preview Course','preview-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Preview Source',$1,$2,'active') RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const lockedSession = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status) VALUES ($1,'Buổi chỉ dành cho học viên',NOW(),NOW() + INTERVAL '1 hour','scheduled') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const previewSession = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview) VALUES ($1,'Buổi học thử',NOW() + INTERVAL '1 day',NOW() + INTERVAL '1 day 1 hour','scheduled',TRUE) RETURNING id",
    [liveClass.id],
  )).rows[0];
  await db.query(
    "INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status) VALUES ($1,'MIRROR',$2,'active')",
    [course.id, liveClass.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
  )).route;
  const invoke = async (unitId = null) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await route.stack.at(-1).handle({
      user: { id: visitor.id, role: "user", is_management_managed: false, lms_account_status: "pending_payment" },
      params: { offeringId: String(course.id) },
      query: unitId ? { unitId: String(unitId) } : {},
    }, res);
    return res;
  };

  const previewRes = await invoke();
  assert.equal(previewRes.statusCode, 200, JSON.stringify(previewRes.body));
  assert.equal(previewRes.body.data.activeUnit.id, String(previewSession.id));
  assert.equal(previewRes.body.data.capabilities.isPublicPreviewAccess, true);
  assert.equal(previewRes.body.data.units.find((unit) => unit.id === String(lockedSession.id)).isLocked, true);
  assert.equal(previewRes.body.data.units.find((unit) => unit.id === String(previewSession.id)).isLocked, false);

  const lockedRes = await invoke(lockedSession.id);
  assert.equal(lockedRes.statusCode, 403);
  assert.equal(lockedRes.body.errorCode, "LMS_ACCESS_INACTIVE");
  assert.match(lockedRes.body.message, /0812352005/);
});

test("video course workspace: INDEPENDENT mode returns lessons without live class", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const author = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('course-author','course-author@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('independent-student','independent-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const trustedDeviceId = await addTrustedDevice(db, student.id, "independent");
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('CSCA Toan Độc Lập','csca-math-independent',$1,TRUE,TRUE) RETURNING id`,
    [author.id],
  )).rows[0];
  const section = (await db.query(
    `INSERT INTO sections(course_id,title,sort_order)
     VALUES ($1, 'Chương I: Hàm số và Đồ thị', 1) RETURNING id`,
    [course.id],
  )).rows[0];
  const lesson = (await db.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,is_published,sort_order)
     VALUES ($1, $2, 'Bài 1', 'Bài 1: Khảo sát hàm số lượng giác', 1800, TRUE, 1) RETURNING id`,
    [course.id, section.id],
  )).rows[0];
  await db.query(
    `INSERT INTO video_course_profiles
       (course_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, 'INDEPENDENT', NULL, TRUE, 2, 'active')`,
    [course.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );
  const alias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id, source_class_source_id, live_class_id, course_id,
        learning_mode, recording_content_mode, title, status, management_source_updated_at)
     VALUES ('independent-record-test', NULL, NULL, $1, 'recording', 'INDEPENDENT',
             'Khóa Record độc lập', 'active', NOW()) RETURNING id`,
    [course.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments
       (user_id, live_class_id, course_id, status, learning_mode, management_class_alias_id)
     VALUES ($1, NULL, $2, 'active', 'recording', $3)`,
    [student.id, course.id, alias.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
  )).route;

  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await route.stack.at(-1).handle({
    user: {
      id: student.id,
      role: "user",
      is_management_managed: true,
      lms_account_status: "active",
    },
    authSession: { trustedDeviceId },
    params: { offeringId: String(course.id) },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.mode, "RECORD_INDEPENDENT");
  assert.equal(res.body.data.units.length, 1);
  assert.equal(res.body.data.units[0].title, "Bài 1: Khảo sát hàm số lượng giác");
  assert.equal(res.body.data.sourceClass, null);
  assert.equal(res.body.data.capabilities.canPlayVideo, true);
  assert.equal(res.body.data.capabilities.canJoinLive, false);
});

test("video course workspace: multipart units require every video part >=50% plus quiz completion", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;
  const { recordVideoWatchProgress } = await import("../services/bunnyStream.service.js");

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('seq-teacher','seq-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('seq-student','seq-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const trustedDeviceId = await addTrustedDevice(db, student.id, "sequential");
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('CSCA TTXH Sequential','csca-ttxh-seq',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('CSCA Live Source',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];

  // Create 2 sessions (even though live class schedule is 120 mins, real video is 200s = 3 mins)
  const session1 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1, 'Buổi 1: Từ đa âm và bộ thủ', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours', 'ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const session2 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1, 'Buổi 2: Từ đồng nghĩa, trái nghĩa', NOW() - INTERVAL '2 hours', NOW(), 'ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];

  // Session 1 has two parts (200s + 100s); Session 2 has one 300s video.
  const asset1 = (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Video Buổi 1','bunny_stream','111','guid-1','ready',200) RETURNING id`,
  )).rows[0];
  const asset1Part2 = (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Video Buổi 1 - Phần 2','bunny_stream','111','guid-1-part-2','ready',100) RETURNING id`,
  )).rows[0];
  const asset2 = (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Video Buổi 2','bunny_stream','111','guid-2','ready',300) RETURNING id`,
  )).rows[0];

  await db.query(
    `INSERT INTO class_session_videos(class_session_id,video_asset_id,video_type,is_published)
     VALUES ($1,$2,'primary',TRUE), ($1,$3,'supplemental',TRUE), ($4,$5,'primary',TRUE)`,
    [session1.id, asset1.id, asset1Part2.id, session2.id, asset2.id],
  );

  // Attach 1 published quiz to Session 1
  const quiz1 = (await db.query(
    `INSERT INTO quizzes(title,class_session_id,live_class_id,duration_minutes,passing_score,status)
     VALUES ('Quiz Buổi 1',$1,$2,15,60,'PUBLISHED') RETURNING id`,
    [session1.id, liveClass.id],
  )).rows[0];

  const videoProfile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status)
     VALUES ($1,'MIRROR',$2,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','recording')`,
    [student.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
  )).route;

  const fetchWorkspace = async (unitId = null, customUser = null) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await route.stack.at(-1).handle({
      user: customUser || {
        id: student.id,
        role: "user",
        is_management_managed: true,
        lms_account_status: "active",
      },
      authSession: { trustedDeviceId },
      params: { offeringId: String(course.id) },
      query: unitId ? { unitId: String(unitId) } : {},
    }, res);
    return res.body.data;
  };

  // Step 1: Duration is the sum of published parts, not the live schedule length.
  let ws = await fetchWorkspace();
  assert.equal(ws.units[0].isLocked, false);
  assert.equal(ws.units[0].videoDurationSeconds, 300);
  assert.equal(ws.units[0].durationMinutes, 5);
  assert.equal(ws.units[1].isLocked, true);
  assert.equal(ws.units[1].videoDurationSeconds, 300);
  assert.equal(ws.units[1].durationMinutes, 5);
  const lockedWorkspace = await fetchWorkspace(session2.id);
  assert.equal(lockedWorkspace.activeUnit.isLocked, true);
  assert.equal(lockedWorkspace.activeUnit.video, null);
  assert.deepEqual(lockedWorkspace.activeUnit.videos, []);
  assert.equal(lockedWorkspace.activeUnit.theory, null);
  assert.deepEqual(lockedWorkspace.activeUnit.files, []);
  assert.deepEqual(lockedWorkspace.activeUnit.assignments, []);
  assert.deepEqual(lockedWorkspace.activeUnit.quizzes, []);
  assert.deepEqual(lockedWorkspace.activeUnit.vocabulary, []);
  assert.deepEqual(lockedWorkspace.activeUnit.formulas, []);
  assert.deepEqual(lockedWorkspace.activeUnit.notes, []);

  // Step 2: Moving the playhead alone must not unlock or add credited watch time.
  const seekResult = await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 180,
    watchedDeltaSeconds: 0,
    durationSeconds: 200,
  });
  assert.equal(seekResult.watchedSeconds, 0);
  assert.equal(seekResult.completionPercent, 0);
  assert.equal(seekResult.isCompleted, false);

  ws = await fetchWorkspace();
  assert.equal(ws.units[1].isLocked, true);

  // Step 3: Simulate real elapsed heartbeat windows. Completing only part 1 must not complete the unit.
  await db.query(
    `UPDATE video_watch_progress SET last_heartbeat_at = NOW() - INTERVAL '90 seconds'
     WHERE user_id = $1 AND video_asset_id = $2`,
    [student.id, asset1.id],
  );
  await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 90,
    watchedDeltaSeconds: 90,
    durationSeconds: 200,
  });
  await db.query(
    `UPDATE video_watch_progress SET last_heartbeat_at = NOW() - INTERVAL '34 seconds'
     WHERE user_id = $1 AND video_asset_id = $2`,
    [student.id, asset1.id],
  );
  const watch62 = await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 124,
    watchedDeltaSeconds: 34,
    durationSeconds: 200,
  });
  assert.equal(watch62.watchedSeconds, 124);
  assert.equal(watch62.completionPercent, 62);
  assert.equal(watch62.isCompleted, true);
  assert.equal(watch62.unitProgress.completionPercent, 41.33);
  assert.equal(watch62.unitProgress.isCompleted, false);

  ws = await fetchWorkspace();
  assert.equal(ws.units[0].progressPercent, 41.33);
  assert.equal(ws.progress.overallPercent, 21);
  assert.equal(ws.units[0].isVideoCompleted, false);
  assert.equal(ws.units[0].isQuizCompleted, false);
  assert.equal(ws.units[0].isCompleted, false);
  assert.equal(ws.units[1].isLocked, true, "Session 2 must remain locked while part 2 is incomplete");

  await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1Part2.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 0,
    watchedDeltaSeconds: 0,
  });
  await db.query(
    `UPDATE video_watch_progress SET last_heartbeat_at = NOW() - INTERVAL '50 seconds'
     WHERE user_id = $1 AND video_asset_id = $2`,
    [student.id, asset1Part2.id],
  );
  const part2Target = await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1Part2.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 50,
    watchedDeltaSeconds: 50,
  });
  assert.equal(part2Target.completionPercent, 50);
  assert.equal(part2Target.unitProgress.completionPercent, 58);
  assert.equal(part2Target.unitProgress.isCompleted, true);

  ws = await fetchWorkspace();
  assert.equal(ws.units[0].isVideoCompleted, true);
  assert.equal(ws.units[0].isQuizCompleted, false);
  assert.equal(ws.units[1].isLocked, true, "Session 2 must remain locked until Quiz 1 is completed");

  // Step 4: Legacy attempts without a Record profile still unlock the matching course.
  await db.query(
    `INSERT INTO quiz_attempts(quiz_id,user_id,score,max_score,status,submitted_at)
     VALUES ($1,$2,9,10,'submitted',NOW())`,
    [quiz1.id, student.id],
  );

  ws = await fetchWorkspace();
  assert.equal(ws.units[0].isVideoCompleted, true);
  assert.equal(ws.units[0].isQuizCompleted, true);
  assert.equal(ws.units[0].isCompleted, true);
  assert.equal(ws.units[1].isLocked, false, "Session 2 must accept legacy unscoped quiz completion");

  // Step 5: Admin access -> All units are unlocked regardless of watch time or quizzes
  const adminWs = await fetchWorkspace(session2.id, {
    id: 1,
    role: "admin",
    is_management_managed: true,
    lms_account_status: "active",
  });
  assert.equal(adminWs.units[0].isLocked, false);
  assert.equal(adminWs.units[1].isLocked, false, "Admin must have all units unlocked for quality review");
  assert.equal(adminWs.capabilities.isAdminPreview, true);
  assert.equal(adminWs.activeUnit.isLocked, false);
  assert.notEqual(adminWs.activeUnit.video, null, "Admin must have full active unit payload");
});

test("admin revokes only one Record profile while preserving Live/LMS and online status", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;
  const { verifyLearnerVideoAccess } = await import("./bunnyVideo.router.js");
  const { getVideoCourseUnitAccessContext } = await import("../services/videoCourseUnitAccess.service.js");

  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('access-admin','access-admin@example.test','admin') RETURNING id,role",
  )).rows[0];
  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('access-teacher','access-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const learner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('access-learner','access-learner@example.test','user',TRUE,'active')
     RETURNING id,username,email,role,is_management_managed,lms_account_status`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('Access revoke course','access-revoke-course',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Preserved Live class',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Record lesson',NOW(),NOW() + INTERVAL '1 hour','scheduled') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const profile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status)
     VALUES ($1,'MIRROR',$2,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','live')`,
    [learner.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [learner.id, course.id],
  );
  const trustedDeviceId = await addTrustedDevice(db, learner.id, "access-revoke");
  await db.query(
    `INSERT INTO user_sessions
       (user_id,token_hash,device_info,expires_at,trusted_device_id,last_seen_at)
     VALUES ($1,$2,'Windows · Chrome',NOW() + INTERVAL '1 day',$3,NOW() - INTERVAL '2 minutes')`,
    [learner.id, "access-session-token-hash", trustedDeviceId],
  );

  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const route = (method, path) => videoCourseRouter.stack.find((layer) => (
    layer.route?.path === path && layer.route.methods[method]
  )).route.stack.at(-1).handle;

  const listBefore = response();
  await route("get", "/admin/courses/:courseId/students")({
    user: admin,
    params: { courseId: String(course.id) },
    query: { profileId: String(profile.id) },
  }, listBefore);
  assert.equal(listBefore.statusCode, 200, JSON.stringify(listBefore.body));
  assert.equal(listBefore.body.data.total, 1);
  assert.equal(listBefore.body.data.onlineCount, 1);
  assert.equal(listBefore.body.data.students[0].isOnline, true);
  assert.equal(listBefore.body.data.students[0].activeSessions, 1);
  assert.equal(listBefore.body.data.students[0].accessSource, "LIVE_MIRROR");

  const revoked = response();
  await route("delete", "/admin/courses/:courseId/students/:userId/access")({
    user: admin,
    params: { courseId: String(course.id), userId: String(learner.id) },
    query: {},
    body: { profileId: String(profile.id), reason: "Admin test revoke" },
  }, revoked);
  assert.equal(revoked.statusCode, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.data.accessStatus, "revoked");

  const liveMembership = (await db.query(
    "SELECT status,learning_mode FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2",
    [learner.id, liveClass.id],
  )).rows[0];
  assert.deepEqual(liveMembership, { status: "active", learning_mode: "live" });
  assert.equal((await db.query(
    "SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [learner.id, course.id],
  )).rows[0].access_status, "active");

  const workspace = response();
  await route("get", "/:offeringId/workspace")({
    user: learner,
    authSession: { trustedDeviceId },
    params: { offeringId: `profile-${profile.id}` },
    query: {},
  }, workspace);
  assert.equal(workspace.statusCode, 403, JSON.stringify(workspace.body));
  assert.equal(workspace.body.errorCode, "VIDEO_COURSE_ACCESS_REVOKED");

  const playbackAccess = await verifyLearnerVideoAccess({
    user: learner,
    courseId: course.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId } },
    db,
  });
  assert.equal(playbackAccess.allowed, false);
  assert.equal(playbackAccess.errorCode, "VIDEO_COURSE_ACCESS_REVOKED");

  const unitAccess = await getVideoCourseUnitAccessContext({
    db,
    userId: learner.id,
    unitType: "class_session",
    unitId: session.id,
    videoCourseProfileId: profile.id,
  });
  assert.equal(unitAccess.isVideoCourseUnit, true);
  assert.equal(unitAccess.isRecordMember, false);

  const listAfter = response();
  await route("get", "/admin/courses/:courseId/students")({
    user: admin,
    params: { courseId: String(course.id) },
    query: { profileId: String(profile.id) },
  }, listAfter);
  assert.equal(listAfter.body.data.activeCount, 0);
  assert.equal(listAfter.body.data.revokedCount, 1);
  assert.equal(listAfter.body.data.students[0].accessStatus, "revoked");
});

test("cross-course MIRROR offering isolates profile.id from course.id, unlocks Session 2, preserves Live review, and hides archived-only parent course from admin Video Courses list", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const { recordVideoWatchProgress } = await import("../services/bunnyStream.service.js");
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('ttxh-admin','ttxh-admin@example.test','admin') RETURNING id,role",
  )).rows[0];
  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('ttxh-teacher','ttxh-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const recordStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('ttxh-record-student','ttxh-record@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const liveStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('ttxh-live-student','ttxh-live@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const recordDeviceId = await addTrustedDevice(db, recordStudent.id, "ttxh-rec");
  const liveDeviceId = await addTrustedDevice(db, liveStudent.id, "ttxh-live");

  const liveCourse = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('Khoa Live Me','khoa-live-me',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('Khoa Phu De LeCh ID','khoa-phu-lech-id',$1,FALSE,FALSE)`,
    [teacher.id],
  );
  const recordCourse = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('Khoa Hoc Record TTXH','khoa-record-ttxh',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];

  const liveClass = (await db.query(
    `INSERT INTO live_classes(id,title,course_id,instructor_id,status)
     VALUES (8,'Tieng Trung Xa Hoi',$1,$2,'active') RETURNING id`,
    [liveCourse.id, teacher.id],
  )).rows[0];

  const session1 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 1',NOW() - interval '2 days',NOW() - interval '2 days' + interval '1 hour','scheduled',TRUE) RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const session2 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 2',NOW() - interval '1 day',NOW() - interval '1 day' + interval '1 hour','scheduled',FALSE) RETURNING id`,
    [liveClass.id],
  )).rows[0];

  const v1 = (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Video Buoi 1','bunny_stream','111','ttxh-v1','ready',100) RETURNING id`,
  )).rows[0];
  const v2 = (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ('Video Buoi 2','bunny_stream','111','ttxh-v2','ready',100) RETURNING id`,
  )).rows[0];
  await db.query(
    `INSERT INTO class_session_videos(class_session_id,video_asset_id,video_type,is_published)
     VALUES ($1,$2,'primary',TRUE), ($3,$4,'primary',TRUE)`,
    [session1.id, v1.id, session2.id, v2.id],
  );

  const quiz1 = (await db.query(
    `INSERT INTO quizzes(title,course_id,class_session_id,live_class_id,duration_minutes,passing_score,status)
     VALUES ('Quiz Buoi 1',$1,$2,$3,45,60,'PUBLISHED') RETURNING id`,
    [liveCourse.id, session1.id, liveClass.id],
  )).rows[0];

  // Profile 1: accidental archived duplicate on parent liveCourse
  await db.query(
    `INSERT INTO video_course_profiles(course_id,management_class_id,mode,source_live_class_id,status,deleted_at)
     VALUES ($1,'old-duplicate-alias','MIRROR',$2,'archived',NOW())`,
    [liveCourse.id, liveClass.id],
  );
  // Profile 2: active MIRROR profile on recordCourse (note recordCourse.id !== recordProfile.id)
  const recordProfile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,management_class_id,mode,source_live_class_id,status)
     VALUES ($1,'fe99d3a784614ac693328b97d49945e0','MIRROR',$2,'active') RETURNING *`,
    [recordCourse.id, liveClass.id],
  )).rows[0];
  assert.notEqual(String(recordProfile.id), String(recordCourse.id));

  const alias2 = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id,source_class_source_id,live_class_id,course_id,learning_mode,recording_content_mode,title,status,management_source_updated_at)
     VALUES ('fe99d3a784614ac693328b97d49945e0','src-ttxh',$1,$2,'recording','MIRROR','Khoa record TTXH','active',NOW()) RETURNING id`,
    [liveClass.id, recordCourse.id],
  )).rows[0];

  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,course_id,learning_mode,management_class_alias_id,status)
     VALUES ($1,$2,$3,'recording',$4,'active'), ($5,$2,$3,'live',NULL,'active')`,
    [recordStudent.id, liveClass.id, liveCourse.id, alias2.id, liveStudent.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW()), ($3,$4,'active',NOW() - interval '1 day',NOW())`,
    [recordStudent.id, recordCourse.id, liveStudent.id, liveCourse.id],
  );

  // Record student watched >= 50% and submitted quiz1 scoped explicitly to recordProfile.id
  await recordVideoWatchProgress({
    userId: recordStudent.id,
    videoAssetId: v1.id,
    courseId: recordCourse.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 0,
    watchedDeltaSeconds: 0,
    durationSeconds: 100,
  });
  await db.query(
    `UPDATE video_watch_progress SET last_heartbeat_at = NOW() - INTERVAL '65 seconds'
     WHERE user_id = $1 AND video_asset_id = $2`,
    [recordStudent.id, v1.id],
  );
  await recordVideoWatchProgress({
    userId: recordStudent.id,
    videoAssetId: v1.id,
    courseId: recordCourse.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 60,
    watchedDeltaSeconds: 60,
    durationSeconds: 100,
  });
  await db.query(
    `INSERT INTO quiz_attempts(quiz_id,user_id,video_course_profile_id,attempt_number,score,max_score,status,submitted_at)
     VALUES ($1,$2,$3,1,9.10,10,'submitted',NOW())`,
    [quiz1.id, recordStudent.id, recordProfile.id],
  );

  const callRoute = (method, path, reqProps) => new Promise((resolve, reject) => {
    const layer = videoCourseRouter.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} missing`);
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve(res); return this; },
    };
    Promise.resolve(layer.route.stack.at(-1).handle({ params: {}, query: {}, body: {}, ...reqProps }, res))
      .then(() => { if (!res.body) resolve(res); })
      .catch(reject);
  });

  // 1. Record learner workspace recognizes scoped quiz attempt on recordProfile.id and unlocks Session 2
  const wsRes = await callRoute("get", "/:offeringId/workspace", {
    user: { id: recordStudent.id, role: "user", is_management_managed: true, lms_account_status: "active" },
    authSession: { trustedDeviceId: recordDeviceId },
    params: { offeringId: "fe99d3a784614ac693328b97d49945e0" },
    query: {},
  });
  assert.equal(wsRes.statusCode, 200, JSON.stringify(wsRes.body));
  assert.equal(wsRes.body.data.videoCourseProfileId, String(recordProfile.id));
  assert.equal(wsRes.body.data.units[0].isVideoCompleted, true);
  assert.equal(wsRes.body.data.units[0].completedQuizCount, 1);
  assert.equal(wsRes.body.data.units[0].isQuizCompleted, true);
  assert.equal(wsRes.body.data.units[0].isCompleted, true);
  assert.equal(wsRes.body.data.units[1].isLocked, false);
  assert.equal(wsRes.body.data.activeUnit.quizzes[0].attemptsCount, 1);
  assert.equal(wsRes.body.data.activeUnit.quizzes[0].isCompleted, true);
  assert.equal(wsRes.body.data.activeUnit.quizzes[0].bestScore, 9.1);

  // 2. Live learner retains full MIRROR review access via both alias UUID and liveClass.id
  for (const offering of ["fe99d3a784614ac693328b97d49945e0", String(liveClass.id)]) {
    const liveWs = await callRoute("get", "/:offeringId/workspace", {
      user: { id: liveStudent.id, role: "user", is_management_managed: true, lms_account_status: "active" },
      authSession: { trustedDeviceId: liveDeviceId },
      params: { offeringId: offering },
      query: {},
    });
    assert.equal(liveWs.statusCode, 200, JSON.stringify(liveWs.body));
    assert.equal(liveWs.body.data.capabilities.canReviewFreely, true);
    assert.equal(liveWs.body.data.units[1].isLocked, false);
  }

  // 3. Admin list hides archived-only liveCourse and shows recordCourse; public catalog shows only active record offering
  const adminCourses = await callRoute("get", "/admin/courses", { user: admin });
  assert.equal(adminCourses.statusCode, 200);
  const adminCourseIds = adminCourses.body.data.courses.map((c) => c.id);
  assert.equal(adminCourseIds.includes(String(liveCourse.id)), false, "Archived-only liveCourse should be hidden");
  assert.equal(adminCourseIds.includes(String(recordCourse.id)), true);

  const catalogRes = await callRoute("get", "/", { user: null });
  assert.equal(catalogRes.statusCode, 200);
  assert.deepEqual(
    catalogRes.body.data.map((c) => c.offeringId),
    ["fe99d3a784614ac693328b97d49945e0"],
  );
});

test("cross-course MIRROR: admin student list includes Live students and Record files/entitlement work across courses", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((m) => JSON.parse(m[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  process.env.BUNNY_STREAM_LIBRARY_ID = "12345";
  process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY = "test-bunny-token-secret";
  for (const [k, v] of Object.entries({
    R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "access", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "bucket",
  })) process.env[k] = v;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 200, headers: { "content-length": "10" } });
  t.after(() => { globalThis.fetch = previousFetch; });

  const { pool } = await import("../db/connect.js");
  bindPoolToDb(pool, db);
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;
  const fileRouter = (await import("./file.router.js")).default;
  const { verifyLearnerVideoAccess } = await import("./bunnyVideo.router.js");
  const { hasEffectiveCourseEntitlement } = await import("../services/externalEntitlementAccess.service.js");

  const insertUser = async (name, role = "user") => (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ($1,$2,$3,TRUE,'active') RETURNING id,username,email,role,is_management_managed,lms_account_status`,
    [name, `${name}@example.test`, role],
  )).rows[0];

  const [admin, teacher, liveStudent, revokedLiveStudent, otherClassStudent, recordStudent] = await Promise.all([
    insertUser("xmirror-admin", "admin"),
    insertUser("xmirror-teacher", "creator"),
    insertUser("xmirror-live"),
    insertUser("xmirror-live-revoked"),
    insertUser("xmirror-other-class"),
    insertUser("xmirror-record"),
  ]);
  const [liveDeviceId, recordDeviceId] = await Promise.all([
    addTrustedDevice(db, liveStudent.id, "xmirror-live"),
    addTrustedDevice(db, recordStudent.id, "xmirror-record"),
  ]);

  const liveCourse = (await db.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed,external_course_id)
     VALUES ('Khoa Live CSCA','Khoa Live CSCA','khoa-live-csca',$1,TRUE,TRUE,'internal_live_parent') RETURNING id`,
    [teacher.id],
  )).rows[0];
  const recordCourse = (await db.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published,is_management_managed,external_course_id)
     VALUES ('Khoa Record TTXH','Khoa Record TTXH','khoa-record-ttxh',$1,TRUE,TRUE,'internal_record_child') RETURNING id`,
    [teacher.id],
  )).rows[0];

  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status,management_class_source_id)
     VALUES ('Tieng trung xa hoi',$1,$2,'active','src-live-class-8') RETURNING id`,
    [liveCourse.id, teacher.id],
  )).rows[0];
  const otherLiveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Lop khac',$1,$2,'active') RETURNING id`,
    [liveCourse.id, teacher.id],
  )).rows[0];

  const session1 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 1 Preview',NOW(),NOW() + INTERVAL '1 hour','scheduled',TRUE) RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const session2 = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status,is_public_preview)
     VALUES ($1,'Buoi 2 Protected',NOW() + INTERVAL '1 day',NOW() + INTERVAL '1 day 1 hour','scheduled',FALSE) RETURNING id`,
    [liveClass.id],
  )).rows[0];

  const [video1, video2] = await Promise.all([1, 2].map(async (idx) => (await db.query(
    `INSERT INTO video_assets(title,provider,provider_library_id,provider_video_id,playback_status,duration_seconds)
     VALUES ($1,'bunny_stream','12345',$2,'ready',120) RETURNING id`,
    [`XMirror Video ${idx}`, `xmirror-guid-${idx}`],
  )).rows[0]));
  await db.query(
    "INSERT INTO class_session_videos(class_session_id,video_asset_id,video_type,is_published) VALUES ($1,$2,'primary',TRUE)",
    [session1.id, video1.id],
  );
  await db.query(
    "INSERT INTO class_session_videos(class_session_id,video_asset_id,video_type,is_published) VALUES ($1,$2,'primary',TRUE)",
    [session2.id, video2.id],
  );

  const file2 = (await db.query(
    `INSERT INTO lms_learning_files
       (live_class_id,course_id,class_session_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,$3,$4,'buoi2-slide.pdf','learning-files/buoi2-slide.pdf','application/pdf',10,'CLASS_ONLY','ready')
     RETURNING id`,
    [liveClass.id, liveCourse.id, session2.id, teacher.id],
  )).rows[0];

  await db.query(
    `INSERT INTO video_course_profiles
       (course_id,management_class_id,mode,source_live_class_id,status,deleted_at)
     VALUES ($1,'archived-duplicate-cls','MIRROR',$2,'archived',NOW())`,
    [liveCourse.id, liveClass.id],
  );
  const recordProfile = (await db.query(
    `INSERT INTO video_course_profiles
       (course_id,management_class_id,mode,source_live_class_id,allow_file_download,status)
     VALUES ($1,'active-record-ttxh','MIRROR',$2,FALSE,'active') RETURNING id`,
    [recordCourse.id, liveClass.id],
  )).rows[0];
  const alias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id,source_class_source_id,live_class_id,course_id,learning_mode,recording_content_mode,title,status,management_source_updated_at)
     VALUES ('active-record-ttxh','src-live-class-8',$1,$2,'recording','MIRROR','TTXH Record','active',NOW()) RETURNING id`,
    [liveClass.id, recordCourse.id],
  )).rows[0];

  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,course_id,status,learning_mode,management_approval_status)
     VALUES ($1,$2,$3,'active','live','approved'), ($4,$2,$3,'active','live','approved'), ($5,$6,$3,'active','live','approved')`,
    [liveStudent.id, liveClass.id, liveCourse.id, revokedLiveStudent.id, otherClassStudent.id, otherLiveClass.id],
  );
  await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,course_id,status,learning_mode,management_class_alias_id,management_approval_status)
     VALUES ($1,$2,$3,'active','recording',$4,'approved')`,
    [recordStudent.id, liveClass.id, liveCourse.id, alias.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW()),
            ($3,$2,'revoked',NOW() - INTERVAL '1 day',NOW()),
            ($4,$2,'active',NOW() - INTERVAL '1 day',NOW()),
            ($5,$6,'active',NOW() - INTERVAL '1 day',NOW())`,
    [liveStudent.id, liveCourse.id, revokedLiveStudent.id, otherClassStudent.id, recordStudent.id, recordCourse.id],
  );
  await db.query(
    `INSERT INTO video_watch_progress
       (user_id,video_asset_id,course_id,live_class_id,class_session_id,last_position_seconds,watched_seconds,completion_percent,is_completed)
     VALUES ($1,$2,$3,$4,$5,90,90,75,TRUE)`,
    [recordStudent.id, video1.id, liveCourse.id, liveClass.id, session1.id],
  );

  const response = () => ({
    statusCode: 200,
    body: null,
    location: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    redirect(code, location) { this.statusCode = code; this.location = location; return this; },
    set(values) {
      for (const [key, value] of Object.entries(values || {})) this.headers[key.toLowerCase()] = value;
      return this;
    },
  });
  const handle = (router, method, path) => router.stack.find((layer) => (
    layer.route?.path === path && layer.route.methods[method]
  )).route.stack.at(-1).handle;

  // 1. Admin students list includes BOTH Live inherited student AND Record student, excludes revoked/other-class
  const studentsRes = response();
  await handle(videoCourseRouter, "get", "/admin/courses/:courseId/students")({
    user: admin,
    params: { courseId: String(recordCourse.id) },
    query: { profileId: String(recordProfile.id) },
  }, studentsRes);
  assert.equal(studentsRes.statusCode, 200, JSON.stringify(studentsRes.body));
  assert.equal(studentsRes.body.data.total, 2);
  const byUser = new Map(studentsRes.body.data.students.map((s) => [s.userId, s]));
  assert.equal(byUser.get(String(liveStudent.id))?.accessSource, "LIVE_MIRROR");
  assert.equal(byUser.get(String(recordStudent.id))?.accessSource, "RECORD_MEMBERSHIP");
  assert.equal(byUser.get(String(recordStudent.id))?.progressPercent, 75);
  assert.equal(byUser.has(String(revokedLiveStudent.id)), false);
  assert.equal(byUser.has(String(otherClassStudent.id)), false);

  // 2. Live student file view in VideoCourse (inline) and direct Live download both work
  const liveVideoFileInline = response();
  await handle(fileRouter, "get", "/files/:fileId/download")({
    user: liveStudent,
    params: { fileId: String(file2.id) },
    query: {
      classId: String(liveClass.id),
      videoCourseId: String(recordCourse.id),
      videoCourseProfileId: String(recordProfile.id),
    },
  }, liveVideoFileInline);
  assert.equal(liveVideoFileInline.statusCode, 200);
  assert.match(liveVideoFileInline.body, /CHỈ XEM/);

  const liveDirectDownload = response();
  await handle(fileRouter, "get", "/files/:fileId/download")({
    user: liveStudent,
    params: { fileId: String(file2.id) },
    query: { classId: String(liveClass.id), download: "1" },
  }, liveDirectDownload);
  assert.equal(liveDirectDownload.statusCode, 302);

  // 3. Record student has entitlement + playback + Buoi 2 file access (view-only) across courses
  assert.equal(await hasEffectiveCourseEntitlement({
    db,
    userId: recordStudent.id,
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
  }), true);

  const recordPlayback = await verifyLearnerVideoAccess({
    user: recordStudent,
    courseId: liveCourse.id,
    liveClassId: liveClass.id,
    req: { authSession: { trustedDeviceId: recordDeviceId } },
    db,
  });
  assert.equal(recordPlayback.allowed, true, JSON.stringify(recordPlayback));

  const recordFileInline = response();
  await handle(fileRouter, "get", "/files/:fileId/download")({
    user: recordStudent,
    params: { fileId: String(file2.id) },
    query: {
      classId: String(liveClass.id),
      videoCourseId: String(recordCourse.id),
      videoCourseProfileId: String(recordProfile.id),
    },
  }, recordFileInline);
  assert.equal(recordFileInline.statusCode, 200);
  assert.match(recordFileInline.body, /CHỈ XEM/);

  const recordFileBlockedDownload = response();
  await handle(fileRouter, "get", "/files/:fileId/download")({
    user: recordStudent,
    params: { fileId: String(file2.id) },
    query: { download: "1" },
  }, recordFileBlockedDownload);
  assert.equal(recordFileBlockedDownload.statusCode, 403);
  assert.equal(recordFileBlockedDownload.body.errorCode, "FILE_DOWNLOAD_DISABLED");
});
