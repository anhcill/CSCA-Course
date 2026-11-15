# Codex review - Gemini Day 4

Date: 2026-11-15
Decision: NOT ACCEPTED for Day 4 completion or production rollout.
Backend fixes are committed locally; the browser-bound SSO protocol remains a blocker.

## Repository paths and scope

Moly:
C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course

Course application:
C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course\WebsiteReactVCK-master

Reviewed Day 4 commits:
- Moly: 6d5ffc7d (base ad927411).
- Course: 6728c34 (base b81d72a).

Moly also contains Day 3 commits 1915b0f8, 3353ae21 and ad927411.
Their regression tests were run as SSO dependencies; this does not replace a full
Day 3 payment/outbox review or retroactively approve that milestone.

No push, deployment, production migration, Railway changes or sales enablement.

## Open findings - Gemini must finish these

### P1: SSO callback is not bound to the initiating browser

Moly: backend/src/services/courseSsoService.js, consumeCourseSso.
Course: backend/services/molySso.service.js, consumeMolySso.
Both frontend callback pages automatically consume code and state from the URL.

The source generates both code and state and sends them together in the fragment.
The destination accepts this pair without a destination-created browser transaction.
An attacker can obtain a launch URL for their own account and send the entire URL
to another browser; the destination callback can sign that browser into the attacker's
account. A one-use code, HMAC and a nonce comparison do not establish browser binding.
The existing HTTP happy-path tests demonstrate that consumption needs no destination
initiation cookie; no two-browser exploit was executed against deployed services.

The added response nonce validation checks the peer response only. It does NOT fix
this login-CSRF problem. Do not describe Day 4 as security-approved.

Gemini implementation requirements in BOTH repos:
1. Add a destination-initiated SSO transaction: generate unpredictable state and
   a PKCE verifier/challenge, keeping the verifier on the destination server bound
   to a short-lived HttpOnly, Secure browser cookie.
2. Redirect to the authenticated source authorization flow. Bind the issued code
   to the destination, transaction state, PKCE challenge and approved target.
3. On callback, require the original destination browser transaction, check state
   and exchange with the matching verifier. Reject missing/foreign transactions
   before issuing a session or modifying identities.
4. Consume the destination transaction once. Apply the same browser binding to
   safe-link challenges and confirmation; possession of a linkToken alone is not
   proof of the browser that initiated the flow.
5. Do not replace this with Origin checks, CORS, a sender-generated state echoed
   in the URL, or an extra confirmation button.
6. Preserve native device limits, independent cookies/JWT secrets, fragment delivery
   and the existing allowlist while introducing the extra authorization round trip.
7. Add tests using two isolated browser contexts: a launch URL copied from A to B
   must fail in B; A must still complete. Include a logged-in B, a passwordless
   safe-link candidate, replay, expiry and browser refresh.

### P2: inherited-only courses are absent from Moly My Learning

Moly backend/src/services/learningService.js, listMyEnrollments, starts from local
enrollment rows and only adds ownership metadata to those rows. A Course-only user
with external_entitlements but no local course_enrollments row is therefore absent
from this list. Catalog ownership can still be correct.

Gemini: include verified, mapped external-only courses in /hoc with an explicit
external-learning destination. Do not invent local progress or copy lesson content.
Add a test for a Course-only account with zero local enrollments.

## Fixes completed by Codex

1. Active identity required. Expired identities no longer authenticate or report
   successful peer binding. Historical revoked identities no longer block an
   independent active replacement identity during outbound exchange.

2. Safe-link race protection. Identity resolution, confirmation and peer binding
   take a canonical advisory lock. Confirmation rechecks external ID ownership and
   active status before its INSERT ... ON CONFLICT path. A challenge cannot report
   success after that identity has been linked elsewhere or disabled.

3. Real Course offering resolution. Course-scoped SSO now requires an active mapping
   to a video profile and redirects to /video-courses/profile-<id>. Moly external IDs
   are not treated as Course workspace IDs. Missing mappings fail closed.

4. Effective access instead of historical revocation. Scoped SSO uses current
   entitlement, membership, active profile and admin revocation checks. Revoking
   one grant does not block another valid grant for the same profile.
   Safe-link requests preserve their course scope and run the same access check.

5. Email trust preserved. JIT creation uses the issuer's email_verified === true;
   email presence alone no longer verifies an address. Moly is_verified follows
   the same rule instead of being forced to true.

6. Staff and banned-account protection. Course checks management_staff_source_id
   as well as role. Moly checks module RBAC roles and is_banned, including before
   issuing a native session and before peer binding/safe-link confirmation.

7. Durable rejected conflicts. Privileged collisions remain in integration_conflicts
   after rejected account changes roll back, instead of disappearing with the
   transaction. Moly refuses a nontransactional database adapter.

8. Peer response and request validation. Consumers validate source_system, subject
   presence and returned nonce. Moly inbound HMAC requires captured raw bytes.
   Peer target IDs use full numeric parsing, not parseInt accepting trailing junk.

9. Peer-bind recovery. Binding failures are no longer silently ignored. Both
   consumers retry binding on subsequent SSO attempts for existing identities,
   and do not issue the session until binding succeeds. A failed exchange may
   require starting a fresh launch; it is not reported as authenticated.

10. Ownership UI consistency. Local ownership cannot advertise another purchase
    or override canLaunchCourse=false from the authoritative ownership result.

## Validation completed

- Moly Day 4: original five groups plus three Codex groups, 8 passing tests.
  Seven ran together; the final raw-body test was run separately after addition.
- Course Day 4: 7/7 passing tests.
- Moly Day 3 / video-commerce foundation / video payments: 80/80 passing tests.
- Course Day 2 integration / trusted devices: 15/15 passing tests.
- Total: 110 passing tests across these runs.
- Moly frontend: npx tsc --noEmit --incremental false passed.
- Course frontend: npm run build passed, with dependency eval/bundle-size warnings.
- git diff --check passed before commit.

Course JIT happy-path fixture was corrected to account-scoped login: it formerly
claimed course-scoped success without any real mapping or entitlement. A new
regression creates the real mapping/profile/grants and verifies scoped access.

The test peers mock the other server. These tests are not a full two-app browser
E2E or proof of PostgreSQL multi-connection concurrency. Course tests apply the full
schema/migration registry; Moly SSO tests use a bootstrapped fixture schema.
No production-database verification was performed in this review.

## Next handoff

Gemini:
- Finish the P1 browser transaction protocol and P2 inherited course list above.
- Commit separately in each repo and document the updated SSO wire contract,
  browser cookie policy, TTL/cleanup and any additive migrations.
- Keep the current Codex fixes and preserve unrelated frontend working-tree edits.
- Return tests and commit IDs for another Day 4 review before declaring completion.

Codex, after Gemini:
- Review the protocol and browser binding, safe-link confirmation and session issuance.
- Run both real applications with isolated test databases and test all three planned
  user cases: Course-only, Moly buyer and existing unlinked accounts.
- Validate two-browser login-CSRF rejection, one-use concurrent exchange on native
  PostgreSQL, device limits, expiry, revocation and real mapped workspace redirects.
- Recheck the inherited-only My Learning list and rerun affected payment regressions.
- Approve Day 4 only after these checks; production rollout remains a separate step.
