const CHAPTER_PREFIX_RE = /^\s*chương\s+\d+(?:[.-]\d+)*\s*[:–—-]\s*/iu;
const MAKEUP_2610_RE = /^\s*(?:Imported\s+from\s+CSCA\s+Course\s+LMS\s*:\s*)?buổi\s+học\s+bù\s+26\s*\/\s*10(?:\b|\s|$)/iu;

/**
 * Turns source curriculum labels into learner-facing Record lesson names.
 * Each semicolon-separated chapter keeps its own name, while technical
 * "Chương N:" prefixes are removed and duplicate labels are collapsed.
 */
export function normalizeRecordLessonTitle(value, { maxLength = 255 } = {}) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  const seen = new Set();
  const labels = raw
    .split(/\s*;\s*/u)
    .map((part) => part.replace(CHAPTER_PREFIX_RE, "").trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLocaleLowerCase("vi");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const normalized = (labels.length > 0 ? labels.join(" · ") : raw)
    .replace(/\s{2,}/gu, " ")
    .trim();
  return normalized.slice(0, maxLength).trim();
}

/**
 * The source class retains this session for attendance/audit. A Record copy
 * can use this signal to default the lesson to hidden without deleting source.
 */
export function shouldHideRecordLessonByDefault(value) {
  return MAKEUP_2610_RE.test(String(value || "").trim());
}

export function normalizeRecordLessonDescription(value, { maxLength = 5000 } = {}) {
  return String(value || "").trim().slice(0, maxLength).trim();
}
