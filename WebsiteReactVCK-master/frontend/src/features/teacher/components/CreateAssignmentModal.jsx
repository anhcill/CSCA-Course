import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  FileText,
  List,
  UploadCloud,
  X,
} from "lucide-react";
import { createAssignment, uploadClassFile, deleteClassFile } from "../../api/lmsClient";
import FileUploadProgressBox from "../../../components/common/FileUploadProgressBox.jsx";

const MAX_ASSIGNMENT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export default function CreateAssignmentModal({
  isOpen,
  onClose,
  classId,
  sessionId,
  sessionTitle,
  homeworkOnly = false,
  onCreated,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState(10);
  const [rubric, setRubric] = useState([]);
  const [type, setType] = useState("homework"); // homework | essay | speaking | quiz
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const openQuizBuilder = () => {
    onClose();
    const params = new URLSearchParams({
      classId: String(classId),
      new: "1",
      scope: homeworkOnly ? "homework" : "session",
    });
    if (sessionId) params.set("sessionId", String(sessionId));
    const quizPath = location.pathname.startsWith("/admin/") ? "/admin/quizzes" : "/lms/teacher/quizzes";
    navigate(`${quizPath}?${params.toString()}`);
  };

  const handleDeleteAttachment = async () => {
    if (!selectedFile) return;
    const fileId = selectedFile.id;
    const fileName = selectedFile.name || "tệp đính kèm";

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}"?`)) {
      return;
    }

    if (fileId) {
      setIsDeletingFile(true);
      try {
        await deleteClassFile(fileId);
        toast.success(`Đã xóa "${fileName}" thành công.`);
      } catch (err) {
        console.error("Lỗi xóa file:", err);
        toast.error(err?.message || "Không thể xóa file.");
        setIsDeletingFile(false);
        return;
      } finally {
        setIsDeletingFile(false);
      }
    }

    setSelectedFile(null);
    setAttachmentUrl("");
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReplaceAttachment = () => {
    fileInputRef.current?.click();
  };

  const uploadAttachment = async (file) => {
    if (!file || uploadingFile || submitting || isDeletingFile) return;
    if (file.size > MAX_ASSIGNMENT_ATTACHMENT_BYTES) {
      setSelectedFile(file);
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "Tệp đính kèm phải nhỏ hơn hoặc bằng 25MB.",
      });
      return;
    }

    // Tự động xóa file cũ trên Cloudflare R2 nếu đã từng upload trước đó
    const oldFileId = selectedFile?.id;
    if (oldFileId) {
      deleteClassFile(oldFileId).catch((err) => {
        console.warn("Không thể xóa file cũ trên R2:", err);
      });
    }

    setSelectedFile(file);
    setUploadingFile(true);
    setUploadProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang kết nối Cloudflare R2...",
      loaded: 0,
      total: file.size,
    });

    try {
      const response = await uploadClassFile(classId, file, {
        sessionId: sessionId || undefined,
        folder: "assignments",
        onProgress: (p) => {
          setUploadProgress((curr) => ({
            ...curr,
            status: p.stage === "done" ? "success" : "uploading",
            percent: p.percent,
            stage: p.stage,
            message: p.message,
            loaded: p.loaded ?? curr?.loaded ?? 0,
            total: p.total ?? file.size,
          }));
        },
      });

      const uploadedFile = response?.data;
      const uploadedFileUrl = uploadedFile?.viewUrl || uploadedFile?.downloadUrl || uploadedFile?.fileUrl;
      if (!response?.success || !uploadedFile?.id || !uploadedFileUrl) {
        throw new Error(response?.message || "Tải lên tệp đính kèm thất bại");
      }

      setAttachmentUrl(uploadedFileUrl);
      setSelectedFile({
        id: uploadedFile.id,
        name: uploadedFile.name || uploadedFile.fileName || file.name,
        size: uploadedFile.sizeBytes || file.size,
      });
      setUploadProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã tải lên "${file.name}" thành công!`,
        loaded: file.size,
        total: file.size,
      });
      toast.success("Đã đính kèm tệp bài tập!");
    } catch (error) {
      const errText = error?.message || "Không thể tải lên tệp đính kèm. Vui lòng thử lại.";
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Lỗi tải tệp đính kèm",
        errorMessage: errText,
        loaded: 0,
        total: file.size,
      });
      toast.error(errText);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      uploadAttachment(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Vui lòng nhập tiêu đề bài tập");
      return;
    }
    if (!dueDate) {
      toast.error("Vui lòng thiết lập hạn nộp bài");
      return;
    }

    if (rubric.length > 0) {
      const invalidCriterion = rubric.find((item) => !item.title.trim() || Number(item.maxPoints) <= 0);
      if (invalidCriterion) {
        toast.error("Mỗi tiêu chí trong rubric cần có tên và điểm lớn hơn 0");
        return;
      }

      const totalRubric = rubric.reduce((total, item) => total + (Number(item.maxPoints) || 0), 0);
      if (Math.abs(totalRubric - Number(maxScore || 0)) > 0.005) {
        toast.error(`Tổng điểm rubric (${totalRubric}) phải bằng thang điểm tối đa (${maxScore})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await createAssignment({
        classId,
        sessionId: sessionId || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: new Date(dueDate).toISOString(),
        maxScore: Number(maxScore) || 10,
        rubric: rubric.length > 0
          ? rubric.map((item) => ({
              title: item.title.trim(),
              description: item.description?.trim() || "",
              maxPoints: Number(item.maxPoints),
            }))
          : undefined,
        assignmentType: type === "speaking" ? "hskk" : type,
        attachmentUrl: attachmentUrl || undefined,
      });
      const created = response?.data;
      if (onCreated) {
        onCreated({
          ...created,
          type: created.assignment_type,
          dueDate: created.due_date,
          submittedCount: 0,
          totalCount: 0,
          pendingGradingCount: 0,
          avgScore: null,
        });
      }
      toast.success(`Đã giao bài tập [${created?.title || title.trim()}] cho lớp thành công! 📝`);
      onClose();
    } catch (error) {
      toast.error(error?.message || "Không thể giao bài tập");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 relative flex flex-col max-h-[88vh] overflow-hidden">
        
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#102f63] dark:text-white leading-tight">
                {homeworkOnly ? "Giao Bài Tập Về Nhà" : "Giao Bài Tập Mới Cho Lớp"}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {sessionTitle ? `Gắn theo buổi ${sessionTitle}.` : "Thiết lập tiêu đề, hạn nộp và hướng dẫn bài tập."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openQuizBuilder}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 shadow-2xs transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
            >
              <List className="h-3.5 w-3.5" /> Tạo Quiz
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form id="create-assignment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 p-3 dark:border-violet-900/60 dark:bg-violet-950/30">
            <div>
              <p className="font-bold text-violet-900 dark:text-violet-200">
                {sessionTitle ? `Buổi gốc: ${sessionTitle}` : "Giao bài tập có hạn nộp cho học viên"}
              </p>
              <p className="mt-0.5 text-[11px] text-violet-700 dark:text-violet-300">
                {type === "essay"
                  ? "Bài tự luận được nhận diện riêng, giáo viên chấm tại Cổng chấm tổng."
                  : "Bài nộp file hoặc văn bản cần giáo viên chấm tại Cổng chấm tổng."}
              </p>
            </div>
            <button
              type="button"
              onClick={openQuizBuilder}
              className="shrink-0 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-violet-700"
            >
              Mở Quiz
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Tiêu đề bài tập <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Viết đoạn văn luận HSK 4 — Chủ đề Du học Trung Quốc"
              className="w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>

          {/* Type & Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Loại bài tập:
              </label>
              <select
                value={type}
                onChange={(e) => {
                  if (e.target.value === "quiz") openQuizBuilder();
                  else setType(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="homework">Bài tập về nhà (Homework)</option>
                <option value="essay">Bài viết luận (Writing)</option>
                <option value="speaking">Ghi âm nói (Speaking)</option>
                {!homeworkOnly && <option value="quiz">Trắc nghiệm nhanh (Quiz)</option>}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thang điểm tối đa:
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-mono font-bold text-blue-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Rubric */}
          <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-blue-900 dark:text-sky-200">
                  Rubric chấm bài <span className="font-normal text-slate-500">(không bắt buộc)</span>
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  Thêm tiêu chí để khi chấm, hệ thống cộng điểm từng phần và lưu lịch sử nhận xét.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRubric((current) => [
                    ...current,
                    { id: `${Date.now()}-${current.length}`, title: "", description: "", maxPoints: "" },
                  ])
                }
                className="shrink-0 rounded-xl bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition hover:bg-blue-700"
              >
                + Tiêu chí
              </button>
            </div>

            {rubric.length > 0 && (
              <div className="mt-3 space-y-2">
                {rubric.map((criterion, index) => (
                  <div
                    key={criterion.id}
                    className="grid grid-cols-[minmax(0,1fr)_72px_auto] gap-2 rounded-xl border border-sky-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800 shadow-2xs"
                  >
                    <div>
                      <input
                        value={criterion.title}
                        onChange={(event) =>
                          setRubric((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, title: event.target.value } : item
                            )
                          )
                        }
                        placeholder={`Tiêu chí ${index + 1}`}
                        maxLength={255}
                        className="w-full bg-transparent text-xs font-bold outline-none placeholder:text-slate-400 dark:text-white"
                      />
                      <input
                        value={criterion.description}
                        onChange={(event) =>
                          setRubric((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, description: event.target.value } : item
                            )
                          )
                        }
                        placeholder="Gợi ý nhận xét (tùy chọn)"
                        maxLength={2000}
                        className="mt-1 w-full bg-transparent text-[11px] outline-none placeholder:text-slate-400 dark:text-slate-300"
                      />
                    </div>
                    <input
                      type="number"
                      min="0.25"
                      max="999.99"
                      step="0.25"
                      value={criterion.maxPoints}
                      onChange={(event) =>
                        setRubric((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, maxPoints: event.target.value } : item
                          )
                        )
                      }
                      placeholder="Điểm"
                      className="w-full rounded-lg border border-sky-200 bg-sky-50 px-1.5 text-center text-xs font-bold font-mono outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setRubric((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="rounded-lg px-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <p
                  className={`text-[11px] font-bold ${
                    Math.abs(
                      rubric.reduce((total, item) => total + (Number(item.maxPoints) || 0), 0) -
                        Number(maxScore || 0)
                    ) < 0.005
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  Tổng rubric: {rubric.reduce((total, item) => total + (Number(item.maxPoints) || 0), 0)}/{maxScore} điểm{" "}
                  {Math.abs(
                    rubric.reduce((total, item) => total + (Number(item.maxPoints) || 0), 0) -
                      Number(maxScore || 0)
                  ) < 0.005
                    ? "✓ Đã khớp thang điểm"
                    : "— cần bằng thang điểm"}
                </p>
              </div>
            )}
          </section>

          {/* Due Date */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Hạn nộp bài (Deadline) <span className="text-rose-500">*</span>:
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Mô tả chi tiết & Hướng dẫn làm bài:
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập yêu cầu bài làm, tiêu chí đánh giá hoặc lưu ý..."
              className="w-full rounded-xl border border-slate-200/90 bg-white p-3 text-xs text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-white resize-none leading-relaxed"
            />
          </div>

          {/* File attachment */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Đính kèm file đề bài / tài liệu mẫu:
            </label>
            <div
              className="border border-dashed border-sky-300 rounded-2xl p-4 text-center hover:border-blue-500 transition bg-white/70 dark:bg-slate-800/40"
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
                className="w-full cursor-pointer space-y-1 disabled:cursor-wait disabled:opacity-60"
              >
                <UploadCloud className="h-6 w-6 mx-auto text-blue-600" />
                <p className="text-slate-800 dark:text-slate-200 font-bold text-xs">
                  {uploadingFile
                    ? "Đang tải tệp lên..."
                    : selectedFile
                    ? `Đã đính kèm: ${selectedFile.name}`
                    : "Nhấn để chọn tệp hoặc kéo thả vào đây"}
                </p>
                <p className="text-[11px] text-slate-400">PDF, DOCX, XLSX, MP3 hoặc ZIP (Tối đa 25MB)</p>
              </button>
            </div>

            {uploadProgress && (
              <div className="mt-2.5">
                <FileUploadProgressBox
                  file={selectedFile}
                  progress={uploadProgress}
                  isDeleting={isDeletingFile}
                  onReplace={handleReplaceAttachment}
                  onRemove={handleDeleteAttachment}
                  onRetry={() => uploadAttachment(selectedFile)}
                  onCancel={handleDeleteAttachment}
                />
              </div>
            )}
          </div>
        </form>

        {/* Fixed Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || uploadingFile}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            form="create-assignment-form"
            disabled={submitting || uploadingFile}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition disabled:opacity-50"
          >
            <CheckCircle2 className={`h-4 w-4 ${submitting ? "animate-spin" : ""}`} />
            <span>{uploadingFile ? "Đang tải tệp..." : submitting ? "Đang xuất bản..." : "Xuất bản bài tập"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
