# Moly Studio <-> CSCA-Course Integration Runbook, Railway Env Guide & Rollout Order (Day 5)

> **Security notice**: This document intentionally lists **environment variable names only**. Never commit real tokens, HMAC secrets, passwords, JWT keys, `linkToken`, PKCE `codeVerifier`, or payment payloads to git or logs.

---

## 1. Operational Runbook

### 1.1 Emergency Kill Switch (Dừng khẩn cấp ngay lập tức)
Use immediately when detecting sync storms, corrupted course mappings, wrong entitlement propagation, or CSCA-Course outage:

- **On CSCA-Course (Railway Backend + Worker Services)**:
  - Set `MOLY_INTEGRATION_SYNC_DISABLED=true` (or `MOLY_INTEGRATION_KILL_SWITCH=true`)
  - Effect:
    - `processNextMolyInboxJob` & `processAvailableMolyInboxJobs` stop claiming jobs (`return null` / `[]`).
    - Inbound signed S2S mutations (`/users/provision`, `/entitlements/grant`, `/entitlements/revoke`), `/ownership/query`, `/moly/reconciliation/snapshot`, and manual inbox retry return retryable `503 INTEGRATION_KILL_SWITCH_ACTIVE`.
    - Local CSCA-Course learning, LMS management sync, and existing sessions keep functioning safely without dropping inbox state.
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

### 1.6 Reconciliation & Audit Trail
- Snapshot endpoint on CSCA-Course: `POST /api/integrations/v1/moly/reconciliation/snapshot` (HMAC + bearer + timestamp protected via `verifyRead`).
- Trigger & inspect runs from Moly `/admin/course-integration` (`POST /api/admin/course-integrations/reconcile`).
- Audit persistence lives in Moly `integration_reconciliation_runs` & `integration_reconciliation_actions`, plus Course `audit_logs` / structured JSON logs with shared `correlation_id`.

### 1.7 Rollback An Toàn
1. Enable Kill Switch on both services (`MOLY_INTEGRATION_SYNC_DISABLED=true`, `COURSE_INTEGRATION_SYNC_DISABLED=true`).
2. Roll back Railway deployments to previous release.
3. Keep all database migrations intact in production (all migrations `079`–`082` on Course and `076`–`080` on Moly are strictly additive and safe to keep while flags are disabled).

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
| `MOLY_INTEGRATION_SYNC_DISABLED` | Emergency | Set `false` normally; `true` halts worker & S2S integration immediately |

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
2. **Run additive migrations** on Staging: Course (`079`–`082`) and Moly (`076`–`080`).
3. **Deploy CSCA-Course (web + worker) first**, then **Moly Studio (backend + frontend)** with `COURSE_INTEGRATION_WORKER_ENABLED=false` and `CSCA_VIDEO_COMMERCE_SALES_ENABLED=false`.
4. **Verify S2S health** via Moly Reconciliation Dry-Run (`dryRun: true`) and create manual 1-1 `external_course_mappings` on both apps.
5. **Enable worker** (`COURSE_INTEGRATION_WORKER_ENABLED=true`) and execute full staging smoke suite (purchase -> grant -> SSO `/hoc` -> safe link -> refund/revoke -> kill switch drill -> redacted log check).
6. **Promote to Production** in identical order: additive migrations -> Course deploy -> Moly deploy (flags `false`) -> production manual mappings -> Dry-Run check -> enable worker -> enable sales -> monitor queues & metrics closely.
