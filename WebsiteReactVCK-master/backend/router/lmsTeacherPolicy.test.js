import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
const { pool } = await import("../db/connect.js");
const courseRouter = (await import("./course.router.js")).default;
const liveClassRouter = (await import("./liveClass.router.js")).default;
const announcementRouter = (await import("./announcement.router.js")).default;
const teacherRouter = (await import("./teacher.router.js")).default;

const routeFor = (router, method, path) => router.stack.find(
  (layer) => layer.route?.path === path && layer.route.methods[method],
).route;

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const runGuards = async (router, method, path, user) => {
  const route = routeFor(router, method, path);
  const res = response();
  const req = { user };
  for (const layer of route.stack.slice(1, -1)) {
    let nextCalled = false;
    await layer.handle(req, res, () => { nextCalled = true; });
    if (!nextCalled) return { passed: false, res };
  }
  return { passed: true, res };
};

test("course publishing and class operations require admin; teaching data obeys the permission matrix", async (t) => {
  const oldQuery = pool.query;
  let allowed = true;
  pool.query = async () => ({ rows: allowed ? [{ "?column?": 1 }] : [] });
  t.after(() => { pool.query = oldQuery; });
  const creator = { id: 7, role: "creator" };
  const admin = { id: 1, role: "admin" };
  const adminOnly = [
    [courseRouter, "post", "/admin"],
    [courseRouter, "patch", "/admin/:courseId/status"],
    [liveClassRouter, "post", "/"],
    [liveClassRouter, "patch", "/:classId"],
    [liveClassRouter, "post", "/:classId/enrollments"],
    [liveClassRouter, "delete", "/:classId/enrollments/:userId"],
  ];
  for (const [router, method, path] of adminOnly) {
    const denied = await runGuards(router, method, path, creator);
    assert.equal(denied.passed, false, `${method} ${path}`);
    assert.equal(denied.res.statusCode, 403, `${method} ${path}`);
    assert.equal((await runGuards(router, method, path, admin)).passed, true, `${method} ${path}`);
  }

  const permissionRoutes = [
    [courseRouter, "post", "/admin/:courseId/sections"],
    [courseRouter, "post", "/admin/sections/:sectionId/lessons"],
    [courseRouter, "patch", "/admin/lessons/:lessonId/learning-link"],
    [announcementRouter, "post", "/"],
    [announcementRouter, "patch", "/:id/cancel"],
    [teacherRouter, "get", "/dashboard-stats"],
    [teacherRouter, "get", "/classes/:classId/student-progress"],
    [teacherRouter, "get", "/classes/:classId/detail"],
    [liveClassRouter, "get", "/:classId/enrollments"],
  ];
  allowed = false;
  for (const [router, method, path] of permissionRoutes) {
    const denied = await runGuards(router, method, path, creator);
    assert.equal(denied.passed, false, `${method} ${path}`);
    assert.equal(denied.res.body?.errorCode, "PERMISSION_DENIED", `${method} ${path}`);
    assert.equal((await runGuards(router, method, path, admin)).passed, true, `${method} ${path}`);
  }
  allowed = true;
  for (const [router, method, path] of permissionRoutes) {
    assert.equal((await runGuards(router, method, path, creator)).passed, true, `${method} ${path}`);
  }
});

test("co-teacher cannot edit another teacher's session or meeting link", async (t) => {
  const oldQuery = pool.query;
  const oldConnect = pool.connect;
  const queries = [];
  let assignmentStatus = "active";
  const current = {
    id: 9, live_class_id: 3, chapter_id: 5, schedule_id: null,
    title: "Lesson", meet_url: null, passcode: null,
    start_time: new Date("2027-01-02T09:00:00Z"),
    end_time: new Date("2027-01-02T10:00:00Z"),
    status: "scheduled", version: 1, instructor_id: 4, course_id: 1,
    management_session_source_id: null, management_schedule_owner_id: null,
  };
  pool.query = async (sql) => {
    if (sql.includes("FROM class_teachers")) return { rows: [{ status: assignmentStatus }] };
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.connect = async () => ({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes("FROM class_sessions cs")) return { rows: [current] };
      if (sql.includes("FROM class_chapters")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  });
  t.after(() => { pool.query = oldQuery; pool.connect = oldConnect; });
  const user = { id: 6, role: "creator" };
  for (const [path, body] of [
    ["/sessions/:sessionId/meeting-link", { meetUrl: "https://meet.google.com/abc-defg-hij" }],
    ["/sessions/:sessionId", { title: "Changed" }],
  ]) {
    const res = response();
    await routeFor(liveClassRouter, "patch", path).stack.at(-1).handle(
      { user, params: { sessionId: current.id }, body }, res,
    );
    assert.equal(res.statusCode, 403, path);
    assert.equal(res.body?.errorCode, "FORBIDDEN", path);
  }
  assert.equal(queries.some((sql) => sql.includes("UPDATE class_sessions")), false);

  current.instructor_id = user.id;
  assignmentStatus = "revoked";
  const revoked = response();
  await routeFor(liveClassRouter, "patch", "/sessions/:sessionId").stack.at(-1).handle(
    { user, params: { sessionId: current.id }, body: { title: "After revocation" } }, revoked,
  );
  assert.equal(revoked.statusCode, 403);
  assert.equal(queries.some((sql) => sql.includes("UPDATE class_sessions")), false);
});
