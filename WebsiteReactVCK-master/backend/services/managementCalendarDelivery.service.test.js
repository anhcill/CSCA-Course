import assert from "node:assert/strict";
import test from "node:test";
import { enqueueManagementCalendarDelivery } from "./managementCalendarDelivery.service.js";

test("session delivery includes the Management schedule source id", async () => {
  let insertedPayload;
  const client = {
    async query(sql, params) {
      if (sql.includes("FROM class_schedules")) {
        assert.deepEqual(params, [4, 3]);
        return { rows: [{ management_schedule_source_id: "schedule-source-1" }] };
      }
      if (sql.includes("INSERT INTO lms_management_calendar_outbox")) {
        insertedPayload = JSON.parse(params[2]);
        return { rows: [{ id: 1, event_id: params[0], status: "PENDING" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  await enqueueManagementCalendarDelivery(client, {
    managementClassId: "class-source-1",
    eventType: "lms.session.upserted",
    correlationId: "session:44:v3",
    lmsSession: {
      id: 44,
      live_class_id: 3,
      schedule_id: 4,
      management_session_source_id: "session-source-1",
      title: "Buổi học",
      start_time: "2026-10-09T11:00:00.000Z",
      end_time: "2026-10-09T13:00:00.000Z",
      status: "rescheduled",
      version: 3,
    },
  });

  assert.equal(insertedPayload.lmsSession.managementSessionSourceId, "session-source-1");
  assert.equal(insertedPayload.lmsSession.managementScheduleSourceId, "schedule-source-1");
  assert.equal(insertedPayload.lmsSession.scheduleId, "4");
});
