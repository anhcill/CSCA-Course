import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

test("hardened admin user flow provisions learners and enforces role device policy", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });

  const router = (await import("./admin.router.js")).default;
  const handler = (method, path) => router.stack.find((layer) => (
    layer.route?.path === path && layer.route.methods[method]
  )).route.stack.at(-1).handle;

  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('user-admin','user-admin@example.test','admin') RETURNING id",
  )).rows[0];

  const createResponse = response();
  await handler("post", "/users")({
    body: {
      username: "managed-student",
      fullName: "Managed Student",
      email: "managed-student@example.test",
      password: "secret123",
      role: "user",
      gender: "other",
    },
    user: { ...admin, role: "admin" },
    ip: "127.0.0.1",
  }, createResponse);
  assert.equal(createResponse.statusCode, 201, JSON.stringify(createResponse.body));
  assert.equal(createResponse.body.data.isManagementManaged, true);
  assert.equal(createResponse.body.data.lmsAccountStatus, "active");
  const profile = (await db.query(
    "SELECT full_name FROM student_profiles WHERE user_id = $1",
    [createResponse.body.data.id],
  )).rows[0];
  assert.equal(profile.full_name, "Managed Student");

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('device-teacher','device-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const replacementTeacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('replacement-teacher','replacement-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published)
     VALUES ('Role transition course','Role transition course','role-transition-course',$1,TRUE) RETURNING id`,
    [admin.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id)
     VALUES ('Role transition class',$1,$2) RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_teachers(live_class_id,teacher_id,teaching_role,status) VALUES
       ($1,$2,'lead','active'), ($1,$3,'co_teacher','active')`,
    [liveClass.id, teacher.id, replacementTeacher.id],
  );
  const chapter = (await db.query(
    `INSERT INTO class_chapters(live_class_id,title,assigned_teacher_id)
     VALUES ($1,'Teacher-owned chapter',$2) RETURNING id`,
    [liveClass.id, teacher.id],
  )).rows[0];
  for (let index = 1; index <= 3; index += 1) {
    const device = (await db.query(
      `INSERT INTO trusted_login_devices(user_id,device_token_hash,device_name,last_seen_at)
       VALUES ($1,$2,$3,NOW() - ($4 * INTERVAL '1 minute')) RETURNING id`,
      [teacher.id, `hash-${index}`, `Device ${index}`, index],
    )).rows[0];
    await db.query(
      `INSERT INTO user_sessions(user_id,token_hash,expires_at,trusted_device_id)
       VALUES ($1,$2,NOW() + INTERVAL '1 day',$3)`,
      [teacher.id, `session-${index}`, device.id],
    );
  }

  const updateResponse = response();
  await handler("patch", "/users/:id")({
    params: { id: teacher.id }, body: { role: "user" }, user: admin, ip: "127.0.0.1",
  }, updateResponse);
  assert.equal(updateResponse.statusCode, 200, JSON.stringify(updateResponse.body));
  const updated = (await db.query(
    "SELECT role,is_management_managed,lms_account_status FROM users WHERE id=$1",
    [teacher.id],
  )).rows[0];
  assert.deepEqual(updated, { role: "user", is_management_managed: true, lms_account_status: "active" });
  assert.equal(Number((await db.query(
    "SELECT COUNT(*) AS count FROM trusted_login_devices WHERE user_id=$1 AND revoked_at IS NULL",
    [teacher.id],
  )).rows[0].count), 2);
  assert.equal(Number((await db.query(
    "SELECT COUNT(*) AS count FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL",
    [teacher.id],
  )).rows[0].count), 0);
  assert.equal((await db.query(
    "SELECT status FROM class_teachers WHERE live_class_id=$1 AND teacher_id=$2",
    [liveClass.id, teacher.id],
  )).rows[0].status, "revoked");
  assert.equal((await db.query(
    "SELECT teaching_role FROM class_teachers WHERE live_class_id=$1 AND teacher_id=$2",
    [liveClass.id, replacementTeacher.id],
  )).rows[0].teaching_role, "lead");
  assert.equal(Number((await db.query(
    "SELECT instructor_id FROM live_classes WHERE id=$1",
    [liveClass.id],
  )).rows[0].instructor_id), Number(replacementTeacher.id));
  assert.equal(Number((await db.query(
    "SELECT assigned_teacher_id FROM class_chapters WHERE id=$1",
    [chapter.id],
  )).rows[0].assigned_teacher_id), Number(replacementTeacher.id));

  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')",
    [teacher.id, liveClass.id],
  );
  await db.query(
    "INSERT INTO enrollments(user_id,course_id,status) VALUES ($1,$2,'active')",
    [teacher.id, course.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW(),NOW())`,
    [teacher.id, course.id],
  );
  const promoteResponse = response();
  await handler("patch", "/users/:id")({
    params: { id: teacher.id }, body: { role: "creator" }, user: admin, ip: "127.0.0.1",
  }, promoteResponse);
  assert.equal(promoteResponse.statusCode, 200, JSON.stringify(promoteResponse.body));
  assert.equal((await db.query(
    "SELECT status FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2",
    [teacher.id, liveClass.id],
  )).rows[0].status, "revoked");
  assert.equal((await db.query(
    "SELECT status FROM enrollments WHERE user_id=$1 AND course_id=$2",
    [teacher.id, course.id],
  )).rows[0].status, "revoked");
  assert.equal((await db.query(
    "SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [teacher.id, course.id],
  )).rows[0].access_status, "revoked");

  const liveClassRouter = (await import("./liveClass.router.js")).default;
  const liveClassHandler = (method, path) => liveClassRouter.stack.find((layer) => (
    layer.route?.path === path && layer.route.methods[method]
  )).route.stack.at(-1).handle;
  const managedStudentId = createResponse.body.data.id;
  const addEnrollmentResponse = response();
  await liveClassHandler("post", "/:classId/enrollments")({
    params: { classId: liveClass.id },
    body: { userId: managedStudentId },
    user: { ...admin, role: "admin" },
    ip: "127.0.0.1",
  }, addEnrollmentResponse);
  assert.equal(addEnrollmentResponse.statusCode, 201, JSON.stringify(addEnrollmentResponse.body));
  assert.equal((await db.query(
    "SELECT status FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2",
    [managedStudentId, liveClass.id],
  )).rows[0].status, "active");
  assert.equal((await db.query(
    "SELECT status FROM enrollments WHERE user_id=$1 AND course_id=$2",
    [managedStudentId, course.id],
  )).rows[0].status, "active");
  assert.deepEqual((await db.query(
    "SELECT access_status,reason FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [managedStudentId, course.id],
  )).rows[0], { access_status: "active", reason: "ADMIN_CLASS_ENROLLMENT" });

  const removeEnrollmentResponse = response();
  await liveClassHandler("delete", "/:classId/enrollments/:userId")({
    params: { classId: liveClass.id, userId: managedStudentId },
    user: { ...admin, role: "admin" },
    ip: "127.0.0.1",
  }, removeEnrollmentResponse);
  assert.equal(removeEnrollmentResponse.statusCode, 200, JSON.stringify(removeEnrollmentResponse.body));
  assert.equal((await db.query(
    "SELECT status FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2",
    [managedStudentId, liveClass.id],
  )).rows[0].status, "removed");
  assert.equal((await db.query(
    "SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [managedStudentId, course.id],
  )).rows[0].access_status, "revoked");
  assert.equal((await db.query(
    "SELECT lms_account_status FROM users WHERE id=$1",
    [managedStudentId],
  )).rows[0].lms_account_status, "revoked");

  const managementStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('management-student','management-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')",
    [managementStudent.id, liveClass.id],
  );
  await db.query(
    "INSERT INTO enrollments(user_id,course_id,status) VALUES ($1,$2,'active')",
    [managementStudent.id, course.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,reason,valid_from,source_updated_at)
     VALUES ($1,$2,'active','management_entitlement',NOW(),NOW())`,
    [managementStudent.id, course.id],
  );
  const removeManagementEnrollmentResponse = response();
  await liveClassHandler("delete", "/:classId/enrollments/:userId")({
    params: { classId: liveClass.id, userId: managementStudent.id },
    user: { ...admin, role: "admin" },
    ip: "127.0.0.1",
  }, removeManagementEnrollmentResponse);
  assert.equal(removeManagementEnrollmentResponse.statusCode, 200, JSON.stringify(removeManagementEnrollmentResponse.body));
  assert.equal((await db.query(
    "SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [managementStudent.id, course.id],
  )).rows[0].access_status, "active");
  assert.equal((await db.query(
    "SELECT status FROM enrollments WHERE user_id=$1 AND course_id=$2",
    [managementStudent.id, course.id],
  )).rows[0].status, "active");

  const inconsistentStudent = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('inconsistent-student','inconsistent-student@example.test','user',FALSE,'unmanaged') RETURNING id`,
  )).rows[0];
  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')",
    [inconsistentStudent.id, liveClass.id],
  );
  const repairEnrollmentResponse = response();
  await liveClassHandler("post", "/:classId/enrollments")({
    params: { classId: liveClass.id },
    body: { userId: inconsistentStudent.id },
    user: { ...admin, role: "admin" },
    ip: "127.0.0.1",
  }, repairEnrollmentResponse);
  assert.equal(repairEnrollmentResponse.statusCode, 200, JSON.stringify(repairEnrollmentResponse.body));
  assert.equal((await db.query(
    "SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2",
    [inconsistentStudent.id, course.id],
  )).rows[0].access_status, "active");
  assert.equal((await db.query(
    "SELECT lms_account_status FROM users WHERE id=$1",
    [inconsistentStudent.id],
  )).rows[0].lms_account_status, "active");

  await db.query(
    "INSERT INTO users(username,email,role,is_locked) VALUES ('locked-admin','locked-admin@example.test','admin',TRUE)",
  );
  const lastActiveAdminResponse = response();
  await handler("patch", "/users/:id")({
    params: { id: admin.id }, body: { role: "creator" }, user: admin, ip: "127.0.0.1",
  }, lastActiveAdminResponse);
  assert.equal(lastActiveAdminResponse.statusCode, 409);
  assert.equal(lastActiveAdminResponse.body.errorCode, "LAST_ADMIN_PROTECTED");

  const selfDeleteResponse = response();
  await handler("delete", "/users/:id")({ params: { id: admin.id }, user: admin }, selfDeleteResponse);
  assert.equal(selfDeleteResponse.statusCode, 422);
  assert.equal(selfDeleteResponse.body.errorCode, "SELF_DELETE_FORBIDDEN");
});
