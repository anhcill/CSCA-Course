import { getClient, pool } from "../backend/db/connect.js";
import { safeRecordCurriculumMutation } from "../backend/services/courseCurriculumSync.service.js";

const COURSE_ID = 10;
const PROFILE_ID = 5;
const SOURCE_SESSION_ID = 121;
const SOURCE_QUIZ_ID = 11;
const shouldApply = process.argv.includes("--apply");

const choices = (items) => items.map((text, index) => ({
  key: String.fromCharCode(65 + index),
  text,
}));

const question = (text, options, answer, explanation) => ({
  text,
  options: choices(options),
  answer,
  explanation,
});

const setQuestions = [
  question("Ký hiệu nào diễn tả đúng mệnh đề “x là phần tử của tập A”?", ["x ∈ A", "x ⊂ A", "x ∪ A", "x = A"], "A", "Ký hiệu ∈ dùng cho quan hệ phần tử thuộc tập hợp. Ký hiệu ⊂ dùng giữa hai tập hợp, còn ∪ là phép hợp."),
  question("Cho A = {1, 2, 3} và B = {2, 3, 4}. A ∩ B bằng", ["{1, 4}", "{2, 3}", "{1, 2, 3, 4}", "{2, 3, 4}"], "B", "Giao chỉ giữ các phần tử xuất hiện trong cả A và B, đó là 2 và 3."),
  question("Cho A = {a, b} và B = {b, c}. A ∪ B bằng", ["{b}", "{a, c}", "{a, b, c}", "{a, b, b, c}"], "C", "Hợp lấy mọi phần tử của hai tập nhưng mỗi phần tử chỉ được liệt kê một lần. Phương án D là bẫy lặp phần tử b."),
  question("Khẳng định nào luôn đúng với mọi tập hợp A?", ["A ⊂ ∅", "∅ ⊂ A", "A ∈ A", "A ∩ ∅ = A"], "B", "Tập rỗng là tập con của mọi tập hợp. A ∩ ∅ phải bằng ∅, không phải A."),
  question("Một tập hợp có 5 phần tử thì có bao nhiêu tập con?", ["5", "10", "25", "32"], "D", "Mỗi phần tử có hai lựa chọn: được lấy hoặc không được lấy. Vì vậy số tập con là 2⁵ = 32."),
  question("Tập A có 4 phần tử. Số tập con thực sự của A là", ["8", "15", "16", "14"], "B", "A có 2⁴ = 16 tập con. Tập con thực sự không được bằng chính A nên còn 16 − 1 = 15; tập rỗng vẫn được tính."),
  question("Theo định luật De Morgan, phần bù của A ∪ B là", ["Aᶜ ∪ Bᶜ", "Aᶜ ∩ Bᶜ", "A ∩ B", "Aᶜ ∖ Bᶜ"], "B", "De Morgan đổi phép hợp thành phép giao khi lấy phần bù: (A ∪ B)ᶜ = Aᶜ ∩ Bᶜ."),
  question("Giao của hai khoảng [−2, 3) và (1, 5] là", ["[1, 3]", "(1, 3)", "[−2, 5]", "(1, 5]"], "B", "Phần chung phải lớn hơn 1 và nhỏ hơn 3. Hai đầu 1 và 3 đều bị loại vì ít nhất một khoảng không chứa đầu đó."),
  question("Hiệu [−1, 4] ∖ (1, 3] bằng", ["[−1, 1] ∪ (3, 4]", "[−1, 1) ∪ [3, 4]", "(1, 3]", "[−1, 4]"], "A", "Ta bỏ mọi số lớn hơn 1 đến và gồm cả 3. Số 1 được giữ, số 3 bị bỏ, nên kết quả là [−1,1] ∪ (3,4]."),
  question("Lớp có 28 bạn học tiếng Anh, 22 bạn học tiếng Trung và 12 bạn học cả hai. Có bao nhiêu bạn học ít nhất một trong hai ngoại ngữ?", ["38", "50", "62", "34"], "A", "Dùng công thức |A ∪ B| = |A| + |B| − |A ∩ B| = 28 + 22 − 12 = 38. Phải trừ phần giao vì đã bị đếm hai lần."),
  question("Tập các số nguyên x thỏa x² < 10 có bao nhiêu phần tử?", ["5", "6", "7", "8"], "C", "Ta có −√10 < x < √10. Các số nguyên là −3, −2, −1, 0, 1, 2, 3, tổng cộng 7 phần tử."),
  question("Nếu {1, a, 3} = {3, 2, 1} thì a bằng", ["1", "2", "3", "Có thể bằng 1, 2 hoặc 3"], "B", "Hai tập bằng nhau phải có đúng các phần tử giống nhau. Vế phải có phần tử 2 nên a bắt buộc bằng 2."),
  question("Với đoạn [m, 4] không rỗng, điều kiện để [m, 4] ⊂ [1, 6] là", ["m ≤ 1", "m ≥ 1", "1 ≤ m ≤ 4", "m ≥ 4"], "C", "Đầu trái phải không nhỏ hơn 1 và đoạn không rỗng yêu cầu m ≤ 4. Kết hợp được 1 ≤ m ≤ 4; phương án B bỏ sót điều kiện không rỗng."),
  question("Cho A = {1, 2, 3}, B = {3, 4}. Hiệu đối xứng A △ B là", ["{3}", "{1, 2, 4}", "{1, 2, 3, 4}", "{1, 2}"], "B", "Hiệu đối xứng gồm các phần tử chỉ thuộc đúng một trong hai tập. Phần tử 3 thuộc cả hai nên bị loại."),
  question("Ba câu lạc bộ A, B, C có lần lượt 45, 30, 20 thành viên; |A∩B|=12, |A∩C|=8, |B∩C|=5 và |A∩B∩C|=2. Số người tham gia ít nhất một câu lạc bộ là", ["70", "72", "74", "95"], "B", "Áp dụng bao hàm–loại trừ: 45+30+20−12−8−5+2 = 72. Phần giao ba bị trừ ba lần rồi cần cộng lại một lần."),
];

