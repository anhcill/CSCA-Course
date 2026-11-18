import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";
import { createManagedUsername } from "../utils/usernameGenerator.js";
import { hasUnrevokedVideoCourseAccess } from "./videoCourseAccessRevocation.service.js";
import {
  CATALOG_SYNC_SCHEMA_VERSION,
  recordCourseCatalogMutation,
  recordProfileCatalogMutation,
} from "./courseCatalogSync.service.js";
import { safeRecordCurriculumMutation } from "./courseCurriculumSync.service.js";
import {
  ALLOWED_DELEGATED_SCOPES,
  applySequentialLocks,
  emitProgressOutboxEventsForProfile,
  loadProfileUnitsWithProgress,
} from "./delegatedLearning.service.js";
import {
  createIntegrationLogger,
  getIntegrationMetricsSnapshot,
  isCatalogSyncKillSwitchActive,
  isContentSyncKillSwitchActive,
  isDelegatedLearningKillSwitchActive,
  isMolyIntegrationKillSwitchActive,
  isRepairMutationsKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
  resolveCorrelationId,
  sanitizeString,
} from "./integrationLogger.service.js";
import {
  EXTERNAL_ENTITLEMENT_STATUSES,
  ExternalIntegrationError,
  assertRepairMutationsAllowed,
  canonicalHashPayload,
  normalizeExternalId,
  normalizeJsonObject,
  normalizeNullableTimestamp,
  normalizeOptionalText,
  normalizeTimestamp,
  parsePositiveBigIntId,
  resolveExternalCourseMapping,
  runWithTransaction,
} from "./externalCourseMapping.service.js";

const defaultDb = { query, getClient };
const integrationLog = createIntegrationLogger({ component: "moly-integration" });

export const MOLY_SOURCE_SYSTEM = "moly";
export const MOLY_IDENTITY_STATUSES = new Set(["active", "revoked", "expired", "suspended"]);

const CONFLICT_TYPES_REQUIRING_QUARANTINE = new Set([
  "IDENTITY_EMAIL_COLLISION",
  "PRIVILEGED_ROLE_COLLISION",
  "IDENTITY_ALREADY_LINKED",
  "COURSE_MAPPING_MISSING",
  "ENTITLEMENT_CONFLICT",
  "UNRESOLVED_IDENTITY",
  "STALE_EVENT_CONFLICT",
  "MANUAL_REVIEW_REQUIRED",
]);

export class MolyIntegrationError extends ExternalIntegrationError {
  constructor(
    statusCode,
    errorCode,
    message,
    { details = undefined, retryable = false, conflictType = null, conflictContext = {} } = {},
  ) {
    super(statusCode, errorCode, message, details);
    this.name = "MolyIntegrationError";
    this.retryable = Boolean(retryable);
    this.conflictType = conflictType;
    this.conflictContext = conflictContext;
  }
}

const requireMolySourceSystem = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized !== MOLY_SOURCE_SYSTEM) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_SOURCE_SYSTEM",
      `source_system must be '${MOLY_SOURCE_SYSTEM}' on Moly integration endpoints.`,
    );
  }
  return MOLY_SOURCE_SYSTEM;
};

const requireMolyNamespacedId = (value, fieldName, { disallowEmail = true } = {}) => {
  const trimmed = normalizeExternalId(value, fieldName, 128);
  if (!trimmed.startsWith("moly:") || trimmed.length <= 5) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_EXTERNAL_ID",
      `${fieldName} must be namespaced with 'moly:' (for example 'moly:541').`,
    );
  }
  if (disallowEmail && trimmed.slice(5).includes("@")) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_EXTERNAL_ID",
      `${fieldName} must be an opaque canonical ID, never an email address.`,
    );
  }
  return trimmed;
};

const requireMolyOfferingId = (value, fieldName) => {
  const trimmed = normalizeExternalId(value, fieldName, 128);
  if (trimmed.includes("@")) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_EXTERNAL_ID",
      `${fieldName} must be an opaque canonical ID, never an email address.`,
    );
  }
  return trimmed;
};

const resolveEnvelopeIds = (body, headerMeta = {}) => {
  const eventId = normalizeExternalId(body.event_id, "event_id", 128);
  const headerIdem = headerMeta.idempotencyKey ? String(headerMeta.idempotencyKey).trim() : null;
  const bodyIdem = body.idempotency_key !== undefined && body.idempotency_key !== null
    ? normalizeExternalId(body.idempotency_key, "idempotency_key", 180)
    : null;
  if (headerIdem && bodyIdem && headerIdem !== bodyIdem) {
    throw new ExternalIntegrationError(
      400,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Body idempotency_key does not match Idempotency-Key header.",
    );
  }
  const idempotencyKey = bodyIdem || headerIdem;
  if (!idempotencyKey) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "idempotency_key is required.");
  }
  const correlationId = normalizeOptionalText(
    body.correlation_id ?? headerMeta.correlationId,
    128,
    "correlation_id",
  );
  if (!correlationId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "correlation_id is required.");
  }
  return { eventId, idempotencyKey, correlationId };
};

const normalizeEmailHint = (rawEmail) => {
  const cleaned = normalizeOptionalText(rawEmail, 255, "email_hint");
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "profile.email_hint must be a valid email.");
  }
  return normalized;
};

export const parseProvisionWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const accountStatusRaw = typeof rawBody.account_status === "string"
    ? rawBody.account_status.trim().toLowerCase()
    : "active";
  if (!MOLY_IDENTITY_STATUSES.has(accountStatusRaw)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid account_status value.");
  }
  const profileObj = normalizeJsonObject(rawBody.profile, "profile");
  const fullName = normalizeOptionalText(profileObj.full_name, 120, "profile.full_name");
  const emailHint = normalizeEmailHint(profileObj.email_hint);
  const emailVerified = profileObj.email_verified === true;
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    source_updated_at: sourceUpdatedAt.toISOString(),
    account_status: accountStatusRaw,
    profile: {
      full_name: fullName,
      email_hint: emailHint,
      email_verified: emailVerified,
    },
    metadata,
  };

  return {
    eventType: "user.provisioned",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    sourceUpdatedAt,
    accountStatus: accountStatusRaw,
    profile: { fullName, emailHint, emailVerified },
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "user.provisioned", ...canonicalWire }),
  };
};

export const parseGrantWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const externalCourseId = requireMolyOfferingId(rawBody.external_course_id, "external_course_id");
  const externalGrantId = requireMolyNamespacedId(rawBody.external_grant_id, "external_grant_id");
  const status = typeof rawBody.status === "string" ? rawBody.status.trim().toLowerCase() : "active";
  if (!EXTERNAL_ENTITLEMENT_STATUSES.has(status) || status === "revoked") {
    throw new ExternalIntegrationError(
      422,
      "INVALID_ENTITLEMENT_STATUS",
      "Grant endpoint status must be active, suspended, or expired.",
    );
  }
  const validFrom = normalizeTimestamp(rawBody.valid_from, "valid_from");
  const validUntil = normalizeNullableTimestamp(rawBody.valid_until, "valid_until");
  if (validUntil && validUntil <= validFrom) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "valid_until must be later than valid_from.");
  }
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    external_course_id: externalCourseId,
    external_grant_id: externalGrantId,
    status,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil ? validUntil.toISOString() : null,
    source_updated_at: sourceUpdatedAt.toISOString(),
    metadata,
  };

  return {
    eventType: "entitlement.granted",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    validFrom,
    validUntil,
    revokedAt: null,
    reason: null,
    sourceUpdatedAt,
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "entitlement.granted", ...canonicalWire }),
  };
};

export const parseRevokeWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const externalCourseId = requireMolyOfferingId(rawBody.external_course_id, "external_course_id");
  const externalGrantId = requireMolyNamespacedId(rawBody.external_grant_id, "external_grant_id");
  const status = typeof rawBody.status === "string" ? rawBody.status.trim().toLowerCase() : "revoked";
  if (!["revoked", "suspended", "expired"].includes(status)) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_ENTITLEMENT_STATUS",
      "Revoke endpoint status must be revoked, suspended, or expired.",
    );
  }
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const revokedAt = status === "revoked"
    ? normalizeTimestamp(rawBody.revoked_at ?? sourceUpdatedAt, "revoked_at")
    : null;
  const reason = normalizeOptionalText(rawBody.reason ?? rawBody.revoke_reason, 500, "reason");
  const validFrom = normalizeNullableTimestamp(rawBody.valid_from, "valid_from");
  const validUntil = normalizeNullableTimestamp(rawBody.valid_until, "valid_until");
  if (validFrom && validUntil && validUntil <= validFrom) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "valid_until must be later than valid_from.");
  }
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    external_course_id: externalCourseId,
    external_grant_id: externalGrantId,
    status,
    revoked_at: revokedAt ? revokedAt.toISOString() : null,
    reason,
    valid_from: validFrom ? validFrom.toISOString() : null,
    valid_until: validUntil ? validUntil.toISOString() : null,
    source_updated_at: sourceUpdatedAt.toISOString(),
    metadata,
  };

  return {
    eventType: "entitlement.revoked",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    validFrom,
    validUntil,
    revokedAt,
    reason,
    sourceUpdatedAt,
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "entitlement.revoked", ...canonicalWire }),
  };
};

export const parseOwnershipQueryWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const correlationId = normalizeOptionalText(
    rawBody.correlation_id ?? headerMeta.correlationId,
    128,
    "correlation_id",
  );
  const subject = normalizeJsonObject(rawBody.subject, "subject");
  const subjectSource = requireMolySourceSystem(subject.source_system ?? MOLY_SOURCE_SYSTEM);
  const externalUserId = requireMolyNamespacedId(subject.external_user_id, "subject.external_user_id");
  const externalCourseIdsRaw = Array.isArray(rawBody.external_course_ids)
    ? rawBody.external_course_ids
    : [];
  const externalCourseIds = [...new Set(
    externalCourseIdsRaw.map((id, idx) => requireMolyOfferingId(id, `external_course_ids[${idx}]`)),
  )];
  if (externalCourseIds.length > 100) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "external_course_ids cannot exceed 100 entries.");
  }

  return {
    correlationId,
    subjectSourceSystem: subjectSource,
    externalUserId,
    externalCourseIds,
  };
};

/**
 * Persists a verified Moly integration webhook event into `integration_inbox`
 * before processing. Deduplicates identical retries cleanly and raises `409` on
 * conflicting payload hashes for a reused `event_id` or `idempotency_key`.
 */
export const enqueueMolyIntegrationEvent = async (
  db = defaultDb,
  parsedEnvelope,
  { headersSnapshot = {}, maxAttempts = 5 } = {},
) => {
  const safeHeaders = {
    correlation_id: headersSnapshot.correlationId || parsedEnvelope.correlationId,
    event_timestamp: headersSnapshot.eventTimestamp || null,
    idempotency_key: headersSnapshot.idempotencyKey || parsedEnvelope.idempotencyKey,
  };

  return runWithTransaction(db, async (tx) => {
    const insertedRes = await tx.query(
      `INSERT INTO integration_inbox (
         source_system, event_id, idempotency_key, correlation_id, event_type,
         payload_hash, payload, headers_snapshot, source_updated_at, status,
         attempt_count, max_attempts, next_retry_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'pending', 0, $10, NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        parsedEnvelope.sourceSystem,
        parsedEnvelope.eventId,
        parsedEnvelope.idempotencyKey,
        parsedEnvelope.correlationId,
        parsedEnvelope.eventType,
        parsedEnvelope.payloadHash,
        JSON.stringify(parsedEnvelope.wirePayload),
        JSON.stringify(safeHeaders),
        parsedEnvelope.sourceUpdatedAt.toISOString(),
        Math.max(1, Number(maxAttempts) || 5),
      ],
    );

    if (insertedRes.rows[0]) {
      const row = insertedRes.rows[0];
      return {
        outcome: "queued",
        httpStatus: 202,
        inbox: row,
        body: {
          success: true,
          queued: true,
          correlation_id: row.correlation_id,
          data: {
            inbox_id: Number(row.id),
            event_id: row.event_id,
            idempotency_key: row.idempotency_key,
            source_system: row.source_system,
            event_type: row.event_type,
            status: row.status,
            received_at: row.received_at,
          },
        },
      };
    }

    const existingRes = await tx.query(
      `SELECT *
       FROM integration_inbox
       WHERE source_system = $1
         AND (event_id = $2 OR idempotency_key = $3)
       ORDER BY id ASC`,
      [parsedEnvelope.sourceSystem, parsedEnvelope.eventId, parsedEnvelope.idempotencyKey],
    );
    const matches = existingRes.rows;
    if (matches.length !== 1 || matches[0].payload_hash !== parsedEnvelope.payloadHash) {
      throw new ExternalIntegrationError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "Event ID or Idempotency-Key is already bound to a different payload.",
        {
          event_id: parsedEnvelope.eventId,
          idempotency_key: parsedEnvelope.idempotencyKey,
        },
      );
    }

    const existing = matches[0];
    return {
      outcome: "duplicate",
      httpStatus: 200,
      inbox: existing,
      body: existing.response_body && typeof existing.response_body === "object"
        ? { ...existing.response_body, duplicate: true }
        : {
          success: true,
          duplicate: true,
          queued: existing.status === "pending" || existing.status === "processing",
          correlation_id: existing.correlation_id || parsedEnvelope.correlationId,
          data: {
            inbox_id: Number(existing.id),
            event_id: existing.event_id,
            idempotency_key: existing.idempotency_key,
            source_system: existing.source_system,
            event_type: existing.event_type,
            status: existing.status,
          },
        },
    };
  });
};

const isPrivilegedLocalAccount = (user) => Boolean(
  user && (user.role === "admin" || user.role === "creator" || user.management_staff_source_id !== null),
);

/**
 * Resolves/provisions a Moly student safely inside an active DB transaction.
 * Rejects auto-linking on matched emails or privileged accounts into `integration_conflicts`.
 */
export const applyMolyUserProvisionTx = async (
  tx,
  envelope,
  { recordAudit = recordAuditEvent } = {},
) => {
  const {
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    sourceUpdatedAt,
    accountStatus,
    profile,
    metadata,
  } = envelope;

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    "moly:identity",
    externalUserId,
  ]);

  const existingIdRes = await tx.query(
    `SELECT *
     FROM external_identities
     WHERE source_system = $1 AND external_user_id = $2
     FOR UPDATE`,
    [sourceSystem, externalUserId],
  );
  const existingIdentity = existingIdRes.rows[0] || null;

  if (existingIdentity) {
    const userRes = await tx.query(
      `SELECT id, username, email, role, management_staff_source_id, is_management_managed, lms_account_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [existingIdentity.user_id],
    );
    const localUser = userRes.rows[0];
    if (!localUser) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        `Linked local user ${existingIdentity.user_id} does not exist.`,
        {
          conflictType: "MANUAL_REVIEW_REQUIRED",
          conflictContext: { externalUserId, emailHint: profile.emailHint },
        },
      );
    }
    if (isPrivilegedLocalAccount(localUser)) {
      throw new MolyIntegrationError(
        409,
        "PRIVILEGED_ROLE_COLLISION",
        `Linked local account holds privileged role '${localUser.role}'; integration updates require manual review.`,
        {
          conflictType: "PRIVILEGED_ROLE_COLLISION",
          conflictContext: {
            externalUserId,
            candidateUserId: Number(localUser.id),
            existingUserId: Number(localUser.id),
            emailHint: profile.emailHint,
            candidateRole: localUser.role,
          },
        },
      );
    }

    const storedTs = new Date(existingIdentity.source_updated_at);
    if (sourceUpdatedAt < storedTs
      || (sourceUpdatedAt.getTime() === storedTs.getTime() && accountStatus !== existingIdentity.status)) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: "integration.external_identity_stale_ignored",
        entityType: "external_identity",
        entityId: Number(existingIdentity.id),
        beforeState: existingIdentity,
        afterState: existingIdentity,
        metadata: {
          correlationId,
          eventId,
          idempotencyKey,
          incomingSourceUpdatedAt: sourceUpdatedAt.toISOString(),
          storedSourceUpdatedAt: storedTs.toISOString(),
        },
      });
      return {
        outcome: "stale",
        errorCode: "STALE_EVENT",
        errorMessage: "A strictly newer source_updated_at is required to change identity status.",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_user_id: externalUserId,
          local_user_id: Number(localUser.id),
          identity_id: Number(existingIdentity.id),
          status: existingIdentity.status,
          inbox_status: "stale",
          link_action: "stale_ignored",
          current_source_updated_at: storedTs.toISOString(),
          applied: false,
        },
      };
    }

    const updatedRes = await tx.query(
      `UPDATE external_identities
       SET status = $1,
           email_snapshot = COALESCE($2, email_snapshot),
           source_updated_at = $3,
           last_synced_at = NOW(),
           correlation_id = $4,
           metadata = external_identities.metadata || $5::jsonb
       WHERE id = $6
       RETURNING *`,
      [
        accountStatus,
        profile.emailHint,
        sourceUpdatedAt.toISOString(),
        correlationId,
        JSON.stringify(metadata || {}),
        existingIdentity.id,
      ],
    );
    const updatedIdentity = updatedRes.rows[0];

    if (profile.fullName) {
      await tx.query(
        `INSERT INTO student_profiles (user_id, full_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name = COALESCE(student_profiles.full_name, EXCLUDED.full_name),
           updated_at = NOW()`,
        [localUser.id, profile.fullName],
      );
    }

    await recordAudit({
      db: tx,
      actorId: null,
      action: "integration.external_identity_synced",
      entityType: "external_identity",
      entityId: Number(updatedIdentity.id),
      beforeState: existingIdentity,
      afterState: updatedIdentity,
      metadata: { correlationId, eventId, idempotencyKey, sourceSystem },
    });

    return {
      outcome: "applied",
      responseStatus: 200,
      data: {
        event_id: eventId,
        source_system: sourceSystem,
        external_user_id: externalUserId,
        local_user_id: Number(localUser.id),
        identity_id: Number(updatedIdentity.id),
        status: updatedIdentity.status,
        link_action: "already_linked",
        source_updated_at: updatedIdentity.source_updated_at,
        applied: true,
      },
    };
  }

  if (profile.emailHint) {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      "moly:email",
      profile.emailHint,
    ]);

    const matchedUsersRes = await tx.query(
      `SELECT id, username, email, role, email_verified, management_staff_source_id, is_management_managed
       FROM users
       WHERE LOWER(email) = LOWER($1)
       ORDER BY id ASC
       FOR UPDATE`,
      [profile.emailHint],
    );
    const matchedUser = matchedUsersRes.rows[0] || null;
    if (matchedUser) {
      if (isPrivilegedLocalAccount(matchedUser)) {
        throw new MolyIntegrationError(
          409,
          "PRIVILEGED_ROLE_COLLISION",
          `Email hint matches privileged local account (role '${matchedUser.role}'); automatic linking is forbidden.`,
          {
            conflictType: "PRIVILEGED_ROLE_COLLISION",
            conflictContext: {
              externalUserId,
              emailHint: profile.emailHint,
              candidateUserId: Number(matchedUser.id),
              candidateRole: matchedUser.role,
              reason: `Matched local account holds role '${matchedUser.role}'; automatic linking is forbidden.`,
            },
          },
        );
      }

      const linkedOtherRes = await tx.query(
        `SELECT id, external_user_id
         FROM external_identities
         WHERE user_id = $1 AND source_system = $2 AND status IN ('active', 'suspended')
         LIMIT 1`,
        [matchedUser.id, sourceSystem],
      );
      if (linkedOtherRes.rows[0]) {
        throw new MolyIntegrationError(
          409,
          "IDENTITY_ALREADY_LINKED",
          `Existing local student ${matchedUser.id} is already linked to ${linkedOtherRes.rows[0].external_user_id}.`,
          {
            conflictType: "IDENTITY_ALREADY_LINKED",
            conflictContext: {
              externalUserId,
              emailHint: profile.emailHint,
              candidateUserId: Number(matchedUser.id),
              existingUserId: Number(matchedUser.id),
              existingExternalUserId: linkedOtherRes.rows[0].external_user_id,
              reason: `Local student is already linked to ${linkedOtherRes.rows[0].external_user_id}; refusing email merge.`,
            },
          },
        );
      }

      // Security invariant: never auto-link merely from matching email.
      throw new MolyIntegrationError(
        409,
        "IDENTITY_EMAIL_COLLISION",
        "Email hint matches an existing student account; manual verification or SSO linking is required.",
        {
          conflictType: "IDENTITY_EMAIL_COLLISION",
          conflictContext: {
            externalUserId,
            emailHint: profile.emailHint,
            candidateUserId: Number(matchedUser.id),
            reason: "Matching email cannot auto-link accounts without explicit verified ownership or admin review.",
          },
        },
      );
    }
  }

  const username = await createManagedUsername(tx, "moly", externalUserId, {
    email: profile.emailHint,
    fullName: profile.fullName,
  });
  const syntheticEmail = profile.emailHint
    || `ext-moly-${crypto.createHash("sha256").update(externalUserId).digest("hex").slice(0, 16)}@external.moly.invalid`;

  // Pure external learner: never mark is_management_managed = TRUE.
  const createdUserRes = await tx.query(
    `INSERT INTO users (
       username, email, password_hash, email_verified, role,
       is_management_managed, lms_account_status
     )
     VALUES ($1, $2, NULL, FALSE, 'user', FALSE, 'unmanaged')
     RETURNING id, username, email, role, is_management_managed, lms_account_status`,
    [username, syntheticEmail],
  );
  const createdUser = createdUserRes.rows[0];

  if (profile.fullName) {
    await tx.query(
      `INSERT INTO student_profiles (user_id, full_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = COALESCE(student_profiles.full_name, EXCLUDED.full_name),
         updated_at = NOW()`,
      [createdUser.id, profile.fullName],
    );
  }

  const identityRes = await tx.query(
    `INSERT INTO external_identities (
       source_system, external_user_id, user_id, status, email_snapshot,
       link_method, source_updated_at, last_synced_at, correlation_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, 'provisioned', $6, NOW(), $7, $8::jsonb)
     RETURNING *`,
    [
      sourceSystem,
      externalUserId,
      createdUser.id,
      accountStatus,
      profile.emailHint,
      sourceUpdatedAt.toISOString(),
      correlationId,
      JSON.stringify(metadata || {}),
    ],
  );
  const newIdentity = identityRes.rows[0];

  await recordAudit({
    db: tx,
    actorId: null,
    action: "integration.external_identity_provisioned",
    entityType: "external_identity",
    entityId: Number(newIdentity.id),
    beforeState: null,
    afterState: {
      identity: newIdentity,
      user: {
        id: Number(createdUser.id),
        username: createdUser.username,
        role: createdUser.role,
        isManagementManaged: createdUser.is_management_managed,
      },
    },
    metadata: { correlationId, eventId, idempotencyKey, sourceSystem },
  });

  return {
    outcome: "applied",
    responseStatus: 200,
    data: {
      event_id: eventId,
      source_system: sourceSystem,
      external_user_id: externalUserId,
      local_user_id: Number(createdUser.id),
      identity_id: Number(newIdentity.id),
      status: newIdentity.status,
      link_action: "provisioned",
      source_updated_at: newIdentity.source_updated_at,
      applied: true,
    },
  };
};

