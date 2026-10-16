import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGoogleDriveUrl } from "./recordingUrl.js";

test("accepts Google Drive file and folder links", () => {
  assert.equal(
    normalizeGoogleDriveUrl("https://drive.google.com/file/d/example/view?usp=sharing"),
    "https://drive.google.com/file/d/example/view?usp=sharing",
  );
  assert.equal(
    normalizeGoogleDriveUrl("https://drive.google.com/drive/folders/example#fragment"),
    "https://drive.google.com/drive/folders/example",
  );
});

test("accepts Google Docs links and rejects unsafe destinations", () => {
  assert.ok(normalizeGoogleDriveUrl("https://docs.google.com/document/d/example/edit"));
  assert.equal(normalizeGoogleDriveUrl("http://drive.google.com/file/d/example"), null);
  assert.equal(normalizeGoogleDriveUrl("https://drive.google.com.evil.test/file"), null);
  assert.equal(normalizeGoogleDriveUrl("javascript:alert(1)"), null);
});
