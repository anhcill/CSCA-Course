import { useState } from "react";
import toast from "react-hot-toast";
import {
  FiX,
  FiFileText,
  FiCalendar,
  FiAward,
  FiUploadCloud,
  FiCheckCircle,
  FiAlertCircle,
} from "react-icons/fi";
import { createAssignment } from "../../api/lmsClient";

export default function CreateAssignmentModal({ isOpen, onClose, classId, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState(10);
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [type, setType] = useState("homework"); // homework | essay | speaking | quiz
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Vui lòng nhập tiêu đề bài tập!");
      return;
    }
    if (!dueDate) {
      toast.error("Vui lòng chọn hạn nộp bài!");
      return;
    }

    setSubmitting(true);
    try {
      const response = await createAssignment({
        liveClassId: classId,
        title: title.trim(),
        description: description.trim(),
        dueDate,
        maxScore: Number(maxScore),
        assignmentType: type === "speaking" ? "hskk" : type === "essay" ? "homework" : type,
      });
      const created = response?.data;
      if (onCreated) onCreated({
        ...created,
        type: created.assignment_type,
        dueDate: created.due_date,
        submittedCount: 0,
        totalCount: 0,
        pendingGradingCount: 0,
        avgScore: null,
      });
      toast.success(`Đã giao bài tập [${created?.title || title.trim()}] cho lớp thành công! 📝`);
      onClose();
    } catch (error) {
      toast.error(error?.message || "Không thể giao bài tập");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500">
              <FiFileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                Giao Bài Tập Mới Cho Lớp
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Thiết lập nội dung, hạn nộp và tiêu chuẩn chấm điểm.
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Tiêu đề bài tập <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Viết đoạn văn HSK 4 — Chủ đề Du học Trung Quốc"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
              required
            />
          </div>

          {/* Type & Max Score */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Loại bài tập:
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
              >
                <option value="homework">Bài tập về nhà (Homework)</option>
                <option value="essay">Bài viết luận (Writing / Essay)</option>
                <option value="speaking">Ghi âm nói (Speaking / Audio)</option>
                <option value="quiz">Trắc nghiệm nhanh (Quiz)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Thang điểm tối đa:
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Hạn nộp bài (Deadline) <span className="text-rose-500">*</span>:
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Mô tả chi tiết & Hướng dẫn:
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập yêu cầu bài làm, tiêu chí đánh giá hoặc liên kết tài liệu tham khảo..."
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
            />
          </div>

          {/* File attachment */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Đính kèm file đề bài / tài liệu mẫu (R2 / Cloudinary):
            </label>
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center hover:border-indigo-500 transition bg-gray-50/50 dark:bg-gray-800/30">
              <input
                type="file"
                id="assignment-file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setSelectedFile(e.target.files[0]);
                    toast.success(`Đã chọn tệp: ${e.target.files[0].name}`);
                  }
                }}
              />
              <label htmlFor="assignment-file" className="cursor-pointer space-y-1 block">
                <FiUploadCloud className="w-6 h-6 mx-auto text-indigo-500" />
                <p className="text-gray-600 dark:text-gray-300 font-medium">
                  {selectedFile ? selectedFile.name : "Nhấn để chọn tệp hoặc kéo thả vào đây"}
                </p>
                <p className="text-[10px] text-gray-400">PDF, DOCX, XLSX, MP3 hoặc ZIP (Tối đa 25MB)</p>
              </label>
            </div>
          </div>

          {/* Allow Resubmission Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
            <div>
              <span className="font-bold text-gray-900 dark:text-white block">Cho phép nộp lại (Resubmission)</span>
              <span className="text-[11px] text-gray-500">Học viên có thể cập nhật bài làm trước hạn chót</span>
            </div>
            <input
              type="checkbox"
              checked={allowResubmit}
              onChange={(e) => setAllowResubmit(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              <FiCheckCircle className={`w-4 h-4 ${submitting ? "animate-spin" : ""}`} />
              <span>{submitting ? "Đang xuất bản..." : "Xuất bản bài tập"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
