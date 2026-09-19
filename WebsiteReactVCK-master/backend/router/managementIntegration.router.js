import crypto from "crypto";
import express from "express";
import { getClient } from "../db/connect.js";
import requireManagementIntegration from "../middleware/requireManagementIntegration.js";

const router = express.Router();

const ACCOUNT_STATUS_MAP = new Map([
  ["pendingpayment", "pending_payment"],
  ["pending_payment", "pending_payment"],
  ["active", "active"],
  ["suspended", "suspended"],
  ["revoked", "revoked"],
]);
const ACCESS_STATUS_MAP = new Map([
  ["active", "active"],
  ["suspended", "suspended"],
  ["revoked", "revoked"],
]);

const errorBody = (message, errorCode, data) => ({
  success: false,
  message,
  errorCode,
  ...(data ? { data } : {}),
});

const validationError = (res, message) => res.status(422).json(errorBody(message, "VALIDATION_ERROR"));
const internalError = (res) => res.status(500).json(errorBody("Không thể đồng bộ dữ liệu quản lý vào LMS", "INTERNAL_ERROR"));

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const normalizedText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};
const normalizedEmail = (value) => {
  const email = normalizedText(value, 255)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
const parseDate = (value) => {
  const date = new Date(value);
  return typeof value === "string" && !Number.isNaN(date.getTime()) ? date : null;
};
const parseStatus = (value, map) => map.get(normalizedText(value, 40)?.replace(/[\s-]/g, "").toLowerCase()) || null;
const publicAccountStatus = (status) => ({
  pending_payment: "PendingPayment",
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  unmanaged: "Unmanaged",
}[status] || status);

const parseCourseSourceIds = (value) => {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = value.map((item) => normalizedText(item, 128)?.toLowerCase());
  return ids.every(Boolean) && new Set(ids).size === ids.length ? ids : null;
};

const parseProvision = (body) => {
  if (!isPlainObject(body)) return null;
  const externalStudentId = normalizedText(body.externalStudentId, 128);
  const externalPartyId = body.externalPartyId === null || body.externalPartyId === undefined
    ? null
    : normalizedText(body.externalPartyId, 128);
  const fullName = normalizedText(body.fullName, 160);
  const email = normalizedEmail(body.email);
  const phone = body.phone === null || body.phone === undefined ? null : normalizedText(body.phone, 50);
  const accountStatus = parseStatus(body.accountStatus, ACCOUNT_STATUS_MAP);
  const paymentStatus = normalizedText(body.paymentStatus, 40);
  const courseSourceIds = parseCourseSourceIds(body.courseSourceIds);
  const classSourceId = normalizedText(body.classSourceId, 128);
  const sourceUpdatedAt = parseDate(body.sourceUpdatedAt);
  if (!externalStudentId || !fullName || !email || !accountStatus || !paymentStatus || !courseSourceIds || !classSourceId || !sourceUpdatedAt) return null;
  return { externalStudentId, externalPartyId, fullName, email, phone, accountStatus, paymentStatus, courseSourceIds, classSourceId, sourceUpdatedAt };
};

const parseAccess = (body) => {
  if (!isPlainObject(body)) return null;
  const accessStatus = parseStatus(body.accessStatus, ACCESS_STATUS_MAP);
  const reason = normalizedText(body.reason, 500);
  const sourcePaymentId = body.sourcePaymentId === null || body.sourcePaymentId === undefined
    ? null
    : normalizedText(body.sourcePaymentId, 128);
  const validFrom = parseDate(body.validFrom);
  const validUntil = body.validUntil === null || body.validUntil === undefined ? null : parseDate(body.validUntil);
  const courseSourceIds = parseCourseSourceIds(body.courseSourceIds);
  if (!accessStatus || !reason || !validFrom || !courseSourceIds || courseSourceIds.length === 0 || (body.validUntil !== null && body.validUntil !== undefined && !validUntil)) return null;
  if (validUntil && validUntil <= validFrom) return null;
  return { accessStatus, reason, sourcePaymentId, validFrom, validUntil, courseSourceIds };
};

const requestHash = (rawBody) => crypto.createHash("sha256").update(rawBody).digest("hex");

const beginIdempotentRequest = async (client, req, endpoint) => {
  const hash = requestHash(req.rawBody);
  const inserted = await client.query(
    `INSERT INTO management_integration_requests (idempotency_key, endpoint, request_hash, correlation_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [req.managementIntegration.idempotencyKey, endpoint, hash, req.managementIntegration.correlationId],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, replay: null };

  const existing = await client.query(
    `SELECT id, endpoint, request_hash, response_status, response_body
     FROM management_integration_requests
     WHERE idempotency_key = $1 FOR UPDATE`,
    [req.managementIntegration.idempotencyKey],
  );
  const row = existing.rows[0];
  if (!row || row.endpoint !== endpoint || !safeHashEqual(row.request_hash, hash)) {
    return { conflict: true };
  }
  if (row.response_status && row.response_body) {
    return { replay: { status: Number(row.response_status), body: row.response_body } };
  }
  return { id: row.id, replay: null };
};

const safeHashEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const completeIdempotentRequest = async (client, id, status, body) => {
  await client.query(
    `UPDATE management_integration_requests
     SET response_status = $1, response_body = $2::jsonb, completed_at = NOW()
     WHERE id = $3`,
    [status, JSON.stringify(body), id],
  );
};

const respondTransaction = async (client, res, requestId, status, body) => {
  await client.query(
    `INSERT INTO lms_sync_jobs
       (event_type, entity_type, entity_id, status, retry_count, last_error, payload, idempotency_key, correlation_id, processed_at)
     VALUES ($1, 'management_integration_request', $2, $3, 0, $4, $5::jsonb, $6, $7, NOW())
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      body?.errorCode || "MANAGEMENT_REQUEST",
      String(requestId),
      status >= 200 && status < 300 ? "SUCCESS" : "FAILED",
      status >= 200 && status < 300 ? null : body?.message || "Management integration request failed",
      JSON.stringify({ status, success: status >= 200 && status < 300, correlationId: body?.correlationId || null }),
      `management-request:${requestId}`,
      body?.correlationId || null,
    ],
  );
  await completeIdempotentRequest(client, requestId, status, body);
  await client.query("COMMIT");
  return res.status(status).json(body);
};

