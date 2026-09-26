/* eslint-disable react/prop-types */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiX,
  FiFileText,
  FiUploadCloud,
  FiCheckCircle,
  FiList,
} from "react-icons/fi";
import { createAssignment, uploadClassFile } from "../../api/lmsClient";

const MAX_ASSIGNMENT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export default function CreateAssignmentModal({ isOpen, onClose, classId, sessionId, sessionTitle, onCreated }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState(10);
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [type, setType] = useState("homework"); // homework | essay | speaking | quiz
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const openQuizBuilder = () => {
    onClose();
    const params = new URLSearchParams({ classId: String(classId), new: "1" });
    if (sessionId) params.set("sessionId", String(sessionId));
    navigate(`/lms/teacher/quizzes?${params.toString()}`);
  };

  const uploadAttachment = async (file) => {
    if (!file || uploadingFile || submitting) return;
    if (file.size > MAX_ASSIGNMENT_ATTACHMENT_BYTES) {
      toast.error("Tệp đính kèm phải nhỏ hơn hoặc bằng 25MB.");
      return;
    }

    setUploadingFile(true);
    setAttachmentUrl("");
    try {
      const response = await uploadClassFile(classId, file, { sessionId });
      const uploadedUrl = response?.data?.downloadUrl;
      if (!response?.success || !uploadedUrl) {
        throw new Error(response?.message || "Không thể xác nhận tệp đính kèm");
      }
      setSelectedFile({ name: file.name, size: file.size });
      setAttachmentUrl(uploadedUrl);
      toast.success(`Đã tải tệp đính kèm: ${file.name}`);
    } catch (error) {
      setSelectedFile(null);
      toast.error(error?.message || "Không thể tải tệp lên. Vui lòng thử lại.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    // Reset allows choosing the same file again after an upload error.
    event.target.value = "";
    await uploadAttachment(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (type === "quiz") {
      openQuizBuilder();
      return;
    }
    if (!title.trim()) {
      toast.error("Vui lòng nhập tiêu đề bài tập!");
      return;
    }
    if (!dueDate) {
      toast.error("Vui lòng chọn hạn nộp bài!");
      return;
    }
    if (uploadingFile) {
      toast("Tệp đính kèm đang tải lên, vui lòng chờ hoàn tất.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await createAssignment({
        liveClassId: classId,
        classSessionId: sessionId,
        title: title.trim(),
        description: description.trim(),
        dueDate,
        maxScore: Number(maxScore),
        assignmentType: type === "speaking" ? "hskk" : type === "essay" ? "homework" : type,
        attachmentUrl: attachmentUrl || undefined,
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden">
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <FiFileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                Giao Bài Tập Mới Cho Lớp
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                {sessionTitle ? `Giao cho ${sessionTitle}.` : "Thiết lập tiêu đề, hạn nộp và hướng dẫn bài tập."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openQuizBuilder}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/70"
            >
              <FiList className="h-3.5 w-3.5" /> Tạo Quiz
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 hover:text-white transition"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form id="create-assignment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/70 dark:bg-violet-950/25">
            <div>
              <p className="font-black text-violet-950 dark:text-violet-100">{sessionTitle ? `Buổi học: ${sessionTitle}` : "Đây là form bài tập tự luận"}</p>
              <p className="mt-0.5 text-[11px] text-violet-700 dark:text-violet-300">Bài tập, Quiz và tệp đính kèm tạo ở đây đều chỉ thuộc buổi học này.</p>
            </div>
            <button type="button" onClick={openQuizBuilder} className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-violet-500">Mở Quiz</button>
          </div>
          {/* Title */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
              Tiêu đề bài tập <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Viết đoạn văn HSK 4 — Chủ đề Du học Trung Quốc"
              className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
              required
            />
          </div>

          {/* Type, Score & Deadline Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                Loại bài tập:
              </label>
              <select
                value={type}
                onChange={(e) => {
                  if (e.target.value === "quiz") openQuizBuilder();
                  else setType(e.target.value);
                }}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
              >
                <option value="homework">Bài tập về nhà (Homework)</option>
                <option value="essay">Bài viết luận (Writing)</option>
                <option value="speaking">Ghi âm nói (Speaking)</option>
                <option value="quiz">Trắc nghiệm nhanh (Quiz)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
                Thang điểm tối đa:
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
              Hạn nộp bài (Deadline) <span className="text-rose-500">*</span>:
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
              Mô tả chi tiết & Hướng dẫn:
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập yêu cầu bài làm, tiêu chí đánh giá hoặc hướng dẫn..."
              className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl p-3 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
            />
          </div>

          {/* File attachment */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-slate-300 mb-1">
              Đính kèm file đề bài / tài liệu mẫu:
            </label>
            <div
              className="border border-dashed border-gray-300 dark:border-slate-800 rounded-xl p-3 text-center hover:border-indigo-500 transition bg-gray-50/50 dark:bg-slate-950/50"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                uploadAttachment(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                type="file"
                id="assignment-file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp,.zip,.mp3,.m4a,.wav,.webm,.ogg"
                onChange={handleFileChange}
                disabled={uploadingFile || submitting}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || submitting}
                className="w-full cursor-pointer space-y-0.5 disabled:cursor-wait disabled:opacity-60"
              >
                <FiUploadCloud className="w-5 h-5 mx-auto text-indigo-400" />
                <p className="text-gray-700 dark:text-slate-300 font-medium text-[11px]">
                  {uploadingFile ? "Đang tải tệp lên..." : selectedFile ? `Đã đính kèm: ${selectedFile.name}` : "Nhấn để chọn tệp hoặc kéo thả vào đây"}
                </p>
                <p className="text-[10px] text-gray-400">PDF, DOCX, XLSX, MP3 hoặc ZIP (Tối đa 25MB)</p>
              </button>
            </div>
          </div>

          {/* Allow Resubmission Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800">
            <div>
              <span className="font-bold text-gray-900 dark:text-white block text-[11px]">Cho phép nộp lại (Resubmission)</span>
              <span className="text-[10px] text-gray-500 dark:text-slate-400">Học viên có thể cập nhật bài làm trước deadline</span>
            </div>
            <input
              type="checkbox"
              checked={allowResubmit}
              onChange={(e) => setAllowResubmit(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </form>

        {/* Fixed Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-gray-100 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-900/95 backdrop-blur flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || uploadingFile}
            className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-slate-800 text-xs font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-700 transition"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            form="create-assignment-form"
            disabled={submitting || uploadingFile}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
          >
            <FiCheckCircle className={`w-3.5 h-3.5 ${submitting ? "animate-spin" : ""}`} />
            <span>{uploadingFile ? "Đang tải tệp..." : submitting ? "Đang xuất bản..." : "Xuất bản bài tập"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
