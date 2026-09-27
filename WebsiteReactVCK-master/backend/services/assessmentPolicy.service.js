const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const QUIZ_REVIEW_POLICIES = new Set(["after_submit", "after_close", "never"]);

export const getQuizAvailability = (quiz, now = new Date()) => {
  const current = asDate(now) || new Date();
  const opensAt = asDate(quiz.available_from);
  // Legacy take-home quizzes already used due_date as their close time.
  const closesAt = asDate(quiz.available_until) || (quiz.activity_scope === "homework" ? asDate(quiz.due_date) : null);
  if (opensAt && current < opensAt) return { isOpen: false, reason: "not_open", opensAt, closesAt };
  if (closesAt && current >= closesAt) return { isOpen: false, reason: "closed", opensAt, closesAt };
  return { isOpen: true, reason: null, opensAt, closesAt };
};

export const getAttemptExpiry = ({ startedAt, durationMinutes, closesAt }) => {
  const start = asDate(startedAt);
  if (!start) return null;
  const duration = Number(durationMinutes);
  const timedExpiry = Number.isFinite(duration) && duration > 0
    ? new Date(start.getTime() + duration * 60 * 1000)
    : null;
  const closes = asDate(closesAt);
  if (timedExpiry && closes) return timedExpiry < closes ? timedExpiry : closes;
  return timedExpiry || closes || null;
};

export const reviewIsAvailable = (quiz, now = new Date()) => {
  const policy = QUIZ_REVIEW_POLICIES.has(quiz.review_policy) ? quiz.review_policy : "after_submit";
  if (policy === "never") return false;
  if (policy === "after_submit") return true;
  const closesAt = asDate(quiz.available_until) || (quiz.activity_scope === "homework" ? asDate(quiz.due_date) : null);
  return Boolean(closesAt && (asDate(now) || new Date()) >= closesAt);
};

export const normalizeRubric = (value, maxScore) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error("INVALID_RUBRIC");
  const criteria = value.map((item, index) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const description = typeof item?.description === "string" ? item.description.trim() : "";
    const points = Number(item?.maxPoints);
    if (!title || title.length > 255 || description.length > 2000 || !Number.isFinite(points) || points <= 0 || points > 999.99) throw new Error("INVALID_RUBRIC");
    return { id: `criterion-${index + 1}`, title, description, maxPoints: Number(points.toFixed(2)) };
  });
  const total = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  if (criteria.length && Math.abs(total - Number(maxScore)) > 0.005) throw new Error("RUBRIC_TOTAL_MISMATCH");
  return criteria;
};

export const normalizeRubricScores = (value, criteria) => {
  if (!criteria?.length) return [];
  if (!Array.isArray(value) || value.length !== criteria.length) throw new Error("INVALID_RUBRIC_SCORES");
  const byId = new Map(value.map((item) => [String(item?.criterionId || ""), item]));
  return criteria.map((criterion) => {
    const item = byId.get(criterion.id);
    const score = Number(item?.score);
    const feedback = typeof item?.feedback === "string" ? item.feedback.trim() : "";
    if (!item || !Number.isFinite(score) || score < 0 || score > criterion.maxPoints || feedback.length > 4000) throw new Error("INVALID_RUBRIC_SCORES");
    return { criterionId: criterion.id, score: Number(score.toFixed(2)), feedback };
  });
};
