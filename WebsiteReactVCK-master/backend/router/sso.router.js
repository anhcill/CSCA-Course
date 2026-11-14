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
import { SsoPolicyError } from "../services/ssoPathPolicy.service.js";

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

  // Launch from CSCA-Course -> Moly Studio
  router.post("/moly/launch", ssoRateLimiter, protectRoute, async (req, res) => {
    try {
      const targetPath = req.body?.targetPath ?? req.body?.target_path ?? "/khoa-hoc";
      const result = await ssoService.issueCourseSsoCode({
        userId: req.user.id,
        targetSystem: "moly",
        targetPath,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });
      return res.status(200).json({
        success: true,
        data: {
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

  // Consume Moly Studio -> CSCA-Course one-time SSO code and set Course HttpOnly cookies
  router.post("/consume", ssoRateLimiter, async (req, res) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      const state = typeof req.body?.state === "string" ? req.body.state.trim() : "";
      const ctx = getRequestLoginContext(req);
      const result = await ssoService.consumeMolySso({
        code,
        state,
        deviceToken: ctx.deviceToken,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });

      if (result.status === "LINK_REQUIRED") {
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

  // Safe Linking verification for unlinked email collisions on Course
  router.post("/link/confirm", ssoRateLimiter, async (req, res) => {
    try {
      const linkToken = typeof req.body?.linkToken === "string" ? req.body.linkToken.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : null;
      const authenticatedUser = await resolveOptionalAuthenticatedUser(req);
      const ctx = getRequestLoginContext(req);

      const result = await ssoService.confirmCourseSafeLink({
        linkToken,
        password,
        authenticatedUser,
        deviceToken: ctx.deviceToken,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        correlationId: req.headers["x-correlation-id"] || undefined,
      });

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
