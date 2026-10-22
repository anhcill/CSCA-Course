import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  confirmSubmissionAsset,
  fetchAssignmentDetail,
  requestSubmissionUploadUrl,
  submitAssignment,
} from "../../api/lmsClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";

/* ── SVG Icons ────────────────────────────────────────────────── */
const IconUpload = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);
const IconMic = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

function countChineseChars(text) {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function timeRemaining(dueDate) {
  if (!dueDate) return { text: "Không đặt hạn nộp", urgent: false };
  const diff = new Date(dueDate) - new Date();
  if (diff <= 0) return { text: "Đã quá hạn · bài nộp sẽ được ghi nhận muộn", urgent: true };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return { text: `Còn ${d} ngày ${h} giờ`, urgent: d < 2 };
  return { text: `Còn ${h} giờ ${m} phút`, urgent: true };
}

function isImageFile(fileName) {
  return /\.(?:jpe?g|png|webp|gif)$/i.test(String(fileName || ""));
}

function resolvedFileMimeType(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".zip") && ["application/zip", "application/x-zip-compressed", "application/x-zip"].includes(file?.type)) {
    return file.type;
  }
  if (file?.type) return file.type;
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".txt")) return "text/plain";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function fileTypeIcon(item) {
  if (item?.isImage) return "🖼️";
  const name = String(item?.name || "").toLowerCase();
  if (name.endsWith(".zip")) return "🗜️";
  if (name.endsWith(".pdf")) return "📕";
  if (/\.docx?$/.test(name)) return "📝";
  return "📄";
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assignmentTypeLabel(type) {
  const normalized = String(type || "homework").toLowerCase();
  if (normalized === "essay" || normalized === "writing") return "Bài tự luận";
  if (normalized === "homework") return "Bài tập về nhà";
  return type || "Bài tập về nhà";
}

const MAX_FILES = 10;

import SubmissionHistory from "../components/SubmissionHistory";
import SubmissionAnnotations from "../components/SubmissionAnnotations";

export default function AssignmentSubmitPage() {
  const { id, courseId, classId } = useParams();
  const assignmentListPath = courseId && classId
    ? `/lms/courses/${courseId}/classes/${classId}/assignments`
    : "/lms/assignments";

  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Submission inputs
  const [activeTab, setActiveTab] = useState("text"); // text | file | audio
  const [contentText, setContentText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState([]); // [{ id, assetId, name, previewUrl, size, isImage, status, progress }]
  const [fileUrl, setFileUrl] = useState("");
  const [, setFileAssetId] = useState("");
  const [fileName, setFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioAssetId, setAudioAssetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // File Upload State with Progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Audio Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);

  // Submission result & view mode
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [isGraded, setIsGraded] = useState(false);

  const loadAssignment = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetchAssignmentDetail(id);
      if (res.success && res.data) {
        const currentAssignment = res.data;
        setAssignment(currentAssignment);
        setIsGraded(false); setIsAlreadySubmitted(false);

        const existingFiles = Array.isArray(currentAssignment.file_assets) && currentAssignment.file_assets.length > 0
          ? currentAssignment.file_assets.map((fa, idx) => ({
              id: `asset-${fa.id || idx}`,
              assetId: fa.id,
              name: fa.fileName,
              previewUrl: fa.fileUrl,
              size: fa.sizeBytes || 0,
              isImage: isImageFile(fa.fileName),
              status: "ready",
              progress: 100,
            }))
          : currentAssignment.file_url
            ? [{
                id: `asset-${currentAssignment.file_asset_id || 1}`,
                assetId: currentAssignment.file_asset_id,
                name: currentAssignment.file_name || "tai-lieu-bai-lam",
                previewUrl: currentAssignment.file_url,
                size: 0,
                isImage: isImageFile(currentAssignment.file_name),
                status: "ready",
                progress: 100,
              }]
            : [];
        setAttachedFiles(existingFiles);

        // Check submission state
        if (currentAssignment.can_resubmit) {
          setContentText(currentAssignment.content_text || ""); setFileUrl(currentAssignment.file_url || ""); setFileAssetId(currentAssignment.file_asset_id || ""); setFileName(currentAssignment.file_name || ""); setAudioUrl(currentAssignment.audio_url || ""); setAudioAssetId(currentAssignment.audio_asset_id || "");
        } else if (currentAssignment.status === "graded" || (currentAssignment.score !== undefined && currentAssignment.score !== null)) {
          setIsGraded(true);
          setIsAlreadySubmitted(true);
          setContentText(currentAssignment.content_text || "");
          setFileUrl(currentAssignment.file_url || "");
          setFileAssetId(currentAssignment.file_asset_id || "");
          setFileName(currentAssignment.file_name || "");
          setAudioUrl(currentAssignment.audio_url || "");
          setAudioAssetId(currentAssignment.audio_asset_id || "");
        } else if (currentAssignment.submission_id || currentAssignment.submitted_at || currentAssignment.status === "submitted") {
          setIsAlreadySubmitted(true);
          setContentText(currentAssignment.content_text || "");
          setFileUrl(currentAssignment.file_url || "");
          setFileName(currentAssignment.file_name || "");
          setAudioUrl(currentAssignment.audio_url || "");
        }
      } else {
        setErrorMessage("Không tìm thấy thông tin bài tập.");
      }
    } catch (err) {
      console.error("Error loading assignment:", err);
      setErrorMessage("Không thể tải thông tin bài tập. Vui lòng thử lại sau!");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAssignment();
  }, [loadAssignment]);

  // Audio recording timer simulation
  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const remaining = useMemo(() => (assignment ? timeRemaining(assignment.due_date) : null), [assignment]);
  const chineseCount = useMemo(() => countChineseChars(contentText), [contentText]);
  // Upload single file to Cloudflare R2 via presigned URL
  const uploadSingleFile = useCallback(async (file, assetKind = "file") => {
    const maxBytes = assetKind === "audio" ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`Tệp "${file.name}" vượt quá ${assetKind === "audio" ? 50 : 25}MB.`);
    }

    const mimeType = resolvedFileMimeType(file);
    const uploadResponse = await requestSubmissionUploadUrl({
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      assetKind,
    });
    const uploadData = uploadResponse.data;
    const uploadResult = await fetch(uploadData.uploadUrl, {
      method: "PUT",
      headers: uploadData.headers || { "Content-Type": mimeType },
      body: file,
    });
    if (!uploadResult.ok) throw new Error(`Không thể tải "${file.name}" lên kho lưu trữ Cloudflare R2`);
    const confirmed = await confirmSubmissionAsset({
      assetId: uploadData.assetId,
      mimeType,
      sizeBytes: file.size,
    });
    return {
      assetId: confirmed.data.id,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      isImage: isImageFile(file.name) || (file.type && file.type.startsWith("image/")),
    };
  }, []);

  const handleBatchFileUpload = useCallback(async (files) => {
    if (!files || files.length === 0 || isUploadingFile) return;
    setUploadError("");

    const availableSlots = MAX_FILES - attachedFiles.length;
    if (availableSlots <= 0) {
      toast.error(`Bạn đã đính kèm tối đa ${MAX_FILES} ảnh/tệp! Vui lòng xóa bớt nếu muốn thêm ảnh mới.`);
      return;
    }

    let filesToUpload = Array.from(files);
    if (filesToUpload.length > availableSlots) {
      toast(`Chỉ có thể thêm tối đa ${availableSlots} ảnh/tệp nữa (tối đa ${MAX_FILES} ảnh). Hệ thống sẽ tải ${availableSlots} ảnh đầu tiên.`, { icon: "ℹ️" });
      filesToUpload = filesToUpload.slice(0, availableSlots);
    }

    setIsUploadingFile(true);
    setUploadProgress(10);
    const toastId = toast.loading(`Đang tải lên ${filesToUpload.length} ảnh/tệp...`);

    const uploadedResults = [];
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadStatusText(`Đang tải tệp ${i + 1}/${filesToUpload.length}: ${file.name}`);
        setUploadProgress(Math.round(((i + 0.3) / filesToUpload.length) * 100));
        const res = await uploadSingleFile(file, "file");
        uploadedResults.push({
          id: `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          assetId: res.assetId,
          name: res.name,
          previewUrl: res.previewUrl,
          size: res.size,
          isImage: res.isImage,
          status: "ready",
          progress: 100,
        });
        setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));
      }

      setAttachedFiles((prev) => {
        const next = [...prev, ...uploadedResults];
        if (next.length > 0) {
          setFileAssetId(next[0].assetId);
          setFileUrl(next[0].previewUrl);
          setFileName(next[0].name);
        }
        return next;
      });
      toast.success(`Đã đính kèm ${uploadedResults.length} ảnh/tệp bài làm thành công! 📎`, { id: toastId });
    } catch (err) {
      console.error("Batch upload failed:", err);
      setUploadError(err.message || "Tải tệp lên thất bại. Vui lòng thử lại.");
      toast.error(err.message || "Lỗi tải tệp lên", { id: toastId });
      if (uploadedResults.length > 0) {
        setAttachedFiles((prev) => [...prev, ...uploadedResults]);
      }
    } finally {
      setIsUploadingFile(false);
      setUploadStatusText("");
      setUploadProgress(0);
    }
  }, [attachedFiles.length, isUploadingFile, uploadSingleFile]);

  const handleFileUpload = async (file, assetKind = "file") => {
    if (!file) return;
    if (assetKind === "audio") {
      setIsUploadingFile(true);
      try {
        const res = await uploadSingleFile(file, "audio");
        setAudioAssetId(res.assetId);
        setAudioUrl(res.previewUrl);
        toast.success("Đã tải lên bản ghi âm khẩu ngữ HSKK! 🎙️");
      } catch (err) {
        setUploadError(err.message);
        toast.error(err.message);
      } finally {
        setIsUploadingFile(false);
      }
      return;
    }
    await handleBatchFileUpload([file]);
  };

  const handleRemoveFile = (indexToRemove) => {
    setAttachedFiles((prev) => {
      const removed = prev[indexToRemove];
      if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (next.length > 0) {
        setFileAssetId(next[0].assetId);
        setFileUrl(next[0].previewUrl);
        setFileName(next[0].name);
      } else {
        setFileAssetId("");
        setFileUrl("");
        setFileName("");
      }
      return next;
    });
  };

  const handleRemoveAllFiles = () => {
    attachedFiles.forEach((item) => {
      if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    });
    setAttachedFiles([]);
    setFileAssetId("");
    setFileUrl("");
    setFileName("");
  };

  // Clipboard paste listener: paste copied images or screenshots (Snipping Tool, Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      if (isAlreadySubmitted && !assignment?.can_resubmit) return;

      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems || clipboardItems.length === 0) return;

      const imageFiles = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = (item.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const timeTag = new Date().toISOString().replace(/\D/g, "").slice(8, 14);
            const generatedName = `anh-dan-${timeTag}-${imageFiles.length + 1}.${ext}`;
            const file = new File([blob], generatedName, { type: item.type });
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        setActiveTab("file");
        handleBatchFileUpload(imageFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isAlreadySubmitted, assignment?.can_resubmit, handleBatchFileUpload]);

  // Record real microphone audio, then send it through the same validated upload flow.
  const handleToggleRecord = async () => {
    if (!isRecording) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setUploadError("Trình duyệt chưa hỗ trợ ghi âm trực tiếp. Bạn có thể dùng tab Đính Kèm Tệp.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferredMime = ["audio/webm", "audio/ogg", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
        recordingChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordingChunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const mimeType = recorder.mimeType || "audio/webm";
          const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
          const audioFile = new File(recordingChunksRef.current, `hskk-${Date.now()}.${extension}`, { type: mimeType });
          await handleFileUpload(audioFile, "audio");
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        setRecordingSeconds(0);
        setAudioUrl("");
        setAudioAssetId("");
        toast("Đang thu âm khẩu ngữ HSKK... Hãy nói rõ ràng vào micro 🎙️");
      } catch (err) {
        setUploadError(err.message || "Không thể truy cập micro");
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      toast(`Đã hoàn thành bản ghi âm (${recordingSeconds}s), đang tải lên...`);
    }
  };

  // Submit action
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const readyAssetIds = attachedFiles.filter((f) => f.status === "ready" && f.assetId).map((f) => f.assetId);
    if (!contentText.trim() && readyAssetIds.length === 0 && !audioAssetId) {
      toast.error("Vui lòng nhập nội dung bài làm, đính kèm ảnh/tệp hoặc ghi âm audio HSKK!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitAssignment({
        assignmentId: id,
        contentText: contentText.trim(),
        fileAssetId: readyAssetIds[0] || null,
        fileAssetIds: readyAssetIds,
        audioAssetId: audioAssetId || null,
      });

      if (res.success) {
        await loadAssignment();
        toast.success("Nộp bài tập thành công! Giáo viên sẽ chấm điểm và gửi phản hồi sớm. 🎉", {
          duration: 4000,
        });
        setShowConfirm(false);
      } else {
        toast.error(res.message || "Có lỗi xảy ra khi nộp bài tập!");
      }
    } catch (err) {
      console.error("Error submitting assignment:", err);
      toast.error(err.message || "Không thể nộp bài tập. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Đang nạp dữ liệu bài tập và hồ sơ nộp bài..." count={3} />
        </div>
      </div>
    );
  }

  if (errorMessage || !assignment) {
    return (
      <div className="min-h-[60vh] text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Không Tìm Thấy Bài Tập"
            message={errorMessage || "Bài tập bạn tìm kiếm không tồn tại hoặc đã bị gỡ."}
            onRetry={loadAssignment}
            secondaryAction={
              <Link
                to={assignmentListPath}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
              >
                ← Quay Về Danh Sách Bài Tập
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-16 font-sans text-slate-900">
      {/* Breadcrumb Navigation */}
      <div className="border-b border-white/80 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto max-w-4xl px-4 py-3">
          <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Link to={assignmentListPath} className="hover:text-slate-900 dark:hover:text-white transition">
              Danh Sách Bài Tập
            </Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-slate-200 font-medium truncate max-w-[240px]">
              {assignment.title}
            </span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Assignment Header Card */}
        <div className="space-y-4 rounded-3xl border border-white/85 bg-white/90 p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 dark:border-rose-500/25 text-xs font-bold rounded-full uppercase tracking-wider">
                  {assignmentTypeLabel(assignment.type || assignment.assignment_type)}
                </span>
                {assignment.course_title && (
                  <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium rounded-full">
                    {assignment.course_title}
                  </span>
                )}
              </div>

              <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {assignment.title}
              </h1>

              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed font-light">
                {assignment.description || "Hãy hoàn thành các yêu cầu bài tập và gửi bài trước thời hạn quy định."}
              </p>
              {assignment.attachment_url && (
                <a
                  href={assignment.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  <span aria-hidden="true">📎</span> Mở file đề bài / tài liệu mẫu
                </a>
              )}
            </div>

            {/* Score & Deadline Metrics */}
            <div className="flex md:flex-col gap-3 shrink-0">
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center min-w-[120px]">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Thang điểm</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">{assignment.max_score || "10.0"}</p>
              </div>

              <div
                className={`bg-slate-50 dark:bg-slate-950 border rounded-2xl p-4 text-center min-w-[120px] ${
                  remaining?.urgent ? "border-rose-500/40" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Hạn nộp bài</p>
                <p className={`text-xs font-bold ${remaining?.urgent ? "text-rose-500 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {remaining?.text}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                  {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString("vi-VN") : "Hôm nay"}
                </p>
              </div>
            </div>
             {assignment.accommodation && <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">Thời hạn hiển thị là điều chỉnh riêng đã được giáo viên áp dụng cho bạn.</p>}
          </div>
        </div>

        {/* VIEW MODE 1: GRADED OR ALREADY SUBMITTED (Result & Teacher Feedback View) */}
        {isAlreadySubmitted ? (
          <div className="space-y-6">
            {/* Graded Score Banner */}
            {isGraded ? (
              <div className="bg-gradient-to-r from-emerald-50 via-white to-emerald-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/40 border border-emerald-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm dark:shadow-2xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-emerald-500/20 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-2xl">
                      🏆
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                        Đã Hoàn Thành Chấm Điểm
                      </span>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Kết Quả Đánh Giá Bài Tập</h2>
                    </div>
                  </div>

                  <div className="text-center sm:text-right bg-white dark:bg-slate-950/70 px-5 py-3 rounded-2xl border border-emerald-500/30 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Điểm số đạt được:</span>
                    <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {assignment.score} <span className="text-base text-slate-400 dark:text-slate-500">/ {assignment.max_score}</span>
                    </span>
                  </div>
                </div>

                {(assignment.rubric || []).length > 0 && (
                  <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 dark:border-sky-900/70 dark:bg-sky-950/20">
                    <div className="mb-3"><p className="text-xs font-black uppercase tracking-wide text-sky-900 dark:text-sky-100">Kết quả theo tiêu chí</p><p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">Điểm và nhận xét riêng cho từng phần bài làm.</p></div>
                    <div className="space-y-2">{assignment.rubric.map((criterion) => {
                      const rubricScore = (assignment.rubric_scores || []).find((item) => item.criterionId === criterion.id);
                      return <div key={criterion.id} className="rounded-xl border border-sky-200 bg-white p-3 dark:border-sky-900 dark:bg-slate-950"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900 dark:text-white">{criterion.title}</p>{criterion.description && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{criterion.description}</p>}</div><b className="shrink-0 font-mono text-sm text-sky-700 dark:text-sky-200">{rubricScore?.score ?? 0}/{criterion.maxPoints}</b></div>{rubricScore?.feedback && <p className="mt-2 border-t border-sky-100 pt-2 text-xs leading-5 text-slate-600 dark:border-sky-950 dark:text-slate-300">{rubricScore.feedback}</p>}</div>;
                    })}</div>
                  </section>
                )}

                {/* Teacher Feedback Comment Box */}
                <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-emerald-500 bg-slate-100 dark:bg-slate-800">
                      <img
                        src={assignment.instructor_avatar || "/logo192.png"}
                        alt={assignment.instructor_name || "Giảng viên"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{assignment.instructor_name || "Giảng viên phụ trách"}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">✓ Giảng viên phụ trách</span>
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        Đã chấm vào ngày {assignment.graded_at ? new Date(assignment.graded_at).toLocaleDateString("vi-VN") : "-"}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-light pl-1">
                    &ldquo;{assignment.feedback_text || "Giảng viên chưa để lại nhận xét."}&rdquo;
                  </p>
                </div>
              </div>
            ) : (
              /* Submitted Pending Grading Banner */
              <div className="bg-white dark:bg-slate-900 border border-sky-500/30 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm dark:shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center justify-center text-xl">
                    ⏳
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bài Làm Đã Nộp Thành Công</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Bài làm của bạn đang trong hàng đợi chấm điểm của giảng viên. Bạn sẽ nhận được thông báo ngay khi có kết quả.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submitted Content Review Box */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-sm dark:shadow-xl">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
                Nội Dung Bài Làm Đã Nộp
              </h3>

              {/* Text submission preview */}
              {contentText && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Nội dung văn bản:
                  </span>
                  <div className="bg-slate-50 dark:bg-slate-950/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                    {contentText}
                  </div>
                </div>
              )}

              {/* Attached file preview */}
              {attachedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Ảnh & Tệp Đã Nộp ({attachedFiles.length} tệp):
                    </span>
                  </div>

                  {/* Grid gallery of submitted images */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {attachedFiles.map((item, idx) => (
                      <div key={item.id || idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/80 space-y-2">
                        {item.isImage ? (
                          <a href={item.previewUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-black/5 dark:border-slate-800 dark:bg-black/30">
                            <img src={item.previewUrl} alt={item.name} className="h-48 w-full object-contain" />
                          </a>
                        ) : (
                          <div className="h-28 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900 text-3xl">
                            📄
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <div className="truncate mr-2">
                            <p className="font-bold text-slate-900 dark:text-white truncate" title={item.name}>
                              {idx + 1}. {item.name}
                            </p>
                            {item.size > 0 && <p className="text-[10px] text-slate-400">{formatFileSize(item.size)}</p>}
                          </div>
                          <a
                            href={item.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-rose-600 dark:text-rose-400 text-xs hover:bg-slate-50"
                          >
                            {item.isImage ? "Xem ảnh" : "Mở tệp"} ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audio recording preview */}
              {audioUrl && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Bản ghi âm khẩu ngữ HSKK:
                  </span>
                  <div className="bg-slate-50 dark:bg-slate-950/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🎙️</span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Bản thu phát âm & hội thoại</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Audio Stream • Định dạng MP3/WAV</p>
                      </div>
                    </div>
                    <audio src={audioUrl} controls className="w-full h-10 rounded-lg" />
                  </div>
                </div>
              )}

              {assignment.annotations?.length > 0 && <SubmissionAnnotations readOnly items={assignment.annotations} fileUrl={fileUrl} fileName={fileName}/>}
              <SubmissionHistory submissionId={assignment.submission_id}/>
              {/* Policy note & resubmit lock */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Bài nộp được lưu cố định. Khi giáo viên yêu cầu sửa, bạn có thể nộp phiên bản mới trong hạn được cấp.</span>
                </span>
                <Link
                  to={assignmentListPath}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold"
                >
                  ← Về Danh Sách Bài Tập
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW MODE 2: SUBMIT WORKSPACE FORM */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm dark:shadow-2xl">
            {assignment.return_requested && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><b>Yêu cầu sửa bài:</b> {assignment.return_reason}<p>Hạn nộp lại: {new Date(assignment.resubmit_until).toLocaleString("vi-VN")}. Phiên bản cũ vẫn được lưu.</p><SubmissionHistory submissionId={assignment.submission_id}/></div>}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">Bài làm của bạn</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Có thể kết hợp nhiều cách nộp; nội dung ở các mục được gửi cùng nhau khi bạn bấm nộp bài.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                {contentText.trim() ? "Có văn bản" : "Chưa có văn bản"} · {attachedFiles.length} tệp
              </span>
            </div>

            {/* Tab navigation for submission methods */}
            <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 gap-2 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "text"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <span>✏️ Viết trực tiếp</span>
                {contentText.trim() && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "file"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <span>📎 Tải ảnh / tệp</span>
                {attachedFiles.length > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{attachedFiles.length}</span>}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("audio")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === "audio"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🎙️ Thu Âm Khẩu Ngữ HSKK</span>
              </button>
            </div>

            {/* TAB 1: TEXT SUBMISSION */}
            {activeTab === "text" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Nội dung bài làm trực tuyến:</label>
                  <span className="font-mono bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                    Số chữ Hán: <strong className="text-rose-600 dark:text-rose-400">{chineseCount}</strong> ký tự
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Nhập nội dung bài luận, trả lời câu hỏi bằng tiếng Trung hoặc tiếng Việt..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-sans leading-relaxed"
                />
              </div>
            )}

            {/* TAB 2: FILE ATTACHMENT WITH PROGRESS, PASTE SUPPORT & UP TO 10 PHOTOS */}
            {activeTab === "file" && (
              <div className="space-y-4">
                {/* Paste & Count Hint Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50">
                  <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <span className="text-lg">📋</span>
                    <span>
                      <strong className="text-rose-600 dark:text-rose-400">Dán ảnh cực nhanh:</strong> Bạn có thể nhấn phím <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 font-mono font-bold text-[11px] shadow-sm text-rose-600 dark:text-rose-400">Ctrl + V</kbd> để dán ảnh copy từ clipboard hoặc ảnh chụp màn hình (Snipping Tool).
                    </span>
                  </div>
                  <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 shrink-0 font-mono shadow-sm">
                    {attachedFiles.length} / {MAX_FILES} ảnh hoặc tệp
                  </span>
                </div>

                {/* Dropzone (shown when under limit) */}
                {attachedFiles.length < MAX_FILES && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Khu vực tải ảnh hoặc tệp bài làm. Nhấn Enter để mở trình chọn tệp."
                    aria-disabled={isUploadingFile}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (isUploadingFile) return;
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (!isUploadingFile && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleBatchFileUpload(Array.from(e.dataTransfer.files));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!isUploadingFile && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        document.getElementById("assignment-file-input")?.click();
                      }
                    }}
                    className={`border-2 border-dashed rounded-3xl p-6 md:p-8 text-center transition space-y-3 ${
                      dragOver ? "border-rose-500 bg-rose-500/10" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="text-slate-400 dark:text-slate-500 flex justify-center">
                      <IconUpload />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Kéo & thả ảnh bài làm hoặc tệp vào đây</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Hỗ trợ tối đa <strong>10 ảnh</strong> (JPG, PNG, WEBP) hoặc tệp PDF, Word (tối đa 25MB/tệp) • Lưu trữ an toàn trên Cloudflare R2
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${isUploadingFile ? "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800" : "cursor-pointer bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white"}`}>
                        <span>📁 Chọn tệp từ máy tính</span>
                        <input
                          type="file"
                          id="assignment-file-input"
                          multiple
                          disabled={isUploadingFile}
                          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/zip,application/x-zip-compressed,application/x-zip,.zip"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleBatchFileUpload(Array.from(e.target.files));
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                      <span className="text-xs text-slate-400 font-mono">hoặc nhấn Ctrl+V để dán</span>
                    </div>
                  </div>
                )}

                {/* Upload Progress Bar */}
                {isUploadingFile && (
                  <div
                    className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="min-w-0 truncate pr-3">{uploadStatusText || "Đang tải lên bài làm..."}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden" role="progressbar" aria-label="Tiến độ tải tệp" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
                      <div
                        className="bg-rose-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Upload Error Display */}
                {uploadError && (
                  <div className="bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 p-3 rounded-xl text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between" role="alert">
                    <span>⚠️ {uploadError}</span>
                    <button
                      type="button"
                      onClick={() => setUploadError("")}
                      aria-label="Đóng thông báo lỗi tải tệp"
                      className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Attached Files Gallery Grid */}
                {attachedFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold uppercase tracking-wider">Danh sách ảnh/tệp đã tải lên ({attachedFiles.length}/{MAX_FILES}):</span>
                      <button
                        type="button"
                        onClick={handleRemoveAllFiles}
                        disabled={isUploadingFile}
                        className="text-rose-600 hover:underline text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Xóa tất cả
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {attachedFiles.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col justify-between group hover:border-rose-400 dark:hover:border-rose-500/50 transition shadow-sm"
                        >
                          <div className="space-y-2">
                            {item.isImage ? (
                              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black/5 dark:bg-black/30 border border-slate-200/60 dark:border-slate-800 relative">
                                <img
                                  src={item.previewUrl}
                                  alt={item.name}
                                  className="w-full h-full object-contain"
                                />
                                <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">
                                  #{idx + 1}
                                </span>
                              </div>
                            ) : (
                              <div className="aspect-video w-full rounded-xl bg-slate-200/50 dark:bg-slate-900 flex items-center justify-center text-3xl">
                                <span aria-hidden="true">{fileTypeIcon(item)}</span>
                              </div>
                            )}

                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={item.name}>
                                {item.name}
                              </p>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                <span>{item.size > 0 ? formatFileSize(item.size) : "Tệp bài làm"}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Sẵn sàng</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200 dark:border-slate-800/80">
                            {item.previewUrl && (
                              <a
                                href={item.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                              >
                                {item.isImage ? "Xem ảnh" : "Mở tệp"} ↗
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(idx)}
                              disabled={isUploadingFile}
                              aria-label={`${item.isImage ? "Xóa ảnh" : "Xóa tệp"} ${item.name}`}
                              className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition ml-auto disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {item.isImage ? "Xóa ảnh" : "Xóa tệp"} ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AUDIO HSKK RECORDER */}
            {activeTab === "audio" && (
              <div className="space-y-5 bg-slate-50 dark:bg-slate-950/60 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="max-w-md mx-auto space-y-3">
                  <div
                    className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center transition shadow-lg ${
                      isRecording
                        ? "bg-rose-600 text-white animate-pulse shadow-rose-600/50"
                        : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    <IconMic />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isRecording ? "Đang Ghi Âm Khẩu Ngữ HSKK..." : "Ghi Âm Bài Nói HSKK"}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {isRecording
                        ? `Thời lượng: ${recordingSeconds} giây`
                        : "Nhấp nút bên dưới để bắt đầu thu âm câu trả lời"}
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleToggleRecord}
                      className={`px-6 py-2.5 rounded-2xl font-bold text-xs transition shadow-lg ${
                        isRecording
                          ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                      }`}
                    >
                      {isRecording ? "⏹ Dừng & Lưu Bản Ghi" : "🎙️ Bắt Đầu Ghi Âm"}
                    </button>
                  </div>
                </div>

                {/* Audio Preview Player */}
                {audioUrl && !isRecording && (
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 max-w-lg mx-auto">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Nghe lại bản thu trước khi nộp:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Bản ghi sẵn sàng</span>
                    </div>
                    <audio src={audioUrl} controls className="w-full h-10 rounded-lg" />
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-500">
                Lưu ý: Sau khi nộp, hệ thống sẽ gửi bài đến giáo viên để chấm điểm.
              </span>

              <div className="flex gap-3 w-full sm:w-auto">
                <Link
                  to={assignmentListPath}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold text-center transition"
                >
                  Quay lại
                </Link>

                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitting || isUploadingFile || (!contentText.trim() && attachedFiles.length === 0 && !audioAssetId)}
                  className="flex-1 sm:flex-none px-7 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-lg shadow-rose-600/30"
                >
                  Xác Nhận Nộp Bài →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full space-y-4 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 dark:border-rose-500/30 mx-auto flex items-center justify-center text-xl">
                📝
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Xác Nhận Nộp Bài Tập</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-light">
                Bài làm của bạn sẽ được nộp chính thức lên hệ thống LMS MOLY COURSE 2026 và không thể tự ý sửa đổi sau khi nộp.
              </p>
            </div>

            {/* Submission preview summary */}
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Văn bản bài làm:</span>
                <span className="text-slate-900 dark:text-white font-bold">{contentText ? `${chineseCount} chữ Hán` : "Không có"}</span>
              </div>
              <div className="flex justify-between">
                <span>Ảnh / Tệp đính kèm:</span>
                <span className="text-slate-900 dark:text-white font-bold">{attachedFiles.length > 0 ? `${attachedFiles.length} ảnh/tệp` : "Không có"}</span>
              </div>
              <div className="flex justify-between">
                <span>Khẩu ngữ HSKK:</span>
                <span className="text-slate-900 dark:text-white font-bold">{audioAssetId ? "1 bản ghi âm" : "Không có"}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Kiểm tra lại
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-rose-600/30"
              >
                {submitting ? "Đang Gửi..." : "Nộp Ngay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
