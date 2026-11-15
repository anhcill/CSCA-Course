import express from "express";
import jwt from "jsonwebtoken";
import protectRoute from "../middleware/protectRoute.js";
import { createRateLimiter } from "../middleware/security.js";
import { getUserDtoById } from "../utils/userDto.js";
import generateTokenAndSetCookie from "../utils/generateToken.js";
import {
  TrustedDeviceAuthError,
  getRequestLoginContext,
  getTrustedDeviceLimitForRole,
  listTrustedDevicesForUser,
  resolveAuthenticatedSession,
  setTrustedDeviceCookie,
} from "../services/trustedDevice.service.js";
import { createMolySsoService } from "../services/molySso.service.js";
import {
  SsoPolicyError,
  clearSsoBrowserCookie,
  setSsoBrowserCookie,
  shouldUseSecureSsoCookie,
} from "../services/ssoPathPolicy.service.js";

function setNoLeakHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendSsoError(res, error) {
  setNoLeakHeaders(res);
  if (error instanceof TrustedDeviceAuthError) {
    return res.status(error.statusCode || 403).json({
      success: false,
      errorCode: error.errorCode || "DEVICE_LIMIT_REACHED",
      message: error.message,
      details: error.details,
    });
  }
  if (error instanceof SsoPolicyError) {
    return res.status(error.status || 400).json({
      success: false,
      errorCode: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  console.error("[csca-course-sso] Unexpected error:", error?.message || error);
  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_ERROR",
    message: "Không thể xử lý đăng nhập SSO.",
  });
}

async function resolveOptionalAuthenticatedUser(req) {
  try {
    const token = req.cookies?.jwt;
    const { deviceToken, ipAddress } = getRequestLoginContext(req);
    if (!token || !deviceToken || !process.env.JWT_SECRET) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const resolved = await resolveAuthenticatedSession({
      userId: payload?.userId,
      sessionId: payload?.sessionId,
      sessionToken: payload?.sessionToken,
      deviceToken,
      ipAddress,
    });
    return resolved?.user || null;
  } catch {
    return null;
  }
}

async function buildDeviceLimitFailure(error, userId) {
  if (!(error instanceof TrustedDeviceAuthError)) return error;
  try {
    const devices = await listTrustedDevicesForUser(userId);
    return new TrustedDeviceAuthError(error.message, {
      statusCode: error.statusCode,
      errorCode: error.errorCode,
      details: {
        ...(error.details || {}),
        deviceLimit: error.details?.deviceLimit || getTrustedDeviceLimitForRole("user"),
        devices,
      },
    });
  } catch {
    return error;
  }
}

export const createSsoRouter = ({ ssoService = createMolySsoService(), loadUserDto = getUserDtoById } = {}) => {
  const router = express.Router();

  const ssoRateLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 40 : 400,
  });

  router.use((_req, res, next) => {
    setNoLeakHeaders(res);
    next();
  });

  const txCookieName = ssoService.CSCA_SSO_TX_COOKIE || "csca_sso_tx";
  const linkCookieName = ssoService.CSCA_SSO_LINK_COOKIE || "csca_sso_link";

  function handleIncomingStart(req, res, { redirectBrowser = false } = {}) {
    return (async () => {
      try {
        const result = await ssoService.startIncomingMolySsoTransaction({
          targetPath: req.query?.target_path ?? req.body?.targetPath ?? req.body?.target_path ?? null,
          courseId: req.query?.course_id ?? req.body?.courseId ?? req.body?.course_id ?? null,
          offeringId: req.query?.offering_id ?? req.body?.offeringId ?? req.body?.offering_id ?? null,
          correlationId: req.headers["x-correlation-id"] || undefined,
        });
        const secure = shouldUseSecureSsoCookie(req);
        setSsoBrowserCookie(res, {
          name: result.cookieName || txCookieName,
          value: result.browserTxToken,
          maxAgeSeconds: result.ttlSeconds,
          path: "/api/auth/sso",
          secure,
        });
        if (redirectBrowser && result.authorizeUrl) {
          return res.redirect(302, result.authorizeUrl);
        }
        return res.status(200).json({
          success: true,
          data: {
            authorizeUrl: result.authorizeUrl,
            targetPath: result.targetPath,
            expiresAt: result.expiresAt,
          },
        });
      } catch (error) {
        return sendSsoError(res, error);
      }
    })();
  }

  // Destination-initiated start (Moly Studio -> CSCA-Course)
  router.get("/moly/start", ssoRateLimiter, (req, res) =>
    handleIncomingStart(req, res, { redirectBrowser: true }),
  );
  router.post("/moly/start", ssoRateLimiter, (req, res) =>
    handleIncomingStart(req, res, { redirectBrowser: false }),
  );

  // Check Course launch eligibility and return Moly /sso/start URL (without minting a code)
  router.post("/moly/intent", ssoRateLimiter, protectRoute, async (req, res) => {
    try {
      const targetPath = req.body?.targetPath ?? req.body?.target_path ?? "/khoa-hoc";
      const result = await ssoService.checkMolyLaunchIntent({
        userId: req.user.id,
        targetSystem: "moly",
        targetPath,
        scopeType: req.body?.scopeType ?? req.body?.scope_type ?? "account",
        scopedLocalCourseId: req.body?.scopedLocalCourseId ?? req.body?.scoped_local_course_id ?? null,
        scopedExternalCourseId: req.body?.scopedExternalCourseId ?? req.body?.scoped_external_course_id ?? null,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });
      return res.status(200).json({
        success: true,
        data: {
          destinationStartUrl: result.destinationStartUrl,
          targetPath: result.targetPath,
        },
      });
    } catch (error) {
      return sendSsoError(res, error);
    }
  });

  // Authorize authenticated learner from CSCA-Course -> Moly Studio with PKCE challenge + state
  router.post("/moly/authorize", ssoRateLimiter, protectRoute, async (req, res) => {
    try {
      const targetPath = req.body?.targetPath ?? req.body?.target_path ?? "/khoa-hoc";
      const result = await ssoService.authorizeMolySsoRequest({
        userId: req.user.id,
        state: req.body?.state ?? "",
        codeChallenge: req.body?.codeChallenge ?? req.body?.code_challenge ?? "",
        codeChallengeMethod: req.body?.codeChallengeMethod ?? req.body?.code_challenge_method ?? "S256",
        targetSystem: "moly",
        targetPath,
        scopeType: req.body?.scopeType ?? req.body?.scope_type ?? "account",
        scopedLocalCourseId: req.body?.scopedLocalCourseId ?? req.body?.scoped_local_course_id ?? null,
        scopedExternalCourseId: req.body?.scopedExternalCourseId ?? req.body?.scoped_external_course_id ?? null,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });
      return res.status(200).json({
        success: true,
        data: {
          redirectUrl: result.redirectUrl,
          launchUrl: result.launchUrl,
          targetPath: result.targetPath,
          expiresAt: result.expiresAt,
          expiresInSeconds: result.expiresInSeconds,
        },
      });
    } catch (error) {
      return sendSsoError(res, error);
    }
  });

  // Disabled legacy non-PKCE launch endpoint (fails closed)
  router.post("/moly/launch", ssoRateLimiter, protectRoute, async (req, res) => {
    try {
      const targetPath = req.body?.targetPath ?? req.body?.target_path ?? "/khoa-hoc";
      await ssoService.issueCourseSsoCode({
        userId: req.user.id,
        targetSystem: "moly",
        targetPath,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });
      return res.status(400).json({ success: false, errorCode: "SSO_PKCE_REQUIRED", message: "PKCE required." });
    } catch (error) {
      return sendSsoError(res, error);
    }
  });

  // Consume Moly Studio -> CSCA-Course one-time SSO code and set Course HttpOnly cookies
  router.post("/consume", ssoRateLimiter, async (req, res) => {
    const secure = shouldUseSecureSsoCookie(req);
    try {
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      const state = typeof req.body?.state === "string" ? req.body.state.trim() : "";
      const ctx = getRequestLoginContext(req);
      const result = await ssoService.consumeMolySso({
        code,
        state,
        req,
        deviceToken: ctx.deviceToken,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });

      clearSsoBrowserCookie(res, { name: txCookieName, path: "/api/auth/sso", secure });

      if (result.status === "LINK_REQUIRED") {
        setSsoBrowserCookie(res, {
          name: result.linkCookieName || linkCookieName,
          value: result.linkBrowserTxToken,
          maxAgeSeconds: result.linkCookieTtlSeconds || 600,
          path: "/api/auth/sso",
          secure,
        });
        return res.status(200).json({
          success: true,
          data: {
            status: "LINK_REQUIRED",
            linkToken: result.linkToken,
            email: result.email,
            hasPassword: result.hasPassword,
            targetPath: result.targetPath,
          },
        });
      }

      clearSsoBrowserCookie(res, { name: linkCookieName, path: "/api/auth/sso", secure });
      setTrustedDeviceCookie(res, result.session.deviceToken);
      generateTokenAndSetCookie(result.user, res, result.session);
      const userDto = (await loadUserDto(result.user.id)) || {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
      };

      return res.status(200).json({
        success: true,
        data: {
          status: "AUTHENTICATED",
          redirectPath: result.redirectPath,
          user: userDto,
        },
      });
    } catch (error) {
      if ([
        "SSO_BROWSER_TX_ALREADY_USED",
        "SSO_BROWSER_TX_EXPIRED",
        "SSO_CODE_INVALID",
        "SSO_CODE_ALREADY_USED",
        "SSO_CODE_EXPIRED",
        "SSO_PKCE_MISMATCH",
        "DEVICE_LIMIT_REACHED",
      ].includes(error?.code || error?.errorCode)) {
        clearSsoBrowserCookie(res, { name: txCookieName, path: "/api/auth/sso", secure });
      }
      const userId = error?.details?.userId;
      const enriched = userId ? await buildDeviceLimitFailure(error, userId) : error;
      return sendSsoError(res, enriched);
    }
  });

  // Check whether current browser holds an active pending Safe-Link session
  router.get("/link/status", ssoRateLimiter, async (req, res) => {
    try {
      const data = await ssoService.getCourseSafeLinkStatus({ req });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendSsoError(res, error);
    }
  });

  // Safe Linking verification for unlinked email collisions on Course
  router.post("/link/confirm", ssoRateLimiter, async (req, res) => {
    const secure = shouldUseSecureSsoCookie(req);
    try {
      const linkToken = typeof req.body?.linkToken === "string" ? req.body.linkToken.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : null;
      const authenticatedUser = await resolveOptionalAuthenticatedUser(req);
      const ctx = getRequestLoginContext(req);

      const result = await ssoService.confirmCourseSafeLink({
        linkToken,
        password,
        authenticatedUser,
        req,
        deviceToken: ctx.deviceToken,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });

      clearSsoBrowserCookie(res, { name: linkCookieName, path: "/api/auth/sso", secure });
      setTrustedDeviceCookie(res, result.session.deviceToken);
      generateTokenAndSetCookie(result.user, res, result.session);
      const userDto = (await loadUserDto(result.user.id)) || {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
      };

      return res.status(200).json({
        success: true,
        data: {
          status: "AUTHENTICATED",
          redirectPath: result.redirectPath,
          user: userDto,
        },
      });
    } catch (error) {
      const userId = error?.details?.userId;
      const enriched = userId ? await buildDeviceLimitFailure(error, userId) : error;
      return sendSsoError(res, enriched);
    }
  });

  return router;
};

export default createSsoRouter();
