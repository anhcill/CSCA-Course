import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import {
  computeMolyGetSignature,
  createRequireMolyIntegration,
} from "../middleware/requireMolyIntegration.js";
import { createMolyIntegrationV2Router } from "../router/molyIntegrationV2.router.js";
import {
  buildV2EventEnvelope,
  deriveMolySubjectCode,
  exportCatalogCourses,
  formatCourseExportRecord,
  normalizeMolyLevel,
  processAvailableCourseCatalogOutbox,
  recordCourseCatalogMutation,
  recordProfileCatalogMutation,
} from "./courseCatalogSync.service.js";
import { createCourseToMolyClient } from "./courseToMolyClient.js";

const TEST_MOLY_CFG = {
  serviceToken: "course-day2-bearer-secret",
  integrationKey: "moly-studio-v2",
  hmacSecret: "course-day2-hmac-secret",
};

const loadFullCourseSchema = async (db) => {
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
};

const makeDbAdapter = (pg) => ({
  query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
  getClient: async () => ({
    query: (sql, params) => (params ? pg.query(sql, params) : pg.query(sql)),
    release: () => {},
  }),
});

const startServer = (app) =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });

const stopServer = (server) =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const buildSignedGetHeaders = (originalUrl, {
  cfg = TEST_MOLY_CFG,
  timestamp = new Date().toISOString(),
  correlationId = "corr-day2-test",
  signatureOverride = null,
} = {}) => ({
  Authorization: `Bearer ${cfg.serviceToken}`,
  "X-Integration-Key": cfg.integrationKey,
  "X-Correlation-ID": correlationId,
  "X-Event-Timestamp": timestamp,
  "X-Signature": signatureOverride || computeMolyGetSignature({
    timestamp,
    method: "GET",
    originalUrl,
    secret: cfg.hmacSecret,
  }),
});

test("Day 2 catalog contract carries the Internal-managed course list price to Moly", () => {
  const priced = formatCourseExportRecord({
    id: 91,
    slug: "record-csca-91",
    title: "Record CSCA 91",
    category: "MATH",
    level: "beginner",
    price: 799000,
    is_free: false,
    is_published: true,
    sync_revision: 4,
    updated_at: "2026-11-18T00:00:00.000Z",
  });
  assert.equal(priced.priceVnd, 799000);
  assert.equal(priced.isFree, false);

  const free = formatCourseExportRecord({
    id: 92,
    slug: "hoc-thu-csca-92",
    title: "Học thử CSCA 92",
    category: "MATH",
    level: "beginner",
    price: 0,
    is_free: true,
    is_published: true,
    sync_revision: 5,
    updated_at: "2026-11-18T00:00:00.000Z",
  });
  assert.equal(free.priceVnd, 0);
  assert.equal(free.isFree, true);
});

