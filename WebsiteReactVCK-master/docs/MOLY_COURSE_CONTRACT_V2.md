# Moly Studio <-> CSCA-Course Integration Contract v2 (Full Sync)

- **Version**: `2.1.0-commerce-projection` (extends `MOLY_COURSE_INTEGRATION_CONTRACT.md` v1)
- **Status**: CSCA-Course Days 1–10 Implemented (`migrations 079–084`, v2 API, split kill switches, reconciliation & readiness probes; PGlite-verified — live multi-process Staging E2E pending deploy)
- **Systems**:
  - `csca-course`: Source of truth for Record/Video courses, offerings (`video_course_profiles`), curriculum/content/files, quiz/assignment authoring & grading, watch/completion computation, personal notes, and Record device slots.
  - `moly`: Checkout/payment/refund owner, projection target for the Internal-managed list price of synchronized courses, owner of native-course pricing, and BFF for learner UI (`/khoa-hoc`, `/hoc/...`, `/my-learning`).

> **Backward Compatibility**: All v1 `/api/integrations/v1/*` and `/api/sso/*` contracts remain active and unchanged for Commerce/Entitlement/SSO flows built during Days 1–5. Contract v2 adds versioned `/api/integrations/v2/*` pull/push/delegated endpoints and additive tables/columns.

---

## 1. Source-of-Truth Ownership Matrix

Every synchronized entity or field has strictly **one** canonical owner. The non-owner stores only a read projection or references the canonical stable ID.

| Domain / Entity | Canonical Owner | Projection Target | Sync Direction | Mutable Fields Allowed on Receiver |
| --- | --- | --- | --- | --- |
| Identity link (`external_identities`) | Shared link registry (manual / Safe Link SSO) | Both | Bidirectional (email collision never auto-merged) | Local display/audit cache only |
| Synchronized course list price | `InternalManagement` (projected into `csca-course.courses.price`) | `moly.courses.price_vnd` + generated video package | `InternalManagement -> csca-course -> moly` | Moly payment execution remains local; source list price is read-only |
| Checkout, vouchers, coins, payment, refund | `moly` | `csca-course` (`external_entitlements`) | `moly -> csca-course` (v1 outbox) | Entitlement status & valid window via outbox |
| Record course catalog metadata (`title`, `description`, `thumbnail`, `subject`, `level`, `priceVnd`, `isFree`, `is_published`, `deleted_at`) | `csca-course` | `moly` (`courses` where `content_origin='csca_course'`) | `csca-course -> moly` (`course_integration_outbox` / backfill) | Featured/hot UI badges remain local; synchronized list price is read-only |
| Video course offerings (`1 course : N profiles`, `mode`, `allow_file_download`, `device_limit`) | `csca-course` (`video_course_profiles`) | `moly` (`course_profile_projections` + `external_course_mappings`) | `csca-course -> moly` | Local package binding / commercial toggle (cannot open sale without price config) |
| Curriculum (`sections`, `lessons`, `class_sessions`, `video_parts`, `theory`, `vocabulary`, `formulas`, `files`) | `csca-course` | `moly` (`course_unit_projections`, `course_file_projections`) | `csca-course -> moly` + delegated read | Read-only projection; sensitive body withheld when unit locked or user unentitled |
| Native Moly courses (`courses.content_origin = 'moly_native'`) | `moly` | None | Local only | Full Moly control; Course sync must fail-closed if targeting `moly_native` without explicit admin flag |
| Watch time, completion (`50%` + quiz), sequential unit unlock, resume position | `csca-course` | `moly` (`course_progress_projections`) | Delegated write -> Course -> event `moly` (+ read-through on resume) | None (Moly displays projected state + refetches canonical state before critical gating) |
| Quizzes, accommodations, solution embargo, assignments, grading/rubrics | `csca-course` | `moly` (`course_assessment_projections`) | Delegated mutation -> Course -> outbox event `moly` | None (Moly UI renders questions/status without exposing embargoed answers) |
| Timestamp notes (`video_course_unit_notes`) | `csca-course` | `moly` (`course_note_projections`) | Delegated CRUD (optimistic `revision`) -> Course -> event `moly` | None |
| Unit Q&A (`csca_course` vs `moly_native`) | `csca-course` (for `csca_course`), `moly` (for `moly_native`) | Opposite app cache | Delegated CRUD -> owner | None on projection |
| Record 2-device slots (`trusted_login_devices` + `moly_device_bindings`) | `csca-course` (Record slot ledger); `moly` issues own HttpOnly browser device cookie | Cross-bound via `moly_device_bindings` | Server-verified browser cookie + SSO/delegated attestation | Local device label / last seen |

