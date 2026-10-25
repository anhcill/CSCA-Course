import { lazy } from "react";

export const CHUNK_RELOAD_STORAGE_KEY = "csca:chunk-reload-at";
export const DEFAULT_RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Expected a JavaScript(?:-or-Wasm)? module script/i,
  /Unable to preload CSS/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
];

export const isChunkLoadError = (error) => {
  if (!error) return false;
  const name = String(error.name || "");
  const message = String(error.message || error || "");
  if (name === "ChunkLoadError") return true;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const getDefaultStorage = () => {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

const getDefaultReload = () => {
  if (typeof window !== "undefined" && window.location) {
    window.location.reload();
  }
};

/**
 * Triggers a single hard reload when a stale deployment chunk is encountered.
 * Guards with sessionStorage so a genuinely missing file cannot cause an infinite reload loop.
 */
export const reloadOnceForStaleChunk = ({
  storage = getDefaultStorage(),
  reload = getDefaultReload,
  now = () => Date.now(),
  cooldownMs = DEFAULT_RELOAD_COOLDOWN_MS,
} = {}) => {
  const currentTime = now();

  try {
    const rawLastReload = storage?.getItem(CHUNK_RELOAD_STORAGE_KEY);
    const lastReloadAt = rawLastReload ? Number(rawLastReload) : 0;
    if (Number.isFinite(lastReloadAt) && lastReloadAt > 0 && currentTime - lastReloadAt < cooldownMs) {
      return false;
    }
    storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(currentTime));
  } catch {
    // If sessionStorage is blocked (e.g. strict privacy mode), avoid risking an unguarded reload loop.
    return false;
  }

  reload();
  return true;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads a dynamic import with one quick retry for transient network blips,
 * then falls back to a one-time page reload if the bundle hash is stale after a deploy.
 */
export const loadModuleWithRetry = async (
  importer,
  {
    retryDelayMs = 400,
    reloadOnStale = () => reloadOnceForStaleChunk(),
    hangOnReload = true,
  } = {},
) => {
  try {
    return await importer();
  } catch {
    if (retryDelayMs > 0) {
      await wait(retryDelayMs);
    }

    try {
      return await importer();
    } catch (retryError) {
      if (isChunkLoadError(retryError)) {
        const didTriggerReload = reloadOnStale();
        if (didTriggerReload && hangOnReload) {
          // Keep Suspense fallback visible while the browser unloads and reloads.
          return new Promise(() => {});
        }
      }
      throw retryError;
    }
  }
};

export const lazyWithRetry = (importer, options) => (
  lazy(() => loadModuleWithRetry(importer, options))
);

let swUpdatePending = false;
let handlersInstalled = false;

export const isSwUpdatePending = () => swUpdatePending;

export const markSwUpdatePending = () => {
  swUpdatePending = true;
};

export const installChunkErrorHandlers = () => {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnceForStaleChunk();
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event?.reason)) {
      event.preventDefault();
      reloadOnceForStaleChunk();
    }
  });

  if ("serviceWorker" in navigator) {
    try {
      const hadControllerOnBoot = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadControllerOnBoot) {
          swUpdatePending = true;
        }
      });
    } catch {
      // Ignore restricted serviceWorker environments
    }
  }
};
