export const MOCK_QUIZ_EDITOR_DATA = {
  id: 101,
  title: 'Đề thi thử CSCA Toán & Tiếng Trung số 01',
  description: 'Đề thi mẫu chuẩn hóa cấu trúc MOLI tích hợp hệ thống LMS.',
  courseId: 1,
  courseTitle: 'Khóa luyện thi CSCA Toàn diện 2026',
  liveClassId: 2,
  className: 'Lớp Chuyên sâu CSCA - Khóa K01',
  classSessionId: 3,
  sessionTitle: 'Buổi 03: Giải tích hàm số & Bài toán đọc hiểu',
  activityScope: 'session',
  durationMinutes: 60,
  passingScore: 60,
  attemptLimit: 1,
  availableFrom: '2026-10-20T01:00:00.000Z',
  availableUntil: '2026-10-20T02:00:00.000Z',
  dueDate: '2026-10-20T02:00:00.000Z',
  reviewPolicy: 'after_submit',
  shuffleQuestions: false,
  status: 'DRAFT',
  items: [
    {
      id: 'q-1',
      kind: 'question',
      questionType: 'single_choice',
      questionText: 'Cho hàm số $y = f(x) = \\frac{1}{3}x^3 - 2x^2 + 3x + 1$. Khẳng định nào sau đây là đúng?',
      questionTextCn: '已知函数 $f(x) = \\frac{1}{3}x^3 - 2x^2 + 3x + 1$。下列结论中正确的是？',
      questionTextEn: 'Given the function $f(x) = \\frac{1}{3}x^3 - 2x^2 + 3x + 1$. Which of the following statements is correct?',
      options: [
        { key: 'A', text: 'Hàm số đồng biến trên $(-\\infty, 1)$ và $(3, +\\infty)$', textCn: '函数在 $(-\\infty, 1)$ 和 $(3, +\\infty)$ 上单调递增' },
        { key: 'B', text: 'Hàm số nghịch biến trên $(-\\infty, 1)$', textCn: '函数在 $(-\\infty, 1)$ 上单调递减' },
        { key: 'C', text: 'Hàm số đạt cực tiểu tại $x = 1$', textCn: '函数在 $x = 1$ 处取得极小值' },
        { key: 'D', text: 'Hàm số đạt cực đại tại $x = 3$', textCn: '函数在 $x = 3$ 处取得极大值' },
      ],
      correctAnswer: 'A',
      explanation: 'Ta có đạo hàm $f\'(x) = x^2 - 4x + 3 = (x - 1)(x - 3)$. Cho $f\'(x) > 0 \\iff x < 1$ hoặc $x > 3$. Do đó hàm số đồng biến trên $(-\\infty, 1)$ và $(3, +\\infty)$. Đáp án A.',
      points: 2,
    },
    {
      id: 'q-2',
      kind: 'question',
      questionType: 'multiple_choice',
      questionText: 'Trong không gian $Oxyz$, cho mặt cầu $(S): x^2 + y^2 + z^2 - 2x + 4y - 6z - 2 = 0$. Những khẳng định nào sau đây đúng? (Chọn các phương án đúng)',
      questionTextCn: '在空间直角坐标系中，球面方程为 $x^2 + y^2 + z^2 - 2x + 4y - 6z - 2 = 0$。下列哪些判断是正确的？',
      options: [
        { key: 'A', text: 'Tâm của mặt cầu là $I(1, -2, 3)$', textCn: '球心坐标为 $I(1, -2, 3)$' },
        { key: 'B', text: 'Bán kính của mặt cầu là $R = 4$', textCn: '球的半径为 $R = 4$' },
        { key: 'C', text: 'Mặt phẳng $(Oxy)$ cắt mặt cầu theo giao tuyến là đường tròn bán kính $r = \\sqrt{7}$', textCn: '平面 $(Oxy)$ 截球面所得截面圆的半径为 $r = \\sqrt{7}$' },
        { key: 'D', text: 'Điểm $O(0, 0, 0)$ nằm phía ngoài mặt cầu', textCn: '原点 $O(0, 0, 0)$ 在球面外部' },
      ],
      correctAnswer: ['A', 'B', 'C'],
      explanation: 'Ta biến đổi $(x-1)^2 + (y+2)^2 + (z-3)^2 = 2 + 1 + 4 + 9 = 16 = 4^2$. Vậy tâm $I(1, -2, 3)$ và bán kính $R = 4$. Khoảng cách từ $I$ đến $(Oxy)$ là $d = |z_I| = 3$. Bán kính giao tuyến $r = \\sqrt{R^2 - d^2} = \\sqrt{16 - 9} = \\sqrt{7}$. Đáp án A, B, C.',
      points: 3,
    },
    {
      id: 'g-1',
      kind: 'reading_group',
      passageText: '### Đoạn văn đọc hiểu toán học (CSCA Context):\nTrong kinh tế học lượng giác, mô hình cung cầu của một mặt hàng được biểu diễn bởi hai hàm số:\n- Hàm cung: $P_S(Q) = 2Q^2 + 5Q + 10$\n- Hàm cầu: $P_D(Q) = -Q^2 - 3Q + 100$\nTrong đó $Q \\ge 0$ là lượng sản phẩm (nghìn đơn vị) và $P$ là đơn giá (USD). Trạng thái cân bằng thị trường đạt được khi $P_S(Q) = P_D(Q)$.',
      questions: [
        {
          id: 'q-3',
          questionType: 'reading_item',
          questionText: 'Lượng cân bằng thị trường $Q_0$ là bao nhiêu?',
          options: [
            { key: 'A', text: '$Q_0 = 5$ nghìn đơn vị' },
            { key: 'B', text: '$Q_0 = 6$ nghìn đơn vị' },
            { key: 'C', text: '$Q_0 = 10$ nghìn đơn vị' },
            { key: 'D', text: '$Q_0 = 15$ nghìn đơn vị' },
          ],
          correctAnswer: 'A',
          explanation: 'Giải phương trình: $2Q^2 + 5Q + 10 = -Q^2 - 3Q + 100 \\iff 3Q^2 + 8Q - 90 = 0$ (nghiệm dương $Q = 5$).',
          points: 2.5,
        },
        {
          id: 'q-4',
          questionType: 'reading_item',
          questionText: 'Mức giá cân bằng $P_0$ tương ứng là:',
          options: [
            { key: 'A', text: '$P_0 = 85$ USD' },
            { key: 'B', text: '$P_0 = 75$ USD' },
            { key: 'C', text: '$P_0 = 60$ USD' },
            { key: 'D', text: '$P_0 = 90$ USD' },
          ],
          correctAnswer: 'A',
          explanation: 'Thay $Q = 5$ vào hàm cầu: $P = -(5)^2 - 3(5) + 100 = -25 - 15 + 100 = 85$ USD.',
          points: 2.5,
        },
      ],
    },
    {
      id: 'g-2',
      kind: 'fill_blank_group',
      clozeMode: 'passage',
      passageText: 'Cho cấp số nhân $(v_n)$ có số hạng đầu $v_1 = 2$ và công bội $q = 3$. Khi đó số hạng thứ tư $v_4$ bằng [blank_1], và tổng $S_4 = v_1 + v_2 + v_3 + v_4$ bằng [blank_2].',
      linkedOptions: [
        { blankId: 'blank_1', placeholder: 'Nhập giá trị v_4' },
        { blankId: 'blank_2', placeholder: 'Nhập giá trị S_4' },
      ],
      questions: [
        {
          id: 'q-5',
          subQuestionNumber: 1,
          questionType: 'fill_blank_item',
          questionText: 'Giá trị của số hạng thứ tư $v_4$',
          correctAnswer: '54',
          explanation: '$v_4 = v_1 \\cdot q^3 = 2 \\cdot 3^3 = 2 \\cdot 27 = 54$.',
          points: 1.5,
        },
        {
          id: 'q-6',
          subQuestionNumber: 2,
          questionType: 'fill_blank_item',
          questionText: 'Giá trị tổng 4 số hạng đầu $S_4$',
          correctAnswer: '80',
          explanation: '$S_4 = 2 \\cdot \\frac{3^4 - 1}{3 - 1} = 3^4 - 1 = 81 - 1 = 80$.',
          points: 1.5,
        },
      ],
    },
  ],
};

export const MOCK_STUDENT_QUIZ_PLAYER_DATA = {
  id: 101,
  title: 'Đề thi thử CSCA Toán & Tiếng Trung số 01',
  description: 'Thời gian làm bài: 60 phút. Hệ thống tự động lưu bài làm mỗi 30 giây.',
  durationMinutes: 60,
  serverRemainingSeconds: 3600,
  passingScore: 60,
  maxAttempts: 1,
  currentAttempt: 1,
  reviewPolicy: 'after_submit',
  items: MOCK_QUIZ_EDITOR_DATA.items.map((item) => {
    if (item.kind === 'question') {
      const safeQuestion = { ...item };
      delete safeQuestion.correctAnswer;
      delete safeQuestion.explanation;
      return safeQuestion;
    }
    if (item.kind === 'reading_group' || item.kind === 'fill_blank_group') {
      return {
        ...item,
        questions: (item.questions || []).map((subQ) => {
          const safeSubQ = { ...subQ };
          delete safeSubQ.correctAnswer;
          delete safeSubQ.explanation;
          return safeSubQ;
        }),
      };
    }
    return item;
  }),
  savedAnswers: {
    'q-1': 'A',
  },
};
