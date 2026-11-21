import katex from "../frontend/node_modules/katex/dist/katex.mjs";
import { getClient, pool } from "../backend/db/connect.js";
import { safeRecordCurriculumMutation } from "../backend/services/courseCurriculumSync.service.js";

const COURSE_ID = 10;
const PROFILE_ID = 5;
const shouldApply = process.argv.includes("--apply");
const validateOnly = process.argv.includes("--validate-only");
const raw = String.raw;
const FORBIDDEN_MATH_UNICODE = /[∈∉∩∪⊂⊆√²³≥≤−∞∅△°×÷≠±π]/u;
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

// ============================================================================
// 1. Bài 3: Chương 3 - Hàm số (override_id = 3, session_id = 88) — 20 câu × 0.5đ = 10đ
// ============================================================================
const functionBasicQuestions = [
  question(
    raw`在平面直角坐标系中，点 \(A(-2,3)\) 与点 \(B(4,-5)\) 之间的距离为`,
    [raw`\(10\)`, raw`\(2\sqrt{7}\)`, raw`\(8\)`, raw`\(14\)`],
    "A",
    raw`**Bước 1.** Áp dụng công thức khoảng cách giữa hai điểm \(A(x_1,y_1)\) và \(B(x_2,y_2)\):
\[d=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}.\]

**Bước 2.** Thay \(A(-2,3)\) và \(B(4,-5)\):
\[d=\sqrt{(4-(-2))^2+(-5-3)^2}=\sqrt{6^2+(-8)^2}=\sqrt{36+64}=\sqrt{100}=10.\]
Bẫy hay gặp là quên đổi dấu khi trừ số âm \(4-(-2)=6\), dẫn tới tính nhầm thành \(2\sqrt{7}\).`,
  ),
  question(
    raw`已知线段 \(AB\) 的中点为 \(M(1,-1)\)，点 \(A\) 的坐标为 \((-3,2)\)，则点 \(B\) 的坐标为`,
    [raw`\((-1,\dfrac{1}{2})\)`, raw`\((5,-4)\)`, raw`\((-2,1)\)`, raw`\((4,-3)\)`],
    "B",
    raw`**Bước 1.** Gọi \(B(x_B,y_B)\). Theo công thức tọa độ trung điểm:
\[\frac{x_A+x_B}{2}=x_M,\qquad \frac{y_A+y_B}{2}=y_M.\]

**Bước 2.** Suy ra \(x_B=2x_M-x_A=2(1)-(-3)=5\) và \(y_B=2y_M-y_A=2(-1)-2=-4\). Vậy \(B(5,-4)\). Phương án A là bẫy lấy nhầm trung điểm của \(A\) và \(M\).`,
  ),
  question(
    raw`函数 \(f(x)=\dfrac{1}{\sqrt{x-2}}+\sqrt{5-x}\) 的定义域是`,
    [raw`\((2,5)\)`, raw`\([2,5]\)`, raw`\((2,5]\)`, raw`\([2,5)\)`],
    "C",
    raw`**Bước 1.** Để \(f(x)\) có nghĩa, biểu thức trong căn ở mẫu phải dương hẳn và biểu thức trong căn ở tử phải không âm:
\[\begin{cases}x-2>0\\5-x\ge 0\end{cases}\iff \begin{cases}x>2\\x\le 5.\end{cases}\]

**Bước 2.** Giao hai điều kiện thu được \(2<x\le 5\), tức tập xác định là \((2,5]\). Phương án B là bẫy phổ biến khi quên loại \(x=2\) làm mẫu số bằng \(0\).`,
  ),
  question(
    raw`函数 \(f(x)=\dfrac{(x-1)^0}{\sqrt{4-x^2}}\) 的定义域为`,
    [raw`\((-2,2)\)`, raw`\([-2,1)\cup(1,2]\)`, raw`\((-2,1)\cup(1,2)\)`, raw`\((-\infty,1)\cup(1,+\infty)\)`],
    "C",
    raw`**Bước 1.** Biểu thức chứa đồng thời lũy thừa bậc \(0\) và căn bậc hai ở mẫu, nên cần hai điều kiện:
\[\begin{cases}x-1\ne 0\\4-x^2>0\end{cases}\iff \begin{cases}x\ne 1\\-2<x<2.\end{cases}\]

**Bước 2.** Loại điểm \(x=1\) khỏi khoảng \((-2,2)\) ta được \((-2,1)\cup(1,2)\). Bẫy CSCA nằm ở chỗ \((x-1)^0\) không có nghĩa tại \(x=1\) (dạng \(0^0\)), nên không được chọn A.`,
  ),
  question(
    raw`已知函数 \(f(x)\) 的定义域为 \([-1,3]\)，则函数 \(f(2x-1)\) 的定义域为`,
    [raw`\([-3,5]\)`, raw`\([0,2]\)`, raw`\([-1,3]\)`, raw`\([0,1]\)`],
    "B",
    raw`**Bước 1.** Tập xác định của hàm hợp \(f(2x-1)\) là tập các giá trị \(x\) sao cho biểu thức bên trong \(2x-1\) nằm trong tập xác định \([-1,3]\) của \(f\):
\[-1\le 2x-1\le 3.\]

**Bước 2.** Cộng \(1\) vào cả ba vế rồi chia cho \(2\): \(0\le 2x\le 4\iff 0\le x\le 2\), tức \([0,2]\). Bẫy kinh điển là thay trực tiếp \(x\in[-1,3]\) vào \(2x-1\) để ra \([-3,5]\).`,
  ),
  question(
    raw`已知函数 \(f(x+1)\) 的定义域为 \([0,2]\)，则函数 \(f(x)\) 的定义域为`,
    [raw`\([-1,1]\)`, raw`\([0,2]\)`, raw`\([0,3]\)`, raw`\([1,3]\)`],
    "D",
    raw`**Bước 1.** Tập xác định của một hàm số luôn nói về phạm vi của biến \(x\). Do đó \(f(x+1)\) có tập xác định \([0,2]\) nghĩa là \(0\le x\le 2\).

**Bước 2.** Khi \(0\le x\le 2\), ta có \(1\le x+1\le 3\). Đặt \(t=x+1\) thì \(t\in[1,3]\), nên tập xác định của \(f(t)\) (tức \(f(x)\)) là \([1,3]\). Tránh nhầm sang phép trừ để chọn \([-1,1]\).`,
  ),
  question(
    raw`已知分段函数 \(f(x)=\begin{cases}2x+1,&x\le 0,\\ x^2-3,&x>0,\end{cases}\) 则 \(f(f(1))\) 的值为`,
    [raw`\(-3\)`, raw`\(1\)`, raw`\(-5\)`, raw`\(3\)`],
    "A",
    raw`**Bước 1.** Tính lớp trong trước: vì \(1>0\), ta dùng nhánh thứ hai của hàm từng khúc:
\[f(1)=1^2-3=-2.\]

**Bước 2.** Tính tiếp lớp ngoài \(f(-2)\): vì \(-2\le 0\), ta chuyển sang nhánh thứ nhất:
\[f(-2)=2(-2)+1=-3.\]
Bẫy thường gặp là giữ nguyên nhánh \(x>0\) cho bước thứ hai và tính nhầm \((-2)^2-3=1\).`,
  ),
  question(
    raw`下列各组函数中，表示同一个函数的是`,
    [raw`\(f(x)=x\) 与 \(g(x)=\sqrt{x^2}\)`, raw`\(f(x)=x\) 与 \(g(x)=\dfrac{x^2}{x}\)`, raw`\(f(x)=x\) 与 \(g(x)=\sqrt[3]{x^3}\)`, raw`\(f(x)=1\) 与 \(g(x)=x^0\)`],
    "C",
    raw`**Bước 1.** Hai hàm số là cùng một hàm khi và chỉ khi chúng có cùng tập xác định và cùng quy tắc tương ứng trên tập đó.

**Bước 2.** Kiểm tra từng phương án: A sai vì \(\sqrt{x^2}=|x|\ne x\) khi \(x<0\); B và D sai vì \(g(x)\) bị loại điểm \(x=0\) khỏi tập xác định; chỉ có C đúng vì \(\sqrt[3]{x^3}=x\) với mọi \(x\in\mathbb{R}\).`,
  ),
  question(
    raw`已知 \(f(\sqrt{x}+1)=x+2\sqrt{x}\)，则 \(f(x)\) 的解析式为`,
    [raw`\(f(x)=x^2-1\)`, raw`\(f(x)=x^2-1\ (x\ge 1)\)`, raw`\(f(x)=x^2+1\ (x\ge 1)\)`, raw`\(f(x)=x^2-2x\ (x\ge 0)\)`],
    "B",
    raw`**Bước 1.** Đặt \(t=\sqrt{x}+1\). Vì \(\sqrt{x}\ge 0\) nên điều kiện của ẩn mới là \(t\ge 1\), và \(\sqrt{x}=t-1,\ x=(t-1)^2\).

**Bước 2.** Thay vào biểu thức:
\[f(t)=(t-1)^2+2(t-1)=t^2-2t+1+2t-2=t^2-1\quad(t\ge 1).\]
Vậy \(f(x)=x^2-1\ (x\ge 1)\). Phương án A là bẫy lớn nhất của dạng đặt ẩn phụ vì thiếu miền xác định \(x\ge 1\).`,
  ),
  question(
    raw`函数 \(f(x)=x^2\)，\(x\in[-1,2]\) 的奇偶性为`,
    [raw`奇函数`, raw`偶函数`, raw`既是奇函数又是偶函数`, raw`非奇非偶函数`],
    "D",
    raw`**Bước 1.** Điều kiện tiên quyết để xét tính chẵn lẻ của một hàm số là tập xác định \(D\) phải đối xứng qua gốc \(0\) (tức \(x\in D\Rightarrow -x\in D\)).

**Bước 2.** Ở đây \(D=[-1,2]\) không đối xứng qua \(0\) (chẳng hạn \(2\in D\) nhưng \(-2\notin D\)). Do đó dù công thức \(x^2\) thỏa \((-x)^2=x^2\), hàm vẫn là hàm không chẵn không lẻ (非奇非偶函数).`,
  ),
  question(
    raw`若定义域为 \([a-1,2a]\) 的函数 \(f(x)=ax^2+bx+3a+b\) 是偶函数，则 \(a+b\) 等于`,
    [raw`\(\dfrac{1}{3}\)`, raw`\(1\)`, raw`\(0\)`, raw`\(-\dfrac{1}{3}\)`],
    "A",
    raw`**Bước 1.** Vì \(f(x)\) là hàm chẵn nên tập xác định \([a-1,2a]\) phải đối xứng qua \(0\):
\[(a-1)+2a=0\iff 3a=1\iff a=\frac{1}{3}.\]

**Bước 2.** Đồng thời \(f(-x)=f(x)\) với mọi \(x\) trong miền xác định, suy ra hệ số bậc lẻ phải bằng \(0\), tức \(b=0\). Vậy \(a+b=\dfrac{1}{3}+0=\dfrac{1}{3}\).`,
  ),
  question(
    raw`已知定义在 \(\mathbb{R}\) 上的奇函数 \(f(x)\) 满足：当 \(x>0\) 时，\(f(x)=x^2-2x+3\)。则 \(f(-2)+f(0)\) 的值为`,
    [raw`\(3\)`, raw`\(-3\)`, raw`\(0\)`, raw`\(-6\)`],
    "B",
    raw`**Bước 1.** Vì \(f(x)\) là hàm lẻ và xác định tại \(x=0\), ta luôn có \(f(0)=-f(0)\Rightarrow f(0)=0\). Không được thay \(x=0\) vào công thức chỉ dành cho \(x>0\).

**Bước 2.** Với \(x=-2\), dùng tính chất hàm lẻ:
\[f(-2)=-f(2)=-(2^2-2\cdot 2+3)=-3.\]
Suy ra \(f(-2)+f(0)=-3+0=-3\). Bẫy thường gặp là thay \(x=0\) vào \(x^2-2x+3\) để ra \(3\).`,
  ),
  question(
    raw`若二次函数 \(f(x)=(m-1)x^2+2x+c\) 在 \(\mathbb{R}\) 上是奇函数，则下列结论正确的是`,
    [raw`题目条件矛盾，二次函数不可能为奇函数`, raw`\(m=1,\ c=0\)`, raw`\(m=0,\ c=1\)`, raw`\(m=1,\ c=1\)`],
    "A",
    raw`**Bước 1.** Theo định nghĩa, hàm số bậc hai (二次函数) phải có hệ số bậc hai khác \(0\), tức bắt buộc \(m-1\ne 0\).

**Bước 2.** Ngược lại, để đa thức \(f(x)=(m-1)x^2+2x+c\) là hàm lẻ trên \(\mathbb{R}\) thì mọi hệ số bậc chẵn phải bằng \(0\), kéo theo \(m-1=0\) và \(c=0\). Hai điều kiện mâu thuẫn nhau nên hàm bậc hai không bao giờ là hàm lẻ. Bẫy B đánh lừa học viên quên điều kiện \(m-1\ne 0\).`,
  ),
  question(
    raw`函数 \(f(x)=-x^2+4x\) 在区间 \([0,3]\) 上的值域为`,
    [raw`\([0,3]\)`, raw`\([0,4]\)`, raw`\([3,4]\)`, raw`\((-\infty,4]\)`],
    "B",
    raw`**Bước 1.** Viết lại dạng đỉnh: \(f(x)=-(x-2)^2+4\). Parabol có bề lõm hướng xuống và trục đối xứng \(x=2\) nằm bên trong đoạn \([0,3]\).

**Bước 2.** Do đó giá trị lớn nhất đạt tại đỉnh \(f(2)=4\). So sánh hai đầu mút: \(f(0)=0\) và \(f(3)=3\), suy ra giá trị nhỏ nhất là \(0\). Vậy tập giá trị là \([0,4]\). Không được chỉ thay hai đầu mút để ra \([0,3]\).`,
  ),
  question(
    raw`函数 \(f(x)=x^2-6x+5\) 在区间 \([0,2]\) 上的值域为`,
    [raw`\([-4,5]\)`, raw`\([-4,-3]\)`, raw`\([-3,5]\)`, raw`\([0,5]\)`],
    "C",
    raw`**Bước 1.** Trục đối xứng của parabol là \(x=3\), nằm ngoài đoạn \([0,2]\). Vì hệ số bậc hai \(a=1>0\), hàm số nghịch biến trên \((-\infty,3]\), nên cũng nghịch biến trên toàn đoạn \([0,2]\).

**Bước 2.** Giá trị lớn nhất đạt tại đầu trái \(f(0)=5\) và giá trị nhỏ nhất đạt tại đầu phải \(f(2)=2^2-6\cdot 2+5=-3\). Vậy tập giá trị là \([-3,5]\). Phương án A là bẫy lấy nhầm tung độ đỉnh \(f(3)=-4\).`,
  ),
  question(
    raw`若函数 \(f(x)=x^2-2ax+3\) 在区间 \([2,+\infty)\) 上单调递增，则实数 \(a\) 的取值范围是`,
    [raw`\(a=2\)`, raw`\(a\ge 2\)`, raw`\(a<2\)`, raw`\(a\le 2\)`],
    "D",
    raw`**Bước 1.** Parabol \(f(x)=x^2-2ax+3\) có \(a_{\text{đầu}}=1>0\) và trục đối xứng \(x=a\), nên khoảng đồng biến lớn nhất của hàm là \([a,+\infty)\).

**Bước 2.** Để hàm đồng biến trên \([2,+\infty)\), ta cần \([2,+\infty)\subseteq[a,+\infty)\), tương đương \(a\le 2\). Rất nhiều học viên nhầm từ “đồng biến trên \([2,+\infty)\)” với “khoảng đồng biến là \([2,+\infty)\)” nên chọn sai \(a=2\).`,
  ),
  question(
    raw`已知偶函数 \(f(x)\) 在 \([0,+\infty)\) 上单调递增，则不等式 \(f(2x-1)<f(3)\) 的解集为`,
    [raw`\((-\infty,2)\)`, raw`\((-1,2)\)`, raw`\((2,+\infty)\)`, raw`\((-2,1)\)`],
    "B",
    raw`**Bước 1.** Vì \(f(x)\) là hàm chẵn trên \(\mathbb{R}\), ta có \(f(u)=f(|u|)\). Kết hợp tính đồng biến trên \([0,+\infty)\), bất đẳng thức tương đương:
\[f(|2x-1|)<f(3)\iff |2x-1|<3.\]

**Bước 2.** Giải \(-3<2x-1<3\iff -2<2x<4\iff -1<x<2\). Vậy tập nghiệm là \((-1,2)\). Bẫy A là bỏ dấu trị tuyệt đối để giải nhầm \(2x-1<3\).`,
  ),
  question(
    raw`若函数 \(f(x)=\sqrt{ax^2+2ax+1}\) 的定义域为 \(\mathbb{R}\)，则实数 \(a\) 的取值范围是`,
    [raw`\((0,1]\)`, raw`\((0,1)\)`, raw`\([0,1]\)`, raw`\([0,1)\)`],
    "C",
    raw`**Bước 1.** Tập xác định là \(\mathbb{R}\) khi và chỉ khi \(ax^2+2ax+1\ge 0\) đúng với mọi \(x\in\mathbb{R}\). Phải xét riêng trường hợp hệ số cao nhất \(a=0\): khi \(a=0\), bất đẳng thức trở thành \(1\ge 0\), luôn đúng nên nhận \(a=0\).

**Bước 2.** Khi \(a\ne 0\), để tam thức không âm với mọi \(x\) cần:
\[\begin{cases}a>0\\\Delta=(2a)^2-4a\le 0\end{cases}\iff \begin{cases}a>0\\4a(a-1)\le 0\end{cases}\iff 0<a\le 1.\]
Hợp hai trường hợp thu được \(a\in[0,1]\). Bẫy A đánh lừa thí sinh quên xét \(a=0\).`,
  ),
  question(
    raw`分式函数 \(f(x)=\dfrac{2x+1}{x-1}\ (x\ne 1)\) 的值域为`,
    [raw`\((-\infty,1)\cup(1,+\infty)\)`, raw`\((-\infty,-2)\cup(-2,+\infty)\)`, raw`\(\mathbb{R}\)`, raw`\((-\infty,2)\cup(2,+\infty)\)`],
    "D",
    raw`**Bước 1.** Dùng phương pháp tách hằng số (分离常数法) để cô lập biến \(x\) ở mẫu:
\[f(x)=\frac{2(x-1)+3}{x-1}=2+\frac{3}{x-1}.\]

**Bước 2.** Vì \(x\ne 1\), phân thức \(\dfrac{3}{x-1}\) nhận mọi giá trị thực khác \(0\). Do đó \(f(x)\) nhận mọi giá trị thực khác \(2\), tức tập giá trị là \((-\infty,2)\cup(2,+\infty)\).`,
  ),
  question(
    raw`已知 \(f(x)\) 是定义在 \(\mathbb{R}\) 上周期为 \(4\) 的奇函数，且 \(f(1)=2\)，则 \(f(7)+f(4)\) 的值为`,
    [raw`\(-2\)`, raw`\(2\)`, raw`\(0\)`, raw`\(-4\)`],
    "A",
    raw`**Bước 1.** Dùng tính tuần hoàn chu kỳ \(T=4\) để đưa các đối số về gần \(0\):
\[f(4)=f(4-4)=f(0),\qquad f(7)=f(7-8)=f(-1).\]

**Bước 2.** Vì \(f(x)\) là hàm lẻ trên \(\mathbb{R}\), ta có \(f(0)=0\) và \(f(-1)=-f(1)=-2\). Do đó \(f(7)+f(4)=-2+0=-2\).`,
  ),
];