const syncCourseEnrollmentProjectionTx = async (
  tx,
  {
    userId,
    sourceSystem,
    entitlementId,
    localCourseId,
    localVideoCourseProfileId,
    isRevokeTombstone = false,
  },
) => {
  // Serialize concurrent grant/revoke/refund entitlement projections per (user, course)
  // across sibling grants so active Management or sibling offering grants are never clobbered.
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `moly:enroll:${userId}`,
    String(localCourseId),
  ]);

  // 1. Course-level `enrollments` status reflects combined active rights across
  // Management and all external systems so revoking one never strips another.
  const anyActiveCourseRes = await tx.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1
       FROM lms_access_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.user_id = $1
         AND g.course_id = $2
         AND g.access_status = 'active'
         AND g.valid_from <= NOW()
         AND (g.valid_until IS NULL OR g.valid_until > NOW())
         AND (u.is_internal_test_account = TRUE OR u.is_management_managed = FALSE OR u.lms_account_status = 'active')
     )
     OR EXISTS (
       SELECT 1
       FROM external_entitlements ee
       JOIN external_identities ei ON ei.id = ee.external_identity_id
       WHERE ee.user_id = $1
         AND ee.local_course_id = $2
         AND ei.status = 'active'
         AND ee.status = 'active'
         AND ee.valid_from <= NOW()
         AND (ee.valid_until IS NULL OR ee.valid_until > NOW())
     )`,
    [userId, localCourseId],
  );
  const courseStillActive = anyActiveCourseRes.rows.length > 0;

  if (courseStillActive) {
    await tx.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active'`,
      [userId, localCourseId],
    );
  } else if (!isRevokeTombstone) {
    await tx.query(
      `UPDATE enrollments
       SET status = 'revoked'
       WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [userId, localCourseId],
    );
  }

  // 2. Scoped Record membership row (`class_enrollments`), strictly isolated by
  // `enrollment_source` and `video_course_profile_id` so Management rows are untouched
  // and mapping 1 profile never unlocks sibling profiles on the same course.
  // Keep scheduled grants projected too; request-time entitlement checks enforce
  // valid_from, so access starts on time without needing another webhook.
  const activeExternalScopeRes = await tx.query(
    `SELECT ee.id
     FROM external_entitlements ee
     JOIN external_identities ei ON ei.id = ee.external_identity_id
     WHERE ee.user_id = $1
       AND ee.source_system = $2
       AND ee.local_course_id = $3
       AND (
         ($4::bigint IS NULL AND ee.local_video_course_profile_id IS NULL)
         OR ee.local_video_course_profile_id = $4
       )
       AND ei.status = 'active'
       AND ee.status = 'active'
       AND (ee.valid_until IS NULL OR ee.valid_until > NOW())
     ORDER BY ee.source_updated_at DESC, ee.id DESC
     LIMIT 1`,
    [userId, sourceSystem, localCourseId, localVideoCourseProfileId],
  );
  const activeScopeEntitlement = activeExternalScopeRes.rows[0] || null;

  if (activeScopeEntitlement) {
    if (localVideoCourseProfileId !== null) {
      await tx.query(
        `INSERT INTO class_enrollments (
           user_id, course_id, live_class_id, video_course_profile_id,
           learning_mode, status, external_entitlement_id, enrollment_source
         )
         VALUES ($1, $2, NULL, $3, 'recording', 'active', $4, $5)
         ON CONFLICT (user_id, video_course_profile_id, enrollment_source)
         WHERE video_course_profile_id IS NOT NULL AND live_class_id IS NULL
         DO UPDATE SET
           course_id = EXCLUDED.course_id,
           status = 'active',
           learning_mode = 'recording',
           ended_at = NULL,
           external_entitlement_id = EXCLUDED.external_entitlement_id`,
        [userId, localCourseId, localVideoCourseProfileId, activeScopeEntitlement.id, sourceSystem],
      );
    } else {
      await tx.query(
        `INSERT INTO class_enrollments (
           user_id, course_id, live_class_id, video_course_profile_id,
           learning_mode, status, external_entitlement_id, enrollment_source
         )
         VALUES ($1, $2, NULL, NULL, 'recording', 'active', $3, $4)
         ON CONFLICT (user_id, course_id, enrollment_source)
         WHERE video_course_profile_id IS NULL
           AND live_class_id IS NULL
           AND management_class_alias_id IS NULL
           AND enrollment_source <> 'local'
         DO UPDATE SET
           status = 'active',
           learning_mode = 'recording',
           ended_at = NULL,
           external_entitlement_id = EXCLUDED.external_entitlement_id`,
        [userId, localCourseId, activeScopeEntitlement.id, sourceSystem],
      );
    }
  } else {
    await tx.query(
      `UPDATE class_enrollments
       SET status = 'revoked',
           ended_at = NOW()
       WHERE user_id = $1
         AND enrollment_source = $2
         AND live_class_id IS NULL
         AND status <> 'revoked'
         AND (
           ($3::bigint IS NULL AND video_course_profile_id IS NULL AND course_id = $4)
           OR video_course_profile_id = $3
         )`,
      [userId, sourceSystem, localVideoCourseProfileId, localCourseId],
    );
  }
};

const isEqualIsoWindow = (a, b) => {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  return ta === tb;
};

/**
 * Applies `entitlement.granted` or `entitlement.revoked` inside a transaction
 * with strict monotonic timestamp ordering, revoke-before-grant tombstone retention,
 * immutable offering binding, and offering-scoped Record projection.
 */
export const applyMolyEntitlementLifecycleTx = async (
  tx,
  envelope,
  { recordAudit = recordAuditEvent } = {},
) => {
  const {
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    sourceUpdatedAt,
    reason,
    metadata,
  } = envelope;

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    sourceSystem,
    externalGrantId,
  ]);

  const currentRes = await tx.query(
    `SELECT *
     FROM external_entitlements
     WHERE source_system = $1 AND external_grant_id = $2
     FOR UPDATE`,
    [sourceSystem, externalGrantId],
  );
  const current = currentRes.rows[0] || null;

  const identityRes = await tx.query(
    `SELECT ei.*, u.role AS local_user_role, u.management_staff_source_id
     FROM external_identities ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.source_system = $1 AND ei.external_user_id = $2
     FOR SHARE OF ei`,
    [sourceSystem, externalUserId],
  );
  const identity = identityRes.rows[0] || null;
  if (!identity) {
    throw new MolyIntegrationError(
      409,
      "UNRESOLVED_IDENTITY",
      `External user '${externalUserId}' has not been provisioned or linked yet.`,
      {
        retryable: true,
        conflictType: "UNRESOLVED_IDENTITY",
        conflictContext: { externalUserId, externalCourseId, externalGrantId },
      },
    );
  }
  if (isPrivilegedLocalAccount({
    role: identity.local_user_role,
    management_staff_source_id: identity.management_staff_source_id,
  })) {
    throw new MolyIntegrationError(
      409,
      "PRIVILEGED_ROLE_COLLISION",
      `Linked account '${identity.user_id}' holds privileged role '${identity.local_user_role}'.`,
      {
        conflictType: "PRIVILEGED_ROLE_COLLISION",
        conflictContext: {
          externalUserId,
          externalCourseId,
          externalGrantId,
          candidateUserId: Number(identity.user_id),
          existingUserId: Number(identity.user_id),
        },
      },
    );
  }
  if (status === "active" && identity.status !== "active") {
    throw new MolyIntegrationError(
      409,
      "IDENTITY_INACTIVE",
      `External identity '${externalUserId}' is '${identity.status}'; cannot activate entitlement.`,
      {
        conflictType: "MANUAL_REVIEW_REQUIRED",
        conflictContext: {
          externalUserId,
          externalCourseId,
          externalGrantId,
          existingUserId: Number(identity.user_id),
        },
      },
    );
  }

  if (current) {
    if (
      current.external_user_id !== externalUserId
      || current.external_course_id !== externalCourseId
      || Number(current.user_id) !== Number(identity.user_id)
    ) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        "Grant subject and offering are immutable and conflict with existing entitlement record.",
        {
          conflictType: "ENTITLEMENT_CONFLICT",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(current.user_id),
            candidateUserId: Number(identity.user_id),
            localCourseId: Number(current.local_course_id),
          },
        },
      );
    }

    const storedTs = new Date(current.source_updated_at);
    const sameStateAndWindow = (
      current.status === status
      && (!envelope.validFrom || isEqualIsoWindow(current.valid_from, envelope.validFrom))
      && (envelope.validUntil === undefined || envelope.validUntil === null
        ? current.valid_until === null || envelope.eventType === "entitlement.revoked"
        : isEqualIsoWindow(current.valid_until, envelope.validUntil))
      && (status !== "revoked" || current.revoke_reason === (reason ?? current.revoke_reason))
    );

    if (sourceUpdatedAt < storedTs || (sourceUpdatedAt.getTime() === storedTs.getTime() && !sameStateAndWindow)) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: "integration.entitlement_stale_ignored",
        entityType: "external_entitlement",
        entityId: Number(current.id),
        beforeState: current,
        afterState: current,
        metadata: {
          correlationId,
          eventId,
          idempotencyKey,
          incomingSourceUpdatedAt: sourceUpdatedAt.toISOString(),
          storedSourceUpdatedAt: storedTs.toISOString(),
        },
      });
      return {
        outcome: "stale",
        errorCode: "STALE_EVENT",
        errorMessage: "A strictly newer source_updated_at is required to modify entitlement state.",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_grant_id: externalGrantId,
          inbox_status: "stale",
          current_status: current.status,
          current_source_updated_at: storedTs.toISOString(),
          applied: false,
        },
      };
    }

    if (sourceUpdatedAt.getTime() === storedTs.getTime() && sameStateAndWindow) {
      return {
        outcome: "applied",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_grant_id: externalGrantId,
          external_user_id: externalUserId,
          external_course_id: externalCourseId,
          local_user_id: Number(current.user_id),
          local_course_id: Number(current.local_course_id),
          local_video_course_profile_id: current.local_video_course_profile_id == null
            ? null
            : Number(current.local_video_course_profile_id),
          status: current.status,
          source_updated_at: storedTs.toISOString(),
          applied: true,
          duplicate_state: true,
        },
      };
    }
  }

  let mappingId = current?.course_mapping_id ? Number(current.course_mapping_id) : null;
  let localCourseId = current?.local_course_id ? Number(current.local_course_id) : null;
  let localVideoCourseProfileId = current?.local_video_course_profile_id != null
    ? Number(current.local_video_course_profile_id)
    : null;
  let localLiveClassId = current?.local_live_class_id != null
    ? Number(current.local_live_class_id)
    : null;

  if (!current || status === "active") {
    let mapping;
    try {
      mapping = await resolveExternalCourseMapping(tx, {
        sourceSystem,
        externalCourseId,
        requireActive: status === "active",
      });
    } catch (err) {
      if (err instanceof ExternalIntegrationError && err.errorCode === "COURSE_MAPPING_MISSING") {
        throw new MolyIntegrationError(422, "COURSE_MAPPING_MISSING", err.message, {
          details: err.details,
          retryable: false,
          conflictType: "COURSE_MAPPING_MISSING",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(identity.user_id),
          },
        });
      }
      throw err;
    }

    let profileSourceLiveClassId = mapping.localLiveClassId;
    if (mapping.localVideoCourseProfileId !== null && profileSourceLiveClassId === null) {
      const profileRes = await tx.query(
        "SELECT source_live_class_id FROM video_course_profiles WHERE id = $1",
        [mapping.localVideoCourseProfileId],
      );
      if (profileRes.rows[0]?.source_live_class_id != null) {
        profileSourceLiveClassId = Number(profileRes.rows[0].source_live_class_id);
      }
    }

    if (
      current
      && (
        Number(current.local_course_id) !== mapping.localCourseId
        || (current.local_video_course_profile_id == null ? null : Number(current.local_video_course_profile_id))
          !== (mapping.localVideoCourseProfileId ?? null)
      )
    ) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        "Manual course mapping destination changed for an existing grant; refusing silent reassignment.",
        {
          conflictType: "ENTITLEMENT_CONFLICT",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(current.user_id),
            localCourseId: Number(current.local_course_id),
          },
        },
      );
    }

    mappingId = mapping.id;
    localCourseId = mapping.localCourseId;
    localVideoCourseProfileId = mapping.localVideoCourseProfileId;
    localLiveClassId = profileSourceLiveClassId;
  }

  const effectiveRevokedAt = status === "revoked"
    ? (envelope.revokedAt || sourceUpdatedAt)
    : null;
  const effectiveValidFrom = envelope.validFrom
    || (current?.valid_from ? new Date(current.valid_from) : (effectiveRevokedAt || sourceUpdatedAt));
  let effectiveValidUntil = null;
  if (envelope.validUntil !== undefined && envelope.validUntil !== null) {
    effectiveValidUntil = envelope.validUntil;
  } else if (status !== "active" && current?.valid_until) {
    effectiveValidUntil = new Date(current.valid_until);
  }
  const safeValidUntil = effectiveValidUntil && effectiveValidUntil > effectiveValidFrom
    ? effectiveValidUntil
    : null;

  const upsertRes = await tx.query(
    `INSERT INTO external_entitlements (
       source_system, external_grant_id, external_user_id, external_course_id,
       user_id, local_course_id, course_mapping_id, external_identity_id,
       local_video_course_profile_id, local_live_class_id,
       status, valid_from, valid_until, revoked_at, revoke_reason,
       source_updated_at, last_event_id, correlation_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
     ON CONFLICT (source_system, external_grant_id) DO UPDATE SET
       status = EXCLUDED.status,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       revoked_at = EXCLUDED.revoked_at,
       revoke_reason = EXCLUDED.revoke_reason,
       external_identity_id = EXCLUDED.external_identity_id,
       source_updated_at = EXCLUDED.source_updated_at,
       last_event_id = EXCLUDED.last_event_id,
       correlation_id = EXCLUDED.correlation_id,
       metadata = external_entitlements.metadata || EXCLUDED.metadata
     WHERE external_entitlements.source_updated_at < EXCLUDED.source_updated_at
     RETURNING *`,
    [
      sourceSystem,
      externalGrantId,
      externalUserId,
      externalCourseId,
      identity.user_id,
      localCourseId,
      mappingId,
      identity.id,
      localVideoCourseProfileId,
      localLiveClassId,
      status,
      effectiveValidFrom.toISOString(),
      safeValidUntil ? safeValidUntil.toISOString() : null,
      effectiveRevokedAt ? effectiveRevokedAt.toISOString() : null,
      status === "revoked" ? reason : null,
      sourceUpdatedAt.toISOString(),
      eventId,
      correlationId,
      JSON.stringify(metadata || {}),
    ],
  );
  const saved = upsertRes.rows[0];
  if (!saved) {
    throw new MolyIntegrationError(
      409,
      "ENTITLEMENT_CONFLICT",
      "Concurrent update rejected by strict source_updated_at monotonicity.",
      { retryable: true },
    );
  }

  await syncCourseEnrollmentProjectionTx(tx, {
    userId: Number(saved.user_id),
    sourceSystem,
    entitlementId: Number(saved.id),
    localCourseId: Number(saved.local_course_id),
    localVideoCourseProfileId,
    isRevokeTombstone: !current && status !== "active",
  });

  await recordAudit({
    db: tx,
    actorId: null,
    action: status === "active"
      ? "integration.entitlement_granted"
      : (!current ? "integration.entitlement_revoked_tombstone" : "integration.entitlement_revoked"),
    entityType: "external_entitlement",
    entityId: Number(saved.id),
    beforeState: current,
    afterState: saved,
    metadata: {
      correlationId,
      eventId,
      idempotencyKey,
      sourceSystem,
      localCourseId: Number(saved.local_course_id),
      localVideoCourseProfileId,
    },
  });

  return {
    outcome: "applied",
    responseStatus: 200,
    data: {
      event_id: eventId,
      source_system: sourceSystem,
      external_grant_id: saved.external_grant_id,
      external_user_id: saved.external_user_id,
      external_course_id: saved.external_course_id,
      local_user_id: Number(saved.user_id),
      local_course_id: Number(saved.local_course_id),
      local_video_course_profile_id: localVideoCourseProfileId,
      status: saved.status,
      valid_from: saved.valid_from,
      valid_until: saved.valid_until,
      ...(saved.revoked_at ? { revoked_at: saved.revoked_at } : {}),
      source_updated_at: saved.source_updated_at,
      applied: true,
    },
  };
};

const rebuildEnvelopeFromInboxRow = (row) => {
  const payload = row.payload || {};
  const meta = {
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
  };
  const withEnvelope = {
    ...payload,
    event_id: row.event_id,
    idempotency_key: row.idempotency_key,
    correlation_id: row.correlation_id,
    source_system: row.source_system,
    source_updated_at: payload.source_updated_at || row.source_updated_at,
  };
  if (row.event_type === "user.provisioned") return parseProvisionWirePayload(withEnvelope, meta);
  if (row.event_type === "entitlement.granted") return parseGrantWirePayload(withEnvelope, meta);
  if (row.event_type === "entitlement.revoked") return parseRevokeWirePayload(withEnvelope, meta);
  throw new MolyIntegrationError(
    422,
    "UNSUPPORTED_EVENT_TYPE",
    `Unsupported Moly inbox event_type: ${row.event_type}`,
    { retryable: false },
  );
};

const persistConflictAndFailure = async (
  db,
  job,
  error,
  { retryBaseSeconds = 30, recordAudit = recordAuditEvent } = {},
) => {
  const errorCode = error?.errorCode || error?.code || "WORKER_EXECUTION_ERROR";
  const errorMessage = String(error?.message || "Unknown integration worker error").slice(0, 2000);
  const httpStatus = Number(error?.statusCode) || 500;
  const isRetryable = error instanceof MolyIntegrationError
    ? error.retryable
    : !(error instanceof ExternalIntegrationError);
  const attemptsExhausted = Number(job.attempt_count) >= Number(job.max_attempts);
  const terminal = !isRetryable || attemptsExhausted;

  const conflictType = error instanceof MolyIntegrationError && error.conflictType
    ? error.conflictType
    : null;
  const ctx = (error instanceof MolyIntegrationError ? error.conflictContext : null) || {};

  return runWithTransaction(db, async (tx) => {
    // A reclaimed lease must fence off the previous worker's failure callback.
    const lease = await tx.query(
      `SELECT id FROM integration_inbox
       WHERE id = $1 AND status = 'processing' AND locked_by = $2 AND attempt_count = $3
       FOR UPDATE`,
      [job.id, job.locked_by, job.attempt_count],
    );
    if (!lease.rows[0]) return { status: "lease_lost" };
    let conflictId = null;
    if (terminal && conflictType && CONFLICT_TYPES_REQUIRING_QUARANTINE.has(conflictType)) {
      const conflictRes = await tx.query(
        `INSERT INTO integration_conflicts (
           source_system, conflict_type, status, external_user_id, external_course_id,
           external_grant_id, inbox_id, candidate_user_id, existing_user_id,
           local_course_id, email_hint, correlation_id, source_updated_at, reason, payload
         )
         VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         RETURNING id`,
        [
          job.source_system,
          conflictType,
          ctx.externalUserId || job.payload?.external_user_id || null,
          ctx.externalCourseId || job.payload?.external_course_id || null,
          ctx.externalGrantId || job.payload?.external_grant_id || null,
          job.id,
          ctx.candidateUserId || null,
          ctx.existingUserId || null,
          ctx.localCourseId || null,
          ctx.emailHint || job.payload?.profile?.email_hint || null,
          job.correlation_id || null,
          job.source_updated_at,
          ctx.reason || errorMessage,
          JSON.stringify({
            event_id: job.event_id,
            event_type: job.event_type,
            ...(ctx.candidateRole ? { candidate_role: ctx.candidateRole } : {}),
            ...(ctx.existingExternalUserId ? { existing_external_user_id: ctx.existingExternalUserId } : {}),
          }),
        ],
      );
      conflictId = Number(conflictRes.rows[0].id);
    }

    const delaySeconds = Math.min(3600, Math.max(0, Number(retryBaseSeconds) * (2 ** Math.max(0, Number(job.attempt_count) - 1))));
    const nextStatus = terminal ? "dead_letter" : "failed";
    const responseBody = {
      success: false,
      errorCode,
      message: errorMessage,
      correlation_id: job.correlation_id,
      ...(conflictId ? { conflict_id: conflictId } : {}),
    };

    const updatedRes = await tx.query(
      `UPDATE integration_inbox
       SET status = $1,
           locked_until = NULL,
           locked_by = NULL,
           next_retry_at = CASE WHEN $8::boolean THEN NOW() + ($2::double precision * INTERVAL '1 second') ELSE next_retry_at END,
           last_error_code = $3,
           last_error_message = $4,
           response_status = $5,
           response_body = $6::jsonb
       WHERE id = $7
       RETURNING *`,
      [
        nextStatus,
        delaySeconds,
        String(errorCode).slice(0, 80),
        errorMessage,
        httpStatus,
        JSON.stringify(responseBody),
        job.id,
        nextStatus === "failed",
      ],
    );

    if (terminal) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: conflictId ? "integration.conflict_quarantined" : "integration.inbox_dead_lettered",
        entityType: "integration_inbox",
        entityId: Number(job.id),
        afterState: {
          status: nextStatus,
          errorCode,
          conflictId,
          attemptCount: Number(job.attempt_count),
        },
        metadata: {
          correlationId: job.correlation_id,
          eventId: job.event_id,
          sourceSystem: job.source_system,
        },
      });
    }

    return {
      inbox: updatedRes.rows[0],
      status: nextStatus,
      errorCode,
      conflictId,
      retryable: !terminal,
    };
  });
};

/**
 * Claims and processes the next due or lease-expired Moly inbox job.
 */
export const processNextMolyInboxJob = async ({
  db = defaultDb,
  workerId = "worker-moly",
  leaseSeconds = 300,
  retryBaseSeconds = 30,
  recordAudit = recordAuditEvent,
  handlers = {},
} = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.inbox.halted_kill_switch");
    integrationLog.warn("inbox_halted_kill_switch", { workerId });
    return null;
  }
  const jobStartMs = Date.now();
  const claimed = await runWithTransaction(db, async (tx) => {
    const claimRes = await tx.query(
      `WITH next_job AS (
         SELECT id
         FROM integration_inbox
         WHERE source_system = $1
           AND (
             (status IN ('pending', 'failed') AND next_retry_at <= NOW())
             OR (status = 'processing' AND locked_until < NOW())
           )
         ORDER BY next_retry_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE integration_inbox inbox
       SET status = 'processing',
           locked_until = NOW() + ($2::integer * INTERVAL '1 second'),
           locked_by = $3,
           attempt_count = inbox.attempt_count + 1
       FROM next_job
       WHERE inbox.id = next_job.id
       RETURNING inbox.*`,
      [MOLY_SOURCE_SYSTEM, Math.max(10, Number(leaseSeconds) || 300), workerId],
    );
    return claimRes.rows[0] || null;
  });

  if (!claimed) return null;

  try {
    const outcome = await runWithTransaction(db, async (tx) => {
      // Hold this row through business writes and completion; SKIP LOCKED cannot
      // reclaim an in-flight transaction, even when its wall-clock lease expires.
      const lease = await tx.query(
        `SELECT id FROM integration_inbox
         WHERE id = $1 AND status = 'processing' AND locked_by = $2 AND attempt_count = $3
         FOR UPDATE`,
        [claimed.id, claimed.locked_by, claimed.attempt_count],
      );
      if (!lease.rows[0]) return { status: "lease_lost" };
      const envelope = rebuildEnvelopeFromInboxRow(claimed);
      let result;
      if (envelope.eventType === "user.provisioned") {
        const fn = handlers.applyUserProvision || applyMolyUserProvisionTx;
        result = await fn(tx, envelope, { recordAudit });
      } else {
        const fn = handlers.applyEntitlement || applyMolyEntitlementLifecycleTx;
        result = await fn(tx, envelope, { recordAudit });
      }

      const finalStatus = result.outcome === "stale" ? "stale" : "processed";
      const responseBody = {
        success: true,
        correlation_id: claimed.correlation_id,
        data: result.data,
      };
      const updatedRes = await tx.query(
        `UPDATE integration_inbox
         SET status = $1,
             locked_until = NULL,
             locked_by = NULL,
             processed_at = NOW(),
             last_error_code = $2,
             last_error_message = $3,
             response_status = $4,
             response_body = $5::jsonb
         WHERE id = $6
         RETURNING *`,
        [
          finalStatus,
          result.errorCode || null,
          result.errorMessage || null,
          result.responseStatus || 200,
          JSON.stringify(responseBody),
          claimed.id,
        ],
      );

      return {
        inbox: updatedRes.rows[0],
        status: finalStatus,
        result: responseBody,
      };
    });

    const durationMs = Date.now() - jobStartMs;
    observeIntegrationLatency("moly.inbox.job_ms", durationMs);
    recordIntegrationMetric(`moly.inbox.${outcome?.status || "unknown"}`);
    integrationLog.info(
      "inbox_job_completed",
      {
        inboxId: claimed.id,
        eventId: claimed.event_id,
        eventType: claimed.event_type,
        status: outcome?.status || "unknown",
        durationMs,
      },
      claimed.correlation_id,
    );
    return outcome;
  } catch (error) {
    const durationMs = Date.now() - jobStartMs;
    observeIntegrationLatency("moly.inbox.job_ms", durationMs);
    recordIntegrationMetric("moly.inbox.error");
    integrationLog.warn(
      "inbox_job_failed",
      {
        inboxId: claimed.id,
        eventId: claimed.event_id,
        eventType: claimed.event_type,
        errorCode: error?.errorCode || error?.code || "INBOX_ERROR",
        message: error?.message || "Inbox job failed.",
        durationMs,
      },
      claimed.correlation_id,
    );
    return persistConflictAndFailure(db, claimed, error, { retryBaseSeconds, recordAudit });
  }
};

/**
 * Drains up to `limit` pending/failed/expired-lease Moly inbox jobs cleanly.
 */
export const processAvailableMolyInboxJobs = async ({
  db = defaultDb,
  workerId = "worker-moly",
  limit = 20,
  leaseSeconds = 300,
  retryBaseSeconds = 30,
  recordAudit = recordAuditEvent,
  handlers = {},
} = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.inbox.batch_halted_kill_switch");
    integrationLog.warn("inbox_batch_halted_kill_switch", { workerId, limit });
    return [];
  }
  const results = [];
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 200);
  for (let idx = 0; idx < cap; idx += 1) {
    const item = await processNextMolyInboxJob({
      db,
      workerId,
      leaseSeconds,
      retryBaseSeconds,
      recordAudit,
      handlers,
    });
    if (!item) break;
    results.push(item);
  }
  return results;
};

/**
 * Finds active MIRROR video profiles whose source Live class belongs to another local course
 * where the given user holds an active class_enrollments row.
 */
const loadActiveMirrorGrantLinksForUser = async (db, { userId, targetCourseIds = null, targetProfileId = null } = {}) => {
  if (!userId) return [];
  const cleanIds = Array.isArray(targetCourseIds)
    ? [...new Set(targetCourseIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    : [];
  const res = await db.query(
    `SELECT DISTINCT
            vcp.id AS profile_id,
            vcp.course_id AS target_course_id,
            vcp.source_live_class_id,
            lc.course_id AS source_course_id
     FROM video_course_profiles vcp
     JOIN live_classes lc ON lc.id = vcp.source_live_class_id
     JOIN class_enrollments ce
       ON ce.user_id = $1
      AND ce.status = 'active'
      AND ce.learning_mode = 'live'
      AND ce.live_class_id = vcp.source_live_class_id
     WHERE vcp.status = 'active'
       AND vcp.deleted_at IS NULL
       AND vcp.mode = 'MIRROR'
       AND vcp.source_live_class_id IS NOT NULL
       AND (cardinality($2::bigint[]) = 0 OR vcp.course_id = ANY($2::bigint[]))
       AND ($3::bigint IS NULL OR vcp.id = $3)
     ORDER BY vcp.id ASC`,
    [userId, cleanIds, targetProfileId],
  );
  return res.rows || [];
};

/**
 * Queries course ownership on CSCA-Course for a Moly external user identity across
 * both independent `external_entitlements` and Management `lms_access_grants`
 * mapped through `external_course_mappings`.
 */
export const queryCourseOwnershipForMoly = async (db = defaultDb, rawBody, headerMeta = {}) => {
  const parsed = parseOwnershipQueryWirePayload(rawBody, headerMeta);

  const identityRes = await db.query(
    `SELECT id, source_system, external_user_id, user_id, status
     FROM external_identities
     WHERE source_system = $1 AND external_user_id = $2
     LIMIT 1`,
    [parsed.subjectSourceSystem, parsed.externalUserId],
  );
  const identity = identityRes.rows[0] || null;

  const mappingsRes = parsed.externalCourseIds.length > 0
    ? await db.query(
      `SELECT external_course_id, local_course_id, local_video_course_profile_id, local_live_class_id
       FROM external_course_mappings
       WHERE source_system = $1
         AND external_course_id = ANY($2::text[])
         AND status = 'active'`,
      [parsed.subjectSourceSystem, parsed.externalCourseIds],
    )
    : await db.query(
      `SELECT external_course_id, local_course_id, local_video_course_profile_id, local_live_class_id
       FROM external_course_mappings
       WHERE source_system = $1 AND status = 'active'
       ORDER BY id ASC`,
      [parsed.subjectSourceSystem],
    );

  const mappingByExtId = new Map(mappingsRes.rows.map((m) => [m.external_course_id, m]));
  const orderedCourseIds = parsed.externalCourseIds.length > 0
    ? parsed.externalCourseIds
    : mappingsRes.rows.map((m) => m.external_course_id);

  let extGrants = [];
  let mgmtGrants = [];
  if (identity) {
    extGrants = (await db.query(
      `SELECT ee.id, ee.source_system, ee.external_grant_id, ee.local_course_id, ee.local_video_course_profile_id,
              ee.status, ee.valid_from, ee.valid_until, ee.source_updated_at
       FROM external_entitlements ee
       JOIN external_identities ei ON ei.user_id = ee.user_id
         AND ei.source_system = ee.source_system AND ei.external_user_id = ee.external_user_id
         AND (ee.external_identity_id IS NULL OR ee.external_identity_id = ei.id)
       WHERE ee.user_id = $1 AND ei.status = 'active'
       ORDER BY (ee.status = 'active') DESC, ee.source_updated_at DESC, ee.id DESC`,
      [identity.user_id],
    )).rows;

    mgmtGrants = (await db.query(
      `SELECT g.id, g.course_id AS local_course_id, g.access_status AS status,
              g.valid_from, g.valid_until, g.source_updated_at
       FROM lms_access_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.user_id = $1
         AND (u.is_internal_test_account = TRUE OR u.is_management_managed = FALSE OR u.lms_account_status = 'active')
       ORDER BY (g.access_status = 'active') DESC, g.source_updated_at DESC, g.id DESC`,
      [identity.user_id],
    )).rows;
  }

  const nowMs = Date.now();
  const isGrantActiveNow = (row) => (
    row.status === "active"
    && new Date(row.valid_from).getTime() <= nowMs
    && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs)
  );

  const items = await Promise.all(orderedCourseIds.map(async (extCourseId) => {
    const map = mappingByExtId.get(extCourseId) || null;
    if (!map || !identity || identity.status !== "active") {
      return {
        external_course_id: extCourseId,
        local_course_id: map ? Number(map.local_course_id) : null,
        external_grant_id: null,
        owned: false,
        status: null,
        valid_from: null,
        valid_until: null,
        source_updated_at: null,
      };
    }

    const matchingExt = extGrants.filter(
      (g) => Number(g.local_course_id) === Number(map.local_course_id)
        && (map.local_video_course_profile_id == null
          || g.local_video_course_profile_id == null
          || Number(g.local_video_course_profile_id) === Number(map.local_video_course_profile_id)),
    );
    const matchingMgmt = [...mgmtGrants.filter((g) => Number(g.local_course_id) === Number(map.local_course_id))];
    const mirrorLinks = await loadActiveMirrorGrantLinksForUser(db, {
      userId: identity.user_id,
      targetCourseIds: [Number(map.local_course_id)],
      targetProfileId: map.local_video_course_profile_id ?? null,
    });
    if (mirrorLinks.length > 0) {
      const mirrorSourceCourses = new Set(mirrorLinks.map((m) => Number(m.source_course_id)));
      for (const g of mgmtGrants) {
        if (mirrorSourceCourses.has(Number(g.local_course_id)) && !matchingMgmt.includes(g)) {
          matchingMgmt.push(g);
        }
      }
    }

    const bestActive = matchingExt.find(isGrantActiveNow) || matchingMgmt.find(isGrantActiveNow) || null;
    const fallbackLatest = bestActive || matchingExt[0] || matchingMgmt[0] || null;

    if (!fallbackLatest) {
      return {
        external_course_id: extCourseId,
        local_course_id: Number(map.local_course_id),
        external_grant_id: null,
        owned: false,
        status: null,
        valid_from: null,
        valid_until: null,
        source_updated_at: null,
      };
    }

    const targetProfileId = map.local_video_course_profile_id
      ?? (mirrorLinks.length > 0 && !mgmtGrants.some((g) => Number(g.local_course_id) === Number(map.local_course_id))
        ? mirrorLinks[0].profile_id
        : null);
    const profileAccessible = !bestActive || targetProfileId == null
      ? true
      : await hasUnrevokedVideoCourseAccess({
        db, userId: identity.user_id, courseId: map.local_course_id,
        profileId: targetProfileId,
      });
    return {
      external_course_id: extCourseId,
      local_course_id: Number(map.local_course_id),
      external_grant_id: fallbackLatest.external_grant_id || `internal-management:grant:${fallbackLatest.id}`,
      owned: Boolean(bestActive) && profileAccessible,
      status: fallbackLatest.status,
      valid_from: new Date(fallbackLatest.valid_from).toISOString(),
      valid_until: fallbackLatest.valid_until ? new Date(fallbackLatest.valid_until).toISOString() : null,
      source_updated_at: new Date(fallbackLatest.source_updated_at).toISOString(),
    };
  }));

  return {
    success: true,
    correlation_id: parsed.correlationId,
    data: {
      identity: identity
        ? {
          source_system: identity.source_system,
          external_user_id: identity.external_user_id,
          local_user_id: Number(identity.user_id),
          status: identity.status,
        }
        : {
          source_system: parsed.subjectSourceSystem,
          external_user_id: parsed.externalUserId,
          local_user_id: null,
          status: "unlinked",
        },
      items,
      checked_at: new Date(nowMs).toISOString(),
    },
  };
};

/**
 * Manually and safely binds an existing local student account to an external identity
 * (for admin conflict resolution). Refuses privileged local accounts and preserves existing email.
 */
const linkExternalIdentityTx = async (
  tx,
  {
    sourceSystem = MOLY_SOURCE_SYSTEM,
    externalUserId,
    targetUserId,
    actorId = null,
    status = "active",
    sourceUpdatedAt = new Date(),
  } = {},
  { recordAudit = recordAuditEvent } = {},
) => {
  const normalizedSource = requireMolySourceSystem(sourceSystem);
  const normalizedExtUserId = requireMolyNamespacedId(externalUserId, "externalUserId");
  const parsedTargetUserId = parsePositiveBigIntId(targetUserId, "targetUserId");
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const parsedTimestamp = normalizeTimestamp(sourceUpdatedAt, "sourceUpdatedAt");
  if (!MOLY_IDENTITY_STATUSES.has(status)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid identity status.");
  }

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    "moly:identity",
    normalizedExtUserId,
  ]);

    const userRes = await tx.query(
      `SELECT id, username, email, role, management_staff_source_id, is_management_managed
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [parsedTargetUserId],
    );
    const targetUser = userRes.rows[0];
    if (!targetUser) {
      throw new ExternalIntegrationError(404, "USER_NOT_FOUND", `Local user ${parsedTargetUserId} not found.`);
    }
    if (isPrivilegedLocalAccount(targetUser)) {
      throw new ExternalIntegrationError(
        409,
        "PRIVILEGED_ROLE_COLLISION",
        `Cannot link privileged account (role '${targetUser.role}') to external learner identity.`,
      );
    }

    const otherBoundRes = await tx.query(
      `SELECT id, external_user_id
       FROM external_identities
       WHERE user_id = $1 AND source_system = $2 AND status IN ('active', 'suspended') AND external_user_id <> $3
       LIMIT 1`,
      [parsedTargetUserId, normalizedSource, normalizedExtUserId],
    );
    if (otherBoundRes.rows[0]) {
      throw new ExternalIntegrationError(
        409,
        "IDENTITY_ALREADY_LINKED",
        `Local user ${parsedTargetUserId} is already linked to ${otherBoundRes.rows[0].external_user_id}.`,
      );
    }

    const existingExtRes = await tx.query(
      `SELECT *
       FROM external_identities
       WHERE source_system = $1 AND external_user_id = $2
       FOR UPDATE`,
      [normalizedSource, normalizedExtUserId],
    );
    const existing = existingExtRes.rows[0] || null;
    if (existing && Number(existing.user_id) !== parsedTargetUserId) {
      throw new ExternalIntegrationError(
        409,
        "IDENTITY_ALREADY_LINKED",
        `External identity ${normalizedExtUserId} is already bound to local user ${existing.user_id}.`,
      );
    }
    if (existing && status !== existing.status
      && parsedTimestamp.getTime() <= new Date(existing.source_updated_at).getTime()) {
      throw new ExternalIntegrationError(
        409,
        "STALE_EVENT",
        "A strictly newer source_updated_at is required to change identity status.",
      );
    }

    const savedRes = await tx.query(
      `INSERT INTO external_identities (
         source_system, external_user_id, user_id, status, email_snapshot,
         link_method, source_updated_at, last_synced_at, linked_by
       )
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, NOW(), $7)
       ON CONFLICT (source_system, external_user_id) DO UPDATE SET
         status = EXCLUDED.status,
         link_method = 'manual',
         source_updated_at = GREATEST(external_identities.source_updated_at, EXCLUDED.source_updated_at),
         last_synced_at = NOW(),
         linked_by = COALESCE(EXCLUDED.linked_by, external_identities.linked_by)
       RETURNING *`,
      [
        normalizedSource,
        normalizedExtUserId,
        parsedTargetUserId,
        status,
        targetUser.email,
        parsedTimestamp.toISOString(),
        parsedActorId,
      ],
    );
    const saved = savedRes.rows[0];

    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.external_identity_linked_manually",
      entityType: "external_identity",
      entityId: Number(saved.id),
      beforeState: existing,
      afterState: saved,
      metadata: { sourceSystem: normalizedSource, targetUserId: parsedTargetUserId },
    });

  return {
    identity: saved,
    localUser: {
      id: Number(targetUser.id),
      username: targetUser.username,
      email: targetUser.email,
      role: targetUser.role,
      isManagementManaged: Boolean(targetUser.is_management_managed),
    },
  };
};