test("Day 2 CSCA-Course catalog export paginates >2,000 courses without duplicates or skips via signed v2 HTTP", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);

  const teacher = (
    await pg.query(
      `INSERT INTO users (username, email, password_hash, role, management_display_name, avatar_url)
       VALUES ('teacher_v2', 'teacher_v2@csca.local', 'hash', 'admin', 'Thay Nguyen Toan', 'https://cdn.example/t.png')
       RETURNING id`,
    )
  ).rows[0];

  const liveClass = (
    await pg.query(
      `INSERT INTO live_classes (title, instructor_id, management_class_source_id, teacher_display_name, status)
       VALUES ('Lop Toan Live 2026', $1, 'LIVE-MATH-2026', 'Co Minh Live', 'active')
       RETURNING id`,
      [teacher.id],
    )
  ).rows[0];

  // Seed 2,150 courses with intentional sync_revision ties (groups of 50 share revision) to stress (sync_revision, id) ordering.
  const totalCourses = 2150;
  const batchSize = 250;
  const insertedCourseIds = [];
  for (let start = 1; start <= totalCourses; start += batchSize) {
    const end = Math.min(totalCourses, start + batchSize - 1);
    const values = [];
    const params = [];
    for (let idx = start; idx <= end; idx += 1) {
      const rev = Math.ceil(idx / 50);
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, TRUE, $${base + 8}, $${base + 9})`,
      );
      params.push(
        `Course Catalog ${idx}`,
        `Course Catalog Title ${idx}`,
        `course-catalog-${idx}`,
        `Description for course ${idx}`,
        idx % 3 === 0 ? "PHYSICS" : "MATH",
        idx % 2 === 0 ? "intermediate" : "beginner",
        teacher.id,
        10 + (idx % 5),
        rev,
      );
    }
    const res = await pg.query(
      `INSERT INTO courses (name, title, slug, description, category, level, author_id, is_published, total_lessons, sync_revision)
       VALUES ${values.join(", ")}
       RETURNING id`,
      params,
    );
    insertedCourseIds.push(...res.rows.map((r) => Number(r.id)));
  }

  // Attach 1:N video_course_profiles: 2 profiles (MIRROR + INDEPENDENT) on course #1, 1 profile on courses #2..#40.
  const firstCourseId = insertedCourseIds[0];
  await pg.query(
    `INSERT INTO video_course_profiles (
       course_id, mode, management_class_id, source_live_class_id,
       enforce_trusted_devices, device_limit, allow_file_download, status, sync_revision
     )
     VALUES
       ($1, 'MIRROR', 'CLS-LIVE-001', $2, TRUE, 2, TRUE, 'active', 1),
       ($1, 'INDEPENDENT', 'CLS-VID-001', NULL, TRUE, 3, FALSE, 'active', 2)`,
    [firstCourseId, liveClass.id],
  );

  const verifyRead = createRequireMolyIntegration({
    configOverrides: TEST_MOLY_CFG,
    requireIdempotencyKey: false,
    allowBodylessGet: true,
  });
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  app.use("/api/integrations/v2", createMolyIntegrationV2Router({ db, verifyRead }));

  const { server, baseUrl } = await startServer(app);
  t.after(() => stopServer(server));

  // Reject missing/invalid signature & wrong HTTP URL signing.
  const badUrl = "/api/integrations/v2/catalog/courses?limit=10";
  const badRes = await fetch(`${baseUrl}${badUrl}`, {
    headers: buildSignedGetHeaders("/api/integrations/v2/catalog/courses?limit=999"),
  });
  assert.equal(badRes.status, 401);

  // Sweep all 2,150 courses with limit=500 using cursor on odd pages & (afterRevision, afterId) on even pages.
  const seenIds = [];
  let pageNum = 0;
  let cursor = null;
  let afterRevision = 0;
  let afterId = 0;
  let anchor = null;

  while (true) {
    pageNum += 1;
    const qs = cursor
      ? `cursor=${encodeURIComponent(cursor)}&limit=500${anchor != null ? `&snapshotAnchorRevision=${anchor}` : ""}`
      : `afterRevision=${afterRevision}&afterId=${afterId}&limit=500${anchor != null ? `&snapshotAnchorRevision=${anchor}` : ""}`;
    const pathUrl = `/api/integrations/v2/catalog/courses?${qs}`;

    const res = await fetch(`${baseUrl}${pathUrl}`, {
      headers: buildSignedGetHeaders(pathUrl),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const courses = body.data.courses;
    const pgMeta = body.data.pagination;
    if (anchor == null) anchor = pgMeta.snapshotAnchorRevision;
    assert.equal(pgMeta.snapshotAnchorRevision, anchor);
    assert.ok(pgMeta.highWaterRevision >= 43);

    for (const item of courses) {
      seenIds.push(String(item.courseId));
      assert.ok(["MATH", "PHYSICS"].includes(item.subjectCode));
      assert.equal(item.instructor?.displayName, "Thay Nguyen Toan");
      if (String(item.courseId) === String(firstCourseId)) {
        assert.equal(item.profiles.length, 2);
        assert.deepEqual(
          item.profiles.map((p) => p.mode),
          ["MIRROR", "INDEPENDENT"],
        );
        assert.equal(item.profiles[0].externalOfferingId, "CLS-LIVE-001");
        assert.equal(item.profiles[0].badgeLabel, "Bản ghi lớp Live");
        assert.equal(item.profiles[1].deviceLimit, 3);
        assert.equal(item.profiles[1].allowFileDownload, false);
      }
    }

    if (!pgMeta.hasMore) break;
    assert.ok(pgMeta.nextCursor);
    if (pageNum % 2 === 1) {
      cursor = pgMeta.nextCursor;
    } else {
      cursor = null;
      afterRevision = pgMeta.nextAfterRevision;
      afterId = pgMeta.nextAfterId;
    }
    assert.ok(pageNum <= 10, "Pagination guard should complete in 5 pages");
  }

  assert.equal(seenIds.length, totalCourses);
  assert.equal(new Set(seenIds).size, totalCourses);
  assert.equal(pageNum, 5);
});

test("Day 2 CSCA-Course export handles kill-switch 503, soft-tombstone filter, and mid-sweep mutation re-appearance", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);

  const author = (await pg.query(
    `INSERT INTO users (username, email, password_hash, role) VALUES ('author_ks', 'author_ks@csca.local', 'hash', 'admin') RETURNING id`,
  )).rows[0];

  const c1 = (await pg.query(
    `INSERT INTO courses (name, title, slug, author_id, is_published, sync_revision) VALUES ('C1', 'C1', 'c1', $1, TRUE, 1) RETURNING id`,
    [author.id],
  )).rows[0];
  const c2 = (await pg.query(
    `INSERT INTO courses (name, title, slug, author_id, is_published, sync_revision) VALUES ('C2', 'C2', 'c2', $1, TRUE, 2) RETURNING id`,
    [author.id],
  )).rows[0];
  const c3 = (await pg.query(
    `INSERT INTO courses (name, title, slug, author_id, is_published, sync_revision, sync_deleted_at) VALUES ('C3', 'C3', 'c3', $1, FALSE, 3, NOW()) RETURNING id`,
    [author.id],
  )).rows[0];

  // Kill switch router check
  const ksApp = express();
  ksApp.use("/api/integrations/v2", createMolyIntegrationV2Router({
    db,
    verifyRead: (_req, _res, next) => next(),
    env: { COURSE_CATALOG_SYNC_DISABLED: "true" },
  }));
  const { server, baseUrl } = await startServer(ksApp);
  t.after(() => stopServer(server));

  const ksRes = await fetch(`${baseUrl}/api/integrations/v2/catalog/courses`);
  assert.equal(ksRes.status, 503);
  const ksBody = await ksRes.json();
  assert.equal(ksBody.errorCode, "SYNC_KILL_SWITCH_ACTIVE");

  // Filter includeTombstoned=false vs true
  const withoutDeleted = await exportCatalogCourses({ db, includeTombstoned: false });
  assert.deepEqual(withoutDeleted.courses.map((c) => Number(c.courseId)), [c1.id, c2.id]);

  // Mid-sweep mutation: read page 1 (limit=1 -> C1), mutate C1 to get higher revision, then continue cursor
  const page1 = await exportCatalogCourses({ db, limit: 1, includeTombstoned: true });
  assert.equal(page1.courses.length, 1);
  assert.equal(Number(page1.courses[0].courseId), c1.id);

  await pg.query(`UPDATE courses SET title = 'C1 Updated Mid-Sweep' WHERE id = $1`, [c1.id]);
  await recordCourseCatalogMutation({ db, courseId: c1.id, eventType: "course.upserted" });

  const remaining = [];
  let cursor = page1.pagination.nextCursor;
  while (cursor) {
    const nextPage = await exportCatalogCourses({
      db,
      cursor,
      snapshotAnchorRevision: page1.pagination.snapshotAnchorRevision,
      limit: 2,
      includeTombstoned: true,
    });
    remaining.push(...nextPage.courses);
    cursor = nextPage.pagination.hasMore ? nextPage.pagination.nextCursor : null;
  }

  assert.deepEqual(
    remaining.map((c) => Number(c.courseId)),
    [c2.id, c3.id, c1.id],
  );
  const updatedC1 = remaining.find((c) => Number(c.courseId) === c1.id);
  assert.equal(updatedC1.title, "C1 Updated Mid-Sweep");
  assert.ok(updatedC1.revision > 3);
  assert.equal(remaining.find((c) => Number(c.courseId) === c3.id).deleted, true);
});

test("Day 2 CSCA-Course outbox hooks & worker deliver create/update/publish/unpublish/profile/hard-delete with retry & dead-letter", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await loadFullCourseSchema(pg);
  const db = makeDbAdapter(pg);

  const author = (await pg.query(
    `INSERT INTO users (username, email, password_hash, role) VALUES ('author_hook', 'author_hook@csca.local', 'hash', 'admin') RETURNING id`,
  )).rows[0];

  const course = (await pg.query(
    `INSERT INTO courses (name, title, slug, author_id, category, level, is_published, total_lessons)
     VALUES ('Hook Test', 'Hook Test', 'hook-test', $1, 'HSK', 'advanced', FALSE, 4)
     RETURNING *`,
    [author.id],
  )).rows[0];

  const env1 = await recordCourseCatalogMutation({ db, courseId: course.id, eventType: "course.upserted" });
  const env2 = await recordCourseCatalogMutation({ db, courseId: course.id, eventType: "course.published" });

  const profile = (await pg.query(
    `INSERT INTO video_course_profiles (course_id, mode, management_class_id, device_limit, allow_file_download)
     VALUES ($1, 'INDEPENDENT', 'HOOK-PROF-1', 2, FALSE)
     RETURNING *`,
    [course.id],
  )).rows[0];
  const env3 = await recordProfileCatalogMutation({ db, profileId: profile.id, eventType: "profile.upserted" });

  await pg.query(`UPDATE courses SET is_published = FALSE WHERE id = $1`, [course.id]);
  const env4 = await recordCourseCatalogMutation({ db, courseId: course.id, eventType: "course.unpublished" });

  // Hard delete with beforeDeleteSnapshot BEFORE deleting rows
  const env5 = await recordCourseCatalogMutation({
    db,
    courseId: course.id,
    eventType: "course.tombstoned",
    deleted: true,
    beforeDeleteSnapshot: course,
  });
  await pg.query(`DELETE FROM video_course_profiles WHERE course_id = $1`, [course.id]);
  await pg.query(`DELETE FROM courses WHERE id = $1`, [course.id]);

  assert.ok(env1.revision < env2.revision);
  assert.ok(env2.revision < env3.revision);
  assert.ok(env4.revision > env3.revision);
  assert.ok(env5.revision > env4.revision);
  assert.equal(deriveMolySubjectCode({ category: "HSK", title: "Hook Test" }), "CHINESE_SOC");
  assert.equal(normalizeMolyLevel("advanced"), "advanced");

  const outboxRows = (
    await pg.query(`SELECT event_type, aggregate_type, deleted, status FROM course_integration_outbox ORDER BY aggregate_revision ASC, id ASC`)
  ).rows;
  assert.equal(outboxRows.some((r) => r.event_type === "course.published" && r.status === "pending"), true);
  assert.equal(outboxRows.some((r) => r.event_type === "profile.tombstoned" && r.deleted === true), true);
  assert.equal(outboxRows.some((r) => r.event_type === "course.tombstoned" && r.deleted === true), true);

  // Test outbox worker HTTP delivery: 1st call returns 503 (retryable), 2nd succeeds, permanent 409 dead-letters immediately
  const received = [];
  let attemptSeq = 0;
  const fakeMoly = express();
  fakeMoly.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  fakeMoly.post("/api/integrations/v2/events/ingest", (req, res) => {
    attemptSeq += 1;
    assert.ok(req.get("Authorization")?.startsWith("Bearer "));
    assert.ok(req.get("X-Signature")?.startsWith("sha256="));
    assert.ok(req.get("Idempotency-Key"));
    if (attemptSeq === 1) {
      return res.status(503).json({ success: false, errorCode: "TEMPORARY_UNAVAILABLE", message: "Retry me" });
    }
    if (req.body?.eventType === "course.tombstoned") {
      return res.status(409).json({ success: false, errorCode: "LEGACY_ORIGIN_CONFLICT", message: "Native conflict" });
    }
    received.push(req.body);
    return res.status(202).json({ success: true, data: { accepted: 1 } });
  });

  const { server, baseUrl } = await startServer(fakeMoly);
  t.after(() => stopServer(server));

  const client = createCourseToMolyClient({
    config: {
      apiBaseUrl: baseUrl,
      serviceToken: TEST_MOLY_CFG.serviceToken,
      integrationKey: TEST_MOLY_CFG.integrationKey,
      hmacSecret: TEST_MOLY_CFG.hmacSecret,
      timeoutMs: 3000,
    },
  });

  const run1 = await processAvailableCourseCatalogOutbox({
    db,
    molyClient: client,
    limit: 20,
    retryBaseSeconds: 0,
  });
  assert.equal(run1.results[0].status, "failed");
  assert.equal(run1.results.some((r) => r.status === "sent"), true);
  assert.equal(run1.results.some((r) => r.status === "dead_letter" && r.errorCode === "LEGACY_ORIGIN_CONFLICT"), true);

  // Force next_retry_at due and retry failed row #1
  await pg.query(`UPDATE course_integration_outbox SET next_retry_at = NOW() - INTERVAL '1 second' WHERE status = 'failed'`);
  const run2 = await processAvailableCourseCatalogOutbox({ db, molyClient: client, limit: 20 });
  assert.equal(run2.claimed, 1);
  assert.equal(run2.results[0].status, "sent");

  // Test envelope builder stability
  const envBuilt = buildV2EventEnvelope({
    eventType: "course.upserted",
    aggregateType: "course",
    aggregateId: 99,
    revision: 7,
    payload: { courseId: "99", title: "Demo" },
  });
  assert.equal(envBuilt.schemaVersion, "2.0");
  assert.equal(envBuilt.idempotencyKey, "csca-course:course:99:rev:7");
});