// ============================================================================
// 2. Bài 4: Chương 3 - Hàm số (tiếp) (override_id = 6, session_id = 82) — 20 câu × 0.5đ = 10đ
// ============================================================================
const functionAdvancedQuestions = [
  question(
    raw`设 \(a>0\) 且 \(a\ne 1\)，函数 \(y=a^{x-2}+3\) 的图像恒过定点`,
    [raw`\((2,3)\)`, raw`\((0,4)\)`, raw`\((2,4)\)`, raw`\((3,4)\)`],
    "C",
    raw`**Bước 1.** Đồ thị hàm mũ \(y=a^u\) luôn đi qua điểm ứng với \(u=0\) vì \(a^0=1\) không phụ thuộc vào cơ số \(a\).

**Bước 2.** Cho \(x-2=0\Rightarrow x=2\). Khi đó \(y=a^0+3=1+3=4\). Vậy đồ thị luôn đi qua điểm cố định \((2,4)\). Bẫy A là quên rằng \(a^0=1\) chứ không phải \(0\).`,
  ),
  question(
    raw`设 \(a>0\) 且 \(a\ne 1\)，函数 \(y=\log_a(2x-3)+1\) 的图像恒过定点`,
    [raw`\(\left(\dfrac{3}{2},1\right)\)`, raw`\((2,1)\)`, raw`\((2,0)\)`, raw`\((1,1)\)`],
    "B",
    raw`**Bước 1.** Vì \(\log_a 1=0\) với mọi cơ số hợp lệ \(a>0, a\ne 1\), điểm cố định ứng với lúc chân số bằng \(1\).

**Bước 2.** Giải \(2x-3=1\Rightarrow x=2\), khi đó \(y=\log_a 1+1=0+1=1\). Vậy điểm cố định là \((2,1)\). Bẫy A là cho nhầm chân số \(2x-3=0\) (vi phạm điều kiện logarit).`,
  ),
  question(
    raw`已知幂函数 \(f(x)=(m^2-m-1)x^{m-1}\) 在 \((0,+\infty)\) 上单调递增，则实数 \(m\) 的值为`,
    [raw`\(2\)`, raw`\(-1\)`, raw`\(2\text{ 或 }-1\)`, raw`\(1\)`],
    "A",
    raw`**Bước 1.** Theo định nghĩa hàm lũy thừa (幂函数), dạng chuẩn là \(y=x^\alpha\) nên hệ số trước \(x^{m-1}\) bắt buộc bằng \(1\):
\[m^2-m-1=1\iff m^2-m-2=0\iff (m-2)(m+1)=0\iff m=2\text{ hoặc }m=-1.\]

**Bước 2.** Kiểm tra tính đồng biến trên \((0,+\infty)\) (cần số mũ \(m-1>0\)): với \(m=2\) có số mũ \(1>0\) (nhận); với \(m=-1\) có số mũ \(-2<0\) (nghịch biến, loại). Vậy \(m=2\).`,
  ),
  question(
    raw`幂函数 \(y=(x-1)^{-2}\) 的定义域为`,
    [raw`\((1,+\infty)\)`, raw`\((-\infty,1)\)`, raw`\((-\infty,1)\cup(1,+\infty)\)`, raw`\(\mathbb{R}\)`],
    "C",
    raw`**Bước 1.** Viết lại lũy thừa số mũ nguyên âm dưới dạng phân thức:
\[y=(x-1)^{-2}=\frac{1}{(x-1)^2}.\]

**Bước 2.** Biểu thức xác định khi và chỉ khi mẫu số khác \(0\), tức \(x-1\ne 0\iff x\ne 1\). Vậy tập xác định là \((-\infty,1)\cup(1,+\infty)\).`,
  ),
  question(
    raw`函数 \(y=(2x-4)^{\frac{1}{2}}\) 的定义域是`,
    [raw`\([2,+\infty)\)`, raw`\((2,+\infty)\)`, raw`\((-\infty,2]\)`, raw`\(\mathbb{R}\)`],
    "A",
    raw`**Bước 1.** Lũy thừa số mũ \(\dfrac{1}{2}\) tương đương căn bậc hai:
\[y=(2x-4)^{\frac{1}{2}}=\sqrt{2x-4}.\]

**Bước 2.** Căn bậc hai xác định khi biểu thức dưới dấu căn không âm: \(2x-4\ge 0\iff x\ge 2\). Vì không nằm ở mẫu số, điểm \(x=2\) vẫn được nhận, nên đáp án là \([2,+\infty)\).`,
  ),
  question(
    raw`函数 \(f(x)=\log_{x-1}(4-x)\) 的定义域为`,
    [raw`\((1,4)\)`, raw`\([1,4]\)`, raw`\((2,4)\)`, raw`\((1,2)\cup(2,4)\)`],
    "D",
    raw`**Bước 1.** Hàm logarit \(\log_a b\) phải thỏa mãn đồng thời ba điều kiện: chân số \(b>0\), cơ số \(a>0\) và cơ số \(a\ne 1\):
\[\begin{cases}4-x>0\\x-1>0\\x-1\ne 1\end{cases}\iff \begin{cases}x<4\\x>1\\x\ne 2.\end{cases}\]

**Bước 2.** Kết hợp lại thu được \(x\in(1,2)\cup(2,4)\). Bẫy kinh điển ở phương án A là quên loại điều kiện cơ số khác \(1\) (\(x\ne 2\)).`,
  ),
  question(
    raw`函数 \(f(x)=\dfrac{1}{\sqrt{3^x-9}}\) 的定义域是`,
    [raw`\((-\infty,2)\)`, raw`\([2,+\infty)\)`, raw`\((2,+\infty)\)`, raw`\((3,+\infty)\)`],
    "C",
    raw`**Bước 1.** Biểu thức nằm trong căn bậc hai ở mẫu số nên phải dương hẳn:
\[3^x-9>0\iff 3^x>3^2.\]

**Bước 2.** Vì cơ số \(3>1\), hàm số mũ \(y=3^x\) đồng biến trên \(\mathbb{R}\), suy ra \(x>2\). Tập xác định là \((2,+\infty)\).`,
  ),
  question(
    raw`对数方程 \(\log_2 x+\log_2(x-2)=3\) 的实数解为`,
    [raw`\(x=4\)`, raw`\(x=-2\)`, raw`\(x=4\text{ 或 }x=-2\)`, raw`\(x=2\)`],
    "A",
    raw`**Bước 1.** Đặt điều kiện xác định trước khi gộp logarit:
\[\begin{cases}x>0\\x-2>0\end{cases}\iff x>2.\]
Sau đó gộp vế trái: \(\log_2[x(x-2)]=3\iff x(x-2)=2^3=8\).

**Bước 2.** Giải \(x^2-2x-8=0\iff (x-4)(x+2)=0\Rightarrow x=4\) hoặc \(x=-2\). Đối chiếu điều kiện \(x>2\), loại nghiệm ngoại lai (增根) \(x=-2\), chỉ nhận \(x=4\).`,
  ),
  question(
    raw`指数方程 \(4^x-3\cdot 2^x+2=0\) 的解集是`,
    [raw`\(\{1,2\}\)`, raw`\(\{0,1\}\)`, raw`\(\{-1,2\}\)`, raw`\(\{0\}\)`],
    "B",
    raw`**Bước 1.** Nhận xét \(4^x=(2^x)^2\). Đặt \(t=2^x\) (điều kiện \(t>0\)), phương trình trở thành:
\[t^2-3t+2=0\iff (t-1)(t-2)=0\iff t=1\text{ hoặc }t=2.\]

**Bước 2.** Trả về biến \(x\): \(2^x=1\Rightarrow x=0\) và \(2^x=2\Rightarrow x=1\). Tập nghiệm là \(\{0,1\}\). Phương án A là bẫy quên bước giải ngược từ \(t\) sang \(x\).`,
  ),
  question(
    raw`指数方程 \(9^x-2\cdot 3^x-3=0\) 的实数解为`,
    [raw`\(x=3\)`, raw`\(x=1\)`, raw`\(x=0\text{ 或 }x=1\)`, raw`无实数解`],
    "B",
    raw`**Bước 1.** Đặt \(t=3^x\) với điều kiện chặt \(t>0\). Phương trình trở thành:
\[t^2-2t-3=0\iff (t-3)(t+1)=0\iff t=3\text{ hoặc }t=-1.\]

**Bước 2.** Vì \(3^x>0\) với mọi \(x\in\mathbb{R}\), ta loại \(t=-1\). Với \(t=3\), giải \(3^x=3\Rightarrow x=1\). Đây là bẫy hay gặp khi quên điều kiện \(t>0\) của ẩn phụ mũ.`,
  ),
  question(
    raw`计算 \(\log_2 9\cdot\log_3 4\) 的结果为`,
    [raw`\(2\)`, raw`\(3\)`, raw`\(6\)`, raw`\(4\)`],
    "D",
    raw`**Bước 1.** Dùng công thức đổi cơ số (换底公式) về logarit tự nhiên và hạ số mũ:
\[\log_2 9\cdot\log_3 4=\frac{\ln 9}{\ln 2}\cdot\frac{\ln 4}{\ln 3}=\frac{2\ln 3}{\ln 2}\cdot\frac{2\ln 2}{\ln 3}.\]

**Bước 2.** Rút gọn đồng thời \(\ln 2\) và \(\ln 3\) ở tử và mẫu, ta được \(2\cdot 2=4\).`,
  ),
  question(
    raw`设 \(a=2^{0.3}\)，\(b=0.3^2\)，\(c=\log_2 0.3\)，则 \(a,b,c\) 的大小关系为`,
    [raw`\(a>b>c\)`, raw`\(b>a>c\)`, raw`\(a>c>b\)`, raw`\(c>b>a\)`],
    "A",
    raw`**Bước 1.** Dạng so sánh độ lớn kinh điển của đề CSCA: dùng hai mốc trung gian \(0\) và \(1\) để chặn từng số.
Ta có \(a=2^{0.3}>2^0=1\).

**Bước 2.** Với \(b\) và \(c\): \(0<b=0.3^2=0.09<1\), còn \(c=\log_2 0.3<\log_2 1=0\) (vì cơ số \(2>1\) và \(0.3<1\)). Suy ra \(c<0<b<1<a\), tức \(a>b>c\).`,
  ),
  question(
    raw`设 \(a=\log_{0.5}3\)，\(b=0.5^3\)，\(c=3^{0.5}\)，则 \(a,b,c\) 的大小关系为`,
    [raw`\(a>b>c\)`, raw`\(c>a>b\)`, raw`\(c>b>a\)`, raw`\(b>c>a\)`],
    "C",
    raw`**Bước 1.** Chặn từng giá trị qua mốc \(0\) và \(1\): vì cơ số \(0.5\in(0,1)\) nên hàm \(\log_{0.5}x\) nghịch biến, suy ra \(a=\log_{0.5}3<\log_{0.5}1=0\).

**Bước 2.** Tiếp theo \(0<b=0.5^3=0.125<1\) và \(c=3^{0.5}=\sqrt{3}>1\). Do đó \(c>1>b>0>a\), tức \(c>b>a\).`,
  ),
  question(
    raw`函数 \(f(x)=\log_{\frac{1}{2}}(x^2-4x+3)\) 的单调递增区间是`,
    [raw`\((-\infty,2)\)`, raw`\((-\infty,1)\)`, raw`\((3,+\infty)\)`, raw`\((2,+\infty)\)`],
    "B",
    raw`**Bước 1.** Tìm tập xác định trước khi xét đơn điệu:
\[x^2-4x+3>0\iff (x-1)(x-3)>0\iff x<1\text{ hoặc }x>3.\]

**Bước 2.** Theo quy tắc “đồng tăng dị giảm” (同增异减), vì hàm ngoài \(\log_{\frac{1}{2}}u\) nghịch biến nên \(f(x)\) đồng biến trên phần miền xác định mà \(u(x)=x^2-4x+3\) nghịch biến. Do \(u(x)\) nghịch biến trên \((-\infty,2]\), giao với tập xác định được \((-\infty,1)\). Bẫy A là quên cắt theo điều kiện chân số dương.`,
  ),
  question(
    raw`函数 \(f(x)=\left(\dfrac{1}{2}\right)^{x^2-2x+3}\) 的值域为`,
    [raw`\(\left[\dfrac{1}{4},+\infty\right)\)`, raw`\((0,+\infty)\)`, raw`\(\left(0,\dfrac{1}{2}\right]\)`, raw`\(\left(0,\dfrac{1}{4}\right]\)`],
    "D",
    raw`**Bước 1.** Xét hàm trong \(u(x)=x^2-2x+3=(x-1)^2+2\ge 2\) với mọi \(x\in\mathbb{R}\).

**Bước 2.** Vì cơ số \(\dfrac{1}{2}\in(0,1)\) nên hàm \(y=\left(\dfrac{1}{2}\right)^u\) nghịch biến và luôn dương:
\[u\ge 2\implies 0<\left(\frac{1}{2}\right)^u\le\left(\frac{1}{2}\right)^2=\frac{1}{4}.\]
Vậy tập giá trị là \(\left(0,\dfrac{1}{4}\right]\). Bẫy A là quên đổi chiều bất đẳng thức khi cơ số nhỏ hơn \(1\).`,
  ),
  question(
    raw`不等式 \(\log_{\frac{1}{3}}(2x-1)>-1\) 的解集为`,
    [raw`\((-\infty,2)\)`, raw`\(\left(\dfrac{1}{2},2\right)\)`, raw`\((2,+\infty)\)`, raw`\(\left(\dfrac{1}{2},3\right)\)`],
    "B",
    raw`**Bước 1.** Đưa vế phải về cùng cơ số \(\dfrac{1}{3}\): \(-1=\log_{\frac{1}{3}}3\). Đồng thời đặt điều kiện chân số \(2x-1>0\).

**Bước 2.** Vì cơ số \(\dfrac{1}{3}\in(0,1)\), khi bỏ logarit phải đổi chiều bất đẳng thức:
\[0<2x-1<3\iff 1<2x<4\iff \frac{1}{2}<x<2.\]
Tập nghiệm là \(\left(\dfrac{1}{2},2\right)\). Bẫy A quên điều kiện chân số \(2x-1>0\).`,
  ),
  question(
    raw`若函数 \(y=f(x)\) 存在反函数 \(y=f^{-1}(x)\)，且 \(y=f(x)\) 的图像经过点 \((2,5)\)，则 \(y=f^{-1}(x)\) 的图像必经过点`,
    [raw`\((2,5)\)`, raw`\((-2,-5)\)`, raw`\((5,2)\)`, raw`\(\left(\dfrac{1}{2},\dfrac{1}{5}\right)\)`],
    "C",
    raw`**Bước 1.** Đồ thị hàm số \(y=f(x)\) và đồ thị hàm ngược \(y=f^{-1}(x)\) luôn đối xứng nhau qua đường phân giác thứ nhất \(y=x\).

**Bước 2.** Vì \(f(2)=5\), theo định nghĩa hàm ngược ta có \(f^{-1}(5)=2\), tức đồ thị hàm ngược chắc chắn đi qua điểm \((5,2)\).`,
  ),
  question(
    raw`已知函数 \(f(x)=3^x-1\)，则 \(f^{-1}(8)\) 的值为`,
    [raw`\(2\)`, raw`\(3\)`, raw`\(8\)`, raw`\(\log_3 8\)`],
    "A",
    raw`**Bước 1.** Không cần mất thời gian tìm công thức tường minh của \(f^{-1}(x)\). Đặt \(f^{-1}(8)=x_0\), theo định nghĩa hàm ngược ta có \(f(x_0)=8\).

**Bước 2.** Thay vào công thức \(f(x)\):
\[3^{x_0}-1=8\iff 3^{x_0}=9=3^2\iff x_0=2.\]
Vậy \(f^{-1}(8)=2\).`,
  ),
  question(
    raw`分式函数 \(y=\dfrac{2x+1}{x-1}\ (x\ne 1)\) 的反函数为`,
    [raw`\(y=\dfrac{x+1}{x-2}\ (x\ne 2)\)`, raw`\(y=\dfrac{x-1}{2x+1}\ \left(x\ne -\dfrac{1}{2}\right)\)`, raw`\(y=\dfrac{x-2}{x+1}\ (x\ne -1)\)`, raw`\(y=\dfrac{2x-1}{x+1}\ (x\ne -1)\)`],
    "A",
    raw`**Bước 1.** Biểu diễn \(x\) theo \(y\) từ phương trình ban đầu:
\[y(x-1)=2x+1\iff xy-y=2x+1\iff x(y-2)=y+1\iff x=\frac{y+1}{y-2}\ (y\ne 2).\]

**Bước 2.** Hoán đổi vai trò hai biến \(x\) và \(y\) ta thu được hàm ngược \(y=\dfrac{x+1}{x-2}\ (x\ne 2)\). Bẫy B là nhầm hàm ngược với hàm nghịch đảo \(\dfrac{1}{y}\).`,
  ),
  question(
    raw`已知函数 \(f(x)=\log_2(x-1)\)，关于其反函数 \(f^{-1}(x)\) 的说法正确的是`,
    [raw`\(f^{-1}(x)=2^x-1\)，定义域为 \(\mathbb{R}\)`, raw`\(f^{-1}(x)=2^x+1\)，值域为 \((1,+\infty)\)，水平渐近线为 \(y=1\)`, raw`\(f^{-1}(x)=2^x+1\)，定义域为 \((1,+\infty)\)，垂直渐近线为 \(x=1\)`, raw`\(f^{-1}(x)=2^{x+1}\)，值域为 \((0,+\infty)\)`],
    "B",
    raw`**Bước 1.** Từ \(y=\log_2(x-1)\) (tập xác định \((1,+\infty)\), tập giá trị \(\mathbb{R}\)), ta giải \(x-1=2^y\iff x=2^y+1\). Hoán đổi \(x,y\) được \(f^{-1}(x)=2^x+1\).

**Bước 2.** Tập xác định và tập giá trị của hàm ngược đổi chỗ so với hàm gốc: \(f^{-1}(x)\) có tập xác định \(\mathbb{R}\), tập giá trị \((1,+\infty)\), và khi \(x\to -\infty\) thì \(2^x+1\to 1\) nên có tiệm cận ngang \(y=1\).`,
  ),
];

