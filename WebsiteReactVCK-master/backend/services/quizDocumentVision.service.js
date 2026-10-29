import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { extractQuizImageOcrJson, extractQuizImageOcrText } from "./quizOcr.service.js";
import { normalizeQuizImportStructuredResult, QUIZ_IMPORT_JSON_SCHEMA } from "./quizDocumentImport.service.js";
import { uploadCloudinaryBuffer } from "./cloudinary.service.js";

const MAX_VISION_PAGES = 30;
const DEFAULT_DPI = 160;

const run = (command, args, { signal } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  child.on("error", (error) => reject(error));
  child.on("close", (code) => {
    signal?.removeEventListener("abort", abort);
    if (code === 0) resolve();
    else reject(new Error(stderr.trim() || `PDF renderer exited with code ${code}`));
  });
});

export const documentExtractionLooksAnomalous = ({ text = "", parsed = null } = {}) => {
  const normalized = String(text || "").trim();
  if (normalized.length < 80) return true;
  if (!parsed?.items?.length) return true;
  // A PDF whose layout collapses into one/two options per question needs a
  // vision pass even when pdf-parse technically returned readable text.
  const optionItems = parsed.items.filter((item) => (item.options?.length || 0) > 0);
  if (!optionItems.length) return false;
  const incomplete = optionItems.filter((item) => (item.options?.length || 0) < 4);
  return incomplete.length > Math.max(2, Math.ceil(optionItems.length * 0.7));
};

export const renderPdfPages = async (buffer, {
  maxPages = MAX_VISION_PAGES,
  dpi = DEFAULT_DPI,
  pdftoppmPath = process.env.QUIZ_IMPORT_PDFTOPPM_PATH || "pdftoppm",
  signal,
} = {}) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-import-"));
  const sourcePath = path.join(tempDir, "source.pdf");
  const outputPrefix = path.join(tempDir, "page");
  await fs.writeFile(sourcePath, buffer);
  try {
    await run(pdftoppmPath, ["-png", "-r", String(dpi), "-f", "1", "-l", String(Math.min(maxPages, MAX_VISION_PAGES)), sourcePath, outputPrefix], { signal });
    const files = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    return files.map((name) => ({
      page: Number(name.match(/\d+/)?.[0] || 0),
      path: path.join(tempDir, name),
    }));
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

export const extractQuizDocumentVisionText = async (file, options = {}) => {
  const isPdf = /^application\/pdf$/i.test(file?.mimetype || "") || /\.pdf$/i.test(file?.originalname || "");
  const isDocx = /officedocument\.wordprocessingml\.document/i.test(file?.mimetype || "") || /\.docx$/i.test(file?.originalname || "");
  if (!isPdf && !isDocx) throw new Error("VISION_DOCUMENT_TYPE_UNSUPPORTED");

  let conversionDir = null;
  let pdfBuffer = file.buffer;
  if (isDocx) {
    conversionDir = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-import-docx-"));
    try {
      const sourcePath = path.join(conversionDir, "source.docx");
      await fs.writeFile(sourcePath, file.buffer);
      const officePath = process.env.QUIZ_IMPORT_OFFICE_PATH || "soffice";
      await run(officePath, ["--headless", "--convert-to", "pdf", "--outdir", conversionDir, sourcePath], options);
      pdfBuffer = await fs.readFile(path.join(conversionDir, "source.pdf"));
    } catch (error) {
      await fs.rm(conversionDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  const pages = await renderPdfPages(pdfBuffer, options);
  if (!pages.length) throw new Error("PDF did not render any pages");
  try {
    const chunks = [];
    for (const page of pages) {
      const imageBuffer = await fs.readFile(page.path);
      const text = await extractQuizImageOcrText({
        buffer: imageBuffer,
        mimetype: "image/png",
      }, options);
      if (text.trim()) chunks.push(`\n[Trang ${page.page}]\n${text.trim()}`);
    }
    return chunks.join("\n").trim();
  } finally {
    await fs.rm(path.dirname(pages[0].path), { recursive: true, force: true }).catch(() => {});
    if (conversionDir) await fs.rm(conversionDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const extractQuizDocumentVisionStructured = async (file, options = {}) => {
  const isPdf = /^application\/pdf$/i.test(file?.mimetype || "") || /\.pdf$/i.test(file?.originalname || "");
  const isDocx = /officedocument\.wordprocessingml\.document/i.test(file?.mimetype || "") || /\.docx$/i.test(file?.originalname || "");
  if (!isPdf && !isDocx) throw new Error("VISION_DOCUMENT_TYPE_UNSUPPORTED");
  let conversionDir = null;
  let pdfBuffer = file.buffer;
  if (isDocx) {
    conversionDir = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-import-docx-"));
    try {
      const sourcePath = path.join(conversionDir, "source.docx");
      await fs.writeFile(sourcePath, file.buffer);
      const officePath = process.env.QUIZ_IMPORT_OFFICE_PATH || "soffice";
      await run(officePath, ["--headless", "--convert-to", "pdf", "--outdir", conversionDir, sourcePath], options);
      pdfBuffer = await fs.readFile(path.join(conversionDir, "source.pdf"));
    } catch (error) {
      await fs.rm(conversionDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  let pages;
  try {
    pages = await renderPdfPages(pdfBuffer, options);
  } catch (error) {
    if (conversionDir) await fs.rm(conversionDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  if (!pages.length) throw new Error("PDF did not render any pages");
  try {
    const questions = [];
    for (const page of pages) {
      const imageBuffer = await fs.readFile(page.path);
      let sourceImageUrl = null;
      try {
        sourceImageUrl = (await uploadCloudinaryBuffer(imageBuffer, {
          folder: "csca/quizzes/import-pages",
          fileName: `quiz-import-page-${page.page}.png`,
        })).publicUrl;
      } catch (error) {
        // OCR should remain usable when Cloudinary is temporarily unavailable.
        console.warn("Quiz import page image upload warning:", error.message);
      }
      const result = await extractQuizImageOcrJson({ buffer: imageBuffer, mimetype: "image/png" }, {
        ...options,
        schema: QUIZ_IMPORT_JSON_SCHEMA,
      });
      const pageQuestions = Array.isArray(result?.questions) ? result.questions : [];
      questions.push(...pageQuestions.map((question) => ({
        ...question,
        source: {
          ...(question.source || {}),
          page: question.source?.page || page.page,
          imageUrl: question.source?.imageUrl || sourceImageUrl,
        },
      })));
    }
    return normalizeQuizImportStructuredResult({ questions }, options);
  } finally {
    await fs.rm(path.dirname(pages[0].path), { recursive: true, force: true }).catch(() => {});
    if (conversionDir) await fs.rm(conversionDir, { recursive: true, force: true }).catch(() => {});
  }
};
