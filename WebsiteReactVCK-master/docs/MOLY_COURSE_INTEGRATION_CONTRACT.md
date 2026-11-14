# Moly Studio ↔ CSCA-Course Integration Contract (v1)

Status: **Day 1 Foundation Contract** (Additive schema, canonical identifiers, status lifecycle, manual course mapping, and JSON payloads).

## 1. Purpose & Isolation Guarantees

This document defines the canonical server-to-server integration contract between **Moly Studio** (`source_system = "moly"`) and **CSCA-Course LMS** (`source_system = "csca-course"`), coexisting safely alongside existing **InternalManagement** (`source_system = "internal-management"`).

Mandatory invariants:

1. **No shared database, no shared passwords, no shared JWT secrets or session cookies.** All synchronization occurs over signed HTTPS APIs and durable inbox/outbox queues.
2. **Email is NEVER the canonical identity.** Canonical identity is strictly `(source_system, external_user_id)`. Email may only be provided as an informational `email_hint` for conservative auto-link checks (with mandatory manual conflict quarantine on collisions or privileged roles).
3. **Namespaced External IDs.** Cross-system identifiers MUST be explicitly namespaced by their origin system (for example `moly:541`, `csca-course:42`, `moly:course:12`, `moly:grant:tx_9081:course_12`).
4. **Coexistence with InternalManagement.** Existing columns (`users.external_student_id`, `courses.external_course_id`, `lms_access_grants` management flows) MUST NOT be overwritten or repurposed for `moly` or `csca-course` integrations.
5. **No Automatic Course Mapping.** Courses are mapped strictly via explicit admin/manual entries in `external_course_mappings`. Systems MUST NOT auto-match courses by `title`, `slug`, `external_key`, or fuzzy string similarity. Missing mappings fail explicitly with `COURSE_MAPPING_MISSING`.
6. **Monotonic Stale-Event Protection.** Events carrying an older `source_updated_at` than the currently persisted state MUST NOT overwrite newer state and are recorded as `stale`.
7. **Audit & Entitlement Preservation (`ON DELETE RESTRICT` / `SET NULL`).** Deletion of users or catalog records MUST NOT cascade-delete purchased/external entitlements, identities, inbox/outbox ledgers, or conflict audit logs.

---

## 2. Canonical Field Definitions

| Field | Type & Bounds | Required | Description |
|---|---|---|---|
| `source_system` | `string` (`"moly"` \| `"csca-course"` \| `"internal-management"`) | Always | Authoritative system that owns and emitted the identifier, state, or event. |
| `external_user_id` | `string` (`1..128`, trimmed, non-empty) | Identity / Entitlement events | Canonical opaque user ID scoped to `source_system`, always namespaced (e.g. `"moly:541"`). Uniquely keyed by `(source_system, external_user_id)`. Never email. |
| `external_course_id` | `string` (`1..128`, trimmed, non-empty) | Mapping / Entitlement / Query | Canonical opaque offering/course ID scoped to `source_system` (e.g. `"moly:course:12"`, `"csca-course:profile:8"`). Uniquely keyed by `(source_system, external_course_id)` in `external_course_mappings`. |
| `external_grant_id` | `string` (`1..128`, trimmed, non-empty) | Entitlement lifecycle | Canonical opaque entitlement grant ID scoped to `source_system` (e.g. `"moly:grant:tx_9081:course_12"`). Uniquely keyed by `(source_system, external_grant_id)` in `external_entitlements`. |
| `event_id` | `string` (`1..128`, trimmed, non-empty) | Event envelope | Globally unique ID of an individual domain event emitted by the source outbox (e.g. `"evt_01JCC0M9X2..."`). Deduplicated uniquely via `(source_system, event_id)` in `integration_inbox`. |
| `idempotency_key` | `string` (`1..180`, trimmed, non-empty) | Mutating APIs / Outbox | Caller-stable retry key preserved across HTTP retries of the identical command. Replaying the same `idempotency_key` with a different SHA-256 `payload_hash` returns `409 IDEMPOTENCY_KEY_CONFLICT`. |
| `correlation_id` | `string` (`1..128`, trimmed, non-empty) | End-to-end tracing | Trace ID propagated across payment/action → `integration_outbox` → `X-Correlation-ID` → `integration_inbox` → `external_entitlements` → `audit_events` / `integration_conflicts`. |
| `source_updated_at` | `string` (ISO-8601 UTC `TIMESTAMPTZ`) | Stateful mutations | Authoritative UTC timestamp when the entity or entitlement last changed in `source_system`. Used to reject/ignore out-of-order stale events (`incoming < stored`). |

