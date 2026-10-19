import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { createFormulaRouter } from "./formula.router.js";

const jsonRequest = async (baseUrl, path, { method = "GET", user, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User": user,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("formula API enforces class access and persists learner bookmarks", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const addUser = async (username, role, managed = false) => (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status,email_verified)
     VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id,username,role,is_management_managed,lms_account_status`,
    [username, `${username}@example.test`, role, managed, managed ? "active" : "unmanaged"],
  )).rows[0];
  const admin = await addUser("formula-admin", "admin");
  const teacher = await addUser("formula-teacher", "creator");
  const otherTeacher = await addUser("formula-other", "creator");
  const learner = await addUser("formula-learner", "user", true);
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('CSCA Math','csca-formula-math',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Formula Class',$1,$2) RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  await db.query(
    "INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')",
    [liveClass.id, teacher.id],
  );
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time)
     VALUES ($1,'Buổi công thức',NOW() + interval '1 day',NOW() + interval '2 hours 1 day') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')",
    [learner.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );

  const users = { admin, teacher, otherTeacher, learner };
  const authenticate = (req, res, next) => {
    req.user = users[req.get("X-Test-User")];
    if (!req.user) return res.status(401).json({ success: false });
    return next();
  };
  const roleMiddleware = (...roles) => (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ success: false, errorCode: "FORBIDDEN" });
  const app = express();
  app.use(express.json());
  app.use("/api", createFormulaRouter({
    dbQuery: (sql, params) => db.query(sql, params),
    dbGetClient: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
    authenticate,
    learnerOnly: roleMiddleware("user"),
    formulaRoles: roleMiddleware("user", "creator", "admin"),
    teacherOnly: roleMiddleware("creator", "admin"),
    adminOnly: roleMiddleware("admin"),
    managePermission: (_req, _res, next) => next(),
    audit: async () => {},
  }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const payload = {
    subject: "MATH",
    nameVi: "Thể tích khối nón cụt",
    nameZh: "圆台体积公式",
    pinyin: "yuán tái tǐ jī gōng shì",
    latex: "V = \\frac{1}{3} \\pi h(R^2 + Rr + r^2)",
    variables: [{ symbol: "R", meaning: "Bán kính đáy lớn" }],
    conditions: "R > r > 0",
  };
  const created = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/formulas`, {
    method: "POST",
    user: "teacher",
    body: payload,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.nameVi, payload.nameVi);
  assert.ok(created.body.data.chapterName);
  const formulaId = created.body.data.id;

  const forbiddenCreate = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/formulas`, {
    method: "POST",
    user: "otherTeacher",
    body: payload,
  });
  assert.equal(forbiddenCreate.status, 403);

  const detail = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/formulas`, { user: "learner" });
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.formulas[0].latex, payload.latex);
  assert.equal(detail.body.data.formulas[0].isStarred, false);

  const sessions = await jsonRequest(baseUrl, "/api/lms/formulas/sessions?subject=MATH&search=nón", { user: "learner" });
  assert.equal(sessions.status, 200, JSON.stringify(sessions.body));
  assert.equal(sessions.body.data.summary.totalFormulas, 1);

  const starred = await jsonRequest(baseUrl, `/api/lms/formulas/${formulaId}/toggle-star`, {
    method: "POST",
    user: "learner",
    body: { personalNote: "Ôn trước buổi thi" },
  });
  assert.equal(starred.status, 200, JSON.stringify(starred.body));
  assert.equal(starred.body.data.isStarred, true);

  const updated = await jsonRequest(baseUrl, `/api/lms/formulas/${formulaId}`, {
    method: "PUT",
    user: "teacher",
    body: { description: "Công thức tính thể tích nón cụt" },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.description, "Công thức tính thể tích nón cụt");

  const teacherLibrary = await jsonRequest(baseUrl, "/api/lms/teach/formulas", { user: "teacher" });
  assert.equal(teacherLibrary.status, 200, JSON.stringify(teacherLibrary.body));
  assert.equal(teacherLibrary.body.data.formulas.length, 1);

  const imported = await jsonRequest(baseUrl, "/api/admin/formulas/batch-import", {
    method: "POST",
    user: "admin",
    body: { formulas: [{ subject: "PHYSICS", nameVi: "Định luật II Newton", latex: "F = ma" }] },
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.data.formulas[0].chapterName, "Kho công thức chuẩn");

  const presets = await jsonRequest(baseUrl, "/api/lms/formulas/presets", { user: "teacher" });
  assert.equal(presets.status, 200, JSON.stringify(presets.body));
  assert.equal(presets.body.data.formulas.length, 2);
  assert.equal(presets.body.data.formulas.some((formula) => formula.isSystemPreset), true);

  const adminLibrary = await jsonRequest(baseUrl, "/api/admin/formulas?subject=PHYSICS", { user: "admin" });
  assert.equal(adminLibrary.status, 200, JSON.stringify(adminLibrary.body));
  assert.equal(adminLibrary.body.data.formulas.length, 1);

  const removed = await jsonRequest(baseUrl, `/api/lms/formulas/${formulaId}`, {
    method: "DELETE",
    user: "teacher",
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM student_formula_bookmarks WHERE formula_id = $1",
    [formulaId],
  )).rows[0].count, 0);
});
