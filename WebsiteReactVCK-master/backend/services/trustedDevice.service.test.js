import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  TrustedDeviceAuthError,
  establishLoginSession,
  listTrustedDevicesForUser,
  resolveAuthenticatedSession,
  revokeSessionFromJwtPayload,
} from "./trustedDevice.service.js";

const schema = `
  CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL DEFAULT 'student',
    email TEXT NOT NULL DEFAULT 'student@example.com',
    role TEXT NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    gender TEXT NOT NULL DEFAULT 'other',
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    vip_expires_at TIMESTAMPTZ,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_management_managed BOOLEAN NOT NULL DEFAULT FALSE,
    lms_account_status TEXT NOT NULL DEFAULT 'active',
    device_limit_attempts SMALLINT NOT NULL DEFAULT 0,
    device_limit_last_attempt_at TIMESTAMPTZ,
    locked_reason VARCHAR(80),
    locked_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE trusted_login_devices (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token_hash CHAR(64) NOT NULL,
    device_name VARCHAR(160) NOT NULL,
    user_agent TEXT,
    first_ip INET,
    last_ip INET,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by BIGINT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX trusted_device_active_token
    ON trusted_login_devices(user_id, device_token_hash) WHERE revoked_at IS NULL;
  CREATE TABLE user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_info TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trusted_device_id BIGINT REFERENCES trusted_login_devices(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
  );
`;

const setup = async (role = "user") => {
  const db = new PGlite();
  await db.exec(schema);
  const inserted = await db.query("INSERT INTO users (role) VALUES ($1) RETURNING id", [role]);
  const userId = inserted.rows[0].id;
  const clientFactory = async () => ({
    query: (text, params) => db.query(text, params),
    release: () => {},
  });
  const login = (deviceToken, ipAddress = "198.51.100.10") => establishLoginSession({
    userId,
    deviceToken,
    userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    ipAddress,
    expiresAt: new Date(Date.now() + 60_000),
    clientFactory,
  });
  return { db, userId, login };
};

test("does not apply the two-device limit to teachers or admins", async () => {
  for (const role of ["creator", "admin"]) {
    const { db, userId, login } = await setup(role);
    try {
      await login("a".repeat(43));
      await login("b".repeat(43));
      await login("c".repeat(43));
      await login("d".repeat(43));

      const devices = await db.query(
        "SELECT COUNT(*)::int AS count FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
      assert.equal(devices.rows[0].count, 4);

      const user = await db.query(
        "SELECT is_locked, device_limit_attempts FROM users WHERE id = $1",
        [userId],
      );
      assert.equal(user.rows[0].is_locked, false);
      assert.equal(user.rows[0].device_limit_attempts, 0);
    } finally {
      await db.close();
    }
  }
});

test("accepts two devices and rejects a third without creating another slot", async () => {
  const { db, userId, login } = await setup();
  try {
    await login("a".repeat(43));
    await login("b".repeat(43));

    await assert.rejects(
      () => login("c".repeat(43)),
      (error) => {
        assert.ok(error instanceof TrustedDeviceAuthError);
        assert.equal(error.errorCode, "DEVICE_LIMIT_REACHED");
        assert.equal(error.details.attemptsRemaining, 2);
        return true;
      },
    );

    const count = await db.query(
      "SELECT COUNT(*)::int AS count FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(count.rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test("recognizes the same trusted device after its previous JWT session expires", async () => {
  const { db, userId, login } = await setup();
  try {
    const first = await login("a".repeat(43));
    await db.query("UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 minute'");
    const second = await login("a".repeat(43), "203.0.113.25");

    assert.equal(String(second.trustedDeviceId), String(first.trustedDeviceId));
    const devices = await listTrustedDevicesForUser(userId, second.trustedDeviceId, db);
    assert.equal(devices.length, 1);
    assert.equal(devices[0].lastIp, "203.0.113.25");
    assert.equal(devices[0].isCurrent, true);
  } finally {
    await db.close();
  }
});

test("locks the account on the third rejected third-device login", async () => {
  const { db, userId, login } = await setup();
  try {
    await login("a".repeat(43));
    await login("b".repeat(43));
    await assert.rejects(() => login("c".repeat(43)), { errorCode: "DEVICE_LIMIT_REACHED" });
    await assert.rejects(() => login("c".repeat(43)), { errorCode: "DEVICE_LIMIT_REACHED" });
    await assert.rejects(
      () => login("c".repeat(43)),
      (error) => error.errorCode === "ACCOUNT_LOCKED_DEVICE_LIMIT" && error.details.attemptsRemaining === 0,
    );

    const user = await db.query(
      "SELECT is_locked, locked_reason, device_limit_attempts FROM users WHERE id = $1",
      [userId],
    );
    assert.equal(user.rows[0].is_locked, true);
    assert.equal(user.rows[0].locked_reason, "DEVICE_LIMIT_ABUSE");
    assert.equal(user.rows[0].device_limit_attempts, 3);

    const sessions = await db.query(
      "SELECT COUNT(*)::int AS count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(sessions.rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("an IP change on a known browser does not consume a second device slot", async () => {
  const { db, userId, login } = await setup();
  try {
    const first = await login("a".repeat(43), "198.51.100.10");
    const second = await login("a".repeat(43), "198.51.100.99");
    assert.equal(String(first.trustedDeviceId), String(second.trustedDeviceId));

    const count = await db.query(
      "SELECT COUNT(*)::int AS count FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(count.rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test("logout revokes only the session and retains the trusted device", async () => {
  const { db, userId, login } = await setup();
  try {
    const session = await login("a".repeat(43));
    const revoked = await revokeSessionFromJwtPayload({
      userId,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
    }, db);
    assert.equal(revoked, true);

    const sessionRow = await db.query("SELECT revoked_at FROM user_sessions WHERE id = $1", [session.sessionId]);
    assert.ok(sessionRow.rows[0].revoked_at);
    const deviceRow = await db.query("SELECT revoked_at FROM trusted_login_devices WHERE id = $1", [session.trustedDeviceId]);
    assert.equal(deviceRow.rows[0].revoked_at, null);
  } finally {
    await db.close();
  }
});

test("revoking a trusted device invalidates its session and frees one slot", async () => {
  const { db, userId, login } = await setup();
  try {
    const first = await login("a".repeat(43));
    await login("b".repeat(43));

    const authenticated = await resolveAuthenticatedSession({
      userId,
      sessionId: first.sessionId,
      sessionToken: first.sessionToken,
      deviceToken: "a".repeat(43),
      ipAddress: "198.51.100.10",
      db,
    });
    assert.equal(String(authenticated.authSession.trustedDeviceId), String(first.trustedDeviceId));

    await db.query("BEGIN");
    await db.query(
      "UPDATE user_sessions SET revoked_at = NOW() WHERE trusted_device_id = $1 AND revoked_at IS NULL",
      [first.trustedDeviceId],
    );
    await db.query("UPDATE trusted_login_devices SET revoked_at = NOW() WHERE id = $1", [first.trustedDeviceId]);
    await db.query("COMMIT");

    const rejectedSession = await resolveAuthenticatedSession({
      userId,
      sessionId: first.sessionId,
      sessionToken: first.sessionToken,
      deviceToken: "a".repeat(43),
      db,
    });
    assert.equal(rejectedSession, null);

    await login("c".repeat(43));
    const activeDevices = await db.query(
      "SELECT COUNT(*)::int AS count FROM trusted_login_devices WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(activeDevices.rows[0].count, 2);
  } finally {
    await db.close();
  }
});