/**
 * Manually and safely binds an existing local student account to an external identity
 * (for admin conflict resolution). Refuses privileged local accounts and preserves existing email.
 */
export const linkExternalIdentityManually = async (
  db = defaultDb,
  params = {},
  { recordAudit = recordAuditEvent, env = process.env } = {},
) => {
  assertRepairMutationsAllowed(env, { metricName: "moly.identity.link_blocked_kill_switch" });
  return runWithTransaction(db, (tx) => linkExternalIdentityTx(tx, params, { recordAudit }));
};

export const listIntegrationConflicts = async (db = defaultDb, filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.sourceSystem) {
    params.push(requireMolySourceSystem(filters.sourceSystem));
    conditions.push(`source_system = $${params.length}`);
  }
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const res = await db.query(
    `SELECT * FROM integration_conflicts ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return res.rows;
};

export const resolveIntegrationConflict = async (
  db = defaultDb,
  { conflictId, action, targetUserId = null, resolutionNote = null, actorId = null, replayInbox = true } = {},
  { recordAudit = recordAuditEvent, env = process.env } = {},
) => {
  assertRepairMutationsAllowed(env, { metricName: "moly.conflict.resolve_blocked_kill_switch" });
  const id = parsePositiveBigIntId(conflictId, "conflictId");
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (!["link_existing", "dismiss", "ignore", "resolved"].includes(normalizedAction)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Unsupported conflict resolution action.");
  }

  return runWithTransaction(db, async (tx) => {
    const conflictRes = await tx.query("SELECT * FROM integration_conflicts WHERE id = $1 FOR UPDATE", [id]);
    const conflict = conflictRes.rows[0];
    if (!conflict) {
      throw new ExternalIntegrationError(404, "NOT_FOUND", `Integration conflict ${id} not found.`);
    }

    let linkedIdentity = null;
    if (normalizedAction === "link_existing") {
      if (!conflict.external_user_id) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Conflict has no external_user_id to link.");
      }
      const chosenUserId = targetUserId ?? conflict.candidate_user_id;
      const linked = await linkExternalIdentityTx(
        tx,
        {
          sourceSystem: conflict.source_system,
          externalUserId: conflict.external_user_id,
          targetUserId: chosenUserId,
          actorId,
          sourceUpdatedAt: conflict.source_updated_at || new Date(),
        },
        { recordAudit },
      );
      linkedIdentity = linked.identity;
    }

    const nextStatus = normalizedAction === "dismiss"
      ? "dismissed"
      : (normalizedAction === "ignore" ? "ignored" : "resolved");
    const updatedRes = await tx.query(
      `UPDATE integration_conflicts
       SET status = $1,
           existing_user_id = COALESCE($2, existing_user_id),
           resolution_note = COALESCE($3, resolution_note),
           resolved_by = $4,
           resolved_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        nextStatus,
        linkedIdentity ? linkedIdentity.user_id : null,
        normalizeOptionalText(resolutionNote, 2000, "resolutionNote"),
        actorId == null ? null : parsePositiveBigIntId(actorId, "actorId"),
        id,
      ],
    );
    const updatedConflict = updatedRes.rows[0];

    if (replayInbox && conflict.inbox_id && nextStatus === "resolved") {
      await tx.query(
        `UPDATE integration_inbox
         SET status = 'pending',
             attempt_count = 0,
             next_retry_at = NOW(),
             locked_until = NULL,
             locked_by = NULL,
             last_error_code = NULL,
             last_error_message = NULL
         WHERE id = $1 AND status IN ('failed', 'dead_letter')`,
        [conflict.inbox_id],
      );
    }

    await recordAudit({
      db: tx,
      actorId: actorId == null ? null : parsePositiveBigIntId(actorId, "actorId"),
      action: "integration.conflict_resolved",
      entityType: "integration_conflict",
      entityId: Number(updatedConflict.id),
      beforeState: conflict,
      afterState: updatedConflict,
      metadata: { action: normalizedAction },
    });

    return { conflict: updatedConflict, identity: linkedIdentity };
  });
};

