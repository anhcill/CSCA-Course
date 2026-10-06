import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve("backend", ".env") });

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required in backend/.env before running SQL scripts");

const migrationFiles = [
  "database/migrations/001_add_csca_subjects.sql", "database/migrations/002_add_student_profiles.sql",
  "database/migrations/003_lms_core.sql", "database/migrations/004_live_classes.sql",
  "database/migrations/005_assignments_quizzes.sql", "database/migrations/006_notifications.sql",
  "database/migrations/007_attendance_leaderboard.sql", "database/migrations/008_certificates.sql",
  "database/migrations/009_lms_performance_indexes.sql", "database/migrations/010_live_class_policies.sql",
  "database/migrations/011_assignment_quiz_hardening.sql", "database/migrations/012_teacher_dashboard_audit.sql",
  "database/migrations/013_admin_console.sql", "database/migrations/014_gamification_certificates.sql",
  "database/migrations/015_management_lms_integration.sql", "database/migrations/016_lms_platform_operations.sql",
  "database/migrations/017_quiz_authoring.sql", "database/migrations/018_management_sync_core.sql",
  "database/migrations/019_management_attendance_delivery.sql", "database/migrations/020_class_calendar_core.sql",
  "database/migrations/022_notification_delivery.sql", "database/migrations/023_management_calendar_delivery.sql",
  "database/migrations/024_lesson_learning_links.sql", "database/migrations/025_quiz_paper_sources.sql",
  "database/migrations/026_quiz_class_session_targets.sql", "database/migrations/027_session_workspace_resources.sql",
  "database/migrations/028_quiz_homework_scope.sql", "database/migrations/029_schema_migration_registry.sql",
  "database/migrations/030_class_announcements.sql", "database/migrations/031_assessment_integrity_and_rubrics.sql",
  "database/migrations/032_lms_operations_gradebook_accommodations.sql",
];

// Git may check out SQL with CRLF on Windows while Railway reads LF. A
// migration checksum must represent the SQL itself, not the workstation's
// line-ending convention.
const checksum = (sql) => crypto.createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
const getSql = (relativePath) => {
  if (!fs.existsSync(relativePath)) throw new Error(`Migration file not found: ${relativePath}`);
  return fs.readFileSync(relativePath, "utf8");
};

async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    checksum CHAR(64) NOT NULL,
    execution_ms INTEGER NOT NULL DEFAULT 0 CHECK (execution_ms >= 0),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function bootstrapSchemaIfNeeded(client) {
  const { rows } = await client.query("SELECT to_regclass('public.users') AS users_table");
  if (rows[0]?.users_table) return;
  console.log("Bootstrapping empty database from database/schema.sql...");
  await client.query(getSql("database/schema.sql"));
}

async function baseline(client) {
  const { rows } = await client.query("SELECT to_regclass('public.users') AS users_table");
  if (!rows[0]?.users_table) throw new Error("Cannot baseline an empty database. Run npm run migrate instead.");
  for (const relativePath of migrationFiles) {
    const sql = getSql(relativePath);
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_ms)
       VALUES ($1, $2, 0)
       ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum`,
      [relativePath, checksum(sql)],
    );
  }
  console.log(`Baseline complete: recorded ${migrationFiles.length} migration(s) without executing them.`);
}

async function migrate(client) {
  for (const relativePath of migrationFiles) {
    const sql = getSql(relativePath);
    const hash = checksum(sql);
    const existing = await client.query("SELECT checksum FROM schema_migrations WHERE filename = $1", [relativePath]);
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== hash) throw new Error(`Checksum mismatch for applied migration: ${relativePath}`);
      console.log(`SKIP: ${relativePath}`);
      continue;
    }
    const startedAt = Date.now();
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum, execution_ms) VALUES ($1, $2, $3)",
        [relativePath, hash, Date.now() - startedAt],
      );
      await client.query("COMMIT");
      console.log(`APPLIED: ${relativePath}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
}

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  let migrationLockAcquired = false;
  try {
    await client.connect();
    await client.query("SET client_encoding = 'UTF8'");
    // Web and worker may be released at the same time. The advisory lock
    // serializes migrations without relying on a deployment order.
    await client.query("SELECT pg_advisory_lock(308202609)");
    migrationLockAcquired = true;
    await bootstrapSchemaIfNeeded(client);
    await ensureLedger(client);
    if (process.env.MIGRATION_BASELINE === "true") await baseline(client);
    else await migrate(client);
    if (process.env.RUN_SEEDS === "true") {
      for (const file of ["database/seed.sql", "database/seed_lms_demo.sql"]) await client.query(getSql(file));
      console.log("Seed scripts completed.");
    }
  } finally {
    if (migrationLockAcquired) await client.query("SELECT pg_advisory_unlock(308202609)").catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
