const STATIC_BUNDLE_EXTENSION_PATTERN = /\.(?:js|mjs|cjs|css|map|webmanifest|wasm)$/i;

export const isStaticAssetPath = (rawPath = "") => {
  const pathname = String(rawPath || "").split("?")[0].trim();
  if (!pathname) return false;
  if (pathname === "/assets" || pathname.startsWith("/assets/")) return true;
  return STATIC_BUNDLE_EXTENSION_PATTERN.test(pathname);
};

/**
 * Prevents the SPA catch-all route from returning index.html (200 text/html)
 * when a browser or service worker requests a hashed bundle (/assets/*, *.js, *.css)
 * that no longer exists after a new deployment.
 */
export const missingAssetNotFound = (req, res, next) => {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return next();
  }

  const fullPath = `${req.baseUrl || ""}${req.path || req.url || ""}`;
  if (!isStaticAssetPath(fullPath)) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(404).send("Asset not found");
};
