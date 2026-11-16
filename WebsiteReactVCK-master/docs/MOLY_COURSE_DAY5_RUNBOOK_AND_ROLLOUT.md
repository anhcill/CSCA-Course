# Moly Studio <-> CSCA-Course Integration Runbook, Railway Env Guide & Rollout Order (Days 5–10)

> **Security notice**: This document intentionally lists **environment variable names only**. Never commit real tokens, HMAC secrets, passwords, JWT keys, `linkToken`, PKCE `codeVerifier`, or payment payloads to git or logs.
> **Verification status notice**: CSCA-Course backend services, routers, migrations (`079`–`084`), and PGlite tests are implemented through Day 10; live multi-process Docker PostgreSQL 2-connection tests and deployed Staging E2E between CSCA-Course and Moly Studio remain pending Staging cutover.

---

## 1. Operational Runbook

### 1.1 Emergency & Split Kill Switches (Dừng khẩn cấp / Cô lập từng luồng)
Use immediately when detecting sync storms, corrupted course mappings, wrong entitlement propagation, or CSCA-Course outage:

- **CSCA-Course Global Emergency Brake (`WebsiteReactVCK-master`)**:
  - Set `MOLY_INTEGRATION_SYNC_DISABLED=true` (or `MOLY_INTEGRATION_KILL_SWITCH=true`)
  - Effect:
    - Halts `processNextMolyInboxJob` & `processAvailableMolyInboxJobs`, v1 inbound mutations, `/ownership/query`, v1/v2 reconciliation reads (`503 INTEGRATION_KILL_SWITCH_ACTIVE`), catalog/curriculum sync, delegated learning, and repair mutations (`503 SYNC_KILL_SWITCH_ACTIVE` / `INTEGRATION_KILL_SWITCH_ACTIVE`).
    - `GET /api/integrations/v2/health` and `GET /api/health/integration` stay reachable and report `killSwitches` accurately so ops checks still work.
- **CSCA-Course Granular Split Kill Switches (Independent isolation)**:
  - **Content / Catalog Sync**: `COURSE_CONTENT_SYNC_DISABLED=true` (or `COURSE_CATALOG_SYNC_DISABLED=true` / `MOLY_CATALOG_SYNC_DISABLED=true`) — pauses catalog/curriculum exports & outbox delivery (`503 SYNC_KILL_SWITCH_ACTIVE`) while keeping delegated learning and diagnostic reconciliation reads available.
  - **Delegated Learning**: `DELEGATED_LEARNING_KILL_SWITCH=true` (or `MOLY_DELEGATED_LEARNING_DISABLED=true` / `MOLY_DELEGATED_LEARNING_KILL_SWITCH=true`) — pauses delegated session minting and delegated workspace/playback/assessment/note/QA endpoints (`503 SYNC_KILL_SWITCH_ACTIVE`) without blocking catalog sync or reconciliation diagnostics.
  - **Repair & Write Mutations**: `COURSE_REPAIR_MUTATIONS_DISABLED=true` (or `MOLY_REPAIR_MUTATIONS_DISABLED=true` / `REPAIR_MUTATIONS_KILL_SWITCH=true`) — blocks `inbox-ops/:id/retry`, `outbox/:id/retry`, `ops/retry-subject`, `conflicts/:id/resolve`, `identities/link`, `course-mappings*` mutations, and delegated learning write mutations (progress write, quiz start/save/submit, assignment upload/submit, note/bookmark/QA writes) while keeping `GET` delegated reads + `GET/POST` diagnostic dry-run snapshots (`/reconciliation/snapshot`, `/reconciliation/content-state`, `/reconciliation/learning-state`) operational!
- **On Moly Studio (Railway Backend Service)**:
  - Set `COURSE_INTEGRATION_SYNC_DISABLED=true` (or `COURSE_INTEGRATION_KILL_SWITCH=true`)
  - Optionally set `COURSE_INTEGRATION_WORKER_ENABLED=false`
  - Effect:
    - `startOutboxWorker`, `dispatchNextOutboxJob`, `reconcileSentOutboxEvents`, `processAvailableOutboxJobs`, `kickSync`, outbound S2S client, manual outbox retry, ownership projection sync, and reconciliation immediately halt / return `503 INTEGRATION_KILL_SWITCH_ACTIVE`.

### 1.2 Retry Failed / Dead-Letter Events
1. **Check correlation & error code** first:
   - On CSCA-Course UI: `/admin/sync` -> **Moly Studio Integration Inbox & Conflicts** panel (or `GET /api/v1/admin/integrations/inbox-ops`).
   - On Moly UI: `/admin/course-integration` -> **Hàng đợi Outbox** tab (or `GET /api/admin/course-integrations/ops/overview`).