export const retryMolyInboxJob = async (
  db = defaultDb,
  { inboxId, actorId = null, correlationId = null } = {},
  { recordAudit = recordAuditEvent, env = process.env } = {},
) => {
  if (isMolyIntegrationKillSwitchActive(env)) {
    recordIntegrationMetric("moly.inbox.retry_blocked_kill_switch");
    throw new MolyIntegrationError(
      503,
      "INTEGRATION_KILL_SWITCH_ACTIVE",
      "Moly integration sync is disabled by emergency kill switch.",
    );
  }
  assertRepairMutationsAllowed(env, { metricName: "moly.inbox.retry_blocked_kill_switch" });
  const id = parsePositiveBigIntId(inboxId, "inboxId");
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const corr = resolveCorrelationId(correlationId);

  return runWithTransaction(db, async (tx) => {
    const existingRes = await tx.query(
      "SELECT * FROM integration_inbox WHERE id = $1 FOR UPDATE",
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "NOT_FOUND", `Integration inbox item ${id} not found.`);
    }
    if (existing.status === "processed") {
      return { retried: false, alreadyProcessed: true, inbox: existing };
    }
    if (!["failed", "dead_letter", "pending"].includes(existing.status)) {
      throw new ExternalIntegrationError(
        409,
        "INBOX_RETRY_NOT_ALLOWED",
        `Cannot retry inbox item while status is '${existing.status}'.`,
      );
    }

    const updatedRes = await tx.query(
      `UPDATE integration_inbox
       SET status = 'pending',
           max_attempts = GREATEST(max_attempts, attempt_count + 3),
           next_retry_at = NOW(),
           locked_until = NULL,
           locked_by = NULL,
           last_error_code = NULL,
           last_error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, source_system, event_id, idempotency_key, correlation_id, event_type,
                 COALESCE(payload->>'external_grant_id', payload->>'external_user_id') AS aggregate_id,
                 status, attempt_count, max_attempts, next_retry_at,
                 processed_at, created_at, updated_at`,
      [id],
    );
    const updated = updatedRes.rows[0];

    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.inbox_manual_retry",
      entityType: "integration_inbox",
      entityId: Number(id),
      beforeState: {
        status: existing.status,
        attempt_count: existing.attempt_count,
        last_error_code: existing.last_error_code,
      },
      afterState: {
        status: updated.status,
        attempt_count: updated.attempt_count,
        max_attempts: updated.max_attempts,
      },
      metadata: {
        correlation_id: corr,
        event_id: existing.event_id,
      },
    });

    recordIntegrationMetric("moly.inbox.manual_retry");
    integrationLog.info(
      "inbox_manual_retry",
      {
        inboxId: Number(id),
        eventId: existing.event_id,
        previousStatus: existing.status,
        actorId: parsedActorId,
      },
      corr,
    );

    return { retried: true, inbox: updated };
  });
};

