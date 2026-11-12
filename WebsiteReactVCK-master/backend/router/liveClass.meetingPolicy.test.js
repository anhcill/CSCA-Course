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

test("session history is visible only to users who can view the class", async (t) => {
  const oldQuery = pool.query;
  let historyQueryCount = 0;
  pool.query = async (sql, params = []) => {
    if (sql.includes("FROM class_sessions cs WHERE cs.id = $1")) {
      return {
        rows: [{
          id: 41,
          live_class_id: 8,
          title: "Protected lesson",
          status: "scheduled",
          start_time: new Date("2027-01-02T09:00:00Z"),
          end_time: new Date("2027-01-02T10:00:00Z"),
        }],
      };
    }
    if (sql.includes("FROM live_classes lc")) {
      return {
        rows: [{
          id: 8,
          title: "Protected class",
          course_id: 2,
          instructor_id: 5,
          status: "active",
          course_is_published: true,
        }],
      };
    }
    if (sql.includes("FROM class_teachers")) {
      return params[1] === 11 ? { rows: [{ status: "active" }] } : { rows: [] };
    }
    if (sql.includes("FROM class_session_change_logs")) {
      historyQueryCount += 1;
      return { rows: [{ id: 1, session_id: 41, reason: "Rescheduled" }] };
    }
    return { rows: [] };
  };
  t.after(() => { pool.query = oldQuery; });

  const denied = response();
  await routeFor("get", "/sessions/:sessionId/history").stack.at(-1).handle(
    { user: { id: 12, role: "creator" }, params: { sessionId: 41 } },
    denied,
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.errorCode, "FORBIDDEN");
  assert.equal(historyQueryCount, 0);

  const allowed = response();
  await routeFor("get", "/sessions/:sessionId/history").stack.at(-1).handle(
    { user: { id: 11, role: "creator" }, params: { sessionId: 41 } },
    allowed,
  );
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.data.history.length, 1);
  assert.equal(historyQueryCount, 1);
});

test("recording learners cannot export the source live class calendar", async (t) => {
  const oldQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes("FROM live_classes lc")) {
      return { rows: [{ id: 8, title: "Source live class", course_id: 2, status: "active" }] };
    }
    if (sql.includes("SELECT 1") && sql.includes("FROM class_enrollments ce")) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes("SELECT learning_mode")) return { rows: [{ learning_mode: "recording" }] };
    assert.fail(`Unexpected query: ${sql}`);
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/:classId/calendar.ics").stack.at(-1).handle(
    { user: { id: 12, role: "user" }, params: { classId: 8 } },
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.errorCode, "RECORDING_ONLY");
});

test("recording learners cannot fetch the recurring source schedule", async (t) => {
  const oldQuery = pool.query;
  let scheduleQueryCount = 0;
  pool.query = async (sql) => {
    if (sql.includes("FROM live_classes lc")) {
      return { rows: [{ id: 8, title: "Source live class", course_id: 2, status: "active" }] };
    }
    if (sql.includes("SELECT 1") && sql.includes("FROM class_enrollments ce")) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes("SELECT learning_mode FROM class_enrollments")) {
      return { rows: [{ learning_mode: "recording" }] };
    }
    if (sql.includes("FROM class_schedules")) {
      scheduleQueryCount += 1;
      return { rows: [] };
    }
    assert.fail(`Unexpected query: ${sql}`);
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/:classId/schedules").stack.at(-1).handle(
    { user: { id: 12, role: "user" }, params: { classId: 8 } },
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.errorCode, "RECORDING_ONLY");
  assert.equal(scheduleQueryCount, 0);
});

