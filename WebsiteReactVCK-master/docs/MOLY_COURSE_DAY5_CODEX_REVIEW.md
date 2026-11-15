# Codex review - Day 4 follow-up and Day 5

Date: 2026-11-15
Decision: DAY 5 NOT ACCEPTED; production rollout remains blocked.
This report supersedes the open Day 4 code findings only to the extent described below.

## Repository paths

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course repository:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course

Course application:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course\WebsiteReactVCK-master

Reviewed Gemini commits:
- Moly d3ee5b28 (Day 4 remediation), 210050f7 (Day 5).
- Course e3b7581 (Day 4 remediation), 25b1e83 (Day 5).

## Remaining findings - Gemini implementation required

### P1: A concurrent refund/revocation can be overwritten by stale reconciliation

Moly backend/src/services/courseReconciliationService.js:436, :719,
and enqueueRepairOutboxEvent at :176.

The service reads local entitlement state outside the repair transaction. It later
passes that captured row into enqueueRepairOutboxEvent without re-reading or locking
the entitlement. allocateMonotonicTimestamp uses the current time and the latest
outbox timestamp, so an old active observation can become a newer grant event.

Reproduction schedule (code-path analysis; not executed on native PostgreSQL):
1. Reconciliation reads local entitlement E as active and remote grant as missing.
2. Refund/revocation commits E as revoked and queues its revoke event.
3. Reconciliation resumes and queues a grant from the old active row with a timestamp
   newer than the revoke. Course's last-update ordering can apply this grant last.

Gemini must revalidate authoritative entitlement, mapping and relevant conflict state
inside the enqueue transaction, coordinating locks/version checks with the real
refund/revoke producer. Abort/recompute if state changed. Do not merely compare the
snapshot timestamp or add a lock that the refund producer does not also respect.
Test the interleaving with two PostgreSQL connections; the final effective right must
stay revoked. Preserve independent Management and sibling grants.

### P2: The same grant cannot be automatically repaired a second time

Moly backend/src/services/courseReconciliationService.js:186 and :206.

Repair idempotency keys are permanently fixed to grant/revoke + externalGrantId + v1.
The existing-row check accepts ANY old row with this key, including a successfully
processed repair. A later discrepancy is reported as already_queued_idempotent,
but no fresh event is enqueued.

Reproduction:
1. Repair a missing grant and let its outbox/inbox finish.
2. Restore or otherwise lose that remote grant while the local entitlement stays active.
3. Reconcile again. The old terminal repair row wins the lookup forever.
The same limitation applies to repeated revoke repairs.

Gemini must define repair generations tied to a newly verified discrepancy, reuse
in-flight events, and permit a fresh generation after terminal completion when drift
recurs. Persist the generation atomically; concurrent runs must create one repair.
Do not solve this by using a random idempotency key for every run.
Tests: first repair, healthy rerun, second genuine drift, concurrent second repairs,
dead-letter retry, and repeat revoke. Preserve immutable event payloads.

## Fixes completed by Codex in this review

1. Scoped repair planning: externalUserId now filters local entitlement SQL, and
   externalCourseId filters the local entitlement loop. Before the fix, a diagnostic
   dry-run for moly:1 planned a grant for moly:2; requesting course-A planned course-B.
   Regression uses actual PGlite rows for two local users.
   This scopes new entitlement repairs; diagnostic queue/conflict summaries and the
   shared dispatcher can still include other subjects.

2. Incomplete snapshot protection: Course now returns data.complete=false when any
   capped identities/conflicts/external-grants/Management-grants query reaches its
   limit. Moly refuses reconciliation with RECONCILIATION_SNAPSHOT_INCOMPLETE unless
   complete is explicitly true. Missing rows are no longer treated as proof of drift
   when completeness is unknown. Empty remote mapping sets no longer bypass mapping
   validation.

3. Conflict resolution requires users.manage in addition to the existing router
   permission gate. A content.manage-only caller can no longer link identities.
   A route regression proves 403 before the resolution service runs.

4. Conflict resolution cannot transfer an existing external identity to a different
   local user. Conditional upsert returns IDENTITY_ALREADY_LINKED (409) and rolls
   back; a database regression verifies the original owner remains unchanged.

## Snapshot compatibility and operational limits

Course must contain the new complete field before using this version of Moly
reconciliation. An older Course response safely fails with 409.
A response with exactly limit rows is conservatively considered incomplete even
when there are no additional rows. Narrow the user scope, or implement real cursor
pagination and an aggregate completeness proof before large-scale reconciliation.
Course filters offerings after fetching capped grants; a course-only filter is not
a substitute for pagination. No pagination was added in this review.

The fixes do not make automatic repair safe against the P1 race above. Keep
mutating reconciliation disabled operationally until that finding is closed.
The protocol guard is a safe stop, not a claim that large datasets are fully supported.

## Day 4 follow-up status

The old copied-callback login-CSRF defect now has destination-created transactions,
server-held PKCE verifiers, browser cookies, state checks, one-use consumption and
safe-link browser binding in both repos. Existing HTTP regressions cover foreign
cookie contexts, missing cookie, PKCE mismatch, replay and expiry.

Inherited-only courses are now added to /hoc through verified external ownership
and mapped external destinations, without inserting fake enrollments/progress.

These two code findings are addressed at the inspected service/test level.
Actual browser E2E across both apps, production cookie/proxy/domain behavior and
native multi-connection concurrency remain unverified. The test names containing
"2-browser-context" are HTTP cookie simulations, not a Playwright/browser run.

## Verification completed

Before Codex changes:
- Moly: node --test test/courseIntegrationDay4.test.cjs test/courseIntegrationDay5.test.cjs
  from backend: 12/12 passing.
- Course: node --test backend/services/molySso.service.test.js backend/services/molyIntegration.service.test.js
  from application root: 17/17 passing.

After relevant Codex changes:
- Moly Day 5 suite: 4/4 passing, including scope, completeness, mapping, permission
  and identity reassignment regressions.
- Course Day 5 targeted test: 1/1 passing, including capped snapshot completeness.
- Moly frontend: npx tsc --noEmit --incremental false passed.
- Course frontend: npm run build passed; existing bundle-size/lottie eval warnings.
  Build includes the user's existing unrelated frontend edits.
- git diff --check passed for reviewed changes.

Tests use PGlite and mocked peer HTTP responses. No new native PostgreSQL
concurrency or complete dual-app browser E2E was run.
No Railway SQL inspection, production migration, deployment, sales enablement or
push occurred in this follow-up. This is not a live production readiness report.
Day 3 payment/outbox audit is not retroactively approved.

## Handoff responsibilities

Gemini:
1. Fix the P1 stale reconciliation/refund race and P2 repeat-repair generation.
2. Add the exact regression scenarios described above.
3. Add snapshot pagination or explicitly retain documented scoped-operation limits.
4. Supply real two-app browser E2E evidence: both directions, copied callback,
   safe-link refresh, inherited-only /hoc, denied/revoked access, and normal purchase
   for an account with no existing entitlement.
5. Record commits, test commands/results and any migration requirements.

Codex after Gemini:
1. Review both repository diffs and the authoritative refund/revoke lock ordering.
2. Re-run regressions and verify final access state with independent grants preserved.
3. Check the browser/SQL evidence and staging rollout/rollback gates.
4. Commit fixes locally only. Do not push unless the user later requests it.

Current outcome: useful Day 4 remediation and Day 5 guard fixes are present, but
Day 5 completion and production rollout are NOT approved.