// ============================================================================
// 3. Chương 4 - Hàm số lượng giác (override_id = 4, session_id = 95) — 20 câu × 0.5đ = 10đ
// ============================================================================
const trigQuestions = [
  question(
    raw`将角度 \(135^\circ\) 化为弧度制，结果是`,
    [raw`\(\dfrac{\pi}{4}\)`, raw`\(\dfrac{3\pi}{4}\)`, raw`\(\dfrac{2\pi}{3}\)`, raw`\(\dfrac{5\pi}{6}\)`],
    "B",
    raw`**Bước 1.** Áp dụng công thức đổi độ sang radian: \(\alpha_{\text{rad}}=\alpha^\circ\cdot\dfrac{\pi}{180^\circ}\).

**Bước 2.** Thay số:
\[135^\circ\cdot\frac{\pi}{180^\circ}=\frac{135}{180}\pi=\frac{3\pi}{4}.\]`,
  ),
  question(
    raw`已知一个圆的半径 \(r=8\)，圆心角 \(\alpha=\dfrac{\pi}{4}\) 所对的弧长为`,
    [raw`\(\pi\)`, raw`\(2\pi\)`, raw`\(4\pi\)`, raw`\(8\pi\)`],
    "B",
    raw`**Bước 1.** Công thức độ dài cung tròn khi góc ở tâm đo bằng radian là \(l=r\alpha\).

**Bước 2.** Thay \(r=8\) và \(\alpha=\dfrac{\pi}{4}\) ta được \(l=8\cdot\dfrac{\pi}{4}=2\pi\). Lưu ý công thức này chỉ dùng trực tiếp khi \(\alpha\) đã ở đơn vị radian.`,
  ),
  question(
    raw`角 \(\alpha=-\dfrac{5\pi}{6}\) 的终边落在`,
    [raw`第一象限`, raw`第二象限`, raw`第四象限`, raw`第三象限`],
    "D",
    raw`**Bước 1.** Cộng thêm \(2\pi\) để đưa góc âm về góc cùng cạnh cuối thuộc \([0,2\pi)\):
\[-\frac{5\pi}{6}+2\pi=\frac{7\pi}{6}.\]

**Bước 2.** Vì \(\pi<\dfrac{7\pi}{6}<\dfrac{3\pi}{2}\), cạnh cuối của góc nằm ở góc phần tư thứ III (第三象限).`,
  ),
  question(
    raw`已知角 \(\alpha\) 的终边经过点 \(P(-3,4)\)，则 \(\sin\alpha+\cos\alpha\) 的值为`,
    [raw`\(\dfrac{1}{5}\)`, raw`\(-\dfrac{1}{5}\)`, raw`\(\dfrac{7}{5}\)`, raw`\(-\dfrac{7}{5}\)`],
    "A",
    raw`**Bước 1.** Tính khoảng cách từ gốc tọa độ đến điểm \(P(-3,4)\):
\[r=\sqrt{(-3)^2+4^2}=\sqrt{25}=5.\]

**Bước 2.** Theo định nghĩa hàm lượng giác trên hệ tọa độ: \(\sin\alpha=\dfrac{y}{r}=\dfrac{4}{5}\) và \(\cos\alpha=\dfrac{x}{r}=-\dfrac{3}{5}\). Cộng lại ta được \(\dfrac{4}{5}-\dfrac{3}{5}=\dfrac{1}{5}\).`,
  ),
  question(
    raw`已知 \(\sin\alpha=\dfrac{3}{5}\)，且 \(\alpha\in\left(\dfrac{\pi}{2},\pi\right)\)，则 \(\tan\alpha\) 等于`,
    [raw`\(\dfrac{3}{4}\)`, raw`\(-\dfrac{4}{3}\)`, raw`\(-\dfrac{3}{4}\)`, raw`\(\dfrac{4}{3}\)`],
    "C",
    raw`**Bước 1.** Vì \(\alpha\in\left(\dfrac{\pi}{2},\pi\right)\) thuộc góc phần tư thứ II nên \(\cos\alpha<0\):
\[\cos\alpha=-\sqrt{1-\sin^2\alpha}=-\sqrt{1-\frac{9}{25}}=-\frac{4}{5}.\]

**Bước 2.** Tính \(\tan\alpha=\dfrac{\sin\alpha}{\cos\alpha}=\dfrac{3/5}{-4/5}=-\dfrac{3}{4}\). Bẫy A là quên xét dấu âm của \(\cos\alpha\) ở góc phần tư II.`,
  ),
  question(
    raw`已知 \(\tan\alpha=2\)，则 \(\dfrac{\sin\alpha+2\cos\alpha}{3\sin\alpha-\cos\alpha}\) 的值为`,
    [raw`\(\dfrac{3}{5}\)`, raw`\(\dfrac{4}{5}\)`, raw`\(\dfrac{4}{7}\)`, raw`\(1\)`],
    "B",
    raw`**Bước 1.** Đây là biểu thức đẳng cấp bậc nhất theo \(\sin\alpha\) và \(\cos\alpha\) (齐次式). Vì \(\tan\alpha=2\) nên \(\cos\alpha\ne 0\); chia cả tử và mẫu cho \(\cos\alpha\):
\[\frac{\sin\alpha+2\cos\alpha}{3\sin\alpha-\cos\alpha}=\frac{\tan\alpha+2}{3\tan\alpha-1}.\]

**Bước 2.** Thay \(\tan\alpha=2\) vào biểu thức: \(\dfrac{2+2}{3\cdot 2-1}=\dfrac{4}{5}\).`,
  ),
  question(
    raw`已知 \(\tan\alpha=3\)，则 \(\sin^2\alpha+2\sin\alpha\cos\alpha\) 的值为`,
    [raw`\(\dfrac{9}{10}\)`, raw`\(\dfrac{6}{5}\)`, raw`\(\dfrac{12}{5}\)`, raw`\(\dfrac{3}{2}\)`],
    "D",
    raw`**Bước 1.** Viết mẫu số ẩn là \(1=\sin^2\alpha+\cos^2\alpha\) rồi chia cả tử và mẫu cho \(\cos^2\alpha\) (弦切互化):
\[\sin^2\alpha+2\sin\alpha\cos\alpha=\frac{\sin^2\alpha+2\sin\alpha\cos\alpha}{\sin^2\alpha+\cos^2\alpha}=\frac{\tan^2\alpha+2\tan\alpha}{\tan^2\alpha+1}.\]

**Bước 2.** Thay \(\tan\alpha=3\): \(\dfrac{9+6}{9+1}=\dfrac{15}{10}=\dfrac{3}{2}\). Kỹ thuật chia cho \(\sin^2\alpha+\cos^2\alpha\) xuất hiện rất thường xuyên trong đề CSCA.`,
  ),
  question(
    raw`化简 \(\dfrac{\sin(\pi-\alpha)\cos\left(\dfrac{\pi}{2}+\alpha\right)}{\tan(\pi+\alpha)}\) 的结果为`,
    [raw`\(\sin\alpha\cos\alpha\)`, raw`\(-\cos^2\alpha\)`, raw`\(-\sin\alpha\cos\alpha\)`, raw`\(\sin^2\alpha\)`],
    "C",
    raw`**Bước 1.** Áp dụng công thức góc liên kết (诱导公式 — lẻ đổi chẵn giữ, dấu theo góc phần tư):
\[\sin(\pi-\alpha)=\sin\alpha,\qquad \cos\left(\frac{\pi}{2}+\alpha\right)=-\sin\alpha,\qquad \tan(\pi+\alpha)=\tan\alpha=\frac{\sin\alpha}{\cos\alpha}.\]

**Bước 2.** Thay vào phân thức và rút gọn:
\[\frac{\sin\alpha\cdot(-\sin\alpha)}{\sin\alpha/\cos\alpha}=-\sin\alpha\cos\alpha.\]
Bẫy A do nhầm dấu của \(\cos\left(\dfrac{\pi}{2}+\alpha\right)\) (quên dấu trừ).`,
  ),
  question(
    raw`计算 \(\cos\left(\dfrac{7\pi}{3}\right)+\sin\left(-\dfrac{5\pi}{6}\right)\) 的值为`,
    [raw`\(0\)`, raw`\(1\)`, raw`\(-1\)`, raw`\(\dfrac{\sqrt{3}-1}{2}\)`],
    "A",
    raw`**Bước 1.** Rút gọn từng số hạng bằng tính tuần hoàn và tính lẻ của hàm sin:
\[\cos\left(\frac{7\pi}{3}\right)=\cos\left(2\pi+\frac{\pi}{3}\right)=\cos\frac{\pi}{3}=\frac{1}{2}.\]

**Bước 2.** Với số hạng thứ hai:
\[\sin\left(-\frac{5\pi}{6}\right)=-\sin\left(\pi-\frac{\pi}{6}\right)=-\sin\frac{\pi}{6}=-\frac{1}{2}.\]
Cộng lại được \(\dfrac{1}{2}-\dfrac{1}{2}=0\).`,
  ),
  question(
    raw`\(\sin 75^\circ\) 的值为`,
    [raw`\(\dfrac{\sqrt{6}-\sqrt{2}}{4}\)`, raw`\(\dfrac{\sqrt{6}+\sqrt{2}}{4}\)`, raw`\(\dfrac{\sqrt{3}+1}{2}\)`, raw`\(\dfrac{\sqrt{3}-1}{2}\)`],
    "B",
    raw`**Bước 1.** Tách \(75^\circ=45^\circ+30^\circ\) và dùng công thức cộng cho hàm sin:
\[\sin(45^\circ+30^\circ)=\sin 45^\circ\cos 30^\circ+\cos 45^\circ\sin 30^\circ.\]

**Bước 2.** Thay các giá trị đặc biệt:
\[\frac{\sqrt{2}}{2}\cdot\frac{\sqrt{3}}{2}+\frac{\sqrt{2}}{2}\cdot\frac{1}{2}=\frac{\sqrt{6}+\sqrt{2}}{4}.\]`,
  ),
  question(
    raw`已知 \(\sin\alpha=\dfrac{1}{3}\)，则 \(\cos 2\alpha\) 等于`,
    [raw`\(-\dfrac{7}{9}\)`, raw`\(\dfrac{8}{9}\)`, raw`\(\dfrac{7}{9}\)`, raw`\(\dfrac{1}{9}\)`],
    "C",
    raw`**Bước 1.** Chọn đúng công thức nhân đôi biểu diễn trực tiếp theo \(\sin\alpha\):
\[\cos 2\alpha=1-2\sin^2\alpha.\]

**Bước 2.** Thay \(\sin\alpha=\dfrac{1}{3}\):
\[\cos 2\alpha=1-2\left(\frac{1}{3}\right)^2=1-\frac{2}{9}=\frac{7}{9}.\]
Bẫy A do nhớ ngược công thức thành \(2\sin^2\alpha-1\).`,
  ),
  question(
    raw`已知 \(\sin\alpha-\cos\alpha=\dfrac{1}{2}\)，则 \(\sin 2\alpha\) 的值为`,
    [raw`\(\dfrac{3}{4}\)`, raw`\(-\dfrac{3}{4}\)`, raw`\(\dfrac{1}{4}\)`, raw`\(\dfrac{5}{4}\)`],
    "A",
    raw`**Bước 1.** Bình phương hai vế đẳng thức đã cho:
\[(\sin\alpha-\cos\alpha)^2=\sin^2\alpha-2\sin\alpha\cos\alpha+\cos^2\alpha=1-\sin 2\alpha.\]

**Bước 2.** Thay vế phải bằng \(\left(\dfrac{1}{2}\right)^2=\dfrac{1}{4}\):
\[1-\sin 2\alpha=\frac{1}{4}\iff \sin 2\alpha=\frac{3}{4}.\]`,
  ),
  question(
    raw`函数 \(f(x)=\sqrt{3}\sin x-\cos x+2\) 的最大值为`,
    [raw`\(2\)`, raw`\(3\)`, raw`\(\sqrt{3}+1\)`, raw`\(4\)`],
    "D",
    raw`**Bước 1.** Áp dụng công thức góc phụ trợ (辅助角公式) \(a\sin x+b\cos x=\sqrt{a^2+b^2}\sin(x+\varphi)\):
\[\sqrt{3}\sin x-\cos x=\sqrt{(\sqrt{3})^2+(-1)^2}\sin\left(x-\frac{\pi}{6}\right)=2\sin\left(x-\frac{\pi}{6}\right).\]

**Bước 2.** Vì \(\sin\left(x-\dfrac{\pi}{6}\right)\le 1\), giá trị lớn nhất của \(f(x)\) là \(2\cdot 1+2=4\). Bẫy C là cộng trực tiếp từng max riêng lẻ \(\sqrt{3}+(-1)+2\).`,
  ),
  question(
    raw`函数 \(f(x)=3\sin\left(2x-\dfrac{\pi}{3}\right)\) 的最小正周期为`,
    [raw`\(2\pi\)`, raw`\(\pi\)`, raw`\(\dfrac{\pi}{2}\)`, raw`\(4\pi\)`],
    "B",
    raw`**Bước 1.** Với hàm dạng \(y=A\sin(\omega x+\varphi)\), chu kỳ dương nhỏ nhất là \(T=\dfrac{2\pi}{|\omega|}\), không phụ thuộc vào biên độ \(A\) và pha ban đầu \(\varphi\).

**Bước 2.** Ở đây \(\omega=2\), suy ra \(T=\dfrac{2\pi}{2}=\pi\).`,
  ),
  question(
    raw`函数 \(f(x)=\tan\left(2x+\dfrac{\pi}{4}\right)\) 的最小正周期为`,
    [raw`\(\dfrac{\pi}{2}\)`, raw`\(\pi\)`, raw`\(2\pi\)`, raw`\(\dfrac{\pi}{4}\)`],
    "A",
    raw`**Bước 1.** Khác với \(\sin\) và \(\cos\) có chu kỳ cơ bản \(2\pi\), hàm \(\tan x\) có chu kỳ dương nhỏ nhất là \(\pi\). Do đó chu kỳ của \(\tan(\omega x+\varphi)\) là \(T=\dfrac{\pi}{|\omega|}\).

**Bước 2.** Thay \(\omega=2\) ta được \(T=\dfrac{\pi}{2}\). Bẫy B là dùng nhầm công thức \(\dfrac{2\pi}{|\omega|}\) của hàm sin/cos.`,
  ),
  question(
    raw`将函数 \(y=\sin 2x\) 的图像向左平移 \(\dfrac{\pi}{3}\) 个单位，所得图像对应的函数解析式为`,
    [raw`\(y=\sin\left(2x-\dfrac{2\pi}{3}\right)\)`, raw`\(y=\sin\left(2x+\dfrac{2\pi}{3}\right)\)`, raw`\(y=\sin\left(2x+\dfrac{\pi}{3}\right)\)`, raw`\(y=\sin 2x+\dfrac{\pi}{3}\)`],
    "B",
    raw`**Bước 1.** Quy tắc tịnh tiến ngang “trái cộng phải trừ chỉ tác động lên riêng biến \(x\)” (左加右减只对x): khi tịnh tiến sang trái \(\dfrac{\pi}{3}\) đơn vị, ta thay \(x\) bằng \(x+\dfrac{\pi}{3}\).

**Bước 2.** Thay vào công thức:
\[y=\sin\left[2\left(x+\frac{\pi}{3}\right)\right]=\sin\left(2x+\frac{2\pi}{3}\right).\]
Phương án C là bẫy lớn nhất của chương lượng giác vì cộng \(\dfrac{\pi}{3}\) thẳng vào \(2x\) thay vì nhân hệ số \(2\).`,
  ),
  question(
    raw`下列直线中，是函数 \(y=\sin\left(2x-\dfrac{\pi}{6}\right)\) 图像的一条对称轴的是`,
    [raw`\(x=\dfrac{\pi}{12}\)`, raw`\(x=\dfrac{\pi}{6}\)`, raw`\(x=\dfrac{\pi}{3}\)`, raw`\(x=\dfrac{\pi}{2}\)`],
    "C",
    raw`**Bước 1.** Trục đối xứng của hàm \(y=\sin t\) là nơi hàm đạt cực trị, tức \(t=\dfrac{\pi}{2}+k\pi\ (k\in\mathbb{Z})\).

**Bước 2.** Đặt \(2x-\dfrac{\pi}{6}=\dfrac{\pi}{2}+k\pi\iff 2x=\dfrac{2\pi}{3}+k\pi\iff x=\dfrac{\pi}{3}+\dfrac{k\pi}{2}\). Chọn \(k=0\) thu được trục đối xứng \(x=\dfrac{\pi}{3}\). (Tại \(x=\dfrac{\pi}{12}\), hàm bằng \(0\), đó là tâm đối xứng chứ không phải trục đối xứng.)`,
  ),
  question(
    raw`函数 \(f(x)=2\sin\left(x+\dfrac{\pi}{6}\right)\) 在区间 \(\left[0,\dfrac{\pi}{2}\right]\) 上的值域为`,
    [raw`\([1,\sqrt{3}]\)`, raw`\([1,2]\)`, raw`\([\sqrt{3},2]\)`, raw`\([-2,2]\)`],
    "B",
    raw`**Bước 1.** Đặt \(t=x+\dfrac{\pi}{6}\). Khi \(x\in\left[0,\dfrac{\pi}{2}\right]\), ta có \(t\in\left[\dfrac{\pi}{6},\dfrac{2\pi}{3}\right]\).

**Bước 2.** Nhận thấy điểm cực đại \(t=\dfrac{\pi}{2}\) nằm trong đoạn \(\left[\dfrac{\pi}{6},\dfrac{2\pi}{3}\right]\), nên \(\max \sin t=\sin\dfrac{\pi}{2}=1\). So sánh hai đầu mút: \(\sin\dfrac{\pi}{6}=\dfrac{1}{2}<\sin\dfrac{2\pi}{3}=\dfrac{\sqrt{3}}{2}\), suy ra \(\min \sin t=\dfrac{1}{2}\). Nhân \(2\) được tập giá trị \([1,2]\). Bẫy A là chỉ thay hai đầu mút \(x=0\) và \(x=\dfrac{\pi}{2}\).`,
  ),
  question(
    raw`函数 \(y=\cos^2 x+2\sin x-2\) 的最小值为`,
    [raw`\(-2\)`, raw`\(-1\)`, raw`\(0\)`, raw`\(-4\)`],
    "D",
    raw`**Bước 1.** Quy về cùng một hàm \(\sin x\) bằng \(\cos^2 x=1-\sin^2 x\):
\[y=(1-\sin^2 x)+2\sin x-2=-\sin^2 x+2\sin x-1=-(\sin x-1)^2.\]

**Bước 2.** Đặt \(t=\sin x\in[-1,1]\). Vì \(-(t-1)^2\) đạt nhỏ nhất khi \(|t-1|\) lớn nhất, tức tại \(t=-1\), ta có \(y_{\min}=-(-1-1)^2=-4\).`,
  ),
  question(
    raw`方程 \(\sin 2x=\dfrac{1}{2}\) 在区间 \([0,\pi]\) 上所有实数解的和为`,
    [raw`\(\dfrac{\pi}{6}\)`, raw`\(\dfrac{\pi}{3}\)`, raw`\(\dfrac{\pi}{2}\)`, raw`\(\pi\)`],
    "C",
    raw`**Bước 1.** Đặt \(t=2x\). Khi \(x\in[0,\pi]\), ta có \(t\in[0,2\pi]\). Phương trình trở thành \(\sin t=\dfrac{1}{2}\).

**Bước 2.** Trên \([0,2\pi]\), phương trình \(\sin t=\dfrac{1}{2}\) có đúng hai nghiệm là \(t_1=\dfrac{\pi}{6}\) và \(t_2=\dfrac{5\pi}{6}\). Suy ra \(x_1=\dfrac{\pi}{12},\ x_2=\dfrac{5\pi}{12}\), tổng hai nghiệm là \(\dfrac{\pi}{12}+\dfrac{5\pi}{12}=\dfrac{6\pi}{12}=\dfrac{\pi}{2}\).`,
  ),
];