---

## 3. Canonical Status Lifecycle

The four canonical entitlement and identity states are strictly bounded to:

- **`active`**: Entity/entitlement is currently valid and grants learning/ownership rights (subject to `valid_from <= NOW()` and `valid_until IS NULL OR valid_until > NOW()`).
- **`revoked`**: Access permanently terminated due to refund, chargeback cancellation, or administrative revocation (`revoked_at` is required). Never re-enabled by login, retry, or older `source_updated_at` events; restoration requires an explicit newer grant/reinstatement with strictly newer `source_updated_at`.
- **`expired`**: Time-limited validity window ended (`valid_until <= NOW()` or explicit expiry event from source). Access is denied while full entitlement history stays preserved.
- **`suspended`**: Temporarily paused (for example administrative hold, risk review, or account suspension). Access is blocked until explicitly restored to `active` with a strictly newer `source_updated_at`.

### Operational Queue & Conflict Statuses

- **`external_course_mappings.status`**: `active` | `inactive` | `archived` (only `active` mappings resolve; missing or non-active mappings yield `COURSE_MAPPING_MISSING`).
- **`integration_inbox.status`**: `pending` | `processing` | `processed` | `failed` | `dead_letter` | `stale` | `ignored`.
- **`integration_outbox.status`**: `pending` | `processing` | `sent` | `failed` | `dead_letter` | `cancelled`.
- **`integration_conflicts.status`**: `open` | `in_review` | `resolved` | `dismissed` | `ignored`.

---

## 4. Transport Security Headers & Error Convention

All server-to-server integration endpoints use:

```text
Authorization: Bearer <SERVICE_TOKEN>
X-Integration-Key: <INTEGRATION_KEY>
X-Event-Timestamp: 2026-11-14T10:00:00.000Z
X-Correlation-ID: corr_01JCC0M9X2A1
Idempotency-Key: idem_01JCC0M9X2A1
X-Signature: sha256=<HMAC_SHA256(timestamp + "." + rawRequestBody)>
Content-Type: application/json
```

Rules:
- HMAC signatures MUST be calculated over exact raw UTF-8 request body bytes prefixed by `<X-Event-Timestamp>.`.
- Secret comparisons MUST use constant-time equality (`crypto.timingSafeEqual`).
- Timestamps outside the configured `MAX_AGE_SECONDS` window (default `300` seconds) are rejected.

Standard error shape (`errorCode` in CSCA-Course responses, `code` in Moly Studio course API responses; both carry identical canonical machine codes):

```json
{
  "success": false,
  "errorCode": "COURSE_MAPPING_MISSING",
  "message": "No active manual course mapping found for (moly, moly:course:999).",
  "correlation_id": "corr_01JCC0M9X2A1"
}
```

---

## 5. JSON Contract Samples

### 5.1 Provision / Link User

Used when Moly provisions or links a learner identity on CSCA-Course (or vice versa) prior to/alongside granting course access.

#### Request (`POST /api/integrations/v1/users/provision`)

```json
{
  "event_id": "evt_01JCC10USER541",
  "idempotency_key": "moly:user.provisioned:moly:541:v1",
  "correlation_id": "corr_01JCC10A9001",
  "source_system": "moly",
  "external_user_id": "moly:541",
  "source_updated_at": "2026-11-14T10:00:00.000Z",
  "account_status": "active",
  "profile": {
    "full_name": "Nguyen Minh Anh",
    "email_hint": "minhanh@example.com",
    "email_verified": true
  },
  "metadata": {
    "trigger": "course_purchase",
    "moly_role": "student"
  }
}
```

