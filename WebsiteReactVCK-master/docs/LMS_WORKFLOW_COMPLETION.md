# LMS academic workflow completion

## Included workflows

- Gradebook: course/class/session filters, server CSV/XLSX, export audit, weighted totals,
  latest/best/average quiz attempt policy, final snapshots and reason-required reopening.
- Attendance: separate review queue, requester cannot review their own request, rejection
  reason, stale-original checks, reviewer/requester notifications and audited old/new values.
- Grading: private draft, explicit publication, reason-required regrading, image pins and
  page-indexed PDF comments. Returning work sets a personal resubmission deadline; every
  resubmission preserves the preceding content, files and published grade history.
- Accommodations: individual deadlines, quiz time/attempt allowances, audited revocation,
  notification and reminder/risk calculations using the student's effective deadline.
- Question bank: editing, search, topic/difficulty, private or course-shared questions,
  random difficulty blueprint and ownership/scope enforcement. Quiz questions are copies,
  so editing or removing bank entries does not change an existing quiz.
- Student support: class-scoped case, assigned owner, contact note, appointment, resolution
  outcome, audit history and owner notification.
- New pages use route-level lazy imports.

## Gradebook policy

The initial policy is 50% assignments, 40% quizzes, 10% attendance; latest quiz attempt,
exclude missing grades, pass mark 60/100. These are configurable defaults, not a claim
of compliance with an external education standard. Staff should review/save their policy
before finalizing. Categories without activities are excluded; excused attendance is
excluded. Actual zero scores remain zero. Missing grades can instead be counted as zero.

Finalization stores an immutable result snapshot. Pending grades, returned work, pending
attendance amendments and active quiz attempts prevent finalization. Publishing grades,
new submissions/attempts and attendance changes are blocked until the book is reopened.
Existing completed quiz results remain readable. The learner endpoint returns only the
authenticated learner's finalized result, subject to active enrollment and LMS access.

## Schema and verification

Migration `033_lms_workflow_completion.sql` is registered in `run_sql.js`. Deployments
must run the normal migration step before using these endpoints. Existing published
grades are associated with submission revision 1.

Automated checks (run from the application directory):

```sh
node --test backend/middleware/*.test.js backend/services/*.test.js backend/router/*.test.js
npm run test:lms-workflows
```

Workflow integration tests use an in-memory PGlite PostgreSQL instance, executing the
base schema and every registered migration. No application listener, production database
or external network is used. Route business handlers are invoked with fixture identities;
middleware has separate tests. Client contract tests exercise the real API client with
mocked fetch, including rubric forwarding and empty attachment IDs.

This change was linted and syntax-checked. A production build and browser acceptance
test were not run (repository instructions require an explicit request to start/build).
Before release acceptance, check image/PDF previews against configured storage, keyboard
and mobile grading layout, each role's navigation, and an actual CSV/XLSX download.
