# Changelog

## Unreleased — LMS Days 8–10

### Added

- Idempotent XP events, streaks, scoped leaderboards and certificate eligibility/verification.
- Paginated, owner-scoped notifications.
- Security headers, exact-origin CORS, auth rate limiting and production environment validation.
- Backend dependency audit đã được cập nhật về 0 vulnerability bằng các bản vá tương thích.
- Security tests, release checklist, backup/rollback runbook and operational README.

### Changed

- Login keeps JWT in the HttpOnly cookie only; response JSON no longer exposes the token.
- OTP/password-reset code generation uses cryptographic randomness and codes are not logged by default.
- Password reset invalidates existing sessions.
- Public course catalog/comments/ratings have bounded payloads and published-content visibility.
- Migration runner no longer executes seed data unless `RUN_SEEDS=true` is explicitly set.

### Known limitations

- Email delivery, Redis rate limiting, browser CI E2E and certificate PDF generation remain post-MVP work.
- Frontend dependency audit còn cảnh báo; cần xử lý riêng để không ảnh hưởng UI Gemini trong lượt backend này.