const inequalityQuestions = [
  question("Nghiệm của bất đẳng thức x + 3 > 5 là", ["x > 2", "x < 2", "x ≥ 2", "x ≤ 2"], "A", "Trừ 3 ở cả hai vế, ta được x > 2. Dấu vẫn giữ nguyên vì chỉ cộng hoặc trừ cùng một số."),
  question("Nghiệm của −2x < 6 là", ["x < −3", "x > −3", "x < 3", "x > 3"], "B", "Chia hai vế cho −2 phải đổi chiều bất đẳng thức, nên x > −3. Đây là bẫy đổi dấu thường gặp."),
  question("Giải bất đẳng thức 3 − 2x ≥ 7.", ["x ≥ −2", "x ≤ −2", "x ≥ 2", "x ≤ 2"], "B", "Ta có −2x ≥ 4. Chia cho −2 và đổi chiều được x ≤ −2."),
  question("Nghiệm của |x| < 4 là", ["x < 4", "x > −4", "−4 < x < 4", "x < −4 hoặc x > 4"], "C", "Khoảng cách từ x đến 0 nhỏ hơn 4 nên x nằm giữa −4 và 4. Hai đầu không được lấy vì dấu là <."),
  question("Nghiệm của (x − 1)(x + 2) > 0 là", ["−2 < x < 1", "x < −2 hoặc x > 1", "x ≤ −2 hoặc x ≥ 1", "x > −2"], "B", "Tích dương khi hai thừa số cùng dấu. Bảng xét dấu cho kết quả ngoài hai nghiệm −2 và 1; dấu > nên không lấy hai đầu."),
  question("Tập nghiệm của x² − 5x + 6 ≤ 0 là", ["(−∞, 2] ∪ [3, +∞)", "[2, 3]", "(2, 3)", "[−3, −2]"], "B", "Ta phân tích (x−2)(x−3) ≤ 0. Tam thức bậc hai hệ số đầu dương nên không dương ở giữa hai nghiệm và lấy cả hai đầu."),
  question("Nghiệm của (x − 1)/(x + 2) ≥ 0 là", ["(−∞, −2) ∪ [1, +∞)", "(−∞, −2] ∪ [1, +∞)", "[−2, 1]", "(−2, 1)"], "A", "Các mốc là −2 và 1. Biểu thức không xác định tại −2 nên phải loại; bằng 0 tại 1 nên được lấy."),
  question("Hệ bất đẳng thức x > 1 và x ≤ 4 có tập nghiệm", ["[1, 4]", "(1, 4]", "(1, 4)", "[1, 4)"], "B", "Lấy giao hai điều kiện: lớn hơn 1 nên mở tại 1, nhỏ hơn hoặc bằng 4 nên đóng tại 4."),
  question("Điều kiện xác định của √((x − 2)/(x + 1)) là", ["(−1, 2)", "(−∞, −1) ∪ [2, +∞)", "(−∞, −1] ∪ [2, +∞)", "[2, +∞)"], "B", "Biểu thức trong căn phải ≥0 và mẫu khác 0. Xét dấu tại −1 và 2 được (−∞,−1)∪[2,+∞); −1 bị loại vì làm mẫu bằng 0."),
  question("Với a, b > 0, bất đẳng thức AM–GM cho biết", ["a+b ≥ √(ab)", "a+b ≥ 2√(ab), đẳng thức khi a=b", "a+b ≤ 2√(ab)", "a²+b² ≤ 2ab"], "B", "AM–GM cho (a+b)/2 ≥ √(ab), tương đương a+b ≥ 2√(ab). Dấu bằng xảy ra đúng khi a=b."),
  question("Với x, y > 0 và x + y = 10, giá trị nhỏ nhất của x² + y² là", ["25", "50", "100", "Không tồn tại"], "B", "Từ (x−y)² ≥ 0 suy ra x²+y² ≥ (x+y)²/2 = 50. Dấu bằng khi x=y=5."),
  question("Bất đẳng thức x² − 4x + 4 ≥ 0 đúng với", ["x ≥ 2", "x ≤ 2", "mọi x thực", "x ≠ 2"], "C", "Vế trái là (x−2)², luôn không âm với mọi x thực và bằng 0 tại x=2. Phương án D sai vì x=2 vẫn thỏa."),
  question("Để x² − 2mx + m + 2 > 0 với mọi x thực, m phải thỏa", ["m < −1 hoặc m > 2", "−1 < m < 2", "−1 ≤ m ≤ 2", "m > 0"], "B", "Hệ số bậc hai dương. Cần Δ < 0: 4m²−4(m+2)<0 ⇔ m²−m−2<0 ⇔ (m+1)(m−2)<0, nên −1<m<2."),
  question("Nghiệm của 1/(x − 1) > 1/(x + 1) là", ["−1 < x < 1", "x < −1 hoặc x > 1", "x > 1", "mọi x ≠ ±1"], "B", "Chuyển vế được 2/(x²−1)>0. Tử dương nên mẫu phải dương: x²−1>0, tức x<−1 hoặc x>1. Không được nhân chéo tùy tiện khi chưa biết dấu mẫu."),
  question("Có bao nhiêu nghiệm nguyên của |2x − 1| ≤ 5?", ["5", "6", "7", "8"], "B", "Ta có −5≤2x−1≤5, suy ra −2≤x≤3. Các nghiệm nguyên −2,−1,0,1,2,3 gồm 6 số."),
];

