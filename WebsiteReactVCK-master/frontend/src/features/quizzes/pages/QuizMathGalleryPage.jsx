import { useState } from 'react';
import RichMathText from '../../../components/common/RichMathText.jsx';
import MathInput from '../components/MathInput.jsx';

const GALLERY_CATEGORIES = [
  {
    title: '1. Phân số (Fractions)',
    description: 'Phân số đơn giản, phân số phức hợp, ký hiệu pi và biểu thức lồng nhau.',
    examples: [
      {
        title: 'Phân số cơ bản',
        code: 'Biểu thức: $\\frac{a + b}{c - d}$ và dạng hiển thị block: $$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
      },
      {
        title: 'Phân số chứa Pi và Lượng giác',
        code: 'Cho $\\alpha = \\frac{\\pi}{3}$, ta có $\\sin\\left(\\frac{\\pi}{6}\\right) = \\frac{1}{2}$ và $\\cos\\left(\\frac{\\pi}{3}\\right) = \\frac{1}{2}$.',
      },
      {
        title: 'Phân số lồng nhau (Continued / Nested fractions)',
        code: '$$x = 1 + \\frac{1}{1 + \\frac{1}{1 + \\frac{1}{x}}}$$',
      },
    ],
  },
  {
    title: '2. Căn thức (Radicals / Roots)',
    description: 'Căn bậc hai, căn bậc n, biểu thức chứa căn phức tạp.',
    examples: [
      {
        title: 'Căn bậc hai và liên hợp',
        code: 'Rút gọn biểu thức: $A = \\frac{1}{\\sqrt{5} - \\sqrt{3}} - \\frac{1}{\\sqrt{5} + \\sqrt{3}} = \\sqrt{3}$.',
      },
      {
        title: 'Căn bậc n',
        code: 'Biểu thức nghiệm: $\\sqrt[3]{x^3 + 3x^2} = \\sqrt[n]{\\frac{a_1 + a_2 + \\dots + a_n}{n}}$.',
      },
      {
        title: 'Căn lồng nhau vô hạn',
        code: '$$y = \\sqrt{2 + \\sqrt{2 + \\sqrt{2 + \\dots}}} = 2$$',
      },
    ],
  },
  {
    title: '3. Mũ & Chỉ số dưới (Powers & Subscripts)',
    description: 'Lũy thừa, số mũ âm, dãy số và chỉ số kép.',
    examples: [
      {
        title: 'Đa thức lũy thừa',
        code: 'Khai triển nhị thức Newton: $$(x + y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k$$',
      },
      {
        title: 'Dãy số & Cấp số cộng / Cấp số nhân',
        code: 'Dãy số $(u_n)$ có số hạng tổng quát $u_n = u_1 \\cdot q^{n-1}$ với $u_1 = 3, q = -2$. Tổng $S_n = \\frac{u_1(1 - q^n)}{1 - q}$.',
      },
      {
        title: 'Logarit & Lũy thừa phức hợp',
        code: 'Đẳng thức: $\\log_a(x^y) = y \\cdot \\log_a(x)$ và $e^{\\ln(x)} = x$ với mọi $x > 0, a > 0, a \\neq 1$.',
      },
    ],
  },
  {
    title: '4. Tích phân, Đạo hàm & Giới hạn (Calculus & Sums)',
    description: 'Tích phân xác định, tích phân suy rộng, chuỗi tổng, giới hạn.',
    examples: [
      {
        title: 'Tích phân xác định',
        code: 'Tính tích phân: $$\\int_{0}^{\\frac{\\pi}{2}} \\sin^2(x) dx = \\left[ \\frac{x}{2} - \\frac{\\sin(2x)}{4} \\right]_0^{\\frac{\\pi}{2}} = \\frac{\\pi}{4}$$',
      },
      {
        title: 'Giới hạn hàm số',
        code: '$$\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1 \\quad \\text{và} \\quad \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e$$',
      },
      {
        title: 'Chuỗi tổng vô hạn',
        code: 'Tổng cấp số nhân lùi vô hạn: $$\\sum_{n=0}^{\\infty} \\left(\\frac{1}{2}\\right)^n = 1 + \\frac{1}{2} + \\frac{1}{4} + \\dots = 2$$',
      },
    ],
  },
  {
    title: '5. Hệ phương trình & Véc-tơ (Systems & Vectors)',
    description: 'Hệ phương trình dấu ngoặc nhọn, ma trận, véc-tơ không gian.',
    examples: [
      {
        title: 'Hệ phương trình bậc nhất hai ẩn',
        code: 'Giải hệ phương trình sau:\n$$\\begin{cases} 2x + 3y = 7 \\\\ 5x - y = 9 \\end{cases} \\iff \\begin{cases} x = 2 \\\\ y = 1 \\end{cases}$$',
      },
      {
        title: 'Tích vô hướng và véc-tơ',
        code: 'Cho hai véc-tơ $\\vec{u} = (x_1, y_1)$ và $\\vec{v} = (x_2, y_2)$. Khi đó:\n$$\\vec{u} \\cdot \\vec{v} = |\\vec{u}| |\\vec{v}| \\cos(\\vec{u}, \\vec{v}) = x_1 x_2 + y_1 y_2$$',
      },
      {
        title: 'Tập nghiệm & Khoảng / Đoạn',
        code: 'Tập xác định của hàm số là $D = [-\\sqrt{3}, 1) \\cup (1, \\sqrt{3}]$. Tập hợp số thực $\\mathbb{R} \\setminus \\{0\\}$.',
      },
    ],
  },
  {
    title: '6. Tiếng Trung song ngữ (CSCA Exam / Bilingual Chinese)',
    description: 'Đề thi chuẩn CSCA và bài toán chứa chữ Hán lồng ghép công thức toán học.',
    examples: [
      {
        title: 'Câu hỏi hàm số (Tiếng Trung)',
        code: '已知函数 $f(x) = \\frac{1}{2}x^2 - 2\\ln x$，求：\n1. 函数 $f(x)$ 的单调区间与极值；\n2. 若对任意 $x \\in [1, e]$，都有 $f(x) \\ge m$，求实数 $m$ 的取值范围。',
      },
      {
        title: 'Hình học giải tích không gian (Tiếng Trung)',
        code: '在直角坐标系 $xOy$ 中，已知椭圆 $C: \\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1 \\ (a > b > 0)$ 的离心率为 $e = \\frac{\\sqrt{3}}{2}$，左焦点为 $F_1(-c, 0)$。求椭圆 $C$ 的标准方程。',
      },
      {
        title: 'Lời giải chi tiết song ngữ',
        code: '【解析/Lời giải】: 由题意得，点 $M(x_0, y_0)$ 在直线 $l: y = 2x + 1$ 上。Suy ra $y_0 = 2x_0 + 1$.\n代入方程 $(x - 1)^2 + y^2 = 4$，得出判别式 $\\Delta = b^2 - 4ac > 0$。\n故直线与圆有两个不同交点。因此选 **A**。',
      },
    ],
  },
];

