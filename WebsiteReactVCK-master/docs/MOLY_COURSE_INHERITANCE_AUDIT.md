# Course -> Moly inheritance audit

Date: 2026-11-15. Local code review; no push or deployment.

## Repositories

Moly: C:\Users\ducan\Documents\Codex\2026-07-13\new-chat\CSCA-MOLI.STUDIO

Course: C:\Users\ducan\Documents\Codex\2026-07-24\anhcill-csca-interview-git-https-github\CSCA-Course\WebsiteReactVCK-master

## Conclusion

Inheritance is NOT complete if the requirement is: publish any course on Course and
automatically see its catalog, video, PDF, quiz and progress inside Moly.
The existing integration shares identity/access and launches the Course workspace
through SSO. It does not replicate the full learning workspace into Moly.

| Feature | Current implementation | Directly inherited inside Moly? |
| --- | --- | --- |
| Identity / sign-in | Browser-bound SSO and explicit identity linking | Yes, integration exists; real browser E2E still required |
| Course access | Provision, grant/revoke, ownership queries, outbox/inbox | Yes, for configured mappings and identities |
| New Course catalog entry | Moly catalog queries its own courses table | No automatic whole-catalog sync found |
| My Learning external course | Verified mapped external ownership becomes an external learning card | Yes, with Course launch destination |
| Video / curriculum | Course workspace and player after SSO | Not copied into Moly learning room |
| PDF / attached files | Course workspace file list, preview/download endpoint | Not synced into Moly resource list |
| Quiz / assignments | Course workspace and submission routes | Not synced into Moly |
| Watch time / completion / next-unit lock | Course tracks watch progress and quiz requirements | No Course progress projection into Moly |
| Notes / theory / vocabulary / formulas | Course workspace owns these features | No integration API for them found |
| Device limit / revoke controls | Course enforces its own access/session policies | Applied when using Course; not a replicated Moly UI |
| Sell to users without ownership | Moly purchase/ownership pipeline exists | Requires product configuration, mapping and rollout testing |

## Evidence

Moly:
- frontend/app/khoa-hoc/page.tsx: catalog page now omits the tutor showcase.
- frontend/components/courses/CourseCatalogClient.tsx: filter bar removed;
  pagination, loading/error/retry and newest-first catalog query retained.
- backend/src/repositories/courseRepository.js:listPublished reads local courses.
- backend/src/services/courseIntegrationClient.js exposes provision/grant/revoke,
  ownership/status, SSO and reconciliation; no curriculum/PDF/progress export client.
- backend/src/services/learningService.js:listMyEnrollments marks external-only items
  with learningDestination=csca-course and progress=null.
- frontend/components/learning/MyLearningClient.tsx launches SSO for external courses.
- backend/src/repositories/learningRepository.js:listLessonResources reads local
  lesson_resources, not Course file tables.
- frontend/components/learning/LearningRoomClient.tsx renders those local resources.

Course:
- backend/router/videoCourse.router.js supplies videos, theory, files, assignments,
  quizzes, vocabulary, formulas, notes and progress in its workspace response.
- frontend/src/features/learning/pages/VideoCourseWorkspacePage.jsx renders that
  workspace, including PDF/slide previews and file downloads.
- File links use /api/files/:fileId/download with classId/videoCourseId/
  videoCourseProfileId context.
- backend/router/file.router.js requires authentication and file access, handles
  unit locks, and distinguishes inline viewing from permitted download.
- View-only responses use SAMEORIGIN / frame-ancestors self. Embedding the existing
  Course PDF viewer directly in the Moly domain is not an implemented solution.
- Existing file policy tests cover view-only PDF, blocked forced download, query
  stripping, unit lock and allowed download. They do NOT constitute an actual
  Moly-SSO-to-PDF browser test for every external grant/profile combination.

## What the current approach supports

After configuring a local published catalog entry and its exact Course offering
mapping, the learner can see ownership on Moly and launch the Course workspace.
In that workspace the learner can use available video/PDF/quiz features subject
to Course access and file policies. Updating a PDF on Course updates the content
served there; no second PDF copy on Moly is required.

This is code-path evidence, not proof that the course pictured by the user has
correct production mappings, file storage, grants or deployment configuration.
No live SQL or storage links were inspected in this turn.

## Work needed for automatic/native inheritance

1. Automatic catalog projection: Course export/events with stable offering/profile
   IDs, published/hidden status, metadata and update ordering; Moly idempotent upsert.
   Preserve Moly sales pricing rather than overwriting it from remote content.
2. If learning must stay inside Moly: authenticated per-user APIs for curriculum,
   playback, PDF viewing/download policy, quiz/assignments and progress; implement
   corresponding Moly UI and preserve Course authorization on every operation.
   Do not copy public storage URLs or relax iframe policy to bypass access.
3. If SSO-based learning is acceptable: keep Course as the only learning workspace,
   clearly label the destination, and validate the full flow including PDF access.
4. Browser acceptance cases: inherited user, new paid user, wrong profile, expired/
   revoked user, locked lesson, view-only PDF, permitted download, copied file link,
   quiz completion and progress after re-login.

## UI scope

Removed the tutor block and filters from /khoa-hoc, matching the supplied screenshot.
The homepage's separate tutor section remains; shared components were not deleted.

## Deployment order

Verification in this turn:
- Moly frontend: npx tsc --noEmit --incremental false passed.
- Course: node --test backend/router/videoCourse.workspace.test.js backend/router/videoCourse.day3.test.js passed 7/7.
- Course: node --test backend/router/fileVideo.policy.test.js passed 1/1.
- git diff --check passed. No rendered browser visual QA or real cross-app E2E run.
- These backend tests use fixtures/mocked dependencies; their names containing E2E
  do not mean a production browser flow was exercised.

Requested future order is Course first, then Moly. Nothing was pushed.
Before a later push-all, include an explicit review of the existing unrelated
Course frontend changes and verify production migration/flags and rollback.
This audit does not mark the full native inheritance requirement complete.

