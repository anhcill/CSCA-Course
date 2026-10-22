import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("notification preferences and mutations persist for the current user", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const user = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('notification-user','notification@example.test','user') RETURNING id,role",
  )).rows[0];
  await db.query(
    `INSERT INTO notifications(user_id,title,message,type,event_type)
     VALUES ($1,'Assignment','New work','assignment','assignment.created'),
            ($1,'System','Maintenance','system','system')`,
    [user.id],
  );

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  const router = (await import("./notification.router.js")).default;

  const invoke = async (method, path, { params = {}, query = {}, body = {} } = {}) => {
    const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
    const handler = layer.route.stack.at(-1).handle;
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ user, params, query, body }, res);
    return res;
  };

  const defaults = await invoke("get", "/preferences");
  assert.equal(defaults.statusCode, 200);
  assert.equal(defaults.body.data.assignments, true);

  const updated = await invoke("patch", "/preferences", { body: { assignments: false } });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.data.assignments, false);

  const listed = await invoke("get", "/", { query: { page: "1", limit: "20" } });
  assert.equal(listed.statusCode, 200, JSON.stringify(listed.body));
  assert.deepEqual(listed.body.data.notifications.map((item) => item.title), ["System"]);

  const systemId = listed.body.data.notifications[0].id;
  assert.equal((await invoke("patch", "/:id/read", { params: { id: systemId } })).statusCode, 200);
  assert.equal((await invoke("patch", "/:id/unread", { params: { id: systemId } })).body.data.is_read, false);
  assert.equal((await invoke("delete", "/:id", { params: { id: systemId } })).statusCode, 200);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM notifications WHERE id=$1", [systemId])).rows[0].count, 0);
});

