import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const invoke = async (router, method, path, { params = {}, query = {}, body = {}, user, file } = {}) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method} ${path}`);
  const response = {
    statusCode: 200, body: null, location: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    redirect(code, location) { this.statusCode = code; this.location = location; return this; },
  };
  await layer.route.stack.at(-1).handle({ params, query, body, user, file, ip: "127.0.0.1" }, response);
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
  const otherCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id) VALUES ('Other policy','other-policy-course',$1) RETURNING id",
    [teacher.id],
  )).rows[0];
  const otherCourseClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Other course class',$1,$2) RETURNING id",
    [otherCourse.id, teacher.id],
  )).rows[0];
  const classBSession = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Reusable session',NOW(),NOW() + interval '1 hour','scheduled') RETURNING id`,
    [classB.id],
  )).rows[0];
  await db.query("UPDATE live_classes SET allow_file_download=FALSE WHERE id=$1", [classB.id]);
  await db.query("INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')", [classA.id, teacher.id]);
  await db.query("INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')", [classB.id, teacher.id]);
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

  const avatarUpload = await invoke(fileRouter, "post", "/files/images/upload", {
    user: learnerA,
    body: { folder: "avatars" },
    file: {
      originalname: "avatar.png",
      mimetype: "image/png",
      size: 4,
      buffer: Buffer.from("test"),
    },
  });
  assert.equal(avatarUpload.statusCode, 201, JSON.stringify(avatarUpload.body));
  assert.match(avatarUpload.body.data.fileKey, /^images\/avatars\//);
  assert.match(avatarUpload.body.data.publicUrl, /\/api\/images\/images\/avatars\//);
  const forbiddenCourseImage = await invoke(fileRouter, "post", "/files/images/upload", {
    user: learnerA,
    body: { folder: "courses" },
    file: {
      originalname: "course.png",
      mimetype: "image/png",
      size: 4,
      buffer: Buffer.from("test"),
    },
  });
  assert.equal(forbiddenCourseImage.statusCode, 403);

  const managedLearnerA = { ...learnerA, is_management_managed: true, lms_account_status: "active" };
  const managedLearnerB = { ...learnerB, is_management_managed: true, lms_account_status: "active" };
  const listedA = await invoke(fileRouter, "get", "/student/files", { user: managedLearnerA });
  assert.equal(listedA.statusCode, 200, JSON.stringify(listedA.body));
  assert.deepEqual(new Set(listedA.body.data.map((file) => file.id)), new Set([String(classOnly.id), String(courseWide.id)]));
  assert.match(listedA.body.data.find((file) => file.id === String(classOnly.id)).downloadUrl, new RegExp(`classId=${classA.id}&download=1$`));
  assert.ok(listedA.body.data.find((file) => file.id === String(courseWide.id)).downloadUrl.endsWith("/download?download=1"));
  const listedB = await invoke(fileRouter, "get", "/student/files", { user: managedLearnerB });
  assert.deepEqual(new Set(listedB.body.data.map((file) => file.id)), new Set([String(courseWide.id), String(otherClass.id)]));
  assert.ok(listedB.body.data.every((file) => file.canDownload === false));
  assert.ok(listedB.body.data.every((file) => file.downloadUrl === null));
  assert.match(listedB.body.data.find((file) => file.id === String(otherClass.id)).viewUrl, new RegExp(`classId=${classB.id}$`));
  assert.ok(listedB.body.data.find((file) => file.id === String(courseWide.id)).viewUrl.endsWith("/download"));
  await db.query("UPDATE courses SET is_published=TRUE WHERE id=$1", [course.id]);

  const reusableFiles = await invoke(fileRouter, "get", "/teacher/files/reusable", {
    user: teacher, query: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(reusableFiles.statusCode, 200, JSON.stringify(reusableFiles.body));
  assert.ok(reusableFiles.body.data.some((file) => file.id === String(classOnly.id)));
  const unauthorizedAttach = await invoke(fileRouter, "post", "/teacher/files/:fileId/placements", {
    user: otherTeacher,
    params: { fileId: classOnly.id },
    body: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(unauthorizedAttach.statusCode, 403);
  assert.equal(unauthorizedAttach.body.errorCode, "FORBIDDEN");
  await db.query("INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')", [classA.id, otherTeacher.id]);
  const privateReusableFiles = await invoke(fileRouter, "get", "/teacher/files/reusable", {
    user: otherTeacher, query: { classId: classB.id },
  });
  assert.equal(privateReusableFiles.statusCode, 200, JSON.stringify(privateReusableFiles.body));
  assert.ok(!privateReusableFiles.body.data.some((file) => file.id === String(privateFile.id)));
  const privateAttach = await invoke(fileRouter, "post", "/teacher/files/:fileId/placements", {
    user: otherTeacher,
    params: { fileId: privateFile.id },
    body: { classId: classB.id },
  });
  assert.equal(privateAttach.statusCode, 403);
  assert.equal(privateAttach.body.errorCode, "FORBIDDEN");
  const crossCourseAttach = await invoke(fileRouter, "post", "/teacher/files/:fileId/placements", {
    user: teacher,
    params: { fileId: classOnly.id },
    body: { classId: otherCourseClass.id },
  });
  assert.equal(crossCourseAttach.statusCode, 409);
  assert.equal(crossCourseAttach.body.errorCode, "COURSE_SCOPE_MISMATCH");
  const attach = await invoke(fileRouter, "post", "/teacher/files/:fileId/placements", {
    user: teacher,
    params: { fileId: classOnly.id },
    body: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(attach.statusCode, 201, JSON.stringify(attach.body));
  const placementId = attach.body.data.placementId;
  const duplicateAttach = await invoke(fileRouter, "post", "/teacher/files/:fileId/placements", {
    user: teacher,
    params: { fileId: classOnly.id },
    body: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(duplicateAttach.statusCode, 409);
  assert.equal(duplicateAttach.body.errorCode, "FILE_ALREADY_ATTACHED");
  const reusedInSession = await invoke(fileRouter, "get", "/student/files", {
    user: managedLearnerB,
    query: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(reusedInSession.statusCode, 200, JSON.stringify(reusedInSession.body));
  assert.equal(reusedInSession.body.data.length, 1);
  assert.equal(reusedInSession.body.data[0].id, String(classOnly.id));
  assert.equal(reusedInSession.body.data[0].placementId, String(placementId));
  assert.equal(reusedInSession.body.data[0].isReused, true);
  assert.equal(reusedInSession.body.data[0].canDownload, false);
  assert.equal(reusedInSession.body.data[0].downloadUrl, null);
  assert.match(reusedInSession.body.data[0].viewUrl, new RegExp(`classId=${classB.id}$`));
  const reusedWorkspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: managedLearnerB,
    params: { courseId: course.id },
    query: { classId: classB.id },
  });
  assert.equal(reusedWorkspace.statusCode, 200, JSON.stringify(reusedWorkspace.body));
  const reusedWorkspaceFile = reusedWorkspace.body.data.files.find((file) => file.placementId === String(placementId));
  assert.equal(reusedWorkspaceFile?.id, String(classOnly.id));
  assert.equal(reusedWorkspaceFile?.isReused, true);
  assert.equal(reusedWorkspaceFile?.canDownload, false);
  const reusedInline = await invoke(fileRouter, "get", "/files/:fileId/download", {
    user: managedLearnerB,
    params: { fileId: classOnly.id },
    query: { classId: classB.id },
  });
  assert.equal(reusedInline.statusCode, 200);
  assert.match(reusedInline.body, /CHỈ XEM/);
  const reusedForcedDownload = await invoke(fileRouter, "get", "/files/:fileId/download", {
    user: managedLearnerB,
    params: { fileId: classOnly.id },
    query: { classId: classB.id, download: "1" },
  });
  assert.equal(reusedForcedDownload.statusCode, 403);
  assert.equal(reusedForcedDownload.body.errorCode, "FILE_DOWNLOAD_DISABLED");
  const blockedSourceDelete = await invoke(fileRouter, "delete", "/teacher/files/:fileId", {
    user: teacher, params: { fileId: classOnly.id },
  });
  assert.equal(blockedSourceDelete.statusCode, 409);
  assert.equal(blockedSourceDelete.body.errorCode, "FILE_IN_USE");
  const detach = await invoke(fileRouter, "delete", "/teacher/file-placements/:placementId", {
    user: teacher, params: { placementId },
  });
  assert.equal(detach.statusCode, 200, JSON.stringify(detach.body));
  const afterDetach = await invoke(fileRouter, "get", "/student/files", {
    user: managedLearnerB,
    query: { classId: classB.id, sessionId: classBSession.id },
  });
  assert.equal(afterDetach.statusCode, 200, JSON.stringify(afterDetach.body));
  assert.equal(afterDetach.body.data.length, 0);
  assert.equal((await db.query("SELECT status FROM lms_learning_files WHERE id=$1", [classOnly.id])).rows[0].status, "ready");
  const workspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: { ...learnerA, is_management_managed: true, lms_account_status: "active" },
    params: { courseId: course.id }, query: { classId: classA.id },
  });
  assert.equal(workspace.statusCode, 200, JSON.stringify(workspace.body));
  assert.deepEqual(new Set(workspace.body.data.files.map((file) => file.id)),
    new Set([String(classOnly.id), String(courseWide.id)]));
  const restrictedWorkspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: { ...learnerB, is_management_managed: true, lms_account_status: "active" },
    params: { courseId: course.id }, query: { classId: classB.id },
  });
  assert.equal(restrictedWorkspace.statusCode, 200, JSON.stringify(restrictedWorkspace.body));
  assert.ok(restrictedWorkspace.body.data.files.every((file) => file.canDownload === false));
  assert.ok(restrictedWorkspace.body.data.files.every((file) => file.downloadUrl === null));
  const teacherWorkspace = await invoke(courseRouter, "get", "/:courseId/workspace", {
    user: teacher, params: { courseId: course.id }, query: { classId: classA.id },
  });
  assert.equal(teacherWorkspace.statusCode, 200, JSON.stringify(teacherWorkspace.body));
  assert.deepEqual(new Set(teacherWorkspace.body.data.files.map((file) => file.id)),
    new Set([String(privateFile.id), String(classOnly.id), String(courseWide.id)]));
  const download = (user, id) => invoke(fileRouter, "get", "/files/:fileId/download", { user, params: { fileId: id } });
  assert.equal((await download(learnerA, privateFile.id)).statusCode, 403);
  assert.equal((await download(learnerB, classOnly.id)).statusCode, 403);
  const inlinePdf = await download(learnerB, courseWide.id);
  assert.equal(inlinePdf.statusCode, 200);
  assert.match(inlinePdf.body, /CHỈ XEM/);
  assert.match(inlinePdf.body, /#toolbar=0&amp;navpanes=0&amp;scrollbar=1&amp;zoom=100/);
  assert.match(inlinePdf.body, /aria-label="Thu nhỏ PDF"/);
  assert.match(inlinePdf.body, /aria-label="Phóng to PDF"/);
  assert.match(inlinePdf.body, /frame\.style\.transform = 'scale\('/);
  assert.doesNotMatch(inlinePdf.body, />Tải/);
  const forcedDownload = await invoke(fileRouter, "get", "/files/:fileId/download", {
    user: learnerB, params: { fileId: courseWide.id }, query: { download: "1" },
  });
  assert.equal(forcedDownload.statusCode, 403);
  assert.equal(forcedDownload.body.errorCode, "FILE_DOWNLOAD_DISABLED");
  const allowedDownload = await invoke(fileRouter, "get", "/files/:fileId/download", {
    user: learnerA, params: { fileId: courseWide.id }, query: { download: "1" },
  });
  assert.equal(allowedDownload.statusCode, 302);
  assert.equal(new URL(allowedDownload.location).searchParams.get("response-content-disposition"),
    `attachment; filename="COURSE-${classA.id}.pdf"`);
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

  const deleteCalls = [];
  const testFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    deleteCalls.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };
  const adminDelete = await invoke(fileRouter, "delete", "/teacher/files/:fileId", {
    user: admin, params: { fileId: privateFile.id },
  });
  assert.equal(adminDelete.statusCode, 200);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].options.method, "DELETE");
  assert.ok(deleteCalls[0].url.includes("bucket/learning-files/"));
  const fileInDb = (await db.query("SELECT status FROM lms_learning_files WHERE id = $1", [privateFile.id])).rows[0];
  assert.equal(fileInDb.status, "deleted");
  const repeatDelete = await invoke(fileRouter, "delete", "/teacher/files/:fileId", {
    user: admin, params: { fileId: privateFile.id },
  });
  assert.equal(repeatDelete.statusCode, 404);
  globalThis.fetch = testFetch;

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
  assert.equal((await playback(managedLearnerA)).statusCode, 200);
  assert.equal((await playback(learnerA)).statusCode, 403);
  await db.query("UPDATE lms_access_grants SET access_status='revoked',revoked_at=NOW() WHERE user_id=$1 AND course_id=$2", [learnerA.id, course.id]);
  assert.equal((await playback(managedLearnerA)).statusCode, 403, "legacy enrollment must not preserve video access");
  assert.equal((await playback(admin)).statusCode, 200);
  const legacy = (await db.query(
    "INSERT INTO video_assets(r2_key,mime_type,status) VALUES ('videos/legacy.mp4','video/mp4','ready') RETURNING id",
  )).rows[0];
  assert.equal((await invoke(videoRouter, "post", "/confirm", {
    user: teacher, body: { ...confirmation, r2Key: "videos/legacy.mp4" },
  })).statusCode, 403);
  assert.equal((await db.query("SELECT uploaded_by,title FROM video_assets WHERE id=$1", [legacy.id])).rows[0].uploaded_by, null);
});