## Codex Day 1 Review Addendum

The following rules supersede ambiguous examples above:

- Grant IDs permanently identify one external user and offering. A grant cannot be moved to another local user or course, including after an administrator changes a catalog mapping.
- The ingestion helper accepts camelCase internal arguments. HTTP handlers must explicitly translate the snake_case wire contract and derive local user IDs from verified external identities, never trust a caller-supplied local ID.
- Both event ID and idempotency key deduplicate ingestion. Conflicting payloads return 409. A retry is recognized before current catalog availability is checked.
- Reinstatement requires a strictly newer source timestamp. A distinct event at an equal timestamp is recorded as stale; it cannot reopen a revoked grant. Sources must issue strictly increasing timestamps per grant.
- Provision/link identity before calling the entitlement helper. New active grants require an active external identity with the same local user. Email-only matching is not sufficient proof of account ownership.
- Existing grants can be revoked, suspended or expired using their stored destination after a course mapping is disabled. Active renewal still requires a valid matching course mapping.
- Lifecycle events passed to the helper are complete snapshots, including valid_from and valid_until. The revoke HTTP handler must load missing validity fields from the existing grant or require the complete snapshot. A revoke arriving before its grant must retain a tombstone; never silently discard it.
- The Day 1 helper records and applies one event atomically. It is NOT the durable asynchronous HTTP receiver. Day 2 must persist ingress before processing and retain failures/conflicts for retry and operator review.
- Workers must recover expired processing leases; indexes for that recovery are included.
- Both manual mapping CLI scripts require COURSE_INTEGRATION_DATABASE_URL explicitly and close their own database pool.
- Updating external entitlements must not overwrite the single Management-owned lms_access_grants row for the same user/course. Day 2 must resolve effective access from independent grant sources and preserve a valid alternative grant when one source is revoked.
- Mirroring an inherited grant must not create a new authoritative grant or cause an event echo loop. Preserve origin identity; only the original authority changes the grant lifecycle.
- SSO authentication and course ownership are separate decisions. A successful login does not itself grant course, VIP, staff or admin access.
- The SSO design in this MVP opens the learning workspace on CSCA-Course. Rendering inherited lessons directly inside Moly remains a separate content/API implementation.
- Real production course pairs are not verified. Existing Moly courses were drafts/demos in the initial audit; do not seed them as equivalents merely because both databases have two courses.
- Production deployment is not part of this review. Validate migrations and concurrent delivery on an isolated PostgreSQL staging instance before rollout.

#### Response (`200 OK` / `202 Accepted`)

```json
{
  "success": true,
  "correlation_id": "corr_01JCC10A9001",
  "data": {
    "event_id": "evt_01JCC10USER541",
    "source_system": "moly",
    "external_user_id": "moly:541",
    "local_user_id": 108,
    "identity_id": 14,
    "status": "active",
    "link_action": "linked_existing",
    "source_updated_at": "2026-11-14T10:00:00.000Z"
  }
}
```

---

### 5.2 Grant Entitlement

Issued when an order/payment succeeds on Moly (to unlock a mapped CSCA-Course course/profile) or when CSCA-Course publishes an entitlement change back to Moly.

#### Request (`POST /api/integrations/v1/entitlements/grant`)

