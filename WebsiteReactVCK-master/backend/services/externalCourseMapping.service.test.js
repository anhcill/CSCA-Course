import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import http from "node:http";
import express from "express";
import { PGlite } from "@electric-sql/pglite";

process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/test";

const {
  ExternalIntegrationError,
  ingestEntitlementWithFreshnessGuard,
  listCourseMappings,
  resolveExternalCourseMapping,
  resolveLocalCourseToExternal,
  updateCourseMappingStatus,
  upsertManualCourseMapping,
} = await import("./externalCourseMapping.service.js");
const { createExternalCourseMappingRouter } = await import("../router/externalCourseMapping.router.js");
const { applyManualMappingsFromList } = await import("../scripts/seed_manual_course_mappings.js");

const INTEGRATION_TABLES = [
  "external_identities",
  "external_course_mappings",
  "external_entitlements",
  "integration_inbox",
  "integration_outbox",
  "integration_conflicts",
];

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) =>
    JSON.parse(match[0]),
  );
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
  return migrations;
};

test("migration 079 runs cleanly on empty DB, is idempotent on second run, and preserves existing Management data", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  const migrations = await loadFullCourseSchema(db);
  assert.ok(migrations.includes("database/migrations/079_moly_course_integration_foundation.sql"));

  const tablesRes = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [INTEGRATION_TABLES],
  );
  assert.deepEqual(
    tablesRes.rows.map((r) => r.table_name).sort(),
    [...INTEGRATION_TABLES].sort(),
  );

  const creator = (
    await db.query(
      "INSERT INTO users (username, email, role) VALUES ('legacy_teacher', 'teacher@test.local', 'creator') RETURNING id",
    )
  ).rows[0];
  const student = (
    await db.query(
      `INSERT INTO users (username, email, external_student_id, is_management_managed, lms_account_status)
       VALUES ('mgmt_student', 'student@test.local', 'mgmt-stu-01', TRUE, 'active') RETURNING id, external_student_id`,
    )
  ).rows[0];
  const course = (
    await db.query(
      `INSERT INTO courses (name, title, slug, author_id, external_course_id, is_published)
       VALUES ('HSK 4', 'HSK 4', 'hsk-4', $1, 'mgmt-course-01', TRUE) RETURNING id, external_course_id`,
      [creator.id],
    )
  ).rows[0];

  // Second execution of 079 must succeed idempotently without modifying existing data or schema.
  const migration079Sql = await fs.readFile("database/migrations/079_moly_course_integration_foundation.sql", "utf8");
  await db.exec(migration079Sql);

  const preservedStudent = (await db.query("SELECT external_student_id FROM users WHERE id = $1", [student.id])).rows[0];
  const preservedCourse = (await db.query("SELECT external_course_id FROM courses WHERE id = $1", [course.id])).rows[0];
  assert.equal(preservedStudent.external_student_id, "mgmt-stu-01");
  assert.equal(preservedCourse.external_course_id, "mgmt-course-01");

  const idxRes = await db.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY($1::text[])`,
    [[
      "idx_integration_inbox_worker_claim",
      "idx_integration_outbox_worker_claim",
      "idx_external_identities_user_lookup",
      "idx_external_course_mappings_local_course",
      "idx_external_entitlements_user_lookup",
      "idx_integration_inbox_pending",
    ]],
  );
  assert.equal(idxRes.rows.length, 6);
});

test("enforces unique (source_system, external_*_id), cross-source isolation, FK, status CHECK, and ON DELETE RESTRICT", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadFullCourseSchema(db);

  const creator = (
    await db.query("INSERT INTO users (username, email, role) VALUES ('c1', 'c1@test.local', 'creator') RETURNING id")
  ).rows[0];
  const u1 = (
    await db.query("INSERT INTO users (username, email) VALUES ('stu1', 'stu1@test.local') RETURNING id")
  ).rows[0];
  const u2 = (
    await db.query("INSERT INTO users (username, email) VALUES ('stu2', 'stu2@test.local') RETURNING id")
  ).rows[0];
  const c1 = (
    await db.query(
      "INSERT INTO courses (name, title, slug, author_id, is_published) VALUES ('Course A', 'Course A', 'course-a', $1, TRUE) RETURNING id",
      [creator.id],
    )
  ).rows[0];
  const c2 = (
    await db.query(
      "INSERT INTO courses (name, title, slug, author_id, is_published) VALUES ('Course B', 'Course B', 'course-b', $1, TRUE) RETURNING id",
      [creator.id],
    )
  ).rows[0];

  await db.query(
    `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
     VALUES ('moly', 'ext-100', $1, 'active', '2026-11-14T08:00:00Z')`,
    [u1.id],
  );

  // Duplicate external identity within same source_system must be blocked.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
         VALUES ('moly', 'ext-100', $1, 'active', '2026-11-14T08:05:00Z')`,
        [u2.id],
      ),
    (err) => err.code === "23505",
  );

  // Same external_user_id IS allowed when source_system differs.
  await db.query(
    `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
     VALUES ('csca-course', 'ext-100', $1, 'active', '2026-11-14T08:00:00Z')`,
    [u2.id],
  );

  // Foreign key check on non-existent user & course.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
         VALUES ('moly', 'ext-missing-user', 999999, 'active', '2026-11-14T08:00:00Z')`,
      ),
    (err) => err.code === "23503",
  );

  // Invalid identity status rejected by CHECK constraint.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_identities (source_system, external_user_id, user_id, status, source_updated_at)
         VALUES ('moly', 'ext-bad-status', $1, 'pending', '2026-11-14T08:00:00Z')`,
        [u2.id],
      ),
    (err) => err.code === "23514",
  );

  // Course mappings: duplicate in same source blocked; same external_course_id across sources allowed.
  await db.query(
    `INSERT INTO external_course_mappings (source_system, external_course_id, local_course_id)
     VALUES ('moly', 'course-shared-id', $1)`,
    [c1.id],
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_course_mappings (source_system, external_course_id, local_course_id)
         VALUES ('moly', 'course-shared-id', $1)`,
        [c2.id],
      ),
    (err) => err.code === "23505",
  );
  await db.query(
    `INSERT INTO external_course_mappings (source_system, external_course_id, local_course_id)
     VALUES ('internal-management', 'course-shared-id', $1)`,
    [c2.id],
  );

  // Entitlement status check: all 4 allowed states + reject invalid state + enforce revoked_at when revoked + valid range.
  for (const [idx, st] of ["active", "suspended", "expired", "revoked"].entries()) {
    await db.query(
      `INSERT INTO external_entitlements (
         source_system, external_grant_id, external_user_id, external_course_id,
         user_id, local_course_id, status, valid_from, valid_until, revoked_at, source_updated_at
       )
       VALUES ($1, $2, 'ext-100', 'course-shared-id', $3, $4, $5, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', $6, '2026-11-14T08:00:00Z')`,
      [
        "moly",
        `grant-${idx}`,
        u1.id,
        c1.id,
        st,
        st === "revoked" ? "2026-11-14T08:00:00Z" : null,
      ],
    );
  }
  await db.query(
    `INSERT INTO external_entitlements (
       source_system, external_grant_id, external_user_id, external_course_id,
       user_id, local_course_id, status, valid_from, source_updated_at
     )
     VALUES ('csca-course', 'grant-0', 'ext-100', 'course-shared-id', $1, $2, 'active', '2026-11-01T00:00:00Z', '2026-11-14T08:00:00Z')`,
    [u2.id, c2.id],
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_entitlements (
           source_system, external_grant_id, external_user_id, external_course_id,
           user_id, local_course_id, status, valid_from, source_updated_at
         )
         VALUES ('moly', 'grant-invalid-status', 'ext-100', 'course-shared-id', $1, $2, 'cancelled', '2026-11-01T00:00:00Z', '2026-11-14T08:00:00Z')`,
        [u1.id, c1.id],
      ),
    (err) => err.code === "23514",
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO external_entitlements (
           source_system, external_grant_id, external_user_id, external_course_id,
           user_id, local_course_id, status, valid_from, source_updated_at
         )
         VALUES ('moly', 'grant-missing-revoked-at', 'ext-100', 'course-shared-id', $1, $2, 'revoked', '2026-11-01T00:00:00Z', '2026-11-14T08:00:00Z')`,
        [u1.id, c1.id],
      ),
    (err) => err.code === "23514",
  );

  // ON DELETE RESTRICT prevents cascading loss of entitlements / identities.
  await assert.rejects(() => db.query("DELETE FROM users WHERE id = $1", [u1.id]), (err) => err.code === "23001");
  await assert.rejects(() => db.query("DELETE FROM courses WHERE id = $1", [c1.id]), (err) => err.code === "23001");
});