test("recording-only learners cannot open Live class chapters", async (t) => {
  const oldQuery = pool.query;
  let contentQueryCount = 0;
  pool.query = async (sql, params = []) => {
    if (sql.includes("FROM live_classes lc")) {
      return { rows: [{
        id: 8,
        title: "Source live class",
        course_id: 2,
        status: "active",
      }] };
    }
    if (sql.includes("FROM class_enrollments ce")) {
      assert.match(sql, /ce\.learning_mode = 'live'/);
      assert.deepEqual(params, [8, 12, 2, "active"]);
      return { rows: [] };
    }
    if (sql.includes("FROM class_chapters cc") || sql.includes("FROM class_sessions cs")) {
      contentQueryCount += 1;
      return { rows: [] };
    }
    assert.fail(`Unexpected query: ${sql}`);
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/:classId/chapters").stack.at(-1).handle(
    { user: { id: 12, role: "user" }, params: { classId: 8 } },
    res,
  );

  assert.equal(res.statusCode, 403, JSON.stringify(res.body));
  assert.equal(res.body.errorCode, "FORBIDDEN");
  assert.equal(contentQueryCount, 0);
});

test("learner Live class list excludes recording-only enrollments and Record aliases", async (t) => {
  const oldQuery = pool.query;
  pool.query = async (sql, params = []) => {
    assert.deepEqual(params, [12]);
    assert.match(sql, /ce\.learning_mode = 'live'/);
    assert.doesNotMatch(sql, /record_alias|management_class_alias_id/);
    assert.match(sql, /lc\.title AS title/);
    return { rows: [] };
  };
  t.after(() => { pool.query = oldQuery; });

  const res = response();
  await routeFor("get", "/").stack.at(-1).handle(
    { user: { id: 12, role: "user" } },
    res,
  );

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data, []);
});

test("recording admin enrollment does not consume a live seat", async (t) => {
  const oldConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes("FROM live_classes WHERE id")) {
        return { rows: [{ id: 8, course_id: 2, instructor_id: 5, max_students: 1, status: "active" }] };
      }
      if (sql.includes("FROM users WHERE id")) {
        return { rows: [{ id: 12, role: "user", is_locked: false, is_management_managed: true, lms_account_status: "active" }] };
      }
      if (sql.includes("FROM class_enrollments WHERE user_id")) return { rows: [] };
      if (sql.includes("INSERT INTO class_enrollments")) return { rows: [{ id: 91 }] };
      return { rows: [] };
    },
    release() {},
  });
  t.after(() => { pool.connect = oldConnect; });

  const res = response();
  await routeFor("post", "/:classId/enrollments").stack.at(-1).handle(
    {
      user: { id: 1, role: "admin" },
      params: { classId: 8 },
      body: { userId: 12, learningMode: "recording" },
      ip: "127.0.0.1",
    },
    res,
  );

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.learningMode, "recording");
  assert.equal(queries.some((sql) => sql.includes("COUNT(*)::int AS count FROM class_enrollments")), false);
});

test("live seat capacity ignores recording enrollments", async (t) => {
  const oldConnect = pool.connect;
  let capacitySql = "";
  pool.connect = async () => ({
    query: async (sql) => {
      if (sql.includes("FROM live_classes WHERE id")) {
        return { rows: [{ id: 8, course_id: 2, instructor_id: 5, max_students: 1, status: "active" }] };
      }
      if (sql.includes("FROM users WHERE id")) {
        return { rows: [{ id: 12, role: "user", is_locked: false, is_management_managed: true, lms_account_status: "active" }] };
      }
      if (sql.includes("FROM class_enrollments WHERE user_id")) return { rows: [] };
      if (sql.includes("COUNT(*)::int AS count FROM class_enrollments")) {
        capacitySql = sql;
        return { rows: [{ count: 1 }] };
      }
      return { rows: [] };
    },
    release() {},
  });
  t.after(() => { pool.connect = oldConnect; });

  const res = response();
  await routeFor("post", "/:classId/enrollments").stack.at(-1).handle(
    {
      user: { id: 1, role: "admin" },
      params: { classId: 8 },
      body: { userId: 12, learningMode: "live" },
      ip: "127.0.0.1",
    },
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.errorCode, "CAPACITY_REACHED");
  assert.match(capacitySql, /learning_mode = 'live'/);
});