```json
{
  "event_id": "evt_01JCC11GRANT9081",
  "idempotency_key": "moly:entitlement.granted:moly:grant:tx_9081:course_12:v1",
  "correlation_id": "corr_01JCC10A9001",
  "source_system": "moly",
  "external_user_id": "moly:541",
  "external_course_id": "moly:course:12",
  "external_grant_id": "moly:grant:tx_9081:course_12",
  "status": "active",
  "valid_from": "2026-11-14T10:01:00.000Z",
  "valid_until": "2027-05-14T10:01:00.000Z",
  "source_updated_at": "2026-11-14T10:01:00.000Z",
  "metadata": {
    "order_ref": "VP-20261114-9081",
    "payment_method": "sepay_qr",
    "duration_days": 180
  }
}
```

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "correlation_id": "corr_01JCC10A9001",
  "data": {
    "event_id": "evt_01JCC11GRANT9081",
    "source_system": "moly",
    "external_grant_id": "moly:grant:tx_9081:course_12",
    "external_user_id": "moly:541",
    "external_course_id": "moly:course:12",
    "local_user_id": 108,
    "local_course_id": 24,
    "status": "active",
    "valid_from": "2026-11-14T10:01:00.000Z",
    "valid_until": "2027-05-14T10:01:00.000Z",
    "source_updated_at": "2026-11-14T10:01:00.000Z",
    "applied": true
  }
}
```

#### Missing Mapping Error Response (`422 Unprocessable Entity`)

```json
{
  "success": false,
  "errorCode": "COURSE_MAPPING_MISSING",
  "message": "No active manual course mapping found for (moly, moly:course:999).",
  "correlation_id": "corr_01JCC10A9001",
  "details": {
    "source_system": "moly",
    "external_course_id": "moly:course:999"
  }
}
```

---

### 5.3 Revoke Entitlement

Issued on refund, manual admin revoke, or expiry/suspension enforcement for a specific `(source_system, external_grant_id)`.

#### Request (`POST /api/integrations/v1/entitlements/revoke`)

```json
{
  "event_id": "evt_01JCC12REVOKE9081",
  "idempotency_key": "moly:entitlement.revoked:moly:grant:tx_9081:course_12:v2",
  "correlation_id": "corr_01JCC12B2004",
  "source_system": "moly",
  "external_user_id": "moly:541",
  "external_course_id": "moly:course:12",
  "external_grant_id": "moly:grant:tx_9081:course_12",
  "status": "revoked",
  "revoked_at": "2026-11-14T12:30:00.000Z",
  "reason": "payment_refunded",
  "source_updated_at": "2026-11-14T12:30:00.000Z",
  "metadata": {
    "refund_reference": "RF-9081",
    "actor": "admin:3"
  }
}
```

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "correlation_id": "corr_01JCC12B2004",
  "data": {
    "event_id": "evt_01JCC12REVOKE9081",
    "source_system": "moly",
    "external_grant_id": "moly:grant:tx_9081:course_12",
    "status": "revoked",
    "revoked_at": "2026-11-14T12:30:00.000Z",
    "source_updated_at": "2026-11-14T12:30:00.000Z",
    "applied": true
  }
}
```

#### Stale Event Ignored Response (`200 OK`, Out-of-order Protection)

When `incoming.source_updated_at < stored.source_updated_at`, existing entitlement state is untouched and the inbox entry is marked `stale`:

```json
{
  "success": true,
  "correlation_id": "corr_01JCC12B2004",
  "data": {
    "event_id": "evt_01JCC10OLDGRANT",
    "source_system": "moly",
    "external_grant_id": "moly:grant:tx_9081:course_12",
    "inbox_status": "stale",
    "current_status": "revoked",
    "current_source_updated_at": "2026-11-14T12:30:00.000Z",
    "applied": false
  }
}
```

---

### 5.4 Course Ownership Query

Used by Moly before checkout/catalog render to check whether a user already owns mapped courses on CSCA-Course (preventing duplicate purchase), and symmetrically by CSCA-Course for reconciliation.

#### Request (`POST /api/integrations/v1/ownership/query`)

```json
{
  "correlation_id": "corr_01JCC15Q771",
  "source_system": "csca-course",
  "subject": {
    "source_system": "moly",
    "external_user_id": "moly:541"
  },
  "external_course_ids": [
    "csca-course:course:24",
    "csca-course:course:25"
  ]
}
```

#### Response (`200 OK`)

