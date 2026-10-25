import test from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_RELOAD_STORAGE_KEY,
  isChunkLoadError,
  loadModuleWithRetry,
  reloadOnceForStaleChunk,
} from "./chunkRecovery.js";

const createMemoryStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
};

test("isChunkLoadError identifies browser dynamic import and Vite preload failures", () => {
  assert.equal(
    isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://www.molycourse.online/assets/Quiz-123.js")),
    true,
  );
  assert.equal(
    isChunkLoadError(new TypeError("Importing a module script failed.")),
    true,
  );
  assert.equal(
    isChunkLoadError(new Error("Expected a JavaScript module script but the server responded with a MIME type of \"text/html\"")),
    true,
  );
  assert.equal(
    isChunkLoadError(new Error("Unable to preload CSS for /assets/style-123.css")),
    true,
  );
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(null), false);
});

test("reloadOnceForStaleChunk reloads once and suppresses duplicate reloads within cooldown", () => {
  const storage = createMemoryStorage();
  let reloadCalls = 0;
  let currentNow = 50_000;

  const first = reloadOnceForStaleChunk({
    storage,
    reload: () => { reloadCalls += 1; },
    now: () => currentNow,
    cooldownMs: 10_000,
  });
  assert.equal(first, true);
  assert.equal(reloadCalls, 1);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), "50000");

  currentNow = 55_000;
  const second = reloadOnceForStaleChunk({
    storage,
    reload: () => { reloadCalls += 1; },
    now: () => currentNow,
    cooldownMs: 10_000,
  });
  assert.equal(second, false);
  assert.equal(reloadCalls, 1);

  currentNow = 61_000;
  const third = reloadOnceForStaleChunk({
    storage,
    reload: () => { reloadCalls += 1; },
    now: () => currentNow,
    cooldownMs: 10_000,
  });
  assert.equal(third, true);
  assert.equal(reloadCalls, 2);
});

test("loadModuleWithRetry recovers when the second import attempt succeeds", async () => {
  let attempts = 0;
  const fakeModule = { default: () => "ok" };

  const result = await loadModuleWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError("Failed to fetch dynamically imported module");
      }
      return fakeModule;
    },
    { retryDelayMs: 0, reloadOnStale: () => false },
  );

  assert.equal(attempts, 2);
  assert.equal(result, fakeModule);
});

test("loadModuleWithRetry triggers reloadOnStale and rethrows when reload is suppressed", async () => {
  let reloadTriggered = 0;

  await assert.rejects(
    () => loadModuleWithRetry(
      async () => {
        throw new TypeError("Failed to fetch dynamically imported module: /assets/Old-123.js");
      },
      {
        retryDelayMs: 0,
        reloadOnStale: () => {
          reloadTriggered += 1;
          return false;
        },
        hangOnReload: false,
      },
    ),
    /Failed to fetch dynamically imported module/,
  );

  assert.equal(reloadTriggered, 1);
});