test("stale events carrying older source_updated_at are marked stale in inbox and blocked at DB trigger level", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadFullCourseSchema(db);

  const teacher = (
    await db.query("INSERT INTO users (username, email, role) VALUES ('t1', 't1@test.local', 'creator') RETURNING id")
  ).rows[0];
  const student = (
    await db.query("INSERT INTO users (username, email) VALUES ('s1', 's1@test.local') RETURNING id")
  ).rows[0];
  const course = (
    await db.query(
      "INSERT INTO courses (name, title, slug, author_id, is_published) VALUES ('CSCA Math', 'CSCA Math', 'csca-math', $1, TRUE) RETURNING id",
      [teacher.id],
    )
  ).rows[0];

  await upsertManualCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:course:1",
    localCourseId: course.id,
  });

  // Newer event arrives first (revoked at 12:00Z).
  const newerRes = await ingestEntitlementWithFreshnessGuard(db, {
    sourceSystem: "moly",
    eventId: "evt-new-revoke",
    idempotencyKey: "idem-new-revoke",
    correlationId: "corr-stale-test",
    externalGrantId: "moly:grant:tx_500:course_1",
    externalUserId: "moly:541",
    externalCourseId: "moly:course:1",
    userId: student.id,
    status: "revoked",
    validFrom: "2026-11-14T09:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    revokedAt: "2026-11-14T12:00:00Z",
    revokeReason: "refund",
    sourceUpdatedAt: "2026-11-14T12:00:00Z",
  });
  assert.equal(newerRes.outcome, "applied");
  assert.equal(newerRes.inbox.status, "processed");
  assert.equal(newerRes.entitlement.status, "revoked");

  // Older out-of-order event arrives afterwards (active at 10:00Z) -> must be marked stale and preserve revoked state.
  const olderRes = await ingestEntitlementWithFreshnessGuard(db, {
    sourceSystem: "moly",
    eventId: "evt-old-grant",
    idempotencyKey: "idem-old-grant",
    correlationId: "corr-stale-test",
    externalGrantId: "moly:grant:tx_500:course_1",
    externalUserId: "moly:541",
    externalCourseId: "moly:course:1",
    userId: student.id,
    status: "active",
    validFrom: "2026-11-14T09:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    sourceUpdatedAt: "2026-11-14T10:00:00Z",
  });
  assert.equal(olderRes.outcome, "stale");
  assert.equal(olderRes.inbox.status, "stale");
  assert.equal(olderRes.inbox.last_error_code, "STALE_EVENT");

  const stored = (
    await db.query(
      "SELECT status, source_updated_at FROM external_entitlements WHERE source_system = 'moly' AND external_grant_id = 'moly:grant:tx_500:course_1'",
    )
  ).rows[0];
  assert.equal(stored.status, "revoked");

  // Direct unguarded SQL update with older source_updated_at is also blocked by trigger.
  await assert.rejects(
    () =>
      db.query(
        `UPDATE external_entitlements
         SET status = 'active', revoked_at = NULL, source_updated_at = '2026-11-14T10:00:00Z'
         WHERE source_system = 'moly' AND external_grant_id = 'moly:grant:tx_500:course_1'`,
      ),
    /STALE_SOURCE_UPDATED_AT/,
  );
});

