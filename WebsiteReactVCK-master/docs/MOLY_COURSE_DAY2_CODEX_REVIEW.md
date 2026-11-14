# Codex review - Gemini Day 2

Date: 2026-11-14

## Decision

Day 2 backend reviewed and hardened locally. Gemini may continue Day 3 development
against this version. This is not production acceptance: native PostgreSQL concurrency,
real offering mappings and deployed API/worker smoke tests remain required.

No push, deployment, Railway mutation, production migration or sales enablement was performed.

## Repositories

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course

Course application root: WebsiteReactVCK-master.

Reviewed Gemini commits: c2ef264, d04d09d, fd2f170.
Review base: 222111c. The earlier quiz-unlock commit is outside this integration diff.
Moly implementation remains at Day 1; Day 2 implementation is in Course.

## Findings fixed

1. P1 - Equal-timestamp identity events could reactivate a suspended/revoked identity.
   Provisioning now requires a strictly newer timestamp to change status.
   Manual linking/conflict replay also rejects stale/equal status changes.

2. P1 - Stale workers could overwrite inbox completion/failure after lease reassignment.
   Business processing locks and verifies the inbox claim before applying writes.
   Failure persistence separately checks worker identity and attempt number under lock,
   before recording conflicts or changing status. Old callbacks return lease_lost.

3. P1 - Active replacement identities could lend their status to old revoked identities.
   LMS access and legacy null-FK entitlement joins now match the exact external user ID.
   Ownership query filters each grant through its own active identity.
   Enrollment listing also applies the effective course-access predicate.

4. P2 - Authentication header persisted in integration_inbox.headers_snapshot.
   Removed X-Integration-Key from request metadata and persisted snapshots.
   Snapshot allowlist contains correlation ID, timestamp and idempotency key only.
   Signature validation now rejects missing raw request bytes instead of reconstructing JSON.
   Previously stored snapshots are not modified by this code change.

5. P2 - Scheduled grants never created membership when received before valid_from.
   Scoped membership now includes scheduled active grants. Request-time entitlement
   checks still enforce valid_from/valid_until. Regression verifies denied access before
   the boundary and successful workspace access after it without another webhook.

6. P2 - Revoking one of multiple grants pointed membership at the revoked grant.
   Projection now references the surviving active scope grant selected from the database.

7. P2 - Ownership query reported access despite an admin profile revocation.
   Profile-mapped ownership now checks active profile, matching membership and admin
   revocation through the existing Record access helper.

8. Documentation/test corrections.
   Corrected admin API prefix to /api/v1/admin/integrations (matching server.js).
   File-policy fixture now restores Live membership after its Record-only checks,
   before asserting access to the Live workspace.

## Validation

- Day 2 integration suite: 8/8 tests, including original four scenario groups.
- Existing affected suites: 43 tests across mapping, Management sync, Record workspace,
  Bunny playback, quiz player, file/video policy, trusted devices and LMS middleware.
  Initial run: 42 pass, 1 file-policy fixture failure; corrected fixture rerun: 1/1 pass.
- Local schema and migrations execute through PGlite in integration tests.
- New regressions cover identity timestamp ordering/manual stale linking, credential
  exclusion, missing raw body, exact identity binding, scheduled access, surviving
  grant references, admin profile revocation and stale-worker fencing.
- Lease races are simulated deterministically between transactions. PGlite does not
  prove concurrent PostgreSQL SKIP LOCKED/advisory-lock behavior across connections.

## Gemini - Day 3 handoff

1. Implement the Moly sender/outbox and payment-to-entitlement flow against the actual
   Course API routes in docs/MOLY_COURSE_INTEGRATION_CONTRACT.md.
2. Treat HTTP 202 as durable receipt, not successful entitlement application.
   Poll signed /api/integrations/v1/moly/events/status; handle processed, stale,
   failed, dead_letter and conflict resolution without repeated charges.
3. Keep business event_id/idempotency_key stable across retries. Generate a fresh
   X-Event-Timestamp and HMAC over the exact serialized request bytes for each attempt.
4. Provision/link canonical identity before granting. Email matches remain conflicts.
   Do not bypass admin review by automatically attaching an existing Course account.
5. Map paid video offerings explicitly to local_video_course_profile_id.
   Do not infer mappings by title/slug and do not seed demo mappings into production.
6. Preserve each authority's grants. Refund/revoke affects only the originating grant.
   Test two paid grants for one profile, expiry, scheduled activation and replay.
7. Distinguish access from permission to purchase. owned=false can mean admin block,
   missing mapping/identity, or no effective membership; it is not by itself a reason
   to offer another purchase. Retained grant status/windows help identify blocked rights.
8. Keep SSO redemption and frontend end-to-end learner flows in their planned work.
   Day 2 backend tests do not establish that cross-site login is complete.

## Codex - next review

- Review Day 3 outbox retries, payment deduplication, refund ordering and secret handling.
- Verify HTTP 202/status reconciliation and that enrollment is not marked ready early.
- Test inherited Course access plus new Moly purchase without affecting Management rights.
- Validate native PostgreSQL with at least two independent connections before release:
  concurrent duplicate ingress, lease expiry/reclaim, success-versus-failure races,
  distinct grants on one user/profile, and worker restart recovery.
- Smoke-test migration 080, API and worker on an isolated environment with verified
  mappings before any production rollout.

## Commit scope

Only Codex review fixes/tests/docs are committed. Existing unrelated frontend edits
and untracked Moly planning/report files are preserved. Commits remain local.