2. **Fix root cause before retrying**:
   - `COURSE_MAPPING_MISSING` -> add explicit manual course mapping first (Section 1.3).
   - `IDENTITY_*` conflict -> resolve identity conflict first (Section 1.4); Moly refuses `POST /outbox/:id/retry` while an `IDENTITY_%` conflict stays `open`.
   - Transient `5xx` / timeout -> retry once peer connectivity recovers.
3. **Trigger retry**:
   - CSCA-Course: `POST /api/v1/admin/integrations/inbox-ops/:id/retry` or click **"Thử lại"**.
   - Moly: `POST /api/admin/course-integrations/outbox/:id/retry` or click **"Thử lại"**.

### 1.3 Map Khóa Học Thủ Công (Không tự match theo tên/slug)
Auto-matching by title/slug is blocked by design (`AUTO_MAPPING_FORBIDDEN`).
1. Confirm exact Moly `courses.id`, CSCA-Course `courses.id`, and exact shared `externalCourseId` (`moly:course:<id>`).
2. Create manual active mappings on **CSCA-Course** (`POST /api/v1/admin/integrations/course-mappings`) AND **Moly Studio** (`POST /api/admin/course-integrations/course-mappings`).
3. Re-run Reconciliation Dry-Run -> Auto-Repair from Moly `/admin/course-integration`.

### 1.4 Xử lý Xung Đột Danh Tính (`integration_conflicts`)
Reconciliation **never** auto-merges or auto-links conflicting accounts.
1. Inspect `integration_conflicts` via CSCA-Course `/admin/sync` (`GET /api/v1/admin/integrations/conflicts?sourceSystem=moly`) or Moly `/admin/course-integration`.
2. Never link privileged accounts (`admin`, `teacher`, `creator`, `super_admin`, `staff`, or `management_staff_source_id IS NOT NULL`) to external student identities (`PRIVILEGED_ROLE_COLLISION`).
3. Once verified out-of-band:
   - Same student -> `POST /api/v1/admin/integrations/conflicts/:id/resolve` with `{ "action": "link_existing", "targetUserId": <id>, "resolutionNote": "..." }`.
   - False alarm -> `{ "action": "dismiss", "resolutionNote": "..." }`.

### 1.5 Revoke Quyền Thủ Công
- Moly payment/grant revocations emit `entitlement.revoked` with strictly monotonic `source_updated_at`.
- Course profile-level revocation uses `video_course_access_revocations`; `queryCourseOwnershipForMoly` and `buildReconciliationSnapshotForMoly` report effective access accurately (`effective_active=false` when revoked).
- Reconciliation repairs `local_revoked_remote_active` deterministically on Moly without touching sibling courses or management grants.

### 1.6 Reconciliation, Health Probes & Admin Ops v2
- **Health & Contract Readiness Probes**:
  - Public-safe readiness probe: `GET /api/health/integration` (exposes contract version `2.0.0`, schema version `2.0`, migration `079`–`084` table booleans, split kill-switch flags, supported scopes, and integer queue/DLQ counts — zero secrets or PII).
  - Signed S2S health probe: `GET /api/integrations/v2/health` (HMAC + Bearer via `requireMolyCatalogRead`, unaffected by kill switches).
- **Split Drift Snapshots**:
  - Entitlements + optional content drift (`includeContent: true`): `POST /api/integrations/v1/moly/reconciliation/snapshot` (supports `courseId`, `profileId`, `external_user_id`, `external_course_id`).
  - Content drift state: `GET /api/integrations/v2/reconciliation/content-state` (`courseId`, `profileId`, `limit`).
  - Progress/learning drift state: `GET /api/integrations/v2/reconciliation/learning-state` (`externalUserId`, `userId`, `courseId`, `profileId`, `limit`).
- **Admin Ops v2 & Per-Subject Repair (`/api/v1/admin/integrations`)**:
  - `GET /ops/v2`: returns split kill switches, `integration_inbox` & `course_integration_outbox` backlog/DLQ/age, `course_sync_checkpoints`, `integration_conflicts`, and last sync timestamps.
  - `POST /outbox/:id/retry`: retries a `failed` / `dead_letter` / `cancelled` `course_integration_outbox` row (blocked by `COURSE_REPAIR_MUTATIONS_DISABLED`).
  - `POST /ops/retry-subject`: per-subject repair across `{ externalUserId, userId, courseId, profileId, domain: 'all'|'content'|'progress'|'entitlement' }` (blocked by `COURSE_REPAIR_MUTATIONS_DISABLED`).
