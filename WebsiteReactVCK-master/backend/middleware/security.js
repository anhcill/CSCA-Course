const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "");

export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store");
  }
  return next();
};

export const createRateLimiter = ({ windowMs, max, message = "Quá nhiều yêu cầu, vui lòng thử lại sau" }) => {
  const buckets = new Map();
  let lastCleanup = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, bucket] of buckets) {
        if (now - bucket.startedAt >= windowMs) buckets.delete(key);
      }
      lastCleanup = now;
    }

    const key = `${req.ip || "unknown"}:${req.baseUrl || ""}${req.path || ""}`;
    const current = buckets.get(key);
    const bucket = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        message,
        errorCode: "RATE_LIMITED",
      });
    }
    return next();
  };
};

export const isAllowedOrigin = (origin, configuredOrigin) => {
  if (!origin) return true;
  const allowed = String(configuredOrigin || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  return allowed.includes(normalizeOrigin(origin));
};

