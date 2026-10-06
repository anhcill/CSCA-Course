export const DEFAULT_GRADEBOOK_POLICY = {
  weights: { assignment: 50, quiz: 40, attendance: 10 },
  quizStrategy: "latest", missingPolicy: "exclude", passMark: 60,
};

export const normalizeGradebookPolicy = (value = {}) => {
  const weights = Object.fromEntries(["assignment", "quiz", "attendance"].map((key) => [key, Number(value.weights?.[key])]));
  if (Object.values(weights).some((n) => !Number.isFinite(n) || n < 0 || n > 100)
    || Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 100) > 0.001
    || !["latest", "best", "average"].includes(value.quizStrategy)
    || !["exclude", "zero"].includes(value.missingPolicy)
    || !Number.isFinite(Number(value.passMark)) || Number(value.passMark) < 0 || Number(value.passMark) > 100) {
    throw new Error("Tổng trọng số phải bằng 100%; chính sách điểm chưa hợp lệ.");
  }
  return { weights, quizStrategy: value.quizStrategy, missingPolicy: value.missingPolicy, passMark: Number(value.passMark) };
};

export const aggregateQuizAttempts = (attempts, strategy) => {
  const valid = attempts.filter((row) => Number(row.max_score) > 0 && row.score !== null && row.score !== undefined);
  if (!valid.length) return null;
  const pct = (row) => Number(row.score) / Number(row.max_score) * 100;
  if (strategy === "best") return Math.max(...valid.map(pct));
  if (strategy === "average") return valid.reduce((sum, row) => sum + pct(row), 0) / valid.length;
  return pct([...valid].sort((a, b) => Number(b.attempt_number) - Number(a.attempt_number) || Number(b.id) - Number(a.id))[0]);
};

export const calculateGradebookTotal = (categories, policy) => {
  let weighted = 0;
  let denominator = 0;
  for (const key of ["assignment", "quiz", "attendance"]) {
    const values = categories[key] || [];
    // A category with no assigned activities never penalizes a learner.
    const considered = policy.missingPolicy === "zero" ? values.map((v) => v ?? 0) : values.filter((v) => v !== null && v !== undefined);
    if (!considered.length) continue;
    const average = considered.reduce((a, b) => a + b, 0) / considered.length;
    weighted += average * policy.weights[key];
    denominator += policy.weights[key];
  }
  const total = denominator ? Math.round(weighted / denominator * 100) / 100 : null;
  return { total, passed: total === null ? null : total >= policy.passMark };
};

export const normalizeAnnotations = (value = []) => {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Tối đa 100 chú thích cho mỗi bài.");
  return value.map((item) => {
    const page = Number(item.page || 1);
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const x = item.x === null || item.x === undefined ? null : Number(item.x);
    const y = item.y === null || item.y === undefined ? null : Number(item.y);
    if (!text || text.length > 2000 || !Number.isInteger(page) || page < 1 || page > 10000
      || (x === null) !== (y === null)
      || (x !== null && (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1))) {
      throw new Error("Chú thích cần nội dung, trang và vị trí hợp lệ.");
    }
    return { page, text, x, y };
  });
};

export const canResubmit = (submission, now = Date.now()) => Boolean(submission?.return_requested
  && submission.resubmit_until && new Date(submission.resubmit_until).getTime() > now);
