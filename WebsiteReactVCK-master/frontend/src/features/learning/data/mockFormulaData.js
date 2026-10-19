/**
 * Mock data & storage helper for Session Formulas (CSCA Math, Physics, Chemistry)
 * Features KaTeX formulas, Chinese/Vietnamese names, variable breakdowns, and example problems.
 */

const STORAGE_KEY = 'moly_formula_sessions_v1';

export const INITIAL_FORMULA_SESSIONS = [
  {
    sessionId: "ses-math-01",
    courseId: "course-csca-math",
    courseTitle: "CSCA Toán học Dự bị & Đầu vào",
    classId: "class-csca-k26",
    classTitle: "Luyện Đề CSCA Toán Chuyên Sâu K26",
    date: "2026-10-20T19:30:00.000Z",
    formattedDate: "Thứ Ba, 20/10/2026 • 19:30",
    chapter: "Chương 2: Hình học không gian & Khối đa diện",
    sessionTitle: "Buổi 5: Khối đa diện đều và thể tích nón cụt",
    subject: "MATH",
    subjectLabel: "Toán học CSCA",
    formulas: [
      {
        id: "fm-01",
        nameVi: "Thể tích khối nón cụt",
        nameZh: "圆台体积公式",
        pinyin: "yuán tái tǐ jī gōng shì",
        latex: "V = \\frac{1}{3} \\pi h \\left( R^2 + Rr + r^2 \\right)",
        description: "Tính thể tích của hình nón cụt khi biết bán kính 2 mặt đáy và chiều cao.",
        variables: [
          { symbol: "V", meaning: "Thể tích khối nón cụt" },
          { symbol: "R", meaning: "Bán kính mặt đáy lớn" },
          { symbol: "r", meaning: "Bán kính mặt đáy nhỏ" },
          { symbol: "h", meaning: "Chiều cao (khoảng cách giữa hai đáy)" },
        ],
        conditions: "R > r > 0, \\; h > 0",
        exampleProblem: "Cho hình nón cụt có bán kính đáy lớn R = 4, bán kính đáy nhỏ r = 2, chiều cao h = 6. Tính thể tích khối nón cụt.",
        exampleSolution: "V = \\frac{1}{3} \\pi \\cdot 6 \\cdot (4^2 + 4 \\cdot 2 + 2^2) = 2 \\pi \\cdot (16 + 8 + 4) = 56\\pi.",
        isStarred: true,
      },
      {
        id: "fm-02",
        nameVi: "Diện tích xung quanh hình nón cụt",
        nameZh: "圆台侧面积公式",
        pinyin: "yuán tái cè miàn jī gōng shì",
        latex: "S_{xq} = \\pi (R + r) l",
        description: "Tính diện tích xung quanh khối nón cụt theo bán kính 2 đáy và độ dài đường sinh.",
        variables: [
          { symbol: "S_{xq}", meaning: "Diện tích xung quanh" },
          { symbol: "R, r", meaning: "Bán kính hai mặt đáy" },
          { symbol: "l", meaning: "Độ dài đường sinh: l = \\sqrt{h^2 + (R - r)^2}" },
        ],
        conditions: "l > 0, \\; R > r > 0",
        exampleProblem: "Một hình nón cụt có R = 5, r = 2, chiều cao h = 4. Tính diện tích xung quanh.",
        exampleSolution: "Độ dài đường sinh l = \\sqrt{4^2 + (5 - 2)^2} = \\sqrt{16 + 9} = 5. Vậy S_{xq} = \\pi (5 + 2) \\cdot 5 = 35\\pi.",
        isStarred: false,
      },
      {
        id: "fm-03",
        nameVi: "Định lý Euler cho khối đa diện lồi",
        nameZh: "欧拉示性数公式",
        pinyin: "ōu lā shì xìng shù gōng shì",
        latex: "V - E + F = 2",
        description: "Mối liên hệ giữa số đỉnh, số cạnh và số mặt của bất kỳ khối đa diện lồi nào.",
        variables: [
          { symbol: "V", meaning: "Số đỉnh (Vertices)" },
          { symbol: "E", meaning: "Số cạnh (Edges)" },
          { symbol: "F", meaning: "Số mặt (Faces)" },
        ],
        conditions: "Áp dụng cho mọi đa diện lồi trong không gian 3 chiều.",
        exampleProblem: "Một khối đa diện lồi có 12 đỉnh và 20 mặt. Tính số cạnh của khối đa diện.",
        exampleSolution: "Theo định lý Euler: 12 - E + 20 = 2 \\Rightarrow E = 32 - 2 = 30 cạnh.",
        isStarred: false,
      },
    ],
  },
  {
    sessionId: "ses-math-02",
    courseId: "course-csca-math",
    courseTitle: "CSCA Toán học Dự bị & Đầu vào",
    classId: "class-csca-k26",
    classTitle: "Luyện Đề CSCA Toán Chuyên Sâu K26",
    date: "2026-10-22T19:30:00.000Z",
    formattedDate: "Thứ Năm, 22/10/2026 • 19:30",
    chapter: "Chương 3: Giải tích & Giới hạn hàm số",
    sessionTitle: "Buổi 6: Đạo hàm, vi phân và tiếp tuyến đồ thị",
    subject: "MATH",
    subjectLabel: "Toán học CSCA",
    formulas: [
      {
        id: "fm-04",
        nameVi: "Phương trình tiếp tuyến của đồ thị hàm số",
        nameZh: "切线方程公式",
        pinyin: "qiē xiàn fāng chéng gōng shì",
        latex: "y - y_0 = f'(x_0)(x - x_0)",
        description: "Phương trình tiếp tuyến tại tiếp điểm M(x_0, y_0) thuộc đồ thị hàm số y = f(x).",
        variables: [
          { symbol: "x_0, y_0", meaning: "Tọa độ tiếp điểm với y_0 = f(x_0)" },
          { symbol: "f'(x_0)", meaning: "Hệ số góc của tiếp tuyến (Đạo hàm tại x_0)" },
        ],
        conditions: "Hàm số f(x) có đạo hàm tại điểm x_0.",
        exampleProblem: "Viết phương trình tiếp tuyến của đồ thị hàm số y = x^2 - 3x + 2 tại điểm có hoành độ x_0 = 2.",
        exampleSolution: "Ta có y_0 = f(2) = 0. Đạo hàm y' = 2x - 3 \\Rightarrow f'(2) = 1. Phương trình tiếp tuyến: y - 0 = 1(x - 2) \\Leftrightarrow y = x - 2.",
        isStarred: true,
      },
      {
        id: "fm-05",
        nameVi: "Đạo hàm của hàm hợp",
        nameZh: "复合函数求导法则",
        pinyin: "fù hé hán shù qiú dǎo fǎ zé",
        latex: "\\left[ f(u(x)) \\right]' = f'(u) \\cdot u'(x)",
        description: "Quy tắc dây chuyền tính đạo hàm của hàm số hợp.",
        variables: [
          { symbol: "u(x)", meaning: "Hàm số trung gian theo biến x" },
          { symbol: "f'(u)", meaning: "Đạo hàm theo biến u" },
          { symbol: "u'(x)", meaning: "Đạo hàm của u theo biến x" },
        ],
        conditions: "Hàm u(x) khả vi tại x và f(u) khả vi tại u(x).",
        exampleProblem: "Tính đạo hàm của hàm số y = (3x^2 + 1)^4.",
        exampleSolution: "Đặt u = 3x^2 + 1 \\Rightarrow u' = 6x. Khi đó y' = 4(3x^2 + 1)^3 \\cdot (6x) = 24x(3x^2 + 1)^3.",
        isStarred: false,
      },
    ],
  },
  {
    sessionId: "ses-sci-01",
    courseId: "course-csca-phy",
    courseTitle: "CSCA Vật Lý & Khoa học Tự nhiên",
    classId: "class-phy-k12",
    classTitle: "CSCA Vật Lý Chuyên Đề Tốc Độ",
    date: "2026-10-24T18:00:00.000Z",
    formattedDate: "Thứ Bảy, 24/10/2026 • 18:00",
    chapter: "Chương 1: Cơ học cổ điển & Định luật Newton",
    sessionTitle: "Buổi 3: Lực ma sát, lực đàn hồi và định luật II Newton",
    subject: "PHYSICS",
    subjectLabel: "Vật lý CSCA",
    formulas: [
      {
        id: "fp-01",
        nameVi: "Định luật II Newton",
        nameZh: "牛顿第二定律",
        pinyin: "niú dùn dì èr dìng lǜ",
        latex: "\\vec{F}_{hl} = m \\vec{a}",
        description: "Gia tốc của một vật tỉ lệ thuận với hợp lực tác dụng lên vật và tỉ lệ nghịch với khối lượng của nó.",
        variables: [
          { symbol: "\\vec{F}_{hl}", meaning: "Hợp lực tác dụng lên vật (Đơn vị: Newton, N)" },
          { symbol: "m", meaning: "Khối lượng của vật (kg)" },
          { symbol: "\\vec{a}", meaning: "Gia tốc của vật (m/s^2)" },
        ],
        conditions: "Áp dụng trong hệ quy chiếu quán tính.",
        exampleProblem: "Một lực không đổi F = 20N tác dụng lên vật có khối lượng m = 4kg đang đứng yên. Tính gia tốc của vật.",
        exampleSolution: "a = F / m = 20 / 4 = 5 \\text{ m/s}^2.",
        isStarred: true,
      },
      {
        id: "fp-02",
        nameVi: "Định luật Hooke (Lực đàn hồi lò xo)",
        nameZh: "胡克定律",
        pinyin: "hú kè dìng lǜ",
        latex: "F_{dh} = k \\cdot |\\Delta l|",
        description: "Độ lớn của lực đàn hồi tỉ lệ thuận với độ biến dạng của lò xo trong giới hạn đàn hồi.",
        variables: [
          { symbol: "F_{dh}", meaning: "Độ lớn lực đàn hồi (N)" },
          { symbol: "k", meaning: "Độ cứng của lò xo (N/m)" },
          { symbol: "\\Delta l", meaning: "Độ biến dạng: |l - l_0| (m)" },
        ],
        conditions: "Chỉ áp dụng khi biến dạng trong giới hạn đàn hồi của lò xo.",
        exampleProblem: "Treo vật có khối lượng m = 200g vào lò xo có k = 100 N/m, lấy g = 10 m/s^2. Tính độ dãn của lò xo khi cân bằng.",
        exampleSolution: "Khi cân bằng: P = F_{dh} \\Leftrightarrow mg = k \\Delta l \\Rightarrow \\Delta l = \\frac{0.2 \\cdot 10}{100} = 0.02 \\text{ m} = 2 \\text{ cm}.",
        isStarred: false,
      },
      {
        id: "fp-03",
        nameVi: "Lực ma sát trượt",
        nameZh: "滑动摩擦力公式",
        pinyin: "huá dòng mó cā lì gōng shì",
        latex: "F_{ms} = \\mu \\cdot N",
        description: "Độ lớn lực ma sát trượt tỉ lệ với độ lớn áp lực vuông góc giữa hai bề mặt tiếp xúc.",
        variables: [
          { symbol: "F_{ms}", meaning: "Độ lớn lực ma sát trượt (N)" },
          { symbol: "\\mu", meaning: "Hệ số ma sát trượt (không có thứ nguyên)" },
          { symbol: "N", meaning: "Độ lớn áp lực vuông góc với mặt tiếp xúc (N)" },
        ],
        conditions: "Vật đang chuyển động trượt tương đối trên bề mặt khác.",
        exampleProblem: "Vật nặng 10kg trượt trên sàn ngang, hệ số ma sát μ = 0.2, lấy g = 10 m/s^2. Tính lực ma sát trượt.",
        exampleSolution: "N = mg = 10 \\cdot 10 = 100N. F_{ms} = \\mu N = 0.2 \\cdot 100 = 20N.",
        isStarred: false,
      },
    ],
  },
  {
    sessionId: "ses-chem-01",
    courseId: "course-csca-chem",
    courseTitle: "CSCA Hóa Học Chuẩn Đầu Vào",
    classId: "class-chem-k15",
    classTitle: "CSCA Hóa Học Chuyên Đề Phản Ứng",
    date: "2026-10-26T19:00:00.000Z",
    formattedDate: "Thứ Hai, 26/10/2026 • 19:00",
    chapter: "Chương 2: Nhiệt động lực học & Cân bằng hóa học",
    sessionTitle: "Buổi 4: Hằng số cân bằng hóa học và định luật bảo toàn",
    subject: "CHEMISTRY",
    subjectLabel: "Hóa học CSCA",
    formulas: [
      {
        id: "fc-01",
        nameVi: "Hằng số cân bằng nồng độ (Kc)",
        nameZh: "化学平衡常数公式",
        pinyin: "huà xué píng héng cháng shù gōng shì",
        latex: "K_c = \\frac{[C]^c [D]^d}{[A]^a [B]^b}",
        description: "Biểu thức hằng số cân bằng cho phản ứng đồng thể: aA + bB ⇌ cC + dD ở nhiệt độ không đổi.",
        variables: [
          { symbol: "K_c", meaning: "Hằng số cân bằng nồng độ" },
          { symbol: "[A], [B], [C], [D]", meaning: "Nồng độ mol của các chất ở trạng thái cân bằng (M)" },
          { symbol: "a, b, c, d", meaning: "Hệ số tỉ lượng trong phương trình phản ứng" },
        ],
        conditions: "Áp dụng ở nhiệt độ xác định cho phản ứng thuận nghịch đạt cân bằng.",
        exampleProblem: "Cho phản ứng: N2 + 3H2 ⇌ 2NH3. Viết biểu thức Kc.",
        exampleSolution: "K_c = \\frac{[NH_3]^2}{[N_2][H_2]^3}.",
        isStarred: true,
      },
      {
        id: "fc-02",
        nameVi: "Định luật khí lý tưởng Clapeyron - Mendeleev",
        nameZh: "理想气体状态方程",
        pinyin: "lǐ xiǎng qì tǐ zhuàng tài fāng chéng",
        latex: "P \\cdot V = n \\cdot R \\cdot T",
        description: "Mối liên hệ giữa áp suất, thể tích, lượng chất và nhiệt độ tuyệt đối của chất khí lý tưởng.",
        variables: [
          { symbol: "P", meaning: "Áp suất của chất khí (atm hoặc Pa)" },
          { symbol: "V", meaning: "Thể tích của chất khí (L hoặc m^3)" },
          { symbol: "n", meaning: "Số mol chất khí (mol)" },
          { symbol: "R", meaning: "Hằng số khí lý tưởng: R = 0.082 \\text{ L.atm/(mol.K)}" },
          { symbol: "T", meaning: "Nhiệt độ tuyệt đối (K = °C + 273.15)" },
        ],
        conditions: "Áp dụng cho chất khí ở điều kiện áp suất không quá cao.",
        exampleProblem: "Tính thể tích của 0.5 mol khí O2 ở nhiệt độ 27°C và áp suất 1 atm.",
        exampleSolution: "T = 27 + 273 = 300K. V = \\frac{nRT}{P} = \\frac{0.5 \\cdot 0.082 \\cdot 300}{1} = 12.3 \\text{ lít}.",
        isStarred: false,
      },
    ],
  },
];

export function getStoredFormulaSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_FORMULA_SESSIONS));
      return INITIAL_FORMULA_SESSIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_FORMULA_SESSIONS;
  }
}

export function saveFormulaSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to save formula sessions", e);
  }
}

export function toggleFormulaStar(sessionId, formulaId) {
  const sessions = getStoredFormulaSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) return sessions;

  const formula = session.formulas.find((f) => f.id === formulaId);
  if (formula) {
    formula.isStarred = !formula.isStarred;
    saveFormulaSessions(sessions);
  }
  return sessions;
}