export const listMolyInboxOps = async (db = defaultDb, filters = {}) => {
  const status = typeof filters.status === "string" ? filters.status.trim().toLowerCase() : null;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const params = [];
  const conditions = ["source_system = 'moly'"];
  if (status === "attention") {
    conditions.push("status IN ('pending', 'processing', 'failed', 'dead_letter')");
  } else if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [rowsRes, countsRes, conflictCountsRes] = await Promise.all([
    db.query(
      `SELECT id, source_system, event_id, idempotency_key, correlation_id, event_type,
              COALESCE(payload->>'external_grant_id', payload->>'external_user_id') AS aggregate_id,
              status, attempt_count, max_attempts, next_retry_at,
              locked_until, last_error_code, last_error_message, processed_at,
              created_at, updated_at
       FROM integration_inbox
       ${where}
       ORDER BY id DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_inbox
       WHERE source_system = 'moly'
       GROUP BY status`,
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_conflicts
       WHERE source_system = 'moly'
       GROUP BY status`,
    ),
  ]);

  return {
    killSwitchActive: isMolyIntegrationKillSwitchActive(),
    metrics: getIntegrationMetricsSnapshot(),
    inboxCounts: Object.fromEntries(countsRes.rows.map((r) => [r.status, r.count])),
    conflictCounts: Object.fromEntries(conflictCountsRes.rows.map((r) => [r.status, r.count])),
    items: rowsRes.rows,
  };
};

export const buildReconciliationSnapshotForMoly = async (db = defaultDb, rawBody = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.reconciliation.blocked_kill_switch");
    throw new MolyIntegrationError(
      503,
      "INTEGRATION_KILL_SWITCH_ACTIVE",
      "Moly integration sync is disabled by emergency kill switch.",
    );
  }
  const startMs = Date.now();
  const body = normalizeJsonObject(rawBody, "body");
  const corr = resolveCorrelationId(body.correlation_id);
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 2000);
  const filterExternalUserId = body.external_user_id
    ? requireMolyNamespacedId(body.external_user_id, "external_user_id")
    : null;
  const filterExternalCourseId = body.external_course_id
    ? normalizeExternalId(body.external_course_id, "external_course_id", 191)
    : null;
  const rawCourseId = body.courseId ?? body.course_id;
  const rawProfileId = body.profileId ?? body.profile_id;
  const filterProfileId = rawProfileId != null && String(rawProfileId).trim() !== ""
    ? parsePositiveBigIntId(rawProfileId, "profileId")
    : null;
  let filterCourseId = rawCourseId != null && String(rawCourseId).trim() !== ""
    ? parsePositiveBigIntId(rawCourseId, "courseId")
    : null;
  if (!filterCourseId && filterProfileId) {
    const profCourseRes = await db.query(
      `SELECT course_id FROM video_course_profiles WHERE id = $1 LIMIT 1`,
      [filterProfileId],
    );
    if (profCourseRes.rows[0]?.course_id) {
      filterCourseId = Number(profCourseRes.rows[0].course_id);
    }
  }
  const includeContent = Boolean(body.includeContent ?? body.include_content);

  const mappingsRes = await db.query(
    `SELECT id, source_system, external_course_id, local_course_id, local_video_course_profile_id,
            status, metadata, updated_at
     FROM external_course_mappings
     WHERE source_system IN ('moly', 'csca-course')
       AND ($1::bigint IS NULL OR local_course_id = $1)
       AND ($2::bigint IS NULL OR local_video_course_profile_id IS NULL OR local_video_course_profile_id = $2)
     ORDER BY id ASC`,
    [filterCourseId, filterProfileId],
  );

  const identitiesRes = await db.query(
    `SELECT id, source_system, external_user_id, user_id, status, source_updated_at
     FROM external_identities
     WHERE source_system = 'moly'
       AND ($1::text IS NULL OR external_user_id = $1)
     ORDER BY id ASC
     LIMIT $2`,
    [filterExternalUserId, limit],
  );

  const conflictsRes = await db.query(
    `SELECT id, source_system, conflict_type, status, external_user_id, external_course_id,
            external_grant_id, candidate_user_id, existing_user_id, local_course_id,
            correlation_id, reason, created_at
     FROM integration_conflicts
     WHERE source_system = 'moly'
       AND status = 'open'
       AND ($1::text IS NULL OR external_user_id = $1)
       AND ($2::bigint IS NULL OR local_course_id = $2)
     ORDER BY id DESC
     LIMIT $3`,
    [filterExternalUserId, filterCourseId, limit],
  );

  const extEntRes = await db.query(
    `SELECT ee.id, ee.source_system, ee.external_user_id, ee.user_id AS local_user_id,
            ee.local_course_id, ee.local_video_course_profile_id, ee.external_grant_id,
            ee.status, ee.valid_from, ee.valid_until, ee.revoked_at, ee.source_updated_at,
            ei.status AS identity_status
     FROM external_entitlements ee
     LEFT JOIN external_identities ei
       ON ei.id = ee.external_identity_id
       OR (ei.source_system = ee.source_system AND ei.external_user_id = ee.external_user_id)
     WHERE ee.source_system = 'moly'
       AND ($1::text IS NULL OR ee.external_user_id = $1)
       AND ($2::bigint IS NULL OR ee.local_course_id = $2)
       AND ($3::bigint IS NULL OR ee.local_video_course_profile_id IS NULL OR ee.local_video_course_profile_id = $3)
     ORDER BY ee.id DESC
     LIMIT $4`,
    [filterExternalUserId, filterCourseId, filterProfileId, limit],
  );

  const mgmtRes = await db.query(
    `SELECT ei.external_user_id, ei.status AS identity_status,
            g.id AS grant_id, g.user_id AS local_user_id, g.course_id AS local_course_id,
            g.access_status AS status, g.valid_from, g.valid_until, g.source_updated_at
     FROM external_identities ei
     JOIN lms_access_grants g ON g.user_id = ei.user_id
     WHERE ei.source_system = 'moly'
       AND ei.status = 'active'
       AND ($1::text IS NULL OR ei.external_user_id = $1)
       AND (
         $2::bigint IS NULL
         OR g.course_id = $2
         OR g.course_id IN (
           SELECT lc.course_id
           FROM video_course_profiles vcp
           JOIN live_classes lc ON lc.id = vcp.source_live_class_id
           WHERE vcp.course_id = $2
             AND vcp.mode = 'MIRROR'
             AND vcp.status = 'active'
             AND vcp.deleted_at IS NULL
             AND ($3::bigint IS NULL OR vcp.id = $3)
         )
       )
     ORDER BY g.id DESC
     LIMIT $4`,
    [filterExternalUserId, filterCourseId, filterProfileId, limit],
  );

  const inboxSummaryRes = await db.query(
    `SELECT status,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (
              WHERE status IN ('pending', 'processing')
                AND created_at <= NOW() - INTERVAL '10 minutes'
            )::int AS stale_count
     FROM integration_inbox
     WHERE source_system = 'moly'
     GROUP BY status`,
  );

  const nowMs = Date.now();
  const isEntActiveNow = (row) => (
    row.status === "active"
    && row.identity_status !== "revoked"
    && (!row.valid_from || new Date(row.valid_from).getTime() <= nowMs)
    && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs)
  );

  const entitlements = [];
  for (const row of extEntRes.rows) {
    let profileRevoked = false;
    if (isEntActiveNow(row) && row.local_video_course_profile_id != null && row.local_user_id != null) {
      const unrevoked = await hasUnrevokedVideoCourseAccess({
        db,
        userId: row.local_user_id,
        courseId: row.local_course_id,
        profileId: row.local_video_course_profile_id,
      });
      profileRevoked = !unrevoked;
    }
    const effectiveActive = isEntActiveNow(row) && !profileRevoked;
    const mapping = mappingsRes.rows.find((m) =>
      Number(m.local_course_id) === Number(row.local_course_id)
      && m.status === "active"
      && (m.local_video_course_profile_id == null
        || row.local_video_course_profile_id == null
        || Number(m.local_video_course_profile_id) === Number(row.local_video_course_profile_id)),
    ) || null;
    const resolvedExtCourseId = mapping
      ? (mapping.source_system === "moly"
        ? mapping.external_course_id
        : mapping.metadata?.moly_external_course_id || mapping.external_course_id)
      : null;

    if (filterExternalCourseId && resolvedExtCourseId !== filterExternalCourseId) {
      continue;
    }

    entitlements.push({
      source: "external_entitlements",
      id: Number(row.id),
      external_user_id: row.external_user_id,
      local_user_id: row.local_user_id == null ? null : Number(row.local_user_id),
      local_course_id: Number(row.local_course_id),
      local_video_course_profile_id: row.local_video_course_profile_id == null
        ? null
        : Number(row.local_video_course_profile_id),
      external_course_id: resolvedExtCourseId,
      external_grant_id: row.external_grant_id,
      status: profileRevoked ? "revoked" : row.status,
      effective_active: effectiveActive,
      identity_status: row.identity_status || "unknown",
      valid_from: row.valid_from ? new Date(row.valid_from).toISOString() : null,
      valid_until: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      source_updated_at: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
    });
  }

  const mirrorReconRes = await db.query(
    `SELECT vcp.id AS profile_id,
            vcp.course_id AS target_course_id,
            vcp.source_live_class_id,
            lc.course_id AS source_course_id
     FROM video_course_profiles vcp
     JOIN live_classes lc ON lc.id = vcp.source_live_class_id
     WHERE vcp.mode = 'MIRROR'
       AND vcp.status = 'active'
       AND vcp.deleted_at IS NULL
       AND vcp.source_live_class_id IS NOT NULL
       AND ($1::bigint IS NULL OR vcp.course_id = $1)
       AND ($2::bigint IS NULL OR vcp.id = $2)
     ORDER BY vcp.id ASC`,
    [filterCourseId, filterProfileId],
  );
  const mirrorTargetsBySourceCourse = new Map();
  for (const mr of mirrorReconRes.rows) {
    const srcCid = Number(mr.source_course_id);
    if (!mirrorTargetsBySourceCourse.has(srcCid)) mirrorTargetsBySourceCourse.set(srcCid, []);
    mirrorTargetsBySourceCourse.get(srcCid).push(mr);
  }
  const seenMgmtReconKeys = new Set();
  const mirrorCandidateGrants = [];

  for (const row of mgmtRes.rows) {
    const active = row.status === "active"
      && (!row.valid_from || new Date(row.valid_from).getTime() <= nowMs)
      && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs);
    const mapping = mappingsRes.rows.find(
      (m) => Number(m.local_course_id) === Number(row.local_course_id) && m.status === "active",
    ) || null;
    const resolvedExtCourseId = mapping
      ? (mapping.source_system === "moly"
        ? mapping.external_course_id
        : mapping.metadata?.moly_external_course_id || mapping.external_course_id)
      : null;

    if (!filterExternalCourseId || resolvedExtCourseId === filterExternalCourseId) {
      const reconKey = `${row.external_user_id}::${resolvedExtCourseId || `local:${row.local_course_id}`}`;
      seenMgmtReconKeys.add(reconKey);
      entitlements.push({
        source: "lms_access_grants",
        id: Number(row.grant_id),
        external_user_id: row.external_user_id,
        local_user_id: Number(row.local_user_id),
        local_course_id: Number(row.local_course_id),
        local_video_course_profile_id: null,
        external_course_id: resolvedExtCourseId,
        external_grant_id: `internal-management:grant:${row.grant_id}`,
        status: row.status,
        effective_active: active,
        identity_status: row.identity_status || "active",
        valid_from: row.valid_from ? new Date(row.valid_from).toISOString() : null,
        valid_until: row.valid_until ? new Date(row.valid_until).toISOString() : null,
        revoked_at: null,
        source_updated_at: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
      });
    }

    const mirrorTargets = mirrorTargetsBySourceCourse.get(Number(row.local_course_id)) || [];
    if (mirrorTargets.length > 0) {
      mirrorCandidateGrants.push({ row, active, mirrorTargets });
    }
  }

  const mirrorLiveClassIds = [...new Set(mirrorReconRes.rows.map((mr) => Number(mr.source_live_class_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const liveMirrorMembershipKeys = new Set();
  if (mirrorCandidateGrants.length > 0 && mirrorLiveClassIds.length > 0) {
    const enrollRes = await db.query(
      `SELECT user_id, live_class_id
       FROM class_enrollments
       WHERE live_class_id = ANY($1::bigint[])
         AND status = 'active'
         AND learning_mode = 'live'`,
      [mirrorLiveClassIds],
    );
    for (const er of enrollRes.rows) {
      liveMirrorMembershipKeys.add(`${Number(er.user_id)}::${Number(er.live_class_id)}`);
    }
  }

  for (const { row, active, mirrorTargets } of mirrorCandidateGrants) {
    for (const mt of mirrorTargets) {
      if (Number(mt.target_course_id) === Number(row.local_course_id)) continue;
      if (!liveMirrorMembershipKeys.has(`${Number(row.local_user_id)}::${Number(mt.source_live_class_id)}`)) continue;
      const targetMapping = mappingsRes.rows.find(
        (m) => Number(m.local_course_id) === Number(mt.target_course_id)
          && m.status === "active"
          && (m.local_video_course_profile_id == null
            || Number(m.local_video_course_profile_id) === Number(mt.profile_id)),
      ) || null;
      if (!targetMapping) continue;
      const targetExtCourseId = targetMapping.source_system === "moly"
        ? targetMapping.external_course_id
        : targetMapping.metadata?.moly_external_course_id || targetMapping.external_course_id;
      if (filterExternalCourseId && targetExtCourseId !== filterExternalCourseId) continue;
      const targetReconKey = `${row.external_user_id}::${targetExtCourseId || `profile:${mt.profile_id}`}`;
      if (seenMgmtReconKeys.has(targetReconKey)) continue;

      const unrevokedMirror = await hasUnrevokedVideoCourseAccess({
        db,
        userId: row.local_user_id,
        courseId: mt.target_course_id,
        profileId: mt.profile_id,
      });
      if (!unrevokedMirror) continue;

      seenMgmtReconKeys.add(targetReconKey);
      entitlements.push({
        source: "lms_access_grants",
        id: Number(row.grant_id),
        external_user_id: row.external_user_id,
        local_user_id: Number(row.local_user_id),
        local_course_id: Number(mt.target_course_id),
        local_video_course_profile_id: Number(mt.profile_id),
        external_course_id: targetExtCourseId,
        external_grant_id: `internal-management:grant:${row.grant_id}:profile:${mt.profile_id}`,
        status: row.status,
        effective_active: active,
        identity_status: row.identity_status || "active",
        valid_from: row.valid_from ? new Date(row.valid_from).toISOString() : null,
        valid_until: row.valid_until ? new Date(row.valid_until).toISOString() : null,
        revoked_at: null,
        source_updated_at: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
      });
    }
  }

  const inboxSummary = {};
  for (const row of inboxSummaryRes.rows) {
    inboxSummary[row.status] = { count: row.count, stale_count: row.stale_count };
  }

  let contentDriftSummary = undefined;
  if (includeContent) {
    contentDriftSummary = await exportContentStateForReconciliation(db, {
      courseId: filterCourseId,
      profileId: filterProfileId,
      limit,
    });
  }

  observeIntegrationLatency("moly.reconciliation.snapshot_ms", Date.now() - startMs);
  recordIntegrationMetric("moly.reconciliation.snapshot_calls");
  integrationLog.info(
    "reconciliation_snapshot_generated",
    {
      identities: identitiesRes.rows.length,
      entitlements: entitlements.length,
      openConflicts: conflictsRes.rows.length,
      includeContent,
      durationMs: Date.now() - startMs,
    },
    corr,
  );

  return {
    success: true,
    correlation_id: corr,
    data: {
      checked_at: new Date(nowMs).toISOString(),
      // Conservatively require a narrower scope when any independent query hits its cap.
      complete: [identitiesRes, conflictsRes, extEntRes, mgmtRes]
        .every((result) => result.rows.length < limit),
      course_mappings: mappingsRes.rows,
      identities: identitiesRes.rows,
      open_conflicts: conflictsRes.rows,
      entitlements,
      inbox_summary: inboxSummary,
      ...(includeContent ? { content_drift_summary: contentDriftSummary } : {}),
    },
  };
};

// ============================================================================
// Day 8-10: Content & Progress Reconciliation, Ops v2, Per-Subject Repair, Health
// ============================================================================

const toIsoOrNull = (val) => (val ? new Date(val).toISOString() : null);

const hasTable = async (db, tableName) => {
  try {
    const res = await db.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
    return Boolean(res.rows[0]?.exists);
  } catch {
    return false;
  }
};

const hasColumn = async (db, tableName, columnName) => {
  try {
    const res = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       LIMIT 1`,
      [tableName, columnName],
    );
    return res.rows.length > 0;
  } catch {
    return false;
  }
};

const assertGlobalSyncEnabled = (env = process.env, metricName = "moly.reconciliation.blocked_kill_switch") => {
  if (isMolyIntegrationKillSwitchActive(env)) {
    recordIntegrationMetric(metricName);
    throw new MolyIntegrationError(
      503,
      "INTEGRATION_KILL_SWITCH_ACTIVE",
      "Moly integration sync is disabled by emergency kill switch.",
    );
  }
};

const parseOptionalPositiveId = (value, fieldName) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return parsePositiveBigIntId(value, fieldName);
};

const parseOptionalPositiveIdList = (singularVal, pluralVal, fieldName) => {
  const tokens = [];
  for (const raw of [singularVal, pluralVal]) {
    if (raw === undefined || raw === null) continue;
    const parts = Array.isArray(raw) ? raw : String(raw).split(",");
    for (const part of parts) {
      const trimmed = String(part ?? "").trim();
      if (trimmed) tokens.push(trimmed);
    }
  }
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    const num = Number(parsePositiveBigIntId(token, fieldName));
    if (!seen.has(num)) {
      seen.add(num);
      unique.push(num);
    }
  }
  return unique;
};

const parseOptionalExternalIdList = (singularVal, pluralVal) => {
  const out = [];
  const seen = new Set();
  for (const raw of [singularVal, pluralVal]) {
    if (raw === undefined || raw === null) continue;
    const parts = Array.isArray(raw) ? raw : String(raw).split(",");
    for (const part of parts) {
      const trimmed = String(part ?? "").trim();
      if (!trimmed) continue;
      const normalized = normalizeExternalId(trimmed, "externalUserId", 191);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    }
  }
  return out;
};

const clampLimit = (value, fallback = 500, max = 2000) =>
  Math.min(Math.max(Number(value) || fallback, 1), max);

const getSplitKillSwitchesState = (env = process.env) => {
  const contentSync = isContentSyncKillSwitchActive(env);
  return {
    global: isMolyIntegrationKillSwitchActive(env),
    contentSync,
    catalogSync: contentSync,
    delegatedLearning: isDelegatedLearningKillSwitchActive(env),
    repairMutations: isRepairMutationsKillSwitchActive(env),
  };
};

/**
 * Exports canonical Course + Profile + Unit + File revision & tombstone counts
 * for Day 8 `content_drift` reconciliation. Stays available unless the global kill switch is on.
 */