const insertQuestions = async (client, quizId, questions) => {
  const attempts = Number((await client.query(
    "SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE quiz_id = $1",
    [quizId],
  )).rows[0]?.count || 0);
  const existing = Number((await client.query(
    "SELECT COUNT(*)::int AS count FROM quiz_questions WHERE quiz_id = $1",
    [quizId],
  )).rows[0]?.count || 0);
  if (attempts > 0 && existing !== questions.length) {
    throw new Error(`Quiz ${quizId} đã có lượt làm; từ chối thay đổi cấu trúc câu hỏi.`);
  }
  if (attempts > 0) return;
  await client.query("DELETE FROM quiz_questions WHERE quiz_id = $1", [quizId]);
  for (const [index, item] of questions.entries()) {
    await client.query(
      `INSERT INTO quiz_questions
       (quiz_id, item_order, question_text, question_type, options_json,
        correct_answer, explanation, points, sort_order)
       VALUES ($1,$2,$3,'single_choice',$4::jsonb,$5,$6,1,$2)`,
      [quizId, index + 1, item.text, JSON.stringify(item.options), item.answer, item.explanation],
    );
  }
};

const ensureQuiz = async (client, { overrideId, title, description, questions, instructorId }) => {
  let quiz = (await client.query(
    `SELECT id FROM quizzes
     WHERE recording_curriculum_unit_override_id = $1 AND title = $2
     ORDER BY id LIMIT 1`,
    [overrideId, title],
  )).rows[0];
  if (!quiz) {
    quiz = (await client.query(
      `INSERT INTO quizzes
       (title, description, course_id, duration_minutes, passing_score, status,
        shuffle_questions, instructor_id, activity_scope, attempt_limit,
        review_policy, attempt_score_policy, recording_curriculum_unit_override_id)
       VALUES ($1,$2,$3,40,60,'PUBLISHED',TRUE,$4,'homework',3,'after_submit','best',$5)
       RETURNING id`,
      [title, description, COURSE_ID, instructorId, overrideId],
    )).rows[0];
  } else {
    await client.query(
      `UPDATE quizzes SET description=$2, course_id=$3, duration_minutes=40,
         passing_score=60, status='PUBLISHED', shuffle_questions=TRUE,
         instructor_id=$4, activity_scope='homework', attempt_limit=3,
         review_policy='after_submit', attempt_score_policy='best', updated_at=NOW()
       WHERE id=$1`,
      [quiz.id, description, COURSE_ID, instructorId],
    );
  }
  await insertQuestions(client, quiz.id, questions);
  return Number(quiz.id);
};