const QUIZ_CONFIGS = [
  {
    overrideId: 3,
    sourceSessionId: 88,
    title: "函数基础练习｜Trắc nghiệm Hàm số",
    description: "20 câu trắc nghiệm tiếng Trung chuẩn đề CSCA (tổng 10 điểm, đạt từ 6/10). Bao phủ tọa độ, tập xác định hàm hợp, hàm từng khúc, tính chẵn lẻ, đơn điệu, giá trị lớn nhất/nhỏ nhất và bẫy tham số.",
    questions: functionBasicQuestions,
  },
  {
    overrideId: 6,
    sourceSessionId: 82,
    title: "指对幂与反函数练习｜Trắc nghiệm Hàm số (tiếp)",
    description: "20 câu trắc nghiệm tiếng Trung chuẩn đề CSCA (tổng 10 điểm, đạt từ 6/10). Bao phủ hàm mũ, logarit, lũy thừa, hàm ngược, điểm cố định, so sánh độ lớn, nghiệm ngoại lai và bẫy cơ số 0<a<1.",
    questions: functionAdvancedQuestions,
  },
  {
    overrideId: 4,
    sourceSessionId: 95,
    title: "三角函数练习｜Trắc nghiệm Hàm số lượng giác",
    description: "20 câu trắc nghiệm tiếng Trung chuẩn đề CSCA (tổng 10 điểm, đạt từ 6/10). Bao phủ radian, cung tròn, góc liên kết, biểu thức đẳng cấp, công thức nhân đôi, góc phụ trợ, chu kỳ và bẫy tịnh tiến đồ thị.",
    questions: trigQuestions,
  },
];