export const exportContentStateForReconciliation = async (
  db = defaultDb,
  { courseId = null, courseIds = null, profileId = null, profileIds = null, limit = 500, env = process.env } = {},
) => {
  assertGlobalSyncEnabled(env);
  const startMs = Date.now();
  const parsedCourseIds = parseOptionalPositiveIdList(courseId, courseIds, "courseId");
  const parsedProfileIds = parseOptionalPositiveIdList(profileId, profileIds, "profileId");
  const rowLimit = clampLimit(limit, 500, 2000);

  let effectiveCourseIds = [...parsedCourseIds];
  if (effectiveCourseIds.length === 0 && parsedProfileIds.length > 0) {
    const profRes = await db.query(
      `SELECT DISTINCT course_id FROM video_course_profiles WHERE id = ANY($1::bigint[])`,
      [parsedProfileIds],
    );
    if (profRes.rows.length === 0) {
      return {
        checkedAt: new Date().toISOString(),
        complete: true,
        summary: {
          courseCount: 0,
          tombstonedCourseCount: 0,
          profileCount: 0,
          tombstonedProfileCount: 0,
          maxCourseRevision: 0,
          maxProfileRevision: 0,
          activeFilesCount: 0,
          tombstonedFilesCount: 0,
          maxFileRevision: 0,
        },
        courses: [],
        profiles: [],
      };
    }
    effectiveCourseIds = profRes.rows.map((r) => Number(r.course_id));
  }

  const [hasCourseSyncRev, hasFileSyncRev, hasPlacementDeleted] = await Promise.all([
    hasColumn(db, "courses", "sync_revision"),
    hasColumn(db, "lms_learning_files", "sync_revision"),
    hasColumn(db, "lms_learning_file_placements", "deleted_at"),
  ]);

  const courseSyncCol = hasCourseSyncRev ? "c.sync_revision" : "1::bigint";
  const courseDelCol = hasCourseSyncRev ? "c.sync_deleted_at" : "NULL::timestamptz";
  const fileActiveCond = hasFileSyncRev
    ? "f.deleted_at IS NULL AND f.status = 'ready'"
    : "f.status = 'ready'";
  const fileTombCond = hasFileSyncRev
    ? "(f.deleted_at IS NOT NULL OR f.status = 'deleted')"
    : "f.status = 'deleted'";
  const fileMaxRevExpr = hasFileSyncRev
    ? "(SELECT COALESCE(MAX(f.sync_revision), 0)::bigint FROM lms_learning_files f WHERE f.course_id = c.id)"
    : "0::bigint";
  const mirrorPlacementActiveCond = hasPlacementDeleted ? "p.deleted_at IS NULL" : "TRUE";
  const mirrorPlacementTombCond = hasPlacementDeleted ? "p.deleted_at IS NOT NULL" : "FALSE";
  const profSyncCol = hasCourseSyncRev ? "vcp.sync_revision" : "1::bigint";

  const [coursesRes, profilesRes] = await Promise.all([
    db.query(
      `SELECT c.id,
              COALESCE(c.title, c.name) AS title,
              c.slug,
              c.is_published,
              ${courseSyncCol} AS sync_revision,
              ${courseDelCol} AS sync_deleted_at,
              c.updated_at,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id AND l.is_published = TRUE) AS active_lesson_count,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id AND l.is_published = FALSE) AS tombstoned_lesson_count,
              (SELECT COUNT(*)::int FROM lms_learning_files f WHERE f.course_id = c.id AND ${fileActiveCond}) AS active_files_count,
              (SELECT COUNT(*)::int FROM lms_learning_files f WHERE f.course_id = c.id AND ${fileTombCond}) AS tombstoned_files_count,
              ${fileMaxRevExpr} AS max_file_revision
       FROM courses c
       WHERE (cardinality($1::bigint[]) = 0 OR c.id = ANY($1::bigint[]))
       ORDER BY c.id ASC
       LIMIT $2`,
      [effectiveCourseIds, rowLimit],
    ),
    db.query(
      `SELECT vcp.id,
              vcp.course_id,
              vcp.mode,
              vcp.source_live_class_id,
              vcp.management_class_id,
              vcp.status,
              ${profSyncCol} AS sync_revision,
              vcp.deleted_at,
              vcp.updated_at,
              CASE
                WHEN UPPER(vcp.mode) = 'MIRROR' AND vcp.source_live_class_id IS NOT NULL
                  THEN (SELECT COUNT(*)::int FROM class_sessions cs WHERE cs.live_class_id = vcp.source_live_class_id AND cs.status <> 'cancelled')
                ELSE (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = vcp.course_id AND l.is_published = TRUE)
              END AS active_unit_count,
              CASE
                WHEN UPPER(vcp.mode) = 'MIRROR' AND vcp.source_live_class_id IS NOT NULL
                  THEN (SELECT COUNT(*)::int FROM class_sessions cs WHERE cs.live_class_id = vcp.source_live_class_id AND cs.status = 'cancelled')
                ELSE (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = vcp.course_id AND l.is_published = FALSE)
              END AS tombstoned_unit_count,
              CASE
                WHEN UPPER(vcp.mode) = 'MIRROR' AND vcp.source_live_class_id IS NOT NULL
                  THEN (SELECT COUNT(*)::int FROM lms_learning_file_placements p WHERE p.live_class_id = vcp.source_live_class_id AND ${mirrorPlacementActiveCond})
                ELSE (SELECT COUNT(*)::int FROM lesson_learning_file_placements lp JOIN lessons l ON l.id = lp.lesson_id WHERE l.course_id = vcp.course_id AND l.is_published = TRUE)
              END AS active_file_placement_count,
              CASE
                WHEN UPPER(vcp.mode) = 'MIRROR' AND vcp.source_live_class_id IS NOT NULL
                  THEN (SELECT COUNT(*)::int FROM lms_learning_file_placements p WHERE p.live_class_id = vcp.source_live_class_id AND ${mirrorPlacementTombCond})
                ELSE 0
              END AS tombstoned_file_placement_count
       FROM video_course_profiles vcp
       WHERE (cardinality($1::bigint[]) = 0 OR vcp.course_id = ANY($1::bigint[]))
         AND (cardinality($2::bigint[]) = 0 OR vcp.id = ANY($2::bigint[]))
       ORDER BY vcp.id ASC
       LIMIT $3`,
      [effectiveCourseIds, parsedProfileIds, rowLimit],
    ),
  ]);

  const courses = coursesRes.rows.map((row) => ({
    courseId: String(row.id),
    title: row.title,
    slug: row.slug || null,
    isPublished: Boolean(row.is_published),
    deleted: Boolean(row.sync_deleted_at),
    deletedAt: toIsoOrNull(row.sync_deleted_at),
    syncRevision: Number(row.sync_revision || 1),
    activeLessonCount: Number(row.active_lesson_count || 0),
    tombstonedLessonCount: Number(row.tombstoned_lesson_count || 0),
    activeFilesCount: Number(row.active_files_count || 0),
    tombstonedFilesCount: Number(row.tombstoned_files_count || 0),
    maxFileRevision: Number(row.max_file_revision || 0),
    updatedAt: toIsoOrNull(row.updated_at),
  }));

  const profiles = profilesRes.rows.map((row) => ({
    profileId: String(row.id),
    courseId: String(row.course_id),
    mode: String(row.mode || "INDEPENDENT").toUpperCase(),
    sourceLiveClassId: row.source_live_class_id ? String(row.source_live_class_id) : null,
    managementClassId: row.management_class_id || null,
    status: row.deleted_at ? "archived" : row.status,
    deleted: Boolean(row.deleted_at),
    deletedAt: toIsoOrNull(row.deleted_at),
    syncRevision: Number(row.sync_revision || 1),
    activeUnitCount: Number(row.active_unit_count || 0),
    tombstonedUnitCount: Number(row.tombstoned_unit_count || 0),
    activeFilePlacementCount: Number(row.active_file_placement_count || 0),
    tombstonedFilePlacementCount: Number(row.tombstoned_file_placement_count || 0),
    updatedAt: toIsoOrNull(row.updated_at),
  }));

  const summary = {
    courseCount: courses.filter((c) => !c.deleted).length,
    tombstonedCourseCount: courses.filter((c) => c.deleted).length,
    profileCount: profiles.filter((p) => !p.deleted).length,
    tombstonedProfileCount: profiles.filter((p) => p.deleted).length,
    maxCourseRevision: courses.reduce((acc, c) => Math.max(acc, c.syncRevision), 0),
    maxProfileRevision: profiles.reduce((acc, p) => Math.max(acc, p.syncRevision), 0),
    activeFilesCount: courses.reduce((acc, c) => acc + c.activeFilesCount, 0),
    tombstonedFilesCount: courses.reduce((acc, c) => acc + c.tombstonedFilesCount, 0),
    maxFileRevision: courses.reduce((acc, c) => Math.max(acc, c.maxFileRevision), 0),
  };

  observeIntegrationLatency("moly.reconciliation.content_state_ms", Date.now() - startMs);
  recordIntegrationMetric("moly.reconciliation.content_state_calls");

  return {
    checkedAt: new Date().toISOString(),
    complete: coursesRes.rows.length < rowLimit && profilesRes.rows.length < rowLimit,
    summary,
    courses,
    profiles,
  };
};

const resolveReconciliationUsers = async (
  db,
  { externalUserId = null, externalUserIds = null, userId = null, userIds = null } = {},
) => {
  const parsedUserIds = parseOptionalPositiveIdList(userId, userIds, "userId");
  const normalizedExtUserIds = parseOptionalExternalIdList(externalUserId, externalUserIds);

  let targetUserIds = null;
  if (normalizedExtUserIds.length > 0 || parsedUserIds.length > 0) {
    const matchedIds = new Set();
    if (normalizedExtUserIds.length > 0) {
      const extRes = await db.query(
        `SELECT user_id
         FROM external_identities
         WHERE source_system = 'moly' AND external_user_id = ANY($1::text[]) AND user_id IS NOT NULL`,
        [normalizedExtUserIds],
      );
      for (const row of extRes.rows) matchedIds.add(Number(row.user_id));
      if (parsedUserIds.length > 0) {
        targetUserIds = parsedUserIds.filter((uid) => matchedIds.has(uid));
      } else {
        targetUserIds = [...matchedIds];
      }
    } else {
      targetUserIds = [...parsedUserIds];
    }
  }

  return {
    parsedUserId: parsedUserIds[0] ?? null,
    parsedUserIds,
    normalizedExtUserId: normalizedExtUserIds[0] ?? null,
    normalizedExtUserIds,
    targetUserIds,
    hasUserFilter: targetUserIds !== null,
  };
};

const loadExternalUserIdMap = async (db, userIds) => {
  const map = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return map;
  const res = await db.query(
    `SELECT user_id, external_user_id
     FROM external_identities
     WHERE source_system = 'moly' AND user_id = ANY($1::bigint[])
     ORDER BY (status = 'active') DESC, id ASC`,
    [userIds],
  );
  for (const row of res.rows) {
    const key = String(row.user_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.external_user_id);
  }
  return map;
};

/**
 * Exports canonical per-learner progress, sequential completions, quizzes,
 * assignments, notes, bookmarks, and unit Q&A snapshots for Day 8 `progress_drift` checks.
 */
