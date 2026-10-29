import assert from "node:assert/strict";
import test from "node:test";
import {
  QuizDocumentImportError,
  normalizeQuizImportStructuredResult,
  parseQuizImportText,
  validateQuizImportFile,
} from "./quizDocumentImport.service.js";

test("document parser returns editable single-choice preview items", () => {
  const preview = parseQuizImportText(`
Câu 1. Tính 1 + 1.
A. 1
B. 2
C. 3
D. 4
Đáp án: B
Lời giải: 1 + 1 = 2.

2. Chọn mệnh đề đúng.
A. x > 0
B. x < 0
Answer: A
  `);
  assert.equal(preview.totalQuestionCount, 2);
  assert.equal(preview.items[0].correctAnswer, "B");
  assert.equal(preview.items[0].answers[1].text, "2");
  assert.equal(preview.items[1].questionText, "Chọn mệnh đề đúng.");
});

test("document parser preserves incomplete questions for teacher review", () => {
  const preview = parseQuizImportText("1. Câu chưa có đáp án\nA. Một\nB. Hai");
  assert.equal(preview.items[0].correctAnswer, "");
  assert.match(preview.warnings[0], /chưa đủ lựa chọn hoặc đáp án đúng/);
});

test("structured document results normalize confidence and source references", () => {
  const preview = normalizeQuizImportStructuredResult({
    questions: [{
      number: 7,
      questionText: "Tính hệ số góc.",
      options: [{ key: "A", text: "1" }, { key: "B", text: "2" }],
      correctAnswer: "B",
      confidence: 0.62,
      source: { page: 3, imageUrl: "https://res.cloudinary.com/example/page-3.png" },
    }],
  });
  assert.equal(preview.schemaVersion, "1.0");
  assert.equal(preview.items[0].correctAnswer, "B");
  assert.equal(preview.items[0].ocrMetadata.sourcePage, 3);
  assert.equal(preview.items[0].ocrMetadata.sourceImageUrl, "https://res.cloudinary.com/example/page-3.png");
  assert.equal(preview.items[0].ocrMetadata.reviewRequired, true);
  assert.equal(preview.review.requiredCount, 1);
});

test("document parser splits multiple options that share one PDF text line", () => {
  const preview = parseQuizImportText(`
1. Đường thẳng có hệ số góc là gì?
A. 0       B. 1
C. 2       D. 3
`);
  assert.equal(preview.totalQuestionCount, 1);
  assert.deepEqual(preview.items[0].answers.map((answer) => [answer.key, answer.text]), [
    ["A", "0"], ["B", "1"], ["C", "2"], ["D", "3"],
  ]);
});

test("document upload validation checks extension and binary signature", () => {
  const validPdf = { originalname: "quiz.pdf", mimetype: "application/pdf", size: 8, buffer: Buffer.from("%PDF-1.7") };
  assert.equal(validateQuizImportFile(validPdf), "pdf");
  assert.throws(
    () => validateQuizImportFile({ ...validPdf, buffer: Buffer.from("not a pdf") }),
    (error) => error instanceof QuizDocumentImportError && error.code === "QUIZ_IMPORT_FILE_SIGNATURE_INVALID",
  );
});

test("document upload validation rejects files above the 15 MB limit", () => {
  assert.throws(
    () => validateQuizImportFile({
      originalname: "quiz.pdf",
      mimetype: "application/pdf",
      size: 15 * 1024 * 1024 + 1,
      buffer: Buffer.from("%PDF-1.7"),
    }),
    (error) => error instanceof QuizDocumentImportError && error.code === "QUIZ_IMPORT_FILE_TOO_LARGE" && error.status === 413,
  );
});
