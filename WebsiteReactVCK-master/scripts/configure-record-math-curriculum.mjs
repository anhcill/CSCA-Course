import katex from "../frontend/node_modules/katex/dist/katex.mjs";
import { getClient, pool } from "../backend/db/connect.js";
import { safeRecordCurriculumMutation } from "../backend/services/courseCurriculumSync.service.js";

const COURSE_ID = 10;
const PROFILE_ID = 5;
const SOURCE_SESSION_ID = 121;
const SOURCE_QUIZ_ID = 11;
const shouldApply = process.argv.includes("--apply");
const validateOnly = process.argv.includes("--validate-only");
const raw = String.raw;
const FORBIDDEN_MATH_UNICODE = /[∈∉∩∪⊂⊆√²³≥≤−∞∅△]/u;
const VIETNAMESE_MARKER = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;

const choices = (items) => items.map((text, index) => ({
  key: String.fromCharCode(65 + index),
  text,
  textCn: text,
}));

const question = (text, options, answer, explanation) => ({
  text,
  textCn: text,
  options: choices(options),
  answer,
  explanation,
});

const setQuestions = [
  question(raw`下列哪个符号正确表示“\(x\) 是集合 \(A\) 的元素”？`, [raw`\(x\in A\)`, raw`\(x\subset A\)`, raw`\(x\cup A\)`, raw`\(x=A\)`], "A", raw`**Bước 1.** Quan hệ giữa một phần tử và một tập hợp được ký hiệu bằng \(\in\). Vì vậy mệnh đề đúng là \(x\in A\).

**Bước 2.** \(\subset\) dùng để so sánh hai tập hợp; \(\cup\) là phép hợp. Do đó B và C sai về loại quan hệ, còn D khẳng định hai đối tượng bằng nhau nên cũng sai.`),
  question(raw`已知 \(A=\{1,2,3\}\)，\(B=\{2,3,4\}\)，则 \(A\cap B\) 等于`, [raw`\(\{1,4\}\)`, raw`\(\{2,3\}\)`, raw`\(\{1,2,3,4\}\)`, raw`\(\{2,3,4\}\)`], "B", raw`**Bước 1.** Phép giao \(A\cap B\) chỉ lấy những phần tử xuất hiện đồng thời trong cả hai tập.

**Bước 2.** Trong \(A\), các phần tử \(2,3\) cũng thuộc \(B\); còn \(1\notin B\) và \(4\notin A\). Vậy \(A\cap B=\{2,3\}\).`),
  question(raw`已知 \(A=\{a,b\}\)，\(B=\{b,c\}\)，则 \(A\cup B\) 等于`, [raw`\(\{b\}\)`, raw`\(\{a,c\}\)`, raw`\(\{a,b,c\}\)`, raw`\(\{a,b,b,c\}\)`], "C", raw`**Bước 1.** Phép hợp lấy tất cả phần tử thuộc \(A\) hoặc thuộc \(B\).

**Bước 2.** Gộp hai danh sách ta có \(a,b,b,c\), nhưng trong tập hợp mỗi phần tử chỉ viết một lần. Do đó \(A\cup B=\{a,b,c\}\); phương án D là bẫy lặp phần tử \(b\).`),
  question(raw`对任意集合 \(A\)，下列命题恒成立的是`, [raw`\(A\subseteq\varnothing\)`, raw`\(\varnothing\subseteq A\)`, raw`\(A\in A\)`, raw`\(A\cap\varnothing=A\)`], "B", raw`**Bước 1.** Tập rỗng không có phần tử nên mọi phần tử của \(\varnothing\) đều thuộc \(A\) một cách hiển nhiên. Vì thế \(\varnothing\subseteq A\) luôn đúng.

**Bước 2.** \(A\subseteq\varnothing\) chỉ đúng khi \(A=\varnothing\); \(A\cap\varnothing=\varnothing\), không phải luôn bằng \(A\). Ký hiệu \(A\in A\) cũng không phải tính chất chung của tập hợp.`),
  question(raw`一个集合有 \(5\) 个元素，它共有多少个子集？`, [raw`\(5\)`, raw`\(10\)`, raw`\(25\)`, raw`\(32\)`], "D", raw`**Bước 1.** Với mỗi phần tử, ta có đúng hai lựa chọn độc lập: chọn hoặc không chọn vào tập con.

**Bước 2.** Có \(5\) phần tử nên số cách chọn là \(2^5=32\). Kết quả này đã bao gồm tập rỗng và chính tập ban đầu.`),
  question(raw`集合 \(A\) 有 \(4\) 个元素，\(A\) 的真子集共有多少个？`, [raw`\(8\)`, raw`\(15\)`, raw`\(16\)`, raw`\(14\)`], "B", raw`**Bước 1.** Tổng số tập con của tập có \(4\) phần tử là \(2^4=16\).

**Bước 2.** Tập con thực sự không được bằng chính \(A\), nên loại đúng một trường hợp là \(A\). Vì vậy có \(16-1=15\) tập con thực sự; tập rỗng vẫn được tính.`),
  question(raw`根据德摩根定律，\(A\cup B\) 的补集是`, [raw`\(A^{c}\cup B^{c}\)`, raw`\(A^{c}\cap B^{c}\)`, raw`\(A\cap B\)`, raw`\(A^{c}\setminus B^{c}\)`], "B", raw`**Bước 1.** Định luật De Morgan cho biết khi lấy phần bù, phép hợp đổi thành phép giao.

**Bước 2.** Do đó \((A\cup B)^c=A^c\cap B^c\). Có thể kiểm tra bằng logic: một phần tử không thuộc hợp khi và chỉ khi nó đồng thời không thuộc \(A\) và không thuộc \(B\).`),
  question(raw`区间 \([-2,3)\) 与 \((1,5]\) 的交集是`, [raw`\([1,3]\)`, raw`\((1,3)\)`, raw`\([-2,5]\)`, raw`\((1,5]\)`], "B", raw`**Bước 1.** Phần chung phải đồng thời thỏa \(-2\le x<3\) và \(1<x\le5\), suy ra \(1<x<3\).

**Bước 2.** Điểm \(1\) bị loại bởi khoảng thứ hai; điểm \(3\) bị loại bởi khoảng thứ nhất. Vậy giao là \((1,3)\).`),
  question(raw`集合 \([-1,4]\setminus(1,3]\) 等于`, [raw`\([-1,1]\cup(3,4]\)`, raw`\([-1,1)\cup[3,4]\)`, raw`\((1,3]\)`, raw`\([-1,4]\)`], "A", raw`**Bước 1.** Từ đoạn \([-1,4]\), ta loại toàn bộ các số thuộc \((1,3]\).

**Bước 2.** Số \(1\) không thuộc phần bị loại nên vẫn giữ; số \(3\) thuộc phần bị loại nên bỏ. Phần còn lại là \([-1,1]\cup(3,4]\).`),
  question(raw`某班有 \(28\) 人学英语，\(22\) 人学汉语，其中 \(12\) 人两种语言都学。至少学习一种语言的有多少人？`, [raw`\(38\)`, raw`\(50\)`, raw`\(62\)`, raw`\(34\)`], "A", raw`**Bước 1.** Áp dụng công thức hai tập: \(|A\cup B|=|A|+|B|-|A\cap B|\).

**Bước 2.** Thay số: \(|A\cup B|=28+22-12=38\). Ta phải trừ \(12\) vì những bạn học cả hai ngoại ngữ đã bị đếm hai lần trong tổng \(28+22\).`),
  question(raw`满足 \(x^2<10\) 的整数 \(x\) 共有多少个？`, [raw`\(5\)`, raw`\(6\)`, raw`\(7\)`, raw`\(8\)`], "C", raw`**Bước 1.** Từ \(x^2<10\), suy ra \(-\sqrt{10}<x<\sqrt{10}\). Vì \(3<\sqrt{10}<4\), nên \(-4<x<4\).

**Bước 2.** Các số nguyên thỏa mãn là \(-3,-2,-1,0,1,2,3\), tổng cộng \(7\) số.`),
  question(raw`若 \(\{1,a,3\}=\{3,2,1\}\)，则 \(a\) 等于`, [raw`\(1\)`, raw`\(2\)`, raw`\(3\)`, raw`\(1,2,3\) 中任意一个`], "B", raw`**Bước 1.** Hai tập hợp bằng nhau khi chúng có đúng cùng các phần tử, không xét thứ tự viết.

**Bước 2.** Tập bên phải có ba phần tử \(1,2,3\). Bên trái đã có \(1,3\), vì vậy \(a\) phải bổ sung phần tử còn thiếu là \(2\). Nếu \(a=1\) hoặc \(a=3\), hai tập sẽ không bằng nhau.`),
  question(raw`非空区间 \([m,4]\) 满足 \([m,4]\subseteq[1,6]\) 的条件是`, [raw`\(m\le1\)`, raw`\(m\ge1\)`, raw`\(1\le m\le4\)`, raw`\(m\ge4\)`], "C", raw`**Bước 1.** Để \([m,4]\subseteq[1,6]\), đầu trái không được nhỏ hơn \(1\), nên \(m\ge1\). Đầu phải \(4\le6\) đã thỏa.

**Bước 2.** Đoạn \([m,4]\) không rỗng yêu cầu \(m\le4\). Kết hợp hai điều kiện được \(1\le m\le4\).`),
  question(raw`已知 \(A=\{1,2,3\}\)，\(B=\{3,4\}\)，则对称差 \(A\triangle B\) 是`, [raw`\(\{3\}\)`, raw`\(\{1,2,4\}\)`, raw`\(\{1,2,3,4\}\)`, raw`\(\{1,2\}\)`], "B", raw`**Bước 1.** Hiệu đối xứng là \(A\triangle B=(A\setminus B)\cup(B\setminus A)\), tức các phần tử chỉ thuộc đúng một tập.

**Bước 2.** Ta có \(A\setminus B=\{1,2\}\) và \(B\setminus A=\{4\}\). Do đó \(A\triangle B=\{1,2,4\}\); phần tử \(3\) bị loại vì thuộc cả hai tập.`),
  question(raw`三个社团 \(A,B,C\) 分别有 \(45,30,20\) 人，且 \(|A\cap B|=12\)，\(|A\cap C|=8\)，\(|B\cap C|=5\)，\(|A\cap B\cap C|=2\)。至少参加一个社团的有多少人？`, [raw`\(70\)`, raw`\(72\)`, raw`\(74\)`, raw`\(95\)`], "B", raw`**Bước 1.** Dùng nguyên lý bao hàm–loại trừ ba tập:
\[|A\cup B\cup C|=|A|+|B|+|C|-|A\cap B|-|A\cap C|-|B\cap C|+|A\cap B\cap C|.\]

**Bước 2.** Thay số: \(45+30+20-12-8-5+2=72\). Phần giao ba được cộng lại vì ở bước trừ các giao đôi, nó đã bị trừ quá nhiều.`),
];

