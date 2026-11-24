
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  FiX,
  FiCheckCircle,
  FiAward,
  FiFileText,
  FiDownload,
  FiUser,
  FiClock,
} from "react-icons/fi";
import { gradeSubmission } from "../../api/lmsClient";

const CANNED_FEEDBACKS = [
  { label: "🌟 Xuất sắc", text: "Bài viết có cấu trúc mạch lạc, ngữ pháp chuẩn xác. Tiếp tục phát huy!" },
  { label: "🗣️ Phát âm tốt", text: "Phát âm rõ ràng, thanh điệu chuẩn. Chú ý thêm ngữ điệu tự nhiên." },
  { label: "✍️ Chú ý liên từ", text: "Bài làm tốt, cần lưu ý cách sử dụng liên từ và dấu câu tiếng Trung." },
  { label: "⚠️ Cần bổ sung", text: "Cần hoàn thiện thêm các ý theo đúng yêu cầu đề bài. Chú ý deadline!" },
];

export default function TeacherGradingModal({ isOpen, onClose, submission, onGraded, onNext }) {
  const [score, setScore] = useState(submission?.score ?? 8.5);
  const [feedback, setFeedback] = useState(submission?.feedbackText ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!submission) return;
    setScore(submission.score ?? 8.5);
    setFeedback(submission.feedbackText ?? "");
  }, [submission]);

  const submitGrade = useCallback(async ({ moveNext = false } = {}) => {
    if (!submission || saving) return;
    if (score === "" || isNaN(score) || score < 0 || score > 10) {
      toast.error("Điểm số phải nằm trong thang 0 đến 10!");
      return;
    }

    setSaving(true);
    try {
      await gradeSubmission({
        submissionId: submission.id,
        revision: submission.revision,
        score: Number(score),
        feedbackText: feedback.trim(),
      });
      toast.success(`Đã lưu điểm [${score}/10] cho học viên ${submission.studentName || "học sinh"}! 🌟`);
      if (onGraded) {
        onGraded({
          ...submission,
          score: Number(score),
          feedbackText: feedback.trim(),
          status: "graded",
          gradedAt: new Date().toISOString(),
        });
      }
      if (moveNext && onNext) onNext();
      else onClose();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu điểm, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }, [submission, saving, score, feedback, onGraded, onNext, onClose]);

  useEffect(() => {
    if (!isOpen || !submission) return undefined;
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitGrade({ moveNext: Boolean(onNext) });
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submission, submitGrade, onNext, onClose]);

  if (!isOpen || !submission) return null;

  const handleSave = (e) => {
    e.preventDefault();
    submitGrade({ moveNext: false });
  };

  const modalContent = (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[120] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-xl w-full shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden">
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <FiAward className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                Chấm Điểm & Nhận Xét Bài Nộp
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">
                {submission.assignmentTitle || "Bài tập lớp học"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 hover:text-white transition"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="grading-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
          {/* Student Submission Overview */}
          <div className="bg-gray-50 dark:bg-slate-950 rounded-xl p-3.5 border border-gray-100 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                  <FiUser className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-gray-900 dark:text-white block text-xs">
                    {submission.studentName || "Học viên CSCA"}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">{submission.studentEmail || "student@csca.edu.vn"}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-gray-400 text-[10px] font-mono">
                <FiClock className="w-3 h-3" />
                <span>Nộp: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString("vi-VN") : "Vừa xong"}</span>
              </div>
            </div>

            {/* Text Content */}
            {submission.contentText && (
              <div className="pt-2 border-t border-gray-200 dark:border-slate-800">
                <span className="text-gray-400 uppercase font-bold text-[9px] block mb-1">Bài làm:</span>
                <p className="text-gray-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-gray-200 dark:border-slate-800 text-[11px] max-h-32 overflow-y-auto">
                  {submission.contentText}
                </p>
              </div>
            )}

            {/* Attached File */}
            {submission.fileUrl && (
              <div className="pt-1.5 flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-gray-200 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <FiFileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-medium text-gray-800 dark:text-slate-200 truncate text-[11px]">
                    {submission.fileName || "Tệp bài nộp đính kèm"}
                  </span>
                </div>
                <a
                  href={submission.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-400 text-[10px] font-bold hover:underline shrink-0"
                >
                  <FiDownload className="w-3 h-3" />
                  <span>Tải tệp</span>
                </a>
              </div>
            )}

            {/* Audio Recording */}
            {submission.audioUrl && (
              <div className="pt-1.5 space-y-1">
                <span className="text-gray-400 uppercase font-bold text-[9px] block">Ghi âm nói (Speaking):</span>
                <audio controls src={submission.audioUrl} className="w-full h-7" />
              </div>
            )}
          </div>

          {/* Score Input */}
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-bold text-gray-700 dark:text-slate-300 text-xs">
                  Điểm số bài làm: <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">Thang điểm chuẩn 10.0</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="10"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-24 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-amber-600 dark:text-amber-400 outline-none focus:border-amber-500 transition text-center"
                  required
                />
                <span className="text-xs font-bold text-gray-400">/ 10</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0, 5, 6.5, 7.5, 8, 8.5, 9, 9.5, 10].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setScore(val)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    Number(score) === val
                      ? "bg-amber-600 text-white shadow-xs"
                      : "border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-amber-400"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Canned Comments Quick Select */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1.5 text-[11px]">
              Chạm nhanh nhận xét mẫu:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CANNED_FEEDBACKS.map((cf) => (
                <button
                  key={cf.label}
                  type="button"
                  onClick={() => setFeedback((prev) => (prev.trim() ? `${prev.trim()}\n${cf.text}` : cf.text))}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-500/15 text-gray-700 dark:text-slate-200 hover:text-amber-700 dark:hover:text-amber-300 text-[11px] font-bold transition text-left border border-gray-200 dark:border-slate-700"
                >
                  {cf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Textarea */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1 text-[11px]">
              Lời khuyên & Nhận xét cho học viên:
            </label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Nhập nhận xét chi tiết cho học viên..."
              className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl p-3 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition resize-none leading-relaxed"
            />
          </div>
        </form>

        {/* Fixed Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-gray-100 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-900/95 backdrop-blur flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-[10px] font-semibold text-gray-400">
            Phím tắt: <span className="font-mono text-gray-600 dark:text-slate-300">Ctrl+Enter</span> lưu nhanh
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-slate-800 text-xs font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-700 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              form="grading-form"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
            >
              <FiCheckCircle className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
              <span>{saving ? "Đang lưu..." : "Lưu điểm"}</span>
            </button>
            {onNext && (
              <button
                type="button"
                disabled={saving}
                onClick={() => submitGrade({ moveNext: true })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition disabled:opacity-50"
              >
                <span>Lưu & bài tiếp →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