export default function QuizMathGalleryPage() {
  const [liveTestVi, setLiveTestVi] = useState('Cho hàm số $f(x) = \\frac{2x - 1}{x + 1}$. Tính đạo hàm $f\'(x) = \\frac{3}{(x+1)^2}$.');
  const [liveTestCn, setLiveTestCn] = useState('已知函数 $f(x) = \\frac{2x - 1}{x + 1}$，求导数 $f\'(x) = \\frac{3}{(x+1)^2}$。');
  const [liveTestEn, setLiveTestEn] = useState('Given the function $f(x) = \\frac{2x - 1}{x + 1}$, find the derivative $f\'(x) = \\frac{3}{(x+1)^2}$.');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 shadow-sm rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
                MOLI LaTeX Engine Gallery — Day 1 Milestone
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Bộ sưu tập kiểm thử LaTeX & KaTeX
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Thử nghiệm khả năng render chuẩn xác phân số, căn thức, số mũ, tích phân, hệ phương trình và văn bản tiếng Trung song ngữ theo kế hoạch port MOLI vào LMS.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/lms/teacher/quizzes"
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Về quản lý đề
              </a>
            </div>
          </div>
        </div>

        {/* Live Interactive Playground */}
        <div className="bg-white dark:bg-slate-900 shadow-sm rounded-2xl p-6 sm:p-8 border-2 border-blue-200 dark:border-blue-900/50">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
              Live MathInput Tester (Trải nghiệm nhập liệu thực tế)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Thử nhập công thức LaTeX, chọn các biểu tượng phím tắt, chuyển đổi tab Vi/Trung/Anh và xem tính năng Tự sửa format (auto-repair).
            </p>
          </div>

          <MathInput
            label="Nội dung kiểm thử công thức toán"
            value={liveTestVi}
            onChange={setLiveTestVi}
            cnLabel="Nội dung kiểm thử tiếng Trung"
            cnValue={liveTestCn}
            onCnChange={setLiveTestCn}
            enLabel="Nội dung kiểm thử tiếng Anh"
            enValue={liveTestEn}
            onEnChange={setLiveTestEn}
            placeholder="Gõ hoặc dán công thức toán vào đây..."
          />
        </div>

        {/* Gallery Showcases */}
        <div className="space-y-6">
          {GALLERY_CATEGORIES.map((category, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{category.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{category.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {category.examples.map((item, exIdx) => (
                  <div
                    key={exIdx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {item.title}
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                        <RichMathText value={item.code} />
                      </div>
                    </div>
                    <details className="mt-3 text-xs text-slate-400">
                      <summary className="cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                        Xem mã nguồn LaTeX
                      </summary>
                      <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                        {item.code}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