// Pinyin corrections for existing rows in sessions 88, 82, 95
const VOCAB_PINYIN_FIXES = [
  { sessionIds: [88, 82, 95], term: "奇函数", pinyin: "jī hán shù" },
  { sessionIds: [88], term: "轴对称", pinyin: "zhóu duì chèn" },
  { sessionIds: [88], term: "中心对称", pinyin: "zhōng xīn duì chèn" },
  { sessionIds: [95], term: "正切", pinyin: "zhèng qiē" },
  { sessionIds: [95], term: "余切", pinyin: "yú qiē" },
];

// Additional high-yield CSCA terms per session (inserted only if term doesn't exist in that session)
const VOCAB_ADDITIONS = {
  88: [
    { term: "解析式", pinyin: "jiě xī shì", sinoVietnamese: "Giải tích thức", meaning: "Biểu thức đại số của hàm số", exampleSentence: "求函数 f(x) 的解析式。", exampleMeaning: "Tìm biểu thức của hàm số f(x)." },
    { term: "分段函数", pinyin: "fēn duàn hán shù", sinoVietnamese: "Phân đoạn hàm số", meaning: "Hàm số từng khúc (cho bởi nhiều công thức)", exampleSentence: "根据自变量的范围选择分段函数的对应分支。", exampleMeaning: "Chọn nhánh tương ứng của hàm từng khúc theo miền của biến." },
    { term: "复合函数", pinyin: "fù hé hán shù", sinoVietnamese: "Phức hợp hàm số", meaning: "Hàm số hợp f(g(x))", exampleSentence: "求复合函数 f(2x-1) 的定义域。", exampleMeaning: "Tìm tập xác định của hàm hợp f(2x-1)." },
    { term: "二次函数", pinyin: "èr cì hán shù", sinoVietnamese: "Nhị thứ hàm số", meaning: "Hàm số bậc hai y = ax² + bx + c (a ≠ 0)", exampleSentence: "二次函数的二次项系数不能为零。", exampleMeaning: "Hệ số bậc hai của hàm bậc hai không thể bằng 0." },
    { term: "一次函数", pinyin: "yī cì hán shù", sinoVietnamese: "Nhất thứ hàm số", meaning: "Hàm số bậc nhất y = kx + b (k ≠ 0)", exampleSentence: "一次函数的图像是一条直线。", exampleMeaning: "Đồ thị hàm bậc nhất là một đường thẳng." },
    { term: "反比例函数", pinyin: "fǎn bǐ lì hán shù", sinoVietnamese: "Phản tỷ lệ hàm số", meaning: "Hàm tỉ lệ nghịch y = k/x (k ≠ 0)", exampleSentence: "反比例函数图像是双曲线。", exampleMeaning: "Đồ thị hàm tỉ lệ nghịch là đường hyperbol." },
    { term: "顶点", pinyin: "dǐng diǎn", sinoVietnamese: "Đỉnh điểm", meaning: "Đỉnh của parabol", exampleSentence: "先判断二次函数的顶点是否在给定区间内。", exampleMeaning: "Trước tiên kiểm tra đỉnh parabol có nằm trong đoạn đã cho hay không." },
    { term: "对称轴", pinyin: "duì chèn zhóu", sinoVietnamese: "Đối xứng trục", meaning: "Trục đối xứng của đồ thị hàm số", exampleSentence: "抛物线 y = x² - 2ax + 3 的对称轴是 x = a。", exampleMeaning: "Trục đối xứng của parabol y = x² - 2ax + 3 là x = a." },
    { term: "单调区间", pinyin: "dān diào qū jiān", sinoVietnamese: "Đơn điệu khu gian", meaning: "Khoảng đơn điệu (đồng biến / nghịch biến)", exampleSentence: "求函数的单调递增区间。", exampleMeaning: "Tìm khoảng đồng biến của hàm số." },
    { term: "最大值", pinyin: "zuì dà zhí", sinoVietnamese: "Tối đại trị", meaning: "Giá trị lớn nhất (GTLN)", exampleSentence: "函数在闭区间上必有最大值和最小值。", exampleMeaning: "Hàm liên tục trên đoạn đóng luôn có GTLN và GTNN." },
    { term: "最小值", pinyin: "zuì xiǎo zhí", sinoVietnamese: "Tối tiểu trị", meaning: "Giá trị nhỏ nhất (GTNN)", exampleSentence: "当 x = 2 时函数取得最小值。", exampleMeaning: "Khi x = 2 hàm số đạt giá trị nhỏ nhất." },
    { term: "零点", pinyin: "líng diǎn", sinoVietnamese: "Linh điểm", meaning: "Không điểm (nghiệm thực của phương trình f(x) = 0)", exampleSentence: "函数的零点是方程 f(x) = 0 的实数根。", exampleMeaning: "Không điểm của hàm số là nghiệm thực của f(x) = 0." },
    { term: "非奇非偶函数", pinyin: "fēi jī fēi ǒu hán shù", sinoVietnamese: "Phi cơ phi ngẫu hàm số", meaning: "Hàm không chẵn cũng không lẻ", exampleSentence: "定义域不关于原点对称时，函数是非奇非偶函数。", exampleMeaning: "Khi tập xác định không đối xứng qua gốc 0, hàm không chẵn không lẻ." },
    { term: "奇偶性", pinyin: "jī ǒu xìng", sinoVietnamese: "Cơ ngẫu tính", meaning: "Tính chẵn lẻ của hàm số", exampleSentence: "判断奇偶性前必须先看定义域是否对称。", exampleMeaning: "Trước khi xét tính chẵn lẻ phải kiểm tra tập xác định có đối xứng không." },
    { term: "单调性", pinyin: "dān diào xìng", sinoVietnamese: "Đơn điệu tính", meaning: "Tính đơn điệu của hàm số", exampleSentence: "利用单调性和奇偶性解不等式。", exampleMeaning: "Dùng tính đơn điệu và tính chẵn lẻ để giải bất đẳng thức." },
    { term: "周期函数", pinyin: "zhōu qī hán shù", sinoVietnamese: "Chu kỳ hàm số", meaning: "Hàm số tuần hoàn f(x + T) = f(x)", exampleSentence: "已知 f(x) 是周期为 4 的奇函数。", exampleMeaning: "Biết f(x) là hàm lẻ tuần hoàn chu kỳ 4." },
    { term: "两点间距离", pinyin: "liǎng diǎn jiān jù lí", sinoVietnamese: "Lưỡng điểm gian cự ly", meaning: "Khoảng cách giữa hai điểm", exampleSentence: "用两点间距离公式求线段 AB 的长度。", exampleMeaning: "Dùng công thức khoảng cách 2 điểm tính độ dài đoạn AB." },
    { term: "中点坐标", pinyin: "zhōng diǎn zuò biāo", sinoVietnamese: "Trung điểm tọa độ", meaning: "Tọa độ trung điểm của đoạn thẳng", exampleSentence: "已知中点坐标和一点，反求另一点坐标。", exampleMeaning: "Biết tọa độ trung điểm và một đầu mút, tìm ngược đầu mút kia." },
    { term: "恒成立", pinyin: "héng chéng lì", sinoVietnamese: "Hằng thành lập", meaning: "Luôn đúng với mọi giá trị của biến trong miền xét", exampleSentence: "要使不等式对一切实数恒成立，须分类讨论最高次项系数。", exampleMeaning: "Để bất đẳng thức luôn đúng với mọi số thực, phải xét riêng hệ số bậc cao nhất." },
    { term: "取值范围", pinyin: "qǔ zhí fàn wéi", sinoVietnamese: "Thủ trị phạm vi", meaning: "Miền giá trị / khoảng giá trị của tham số", exampleSentence: "求实数 a 的取值范围。", exampleMeaning: "Tìm miền giá trị của số thực a." },
    { term: "分离常数法", pinyin: "fēn lí cháng shù fǎ", sinoVietnamese: "Phân ly hằng số pháp", meaning: "Phương pháp tách hằng số (tìm TGT hàm phân thức)", exampleSentence: "用分离常数法求分式函数的值域。", exampleMeaning: "Dùng phương pháp tách hằng số tìm tập giá trị hàm phân thức." },
  ],
  82: [
    { term: "自然对数", pinyin: "zì rán duì shù", sinoVietnamese: "Tự nhiên đối số", meaning: "Logarit tự nhiên cơ số e (ký hiệu ln)", exampleSentence: "自然对数以常数 e 为底，记作 ln x。", exampleMeaning: "Logarit tự nhiên có cơ số e, ký hiệu ln x." },
    { term: "常用对数", pinyin: "cháng yòng duì shù", sinoVietnamese: "Thường dụng đối số", meaning: "Logarit thập phân cơ số 10 (ký hiệu lg)", exampleSentence: "常用对数以 10 为底，记作 lg x。", exampleMeaning: "Logarit thập phân có cơ số 10, ký hiệu lg x." },
    { term: "换底公式", pinyin: "huàn dǐ gōng shì", sinoVietnamese: "Hoán để công thức", meaning: "Công thức đổi cơ số logarit", exampleSentence: "利用换底公式化简不同底数的对数乘积。", exampleMeaning: "Dùng công thức đổi cơ số rút gọn tích các logarit khác cơ số." },
    { term: "同增异减", pinyin: "tóng zēng yì jiǎn", sinoVietnamese: "Đồng tăng dị giảm", meaning: "Quy tắc xét đơn điệu hàm hợp (cùng chiều → đồng biến, ngược chiều → nghịch biến)", exampleSentence: "判断复合对数函数单调性时用同增异减原则。", exampleMeaning: "Dùng quy tắc đồng tăng dị giảm khi xét đơn điệu hàm hợp logarit." },
    { term: "复合函数", pinyin: "fù hé hán shù", sinoVietnamese: "Phức hợp hàm số", meaning: "Hàm hợp (ví dụ log_a(g(x)) hoặc a^{g(x)})", exampleSentence: "求复合函数单调区间前必须先求定义域。", exampleMeaning: "Trước khi tìm khoảng đơn điệu hàm hợp phải tìm tập xác định." },
    { term: "增根", pinyin: "zēng gēn", sinoVietnamese: "Tăng căn", meaning: "Nghiệm ngoại lai (vi phạm điều kiện xác định, phải loại)", exampleSentence: "解对数方程后必须检验并舍去增根。", exampleMeaning: "Sau khi giải phương trình logarit phải thử lại và loại nghiệm ngoại lai." },
    { term: "恒过定点", pinyin: "héng guò dìng diǎn", sinoVietnamese: "Hằng quá định điểm", meaning: "Luôn đi qua một điểm cố định không phụ thuộc tham số", exampleSentence: "指数函数 y = a^{x-2} + 3 恒过定点 (2, 4)。", exampleMeaning: "Hàm mũ y = a^{x-2} + 3 luôn đi qua điểm cố định (2, 4)." },
    { term: "比较大小", pinyin: "bǐ jiào dà xiǎo", sinoVietnamese: "Tỷ giảo đại tiểu", meaning: "So sánh độ lớn (dạng tủ CSCA dùng mốc trung gian 0 và 1)", exampleSentence: "利用中间值 0 和 1 比较指对幂的大小。", exampleMeaning: "Dùng mốc trung gian 0 và 1 để so sánh mũ, logarit, lũy thừa." },
    { term: "指数不等式", pinyin: "zhǐ shù bù děng shì", sinoVietnamese: "Chỉ số bất đẳng thức", meaning: "Bất phương trình mũ", exampleSentence: "解指数不等式时注意底数与 1 的大小关系。", exampleMeaning: "Khi giải BPT mũ cần chú ý cơ số lớn hơn hay nhỏ hơn 1." },
    { term: "对数不等式", pinyin: "duì shù bù děng shì", sinoVietnamese: "Đối số bất đẳng thức", meaning: "Bất phương trình logarit (bẫy quên chân số > 0 và đổi chiều)", exampleSentence: "解对数不等式既要看底数单调性，又要保证真数大于 0。", exampleMeaning: "Giải BPT logarit vừa xét đơn điệu cơ số vừa giữ chân số > 0." },
  ],
  95: [
    { term: "和差化积", pinyin: "hé chā huà jī", sinoVietnamese: "Hòa sai hóa tích", meaning: "Công thức biến đổi tổng/hiệu thành tích", exampleSentence: "利用和差化积公式化简三角表达式。", exampleMeaning: "Dùng công thức tổng thành tích để rút gọn biểu thức lượng giác." },
    { term: "终边", pinyin: "zhōng biān", sinoVietnamese: "Chung biên", meaning: "Cạnh cuối của góc lượng giác", exampleSentence: "已知角 α 的终边经过点 P(-3, 4)。", exampleMeaning: "Biết cạnh cuối của góc α đi qua điểm P(-3, 4)." },
    { term: "始边", pinyin: "shǐ biān", sinoVietnamese: "Thủy biên", meaning: "Cạnh đầu của góc lượng giác (tia Ox)", exampleSentence: "角从 x 轴非负半轴（始边）开始旋转。", exampleMeaning: "Góc bắt đầu quay từ tia Ox (cạnh đầu)." },
    { term: "振幅", pinyin: "zhèn fú", sinoVietnamese: "Chấn phúc", meaning: "Biên độ |A| của hàm y = A sin(ωx + φ)", exampleSentence: "函数 y = 3sin(2x) 的振幅为 3。", exampleMeaning: "Biên độ của hàm y = 3sin(2x) là 3." },
    { term: "初相", pinyin: "chū xiàng", sinoVietnamese: "Sơ tướng", meaning: "Pha ban đầu φ trong y = A sin(ωx + φ)", exampleSentence: "相位 ωx + φ 中 φ 称为初相。", exampleMeaning: "Trong pha ωx + φ, φ gọi là pha ban đầu." },
    { term: "对称轴", pinyin: "duì chèn zhóu", sinoVietnamese: "Đối xứng trục", meaning: "Trục đối xứng của đồ thị hàm lượng giác", exampleSentence: "正弦函数在对称轴处取得最值。", exampleMeaning: "Hàm sin đạt giá trị lớn nhất hoặc nhỏ nhất tại trục đối xứng." },
    { term: "对称中心", pinyin: "duì chèn zhōng xīn", sinoVietnamese: "Đối xứng trung tâm", meaning: "Tâm đối xứng của đồ thị hàm lượng giác", exampleSentence: "正弦函数在对称中心处函数值为 0。", exampleMeaning: "Hàm sin có giá trị bằng 0 tại tâm đối xứng." },
    { term: "单调区间", pinyin: "dān diào qū jiān", sinoVietnamese: "Đơn điệu khu gian", meaning: "Khoảng đơn điệu của hàm lượng giác", exampleSentence: "求 y = sin(2x - π/6) 的单调递增区间。", exampleMeaning: "Tìm khoảng đồng biến của y = sin(2x - π/6)." },
    { term: "向右平移", pinyin: "xiàng yòu píng yí", sinoVietnamese: "Hướng hữu bình di", meaning: "Tịnh tiến đồ thị sang phải (thay x bằng x - a)", exampleSentence: "向右平移时只把 x 替换为 x - a。", exampleMeaning: "Khi tịnh tiến sang phải chỉ thay x bằng x - a." },
    { term: "伸缩变换", pinyin: "shēn suō biàn huàn", sinoVietnamese: "Thân súc biến hoán", meaning: "Phép biến đổi co giãn đồ thị (theo trục hoành/tung)", exampleSentence: "横坐标缩短为原来的 1/2 对应将 x 换为 2x。", exampleMeaning: "Co hoành độ còn 1/2 tương ứng thay x bằng 2x." },
    { term: "齐次式", pinyin: "qí cì shì", sinoVietnamese: "Tề thứ thức", meaning: "Biểu thức đẳng cấp (chia tử mẫu cho cos α hoặc cos²α)", exampleSentence: "已知 tan α 求齐次式的值。", exampleMeaning: "Biết tan α, tính giá trị biểu thức đẳng cấp." },
  ],
};