const createManagedUsername = async (client, externalStudentId) => {
  const compactId = externalStudentId.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-36) || crypto.randomBytes(8).toString("hex");
  const base = `student-${compactId}`.slice(0, 50);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${crypto.randomBytes(3).toString("hex")}`;
    const candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
    const result = await client.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!result.rows[0]) return candidate;
  }
  throw new Error("Unable to create a unique LMS username");
};

const shouldApplySourceUpdate = (stored, incoming) => !stored || new Date(stored).getTime() <= incoming.getTime();

const effectiveEnrollmentStatus = (grant) => {
  const validUntil = grant.valid_until ? new Date(grant.valid_until) : null;
  if (grant.access_status === "active" && (!validUntil || validUntil.getTime() > Date.now())) return "active";
  if (grant.access_status === "suspended") return "suspended";
  return "revoked";
};

const deriveAccountStatus = async (client, userId, fallback) => {
  const result = await client.query(
    `SELECT access_status, valid_until
     FROM lms_access_grants
     WHERE user_id = $1`,
    [userId],
  );
  const grants = result.rows;
  if (grants.some((grant) => effectiveEnrollmentStatus(grant) === "active")) return "active";
  if (grants.some((grant) => grant.access_status === "suspended")) return "suspended";
  if (grants.length > 0) return "revoked";
  return fallback || "pending_payment";
};

const mapCourses = async (client, courseSourceIds) => {
  const result = await client.query(
    `SELECT id, external_course_id
     FROM courses
     WHERE LOWER(external_course_id) = ANY($1::text[])`,
    [courseSourceIds],
  );
  const bySourceId = new Map(result.rows.map((row) => [String(row.external_course_id).toLowerCase(), row]));
  const missing = courseSourceIds.filter((sourceId) => !bySourceId.has(sourceId));
  return { courses: courseSourceIds.map((sourceId) => bySourceId.get(sourceId)).filter(Boolean), missing };
};

// POST /api/integrations/v1/students/provision
// Creates or links an LMS identity only. Content access is granted exclusively
// by the separate access endpoint after Management records payment as paid.
router.post("/students/provision", requireManagementIntegration, async (req, res) => {
  const payload = parseProvision(req.body);
  if (!payload) return validationError(res, "Dữ liệu provision học viên không hợp lệ");

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const request = await beginIdempotentRequest(client, req, "/api/integrations/v1/students/provision");
    if (request.conflict) {
      await client.query("ROLLBACK");
      return res.status(409).json(errorBody("Idempotency-Key đang được dùng cho yêu cầu khác", "IDEMPOTENCY_CONFLICT"));
    }
    if (request.replay) {
      await client.query("COMMIT");
      return res.status(request.replay.status).json(request.replay.body);
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [payload.externalStudentId]);
    let user = (await client.query(
      `SELECT id, external_student_id, is_management_managed, lms_account_status,
              management_source_updated_at
       FROM users WHERE external_student_id = $1 FOR UPDATE`,
      [payload.externalStudentId],
    )).rows[0];
    const alreadyExists = Boolean(user);

    if (!user) {
      const sameEmail = (await client.query(
        `SELECT id, external_student_id, is_management_managed, lms_account_status,
                management_source_updated_at
         FROM users WHERE LOWER(email) = $1 FOR UPDATE`,
        [payload.email],
      )).rows[0];
      if (sameEmail?.external_student_id && sameEmail.external_student_id !== payload.externalStudentId) {
        const body = errorBody("Email đã liên kết với một học viên Management khác", "STUDENT_IDENTITY_CONFLICT");
        return respondTransaction(client, res, request.id, 409, body);
      }
      user = sameEmail || null;
    }

    if (user) {
      if (shouldApplySourceUpdate(user.management_source_updated_at, payload.sourceUpdatedAt)) {
        const updated = await client.query(
          `UPDATE users
           SET external_student_id = $1,
               management_party_id = $2,
               management_phone = $3,
               management_class_source_id = $4,
               lms_account_status = $5,
               lms_last_payment_status = $6,
               management_source_updated_at = $7,
               lms_provisioned_at = COALESCE(lms_provisioned_at, NOW()),
               is_locked = CASE WHEN is_management_managed THEN $8 ELSE is_locked END
           WHERE id = $9
           RETURNING id, lms_account_status, is_management_managed`,
          [payload.externalStudentId, payload.externalPartyId, payload.phone, payload.classSourceId,
            payload.accountStatus, payload.paymentStatus, payload.sourceUpdatedAt,
            payload.accountStatus !== "active", user.id],
        );
        user = { ...user, ...updated.rows[0] };
        await client.query(
          `INSERT INTO student_profiles (user_id, full_name)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = NOW()`,
          [user.id, payload.fullName],
        );
      }
    } else {
      const username = await createManagedUsername(client, payload.externalStudentId);
      const created = await client.query(
        `INSERT INTO users
           (username, email, password_hash, email_verified, is_locked, external_student_id,
            management_party_id, management_phone, management_class_source_id,
            is_management_managed, lms_account_status, lms_last_payment_status,
            management_source_updated_at, lms_provisioned_at)
         VALUES ($1, $2, NULL, FALSE, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, NOW())
         RETURNING id, lms_account_status, is_management_managed`,
        [username, payload.email, payload.accountStatus !== "active", payload.externalStudentId,
          payload.externalPartyId, payload.phone, payload.classSourceId, payload.accountStatus,
          payload.paymentStatus, payload.sourceUpdatedAt],
      );
      user = created.rows[0];
      await client.query("INSERT INTO student_profiles (user_id, full_name) VALUES ($1, $2)", [user.id, payload.fullName]);
    }

    const body = {
      alreadyExists,
      lmsUserId: Number(user.id),
      provisionStatus: publicAccountStatus(user.lms_account_status),
      correlationId: req.managementIntegration.correlationId,
    };
    return respondTransaction(client, res, request.id, alreadyExists ? 200 : 201, body);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Management provision integration error:", error.message);
    return internalError(res);
  } finally {
    client.release();
  }
});

// PATCH /api/integrations/v1/students/:externalStudentId/access
// Writes the entitlement projection and the existing enrollment record in one
// transaction, so all current classroom, video and progress guards enforce it.
router.patch("/students/:externalStudentId/access", requireManagementIntegration, async (req, res) => {
  const externalStudentId = normalizedText(req.params.externalStudentId, 128);
  const payload = parseAccess(req.body);
  if (!externalStudentId || !payload) return validationError(res, "Dữ liệu cấp quyền LMS không hợp lệ");

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const endpoint = "/api/integrations/v1/students/:externalStudentId/access";
    const request = await beginIdempotentRequest(client, req, endpoint);
    if (request.conflict) {
      await client.query("ROLLBACK");
      return res.status(409).json(errorBody("Idempotency-Key đang được dùng cho yêu cầu khác", "IDEMPOTENCY_CONFLICT"));
    }
    if (request.replay) {
      await client.query("COMMIT");
      return res.status(request.replay.status).json(request.replay.body);
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [externalStudentId]);
    const userResult = await client.query(
      `SELECT id, is_management_managed, lms_account_status
       FROM users WHERE external_student_id = $1 FOR UPDATE`,
      [externalStudentId],
    );
    const user = userResult.rows[0];
    if (!user) {
      const body = errorBody("Học viên chưa được provision vào LMS", "STUDENT_NOT_PROVISIONED");
      return respondTransaction(client, res, request.id, 409, body);
    }

    const mapping = await mapCourses(client, payload.courseSourceIds);
    if (mapping.missing.length > 0) {
      const body = errorBody("Chưa có mapping khóa học Management - LMS", "COURSE_MAPPING_MISSING", {
        missingCourseSourceIds: mapping.missing,
      });
      return respondTransaction(client, res, request.id, 422, body);
    }

    const courseAccess = [];
    for (const course of mapping.courses) {
      const existingGrantResult = await client.query(
        `SELECT id, access_status, source_payment_id, reason, valid_from, valid_until, source_updated_at
         FROM lms_access_grants
         WHERE user_id = $1 AND course_id = $2 FOR UPDATE`,
        [user.id, course.id],
      );
      const existingGrant = existingGrantResult.rows[0];
      let grant = existingGrant;
      let staleIgnored = false;
      if (existingGrant && new Date(existingGrant.source_updated_at).getTime() > payload.validFrom.getTime()) {
        staleIgnored = true;
      } else {
        const upserted = await client.query(
          `INSERT INTO lms_access_grants
             (user_id, course_id, access_status, source_payment_id, reason, valid_from,
              valid_until, source_updated_at, revoked_at, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $6,
                   CASE WHEN $3 IN ('revoked', 'suspended') THEN $6 ELSE NULL END, $8)
           ON CONFLICT (user_id, course_id) DO UPDATE SET
             access_status = EXCLUDED.access_status,
             source_payment_id = EXCLUDED.source_payment_id,
             reason = EXCLUDED.reason,
             valid_from = EXCLUDED.valid_from,
             valid_until = EXCLUDED.valid_until,
             source_updated_at = EXCLUDED.source_updated_at,
             revoked_at = EXCLUDED.revoked_at,
             correlation_id = EXCLUDED.correlation_id
           RETURNING id, access_status, source_payment_id, reason, valid_from, valid_until, source_updated_at`,
          [user.id, course.id, payload.accessStatus, payload.sourcePaymentId, payload.reason,
            payload.validFrom, payload.validUntil, req.managementIntegration.correlationId],
        );
        grant = upserted.rows[0];
      }

      const enrollmentStatus = effectiveEnrollmentStatus(grant);
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, course_id) DO UPDATE SET status = EXCLUDED.status`,
        [user.id, course.id, enrollmentStatus],
      );
      courseAccess.push({
        courseSourceId: course.external_course_id,
        lmsCourseId: Number(course.id),
        accessStatus: grant.access_status,
        enrollmentStatus,
        staleIgnored,
      });
    }

    const accountStatus = await deriveAccountStatus(client, user.id, user.lms_account_status);
    await client.query(
      `UPDATE users
       SET lms_account_status = $1,
           is_locked = CASE WHEN is_management_managed THEN $2 ELSE is_locked END
       WHERE id = $3`,
      [accountStatus, accountStatus !== "active", user.id],
    );

    const body = {
      success: true,
      externalStudentId,
      lmsUserId: Number(user.id),
      accountStatus: publicAccountStatus(accountStatus),
      accessStatus: payload.accessStatus,
      courseAccess,
      correlationId: req.managementIntegration.correlationId,
    };
    return respondTransaction(client, res, request.id, 200, body);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Management access integration error:", error.message);
    return internalError(res);
  } finally {
    client.release();
  }
});

export default router;
