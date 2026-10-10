import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const invoke = async (router, method, path, { params = {}, query = {}, body = {}, user } = {}) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method} ${path}`);
  const response = {
    statusCode: 200, body: null, location: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    redirect(code, location) { this.statusCode = code; this.location = location; return this; },
  };
  await layer.route.stack.at(-1).handle({ params, query, body, user, ip: "127.0.0.1" }, response);
  return response;
};

test("file visibility and video upload intent enforce teacher and learner scope", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const addUser = async (name, role) => (await db.query(
    "INSERT INTO users(username,email,role) VALUES ($1,$2,$3) RETURNING id,role",
    [name, `${name}@example.test`, role],
  )).rows[0];
  const [admin, teacher, otherTeacher, learnerA, learnerB] = await Promise.all([
    addUser("policy-admin", "admin"), addUser("policy-teacher", "creator"),
    addUser("policy-other-teacher", "creator"), addUser("policy-learner-a", "user"),
    addUser("policy-learner-b", "user"),
  ]);
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id) VALUES ('Policy','policy-course',$1) RETURNING id",
    [teacher.id],
  )).rows[0];
  const classA = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('A',$1,$2) RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const classB = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('B',$1,$2) RETURNING id",
    [course.id, otherTeacher.id],
  )).rows[0];
  await db.query("INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')", [classA.id, teacher.id]);
  for (const [learner, cls] of [[learnerA, classA], [learnerB, classB]]) {
    await db.query("INSERT INTO class_enrollments(user_id,live_class_id) VALUES ($1,$2)", [learner.id, cls.id]);
    await db.query(
      `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
       VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
      [learner.id, course.id],
    );
  }
  const addFile = async (visibility, cls = classA) => (await db.query(
    `INSERT INTO lms_learning_files(live_class_id,course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,$3,$4,$5,'application/pdf',10,$6,'ready') RETURNING id`,
    [cls.id, course.id, cls.id === classA.id ? teacher.id : otherTeacher.id,
      `${visibility}-${cls.id}.pdf`, `learning-files/${cls.id}/${visibility}.pdf`, visibility],
  )).rows[0];
  const privateFile = await addFile("PRIVATE");
  const classOnly = await addFile("CLASS_ONLY");
  const courseWide = await addFile("COURSE");
  const otherClass = await addFile("CLASS_ONLY", classB);

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  for (const [key, value] of Object.entries({
    R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "access", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "bucket",
  })) process.env[key] = value;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 200, headers: { "content-length": "10" } });
  t.after(() => { globalThis.fetch = previousFetch; });
  const fileRouter = (await import("./file.router.js")).default;
  const videoRouter = (await import("./video.router.js")).default;
  const courseRouter = (await import("./course.router.js")).default;

  const listedA = await invoke(fileRouter, "get", "/student/files", { user: learnerA });
  assert.equal(listedA.statusCode, 200, JSON.stringify(listedA.body));
  assert.deepEqual(new Set(listedA.body.data.map((file) => file.id)), new Set([String(classOnly.id), String(courseWide.id)]));
  const listedB = await invoke(fileRouter, "get", "/student/files", { user: learnerB });
  assert.deepEqual(new Set(listedB.body.data.map((file) => file.id)), new Set([String(courseWide.id), String(otherClass.id)]));
  await db.query("UPDATE courses SET is_published=TRUE WHERE id=$1", [course.id]);
  const workspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: { ...learnerA, is_management_managed: true, lms_account_status: "active" },
    params: { courseId: course.id }, query: { classId: classA.id },
  });
  assert.equal(workspace.statusCode, 200, JSON.stringify(workspace.body));
  assert.deepEqual(new Set(workspace.body.data.files.map((file) => file.id)),
    new Set([String(classOnly.id), String(courseWide.id)]));
  const teacherWorkspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: teacher, params: { courseId: course.id }, query: { classId: classA.id },
  });
  assert.equal(teacherWorkspace.statusCode, 200, JSON.stringify(teacherWorkspace.body));
  assert.deepEqual(new Set(teacherWorkspace.body.data.files.map((file) => file.id)),
    new Set([String(privateFile.id), String(classOnly.id), String(courseWide.id)]));
  const download = (user, id) => invoke(fileRouter, "get", "/files/:fileId/download", { user, params: { fileId: id } });
  assert.equal((await download(learnerA, privateFile.id)).statusCode, 403);
  assert.equal((await download(learnerB, classOnly.id)).statusCode, 403);
  assert.equal((await download(learnerB, courseWide.id)).statusCode, 302);
  assert.equal((await download(admin, privateFile.id)).statusCode, 302);
  const pendingFile = (await db.query(
    `INSERT INTO lms_learning_files(live_class_id,course_id,uploaded_by,original_name,storage_key,mime_type,size_bytes,visibility,status)
     VALUES ($1,$2,$3,'admin-confirm.pdf','learning-files/admin-confirm.pdf','application/pdf',10,'CLASS_ONLY','pending') RETURNING id`,
    [classA.id, course.id, teacher.id],
  )).rows[0];
  assert.equal((await invoke(fileRouter, "post", "/teacher/files/:fileId/confirm", {
    user: admin, params: { fileId: pendingFile.id },
  })).statusCode, 200);

  await db.query("UPDATE class_teachers SET status='revoked' WHERE live_class_id=$1 AND teacher_id=$2", [classA.id, teacher.id]);
  const revokedWorkspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: teacher, params: { courseId: course.id }, query: { classId: classA.id },
  });
  assert.equal(revokedWorkspace.statusCode, 403);
  assert.equal((await download(teacher, privateFile.id)).statusCode, 403);
  assert.equal((await invoke(fileRouter, "delete", "/teacher/files/:fileId", {
    user: teacher, params: { fileId: privateFile.id },
  })).statusCode, 403);

  await db.query(
    `UPDATE lms_role_permissions SET is_allowed = FALSE
     WHERE role = 'creator' AND permission_id = (SELECT id FROM lms_permissions WHERE code = 'lms.file.manage')`,
  );
  for (const path of ["/upload-url", "/confirm"]) {
    const route = videoRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods.post).route;
    let continued = false;
    const response = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await route.stack.at(-2).handle({ user: teacher }, response, () => { continued = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.permission, "lms.file.manage");
    assert.equal(continued, false);
  }
  await db.query(
    `UPDATE lms_role_permissions SET is_allowed = TRUE
     WHERE role = 'creator' AND permission_id = (SELECT id FROM lms_permissions WHERE code = 'lms.file.manage')`,
  );

  const upload = await invoke(videoRouter, "post", "/upload-url", {
    user: teacher, body: { filename: "lesson.mp4", mimeType: "video/mp4", sizeBytes: 10 },
  });
  assert.equal(upload.statusCode, 200, JSON.stringify(upload.body));
  const key = upload.body.data.fileKey;
  assert.equal(String((await db.query("SELECT uploaded_by,status FROM video_assets WHERE r2_key=$1", [key])).rows[0].uploaded_by), String(teacher.id));
  const confirmation = { title: "Lesson", r2Key: key, mimeType: "video/mp4", sizeBytes: 10, durationSeconds: 30 };
  assert.equal((await invoke(videoRouter, "post", "/confirm", { user: otherTeacher, body: confirmation })).statusCode, 403);
  assert.equal((await invoke(videoRouter, "post", "/confirm", { user: teacher, body: { ...confirmation, sizeBytes: 11 } })).statusCode, 422);
  assert.equal((await invoke(videoRouter, "post", "/confirm", { user: teacher, body: confirmation })).statusCode, 200);
  assert.equal((await invoke(videoRouter, "post", "/confirm", { user: teacher, body: { ...confirmation, title: "Changed" } })).statusCode, 403);
  const videoAsset = (await db.query("SELECT id FROM video_assets WHERE r2_key=$1", [key])).rows[0];
  const lesson = (await db.query(
    `INSERT INTO lessons(course_id,name,is_published,video_asset_id)
     VALUES ($1,'Policy lesson',TRUE,$2) RETURNING id`,
    [course.id, videoAsset.id],
  )).rows[0];
  await db.query("INSERT INTO enrollments(user_id,course_id,status) VALUES ($1,$2,'active')", [learnerA.id, course.id]);
  const playback = (user) => invoke(videoRouter, "get", "/playback-url", {
    user, query: { lessonId: lesson.id },
  });
  const managedLearner = { ...learnerA, is_management_managed: true, lms_account_status: "active" };
  assert.equal((await playback(managedLearner)).statusCode, 200);
  assert.equal((await playback(learnerA)).statusCode, 403);
  await db.query("UPDATE lms_access_grants SET access_status='revoked',revoked_at=NOW() WHERE user_id=$1 AND course_id=$2", [learnerA.id, course.id]);
  assert.equal((await playback(managedLearner)).statusCode, 403, "legacy enrollment must not preserve video access");
  assert.equal((await playback(admin)).statusCode, 200);
  const legacy = (await db.query(
    "INSERT INTO video_assets(r2_key,mime_type,status) VALUES ('videos/legacy.mp4','video/mp4','ready') RETURNING id",
  )).rows[0];
  assert.equal((await invoke(videoRouter, "post", "/confirm", {
    user: teacher, body: { ...confirmation, r2Key: "videos/legacy.mp4" },
  })).statusCode, 403);
  assert.equal((await db.query("SELECT uploaded_by,title FROM video_assets WHERE id=$1", [legacy.id])).rows[0].uploaded_by, null);
});
