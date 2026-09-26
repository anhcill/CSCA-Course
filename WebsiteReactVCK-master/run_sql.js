import pg from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve("backend", ".env") });

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required in backend/.env before running SQL scripts");
}

const migrationFiles = [
  "database/schema.sql",
  "database/migrations/001_add_csca_subjects.sql",
  "database/migrations/002_add_student_profiles.sql",
  "database/migrations/003_lms_core.sql",
  "database/migrations/004_live_classes.sql",
  "database/migrations/005_assignments_quizzes.sql",
  "database/migrations/006_notifications.sql",
  "database/migrations/007_attendance_leaderboard.sql",
  "database/migrations/008_certificates.sql",
  "database/migrations/009_lms_performance_indexes.sql",
  "database/migrations/010_live_class_policies.sql",
  "database/migrations/011_assignment_quiz_hardening.sql",
  "database/migrations/012_teacher_dashboard_audit.sql",
  "database/migrations/013_admin_console.sql",
  "database/migrations/014_gamification_certificates.sql",
  "database/migrations/015_management_lms_integration.sql",
  "database/migrations/016_lms_platform_operations.sql",
  "database/migrations/017_quiz_authoring.sql",
  "database/migrations/018_management_sync_core.sql",
  "database/migrations/019_management_attendance_delivery.sql",
  "database/migrations/020_class_calendar_core.sql",
  "database/migrations/022_notification_delivery.sql",
];

const filesToRun = process.env.RUN_SEEDS === "true"
  ? [...migrationFiles, "database/seed.sql", "database/seed_lms_demo.sql"]
  : migrationFiles;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to Railway PostgreSQL database...");
    await client.connect();
    await client.query("SET client_encoding = 'UTF8';");
    console.log("Connected successfully (encoding: UTF-8)!");

    for (const relativePath of filesToRun) {
      console.log(`Running SQL script: ${relativePath}...`);
      if (fs.existsSync(relativePath)) {
        const sql = fs.readFileSync(relativePath, "utf-8");
        await client.query(sql);
        console.log(`SUCCESS: ${relativePath}`);
      } else {
        console.error(`File NOT found: ${relativePath}`);
      }
    }

    console.log("\nAll SQL scripts executed successfully!");
  } catch (error) {
    console.error("Error executing SQL scripts:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