- Trigger & inspect runs from Moly `/admin/course-integration` (`POST /api/admin/course-integrations/reconcile`).
- Audit persistence lives in Moly `integration_reconciliation_runs` & `integration_reconciliation_actions`, plus Course `audit_logs` / structured JSON logs with shared `correlation_id`.

### 1.7 Rollback An Toàn
1. Enable Kill Switch on both services (`MOLY_INTEGRATION_SYNC_DISABLED=true`, `COURSE_INTEGRATION_SYNC_DISABLED=true`), or isolate only the affected subsystem (`COURSE_REPAIR_MUTATIONS_DISABLED=true`, `COURSE_CATALOG_SYNC_DISABLED=true`, `DELEGATED_LEARNING_KILL_SWITCH=true`).
2. Roll back Railway deployments to previous release.
3. Keep all database migrations intact in production (all migrations `079`–`084` on Course and `076`–`080`+ on Moly are strictly additive and safe to keep while flags are disabled).

---

## 2. Railway Environment Variables Required

### 2.1 CSCA-Course Backend & Worker (`WebsiteReactVCK-master`)
| Variable Name | Required | Purpose & Safe Default |
|---|---|---|
| `MOLY_INTEGRATION_SERVICE_TOKEN` | Yes (Secret) | Verifies inbound Moly -> Course `/api/integrations/v1` bearer auth |
| `MOLY_INTEGRATION_KEY` | Yes | Matches Moly `COURSE_LMS_INTEGRATION_KEY` |
| `MOLY_INTEGRATION_HMAC_SECRET` | Yes (Secret) | Matches Moly `COURSE_LMS_HMAC_SECRET` |
| `MOLY_INTEGRATION_MAX_AGE_SECONDS` | Optional | Replay timestamp window (`300`) |
| `MOLY_API_BASE_URL` | Yes | Moly Studio backend URL (for outbound SSO exchange & bind-identity) |
| `MOLY_WEB_BASE_URL` | Yes | Moly Studio frontend URL for SSO redirect targets |
| `MOLY_OUTBOUND_SERVICE_TOKEN` | Yes (Secret) | Matches Moly `COURSE_INBOUND_SERVICE_TOKEN` |
| `MOLY_OUTBOUND_INTEGRATION_KEY` | Yes | Matches Moly `COURSE_INBOUND_INTEGRATION_KEY` |
| `MOLY_OUTBOUND_HMAC_SECRET` | Yes (Secret) | Matches Moly `COURSE_INBOUND_HMAC_SECRET` |
| `MOLY_OUTBOUND_REQUEST_TIMEOUT_MS` | Optional | HTTP timeout ms (`10000`) |
| `MOLY_OUTBOUND_MAX_TRANSPORT_ATTEMPTS` | Optional | Transport retry cap (`2`) |
| `MOLY_SSO_TTL_SECONDS` | Optional | Short-lived SSO ticket TTL (`90`) |
| `COURSE_CATALOG_SYNC_WORKER_ENABLED` | Gated | Keep `false` until migrations `079`–`084` & mappings are verified, then `true` |
| `MOLY_INTEGRATION_SYNC_DISABLED` | Emergency | Global kill switch (`false` normally; `true` halts worker & all S2S integration immediately) |
| `MOLY_INTEGRATION_KILL_SWITCH` | Emergency | Alias for `MOLY_INTEGRATION_SYNC_DISABLED` (`false`) |
| `COURSE_CONTENT_SYNC_DISABLED` | Split Switch | Pauses v2 content/catalog/curriculum sync (`false`); aliases `COURSE_CATALOG_SYNC_DISABLED`, `MOLY_CATALOG_SYNC_DISABLED` |
| `COURSE_CATALOG_SYNC_DISABLED` | Split Switch | Alias for `COURSE_CONTENT_SYNC_DISABLED` (`false`) |
| `DELEGATED_LEARNING_KILL_SWITCH` | Split Switch | Pauses delegated learning endpoints (`false`); aliases `MOLY_DELEGATED_LEARNING_DISABLED`, `MOLY_DELEGATED_LEARNING_KILL_SWITCH` |
| `MOLY_DELEGATED_LEARNING_KILL_SWITCH` | Split Switch | Alias for `DELEGATED_LEARNING_KILL_SWITCH` (`false`) |
| `COURSE_REPAIR_MUTATIONS_DISABLED` | Split Switch | Blocks manual repair/retry/conflict/mapping/delegated-write mutations (`false`) while preserving diagnostic & GET reads |