const validateQuestionBank = (title, questions) => {
  const issues = [];
  const pointsPerQuestion = 0.5;
  let totalPoints = 0;
  const checkLatex = (value, label) => {
    const source = String(value || "");
    const balanced = (source.match(/\\\(/g) || []).length === (source.match(/\\\)/g) || []).length
      && (source.match(/\\\[/g) || []).length === (source.match(/\\\]/g) || []).length;
    if (!balanced) issues.push(`${label}: cặp delimiter LaTeX không cân bằng`);
    if (/(?<!\\)\$/.test(source)) issues.push(`${label}: còn ký hiệu $ thay vì \\( ... \\)`);
    const paired = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
    let match;
    while ((match = paired.exec(source))) {
      const formula = match[1] ?? match[2] ?? "";
      try {
        katex.renderToString(formula, { throwOnError: true, strict: "ignore" });
      } catch (error) {
        issues.push(`${label}: LaTeX lỗi (${error.message})`);
      }
    }
  };
  for (const [index, item] of questions.entries()) {
    const prefix = `Câu ${index + 1}`;
    const opts = Array.isArray(item.options) ? item.options : [];
    const optText = opts.map((o) => String(o.text || "")).join(" ");
    totalPoints += pointsPerQuestion;
    if (!/[\u3400-\u9fff]/u.test(item.text || "")) issues.push(`${prefix}: đề chưa có tiếng Trung`);
    if (VIETNAMESE_MARKER.test(`${item.text || ""} ${optText}`)) issues.push(`${prefix}: đề/lựa chọn còn tiếng Việt`);
    const explanationStr = String(item.explanation || "");
    if (!VIETNAMESE_MARKER.test(explanationStr) || !explanationStr.includes("Bước 1") || !explanationStr.includes("Bước 2")) {
      issues.push(`${prefix}: lời giải thiếu Bước 1/Bước 2 tiếng Việt`);
    }
    if (explanationStr.length < 150) issues.push(`${prefix}: lời giải ngắn (${explanationStr.length} ký tự)`);
    if (FORBIDDEN_MATH_UNICODE.test(`${item.text || ""} ${optText} ${explanationStr}`)) {
      issues.push(`${prefix}: còn ký hiệu toán Unicode`);
    }
    if (opts.length !== 4 || !opts.some((o) => String(o.key) === String(item.answer))) {
      issues.push(`${prefix}: đáp án ${item.answer} không khớp 4 lựa chọn`);
    }
    checkLatex(item.text, `${prefix} đề`);
    opts.forEach((o) => checkLatex(o.text, `${prefix} lựa chọn ${o.key}`));
    checkLatex(item.explanation, `${prefix} lời giải`);
  }
  if (questions.length !== 20) issues.push(`Số câu là ${questions.length}, cần đúng 20`);
  if (Math.abs(totalPoints - 10) > 0.0001) issues.push(`Tổng điểm là ${totalPoints}, cần đúng 10`);
  return { title, questions: questions.length, totalPoints: Number(totalPoints.toFixed(2)), ready: issues.length === 0, issues };
};

