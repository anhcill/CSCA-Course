import { useState } from "react";
import toast from "react-hot-toast";
import {
  FiX,
  FiCheckCircle,
  FiAward,
  FiMessageSquare,
  FiFileText,
  FiDownload,
  FiUser,
  FiClock,
} from "react-icons/fi";
import { gradeSubmission } from "../../api/lmsClient";

const CANNED_FEEDBACKS = [
  "Bài viết có cấu trúc mạch lạc, vốn từ phong phú và ngữ pháp rất chuẩn xác. Tiếp tục phát huy!",
  "Phát âm rõ ràng, thanh điệu chuẩn. Cần chú ý thêm ngữ điệu tự nhiên khi đọc câu dài.",
  "Bài làm tương đối tốt, tuy nhiên cần lưu ý cách sử dụng liên từ và dấu câu trong tiếng Trung.",
  "Cần hoàn thiện thêm các ý theo đúng yêu cầu đề bài. Chú ý nộp bài đúng hạn nhé!",
];

export default function TeacherGradingModal({ isOpen, onClose, submission, onGraded }) {
  const [score, setScore] = useState(submission?.score ?? 8.5);
  const [feedback, setFeedback] = useState(submission?.feedbackText ?? "");
  const [saving, setSaving] = useState(false);

  if (!isOpen || !submission) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    const maxScore = Number(submission.maxScore || 10);
    if (score === "" || isNaN(score) || score < 0 || score > maxScore) {
      toast.error(`Điểm số phải nằm trong thang 0 đến ${maxScore}!`);
      return;
    }

    setSaving(true);
    try {
      await gradeSubmission({
        submissionId: submission.id,
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
      onClose();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu điểm, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500">
              <FiAward className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                Chấm Điểm & Nhận Xét Bài Nộp
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {submission.assignmentTitle || "Bài tập lớp học"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Student Submission Overview */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
                <FiUser className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-gray-900 dark:text-white block">
                  {submission.studentName || "Học viên CSCA"}
                </span>
                <span className="text-[10px] text-gray-400">{submission.studentEmail || "student@csca.edu.vn"}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-mono">
              <FiClock className="w-3.5 h-3.5" />
              <span>Nộp lúc: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("vi-VN") : "Vừa xong"}</span>
            </div>
          </div>

          {/* Text Content */}
          {submission.contentText && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700/60">
              <span className="text-gray-400 uppercase font-bold text-[10px] block mb-1">Nội dung bài làm:</span>
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
                {submission.contentText}
              </p>
            </div>
          )}

          {/* Attached File */}
          {submission.fileUrl && (
            <div className="pt-2 flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <FiFileText className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {submission.fileName || "Tệp bài nộp đính kèm"}
                </span>
              </div>
              <a
                href={submission.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold hover:underline"
              >
                <FiDownload className="w-3.5 h-3.5" />
                <span>Tải tệp</span>
              </a>
            </div>
          )}

          {/* Audio Recording */}
          {submission.audioUrl && (
            <div className="pt-2 space-y-1.5 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <span className="text-gray-400 uppercase font-bold text-[10px] block">Ghi âm nói (Speaking):</span>
              <audio controls src={submission.audioUrl} className="w-full h-8" />
            </div>
          )}
        </div>

        {/* Grading Form */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Score Input */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Điểm số (Thang điểm 10): <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.1"
                min="0"
                max={submission.maxScore || 10}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-32 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-amber-500 outline-none focus:border-amber-500 transition"
                required
              />
              <span className="text-sm font-bold text-gray-400">/ {submission.maxScore || 10}</span>
            </div>
          </div>

          {/* Canned Comments Quick Select */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Nhận xét mẫu nhanh (Canned Feedback):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CANNED_FEEDBACKS.map((cf, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFeedback((prev) => (prev ? `${prev} ${cf}` : cf))}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-gray-600 dark:text-gray-300 hover:text-amber-500 text-[11px] transition text-left border border-gray-200 dark:border-gray-700"
                >
                  + {cf.slice(0, 38)}...
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Textarea */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Nhận xét & Lời khuyên chi tiết cho học viên:
            </label>
            <textarea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Nhập nhận xét chi tiết, khen ngợi điểm tốt và chỉ ra các lỗi ngữ pháp/phát âm cần sửa..."
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition resize-none leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition disabled:opacity-50"
            >
              <FiCheckCircle className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
              <span>{saving ? "Đang lưu điểm..." : "Lưu Điểm & Gửi Nhận Xét"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