### 2.2 Moly Studio Backend (`CSCA-MOLI.STUDIO`)
| Variable Name | Required | Purpose & Safe Default |
|---|---|---|
| `CSCA_VIDEO_COMMERCE_ENABLED` | Yes | Enables video commerce module (`true`) |
| `CSCA_VIDEO_COMMERCE_SALES_ENABLED` | Gated | Keep `false` during dark launch until staging E2E & mappings succeed |
| `COURSE_LMS_BASE_URL` | Yes | CSCA-Course backend base URL |
| `COURSE_LMS_SERVICE_TOKEN` | Yes (Secret) | Matches Course `MOLY_INTEGRATION_SERVICE_TOKEN` |
| `COURSE_LMS_INTEGRATION_KEY` | Yes | Matches Course `MOLY_INTEGRATION_KEY` |
| `COURSE_LMS_HMAC_SECRET` | Yes (Secret) | Matches Course `MOLY_INTEGRATION_HMAC_SECRET` |
| `COURSE_LMS_REQUEST_TIMEOUT_MS` | Optional | HTTP timeout ms (`10000`) |
| `COURSE_WEB_BASE_URL` | Yes | CSCA-Course frontend URL for SSO launch redirects |
| `COURSE_SSO_TTL_SECONDS` | Optional | SSO ticket TTL (`90`) |
| `COURSE_INBOUND_SERVICE_TOKEN` | Yes (Secret) | Matches Course `MOLY_OUTBOUND_SERVICE_TOKEN` |
| `COURSE_INBOUND_INTEGRATION_KEY` | Yes | Matches Course `MOLY_OUTBOUND_INTEGRATION_KEY` |
| `COURSE_INBOUND_HMAC_SECRET` | Yes (Secret) | Matches Course `MOLY_OUTBOUND_HMAC_SECRET` |
| `COURSE_INBOUND_MAX_AGE_SECONDS` | Optional | Replay timestamp window (`300`) |
| `COURSE_INTEGRATION_WORKER_ENABLED` | Gated | Keep `false` until migrations & mappings applied, then `true` |
| `COURSE_INTEGRATION_WORKER_INTERVAL_MS` | Optional | Poll interval (`5000`) |
| `COURSE_INTEGRATION_RECONCILE_INTERVAL_MS` | Optional | Scheduled reconcile interval (`300000`) |
| `COURSE_INTEGRATION_RECONCILE_AUTO_REPAIR` | Optional | Keep `false` initially (`true` only after dry-run supervision) |
| `COURSE_INTEGRATION_SYNC_DISABLED` | Emergency | Set `false` normally; `true` halts worker, client & reconciliation immediately |

---

## 3. Staging -> Production Deployment Sequence

1. **Provision isolated secrets** per environment (Staging vs Production). Never share secrets between environments or with `JWT_SECRET`.
2. **Run additive migrations** on Staging in exact order: Course (`079` -> `080` -> `081` -> `082` -> `083` -> `084` via `run_sql.js`) and Moly (`076`+).
3. **Deploy CSCA-Course (web + worker) first** with `COURSE_CATALOG_SYNC_WORKER_ENABLED=false`, then verify `GET /api/health/integration` reports `ready: true`, `contractVersion: "2.0.0"`, and `migrations["079_foundation"]`..`migrations["084_day5_7_parity"]` all `true`.
4. **Deploy Moly Studio (backend + frontend)** with `COURSE_INTEGRATION_WORKER_ENABLED=false` and `CSCA_VIDEO_COMMERCE_SALES_ENABLED=false`.
5. **Verify S2S health & dry-run reconciliation**: `GET /api/integrations/v2/health`, `GET /api/integrations/v2/reconciliation/content-state`, `GET /api/integrations/v2/reconciliation/learning-state`, and Moly Reconciliation Dry-Run (`dryRun: true`) + manual 1-1 `external_course_mappings` on both apps.
6. **Enable workers** (`COURSE_CATALOG_SYNC_WORKER_ENABLED=true`, `COURSE_INTEGRATION_WORKER_ENABLED=true`) and execute the full live Staging E2E smoke & concurrency verification (2-conn PG advisory-lock check, purchase -> grant -> SSO `/hoc` -> safe link -> delegated learning -> refund/revoke -> split kill switch drill -> redacted log check).
7. **Promote to Production** in identical order: additive migrations (`079`–`084`) -> Course deploy + `/api/health/integration` -> Moly deploy (flags `false`) -> production manual mappings -> Dry-Run check -> enable workers -> enable sales -> monitor `GET /api/v1/admin/integrations/ops/v2`.
