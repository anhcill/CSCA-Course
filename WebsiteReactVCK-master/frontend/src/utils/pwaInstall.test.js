import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_REMIND_COOLDOWN_MS,
  PWA_STORAGE_KEYS,
  REPEAT_REMIND_COOLDOWN_MS,
  checkIsPwaInstalled,
  clearPwaInstalledFlag,
  detectDesktopSafari,
  detectIosDevice,
  recordPwaInstalled,
  recordPwaPromptDismissed,
  shouldShowPwaReminder,
} from "./pwaInstall.js";

const createMemoryStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
};

test("shouldShowPwaReminder shows initially when not installed, then respects 3-day and 7-day cooldowns", () => {
  const storage = createMemoryStorage();
  const t0 = 1_700_000_000_000;

  assert.equal(shouldShowPwaReminder({ isInstalled: false, storage, now: t0 }), true);

  // First dismiss (e.g., accidental close): hidden for 3 days, then re-shown
  const count1 = recordPwaPromptDismissed(storage, t0);
  assert.equal(count1, 1);
  assert.equal(
    shouldShowPwaReminder({ isInstalled: false, storage, now: t0 + FIRST_REMIND_COOLDOWN_MS - 1000 }),
    false,
  );
  assert.equal(
    shouldShowPwaReminder({ isInstalled: false, storage, now: t0 + FIRST_REMIND_COOLDOWN_MS }),
    true,
  );

  // Second dismiss: backs off to 7 days
  const t1 = t0 + FIRST_REMIND_COOLDOWN_MS;
  const count2 = recordPwaPromptDismissed(storage, t1);
  assert.equal(count2, 2);
  assert.equal(
    shouldShowPwaReminder({ isInstalled: false, storage, now: t1 + FIRST_REMIND_COOLDOWN_MS }),
    false,
  );
  assert.equal(
    shouldShowPwaReminder({ isInstalled: false, storage, now: t1 + REPEAT_REMIND_COOLDOWN_MS }),
    true,
  );
});

test("shouldShowPwaReminder never shows when installed, and uninstall flag clearing restores eligibility", async () => {
  const storage = createMemoryStorage();
  const t0 = 1_700_000_000_000;
  recordPwaPromptDismissed(storage, t0);
  recordPwaInstalled(storage);

  assert.equal(storage.getItem(PWA_STORAGE_KEYS.INSTALLED), "true");
  assert.equal(storage.getItem(PWA_STORAGE_KEYS.LAST_PROMPT), null);
  assert.equal(shouldShowPwaReminder({ isInstalled: true, storage, now: t0 }), false);

  const mockWin = { matchMedia: () => ({ matches: false }), navigator: {} };
  assert.equal(await checkIsPwaInstalled({ win: mockWin, doc: {}, nav: {}, storage }), true);

  // If browser later fires beforeinstallprompt, clearing installed flag restores reminder
  clearPwaInstalledFlag(storage);
  assert.equal(await checkIsPwaInstalled({ win: mockWin, doc: {}, nav: {}, storage }), false);
  assert.equal(shouldShowPwaReminder({ isInstalled: false, storage, now: t0 }), true);
});

test("detectIosDevice and detectDesktopSafari classify mobile and desktop Safari correctly", () => {
  assert.deepEqual(
    detectIosDevice({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    { isIos: true, isIosSafari: true },
  );

  assert.deepEqual(
    detectIosDevice({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    { isIos: true, isIosSafari: false },
  );

  assert.equal(
    detectDesktopSafari({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    true,
  );
});