export const exportLearningStateForReconciliation = async (
  db = defaultDb,
  {
    externalUserId = null,
    externalUserIds = null,
    userId = null,
    userIds = null,
    courseId = null,
    courseIds = null,
    profileId = null,
    profileIds = null,
    limit = 500,
    env = process.env,
  } = {},
) => {
  assertGlobalSyncEnabled(env);
  const startMs = Date.now();
  const parsedCourseIds = parseOptionalPositiveIdList(courseId, courseIds, "courseId");
  const parsedProfileIds = parseOptionalPositiveIdList(profileId, profileIds, "profileId");
  const rowLimit = clampLimit(limit, 500, 2000);

  const userScope = await resolveReconciliationUsers(db, {
    externalUserId,
    externalUserIds,
    userId,
    userIds,
  });

  let effectiveCourseIds = [...parsedCourseIds];
  let profileConstraints = [];
  if (parsedProfileIds.length > 0) {
    const profRes = await db.query(
      `SELECT id AS profile_id, course_id, mode, source_live_class_id, management_class_id, status, deleted_at
       FROM video_course_profiles
       WHERE id = ANY($1::bigint[])`,
      [parsedProfileIds],
    );
    profileConstraints = profRes.rows || [];
    if (profileConstraints.length === 0) {
      return {
        checkedAt: new Date().toISOString(),
        complete: true,
        videoWatchProgress: [],
        sequentialUnitCompletions: [],
        quizAttempts: [],
        assignmentSubmissions: [],
        notesSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
        notes: [],
        bookmarksSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
        bookmarks: [],
        qaThreadsSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
        qaThreads: [],
      };
    }
    if (effectiveCourseIds.length === 0) {
      effectiveCourseIds = [...new Set(profileConstraints.map((p) => Number(p.course_id)))];
    }
  }

  if (userScope.hasUserFilter && userScope.targetUserIds.length === 0) {
    return {
      checkedAt: new Date().toISOString(),
      complete: true,
      videoWatchProgress: [],
      sequentialUnitCompletions: [],
      quizAttempts: [],
      assignmentSubmissions: [],
      notesSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
      notes: [],
      bookmarksSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
      bookmarks: [],
      qaThreadsSummary: { activeCount: 0, deletedCount: 0, maxRevision: 0 },
      qaThreads: [],
    };
  }

  const filterUserParam = userScope.hasUserFilter ? userScope.targetUserIds : [0];
  const [hasBookmarksTable, hasQaThreadsTable] = await Promise.all([
    hasTable(db, "video_course_unit_bookmarks"),
    hasTable(db, "learning_unit_qa_threads"),
  ]);

  let vwpProfileClause = "";
  if (profileConstraints.length > 0) {
    const mirrorLiveIds = profileConstraints
      .filter((p) => String(p.mode || "").toUpperCase() === "MIRROR" && p.source_live_class_id)
      .map((p) => Number(p.source_live_class_id));
    const hasIndep = profileConstraints.some((p) => String(p.mode || "").toUpperCase() !== "MIRROR");
    if (mirrorLiveIds.length > 0 && hasIndep) {
      vwpProfileClause = ` AND (vwp.lesson_id IS NOT NULL OR vwp.live_class_id IN (${mirrorLiveIds.join(",")}))`;
    } else if (mirrorLiveIds.length > 0) {
      vwpProfileClause = ` AND vwp.live_class_id IN (${mirrorLiveIds.join(",")})`;
    } else {
      vwpProfileClause = ` AND vwp.lesson_id IS NOT NULL`;
    }
  }

  const [vwpRes, quizRes, assignRes, notesAggRes, notesRowsRes, scopePairsRes] = await Promise.all([
    db.query(
      `SELECT vwp.id, vwp.user_id, vwp.video_asset_id, vwp.course_id, vwp.live_class_id,
              vwp.class_session_id, vwp.lesson_id, vwp.last_position_seconds, vwp.watched_seconds,
              vwp.completion_percent, vwp.is_completed, vwp.completed_at, vwp.last_heartbeat_seq,
              vwp.sync_revision, vwp.updated_at
       FROM video_watch_progress vwp
       WHERE ($1::boolean = FALSE OR vwp.user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR vwp.course_id = ANY($3::bigint[]))
         ${vwpProfileClause}
       ORDER BY vwp.updated_at DESC, vwp.id DESC
       LIMIT $4`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, rowLimit],
    ),
    db.query(
      `SELECT qa.id, qa.quiz_id, q.course_id, q.class_session_id, q.lesson_id,
              qa.user_id, qa.video_course_profile_id, qa.attempt_number, qa.status,
              qa.score, qa.max_score, qa.started_at, qa.expires_at, qa.submitted_at,
              qa.auto_submitted, qa.sync_revision, qa.updated_at
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE ($1::boolean = FALSE OR qa.user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR q.course_id = ANY($3::bigint[]))
         AND (cardinality($4::bigint[]) = 0 OR qa.video_course_profile_id = ANY($4::bigint[]) OR qa.video_course_profile_id IS NULL)
       ORDER BY qa.updated_at DESC, qa.id DESC
       LIMIT $5`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds, rowLimit],
    ),
    db.query(
      `SELECT s.id, s.assignment_id, a.course_id, a.class_session_id, a.lesson_id,
              s.user_id, s.video_course_profile_id, s.status, s.revision, s.sync_revision,
              s.submitted_at, s.return_requested, s.returned_at,
              g.score AS latest_score, g.graded_at
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       LEFT JOIN LATERAL (
         SELECT score, graded_at
         FROM submission_grades sg
         WHERE sg.submission_id = s.id
         ORDER BY sg.graded_at DESC, sg.id DESC
         LIMIT 1
       ) g ON TRUE
       WHERE ($1::boolean = FALSE OR s.user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR a.course_id = ANY($3::bigint[]))
         AND (cardinality($4::bigint[]) = 0 OR s.video_course_profile_id = ANY($4::bigint[]) OR s.video_course_profile_id IS NULL)
       ORDER BY s.submitted_at DESC, s.id DESC
       LIMIT $5`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds, rowLimit],
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_count,
              COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_count,
              COALESCE(MAX(revision), 0)::bigint AS max_revision
       FROM video_course_unit_notes
       WHERE ($1::boolean = FALSE OR user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds],
    ),
    db.query(
      `SELECT id, user_id, course_id, class_session_id, lesson_id, timestamp_seconds,
              content, revision, deleted_at, updated_at
       FROM video_course_unit_notes
       WHERE deleted_at IS NULL
         AND ($1::boolean = FALSE OR user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))
       ORDER BY updated_at DESC, id DESC
       LIMIT $4`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, rowLimit],
    ),
    db.query(
      `SELECT DISTINCT pair.user_id, vcp.id AS profile_id, vcp.course_id, vcp.mode, vcp.source_live_class_id
       FROM video_course_profiles vcp
       JOIN (
         SELECT ee.user_id, ee.local_course_id AS course_id, ee.local_video_course_profile_id AS profile_id
         FROM external_entitlements ee
         WHERE ee.user_id IS NOT NULL AND ee.status = 'active'
         UNION
         SELECT lag.user_id, lag.course_id, NULL::bigint AS profile_id
         FROM lms_access_grants lag
         WHERE lag.access_status = 'active'
       ) pair
         ON pair.course_id = vcp.course_id
         AND (pair.profile_id IS NULL OR pair.profile_id = vcp.id)
       WHERE vcp.deleted_at IS NULL
         AND ($1::boolean = FALSE OR pair.user_id = ANY($2::bigint[]))
         AND (cardinality($3::bigint[]) = 0 OR vcp.course_id = ANY($3::bigint[]))
         AND (cardinality($4::bigint[]) = 0 OR vcp.id = ANY($4::bigint[]))
       ORDER BY pair.user_id ASC, vcp.id ASC
       LIMIT $5`,
      [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds, Math.min(rowLimit, 50)],
    ),
  ]);

  let bookmarksSummary = { activeCount: 0, deletedCount: 0, maxRevision: 0 };
  let bookmarksRows = [];
  if (hasBookmarksTable) {
    const [bmAgg, bmList] = await Promise.all([
      db.query(
        `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_count,
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_count,
                COALESCE(MAX(revision), 0)::bigint AS max_revision
         FROM video_course_unit_bookmarks
         WHERE ($1::boolean = FALSE OR user_id = ANY($2::bigint[]))
           AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))
           AND (cardinality($4::bigint[]) = 0 OR video_course_profile_id = ANY($4::bigint[]) OR video_course_profile_id IS NULL)`,
        [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds],
      ),
      db.query(
        `SELECT id, user_id, course_id, video_course_profile_id, class_session_id, lesson_id,
                video_asset_id, timestamp_seconds, label, revision, updated_at
         FROM video_course_unit_bookmarks
         WHERE deleted_at IS NULL
           AND ($1::boolean = FALSE OR user_id = ANY($2::bigint[]))
           AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))
           AND (cardinality($4::bigint[]) = 0 OR video_course_profile_id = ANY($4::bigint[]) OR video_course_profile_id IS NULL)
         ORDER BY updated_at DESC, id DESC
         LIMIT $5`,
        [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds, rowLimit],
      ),
    ]);
    bookmarksSummary = {
      activeCount: Number(bmAgg.rows[0]?.active_count || 0),
      deletedCount: Number(bmAgg.rows[0]?.deleted_count || 0),
      maxRevision: Number(bmAgg.rows[0]?.max_revision || 0),
    };
    bookmarksRows = bmList.rows;
  }

  let qaThreadsSummary = { activeCount: 0, deletedCount: 0, maxRevision: 0 };
  let qaThreadsRows = [];
  if (hasQaThreadsTable) {
    const [qaAgg, qaList] = await Promise.all([
      db.query(
        `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_count,
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_count,
                COALESCE(MAX(revision), 0)::bigint AS max_revision
         FROM learning_unit_qa_threads
         WHERE ($1::boolean = FALSE OR author_id = ANY($2::bigint[]))
           AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))
           AND (cardinality($4::bigint[]) = 0 OR video_course_profile_id = ANY($4::bigint[]) OR video_course_profile_id IS NULL)`,
        [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds],
      ),
      db.query(
        `SELECT id, course_id, video_course_profile_id, class_session_id, lesson_id,
                author_id, author_role, title, status, is_pinned, revision, last_message_at, updated_at
         FROM learning_unit_qa_threads
         WHERE deleted_at IS NULL
           AND ($1::boolean = FALSE OR author_id = ANY($2::bigint[]))
           AND (cardinality($3::bigint[]) = 0 OR course_id = ANY($3::bigint[]))
           AND (cardinality($4::bigint[]) = 0 OR video_course_profile_id = ANY($4::bigint[]) OR video_course_profile_id IS NULL)
         ORDER BY last_message_at DESC, id DESC
         LIMIT $5`,
        [userScope.hasUserFilter, filterUserParam, effectiveCourseIds, parsedProfileIds, rowLimit],
      ),
    ]);
    qaThreadsSummary = {
      activeCount: Number(qaAgg.rows[0]?.active_count || 0),
      deletedCount: Number(qaAgg.rows[0]?.deleted_count || 0),
      maxRevision: Number(qaAgg.rows[0]?.max_revision || 0),
    };
    qaThreadsRows = qaList.rows;
  }

  const allUserIds = new Set();
  for (const r of vwpRes.rows) allUserIds.add(Number(r.user_id));
  for (const r of quizRes.rows) allUserIds.add(Number(r.user_id));
  for (const r of assignRes.rows) allUserIds.add(Number(r.user_id));
  for (const r of notesRowsRes.rows) allUserIds.add(Number(r.user_id));
  for (const r of bookmarksRows) allUserIds.add(Number(r.user_id));
  for (const r of qaThreadsRows) allUserIds.add(Number(r.author_id));
  for (const r of scopePairsRes.rows) allUserIds.add(Number(r.user_id));

  const extIdMap = await loadExternalUserIdMap(db, [...allUserIds]);
  const extIdsFor = (uid) => extIdMap.get(String(uid)) || [];

  const sequentialUnitCompletions = [];
  for (const pair of scopePairsRes.rows) {
    const rawUnits = await loadProfileUnitsWithProgress(db, {
      profileRow: {
        profile_id: pair.profile_id,
        course_id: pair.course_id,
        mode: pair.mode,
        source_live_class_id: pair.source_live_class_id,
      },
      userId: pair.user_id,
    });
    const lockedUnits = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });
    const completedCount = lockedUnits.filter((u) => u.isCompleted).length;
    sequentialUnitCompletions.push({
      userId: String(pair.user_id),
      externalUserIds: extIdsFor(pair.user_id),
      courseId: String(pair.course_id),
      profileId: String(pair.profile_id),
      totalUnitsCount: lockedUnits.length,
      completedUnitsCount: completedCount,
      courseCompletionPct: lockedUnits.length > 0 ? Math.round((completedCount / lockedUnits.length) * 100) : 0,
      units: lockedUnits.map((u) => ({
        unitId: String(u.id),
        unitType: u.unitType,
        isCompleted: Boolean(u.isCompleted),
        isVideoCompleted: Boolean(u.isVideoCompleted),
        isQuizCompleted: Boolean(u.isQuizCompleted),
        isLocked: Boolean(u.isLocked),
        progressPercent: Number(u.progressPercent || 0),
      })),
    });
  }

  observeIntegrationLatency("moly.reconciliation.learning_state_ms", Date.now() - startMs);
  recordIntegrationMetric("moly.reconciliation.learning_state_calls");

  return {
    checkedAt: new Date().toISOString(),
    complete: [vwpRes, quizRes, assignRes, notesRowsRes].every((r) => r.rows.length < rowLimit)
      && bookmarksRows.length < rowLimit
      && qaThreadsRows.length < rowLimit,
    videoWatchProgress: vwpRes.rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      externalUserIds: extIdsFor(r.user_id),
      videoAssetId: String(r.video_asset_id),
      courseId: r.course_id ? String(r.course_id) : null,
      liveClassId: r.live_class_id ? String(r.live_class_id) : null,
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      lastPositionSeconds: Number(r.last_position_seconds || 0),
      watchedSeconds: Number(r.watched_seconds || 0),
      completionPercent: Number(r.completion_percent || 0),
      isCompleted: Boolean(r.is_completed),
      completedAt: toIsoOrNull(r.completed_at),
      lastHeartbeatSeq: Number(r.last_heartbeat_seq || 0),
      syncRevision: Number(r.sync_revision || 1),
      updatedAt: toIsoOrNull(r.updated_at),
    })),
    sequentialUnitCompletions,
    quizAttempts: quizRes.rows.map((r) => ({
      id: String(r.id),
      quizId: String(r.quiz_id),
      courseId: r.course_id ? String(r.course_id) : null,
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      userId: String(r.user_id),
      externalUserIds: extIdsFor(r.user_id),
      profileId: r.video_course_profile_id ? String(r.video_course_profile_id) : null,
      attemptNumber: Number(r.attempt_number || 1),
      status: r.status,
      score: r.score != null ? Number(r.score) : null,
      maxScore: r.max_score != null ? Number(r.max_score) : null,
      startedAt: toIsoOrNull(r.started_at),
      expiresAt: toIsoOrNull(r.expires_at),
      submittedAt: toIsoOrNull(r.submitted_at),
      autoSubmitted: Boolean(r.auto_submitted),
      syncRevision: Number(r.sync_revision || 1),
      updatedAt: toIsoOrNull(r.updated_at),
    })),
    assignmentSubmissions: assignRes.rows.map((r) => ({
      id: String(r.id),
      assignmentId: String(r.assignment_id),
      courseId: r.course_id ? String(r.course_id) : null,
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      userId: String(r.user_id),
      externalUserIds: extIdsFor(r.user_id),
      profileId: r.video_course_profile_id ? String(r.video_course_profile_id) : null,
      status: r.status,
      revision: Number(r.revision || 1),
      syncRevision: Number(r.sync_revision || 1),
      submittedAt: toIsoOrNull(r.submitted_at),
      returnRequested: Boolean(r.return_requested),
      returnedAt: toIsoOrNull(r.returned_at),
      latestScore: r.latest_score != null ? Number(r.latest_score) : null,
      gradedAt: toIsoOrNull(r.graded_at),
    })),
    notesSummary: {
      activeCount: Number(notesAggRes.rows[0]?.active_count || 0),
      deletedCount: Number(notesAggRes.rows[0]?.deleted_count || 0),
      maxRevision: Number(notesAggRes.rows[0]?.max_revision || 0),
    },
    notes: notesRowsRes.rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      externalUserIds: extIdsFor(r.user_id),
      courseId: String(r.course_id),
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      timestampSeconds: Number(r.timestamp_seconds || 0),
      content: r.content ?? "",
      revision: Number(r.revision || 1),
      updatedAt: toIsoOrNull(r.updated_at),
    })),
    bookmarksSummary,
    bookmarks: bookmarksRows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      externalUserIds: extIdsFor(r.user_id),
      courseId: String(r.course_id),
      profileId: r.video_course_profile_id ? String(r.video_course_profile_id) : null,
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      videoAssetId: r.video_asset_id ? String(r.video_asset_id) : null,
      timestampSeconds: Number(r.timestamp_seconds || 0),
      label: r.label || "",
      revision: Number(r.revision || 1),
      updatedAt: toIsoOrNull(r.updated_at),
    })),
    qaThreadsSummary,
    qaThreads: qaThreadsRows.map((r) => ({
      id: String(r.id),
      courseId: String(r.course_id),
      profileId: r.video_course_profile_id ? String(r.video_course_profile_id) : null,
      classSessionId: r.class_session_id ? String(r.class_session_id) : null,
      lessonId: r.lesson_id ? String(r.lesson_id) : null,
      authorId: String(r.author_id),
      authorRole: r.author_role || null,
      externalUserIds: extIdsFor(r.author_id),
      title: r.title || "",
      status: r.status,
      isPinned: Boolean(r.is_pinned),
      revision: Number(r.revision || 1),
      lastMessageAt: toIsoOrNull(r.last_message_at),
      updatedAt: toIsoOrNull(r.updated_at),
    })),
  };
};

/**
 * Returns consolidated Day 8-10 Admin Ops v2 observability across split kill switches,
 * inbound inbox, outbound v2 outbox backlog/DLQ, sync checkpoints, and conflicts.
 */
export const getMolyOpsV2Overview = async (db = defaultDb, { limit = 50, env = process.env } = {}) => {
  const rowLimit = clampLimit(limit, 50, 200);
  const [hasOutboxTable, hasCheckpointTable] = await Promise.all([
    hasTable(db, "course_integration_outbox"),
    hasTable(db, "course_sync_checkpoints"),
  ]);

  const [inboxAggRes, inboxFailuresRes, inboxLastProcRes, conflictCountsRes] = await Promise.all([
    db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_inbox
       WHERE source_system = 'moly'
       GROUP BY status`,
    ),
    db.query(
      `SELECT id, event_id, event_type, correlation_id, status, attempt_count, max_attempts,
              next_retry_at, last_error_code, last_error_message, created_at, updated_at
       FROM integration_inbox
       WHERE source_system = 'moly' AND status IN ('failed', 'dead_letter')
       ORDER BY id DESC
       LIMIT $1`,
      [rowLimit],
    ),
    db.query(
      `SELECT MAX(processed_at) AS last_processed_at,
              EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status IN ('pending', 'processing', 'failed'))))::int AS oldest_pending_age_seconds
       FROM integration_inbox
       WHERE source_system = 'moly'`,
    ),
    db.query(
      `SELECT status, conflict_type, COUNT(*)::int AS count
       FROM integration_conflicts
       WHERE source_system = 'moly'
       GROUP BY status, conflict_type`,
    ),
  ]);

  const inboxCounts = Object.fromEntries(inboxAggRes.rows.map((r) => [r.status, r.count]));
  const conflictCounts = {};
  const openConflictsByType = {};
  for (const row of conflictCountsRes.rows) {
    conflictCounts[row.status] = (conflictCounts[row.status] || 0) + Number(row.count || 0);
    if (row.status === "open") {
      openConflictsByType[row.conflict_type] = Number(row.count || 0);
    }
  }

  let outboxCounts = {};
  let outboxBacklogCount = 0;
  let outboxDlqCount = 0;
  let outboxOldestPendingAgeSeconds = null;
  let lastOutboxSentAt = null;
  let outboxFailedAndDlqItems = [];
  if (hasOutboxTable) {
    const [outboxAggRes, outboxLatencyRes, outboxFailRes] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM course_integration_outbox
         GROUP BY status`,
      ),
      db.query(
        `SELECT MAX(sent_at) AS last_sent_at,
                EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status IN ('pending', 'processing', 'failed'))))::int AS oldest_pending_age_seconds
         FROM course_integration_outbox`,
      ),
      db.query(
        `SELECT id, event_id, event_type, aggregate_type, aggregate_id, aggregate_revision,
                correlation_id, status, attempt_count, max_attempts, next_retry_at,
                last_error_code, last_error_message, created_at, updated_at
         FROM course_integration_outbox
         WHERE status IN ('failed', 'dead_letter')
         ORDER BY id DESC
         LIMIT $1`,
        [rowLimit],
      ),
    ]);
    outboxCounts = Object.fromEntries(outboxAggRes.rows.map((r) => [r.status, r.count]));
    outboxBacklogCount =
      Number(outboxCounts.pending || 0)
      + Number(outboxCounts.processing || 0)
      + Number(outboxCounts.failed || 0);
    outboxDlqCount = Number(outboxCounts.dead_letter || 0);
    lastOutboxSentAt = toIsoOrNull(outboxLatencyRes.rows[0]?.last_sent_at);
    outboxOldestPendingAgeSeconds = outboxLatencyRes.rows[0]?.oldest_pending_age_seconds != null
      ? Math.max(0, Number(outboxLatencyRes.rows[0].oldest_pending_age_seconds))
      : null;
    outboxFailedAndDlqItems = outboxFailRes.rows.map((r) => ({
      ...r,
      id: String(r.id),
      aggregate_revision: Number(r.aggregate_revision || 0),
      last_error_message: sanitizeString(r.last_error_message || ""),
      created_at: toIsoOrNull(r.created_at),
      updated_at: toIsoOrNull(r.updated_at),
      next_retry_at: toIsoOrNull(r.next_retry_at),
    }));
  }

  let checkpoints = [];
  if (hasCheckpointTable) {
    const cpRes = await db.query(
      `SELECT stream_name, consumer_system, last_cursor, after_entity_id,
              high_water_revision, snapshot_anchor_revision, high_water_updated_at, updated_at
       FROM course_sync_checkpoints
       ORDER BY stream_name ASC`,
    );
    checkpoints = cpRes.rows.map((r) => ({
      streamName: r.stream_name,
      consumerSystem: r.consumer_system,
      lastCursor: r.last_cursor,
      afterEntityId: r.after_entity_id != null ? String(r.after_entity_id) : null,
      highWaterRevision: Number(r.high_water_revision || 0),
      snapshotAnchorRevision: r.snapshot_anchor_revision != null ? Number(r.snapshot_anchor_revision) : null,
      highWaterUpdatedAt: toIsoOrNull(r.high_water_updated_at),
      updatedAt: toIsoOrNull(r.updated_at),
    }));
  }

  const lastInboxProcessedAt = toIsoOrNull(inboxLastProcRes.rows[0]?.last_processed_at);
  const inboxOldestPendingAgeSeconds = inboxLastProcRes.rows[0]?.oldest_pending_age_seconds != null
    ? Math.max(0, Number(inboxLastProcRes.rows[0].oldest_pending_age_seconds))
    : null;
  const latestCheckpointUpdatedAt = checkpoints.reduce(
    (latest, cp) => (!latest || (cp.updatedAt && cp.updatedAt > latest) ? cp.updatedAt : latest),
    null,
  );

  return {
    checkedAt: new Date().toISOString(),
    killSwitches: getSplitKillSwitchesState(env),
    metrics: getIntegrationMetricsSnapshot(env),
    inbox: {
      counts: inboxCounts,
      backlogCount: Number(inboxCounts.pending || 0) + Number(inboxCounts.processing || 0) + Number(inboxCounts.failed || 0),
      dlqCount: Number(inboxCounts.dead_letter || 0),
      oldestPendingAgeSeconds: inboxOldestPendingAgeSeconds,
      recentFailures: inboxFailuresRes.rows.map((r) => ({
        ...r,
        id: String(r.id),
        last_error_message: sanitizeString(r.last_error_message || ""),
        created_at: toIsoOrNull(r.created_at),
        updated_at: toIsoOrNull(r.updated_at),
        next_retry_at: toIsoOrNull(r.next_retry_at),
      })),
    },
    outbox: {
      available: hasOutboxTable,
      counts: outboxCounts,
      backlogCount: outboxBacklogCount,
      dlqCount: outboxDlqCount,
      oldestPendingAgeSeconds: outboxOldestPendingAgeSeconds,
      lastSentAt: lastOutboxSentAt,
      failedAndDlqItems: outboxFailedAndDlqItems,
    },
    checkpoints,
    conflicts: {
      openCount: Number(conflictCounts.open || 0),
      countsByStatus: conflictCounts,
      openByType: openConflictsByType,
    },
    lastSuccessfulSyncTimestamps: {
      lastInboxProcessedAt,
      lastOutboxSentAt,
      latestCheckpointUpdatedAt,
    },
  };
};

/**
 * Re-queues a failed, dead-lettered, or cancelled `course_integration_outbox` item.
 */
