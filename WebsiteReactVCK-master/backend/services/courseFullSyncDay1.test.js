import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

const loadCourseSchemaWith083 = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  assert.ok(
    migrations.includes("database/migrations/083_course_moly_full_sync_foundation.sql"),
    "run_sql.js must register 083_course_moly_full_sync_foundation.sql",
  );
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const seedCourseFixture = async (db) => {
  const userA = (
    await db.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('learner_a', 'learner_a@test.local', 'hashed', 'user')
       RETURNING id`,
    )
  ).rows[0];
  const userB = (
    await db.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ('learner_b', 'learner_b@test.local', 'hashed', 'user')
       RETURNING id`,
    )
  ).rows[0];

  const course1 = (
    await db.query(
      `INSERT INTO courses (name, slug, description, author_id, is_published)
       VALUES ('CSCA Math Full', 'csca-math-full', 'Full sync test', $1, TRUE)
       RETURNING id, sync_revision`,
      [userA.id],
    )
  ).rows[0];
  const course2 = (
    await db.query(
      `INSERT INTO courses (name, slug, description, author_id, is_published)
       VALUES ('CSCA Physics Full', 'csca-physics-full', 'Full sync test 2', $1, TRUE)
       RETURNING id`,
      [userA.id],
    )
  ).rows[0];

  const profile1A = (
    await db.query(
      `INSERT INTO video_course_profiles (course_id, mode, management_class_id, device_limit, allow_file_download)
       VALUES ($1, 'INDEPENDENT', 'MOLY-MATH-01', 2, FALSE)
       RETURNING id, sync_revision`,
      [course1.id],
    )
  ).rows[0];
  const profile1B = (
    await db.query(
      `INSERT INTO video_course_profiles (course_id, mode, management_class_id, device_limit, allow_file_download)
       VALUES ($1, 'INDEPENDENT', 'MOLY-MATH-02', 2, TRUE)
       RETURNING id`,
      [course1.id],
    )
  ).rows[0];
  const profile2 = (
    await db.query(
      `INSERT INTO video_course_profiles (course_id, mode, management_class_id, device_limit, allow_file_download)
       VALUES ($1, 'INDEPENDENT', 'MOLY-PHYS-01', 2, TRUE)
       RETURNING id`,
      [course2.id],
    )
  ).rows[0];

  return { userA, userB, course1, course2, profile1A, profile1B, profile2 };
};

test("Day 1 Course migration 083 installs cleanly, runs idempotently, and preserves existing rows", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadCourseSchemaWith083(db);

  const { course1, profile1A, profile1B } = await seedCourseFixture(db);
  assert.equal(Number(course1.sync_revision), 1);
  assert.equal(Number(profile1A.sync_revision), 1);
  assert.notEqual(profile1A.id, profile1B.id);

  // Rerun migration 083 a second time to guarantee strict idempotency.
  await db.exec(await fs.readFile("database/migrations/083_course_moly_full_sync_foundation.sql", "utf8"));

  const tablesRes = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [[
      "course_integration_outbox",
      "course_sync_checkpoints",
      "moly_device_bindings",
      "delegated_learning_sessions",
    ]],
  );
  assert.equal(tablesRes.rows.length, 4);

  const preservedCourse = (await db.query("SELECT slug, sync_revision FROM courses WHERE id = $1", [course1.id])).rows[0];
  assert.equal(preservedCourse.slug, "csca-math-full");
  assert.equal(Number(preservedCourse.sync_revision), 1);
});

test("Day 1 cross-app device binding maps 1 physical browser = 1 slot and blocks spoofing or owner mismatch", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadCourseSchemaWith083(db);
  const { userA, userB } = await seedCourseFixture(db);

  const courseSlot1 = (
    await db.query(
      `INSERT INTO trusted_login_devices
         (user_id, device_token_hash, device_name, device_source, record_access_granted_at)
       VALUES ($1, $2, 'Chrome Desktop', 'sso_bound', NOW())
       RETURNING id, device_source`,
      [userA.id, sha256Hex("csca-cookie-browser-1")],
    )
  ).rows[0];
  assert.equal(courseSlot1.device_source, "sso_bound");

  const molyHash1 = sha256Hex("moly-httponly-cookie-browser-1");

  // Spoofed/unhashed browser header string fails CHECK constraint (must be 64-hex SHA-256 of server cookie).
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO moly_device_bindings
           (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source)
         VALUES ($1, 'moly:101', 'browser-supplied-x-device-id', $2, 'delegated_proof')`,
        [userA.id, courseSlot1.id],
      ),
    /chk_moly_device_bindings|moly_device_token_hash/i,
  );

  // Bind verified Moly browser token -> existing Course slot (same physical browser = 1 slot).
  const binding1 = (
    await db.query(
      `INSERT INTO moly_device_bindings
         (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source)
       VALUES ($1, 'moly:101', $2, $3, 'sso_browser_tx')
       RETURNING id, trusted_device_id`,
      [userA.id, molyHash1, courseSlot1.id],
    )
  ).rows[0];
  assert.equal(String(binding1.trusted_device_id), String(courseSlot1.id));

  // Attempting to bind the SAME physical browser cookie to a SECOND Course slot for the same user fails unique index.
  const courseSlot2 = (
    await db.query(
      `INSERT INTO trusted_login_devices
         (user_id, device_token_hash, device_name, device_source, record_access_granted_at)
       VALUES ($1, $2, 'Chrome Second Tab', 'csca_course', NOW())
       RETURNING id`,
      [userA.id, sha256Hex("csca-cookie-browser-2")],
    )
  ).rows[0];
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO moly_device_bindings
           (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source)
         VALUES ($1, 'moly:101', $2, $3, 'delegated_proof')`,
        [userA.id, molyHash1, courseSlot2.id],
      ),
    /duplicate key|uq_moly_device_bindings_user_moly_active/i,
  );

  // Trigger blocks binding userB to userA's trusted slot.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO moly_device_bindings
           (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source)
         VALUES ($1, 'moly:202', $2, $3, 'delegated_proof')`,
        [userB.id, sha256Hex("moly-cookie-user-b"), courseSlot1.id],
      ),
    /DEVICE_BINDING_OWNER_MISMATCH/,
  );

  // Trigger blocks binding an active slot to a revoked trusted device.
  await db.query(
    `UPDATE trusted_login_devices SET revoked_at = NOW() WHERE id = $1`,
    [courseSlot2.id],
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO moly_device_bindings
           (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source)
         VALUES ($1, 'moly:101', $2, $3, 'delegated_proof')`,
        [userA.id, sha256Hex("moly-cookie-another"), courseSlot2.id],
      ),
    /DEVICE_BINDING_REVOKED_SLOT/,
  );

  // History preservation: cannot hard-delete trusted_login_devices while bound (ON DELETE RESTRICT).
  await assert.rejects(
    () => db.query("DELETE FROM trusted_login_devices WHERE id = $1", [courseSlot1.id]),
    /foreign key/i,
  );
});

