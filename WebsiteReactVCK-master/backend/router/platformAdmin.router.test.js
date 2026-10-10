import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("admin can approve a Management class and its enrollment", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
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
  await invoke("/membership-approvals/:id", membership.id, admin.id);
  assert.deepEqual((await db.query("SELECT status,management_approval_status FROM live_classes WHERE id=$1", [cls.id])).rows[0],
    { status: "active", management_approval_status: "approved" });
  assert.deepEqual((await db.query("SELECT status,management_approval_status FROM class_enrollments WHERE id=$1", [membership.id])).rows[0],
    { status: "active", management_approval_status: "approved" });

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
});