const upsertQuizQuestions = async (client, quizId, questions) => {
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
  const pointsPerQuestion = 0.5;
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
          pointsPerQuestion,
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
        pointsPerQuestion,
      ],
    );
  }
};

const ensureOverrideQuiz = async (client, { overrideId, title, description, questions, instructorId }) => {
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
       VALUES ($1,$2,$3,45,60,'PUBLISHED',TRUE,$4,'homework',3,'after_submit','best',$5)
       RETURNING id`,
      [title, description, COURSE_ID, instructorId, overrideId],
    )).rows[0];
  } else {
    await client.query(
      `UPDATE quizzes
       SET title=$2, description=$3, course_id=$4, duration_minutes=45,
           passing_score=60, status='PUBLISHED', shuffle_questions=TRUE,
           instructor_id=$5, activity_scope='homework', attempt_limit=3,
           review_policy='after_submit', attempt_score_policy='best', updated_at=NOW()
       WHERE id=$1`,
      [quiz.id, title, description, COURSE_ID, instructorId],
    );
  }
  await upsertQuizQuestions(client, quiz.id, questions);
  return Number(quiz.id);
};

const syncSessionVocabularies = async (client) => {
  const fixedRows = [];
  for (const fix of VOCAB_PINYIN_FIXES) {
    const res = await client.query(
      `UPDATE session_vocabularies
       SET pinyin = $1, updated_at = NOW()
       WHERE session_id = ANY($2::bigint[])
         AND term = $3
         AND COALESCE(pinyin, '') <> $1
       RETURNING id, session_id, term, pinyin`,
      [fix.pinyin, fix.sessionIds, fix.term],
    );
    fixedRows.push(...res.rows);
  }

  const insertedBySession = {};
  for (const [sessionIdStr, entries] of Object.entries(VOCAB_ADDITIONS)) {
    const sessionId = Number(sessionIdStr);
    const meta = (await client.query(
      `SELECT COALESCE(MIN(sv.class_id), cs.live_class_id) AS class_id,
              COALESCE(MAX(sv.order_index), 0)::int AS max_order,
              MIN(sv.created_by) AS created_by,
              MIN(sv.topic) AS topic
       FROM class_sessions cs
       LEFT JOIN session_vocabularies sv ON sv.session_id = cs.id
       WHERE cs.id = $1
       GROUP BY cs.id`,
      [sessionId],
    )).rows[0];
    if (!meta) continue;
    const existing = new Set(
      (await client.query("SELECT term FROM session_vocabularies WHERE session_id = $1", [sessionId]))
        .rows.map((r) => String(r.term || "").trim()),
    );
    let nextOrder = Number(meta.max_order || 0);
    let inserted = 0;
    for (const entry of entries) {
      if (existing.has(entry.term)) continue;
      nextOrder += 1;
      await client.query(
        `INSERT INTO session_vocabularies
         (session_id, class_id, term, pinyin, sino_vietnamese, meaning,
          part_of_speech, example_sentence, example_meaning, order_index,
          created_by, updated_by, topic)
         VALUES ($1,$2,$3,$4,$5,$6,'noun',$7,$8,$9,$10,$10,$11)`,
        [
          sessionId,
          meta.class_id || null,
          entry.term,
          entry.pinyin,
          entry.sinoVietnamese || null,
          entry.meaning,
          entry.exampleSentence || null,
          entry.exampleMeaning || null,
          nextOrder,
          meta.created_by || null,
          meta.topic || null,
        ],
      );
      existing.add(entry.term);
      inserted += 1;
    }
    insertedBySession[sessionId] = inserted;
  }

  return { pinyinFixedCount: fixedRows.length, fixedRows, insertedBySession };
};

const run = async () => {
  const sourceAudit = QUIZ_CONFIGS.map((cfg) => validateQuestionBank(cfg.title, cfg.questions));
  if (validateOnly) {
    const ready = sourceAudit.every((q) => q.ready);
    console.log(JSON.stringify({ ready, validateOnly: true, quizzes: sourceAudit }, null, 2));
    if (!ready) process.exitCode = 1;
    return;
  }
  if (!sourceAudit.every((q) => q.ready)) {
    throw new Error(`Nguồn câu hỏi chưa đạt chuẩn: ${JSON.stringify(sourceAudit.filter((q) => !q.ready))}`);
  }
  if (!shouldApply) {
    console.log(JSON.stringify({
      ready: true,
      apply: false,
      quizzes: sourceAudit,
      vocabSessions: Object.fromEntries(Object.entries(VOCAB_ADDITIONS).map(([k, v]) => [k, v.length])),
    }, null, 2));
    return;
  }

  const client = await getClient();
  try {
    const instructorRow = (await client.query(
      "SELECT COALESCE(author_id, 1) AS instructor_id FROM courses WHERE id = $1",
      [COURSE_ID],
    )).rows[0];
    const instructorId = Number(instructorRow?.instructor_id || 1);

    await client.query("BEGIN");
    const quizResults = [];
    for (const cfg of QUIZ_CONFIGS) {
      const ov = (await client.query(
        `SELECT o.id, o.source_class_session_id, o.content_filter
         FROM recording_curriculum_unit_overrides o
         JOIN recording_curriculum_references r ON r.id = o.curriculum_reference_id
         WHERE o.id = $1 AND r.video_course_profile_id = $2
         FOR UPDATE OF o`,
        [cfg.overrideId, PROFILE_ID],
      )).rows[0];
      if (!ov) {
        throw new Error(`Không tìm thấy override ${cfg.overrideId} thuộc profile ${PROFILE_ID}`);
      }
      if (Number(ov.source_class_session_id) !== cfg.sourceSessionId) {
        throw new Error(`Override ${cfg.overrideId} đang trỏ session ${ov.source_class_session_id}, kỳ vọng ${cfg.sourceSessionId}`);
      }
      // Hide legacy Live session quiz on this Record override (Live class quizzes remain untouched)
      const nextFilter = {
        ...(ov.content_filter && typeof ov.content_filter === "object" ? ov.content_filter : {}),
        sourceQuizIds: [],
      };
      await client.query(
        `UPDATE recording_curriculum_unit_overrides
         SET content_filter = $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [cfg.overrideId, JSON.stringify(nextFilter)],
      );

      const quizId = await ensureOverrideQuiz(client, {
        overrideId: cfg.overrideId,
        title: cfg.title,
        description: cfg.description,
        questions: cfg.questions,
        instructorId,
      });
      quizResults.push({
        overrideId: cfg.overrideId,
        sourceSessionId: cfg.sourceSessionId,
        quizId,
        title: cfg.title,
        questions: cfg.questions.length,
      });
    }

    const vocabSummary = await syncSessionVocabularies(client);
    await client.query("COMMIT");

    const sync = await safeRecordCurriculumMutation({
      courseId: COURSE_ID,
      profileId: PROFILE_ID,
      correlationId: `record-math-ch34-${Date.now()}`,
    });

    console.log(JSON.stringify({
      ready: true,
      apply: true,
      quizzes: quizResults,
      vocabSummary,
      sync: sync ? { eventId: sync.eventId, revision: sync.revision, eventType: sync.eventType } : null,
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
