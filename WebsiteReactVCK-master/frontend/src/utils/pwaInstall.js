export const PWA_STORAGE_KEYS = {
  INSTALLED: "pwa_installed",
  LAST_PROMPT: "pwa_last_prompt_time",
  DISMISS_COUNT: "pwa_install_dismiss_count",
  LEGACY_DISMISSED: "pwa_install_dismissed_at",
};

// Sau lần đóng đầu tiên (tránh trường hợp user lỡ bấm tắt): nhắc lại sau 3 ngày.
// Từ lần đóng thứ 2 trở đi: giãn ra 7 ngày để không gây phiền.
export const FIRST_REMIND_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const REPEAT_REMIND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const getDefaultStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const isStandaloneDisplayMode = (
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
) => {
  if (!win) return false;
  return Boolean(
    win.matchMedia?.("(display-mode: standalone)")?.matches
      || win.matchMedia?.("(display-mode: fullscreen)")?.matches
      || win.matchMedia?.("(display-mode: minimal-ui)")?.matches
      || win.navigator?.standalone === true
      || doc?.referrer?.startsWith("android-app://"),
  );
};

export const detectIosDevice = (nav = typeof navigator !== "undefined" ? navigator : null) => {
  if (!nav) return { isIos: false, isIosSafari: false };
  const ua = String(nav.userAgent || "");
  const platform = String(nav.platform || "");
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const isIos = /iPad|iPhone|iPod/i.test(ua)
    || (platform === "MacIntel" && maxTouchPoints > 1);
  const isIosSafari = isIos
    && /Safari/i.test(ua)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Zalo/i.test(ua);
  return { isIos, isIosSafari };
};

export const detectDesktopSafari = (nav = typeof navigator !== "undefined" ? navigator : null) => {
  if (!nav) return false;
  const ua = String(nav.userAgent || "");
  const { isIos } = detectIosDevice(nav);
  if (isIos) return false;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(ua);
};

export const getStoredDismissCount = (storage = getDefaultStorage()) => {
  try {
    const raw = storage?.getItem(PWA_STORAGE_KEYS.DISMISS_COUNT);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
};

export const getNextPromptCooldownMs = (dismissCount = 0) => (
  dismissCount <= 1 ? FIRST_REMIND_COOLDOWN_MS : REPEAT_REMIND_COOLDOWN_MS
);

export const shouldShowPwaReminder = ({
  isInstalled = false,
  storage = getDefaultStorage(),
  now = Date.now(),
} = {}) => {
  if (isInstalled) return false;
  try {
    const lastPromptRaw =
      storage?.getItem(PWA_STORAGE_KEYS.LAST_PROMPT)
      || storage?.getItem(PWA_STORAGE_KEYS.LEGACY_DISMISSED);
    if (!lastPromptRaw) return true;

    const lastPromptAt = Number(lastPromptRaw);
    if (!Number.isFinite(lastPromptAt) || lastPromptAt <= 0) return true;

    const dismissCount = getStoredDismissCount(storage);
    const cooldownMs = getNextPromptCooldownMs(dismissCount);
    return now - lastPromptAt >= cooldownMs;
  } catch {
    return true;
  }
};

export const recordPwaPromptDismissed = (
  storage = getDefaultStorage(),
  now = Date.now(),
) => {
  const nextCount = getStoredDismissCount(storage) + 1;
  try {
    storage?.setItem(PWA_STORAGE_KEYS.DISMISS_COUNT, String(nextCount));
    storage?.setItem(PWA_STORAGE_KEYS.LAST_PROMPT, String(now));
  } catch {
    // ignore storage errors in private browsing
  }
  return nextCount;
};

export const recordPwaInstalled = (storage = getDefaultStorage()) => {
  try {
    storage?.setItem(PWA_STORAGE_KEYS.INSTALLED, "true");
    storage?.removeItem(PWA_STORAGE_KEYS.LAST_PROMPT);
    storage?.removeItem(PWA_STORAGE_KEYS.DISMISS_COUNT);
    storage?.removeItem(PWA_STORAGE_KEYS.LEGACY_DISMISSED);
  } catch {
    // ignore
  }
};

export const clearPwaInstalledFlag = (storage = getDefaultStorage()) => {
  try {
    storage?.removeItem(PWA_STORAGE_KEYS.INSTALLED);
  } catch {
    // ignore
  }
};

export const checkIsPwaInstalled = async ({
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
  nav = typeof navigator !== "undefined" ? navigator : null,
  storage = getDefaultStorage(),
} = {}) => {
  if (!win) return false;

  if (isStandaloneDisplayMode(win, doc)) {
    recordPwaInstalled(storage);
    return true;
  }

  try {
    if (storage?.getItem(PWA_STORAGE_KEYS.INSTALLED) === "true") {
      return true;
    }
  } catch {
    // ignore
  }

  if (nav && typeof nav.getInstalledRelatedApps === "function") {
    try {
      const relatedApps = await nav.getInstalledRelatedApps();
      if (Array.isArray(relatedApps) && relatedApps.length > 0) {
        recordPwaInstalled(storage);
        return true;
      }
    } catch {
      // ignore restricted contexts
    }
  }

  return false;
};
