import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  beginTeacherBiometricAssertion,
  beginTeacherBiometricRegistration,
  completeTeacherBiometricRegistration,
  resolveWebAuthnContext,
  toBase64Url,
  verifyTeacherBiometricAssertion,
} from "./teacherDeviceBiometrics.service.js";

const buildAuthData = ({ rpId, flags = 0x05, signCount = 1 }) => {
  const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
  const flagBuf = Buffer.from([flags]);
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32BE(signCount, 0);
  return Buffer.concat([rpIdHash, flagBuf, countBuf]);
};

test("resolveWebAuthnContext normalizes www.molycourse.online and molycourse.online to shared rpId", () => {
  const a = resolveWebAuthnContext({ headers: { origin: "https://www.molycourse.online" } });
  const b = resolveWebAuthnContext({ headers: { origin: "https://molycourse.online" } });
  assert.equal(a.rpId, "molycourse.online");
  assert.equal(b.rpId, "molycourse.online");
  assert.equal(a.expectedOrigin, "https://www.molycourse.online");
});

test("Full WebAuthn ECDSA P-256 registration & verification round-trip succeeds and rejects tampered signatures or missing UV", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spkiDer = publicKey.export({ format: "der", type: "spki" });
  const credId = crypto.randomBytes(32).toString("base64url");

  // In-memory mock DB
  const store = new Map();
  let nextId = 1;
  const mockDb = {
    async query(sql, params = []) {
      if (sql.includes("FROM teacher_biometric_credentials") && sql.includes("WHERE teacher_id = $1 AND revoked_at IS NULL")) {
        const rows = [...store.values()].filter((r) => r.teacher_id === params[0] && !r.revoked_at);
        return { rows };
      }
      if (sql.includes("INSERT INTO teacher_biometric_credentials")) {
        const row = {
          id: nextId++,
          teacher_id: params[0],
          credential_id: params[1],
          public_key_spki: params[2],
          public_key_alg: params[3],
          sign_count: 0,
          device_label: params[4],
          transports: params[5],
          last_used_at: null,
          created_at: new Date().toISOString(),
          revoked_at: null,
        };
        store.set(row.credential_id, row);
        return { rows: [row] };
      }
      if (sql.includes("WHERE credential_id = $1 AND teacher_id = $2")) {
        const row = store.get(params[0]);
        return { rows: row && row.teacher_id === params[1] && !row.revoked_at ? [row] : [] };
      }
      if (sql.includes("UPDATE teacher_biometric_credentials")) {
        for (const r of store.values()) {
          if (r.id === params[1]) {
            r.sign_count = Math.max(r.sign_count, params[0]);
            r.last_used_at = new Date().toISOString();
          }
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  // 1. Register credential
  const regBegin = await beginTeacherBiometricRegistration({
    teacherId: 42,
    username: "gv_an",
    fullName: "Cô An",
    rpId: "molycourse.online",
    expectedOrigin: "https://molycourse.online",
    db: mockDb,
  });

  const regClientData = Buffer.from(JSON.stringify({
    type: "webauthn.create",
    challenge: regBegin.publicKey.challenge,
    origin: "https://molycourse.online",
  }));
  const regAuthData = buildAuthData({ rpId: "molycourse.online", flags: 0x45, signCount: 0 });

  const saved = await completeTeacherBiometricRegistration({
    teacherId: 42,
    challengeToken: regBegin.challengeToken,
    credentialId: credId,
    clientDataJSON: toBase64Url(regClientData),
    authenticatorData: toBase64Url(regAuthData),
    publicKeySpki: toBase64Url(spkiDer),
    publicKeyAlg: -7,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    db: mockDb,
  });

  assert.equal(saved.credentialId, credId);
  assert.equal(saved.deviceLabel, "iPhone · Face ID / Touch ID");

  // 2. Assert (Verify Face ID for check-in)
  const assertBegin = await beginTeacherBiometricAssertion({
    teacherId: 42,
    purpose: "attendance",
    sessionId: 99,
    type: "check_in",
    rpId: "molycourse.online",
    expectedOrigin: "https://molycourse.online",
    db: mockDb,
  });

  const assertClientData = Buffer.from(JSON.stringify({
    type: "webauthn.get",
    challenge: assertBegin.publicKey.challenge,
    origin: "https://molycourse.online",
  }));
  const assertAuthData = buildAuthData({ rpId: "molycourse.online", flags: 0x05, signCount: 2 });
  const clientHash = crypto.createHash("sha256").update(assertClientData).digest();
  const sig = crypto.sign("sha256", Buffer.concat([assertAuthData, clientHash]), privateKey);

  const verified = await verifyTeacherBiometricAssertion({
    teacherId: 42,
    purpose: "attendance",
    sessionId: 99,
    type: "check_in",
    challengeToken: assertBegin.challengeToken,
    credentialId: credId,
    clientDataJSON: toBase64Url(assertClientData),
    authenticatorData: toBase64Url(assertAuthData),
    signature: toBase64Url(sig),
    db: mockDb,
  });

  assert.equal(verified.verified, true);
  assert.equal(verified.userVerified, true);
  assert.equal(verified.signCount, 2);

  // 3. Reject when UV flag (Face ID / Fingerprint) is missing (flags = 0x01 only UP)
  const noUvAuthData = buildAuthData({ rpId: "molycourse.online", flags: 0x01, signCount: 3 });
  const noUvSig = crypto.sign("sha256", Buffer.concat([noUvAuthData, clientHash]), privateKey);
  await assert.rejects(
    () => verifyTeacherBiometricAssertion({
      teacherId: 42,
      purpose: "attendance",
      sessionId: 99,
      type: "check_in",
      challengeToken: assertBegin.challengeToken,
      credentialId: credId,
      clientDataJSON: toBase64Url(assertClientData),
      authenticatorData: toBase64Url(noUvAuthData),
      signature: toBase64Url(noUvSig),
      db: mockDb,
    }),
    (err) => err.code === "USER_VERIFICATION_REQUIRED",
  );

  // 4. Reject tampered signature
  const badSig = Buffer.from(sig);
  badSig[badSig.length - 1] ^= 0xff;
  await assert.rejects(
    () => verifyTeacherBiometricAssertion({
      teacherId: 42,
      purpose: "attendance",
      sessionId: 99,
      type: "check_in",
      challengeToken: assertBegin.challengeToken,
      credentialId: credId,
      clientDataJSON: toBase64Url(assertClientData),
      authenticatorData: toBase64Url(buildAuthData({ rpId: "molycourse.online", flags: 0x05, signCount: 4 })),
      signature: toBase64Url(badSig),
      db: mockDb,
    }),
    (err) => err.code === "INVALID_BIOMETRIC_SIGNATURE",
  );
});
