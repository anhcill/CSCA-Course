import assert from "node:assert/strict";
import test from "node:test";
import { validateRecordingPayload } from "./recording.router.js";

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