---

## 2. Authentication, Headers & v2 API Surface

### 2.1 S2S Request Authentication
Retains v1 fail-closed authentication on all `/api/integrations/v2/*` endpoints:
- `Authorization: Bearer <serviceToken>`
- `X-Integration-Key: <integrationKey>`
- `X-Event-Timestamp: <iso_timestamp>` (`abs(now - ts) <= MAX_AGE_SECONDS`, default `300s`)
- `X-Correlation-ID: <uuid>`
- `Idempotency-Key: <deterministic_key>` (required on mutations / event ingest)
- `X-Signature: sha256=<hmac(hmacSecret, timestamp + "." + canonicalSigningInput)>` where:
  - For JSON `POST`/`PUT`/`DELETE` requests: `canonicalSigningInput = rawUtf8BodyBytes` (exact byte match to v1 `computeMolySignature`).
  - For bodyless `GET` requests (v2 catalog/workspace queries): `canonicalSigningInput = "${method}\n${originalUrl}"`.
- Optional (for delegated browser device proof): `X-Device-Slot-Proof` (HMAC-signed server claim containing Moly's server-minted HttpOnly device token hash, never browser-supplied `x-device-id`).

### 2.2 Course Pull / Backfill & Push Event APIs (`csca-course -> moly`)
1. `GET /api/integrations/v2/catalog/courses`
   - **Query**: `afterRevision` (BIGINT, default `0`), `afterId` (BIGINT, keyset tie-breaker), `snapshotAnchorRevision` (BIGINT, optional pin), `limit` (default `100`, max `500`), `includeTombstoned` (`true` by default for backfill correctness).
   - **Response**:
     - `courses[]`: `{ courseId, revision, slug, title, description, thumbnailUrl, category, level, subjectCode, priceVnd, isFree, isPublished, instructor, deleted, deletedAt, sourceUpdatedAt, profiles[] }`
     - `profiles[]`: `{ profileId, externalOfferingId ("profile:<id>" or managementClassId), courseId, mode ("MIRROR"|"INDEPENDENT"), managementClassId, sourceLiveClassId, status, allowFileDownload, deviceLimit, enforceTrustedDevices, badgeLabel, revision, deleted, deletedAt, sourceUpdatedAt }`
     - `pagination`: `{ nextCursor, hasMore, highWaterRevision, snapshotAnchorRevision, highWaterUpdatedAt }`
   - **Invariant**: Sweep never infers deletion from missing rows across paginated `LIMIT` pages; deletion is only signaled via explicit `deleted: true` / `deletedAt` tombstones.
2. `GET /api/integrations/v2/catalog/courses/:courseId/curriculum`
   - **Query**: `profileId` (required when course has multiple profiles), `afterRevision` (default `0`), `afterId` (default `0`), `limit`.
   - **Response**: Sections, units (`lesson` / `class_session`), `isPublicPreview`, `isPublished`, video part metadata (`videoId`, `videoType: primary|supplemental`, `durationSeconds`, `playbackStatus`, `revision`, `deletedAt`), theory metadata (`hasTheory`, `theoryRevision` — full restricted bodies are served via delegated learning endpoints ONLY after entitlement/unlock check), vocab/formula summary counts, file placement metadata (`fileId`, `fileKind`, `title`, `mimeType`, `revision`, `deletedAt`), assignment/quiz descriptors (`revision`, `deletedAt`, never answers/solutions).
3. `POST /api/integrations/v2/events/ingest` (on Moly backend, fed by Course `course_integration_outbox`)
   - Enqueues/applies into `moly_course_sync_inbox` atomically with `revision` guard and idempotent `(source_system, event_id)` / `(source_system, idempotency_key)` deduplication.

### 2.3 Moly BFF -> Course Delegated Learning APIs
All endpoints enforce live entitlement (`external_entitlements` / local grant), no active `video_course_access_revocations` row for `profileId`, valid `delegated_learning_sessions` ticket, scope match, and sequential unit unlock:
- `POST /api/integrations/v2/learning/sessions`: Mint short-lived delegated session (`ttlSeconds <= 300`, `scopes[]`, `userId`, `externalUserId`, `profileId`, `courseId`, `deviceBindingProof`, `nonce`).
- `GET /api/integrations/v2/learning/offerings/:profileId/workspace`
- `GET /api/integrations/v2/learning/offerings/:profileId/units/:unitId`
- `POST /api/integrations/v2/learning/videos/:videoId/playback-token` (`TTL <= 60s`)
- `PUT /api/integrations/v2/learning/videos/:videoId/progress`
- `GET /api/integrations/v2/learning/files/:fileId/stream` (supports `disposition=inline|attachment`, enforces `allow_file_download`, `Range`, `Cache-Control: private, no-store`)
- `GET/PUT/POST /api/integrations/v2/learning/quizzes/:quizId/...` (start/resume, save answers, submit)
- `GET/POST/PUT /api/integrations/v2/learning/assignments/:assignmentId/...` (view brief/rubric, upload/confirm submission assets, save draft/submit)
- `GET/POST/PUT/DELETE /api/integrations/v2/learning/offerings/:profileId/units/:unitId/notes` (with `expectedRevision`)
- `GET/POST/PUT /api/integrations/v2/learning/offerings/:profileId/units/:unitId/qa`

- `GET/POST/DELETE /api/integrations/v2/learning/offerings/:profileId/units/:unitId/bookmarks` (`bookmarks:rw`, with `expectedRevision`)

### 2.4 Health, Drift Reconciliation & Admin Ops v2 APIs (Days 8–10)
- `GET /api/integrations/v2/health` (S2S authenticated via `requireMolyCatalogRead`; unaffected by kill switches; exposes contract version `2.0.0`, schema version `2.0`, migration `079`–`084` table readiness booleans, split kill switches, supported scopes, and integer queue/DLQ counts — zero secrets/PII).
- `GET /api/health/integration` (unauthenticated safe deploy readiness probe on Course returning boolean readiness & counts only — zero secrets/PII).
- `GET /api/integrations/v2/reconciliation/content-state` (`courseId`, `profileId`, `limit`): canonical courses, profiles, active/tombstoned unit & file counts, and max `sync_revision`. Stays readable unless global kill switch is active.
- `GET /api/integrations/v2/reconciliation/learning-state` (`externalUserId`, `userId`, `courseId`, `profileId`, `limit`): canonical `video_watch_progress`, sequential unit completions, `quiz_attempts`, `assignment_submissions`, `notes`, `bookmarks`, and `qaThreads`. Stays readable unless global kill switch is active.
- `POST /api/integrations/v1/moly/reconciliation/snapshot`: supports optional `courseId` / `profileId` filters and `includeContent: true` (`content_drift_summary`). Stays readable unless global kill switch is active.
- Admin Ops v2 (`/api/v1/admin/integrations`):
  - `GET /ops/v2`: split kill switches, inbound inbox & outbound v2 outbox backlog/DLQ/age, `course_sync_checkpoints`, conflicts, and last sync timestamps.
  - `POST /outbox/:id/retry`: retries failed/dead-lettered/cancelled `course_integration_outbox` item (gated by `isRepairMutationsKillSwitchActive`).
  - `POST /ops/retry-subject`: per-subject repair across `{ externalUserId, userId, courseId, profileId, domain }` (gated by `isRepairMutationsKillSwitchActive`).

---

## 3. Event Envelope, Outbox/Inbox, Revision & Tombstone Rules

### 3.1 Canonical Event Envelope (v2.0)
```json
{
  "schemaVersion": "2.0",
  "eventId": "csca_course:course:42:rev:18",
  "idempotencyKey": "csca_course:course:42:rev:18",
  "eventType": "course.upserted",
  "sourceSystem": "csca-course",
  "targetSystem": "moly",
  "aggregateType": "course",
  "aggregateId": "42",
  "revision": 18,
  "sourceUpdatedAt": "2026-11-15T09:00:00.000Z",
  "occurredAt": "2026-11-15T09:00:00.120Z",
  "correlationId": "req-9b2a...",
  "deleted": false,
  "deletedAt": null,
  "payload": {}
}
```

### 3.2 Canonical Event Types
- **Catalog & Offering**: `course.upserted`, `course.published`, `course.unpublished`, `course.tombstoned`, `profile.upserted`, `profile.tombstoned`.
- **Curriculum & Files**: `curriculum.upserted`, `curriculum.tombstoned`, `unit_content.upserted`, `file.upserted`, `file.tombstoned`.
- **Learning & Assessments**: `learning.progress.updated`, `learning.unit.completed`, `learning.note.upserted`, `learning.note.tombstoned`, `assessment.attempt.updated`, `assessment.submission.graded`, `qa.thread.updated`.
- **Security & Device**: `device.binding.revoked`.

### 3.3 Delivery, Revision & Tombstone Invariants
1. **At-least-once delivery**: Sender (`course_integration_outbox`) retries using deterministic `idempotency_key` (never generating a new random key on retry!) until `2xx` ACK or moves to `dead_letter`.
2. **Strictly monotonic `revision` per aggregate**: Every projection stores `last_revision BIGINT NOT NULL` and `source_updated_at TIMESTAMPTZ NOT NULL`. Incoming events with `incoming.revision < stored.last_revision` (or `incoming.revision = stored.last_revision AND incoming.sourceUpdatedAt < stored.sourceUpdatedAt`) are marked `status = 'stale'` in `moly_course_sync_inbox` and ignored without rollback.
3. **Tombstones instead of hard deletes**: Hiding, unpublishing, or soft-deleting a course, profile, section, unit, file, or note emits an explicit `deleted = true`, `deletedAt = <ts>` event with incremented `revision`. Projection tables set `deleted_at` / `status = 'archived'` and **never** cascade-delete enrollments, orders, `lesson_progress`, grades, or audit records.
4. **High-water mark & backfill resume**: Before sweeping pages, consumer reads `course_sync_checkpoints` (`last_cursor`, `high_water_revision`), sweeps pages ordered by `(revision ASC, entity_id ASC)`, commits checkpoint per page, and replays outbox events >= `snapshotAnchorRevision` so edits occurring mid-backfill are never skipped.

---

## 4. Delegated Learning Session Specification

1. **Issuer & Audience**:
   - Issued inside Course (`delegated_learning_sessions`) upon verified S2S request from Moly BFF (`aud = "csca-course:delegated-learning"`).
   - Scoped explicitly to one `(user_id, external_user_id, video_course_profile_id, course_id)` and bound `moly_device_binding_id` (if learner role).
2. **Allowed Scopes**:
   - `workspace:read`, `video:play`, `progress:write`, `file:view`, `file:download`, `quiz:attempt`, `assignment:submit`, `notes:rw`, `bookmarks:rw`, `qa:rw`.
   - `file:download` is granted ONLY if `video_course_profiles.allow_file_download = true` at mint time AND re-checked at download/stream time.
3. **TTL, Nonce & Storage**:
   - Session `TTL <= 300` seconds; playback/file stream token `TTL <= 60` seconds.
   - `session_token_hash` (SHA-256 of 32-byte random opaque token or signed compact token `jti`), `nonce_hash` (unique per session to prevent replay), `expires_at`, `revoked_at`, `revoked_reason`.
4. **Authoritative Re-Check on Use**:
   - Sensitive operations (`video:play`, `file:view`, `file:download`, `quiz:attempt`, `assignment:submit`) always check live database state: `delegated_learning_sessions.revoked_at IS NULL`, `expires_at > NOW()`, active entitlement, `video_course_access_revocations` absent, active device binding, and sequential unit unlock. Never trust cached scopes if entitlement was revoked 1 second earlier.
5. **No Secret Exposure**:
   - Browser receives at most Moly session cookie + watermark/display metadata or BFF-proxied short-lived stream handle; `MOLY_INTEGRATION_SERVICE_TOKEN`, `HMAC_SECRET`, Bunny API key, and raw R2/S3 credentials stay strictly server-side.

---

## 5. Cross-App Device Identity & 2-Slot Enforcement Policy

> **Audit Finding Solved in Day 1**: Course uses a server-minted HttpOnly cookie `csca_trusted_device` (`trusted_login_devices.record_access_granted_at`), whereas Moly previously accepted client header `x-device-id` (`authController.js:395`). Furthermore, two different web origins cannot directly read each other's first-party cookies.

### 5.1 Policy Invariants
1. **Untrusted client device headers MUST NOT bypass limits**: Browser self-reported `x-device-id` / `localStorage` UUIDs may NEVER authorize or deduplicate paid Record slots on either backend.
2. **Server-minted HttpOnly Device Cookie on BOTH Apps**:
   - Moly issues `moly_trusted_device` (`HttpOnly`, `SameSite=Lax`, `Secure` in prod, 32-byte CSPRNG secret stored server-side ONLY as SHA-256 `device_token_hash` in `moly_trusted_browser_devices`).
   - Course keeps `csca_trusted_device` (`HttpOnly`, `SameSite=Lax`, SHA-256 `device_token_hash` in `trusted_login_devices`).
3. **Same Physical Browser Using Both Apps = 1 Device Slot (`moly_device_bindings`)**:
   - Course stores `moly_device_bindings(user_id, moly_device_token_hash -> trusted_device_id)`.
   - **Binding Path A (Same-Browser SSO / Redirect Handshake)**: During browser SSO (`moly <-> csca-course` PKCE + `browser_tx`), Moly attaches the server-side `moly_device_token_hash` of the learner's verified HttpOnly cookie inside the signed S2S SSO exchange payload; when Course sets/reads the browser's HttpOnly `csca_trusted_device` cookie on callback, Course atomically binds `(user_id, moly_device_token_hash)` to that single `trusted_device_id` (claiming 1 slot total across both apps, not 2).
   - **Binding Path B (First Visit Purely via Moly BFF Delegated Learning)**: If the learner has never visited Course directly yet, Moly BFF sends HMAC-signed `X-Device-Slot-Proof` with its verified server-side `moly_device_token_hash`. Course looks up `moly_device_bindings`:
     - If already bound to an active `trusted_login_devices.id` -> reuse that slot (touch `last_seen_at`, zero extra slot consumed!).
     - If unbound -> atomically check `COUNT(active Record slots) < device_limit` (default `2`): if under limit, create 1 `trusted_login_devices` row (`device_source = 'moly_delegated'`, `record_access_granted_at = NOW()`) and bind `(user_id, moly_device_token_hash) -> trusted_device_id`; if `>= device_limit`, increment `device_limit_attempts` (lock at `3`) and reject with `403 DEVICE_SLOT_LIMIT_REACHED`.
   - **Result**: Using Chrome normal on Moly + opening Course in Chrome normal = **1 slot**. Opening Incognito / Safari / phone (without cookie) = **2nd slot**. 3rd distinct browser = **blocked at limit 2**.
4. **Cross-App Revocation**:
   - Revoking a trusted device in Course (`trusted_login_devices.revoked_at`) revokes linked rows in `moly_device_bindings` and active `delegated_learning_sessions`, and emits `device.binding.revoked` to Moly.
   - Clearing/forging cookies on browser never resets slot count; slots are tracked server-side by active DB rows and only freed by admin/self-service slot revocation per policy.

---

## 6. Conflict Resolution Policies

1. **Timestamp Notes (`video_course_unit_notes`)**:
   - Authoritative store: Course (`video_course_unit_notes` with monotonic `revision BIGINT`).
   - Every `PUT`/`DELETE` carries `expectedRevision` (or HTTP `If-Match`). Mismatch returns `409 REVISION_CONFLICT` with the latest canonical `{ note, currentRevision }` so the UI surfaces a reload/merge prompt instead of silently clobbering newer edits.
   - Creation supports client `idempotencyKey` to prevent duplicates on offline/mobile retries.
2. **Video Resume & Progress (`video_watch_progress`)**:
   - Authoritative store: Course (`video_watch_progress` + `last_heartbeat_seq` / `source_updated_at`).
   - `watched_seconds` is strictly non-decreasing and server-clamped against wall-clock elapsed interval * max playback speed (`seek` jumps never inflate watch seconds).
   - `is_completed` latches `true` once threshold (`50%`) is reached (`is_completed = is_completed OR computed >= 50`).
   - `last_position_seconds` accepts updates only if `(clientSequence > storedSeq)` within the same delegated `sessionJti` OR `eventTimestamp >= storedUpdatedAt` across sessions, preventing stale/retrying tabs from rewinding newer progress.
3. **Quiz Attempts & Assignment Submissions**:
   - Authoritative store: Course (`quiz_attempts`, `assignment_submissions` with `video_course_profile_id`).
   - Single active attempt lock + monotonic version (`attempt_number`, `version`) inside DB transaction (`FOR UPDATE`).
   - Save/submit requires client `idempotencyKey`; duplicate/retried submission after timeout returns the already-committed submission/attempt result (never creating a 2nd attempt).
   - Submitting freezes attempt (`status = 'submitted'`); concurrent late saves from another tab fail with `409 ATTEMPT_ALREADY_SUBMITTED`.
   - Question/quiz edits during an active attempt follow snapshot rules: started attempt stays bound to its starting question snapshot/version cleanly; solution text/files remain embargoed (`SOLUTION_EMBARGOED`) until Course policy unlocks review.
4. **Legacy Local Moly Data (`content_origin = 'moly_native'`)**:
   - Pre-existing courses (`courses.content_origin` defaults to `'moly_native'`) and their sections, lessons, enrollments, progress, assignments, submissions, and native Q&A remain under Moly ownership.
   - Course->Moly sync workers enforce `WHERE content_origin = 'csca_course'` and validate `external_course_mappings`. Attempting to upsert external course data onto a `moly_native` row raises `409 LEGACY_ORIGIN_CONFLICT` in `integration_conflicts` rather than merging or overwriting local products/progress.

---

## 7. Canonical Error Codes (v2)

| HTTP | `errorCode` | Retryable | Trigger Condition |
| --- | --- | --- | --- |
| `400/422` | `VALIDATION_ERROR` | No | Malformed payload, missing cursor/profileId/revision |
| `401` | `UNAUTHENTICATED` | No | Missing/invalid S2S signature, timestamp skew, or user session |
| `401` | `DELEGATED_SESSION_EXPIRED` | Yes (remint) | Delegated session or media token past `expires_at` |
| `403` | `DELEGATED_SESSION_REVOKED` | No | Session explicitly revoked or user/device invalidated |
| `403` | `DELEGATED_SCOPE_DENIED` | No | Token lacks required scope (e.g. `file:download` when view-only) |
| `403` | `ENTITLEMENT_REQUIRED` | No | User has no active entitlement for target `courseId` / `profileId` |
| `403` | `ENTITLEMENT_REVOKED` | No | Matched `video_course_access_revocations` or revoked entitlement |
| `403` | `UNIT_LOCKED` | No | Sequential lock unmet (`!isVideoCompleted || !isQuizCompleted`) |
| `403` | `FILE_DOWNLOAD_FORBIDDEN` | No | `allow_file_download = false` on active offering profile |
| `403` | `DEVICE_SLOT_LIMIT_REACHED` | No | Exceeded Record `device_limit` (default 2) |
| `403` | `DEVICE_LIMIT_LOCKED` | No | Repeated device-limit breach reached lock threshold (`3`) |
| `403` | `UNTRUSTED_DEVICE_PROOF` | No | Missing/unverified server-minted HttpOnly device proof for paid Record slot |
| `403` | `SOLUTION_EMBARGOED` | No | Solution/correct answer requested before Course review policy opens |
| `404` | `COURSE_MAPPING_MISSING` | Configurable | Remote course/profile not mapped locally |
| `409` | `PROFILE_SCOPE_MISMATCH` | No | `unitId`/`quizId`/`fileId` does not belong to specified `profileId` |
| `409` | `LEGACY_ORIGIN_CONFLICT` | No (manual fix) | External sync attempted to mutate `content_origin = 'moly_native'` |
| `409` | `REVISION_CONFLICT` | Yes (rebase UI) | Optimistic lock failed (`expectedRevision !== currentRevision`) |
| `409` | `ATTEMPT_ALREADY_SUBMITTED` | No | Late save/resubmit against submitted quiz attempt |
| `409` | `ATTEMPT_LIMIT_REACHED` | No | Learner exhausted `max_attempts` on quiz |
| `200/202` | `STALE_EVENT_IGNORED` | No | Incoming event revision/timestamp older than stored projection |
| `503` | `SYNC_KILL_SWITCH_ACTIVE` | Yes | Targeted stream disabled by `content_sync`/`catalog_sync`, `delegated_learning`, or `repair_mutations` switch |
| `503` | `INTEGRATION_KILL_SWITCH_ACTIVE` | Yes | Global emergency brake (`MOLY_INTEGRATION_SYNC_DISABLED` / `MOLY_INTEGRATION_KILL_SWITCH`) active on v1 or reconciliation |
| `503` | `COURSE_UNAVAILABLE` | Yes | Upstream Course backend timeout/unreachable (UI must NOT fake success) |
