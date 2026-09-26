import crypto from "crypto";
import os from "os";
import dotenv from "dotenv";
import path from "path";
import { pool } from "./db/connect.js";
import { processAvailableManagementSyncJobs } from "./services/managementSync.service.js";
import { processAvailableManagementAttendanceDeliveries } from "./services/managementAttendanceDelivery.service.js";
import { processAvailableManagementCalendarDeliveries } from "./services/managementCalendarDelivery.service.js";
import { processAssignmentDeadlineReminders } from "./services/assignmentDeadlineNotification.service.js";

dotenv.config({ path: path.resolve("backend", ".env") });

const parseBoundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

const workerId = (process.env.LMS_SYNC_WORKER_ID || `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`).slice(0, 160);
const pollMs = parseBoundedInt(process.env.LMS_SYNC_WORKER_POLL_MS, 3000, 250, 60000);
const batchSize = parseBoundedInt(process.env.LMS_SYNC_WORKER_BATCH_SIZE, 10, 1, 100);
const deadlineReminderPollMs = parseBoundedInt(process.env.LMS_ASSIGNMENT_REMINDER_POLL_MS, 300000, 60000, 3600000);
const runOnce = process.env.LMS_SYNC_WORKER_ONCE === "true";
let stopping = false;
let nextDeadlineReminderAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stop = (signal) => {
  stopping = true;
  console.log(`[LMS sync worker] Received ${signal}; finishing current batch.`);
};

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

const main = async () => {
  console.log(`[LMS sync worker] Started as ${workerId}`);
  try {
    do {
      const shouldProcessDeadlines = Date.now() >= nextDeadlineReminderAt;
      if (shouldProcessDeadlines) nextDeadlineReminderAt = Date.now() + deadlineReminderPollMs;
      const [incomingResults, attendanceResults, calendarResults] = await Promise.all([
        processAvailableManagementSyncJobs({ workerId, limit: batchSize }),
        processAvailableManagementAttendanceDeliveries({ workerId, limit: batchSize }),
        processAvailableManagementCalendarDeliveries({ workerId, limit: batchSize }),
      ]);
      const deadlineResult = shouldProcessDeadlines ? await processAssignmentDeadlineReminders() : null;
      const results = [
        ...incomingResults,
        ...attendanceResults,
        ...calendarResults,
        ...(deadlineResult?.notifications ? [{ status: "assignment_reminders", count: deadlineResult.notifications }] : []),
      ];
      if (results.length > 0) {
        const summary = results.reduce((accumulator, result) => {
          accumulator[result.status] = (accumulator[result.status] || 0) + 1;
          return accumulator;
        }, {});
        console.log(`[LMS sync worker] Processed ${results.length} event(s): ${JSON.stringify(summary)}`);
      }
      if (runOnce || stopping) break;
      if (results.length === 0) await wait(pollMs);
    } while (!stopping);
  } finally {
    await pool.end();
    console.log("[LMS sync worker] Stopped.");
  }
};

main().catch((error) => {
  console.error("[LMS sync worker] Fatal error:", error?.message || error);
  process.exitCode = 1;
});