test("manual course mapping forbids title/slug auto-mapping, returns COURSE_MAPPING_MISSING, and serves admin router", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadFullCourseSchema(db);

  const admin = (
    await db.query("INSERT INTO users (username, email, role) VALUES ('adm1', 'adm1@test.local', 'admin') RETURNING id")
  ).rows[0];
  const course1 = (
    await db.query(
      `INSERT INTO courses (name, title, slug, author_id, is_published)
       VALUES ('CSCA Math Live Record', 'CSCA Math Live Record', 'csca-math-live-record', $1, TRUE) RETURNING id`,
      [admin.id],
    )
  ).rows[0];
  const course2 = (
    await db.query(
      `INSERT INTO courses (name, title, slug, author_id, is_published)
       VALUES ('CSCA Physics Record', 'CSCA Physics Record', 'csca-physics-record', $1, TRUE) RETURNING id`,
      [admin.id],
    )
  ).rows[0];

  // Even when externalCourseId matches slug/title verbatim, resolving without explicit mapping must throw COURSE_MAPPING_MISSING.
  await assert.rejects(
    () =>
      resolveExternalCourseMapping(db, {
        sourceSystem: "moly",
        externalCourseId: "csca-math-live-record",
      }),
    (err) => err instanceof ExternalIntegrationError && err.errorCode === "COURSE_MAPPING_MISSING" && err.statusCode === 422,
  );
  await assert.rejects(
    () => resolveLocalCourseToExternal(db, { sourceSystem: "moly", localCourseId: course1.id }),
    (err) => err.errorCode === "COURSE_MAPPING_MISSING",
  );
  await assert.rejects(
    () =>
      upsertManualCourseMapping(db, {
        sourceSystem: "moly",
        externalCourseId: "moly:course:1",
        localCourseId: course1.id,
        autoMatch: true,
      }),
    (err) => err.errorCode === "AUTO_MAPPING_FORBIDDEN",
  );

  // Batch helper maps the 2 initial courses manually.
  const seeded = await applyManualMappingsFromList(db, [
    {
      sourceSystem: "moly",
      externalCourseId: "moly:course:1",
      externalCourseCode: "math-foundation",
      externalCourseTitle: "Moly Math",
      localCourseId: course1.id,
      actorId: admin.id,
    },
    {
      sourceSystem: "moly",
      externalCourseId: "moly:course:2",
      externalCourseCode: "physics-foundation",
      externalCourseTitle: "Moly Physics",
      localCourseId: course2.id,
      actorId: admin.id,
    },
  ]);
  assert.equal(seeded.length, 2);

  const resolved1 = await resolveExternalCourseMapping(db, {
    sourceSystem: "moly",
    externalCourseId: "moly:course:1",
  });
  assert.equal(resolved1.localCourseId, Number(course1.id));
  assert.equal(resolved1.mappingSource, "manual");

  // Deactivating a mapping makes active resolution fail with COURSE_MAPPING_MISSING without deleting history.
  await updateCourseMappingStatus(db, { id: resolved1.id, status: "inactive", actorId: admin.id });
  await assert.rejects(
    () => resolveExternalCourseMapping(db, { sourceSystem: "moly", externalCourseId: "moly:course:1" }),
    (err) => err.errorCode === "COURSE_MAPPING_MISSING",
  );
  const allRows = await listCourseMappings(db, { sourceSystem: "moly" });
  assert.equal(allRows.length, 2);

  // Express router verification with HTTP server.
  const auditCalls = [];
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/admin/integrations",
    createExternalCourseMappingRouter({
      db,
      recordAudit: async (entry) => auditCalls.push(entry),
      protect: (req, res, next) => {
        if (!req.headers["x-test-admin"]) return res.status(401).json({ success: false, errorCode: "UNAUTHORIZED" });
        req.user = { id: Number(req.headers["x-test-admin"]), role: "admin" };
        next();
      },
      adminGuard: (req, res, next) => next(),
    }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/admin/integrations`;

  const unauthRes = await fetch(`${baseUrl}/course-mappings`);
  assert.equal(unauthRes.status, 401);

  const createRes = await fetch(`${baseUrl}/course-mappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-admin": String(admin.id) },
    body: JSON.stringify({
      sourceSystem: "moly",
      externalCourseId: "moly:course:1",
      localCourseId: Number(course1.id),
      status: "active",
    }),
  });
  assert.equal(createRes.status, 201);
  assert.equal((await createRes.json()).data.localCourseId, Number(course1.id));
  assert.equal(auditCalls.length, 1);

  const missingRes = await fetch(
    `${baseUrl}/course-mappings/resolve?sourceSystem=moly&externalCourseId=csca-physics-record`,
    { headers: { "x-test-admin": String(admin.id) } },
  );
  assert.equal(missingRes.status, 422);
  assert.equal((await missingRes.json()).errorCode, "COURSE_MAPPING_MISSING");
});
