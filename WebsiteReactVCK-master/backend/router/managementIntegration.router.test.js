import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("student provisioning preserves login locks and separates student from teacher identity", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const router = (await import("./managementIntegration.router.js")).default;
  const provision = router.stack.find((layer) => layer.route?.path === "/students/provision").route.stack.at(-1).handle;
  const invoke = async (body, key) => {
    const response = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await provision({
      body,
      rawBody: JSON.stringify(body),
      managementIntegration: { idempotencyKey: key, correlationId: key },
    }, response);
    return response;
  };
  const payload = (source, email, accountStatus = "Revoked") => ({
    externalStudentId: source,
    externalPartyId: source,
    fullName: "Test Student",
    email,
    phone: null,
    accountStatus,
    paymentStatus: "Cancelled",
    courseSourceIds: [],
    classSourceId: "class-1",
    sourceUpdatedAt: "2026-10-09T09:00:00.000Z",
  });

  let response = await invoke(payload("fresh-party", "fresh@example.test"), "fresh-provision");
  assert.equal(response.statusCode, 201, JSON.stringify(response.body));
  assert.deepEqual((await db.query("SELECT is_locked, lms_account_status FROM users WHERE email='fresh@example.test'")).rows[0],
    { is_locked: false, lms_account_status: "revoked" });

  await db.query("INSERT INTO users(username,email,role,is_locked,is_management_managed,lms_account_status,external_student_id,management_party_id) VALUES ('legacy-student','legacy@example.test','user',TRUE,TRUE,'revoked','legacy-id','legacy-party')");
  response = await invoke(payload("legacy-party", "legacy@example.test"), "legacy-provision");
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.deepEqual((await db.query("SELECT is_locked, external_student_id FROM users WHERE email='legacy@example.test'")).rows[0],
    { is_locked: true, external_student_id: "legacy-party" });

  await db.query("INSERT INTO users(username,email,role,is_locked,is_management_managed,lms_account_status,external_student_id,management_party_id) VALUES ('teacher-student','teacher@example.test','creator',FALSE,TRUE,'active','teacher-party','teacher-party')");
  response = await invoke(payload("teacher-party", "teacher@example.test", "Active"), "teacher-conflict");
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.errorCode, "STUDENT_TEACHER_IDENTITY_CONFLICT");

  const course = (await db.query("INSERT INTO courses(name,slug,author_id,external_course_id) VALUES ('Access course','access-course',(SELECT id FROM users WHERE email='teacher@example.test'),'course-source-1') RETURNING id")).rows[0];
  const access = router.stack.find((layer) => layer.route?.path === "/students/:externalStudentId/access").route.stack.at(-1).handle;
  const accessBody = {
    accessStatus: "Active",
    reason: "PAYMENT_PAID",
    sourcePaymentId: "payment-1",
    validFrom: "2026-10-09T10:00:00.000Z",
    validUntil: null,
    courseSourceIds: ["course-source-1"],
  };
  const accessRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await access({
    params: { externalStudentId: "fresh-party" },
    body: accessBody,
    rawBody: JSON.stringify(accessBody),
    managementIntegration: { idempotencyKey: "fresh-access", correlationId: "fresh-access" },
  }, accessRes);
  assert.equal(accessRes.statusCode, 200, JSON.stringify(accessRes.body));
  assert.deepEqual((await db.query("SELECT access_status, course_id FROM lms_access_grants WHERE user_id=(SELECT id FROM users WHERE email='fresh@example.test')")).rows[0],
    { access_status: "active", course_id: course.id });

  const revokedBody = { ...accessBody, accessStatus: "Revoked", reason: "PAYMENT_CANCELLED", validFrom: "2026-10-09T11:00:00.000Z" };
  await access({
    params: { externalStudentId: "fresh-party" },
    body: revokedBody,
    rawBody: JSON.stringify(revokedBody),
    managementIntegration: { idempotencyKey: "fresh-revoke", correlationId: "fresh-revoke" },
  }, accessRes);
  assert.equal(accessRes.statusCode, 200, JSON.stringify(accessRes.body));
  assert.equal((await db.query("SELECT access_status FROM lms_access_grants WHERE user_id=(SELECT id FROM users WHERE email='fresh@example.test')")).rows[0].access_status, "revoked");
});
