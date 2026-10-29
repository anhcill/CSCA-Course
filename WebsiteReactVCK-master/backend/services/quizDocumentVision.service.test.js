import assert from "node:assert/strict";
import test from "node:test";
import { documentExtractionLooksAnomalous } from "./quizDocumentVision.service.js";

test("document vision fallback detects collapsed multi-choice layouts", () => {
  assert.equal(documentExtractionLooksAnomalous({
    text: "x".repeat(400),
    parsed: { items: Array.from({ length: 10 }, () => ({ options: [{}, {}] })) },
  }), true);
});

test("document vision fallback does not flag normal four-option questions", () => {
  assert.equal(documentExtractionLooksAnomalous({
    text: "x".repeat(400),
    parsed: { items: Array.from({ length: 10 }, () => ({ options: [{}, {}, {}, {}] })) },
  }), false);
});