```json
{
  "success": true,
  "correlation_id": "corr_01JCC15Q771",
  "data": {
    "identity": {
      "source_system": "moly",
      "external_user_id": "moly:541",
      "local_user_id": 108,
      "status": "active"
    },
    "items": [
      {
        "external_course_id": "csca-course:course:24",
        "local_course_id": 24,
        "external_grant_id": "csca-course:grant:lms_441",
        "owned": true,
        "status": "active",
        "valid_from": "2026-10-01T00:00:00.000Z",
        "valid_until": "2027-04-01T00:00:00.000Z",
        "source_updated_at": "2026-10-01T00:00:00.000Z"
      },
      {
        "external_course_id": "csca-course:course:25",
        "local_course_id": 25,
        "external_grant_id": null,
        "owned": false,
        "status": null,
        "valid_from": null,
        "valid_until": null,
        "source_updated_at": null
      }
    ],
    "checked_at": "2026-11-14T13:00:00.000Z"
  }
}
```

---

### 5.5 Identity Conflict

Emitted / stored in `integration_conflicts` whenever linking cannot be performed safely without manual admin review (for example: unverified email hint matching an existing student, collision with an `admin` / `creator` / `teacher` account, or one `external_user_id` colliding with an already-linked local account). Accounts MUST NOT be auto-merged.

#### Conflict Record / Error Response (`409 Conflict`)

```json
{
  "success": false,
  "errorCode": "IDENTITY_CONFLICT",
  "message": "External identity cannot be auto-linked and has been queued for manual review.",
  "correlation_id": "corr_01JCC19C3002",
  "data": {
    "conflict_id": 7,
    "conflict_type": "PRIVILEGED_ROLE_COLLISION",
    "status": "open",
    "source_system": "moly",
    "external_user_id": "moly:541",
    "candidate_user_id": 19,
    "existing_user_id": null,
    "email_hint": "teacher@example.com",
    "source_updated_at": "2026-11-14T14:00:00.000Z",
    "reason": "Matched local account holds role 'creator'; automatic linking is forbidden.",
    "resolution_required": "manual_admin_review",
    "payload": {
      "event_id": "evt_01JCC19USER541",
      "candidate_role": "creator"
    },
    "created_at": "2026-11-14T14:00:00.120Z"
  }
}
```


---

## Day 2 Implementation Notes (CSCA-Course)

- **Additive migration**: `database/migrations/080_moly_external_access_bridge.sql` adds `local_video_course_profile_id` / `local_live_class_id` scoping to `external_entitlements` and isolated partial unique indexes + `external_entitlement_id` / `enrollment_source` / `video_course_profile_id` columns on `class_enrollments`.
- **Signed webhook & read routes** (`/api/integrations/v1` via `backend/router/molyIntegration.router.js`):
  - `POST /api/integrations/v1/users/provision`
  - `POST /api/integrations/v1/entitlements/grant`
  - `POST /api/integrations/v1/entitlements/revoke`
  - `POST /api/integrations/v1/ownership/query`
  - `POST /api/integrations/v1/moly/events/status` (signed read helper to inspect `integration_inbox` delivery state by `event_id` or `idempotency_key`)
- **Admin conflict & identity mapping endpoints** (`/api/admin/integrations` via `backend/router/externalCourseMapping.router.js`):
  - `GET /api/admin/integrations/conflicts`
  - `POST /api/admin/integrations/conflicts/:conflictId/resolve`
  - `POST /api/admin/integrations/identities/link`
- **Background worker**: `backend/worker.js` polls `processAvailableMolyInboxJobs()` on the worker interval with `FOR UPDATE SKIP LOCKED`, lease recovery, exponential backoff retry, `dead_letter` transition, and `integration_conflicts` quarantine.
- **Environment variables (names only)**:
  - `MOLY_INTEGRATION_SERVICE_TOKEN`
  - `MOLY_INTEGRATION_KEY`
  - `MOLY_INTEGRATION_HMAC_SECRET`
  - `MOLY_INTEGRATION_MAX_AGE_SECONDS` (default `300`)
