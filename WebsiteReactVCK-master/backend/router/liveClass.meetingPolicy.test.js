import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";

const { pool } = await import("../db/connect.js");
const liveClassRouter = (await import("./liveClass.router.js")).default;
const teacherRouter = (await import("./teacher.router.js")).default;

const routeFor = (method, path, router = liveClassRouter) => router.stack.find(
  (layer) => layer.route?.path === path && layer.route.methods[method],
).route;

const response = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  set(name, value) { this.headers[name] = value; return this; },
});

test("schedule responses identify Jitsi without exposing the room URL", async (t) => {
  const oldQuery = pool.query;
  const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  pool.query = async (sql) => {
    assert.match(sql, /FROM class_sessions cs/);
    return {
      rows: [{
        id: 40,
        live_class_id: 8,
        schedule_id: 3,
        title: "Jitsi lesson",
        meet_url: "https://meet.jit.si/private-room-name",
        management_session_source_id: "management-session-40",
        management_schedule_owner_id: "management-schedule-3",
        start_time: startTime,
        end_time: endTime,
        status: "scheduled",
      }],
    };
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/my-schedule").stack.at(-1).handle(
    { user: { id: 1, role: "admin" }, query: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].provider, "Jitsi");
  assert.equal(res.body.data[0].has_meeting_link, true);
  assert.equal(res.body.data[0].meeting_managed_externally, true);
  assert.equal(Object.hasOwn(res.body.data[0], "meet_url"), false);
  assert.equal(Object.hasOwn(res.body.data[0], "meetUrl"), false);
  assert.equal(Object.hasOwn(res.body.data[0], "management_session_source_id"), false);
  assert.equal(Object.hasOwn(res.body.data[0], "management_schedule_owner_id"), false);
  assert.equal(res.headers["Cache-Control"], "no-store, private, max-age=0");
});

test("InternalManagement-owned sessions reject meeting configuration changes from LMS", async (t) => {
  const oldConnect = pool.connect;
  const queries = [];
  const current = {
    id: 41,
    live_class_id: 8,
    chapter_id: null,
    schedule_id: 3,
    title: "Managed lesson",
    meet_url: "https://meet.jit.si/managed-room",
    passcode: null,
    start_time: new Date("2027-01-02T09:00:00Z"),
    end_time: new Date("2027-01-02T10:00:00Z"),
    status: "scheduled",
    version: 2,
    instructor_id: 5,
    course_id: 2,
    management_class_source_id: "management-class-8",
    management_session_source_id: "management-session-41",
    management_schedule_owner_id: "management-schedule-3",
  };

  pool.connect = async () => ({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes("FROM class_sessions cs")) return { rows: [current] };
      return { rows: [] };
    },
    release() {},
  });
  t.after(() => { pool.connect = oldConnect; });

  const admin = { id: 1, role: "admin" };
  for (const [path, body] of [
    ["/sessions/:sessionId/meeting-link", { meetUrl: "https://meet.jit.si/replacement-room" }],
    ["/sessions/:sessionId", { meetUrl: "https://meet.jit.si/replacement-room" }],
    ["/sessions/:sessionId", { passcode: "replacement-passcode" }],
  ]) {
    const res = response();
    await routeFor("patch", path).stack.at(-1).handle(
      { user: admin, params: { sessionId: current.id }, body },
      res,
    );
    assert.equal(res.statusCode, 403, path);
    assert.equal(res.body?.errorCode, "FORBIDDEN", path);
    assert.match(res.body?.message || "", /InternalManagement/, path);
  }

  assert.equal(queries.some((sql) => sql.includes("UPDATE class_sessions")), false);
});

test("teacher dashboard reports provider without disclosing meeting URLs", async (t) => {
  const oldQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes("next_session.meet_url AS next_meet_url") && sql.includes("FROM live_classes lc")) {
      return {
        rows: [{
          id: 8,
          title: "Managed class",
          status: "active",
          next_session_start: new Date("2027-01-02T09:00:00Z"),
          next_session_status: "scheduled",
          next_meet_url: "https://meet.jit.si/dashboard-private-room",
        }],
      };
    }
    if (sql.includes("cs.live_class_id AS class_id") && sql.includes("cs.meet_url")) {
      return {
        rows: [{
          id: 41,
          class_id: 8,
          class_name: "Managed class",
          title: "Managed lesson",
          start_time: new Date("2027-01-02T09:00:00Z"),
          end_time: new Date("2027-01-02T10:00:00Z"),
          status: "scheduled",
          meet_url: "https://meet.jit.si/today-private-room",
        }],
      };
    }
    if (sql.includes("COUNT(DISTINCT ce.user_id)")) return { rows: [{ count: 0 }] };
    if (sql.includes("COUNT(DISTINCT s.id)")) return { rows: [{ count: 0 }] };
    return { rows: [] };
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/dashboard-stats", teacherRouter).stack.at(-1).handle(
    { user: { id: 1, role: "admin" }, query: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.classes[0].provider, "Jitsi");
  assert.equal(res.body.data.classes[0].hasMeetingLink, true);
  assert.equal(Object.hasOwn(res.body.data.classes[0], "meetUrl"), false);
  assert.equal(res.body.data.todaySessions[0].provider, "Jitsi");
  assert.equal(res.body.data.todaySessions[0].hasMeetingLink, true);
  assert.equal(Object.hasOwn(res.body.data.todaySessions[0], "meetUrl"), false);
});
