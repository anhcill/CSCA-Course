export const isEssayQuestion = (question) => (
  question?.question_type === "essay" || question?.type === "essay"
);

export const preserveQuestionOrder = (questions) => (
  Array.isArray(questions) ? questions.map((question, index) => ({ ...question, displayNumber: index + 1 })) : []
);

export const attachmentsForQuestion = (attachments, questionId) => (
  (Array.isArray(attachments) ? attachments : []).filter(
    (attachment) => String(attachment?.questionId || "") === String(questionId || ""),
  )
);

export const normalizeEssayResponse = (essay, essayQuestions) => {
  const source = essay && typeof essay === "object" ? essay : {};
  const questions = Array.isArray(essayQuestions) ? essayQuestions : [];
  const byQuestion = source.byQuestion && typeof source.byQuestion === "object" ? source.byQuestion : {};
  const hasGroupedData = Object.keys(byQuestion).length > 0;
  const attachments = [];
  const notesByQuestion = {};

  questions.forEach((question) => {
    const entry = byQuestion[String(question.id)] || byQuestion[question.id];
    if (!entry || typeof entry !== "object") return;
    const questionNumber = question.displayNumber;
    (Array.isArray(entry.attachments) ? entry.attachments : []).forEach((attachment) => {
      attachments.push({ ...attachment, questionId: question.id, questionNumber });
    });
    if (typeof entry.notes === "string" && entry.notes.trim()) {
      notesByQuestion[String(question.id)] = entry.notes;
    }
  });

  if (!hasGroupedData) {
    const legacyAttachments = Array.isArray(source.attachments) ? source.attachments : [];
    const legacyTarget = questions[0] || null;
    legacyAttachments.forEach((attachment) => {
      attachments.push(legacyTarget && !attachment?.questionId
        ? { ...attachment, questionId: legacyTarget.id, questionNumber: legacyTarget.displayNumber }
        : attachment);
    });
    if (legacyTarget && typeof source.notes === "string" && source.notes.trim()) {
      notesByQuestion[String(legacyTarget.id)] = source.notes;
    }
  }

  return {
    attachments,
    notesByQuestion,
    generalNotes: hasGroupedData && typeof source.generalNotes === "string" ? source.generalNotes : "",
  };
};

export const buildEssayResponse = ({ attachments, notesByQuestion, generalNotes, essayQuestions }) => {
  const safeAttachments = (Array.isArray(attachments) ? attachments : []).map((attachment) => {
    const persisted = { ...attachment };
    delete persisted.previewUrl;
    return persisted;
  });
  const safeNotes = notesByQuestion && typeof notesByQuestion === "object" ? notesByQuestion : {};
  const questions = Array.isArray(essayQuestions) ? essayQuestions : [];
  const byQuestion = {};

  questions.forEach((question) => {
    const questionId = String(question.id);
    const questionAttachments = attachmentsForQuestion(safeAttachments, question.id);
    const notes = typeof safeNotes[questionId] === "string" ? safeNotes[questionId].trim() : "";
    if (questionAttachments.length || notes) {
      byQuestion[questionId] = {
        questionId: question.id,
        questionNumber: question.displayNumber,
        attachments: questionAttachments,
        notes,
      };
    }
  });

  const noteLines = questions
    .map((question) => {
      const note = String(safeNotes[String(question.id)] || "").trim();
      return note ? `Câu ${question.displayNumber}: ${note}` : "";
    })
    .filter(Boolean);
  const trimmedGeneralNotes = String(generalNotes || "").trim();

  return {
    attachments: safeAttachments,
    notes: [trimmedGeneralNotes, ...noteLines].filter(Boolean).join("\n\n"),
    generalNotes: trimmedGeneralNotes,
    byQuestion,
  };
};