const inequalityQuestions = [
  question(raw`不等式 \(x+3>5\) 的解集是`, [raw`\(x>2\)`, raw`\(x<2\)`, raw`\(x\ge2\)`, raw`\(x\le2\)`], "A", raw`**Bước 1.** Trừ \(3\) ở cả hai vế: \(x+3-3>5-3\).

**Bước 2.** Suy ra \(x>2\). Khi cộng hoặc trừ cùng một số ở hai vế, chiều bất đẳng thức không thay đổi.`),
  question(raw`不等式 \(-2x<6\) 的解集是`, [raw`\(x<-3\)`, raw`\(x>-3\)`, raw`\(x<3\)`, raw`\(x>3\)`], "B", raw`**Bước 1.** Chia cả hai vế cho \(-2\). Vì chia cho số âm nên bắt buộc đổi chiều dấu bất đẳng thức.

**Bước 2.** Ta được \(x>\frac{6}{-2}=-3\). Bẫy thường gặp là quên đổi dấu và chọn \(x<-3\).`),
  question(raw`解不等式 \(3-2x\ge7\)。`, [raw`\(x\ge-2\)`, raw`\(x\le-2\)`, raw`\(x\ge2\)`, raw`\(x\le2\)`], "B", raw`**Bước 1.** Chuyển \(3\) sang vế phải: \(-2x\ge7-3=4\).

**Bước 2.** Chia hai vế cho \(-2\) và đổi chiều: \(x\le-2\). Thử \(x=-2\) cho \(3-2(-2)=7\), nên dấu bằng được nhận.`),
  question(raw`不等式 \(|x|<4\) 的解集是`, [raw`\(x<4\)`, raw`\(x>-4\)`, raw`\(-4<x<4\)`, raw`\(x<-4\text{ 或 }x>4\)`], "C", raw`**Bước 1.** \(|x|\) là khoảng cách từ \(x\) đến \(0\). Khoảng cách nhỏ hơn \(4\) nghĩa là \(x\) nằm giữa \(-4\) và \(4\).

**Bước 2.** Vì dấu là \(<\), hai biên không được lấy. Do đó nghiệm là \(-4<x<4\).`),
  question(raw`不等式 \((x-1)(x+2)>0\) 的解集是`, [raw`\(-2<x<1\)`, raw`\(x<-2\text{ 或 }x>1\)`, raw`\(x\le-2\text{ 或 }x\ge1\)`, raw`\(x>-2\)`], "B", raw`**Bước 1.** Hai nghiệm làm tích bằng \(0\) là \(x=-2\) và \(x=1\). Hệ số của \(x^2\) dương nên tích dương ở ngoài hai nghiệm.

**Bước 2.** Vì yêu cầu \(>0\), không lấy hai điểm \(-2,1\). Vậy \(x<-2\) hoặc \(x>1\).`),
  question(raw`不等式 \(x^2-5x+6\le0\) 的解集是`, [raw`\(( -\infty,2]\cup[3,+\infty)\)`, raw`\([2,3]\)`, raw`\((2,3)\)`, raw`\([-3,-2]\)`], "B", raw`**Bước 1.** Phân tích \(x^2-5x+6=(x-2)(x-3)\). Hai nghiệm là \(2\) và \(3\).

**Bước 2.** Tam thức có hệ số đầu dương nên không dương trên đoạn giữa hai nghiệm. Vì có dấu \(\le\), lấy cả hai đầu: \(x\in[2,3]\).`),
  question(raw`不等式 \(\dfrac{x-1}{x+2}\ge0\) 的解集是`, [raw`\(( -\infty,-2)\cup[1,+\infty)\)`, raw`\(( -\infty,-2]\cup[1,+\infty)\)`, raw`\([-2,1]\)`, raw`\((-2,1)\)`], "A", raw`**Bước 1.** Các mốc xét dấu là \(x=-2\) (mẫu bằng \(0\), phải loại) và \(x=1\) (tử bằng \(0\), được nhận).

**Bước 2.** Lập bảng dấu cho \(\dfrac{x-1}{x+2}\): biểu thức dương trên \(( -\infty,-2)\) và \((1,+\infty)\), bằng \(0\) tại \(1\). Vậy nghiệm là \(( -\infty,-2)\cup[1,+\infty)\).`),
  question(raw`不等式组 \(x>1\) 且 \(x\le4\) 的解集是`, [raw`\([1,4]\)`, raw`\((1,4]\)`, raw`\((1,4)\)`, raw`\([1,4)\)`], "B", raw`**Bước 1.** Điều kiện thứ nhất cho khoảng \((1,+\infty)\); điều kiện thứ hai cho \(( -\infty,4]\).

**Bước 2.** Lấy giao hai khoảng được \((1,4]\): mở tại \(1\) vì \(x>1\), đóng tại \(4\) vì \(x\le4\).`),
  question(raw`根式 \(\sqrt{\dfrac{x-2}{x+1}}\) 的定义域是`, [raw`\((-1,2)\)`, raw`\(( -\infty,-1)\cup[2,+\infty)\)`, raw`\(( -\infty,-1]\cup[2,+\infty)\)`, raw`\([2,+\infty)\)`], "B", raw`**Bước 1.** Điều kiện xác định là \(\dfrac{x-2}{x+1}\ge0\) đồng thời \(x\ne-1\).

**Bước 2.** Xét dấu theo hai mốc \(-1\) và \(2\): phân thức không âm trên \(( -\infty,-1)\cup[2,+\infty)\). Điểm \(-1\) bị loại do mẫu bằng \(0\), còn \(2\) được lấy vì biểu thức dưới căn bằng \(0\).`),
  question(raw`若 \(a,b>0\)，算术—几何平均不等式给出`, [raw`\(a+b\ge\sqrt{ab}\)`, raw`\(a+b\ge2\sqrt{ab}\)，等号当且仅当 \(a=b\)`, raw`\(a+b\le2\sqrt{ab}\)`, raw`\(a^2+b^2\le2ab\)`], "B", raw`**Bước 1.** AM–GM cho hai số dương là \(\dfrac{a+b}{2}\ge\sqrt{ab}\).

**Bước 2.** Nhân hai vế với \(2\), được \(a+b\ge2\sqrt{ab}\). Dấu bằng xảy ra khi và chỉ khi \(a=b\).`),
  question(raw`若 \(x,y>0\) 且 \(x+y=10\)，则 \(x^2+y^2\) 的最小值是`, [raw`\(25\)`, raw`\(50\)`, raw`\(100\)`, `不存在`], "B", raw`**Bước 1.** Từ \((x-y)^2\ge0\), suy ra \(x^2+y^2\ge2xy\). Do đó \((x+y)^2=x^2+2xy+y^2\le2(x^2+y^2)\).

**Bước 2.** Suy ra \(x^2+y^2\ge\dfrac{(x+y)^2}{2}=\dfrac{100}{2}=50\). Dấu bằng khi \(x=y=5\), thỏa điều kiện dương.`),
  question(raw`不等式 \(x^2-4x+4\ge0\) 对哪些 \(x\) 成立？`, [raw`\(x\ge2\)`, raw`\(x\le2\)`, `所有实数`, raw`\(x\ne2\)`], "C", raw`**Bước 1.** Hoàn thành bình phương: \(x^2-4x+4=(x-2)^2\).

**Bước 2.** Bình phương của mọi số thực luôn không âm, nên bất đẳng thức đúng với mọi \(x\in\mathbb{R}\). Tại \(x=2\), vế trái bằng \(0\) và vẫn thỏa dấu \(\ge\).`),
  question(raw`要使 \(x^2-2mx+m+2>0\) 对一切实数 \(x\) 恒成立，\(m\) 应满足`, [raw`\(m<-1\text{ 或 }m>2\)`, raw`\(-1<m<2\)`, raw`\(-1\le m\le2\)`, raw`\(m>0\)`], "B", raw`**Bước 1.** Đây là tam thức bậc hai theo \(x\) có hệ số đầu \(a=1>0\). Để tam thức dương với mọi \(x\), cần \(\Delta<0\).

**Bước 2.** \(\Delta=(-2m)^2-4(m+2)=4(m^2-m-2)=4(m+1)(m-2)\). Điều kiện \((m+1)(m-2)<0\) cho \(-1<m<2\). Hai đầu bị loại vì khi \(\Delta=0\), tam thức có lúc bằng \(0\), không thỏa dấu \(>0\).`),
  question(raw`不等式 \(\dfrac{1}{x-1}>\dfrac{1}{x+1}\) 的解集是`, [raw`\(-1<x<1\)`, raw`\(x<-1\text{ 或 }x>1\)`, raw`\(x>1\)`, raw`\(x\ne\pm1\)`], "B", raw`**Bước 1.** Điều kiện xác định: \(x\ne1\) và \(x\ne-1\). Chuyển vế:
\[\frac{1}{x-1}-\frac{1}{x+1}=\frac{2}{x^2-1}>0.\]

**Bước 2.** Tử \(2>0\), nên cần \(x^2-1>0\), tức \((x-1)(x+1)>0\). Suy ra \(x<-1\) hoặc \(x>1\). Cách này tránh lỗi nhân chéo khi chưa biết dấu của mẫu.`),
  question(raw`不等式 \(|2x-1|\le5\) 有多少个整数解？`, [raw`\(5\)`, raw`\(6\)`, raw`\(7\)`, raw`\(8\)`], "B", raw`**Bước 1.** Bỏ dấu giá trị tuyệt đối: \(-5\le2x-1\le5\).

**Bước 2.** Cộng \(1\) rồi chia \(2\): \(-2\le x\le3\). Các nghiệm nguyên là \(-2,-1,0,1,2,3\), tổng cộng \(6\) nghiệm.`),
];