const run = async () => {
  const client = await getClient();
  try {
    const context = (await client.query(
      `SELECT r.id AS reference_id, o.id AS default_override_id,
              COALESCE(q.instructor_id, 1) AS instructor_id
       FROM recording_curriculum_references r
       JOIN recording_curriculum_unit_overrides o
         ON o.curriculum_reference_id=r.id AND o.source_class_session_id=$2
        AND COALESCE(o.slice_key, 'default')='default'
       LEFT JOIN quizzes q ON q.id=$3
       WHERE r.video_course_profile_id=$1`,
      [PROFILE_ID, SOURCE_SESSION_ID, SOURCE_QUIZ_ID],
    )).rows[0];
    if (!context) throw new Error("Không tìm thấy mapping Record/source session cần cấu hình.");

    const preview = {
      courseId: COURSE_ID,
      profileId: PROFILE_ID,
      sourceSessionId: SOURCE_SESSION_ID,
      slices: [
        { title: "Tập hợp", files: [23], vocabulary: [106, 150], formulas: [1, 15], questions: setQuestions.length },
        { title: "Bất đẳng thức", files: [24], vocabulary: [151, 205], formulas: [16, 33], questions: inequalityQuestions.length },
      ],
    };
    if (!shouldApply) {
      console.log(JSON.stringify({ ready: true, apply: false, preview }, null, 2));
      return;
    }

    await client.query("BEGIN");
    const setFilter = {
      sourceFileIds: [23],
      sourceQuizIds: [],
      sourceVocabularyIds: Array.from({ length: 45 }, (_, index) => 106 + index),
      sourceFormulaIds: Array.from({ length: 15 }, (_, index) => 1 + index),
    };
    const inequalityFilter = {
      sourceFileIds: [24],
      sourceQuizIds: [],
      sourceVocabularyIds: Array.from({ length: 55 }, (_, index) => 151 + index),
      sourceFormulaIds: Array.from({ length: 18 }, (_, index) => 16 + index),
    };
    await client.query(
      `UPDATE recording_curriculum_unit_overrides
       SET title_override='Tập hợp',
           summary_override='Kiến thức nền tảng về tập hợp, phép toán tập hợp và các dạng bài từ cơ bản đến nâng cao.',
           sort_order_override=1, is_published_override=TRUE,
           content_filter=$2::jsonb, updated_at=NOW()
       WHERE id=$1`,
      [context.default_override_id, JSON.stringify(setFilter)],
    );
    const inequalityOverride = (await client.query(
      `INSERT INTO recording_curriculum_unit_overrides
       (curriculum_reference_id, source_class_session_id, slice_key, title_override,
        summary_override, sort_order_override, is_published_override,
        is_public_preview_override, content_filter)
       VALUES ($1,$2,'chapter-2','Bất đẳng thức',
        'Bất đẳng thức và các kỹ thuật giải với hệ thống câu hỏi có bẫy từ dễ đến khó.',
        1,TRUE,FALSE,$3::jsonb)
       ON CONFLICT (curriculum_reference_id, source_class_session_id, slice_key)
       DO UPDATE SET title_override=EXCLUDED.title_override,
         summary_override=EXCLUDED.summary_override,
         sort_order_override=EXCLUDED.sort_order_override,
         is_published_override=TRUE,
         content_filter=EXCLUDED.content_filter,
         updated_at=NOW()
       RETURNING id`,
      [context.reference_id, SOURCE_SESSION_ID, JSON.stringify(inequalityFilter)],
    )).rows[0];

    const setQuizId = await ensureQuiz(client, {
      overrideId: context.default_override_id,
      title: "Trắc nghiệm Tập hợp – từ dễ đến khó",
      description: "15 câu trắc nghiệm phân tầng, có phương án bẫy và lời giải chi tiết sau khi nộp bài.",
      questions: setQuestions,
      instructorId: context.instructor_id,
    });
    const inequalityQuizId = await ensureQuiz(client, {
      overrideId: inequalityOverride.id,
      title: "Trắc nghiệm Bất đẳng thức – từ dễ đến khó",
      description: "15 câu trắc nghiệm phân tầng, chú trọng bẫy đổi dấu, điều kiện xác định và tham số.",
      questions: inequalityQuestions,
      instructorId: context.instructor_id,
    });
    await client.query("COMMIT");

    const sync = await safeRecordCurriculumMutation({
      courseId: COURSE_ID,
      profileId: PROFILE_ID,
      correlationId: `record-math-split-${Date.now()}`,
    });
    console.log(JSON.stringify({
      ready: true,
      apply: true,
      defaultOverrideId: Number(context.default_override_id),
      inequalityOverrideId: Number(inequalityOverride.id),
      quizIds: [setQuizId, inequalityQuizId],
      questionCounts: [setQuestions.length, inequalityQuestions.length],
      sync,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