export const retryCourseOutboxJob = async (
  db = defaultDb,
  { outboxId, actorId = null, correlationId = null } = {},
  { recordAudit = recordAuditEvent, env = process.env } = {},
) => {
  assertRepairMutationsAllowed(env, { metricName: "course.outbox.retry_blocked_kill_switch" });
  const id = parsePositiveBigIntId(outboxId, "outboxId");
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const corr = resolveCorrelationId(correlationId);

  if (!(await hasTable(db, "course_integration_outbox"))) {
    throw new ExternalIntegrationError(503, "OUTBOX_UNAVAILABLE", "course_integration_outbox table is not available.");
  }

  return runWithTransaction(db, async (tx) => {
    const existingRes = await tx.query(
      `SELECT * FROM course_integration_outbox WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "NOT_FOUND", `Outbox item ${id} not found.`);
    }
    if (existing.status === "sent") {
      return { retried: false, alreadySent: true, outbox: existing };
    }
    if (!["failed", "dead_letter", "cancelled", "pending"].includes(existing.status)) {
      throw new ExternalIntegrationError(
        409,
        "OUTBOX_RETRY_NOT_ALLOWED",
        `Cannot retry outbox item while status is '${existing.status}'.`,
      );
    }

    const updatedRes = await tx.query(
      `UPDATE course_integration_outbox
       SET status = 'pending',
           attempt_count = 0,
           next_retry_at = NOW(),
           locked_until = NULL,
           locked_by = NULL,
           last_error_code = NULL,
           last_error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    const updated = updatedRes.rows[0];

    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.course_outbox_manual_retry",
      entityType: "course_integration_outbox",
      entityId: Number(updated.id),
      beforeState: {
        status: existing.status,
        attempt_count: existing.attempt_count,
        last_error_code: existing.last_error_code,
      },
      afterState: { status: updated.status, attempt_count: updated.attempt_count },
      metadata: { event_id: updated.event_id, event_type: updated.event_type, correlation_id: corr },
    });

    recordIntegrationMetric("course.outbox.manual_retry");
    integrationLog.info(
      "course_outbox_manual_retry",
      {
        outboxId: Number(updated.id),
        eventId: updated.event_id,
        previousStatus: existing.status,
        actorId: parsedActorId,
      },
      corr,
    );

    return { retried: true, alreadySent: false, outbox: updated };
  });
};

const requeueSubjectOutboxRowsTx = async (tx, { userIds, externalUserId, courseIds, profileIds }) => {
  if (!(await hasTable(tx, "course_integration_outbox"))) return 0;
  const userIdStrings = userIds.map(String);
  const courseIdStrings = courseIds.map(String);
  const profileIdStrings = profileIds.map(String);
  const res = await tx.query(
    `UPDATE course_integration_outbox
     SET status = 'pending',
         attempt_count = 0,
         next_retry_at = NOW(),
         locked_until = NULL,
         locked_by = NULL,
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
     WHERE status IN ('failed', 'dead_letter', 'cancelled')
       AND (
         (cardinality($1::text[]) > 0 AND payload->>'userId' = ANY($1::text[]))
         OR ($2::text IS NOT NULL AND (payload->>'externalUserId' = $2 OR payload->'externalUserIds' ? $2))
         OR (cardinality($3::text[]) > 0 AND (
              payload->>'courseId' = ANY($3::text[])
              OR (aggregate_type = 'course' AND aggregate_id = ANY($3::text[]))
            ))
         OR (cardinality($4::text[]) > 0 AND (
              payload->>'profileId' = ANY($4::text[])
              OR (aggregate_type = 'profile' AND aggregate_id = ANY($4::text[]))
            ))
       )
     RETURNING id`,
    [userIdStrings, externalUserId, courseIdStrings, profileIdStrings],
  );
  return res.rows.length;
};

const requeueSubjectInboxRowsTx = async (tx, { externalUserIds, externalCourseIds }) => {
  if (externalUserIds.length === 0 && externalCourseIds.length === 0) return 0;
  const res = await tx.query(
    `UPDATE integration_inbox
     SET status = 'pending',
         attempt_count = 0,
         next_retry_at = NOW(),
         locked_until = NULL,
         locked_by = NULL,
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
     WHERE source_system = 'moly'
       AND status IN ('failed', 'dead_letter')
       AND (
         (cardinality($1::text[]) > 0 AND payload->>'external_user_id' = ANY($1::text[]))
         OR (cardinality($2::text[]) > 0 AND payload->>'external_course_id' = ANY($2::text[]))
       )
     RETURNING id`,
    [externalUserIds, externalCourseIds],
  );
  return res.rows.length;
};

const RETRY_SUBJECT_DOMAINS = new Set(["all", "content", "progress", "entitlement"]);

/**
 * Performs per-subject repair / event re-emission across failed inbox/outbox rows,
 * catalog/curriculum outbox, entitlement projection, and learner progress snapshots.
 */
export const retryMolySubjectSync = async (
  db = defaultDb,
  {
    externalUserId = null,
    userId = null,
    courseId = null,
    profileId = null,
    domain = "all",
    actorId = null,
    correlationId = null,
  } = {},
  { recordAudit = recordAuditEvent, env = process.env } = {},
) => {
  assertRepairMutationsAllowed(env, { metricName: "moly.ops.retry_subject_blocked_kill_switch" });
  const normalizedDomain = String(domain || "all").trim().toLowerCase();
  if (!RETRY_SUBJECT_DOMAINS.has(normalizedDomain)) {
    throw new ExternalIntegrationError(
      422,
      "VALIDATION_ERROR",
      "domain must be one of: all, content, progress, entitlement.",
    );
  }
  const corr = resolveCorrelationId(correlationId);
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const parsedCourseId = parseOptionalPositiveId(courseId, "courseId");
  const parsedProfileId = parseOptionalPositiveId(profileId, "profileId");
  const userScope = await resolveReconciliationUsers(db, { externalUserId, userId });

  if (!userScope.normalizedExtUserId && !userScope.parsedUserId && !parsedCourseId && !parsedProfileId) {
    throw new ExternalIntegrationError(
      422,
      "VALIDATION_ERROR",
      "Supply at least one subject selector: externalUserId, userId, courseId, or profileId.",
    );
  }

  const userIds = userScope.targetUserIds || [];
  const externalUserIds = [];
  if (userScope.normalizedExtUserId) externalUserIds.push(userScope.normalizedExtUserId);
  if (userIds.length > 0) {
    const extRes = await db.query(
      `SELECT external_user_id FROM external_identities WHERE source_system = 'moly' AND user_id = ANY($1::bigint[])`,
      [userIds],
    );
    for (const r of extRes.rows) {
      if (!externalUserIds.includes(r.external_user_id)) externalUserIds.push(r.external_user_id);
    }
  }

  const profileRows = (
    await db.query(
      `SELECT id, course_id, mode, source_live_class_id, management_class_id, deleted_at
       FROM video_course_profiles
       WHERE ($1::bigint IS NOT NULL AND id = $1)
          OR ($1::bigint IS NULL AND $2::bigint IS NOT NULL AND course_id = $2)
       ORDER BY id ASC`,
      [parsedProfileId, parsedCourseId],
    )
  ).rows;
  const courseIds = [...new Set([
    ...(parsedCourseId ? [parsedCourseId] : []),
    ...profileRows.map((p) => Number(p.course_id)),
  ])];
  const profileIds = [...new Set([
    ...(parsedProfileId ? [parsedProfileId] : []),
    ...profileRows.map((p) => Number(p.id)),
  ])];

  const externalCourseIds = [];
  if (courseIds.length > 0 || profileIds.length > 0) {
    const mapRes = await db.query(
      `SELECT external_course_id
       FROM external_course_mappings
       WHERE source_system = 'moly'
         AND (
           (cardinality($1::bigint[]) > 0 AND local_course_id = ANY($1::bigint[]))
           OR (cardinality($2::bigint[]) > 0 AND local_video_course_profile_id = ANY($2::bigint[]))
         )`,
      [courseIds, profileIds],
    );
    for (const r of mapRes.rows) externalCourseIds.push(r.external_course_id);
  }

  const { reQueuedInboxCount, reQueuedOutboxCount } = await runWithTransaction(db, async (tx) => {
    const inboxCnt = await requeueSubjectInboxRowsTx(tx, { externalUserIds, externalCourseIds });
    const outboxCnt = await requeueSubjectOutboxRowsTx(tx, {
      userIds,
      externalUserId: userScope.normalizedExtUserId,
      courseIds,
      profileIds,
    });
    return { reQueuedInboxCount: inboxCnt, reQueuedOutboxCount: outboxCnt };
  });

  let reEmittedContentEvents = 0;
  if ((normalizedDomain === "all" || normalizedDomain === "content") && (courseIds.length > 0 || profileRows.length > 0)) {
    for (const cId of courseIds) {
      const courseRes = await db.query(`SELECT id, sync_deleted_at FROM courses WHERE id = $1 LIMIT 1`, [cId]);
      const courseRow = courseRes.rows[0];
      if (courseRow) {
        const deleted = Boolean(courseRow.sync_deleted_at);
        const envRow = await recordCourseCatalogMutation({
          db,
          courseId: cId,
          eventType: deleted ? "course.tombstoned" : "course.upserted",
          deleted,
          deletedAt: courseRow.sync_deleted_at,
          correlationId: corr,
        });
        if (envRow) reEmittedContentEvents += 1;
      }
    }
    for (const prof of profileRows) {
      const deleted = Boolean(prof.deleted_at);
      const profEnv = await recordProfileCatalogMutation({
        db,
        profileId: prof.id,
        courseId: prof.course_id,
        eventType: deleted ? "profile.tombstoned" : "profile.upserted",
        deleted,
        deletedAt: prof.deleted_at,
        correlationId: corr,
        bumpParentCourse: false,
      });
      if (profEnv) reEmittedContentEvents += 1;
      if (!deleted) {
        const curEnv = await safeRecordCurriculumMutation({
          db,
          courseId: prof.course_id,
          profileId: prof.id,
          eventType: "curriculum.upserted",
          correlationId: corr,
        });
        if (curEnv) reEmittedContentEvents += 1;
      }
    }
  }

  let reSyncedEntitlements = 0;
  if (normalizedDomain === "all" || normalizedDomain === "entitlement") {
    const entRes = await db.query(
      `SELECT id, user_id, source_system, local_course_id, local_video_course_profile_id, status
       FROM external_entitlements
       WHERE user_id IS NOT NULL
         AND ($1::boolean = FALSE OR user_id = ANY($2::bigint[]))
         AND ($3::boolean = FALSE OR local_course_id = ANY($4::bigint[]))
       ORDER BY id ASC
       LIMIT 100`,
      [userIds.length > 0, userIds.length > 0 ? userIds : [0], courseIds.length > 0, courseIds.length > 0 ? courseIds : [0]],
    );
    if (entRes.rows.length > 0) {
      await runWithTransaction(db, async (tx) => {
        for (const ent of entRes.rows) {
          await syncCourseEnrollmentProjectionTx(tx, {
            userId: ent.user_id,
            sourceSystem: ent.source_system,
            entitlementId: ent.id,
            localCourseId: ent.local_course_id,
            localVideoCourseProfileId: ent.local_video_course_profile_id,
            isRevokeTombstone: ent.status !== "active",
          });
          reSyncedEntitlements += 1;
        }
      });
    }
  }

  let reEmittedProgressEvents = 0;
  if ((normalizedDomain === "all" || normalizedDomain === "progress") && userIds.length > 0) {
    const targetProfilesRes = await db.query(
      `SELECT DISTINCT vcp.id AS profile_id, vcp.course_id, vcp.mode, vcp.source_live_class_id
       FROM video_course_profiles vcp
       WHERE vcp.deleted_at IS NULL
         AND (cardinality($1::bigint[]) = 0 OR vcp.course_id = ANY($1::bigint[]))
         AND (cardinality($2::bigint[]) = 0 OR vcp.id = ANY($2::bigint[]))
       ORDER BY vcp.id ASC
       LIMIT 20`,
      [courseIds, profileIds],
    );
    for (const uid of userIds) {
      for (const prof of targetProfilesRes.rows) {
        const rawUnits = await loadProfileUnitsWithProgress(db, {
          profileRow: {
            profile_id: prof.profile_id,
            course_id: prof.course_id,
            mode: prof.mode,
            source_live_class_id: prof.source_live_class_id,
          },
          userId: uid,
        });
        const unitsAfter = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });
        const unitsWithProgress = unitsAfter.filter(
          (u) => u.isCompleted || Number(u.progressPercent || 0) > 0 || Number(u.watchedSeconds || 0) > 0,
        );
        for (const unit of unitsWithProgress) {
          const emitted = await emitProgressOutboxEventsForProfile({
            db,
            userId: uid,
            externalUserIds,
            profileRow: prof,
            unitsAfter,
            targetUnitAfter: unit,
            wasCompletedBefore: !unit.isCompleted,
            correlationId: corr,
          });
          reEmittedProgressEvents += emitted.length;
        }
      }
    }
  }

  await runWithTransaction(db, async (tx) => {
    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.subject_repair_triggered",
      entityType: "integration_subject",
      entityId: parsedCourseId || parsedProfileId || (userIds[0] ?? 0),
      beforeState: null,
      afterState: {
        domain: normalizedDomain,
        reQueuedInboxCount,
        reQueuedOutboxCount,
        reEmittedContentEvents,
        reSyncedEntitlements,
        reEmittedProgressEvents,
      },
      metadata: {
        externalUserId: userScope.normalizedExtUserId,
        userIds: userIds.map(String),
        courseIds: courseIds.map(String),
        profileIds: profileIds.map(String),
        correlation_id: corr,
      },
    });
  });

  recordIntegrationMetric("moly.ops.subject_repair_triggered");
  integrationLog.info(
    "moly_subject_repair_completed",
    {
      domain: normalizedDomain,
      reQueuedInboxCount,
      reQueuedOutboxCount,
      reEmittedContentEvents,
      reSyncedEntitlements,
      reEmittedProgressEvents,
    },
    corr,
  );

  return {
    correlationId: corr,
    domain: normalizedDomain,
    reQueuedInboxCount,
    reQueuedOutboxCount,
    reEmittedContentEvents,
    reSyncedEntitlements,
    reEmittedProgressEvents,
  };
};

/**
 * Returns safe contract & migration readiness booleans, queue depths, and split kill-switch
 * state for Day 9-10 deploy probes without exposing secrets, tokens, URLs, or PII.
 */
export const getMolyIntegrationHealthProbe = async (db = defaultDb, { env = process.env } = {}) => {
  let dbConnected = false;
  try {
    await db.query("SELECT 1");
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const [
    tIdentities,
    tCourseMappings,
    tExternalEntitlements,
    tInbox,
    tConflicts,
    colExtEntProfile,
    tSsoCodes,
    tSsoLinks,
    tSsoBrowserTxs,
    tOutbox,
    tCheckpoints,
    tDeviceBindings,
    tDelegatedSessions,
    tBookmarks,
    tQaThreads,
    tQaMessages,
  ] = dbConnected
    ? await Promise.all([
      hasTable(db, "external_identities"),
      hasTable(db, "external_course_mappings"),
      hasTable(db, "external_entitlements"),
      hasTable(db, "integration_inbox"),
      hasTable(db, "integration_conflicts"),
      hasColumn(db, "external_entitlements", "local_video_course_profile_id"),
      hasTable(db, "integration_sso_codes"),
      hasTable(db, "integration_sso_link_requests"),
      hasTable(db, "integration_sso_browser_txs"),
      hasTable(db, "course_integration_outbox"),
      hasTable(db, "course_sync_checkpoints"),
      hasTable(db, "moly_device_bindings"),
      hasTable(db, "delegated_learning_sessions"),
      hasTable(db, "video_course_unit_bookmarks"),
      hasTable(db, "learning_unit_qa_threads"),
      hasTable(db, "learning_unit_qa_messages"),
    ])
    : Array(16).fill(false);

  const migrations = {
    "079_foundation": tIdentities && tCourseMappings && tExternalEntitlements && tInbox && tConflicts,
    "080_profile_scope": colExtEntProfile,
    "081_sso": tSsoCodes && tSsoLinks,
    "082_sso_browser_txs": tSsoBrowserTxs,
    "083_full_sync_foundation": tOutbox && tCheckpoints && tDeviceBindings && tDelegatedSessions,
    "084_day5_7_parity": tBookmarks && tQaThreads && tQaMessages,
  };

  let inboxQueueDepth = 0;
  let inboxDlqCount = 0;
  let outboxQueueDepth = 0;
  let outboxDlqCount = 0;
  let openConflictsCount = 0;

  if (dbConnected && tInbox) {
    const res = await db.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'failed'))::int AS depth,
              COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dlq
       FROM integration_inbox
       WHERE source_system = 'moly'`,
    );
    inboxQueueDepth = Number(res.rows[0]?.depth || 0);
    inboxDlqCount = Number(res.rows[0]?.dlq || 0);
  }
  if (dbConnected && tOutbox) {
    const res = await db.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'failed'))::int AS depth,
              COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dlq
       FROM course_integration_outbox`,
    );
    outboxQueueDepth = Number(res.rows[0]?.depth || 0);
    outboxDlqCount = Number(res.rows[0]?.dlq || 0);
  }
  if (dbConnected && tConflicts) {
    const res = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM integration_conflicts
       WHERE source_system = 'moly' AND status = 'open'`,
    );
    openConflictsCount = Number(res.rows[0]?.cnt || 0);
  }

  const allMigrationsReady = Object.values(migrations).every(Boolean);

  return {
    ready: dbConnected && allMigrationsReady,
    dbConnected,
    contractVersion: "2.0.0",
    schemaVersion: CATALOG_SYNC_SCHEMA_VERSION,
    migrations,
    killSwitches: getSplitKillSwitchesState(env),
    supportedScopes: [...ALLOWED_DELEGATED_SCOPES],
    queues: {
      inboxQueueDepth,
      inboxDlqCount,
      outboxQueueDepth,
      outboxDlqCount,
      openConflictsCount,
    },
  };
};