const insertQuestions = async (client, quizId, questions) => {
  const attempts = Number((await client.query(
    "SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE quiz_id = $1",
    [quizId],
  )).rows[0]?.count || 0);
  const existingRows = (await client.query(
    `SELECT id FROM quiz_questions
     WHERE quiz_id = $1
     ORDER BY COALESCE(item_order, sort_order), id`,
    [quizId],
  )).rows;
  if (attempts > 0 && existingRows.length !== questions.length) {
    throw new Error(`Quiz ${quizId} đã có lượt làm; từ chối thay đổi cấu trúc câu hỏi.`);
  }
  const pointsForIndex = (index) => (index < 10 ? 0.67 : 0.66);

  if (existingRows.length === questions.length) {
    for (const [index, item] of questions.entries()) {
      await client.query(
        `UPDATE quiz_questions
         SET item_order=$2, sort_order=$2, question_text=$3, question_text_cn=$4,
             question_type='single_choice', options_json=$5::jsonb,
             correct_answer=$6, explanation=$7, explanation_cn=NULL,
             explanation_en=NULL, points=$8
         WHERE id=$1`,
        [
          existingRows[index].id,
          index + 1,
          item.text,
          item.textCn,
          JSON.stringify(item.options),
          item.answer,
          item.explanation,
          pointsForIndex(index),
        ],
      );
    }
    return;
  }

  await client.query("DELETE FROM quiz_questions WHERE quiz_id = $1", [quizId]);
  for (const [index, item] of questions.entries()) {
    await client.query(
      `INSERT INTO quiz_questions
       (quiz_id, item_order, question_text, question_text_cn, question_type,
        options_json, correct_answer, explanation, points, sort_order)
       VALUES ($1,$2,$3,$4,'single_choice',$5::jsonb,$6,$7,$8,$2)`,
      [
        quizId,
        index + 1,
        item.text,
        item.textCn,
        JSON.stringify(item.options),
        item.answer,
        item.explanation,
        pointsForIndex(index),
      ],
    );
  }
};

