import katex from "../frontend/node_modules/katex/dist/katex.mjs";
import { getClient, pool } from "../backend/db/connect.js";

const PROFILE_ID = 5;
const FORBIDDEN_MATH_UNICODE = /[∈∉∩∪⊂⊆√²³≥≤−∞∅△]/u;
const VIETNAMESE_MARKER = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;

function extractLatex(value) {
  const source = String(value || "");
  const formulas = [];
  const paired = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let match;
  while ((match = paired.exec(source))) formulas.push(match[1] ?? match[2] ?? "");
  return formulas;
}

function hasBalancedDelimiters(value) {
  const source = String(value || "");
  return (source.match(/\\\(/g) || []).length === (source.match(/\\\)/g) || []).length
    && (source.match(/\\\[/g) || []).length === (source.match(/\\\]/g) || []).length;
}

function validateLatex(value, label, issues) {
  if (!hasBalancedDelimiters(value)) issues.push(`${label}: cặp delimiter LaTeX không cân bằng`);
  for (const formula of extractLatex(value)) {
    try {
      katex.renderToString(formula, { throwOnError: true, strict: "ignore" });
    } catch (error) {
      issues.push(`${label}: LaTeX lỗi (${error.message})`);
    }
  }
}

async function run() {
  const client = await getClient();
  try {
    const quizzes = (await client.query(
      `SELECT q.id, q.title, q.description, q.passing_score,
              COUNT(DISTINCT qa.id)::int AS attempt_count,
              COUNT(DISTINCT qq.id)::int AS question_count,
              COALESCE(SUM(DISTINCT qq.points), 0)::numeric AS raw_distinct_points
       FROM quizzes q
       JOIN recording_curriculum_unit_overrides o
         ON o.id = q.recording_curriculum_unit_override_id
       JOIN recording_curriculum_references r
         ON r.id = o.curriculum_reference_id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE r.video_course_profile_id = $1
       GROUP BY q.id
       ORDER BY q.id`,
      [PROFILE_ID],
    )).rows;

    const report = [];
    for (const quiz of quizzes) {
      const questions = (await client.query(
        `SELECT id, COALESCE(item_order, sort_order) AS item_order,
                question_text, question_text_cn, options_json,
                correct_answer, explanation, points
         FROM quiz_questions
         WHERE quiz_id = $1
         ORDER BY COALESCE(item_order, sort_order), id`,
        [quiz.id],
      )).rows;
      const issues = [];
      let totalPoints = 0;
      for (const row of questions) {
        const prefix = `Câu ${row.item_order}`;
        const options = Array.isArray(row.options_json) ? row.options_json : [];
        const optionText = options.map((option) => String(option.text || "")).join(" ");
        totalPoints += Number(row.points || 0);
        if (!/[\u3400-\u9fff]/u.test(row.question_text || "")) issues.push(`${prefix}: đề chưa có tiếng Trung`);
        if (VIETNAMESE_MARKER.test(`${row.question_text || ""} ${optionText}`)) issues.push(`${prefix}: đề/lựa chọn còn tiếng Việt`);
        const explanationStr = String(row.explanation || "");
        if (
          !VIETNAMESE_MARKER.test(explanationStr)
          || !explanationStr.includes("Bước 1")
          || !explanationStr.includes("Bước 2")
        ) {
          issues.push(`${prefix}: lời giải chưa phải tiếng Việt chi tiết theo Bước 1/Bước 2`);
        }
        if (String(row.explanation || "").length < 150) issues.push(`${prefix}: lời giải còn ngắn`);
        if (FORBIDDEN_MATH_UNICODE.test(`${row.question_text || ""} ${optionText} ${row.explanation || ""}`)) {
          issues.push(`${prefix}: còn ký hiệu toán Unicode thay vì LaTeX`);
        }
        if (!options.some((option) => String(option.key) === String(row.correct_answer))) {
          issues.push(`${prefix}: đáp án đúng không tồn tại trong lựa chọn`);
        }
        validateLatex(row.question_text, `${prefix} đề`, issues);
        options.forEach((option) => validateLatex(option.text, `${prefix} lựa chọn ${option.key}`, issues));
        validateLatex(row.explanation, `${prefix} lời giải`, issues);
      }
      if (questions.length !== 15) issues.push(`Số câu là ${questions.length}, cần đúng 15`);
      if (Math.abs(totalPoints - 10) > 0.0001) issues.push(`Tổng điểm là ${totalPoints}, cần đúng 10`);
      if (Number(quiz.passing_score) !== 60) issues.push(`Mốc đạt là ${quiz.passing_score}%, cần 60% (6/10)`);
      report.push({
        quizId: Number(quiz.id),
        title: quiz.title,
        attempts: Number(quiz.attempt_count || 0),
        questions: questions.length,
        totalPoints: Number(totalPoints.toFixed(2)),
        passingScorePercent: Number(quiz.passing_score),
        ready: issues.length === 0,
        issues,
      });
    }
    const expectedQuizzes = report.filter((item) => /集合练习|不等式练习|Tập hợp|Bất đẳng thức/u.test(item.title));
    console.log(JSON.stringify({
      ready: expectedQuizzes.length === 2 && expectedQuizzes.every((item) => item.ready),
      profileId: PROFILE_ID,
      quizzes: expectedQuizzes,
    }, null, 2));
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
