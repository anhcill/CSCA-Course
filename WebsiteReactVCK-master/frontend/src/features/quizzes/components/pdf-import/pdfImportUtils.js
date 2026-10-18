export const IMPORT_ANSWER_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const getImportItemQuestionCount = (item) => {
  if (!item) return 0;
  if (item.itemType === 'reading_group' || item.kind === 'reading_group') {
    return (item.subQuestions || item.questions || []).length;
  }
  if (item.itemType === 'fill_blank_group' || item.kind === 'fill_blank_group') {
    return (item.subItems || item.questions || []).length;
  }
  return 1;
};

export const getImportItemsQuestionCount = (items = []) =>
  items.reduce((sum, item) => sum + getImportItemQuestionCount(item), 0);

export const getImportPreviewItems = (preview) => {
  if (!preview) return [];
  return preview.items?.length ? preview.items : preview.questions || [];
};

export const hasImportText = (...values) =>
  values.some(value => typeof value === 'string' && value.trim().length > 0);

export const validateImportedSingleChoice = (item, label = 'Câu hỏi') => {
  if (!hasImportText(item.questionText, item.questionTextCn, item.questionTextEn)) {
    return `${label} cần nội dung câu hỏi`;
  }

  const answers = item.answers || item.options || [];
  if (answers.length < 2 || answers.length > IMPORT_ANSWER_KEYS.length) {
    return `${label} cần từ 2 đến 8 đáp án`;
  }

  const emptyAnswerIndex = answers.findIndex(
    answer => !hasImportText(answer.text, answer.textCn, answer.textEn)
  );
  if (emptyAnswerIndex !== -1) {
    return `${label} thiếu nội dung đáp án ${IMPORT_ANSWER_KEYS[emptyAnswerIndex] || emptyAnswerIndex + 1}`;
  }

  const allowedKeys = IMPORT_ANSWER_KEYS.slice(0, answers.length);
  if (!item.correctAnswer || !allowedKeys.includes(item.correctAnswer)) {
    return `${label} cần chọn đáp án đúng`;
  }

  return '';
};

export const validateImportedItems = (items = []) => {
  if (!items.length) return 'Không có câu hỏi để import';

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const label = `Mục ${index + 1}`;

    const kind = item.itemType || item.kind;
    if (kind === 'reading_group') {
      if (!hasImportText(item.passageText)) {
        return `${label} đọc hiểu cần đoạn văn`;
      }
      const subQuestions = item.subQuestions || item.questions || [];
      if (!subQuestions.length) {
        return `${label} đọc hiểu cần ít nhất 1 câu con`;
      }
      for (let subIndex = 0; subIndex < subQuestions.length; subIndex++) {
        const error = validateImportedSingleChoice(subQuestions[subIndex], `${label}.${subIndex + 1}`);
        if (error) return error;
      }
      continue;
    }

    if (kind === 'fill_blank_group') {
      const options = item.linkedOptions || [];
      const validOptionKeys = new Set(options.map(option => option.key));

      if (options.length < 2) {
        return `${label} điền từ cần ít nhất 2 lựa chọn`;
      }
      const emptyOptionIndex = options.findIndex(
        option => !hasImportText(option.text, option.textCn, option.textEn)
      );
      if (emptyOptionIndex !== -1) {
        return `${label} thiếu nội dung lựa chọn ${options[emptyOptionIndex]?.key || emptyOptionIndex + 1}`;
      }
      if (item.clozeMode === 'passage' && !hasImportText(item.passageText)) {
        return `${label} điền từ dạng đoạn văn cần đoạn văn chứa chỗ trống`;
      }
      const subItems = item.subItems || item.questions || [];
      if (!subItems.length) {
        return `${label} điền từ cần ít nhất 1 chỗ trống`;
      }
      for (let subIndex = 0; subIndex < subItems.length; subIndex++) {
        const subItem = subItems[subIndex];
        if (
          item.clozeMode !== 'passage' &&
          !hasImportText(subItem.questionText, subItem.questionTextCn, subItem.questionTextEn)
        ) {
          return `${label}.${subIndex + 1} cần nội dung câu điền từ`;
        }
        const answerKey = subItem.correctAnswerKey || subItem.correctAnswer;
        if (!answerKey || !validOptionKeys.has(answerKey)) {
          return `${label}.${subIndex + 1} cần đáp án đúng nằm trong danh sách từ chọn`;
        }
      }
      continue;
    }

    const error = validateImportedSingleChoice(item, label);
    if (error) return error;
  }

  return '';
};

export const createEmptyImportedAnswer = () => ({
  text: '',
  textCn: '',
  textEn: '',
  imageUrl: '',
});

export const createEmptyImportedQuestion = () => ({
  id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  itemType: 'single_choice',
  kind: 'question',
  questionType: 'single_choice',
  questionText: '',
  questionTextCn: '',
  questionTextEn: '',
  imageUrl: '',
  points: 1,
  explanation: '',
  explanationCn: '',
  explanationEn: '',
  answers: [createEmptyImportedAnswer(), createEmptyImportedAnswer()],
  options: [createEmptyImportedAnswer(), createEmptyImportedAnswer()],
  correctAnswer: '',
  difficulty: 'medium',
});

export const createEmptyImportedReadingGroup = () => ({
  id: `rg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  itemType: 'reading_group',
  kind: 'reading_group',
  passageText: '',
  passageImageUrl: '',
  subQuestions: [createEmptyImportedQuestion()],
  questions: [createEmptyImportedQuestion()],
});

export const createEmptyImportedFillBlankSubItem = (subQuestionNumber = 1) => ({
  id: `fbi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  questionText: '',
  questionTextCn: '',
  questionTextEn: '',
  points: 1,
  explanation: '',
  explanationCn: '',
  explanationEn: '',
  correctAnswerKey: 'A',
  correctAnswer: 'A',
  difficulty: 'medium',
  subQuestionNumber,
});

export const createEmptyImportedFillBlankGroup = () => ({
  id: `fbg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  itemType: 'fill_blank_group',
  kind: 'fill_blank_group',
  clozeMode: 'sentences',
  passageText: '',
  passageImageUrl: '',
  linkedOptions: [
    { key: 'A', text: '', textCn: '', textEn: '' },
    { key: 'B', text: '', textCn: '', textEn: '' },
  ],
  subItems: [createEmptyImportedFillBlankSubItem()],
  questions: [createEmptyImportedFillBlankSubItem()],
});

export const getNextOptionKey = (usedKeys = []) => {
  const used = new Set(usedKeys);
  return (
    IMPORT_ANSWER_KEYS.find(key => !used.has(key)) ||
    IMPORT_ANSWER_KEYS[usedKeys.length] ||
    'H'
  );
};
