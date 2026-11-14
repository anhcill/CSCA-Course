# Codex review - Gemini Day 1

Date: 2026-11-14
Scope: Day 1 integration contract, SQL foundation, manual mapping and ingestion helper in both repositories.

## Decision

Code foundation reviewed and hardened. Day 2 development may proceed using the updated contract.
Full operational Day 1 acceptance remains conditional on isolated PostgreSQL validation and operator-verified real course mappings.
No production migration, mapping seed, deployment, push or sales enablement was performed by Codex.

## Repositories and reviewed Gemini commits

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Gemini commits: 5a005d06, 6ffe725d, 0b84cdbd.

Course:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course

Application root: WebsiteReactVCK-master.
Gemini commits: 620873e, ca427b9, f6169a4.

## Findings fixed by Codex

### P1 - Equal timestamps could reinstate revoked access

Both helpers accepted incoming timestamps equal to the stored timestamp, including status changes from revoked to active.
Distinct events now require a strictly newer source timestamp. Equal/older events are recorded as stale.
An additional database trigger prevents direct SQL changes to rights at the same timestamp.

### P1 - Grant IDs could move between users or courses

An existing grant's external user, local user and course were overwritten during upsert.
Grant subject and destination are now immutable in the helper and a database trigger.
New ingestion requires a verified external identity mapping to the specified user; active rights require an active identity.
The external_identity_id reference is persisted.

### P1 - Revocation depended on an active catalog mapping

Mapping resolution ran before deduplication and entitlement lookup.
Disabling a mapping prevented retries and revocation of existing grants.
Retries now resolve first; revocation/suspension/expiry of existing grants uses their saved destination.
Active renewal against a changed destination returns ENTITLEMENT_CONFLICT.

### P2 - Incomplete replay handling and payload fingerprint

Only idempotency-key conflicts were handled. Reusing event_id with a different retry key caused a raw unique-constraint failure.
The payload hash omitted local user ID and revoke reason, and JSON key order could cause false conflicts.
Both identifiers now deduplicate; conflicting payloads return a typed 409.
The fingerprint includes the previously omitted fields and canonicalizes JSON object keys.

### P2 - Missing-row concurrency and false successful ingestion

SELECT FOR UPDATE did not lock a grant before its first insertion.
Concurrent first deliveries could pass the pre-check; an upsert filtered out by freshness could still be reported as applied.
The helper now uses transaction-scoped advisory locking by source/grant and rejects an empty upsert result.
Native multi-connection PostgreSQL race testing remains required; PGlite tests do not prove that scenario.

### P2 - Stale mapping edits overwrote newer destinations

GREATEST(source_updated_at) preserved the timestamp while stale data still overwrote other mapping fields.
Mapping upserts now reject stale writes with STALE_EVENT; status updates advance the timestamp.

### P2 - Course adapter silently skipped transactions

The Course service previously fell back to work(db) if the adapter had no transaction support.
It now fails with TRANSACTION_REQUIRED instead of permitting partially committed ingestion.

### Operational hardening

- Both seed CLIs require explicit COURSE_INTEGRATION_DATABASE_URL; no implicit production .env target.
- Both CLIs close their dedicated pool.
- Added indexes for recovering expired processing leases.
- Added regression assertions for direct SQL guards, inactive mapping revoke, identity mismatch, replay and stale mapping updates.
- Updated both copies of the integration contract with Day 2 constraints and scope clarifications.

## Validation

Baseline Gemini tests rerun before changes:
- Moly Day 1: 5/5 passed.
- Course Day 1 + Management sync: 15/15 passed.

Codex final tests:
- Moly: node --test test/courseIntegrationDay1.test.cjs -- 6/6 passed.
- Moly: npm.cmd run test:video-commerce -- 25/25 passed.
- Course: node --test backend/services/externalCourseMapping.service.test.js backend/services/managementSync.service.test.js -- 16/16 passed.
- Migration reruns and direct SQL constraints tested on PGlite; no skipped cases in these suites.
- git diff --check passed for both repositories.

Read-only Moly schema coverage:
- remoteTableCount: 146
- localCreateTableCount: 138
- localOnly: the six new integration tables.
- missingLocally: 14 pre-existing tables not found by this script's CREATE TABLE scan.
  This scanner only searches database/ and backend/scripts/; this is not proof that all 14 tables lack migration coverage.
- The six integration tables were not installed in the configured remote Moly database at inspection.

Native PostgreSQL test availability:
- psql/initdb/pg_ctl not found on PATH.
- Docker CLI exists, but the Docker daemon is not running.
- Migrations and functional tests use the PGlite PostgreSQL engine.
- No production database was used as a migration test target.

## Mandatory handoff to Gemini for Day 2

1. Read the Codex addendum in both integration contracts before implementing endpoints.
2. The Day 1 helper is an atomic internal operation, not the durable HTTP ingress worker.
   Persist HTTP inbox receipt before processing; preserve errors/conflicts and implement retries/lease recovery.
3. Derive local user IDs from verified external identities. Do not auto-link accounts merely from matching email.
4. Translate snake_case wire fields to camelCase helper arguments explicitly.
5. Revoke payloads must supply the validity snapshot or load it from an existing grant.
   Handle revoke-before-grant with durable tombstones; do not discard it.
6. Keep Management-owned grants separate. lms_access_grants is unique on user/course:
   writing a Moly grant directly into that row can overwrite or revoke independent Management rights.
   Implement an effective-access resolver and preserve access while any valid source remains.
7. Extend the actual learner access gates to recognize external grants and recording membership
   without falsely marking a Moly learner as Management-owned.
8. Preserve origin authority to prevent entitlement mirror loops.
9. Complete durable, transactional audit records for manual mapping mutations across API and CLI.
   Current actor fields / Course router audit calls do not provide an atomic before/after audit ledger.
10. Validate one offering/profile per mapping and exact paid content scope; course-level mapping alone
    must not grant every recording profile under the same parent course.
11. Real course pairs are still unverified. Do not map Moly draft/demo courses to live Course offerings by position or name.
12. Run isolated native PostgreSQL tests for migrations and concurrent deliveries before production rollout.

## Preserved unrelated changes

Existing Moly untracked reports/tools and Course frontend changes were not edited or staged by Codex.
