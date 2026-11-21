import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("admin can approve a Management class and its enrollment", async (t) => {
  const previousBrevoKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "";
  const db = new PGlite();
  t.after(async () => {
    if (previousBrevoKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previousBrevoKey;
    await db.close();
  });
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const router = (await import("./platformAdmin.router.js")).default;
  const invoke = async (path, id, userId) => {
    const handler = router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ params: { id }, body: { decision: "approved" }, user: { id: userId }, ip: "127.0.0.1" }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  };

  const admin = (await db.query("INSERT INTO users(username,email,role) VALUES ('review-admin','review-admin@example.test','admin') RETURNING id")).rows[0];
  const student = (await db.query("INSERT INTO users(username,email,role) VALUES ('review-student','review-student@example.test','user') RETURNING id")).rows[0];
  const cls = (await db.query("INSERT INTO live_classes(title,status,management_class_source_id,management_approval_status,management_requested_status) VALUES ('Class for review','pending_approval','class-source-1','pending','active') RETURNING id")).rows[0];
  const membership = (await db.query("INSERT INTO class_enrollments(user_id,live_class_id,status,management_membership_source_id,management_membership_status,management_approval_status) VALUES ($1,$2,'suspended','membership-source-1','active','pending') RETURNING id", [student.id, cls.id])).rows[0];

  await invoke("/classes/:id/approval", cls.id, admin.id);
  const recordAlias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id,source_class_source_id,live_class_id,title,status,management_source_updated_at)
     VALUES ('record-class-source','class-source-1',$1,'Class for review - Record','active',NOW()) RETURNING id`,
    [cls.id],
  )).rows[0];
  await db.query(
    "UPDATE class_enrollments SET learning_mode='recording',management_class_alias_id=$1 WHERE id=$2",
    [recordAlias.id, membership.id],
  );
  const listMembershipApprovals = router.stack.find((layer) => (
    layer.route?.path === "/membership-approvals" && layer.route.methods.get
  )).route.stack.at(-1).handle;
  const approvalListResponse = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await listMembershipApprovals({ user: admin }, approvalListResponse);
  assert.equal(approvalListResponse.statusCode, 200, JSON.stringify(approvalListResponse.body));
  assert.equal(approvalListResponse.body.data[0].class_title, "Class for review - Record");
  await invoke("/membership-approvals/:id", membership.id, admin.id);
  assert.deepEqual((await db.query("SELECT status,management_approval_status FROM live_classes WHERE id=$1", [cls.id])).rows[0],
    { status: "active", management_approval_status: "approved" });
  assert.deepEqual((await db.query("SELECT status,management_approval_status FROM class_enrollments WHERE id=$1", [membership.id])).rows[0],
    { status: "active", management_approval_status: "approved" });

  // INDEPENDENT Record course enrollment (live_class_id IS NULL) MUST also appear in /membership-approvals and be approvable
  const indepCourse = (await db.query(
    "INSERT INTO courses(name,title,slug,author_id,is_published) VALUES ('Record Math','Khóa record toán csca','record-math',$1,TRUE) RETURNING id",
    [admin.id],
  )).rows[0];
  const indepProfile = (await db.query(
    "INSERT INTO video_course_profiles(course_id,management_class_id,mode,status) VALUES ($1,'record-math-source-1','INDEPENDENT','active') RETURNING id",
    [indepCourse.id],
  )).rows[0];
  const indepAlias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id,source_class_source_id,course_id,live_class_id,recording_content_mode,title,status,management_source_updated_at)
     VALUES ('record-math-source-1',NULL,$1,NULL,'INDEPENDENT','Khóa record toán csca','active',NOW()) RETURNING id`,
    [indepCourse.id],
  )).rows[0];
  const indepStudent = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('record-student','record-student@example.test','user') RETURNING id",
  )).rows[0];
  const indepMembership = (await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,course_id,status,learning_mode,management_class_alias_id,
        management_membership_source_id,management_membership_status,management_approval_status)
     VALUES ($1,NULL,$2,'suspended','recording',$3,'indep-membership-1','active','pending') RETURNING id`,
    [indepStudent.id, indepCourse.id, indepAlias.id],
  )).rows[0];
  const indepListRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await listMembershipApprovals({ user: admin }, indepListRes);
  assert.equal(indepListRes.statusCode, 200, JSON.stringify(indepListRes.body));
  const indepRow = indepListRes.body.data.find((row) => String(row.id) === String(indepMembership.id));
  assert.ok(indepRow, "Pending INDEPENDENT Record membership (live_class_id IS NULL) must appear in approval queue");
  assert.equal(indepRow.class_title, "Khóa record toán csca");
  assert.equal(String(indepRow.course_id), String(indepCourse.id));
  assert.equal(String(indepRow.video_course_profile_id), String(indepProfile.id));
  assert.equal(indepRow.learning_mode, "recording");
  await invoke("/membership-approvals/:id", indepMembership.id, admin.id);
  assert.deepEqual(
    (await db.query("SELECT status,management_approval_status FROM class_enrollments WHERE id=$1", [indepMembership.id])).rows[0],
    { status: "active", management_approval_status: "approved" },
  );

  const updateDownloadPolicy = router.stack.find((layer) => (
    layer.route?.path === "/classes/:id/file-download-policy" && layer.route.methods.patch
  )).route.stack.at(-1).handle;
  const policyResponse = { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await updateDownloadPolicy({
    params: { id: cls.id }, body: { allowFileDownload: false }, user: admin, ip: "127.0.0.1",
  }, policyResponse);
  assert.equal(policyResponse.statusCode, 200, JSON.stringify(policyResponse.body));
  assert.equal(policyResponse.body.data.allowFileDownload, false);
  assert.equal((await db.query("SELECT allow_file_download FROM live_classes WHERE id=$1", [cls.id])).rows[0].allow_file_download, false);

  const assignTeacher = router.stack.find((layer) => (
    layer.route?.path === "/classes/:id/teacher" && layer.route.methods.patch
  )).route.stack.at(-1).handle;
  const teacher = (await db.query(
    "INSERT INTO users(username,email,role,is_locked) VALUES ('assigned-teacher','assigned-teacher@example.test','creator',false) RETURNING id",
  )).rows[0];
  const assignmentResponse = { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await assignTeacher({
    params: { id: cls.id }, body: { teacherId: teacher.id }, user: admin, ip: "127.0.0.1",
  }, assignmentResponse);
  assert.equal(assignmentResponse.statusCode, 200, JSON.stringify(assignmentResponse.body));
  assert.equal(String(assignmentResponse.body.data.teacherId), String(teacher.id));
  assert.deepEqual((await db.query(
    "SELECT instructor_id,teacher_display_name FROM live_classes WHERE id=$1",
    [cls.id],
  )).rows[0], { instructor_id: teacher.id, teacher_display_name: "assigned-teacher" });
  assert.equal((await db.query(
    "SELECT status FROM class_teachers WHERE live_class_id=$1 AND teacher_id=$2",
    [cls.id, teacher.id],
  )).rows[0].status, "active");
  const unassignmentResponse = { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await assignTeacher({
    params: { id: cls.id }, body: { teacherId: null }, user: admin, ip: "127.0.0.1",
  }, unassignmentResponse);
  assert.equal(unassignmentResponse.statusCode, 200, JSON.stringify(unassignmentResponse.body));
  assert.equal(unassignmentResponse.body.data.teacherId, null);
  assert.equal((await db.query(
    "SELECT status FROM class_teachers WHERE live_class_id=$1 AND teacher_id=$2",
    [cls.id, teacher.id],
  )).rows[0].status, "revoked");

  const updatePermission = router.stack.find((layer) => layer.route?.path === "/permissions/:id" && layer.route.methods.patch).route.stack.at(-1).handle;
  const permission = (await db.query("SELECT id FROM lms_permissions WHERE code='lms.class.manage'")).rows[0];
  const response = () => ({ statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  });
  const denyTeacher = response();
  await updatePermission({ params: { id: permission.id }, body: { teacher: true }, user: admin }, denyTeacher);
  assert.equal(denyTeacher.statusCode, 409);
  assert.equal(denyTeacher.body.errorCode, "ADMIN_ONLY_PERMISSION");
  const denyAdminReduction = response();
  await updatePermission({ params: { id: permission.id }, body: { admin: false }, user: admin }, denyAdminReduction);
  assert.equal(denyAdminReduction.statusCode, 409);
  assert.equal(denyAdminReduction.body.errorCode, "ADMIN_FULL_ACCESS");
  const denyStudentPermission = response();
  await updatePermission({ params: { id: permission.id }, body: { student: true }, user: admin }, denyStudentPermission);
  assert.equal(denyStudentPermission.statusCode, 409);
  assert.equal(denyStudentPermission.body.errorCode, "STUDENT_PERMISSION_NOT_APPLICABLE");
});