test("Day 1 delegated learning sessions & Course v2 outbox enforce scope, TTL, revision and tombstones", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await loadCourseSchemaWith083(db);
  const { userA, course1, profile1A, profile2 } = await seedCourseFixture(db);

  // Profile mismatch (profile2 belongs to course2, not course1) must fail trigger.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO delegated_learning_sessions
           (jti, session_token_hash, nonce_hash, user_id, external_user_id, course_id, video_course_profile_id, scopes, expires_at)
         VALUES ('jti-mismatch', $1, $2, $3, 'moly:101', $4, $5, ARRAY['workspace:read'], NOW() + INTERVAL '5 minutes')`,
        [sha256Hex("tok-1"), sha256Hex("nonce-1"), userA.id, course1.id, profile2.id],
      ),
    /PROFILE_SCOPE_MISMATCH/,
  );

  // Excessively long TTL (> 15 min) or unknown scope must fail CHECK constraints.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO delegated_learning_sessions
           (jti, session_token_hash, nonce_hash, user_id, external_user_id, course_id, video_course_profile_id, scopes, expires_at)
         VALUES ('jti-long-ttl', $1, $2, $3, 'moly:101', $4, $5, ARRAY['workspace:read'], NOW() + INTERVAL '2 hours')`,
        [sha256Hex("tok-2"), sha256Hex("nonce-2"), userA.id, course1.id, profile1A.id],
      ),
    /chk_delegated_learning_sessions_ttl/i,
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO delegated_learning_sessions
           (jti, session_token_hash, nonce_hash, user_id, external_user_id, course_id, video_course_profile_id, scopes, expires_at)
         VALUES ('jti-bad-scope', $1, $2, $3, 'moly:101', $4, $5, ARRAY['admin:all'], NOW() + INTERVAL '5 minutes')`,
        [sha256Hex("tok-3"), sha256Hex("nonce-3"), userA.id, course1.id, profile1A.id],
      ),
    /check/i,
  );

  // Valid short-lived delegated session persists cleanly.
  const sess = (
    await db.query(
      `INSERT INTO delegated_learning_sessions
         (jti, session_token_hash, nonce_hash, user_id, external_user_id, course_id, video_course_profile_id, scopes, expires_at)
       VALUES ('jti-valid-1', $1, $2, $3, 'moly:101', $4, $5, ARRAY['workspace:read','video:play','progress:write'], NOW() + INTERVAL '5 minutes')
       RETURNING id, audience, scopes`,
      [sha256Hex("tok-valid-1"), sha256Hex("nonce-valid-1"), userA.id, course1.id, profile1A.id],
    )
  ).rows[0];
  assert.equal(sess.audience, "csca-course:delegated-learning");
  assert.deepEqual(sess.scopes, ["workspace:read", "video:play", "progress:write"]);

  // Outbox tombstone requires deleted_at timestamp.
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO course_integration_outbox
           (event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, deleted, source_updated_at, payload)
         VALUES ('evt-tomb-bad', 'idem-tomb-bad', 'course.tombstoned', 'course', '1', 2, TRUE, NOW(), '{}'::jsonb)`,
      ),
    /chk_course_outbox_deleted_timestamp/i,
  );

  // Valid outbox + checkpoint rows insert and deduplicate deterministically.
  await db.query(
    `INSERT INTO course_integration_outbox
       (event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, deleted, deleted_at, source_updated_at, payload)
     VALUES ('csca:course:1:rev:2', 'csca:course:1:rev:2', 'course.tombstoned', 'course', '1', 2, TRUE, NOW(), NOW(), '{"courseId":1}'::jsonb)`,
  );
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO course_integration_outbox
           (event_id, idempotency_key, event_type, aggregate_type, aggregate_id, aggregate_revision, deleted, deleted_at, source_updated_at, payload)
         VALUES ('csca:course:1:rev:2', 'csca:course:1:rev:2-dup', 'course.tombstoned', 'course', '1', 2, TRUE, NOW(), NOW(), '{}'::jsonb)`,
      ),
    /duplicate key/i,
  );

  await db.query(
    `INSERT INTO course_sync_checkpoints (stream_name, last_cursor, after_entity_id, high_water_revision)
     VALUES ('catalog_courses', 'rev:2:id:10', 10, 2)`,
  );
  const cp = (await db.query("SELECT high_water_revision FROM course_sync_checkpoints WHERE stream_name = 'catalog_courses'")).rows[0];
  assert.equal(Number(cp.high_water_revision), 2);
});
