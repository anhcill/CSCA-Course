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

test("video course workspace: multipart units require every video part >=60% plus quiz completion", async (t) => {
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
    `UPDATE video_watch_progress SET last_heartbeat_at = NOW() - INTERVAL '60 seconds'
     WHERE user_id = $1 AND video_asset_id = $2`,
    [student.id, asset1Part2.id],
  );
  const part2Target = await recordVideoWatchProgress({
    userId: student.id,
    videoAssetId: asset1Part2.id,
    courseId: course.id,
    liveClassId: liveClass.id,
    classSessionId: session1.id,
    currentTimeSeconds: 60,
    watchedDeltaSeconds: 60,
  });
  assert.equal(part2Target.completionPercent, 60);
  assert.equal(part2Target.unitProgress.completionPercent, 61.33);
  assert.equal(part2Target.unitProgress.isCompleted, true);

  ws = await fetchWorkspace();
  assert.equal(ws.units[0].isVideoCompleted, true);
  assert.equal(ws.units[0].isQuizCompleted, false);
  assert.equal(ws.units[1].isLocked, true, "Session 2 must remain locked until Quiz 1 is completed");

  // Step 4: Learner submits Quiz 1 -> Session 1 is fully completed and Session 2 unlocks!
  await db.query(
    `INSERT INTO quiz_attempts(quiz_id,user_id,video_course_profile_id,score,max_score,status,submitted_at)
     VALUES ($1,$2,$3,9,10,'submitted',NOW())`,
    [quiz1.id, student.id, videoProfile.id],
  );

  ws = await fetchWorkspace();
  assert.equal(ws.units[0].isVideoCompleted, true);
  assert.equal(ws.units[0].isQuizCompleted, true);
  assert.equal(ws.units[0].isCompleted, true);
  assert.equal(ws.units[1].isLocked, false, "Session 2 must unlock after >=60% watch time AND quiz completion");

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
