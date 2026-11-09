import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db/connect.js";
import recordingRouter, { validateRecordingPayload } from "./recording.router.js";

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createDbQuery = ({ sessionExists = true, folderExists = false } = {}) => async (sql, params) => {
  if (sql.includes("FROM live_classes")) {
    return { rows: [{ id: params[0], title: "Toán 01", course_id: 1 }] };
  }
  if (sql.includes("FROM class_sessions")) {
    return { rows: sessionExists ? [{ id: params[0], title: "Dãy số", start_time: new Date() }] : [] };
  }
  if (sql.includes("FROM class_recording_folders")) {
    return { rows: folderExists ? [{ exists: 1 }] : [] };
  }
  throw new Error(`Unexpected query: ${sql}`);
};

test("recording payload accepts a direct Drive video linked to a session in the selected class", async () => {
  const payload = await validateRecordingPayload({
    classId: "10",
    sessionId: "20",
    title: "Bản ghi Dãy số",
    driveUrl: "https://drive.google.com/file/d/video-id/view#preview",
    recordedAt: "2026-10-25T12:00:00.000Z",
    durationMinutes: 90,
    isPublished: true,
  }, null, createDbQuery());

  assert.equal(payload.error, undefined);
  assert.equal(payload.classId, 10);
  assert.equal(payload.sessionId, 20);
  assert.equal(payload.driveUrl, "https://drive.google.com/file/d/video-id/view");
  assert.equal(payload.isPublished, true);
});

test("recording payload rejects a session that does not belong to the selected class", async () => {
  const payload = await validateRecordingPayload({
    classId: "10",
    sessionId: "999",
    title: "Bản ghi sai buổi",
    driveUrl: "https://drive.google.com/file/d/video-id/view",
    recordedAt: "2026-10-25T12:00:00.000Z",
    isPublished: false,
  }, null, createDbQuery({ sessionExists: false }));

  assert.equal(payload.error, "Buổi học không thuộc lớp đã chọn");
});

test("published recording without a direct link requires a published class folder", async () => {
  const body = {
    classId: "10",
    sessionId: "20",
    title: "Bản ghi dùng thư mục lớp",
    driveUrl: "",
    recordedAt: "2026-10-25T12:00:00.000Z",
    isPublished: true,
  };

  const rejected = await validateRecordingPayload(body, null, createDbQuery());
  assert.equal(rejected.error, "Hãy lưu và xuất bản thư mục Drive của lớp trước");

  const accepted = await validateRecordingPayload(body, null, createDbQuery({ folderExists: true }));
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.driveUrl, null);
});

test("recording learners can list recordings after the source Live class is completed", async (t) => {
  const oldQuery = pool.query;
  const executedSql = [];
  pool.query = async (sql) => {
    executedSql.push(sql);
    if (sql.includes("COUNT(r.id) FILTER")) {
      return { rows: [{
        id: 10,
        title: "Completed source - Record",
        course_id: 3,
        course_title: "Toán CSCA",
        folder_url: null,
        folder_published: false,
        recording_count: 1,
        latest_recording_at: new Date("2026-11-09T05:00:00Z"),
      }] };
    }
    if (sql.includes("SELECT r.*")) {
      return { rows: [{
        id: 20,
        live_class_id: 10,
        title: "Bản ghi buổi 1",
        is_published: true,
        drive_url: "https://drive.google.com/file/d/video-id/view",
        class_title: "Completed source - Record",
        course_id: 3,
        course_title: "Toán CSCA",
      }] };
    }
    assert.fail(`Unexpected query: ${sql}`);
  };
  t.after(() => { pool.query = oldQuery; });

  const route = recordingRouter.stack.find((layer) => (
    layer.route?.path === "/mine" && layer.route.methods.get
  )).route;
  const res = response();
  await route.stack.at(-1).handle({ user: { id: 7, role: "user" }, query: {} }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.recordings.length, 1);
  assert.equal(res.body.data.classes[0].title, "Completed source - Record");
  assert.equal(res.body.data.recordings[0].classTitle, "Completed source - Record");
  assert.equal(executedSql.length, 2);
  for (const sql of executedSql) {
    assert.match(sql, /lc\.status = 'completed' AND ce\.learning_mode = 'recording'/);
    assert.match(sql, /COALESCE\(record_alias\.title, lc\.title\)/);
  }
});