const ensureQuiz = async (client, { overrideId, title, description, questions, instructorId }) => {
  let quiz = (await client.query(
    `SELECT id FROM quizzes
     WHERE recording_curriculum_unit_override_id = $1
     ORDER BY (title = $2) DESC, id LIMIT 1`,
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
      `UPDATE quizzes SET title=$2, description=$3, course_id=$4, duration_minutes=40,
         passing_score=60, status='PUBLISHED', shuffle_questions=TRUE,
         instructor_id=$5, activity_scope='homework', attempt_limit=3,
         review_policy='after_submit', attempt_score_policy='best', updated_at=NOW()
       WHERE id=$1`,
      [quiz.id, title, description, COURSE_ID, instructorId],
    );
  }
  await insertQuestions(client, quiz.id, questions);
  return Number(quiz.id);
};

const validateQuestionBank = (title, questions) => {
  const issues = [];
  const pointsForIndex = (index) => (index < 10 ? 0.67 : 0.66);
  let totalPoints = 0;
  const checkLatex = (value, label) => {
    const source = String(value || "");
    const balanced = (source.match(/\\\(/g) || []).length === (source.match(/\\\)/g) || []).length
      && (source.match(/\\\[/g) || []).length === (source.match(/\\\]/g) || []).length;
    if (!balanced) issues.push(`${label}: cặp delimiter LaTeX không cân bằng`);
    const paired = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
    let match;
    while ((match = paired.exec(source))) {
      const formula = match[1] ?? match[2] ?? "";
      try {
        katex.renderToString(formula, { throwOnError: true, strict: "ignore" });
      } catch (err) {
        issues.push(`${label}: LaTeX lỗi (${err.message})`);
      }
    }
  };
  for (const [index, item] of questions.entries()) {
    const prefix = `Câu ${index + 1}`;
    const opts = Array.isArray(item.options) ? item.options : [];
    const optText = opts.map((o) => String(o.text || "")).join(" ");
    totalPoints += pointsForIndex(index);
    if (!/[\u3400-\u9fff]/u.test(item.text || "")) issues.push(`${prefix}: đề chưa có tiếng Trung`);
    if (VIETNAMESE_MARKER.test(`${item.text || ""} ${optText}`)) issues.push(`${prefix}: đề/lựa chọn còn tiếng Việt`);
    if (
      !VIETNAMESE_MARKER.test(item.explanation || "")
      || !String(item.explanation || "").includes("Bước 1")
      || !String(item.explanation || "").includes("Bước 2")
    ) {
      issues.push(`${prefix}: lời giải thiếu Bước 1/Bước 2 tiếng Việt`);
    }
    if (String(item.explanation || "").length < 150) issues.push(`${prefix}: lời giải ngắn (${String(item.explanation || "").length} ký tự)`);
    if (FORBIDDEN_MATH_UNICODE.test(`${item.text || ""} ${optText} ${item.explanation || ""}`)) {
      issues.push(`${prefix}: còn ký hiệu toán Unicode`);
    }
    if (!opts.some((o) => String(o.key) === String(item.answer))) {
      issues.push(`${prefix}: đáp án ${item.answer} không khớp lựa chọn`);
    }
    checkLatex(item.text, `${prefix} đề`);
    opts.forEach((o) => checkLatex(o.text, `${prefix} lựa chọn ${o.key}`));
    checkLatex(item.explanation, `${prefix} lời giải`);
  }
  if (questions.length !== 15) issues.push(`Số câu là ${questions.length}, cần đúng 15`);
  if (Math.abs(totalPoints - 10) > 0.0001) issues.push(`Tổng điểm là ${totalPoints}, cần đúng 10`);
  return { title, questions: questions.length, totalPoints: Number(totalPoints.toFixed(2)), ready: issues.length === 0, issues };
};

