# Codex Day 5 blocker fixes

Date: 2026-11-15
Scope: the two remaining implementation defects in MOLY_COURSE_DAY5_CODEX_REVIEW.md.
Status: both code defects fixed, with regression coverage. Production acceptance
still requires real PostgreSQL concurrency and dual-app browser E2E evidence.

## Repository paths

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course application (documentation copy only in this follow-up):
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course\WebsiteReactVCK-master

## P1: stale repair versus refund/revocation

Moly backend/src/services/courseReconciliationService.js now locks the user and
then the entitlement inside the repair transaction, matching videoPaymentService
refund and videoAdminService revocation. It re-reads authoritative state before
building the payload and retains these locks until the outbox insert commits.

It validates the current user, entitlement status/window, grant identity, course
membership, active mapping and current local conflicts. Payload dates/profile
come from the freshly read rows. Mapping and membership rows are held FOR SHARE.
A changed state produces an explicit skipped action rather than a success claim.

Ordering:
- If revocation commits first, repair sees revoked state and cannot enqueue a grant.
- If repair commits first, revocation runs afterwards and allocates a newer
  source_updated_at through the existing shared per-aggregate timestamp allocator.
- A stale revoke observation cannot revoke a reactivated entitlement.
- This does not claim serializable isolation against every remote admin operation.

## P2: repeated drift and concurrent repair generations

Before fetching the remote snapshot, reconciliation records the latest outbox
event ID and status for each grant/event type. Under the repair lock it checks
the current latest event against that observation.

A new deterministic generation is allowed only when the observed predecessor
was already terminal (sent + processed/stale/ignored) before fetching the snapshot
and it is still the latest event. The generation uses that predecessor's row ID.
The first generation uses after_0. Legacy v1 rows remain immutable and can serve
as predecessors without a migration.

Consequences:
- A healthy rerun creates no repair.
- A new discrepancy after a completed repair can create a new event.
- Concurrent runs that observed the same predecessor cannot each advance it.
- A pending, failed, dead-letter or unknown-status event is reused, not bypassed.
- Completion during snapshot fetch requires a later fresh observation.
- Manual retry keeps the same event/payload; it does not create another generation.

No schema migration or new production configuration is required for these fixes.
The earlier complete-snapshot protocol guard and scoped-operation limits remain.

## Verification

Regression coverage in backend/test/courseIntegrationDay5.test.cjs:
- Revocation commits after reconciliation's local scan: zero new grant events.
- Repair commits before revoke: revoke has a strictly newer source timestamp.
- Expiry, reactivation, mapping changes and newly opened local conflict are checked
  again inside the repair transaction.
- Repeated grant AND revoke drift repair successfully.
- Two concurrent reconciliation calls produce one new repair per grant/event type.
- Previous event payloads stay unchanged; unrelated remote rights stay untouched.
- In-flight events and completion during snapshot fetch do not create duplicates.
- Dead-letter repair uses explicit retry and then recovers.

The Day 5 suite passes 11/11 (including nested tests).
The payment and Day 3 regression suites are also run with:
node --test backend/test/courseIntegrationDay5.test.cjs backend/test/courseIntegrationDay3.test.cjs backend/test/videoPayments.test.cjs

Final combined result: 73/73 tests passed, zero failures or skipped tests.
git diff --check also passed. Initial new-fixture SQL constraint/type errors were
corrected before this final run; no schema constraints were relaxed.

These tests use PGlite and mock peer HTTP. Interleavings are controlled in tests;
they are not independent native PostgreSQL connections.
Docker Desktop startup failed in dockerInference on this machine. The waiting
startup CLI was stopped. No factory reset or Docker data deletion was performed.
A native two-connection PostgreSQL concurrency run is still an acceptance gate.

## Remaining acceptance work

- Run the two ordering schedules and concurrent repair generations on staging
  PostgreSQL using separate connections.
- Complete actual browser E2E in both apps, including normal purchase, inherited
  courses, SSO cookie isolation and revoked access.
- Inspect staging/live SQL and rollout state separately before production approval.
- Keep the existing snapshot limit guard; pagination was not added here.

No push, deployment, production SQL change or sales enablement in this follow-up.
Gemini no longer needs to implement these two code fixes; review the resulting
commits and coordinate remaining acceptance evidence instead.

