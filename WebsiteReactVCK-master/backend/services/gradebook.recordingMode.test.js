import assert from "node:assert/strict";
import test from "node:test";
import { buildGradebook, gradebookTable } from "./gradebook.service.js";

test("recording learners are not penalized by attendance", async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes("FROM live_classes lc LEFT JOIN courses")) {
        return { rows: [{ id: 5, title: "Main class", course_id: 2, course_title: "Math" }] };
      }
      if (sql.includes("FROM class_gradebook_policies")) return { rows: [] };
      if (sql.includes("FROM class_enrollments ce")) {
        return { rows: [{ id: 9, name: "Record Learner", email: "record@example.test", learning_mode: "recording" }] };
      }
      if (sql.includes("SELECT id FROM class_sessions")) return { rows: [{ id: 91 }] };
      if (sql.includes("CONCAT('assignment-', id)")) {
        return { rows: [{ id: "assignment-1", title: "Homework", type: "assignment", max_score: 10 }] };
      }
      if (sql.includes("FROM assignments a JOIN assignment_submissions")) {
        return { rows: [{ user_id: 9, activity_id: "assignment-1", status: "submitted", return_requested: false, score: 10, max_score: 10 }] };
      }
      if (sql.includes("FROM quiz_attempts")) return { rows: [] };
      if (sql.includes("FROM class_attendance ca")) {
        return { rows: [{ user_id: 9, session_id: 91, status: "absent" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const book = await buildGradebook(db, 5);
  assert.equal(book.rows[0].learning_mode, "recording");
  assert.equal(book.rows[0].attendanceApplicable, false);
  assert.equal(book.rows[0].attendancePercent, null);
  assert.equal(book.rows[0].total, 100);
  assert.equal(gradebookTable(book)[1][4], "Không áp dụng");
});