const run = async () => {
  const sourceAudit = [
    validateQuestionBank("集合练习｜Trắc nghiệm Tập hợp", setQuestions),
    validateQuestionBank("不等式练习｜Trắc nghiệm Bất đẳng thức", inequalityQuestions),
  ];
  if (validateOnly) {
    const ready = sourceAudit.every((q) => q.ready);
    console.log(JSON.stringify({ ready, validateOnly: true, quizzes: sourceAudit }, null, 2));
    if (!ready) process.exitCode = 1;
    return;
  }
  if (!sourceAudit.every((q) => q.ready)) {
    throw new Error(`Nguồn câu hỏi chưa đạt chuẩn: ${JSON.stringify(sourceAudit.filter((q) => !q.ready))}`);
  }

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
      title: "集合练习｜Trắc nghiệm Tập hợp",
      description: "15 câu trắc nghiệm tiếng Trung, tổng 10 điểm; đạt từ 6/10. Có phương án bẫy và lời giải tiếng Việt chi tiết sau khi nộp bài.",
      questions: setQuestions,
      instructorId: context.instructor_id,
    });
    const inequalityQuizId = await ensureQuiz(client, {
      overrideId: inequalityOverride.id,
      title: "不等式练习｜Trắc nghiệm Bất đẳng thức",
      description: "15 câu trắc nghiệm tiếng Trung, tổng 10 điểm; đạt từ 6/10. Chú trọng bẫy đổi dấu, điều kiện xác định và tham số, kèm lời giải tiếng Việt chi tiết.",
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
