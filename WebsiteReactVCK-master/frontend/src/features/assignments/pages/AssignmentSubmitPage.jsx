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
  const diff = new Date(dueDate) - new Date();
  if (diff <= 0) return { text: "Đã hết hạn nộp bài", urgent: true };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return { text: `Còn ${d} ngày ${h} giờ`, urgent: d < 2 };
  return { text: `Còn ${h} giờ ${m} phút`, urgent: true };
}

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
  const [fileUrl, setFileUrl] = useState("");
  const [fileAssetId, setFileAssetId] = useState("");
  const [fileName, setFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioAssetId, setAudioAssetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // File Upload State with Progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
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

        // Check submission state
        if (currentAssignment.status === "graded" || (currentAssignment.score !== undefined && currentAssignment.score !== null)) {
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

  // Upload through a server-issued R2 URL; the submission API receives only the asset ID.
  const handleFileUpload = async (file, assetKind = "file") => {
    if (!file) return;

    const maxBytes = assetKind === "audio" ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`Kích thước tệp quá lớn! Vui lòng chọn tệp dưới ${assetKind === "audio" ? 50 : 25}MB.`);
      return;
    }

    setUploadError("");
    setIsUploadingFile(true);
    setUploadProgress(10);
    if (assetKind === "file") setFileName(file.name);
    try {
      const uploadResponse = await requestSubmissionUploadUrl({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        assetKind,
      });
      const uploadData = uploadResponse.data;
      const uploadResult = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: uploadData.headers || { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResult.ok) throw new Error("Không thể tải tệp lên kho lưu trữ");
      setUploadProgress(90);
      const confirmed = await confirmSubmissionAsset({ assetId: uploadData.assetId, mimeType: file.type, sizeBytes: file.size });
      setUploadProgress(100);
      const previewUrl = URL.createObjectURL(file);
      if (assetKind === "audio") {
        setAudioAssetId(confirmed.data.id);
        setAudioUrl(previewUrl);
      } else {
        setFileAssetId(confirmed.data.id);
        setFileUrl(previewUrl);
      }
      toast.success(`Đã tải lên tệp: ${file.name} thành công! 📎`);
    } catch (err) {
      console.error("Submission upload failed:", err);
      setUploadError(err.message || "Không thể tải tệp lên. Vui lòng thử lại.");
    } finally {
      setIsUploadingFile(false);
    }
  };

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
    if (!contentText.trim() && !fileAssetId && !audioAssetId) {
      toast.error("Vui lòng nhập nội dung bài làm, đính kèm tệp hoặc ghi âm audio HSKK!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitAssignment({
        assignmentId: id,
        contentText: contentText.trim(),
         fileAssetId,
         audioAssetId,
      });

      if (res.success) {
        setIsAlreadySubmitted(true);
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Đang nạp dữ liệu bài tập và hồ sơ nộp bài..." count={3} />
        </div>
      </div>
    );
  }

  if (errorMessage || !assignment) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex items-center justify-center p-6">
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-16">
      {/* Breadcrumb Navigation */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm dark:shadow-xl">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 dark:border-rose-500/25 text-xs font-bold rounded-full uppercase tracking-wider">
                  {assignment.type || "Bài Tập Về Nhà"}
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
              {fileUrl && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Tệp đính kèm:
                  </span>
                  <div className="bg-slate-50 dark:bg-slate-950/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{fileName || "tai-lieu-bai-lam.pdf"}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">Định dạng nộp trực tuyến</p>
                      </div>
                    </div>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                    >
                      Tải / Xem Lại
                    </a>
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

              {/* Policy note & resubmit lock */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Chính sách: Khóa chỉnh sửa bài làm sau khi đã nộp để chống trùng lặp.</span>
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
            {/* Tab navigation for submission methods */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === "text"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>✏️ Soạn Thảo Văn Bản</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === "file"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>📎 Đính Kèm Tệp</span>
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

            {/* TAB 2: FILE ATTACHMENT WITH PROGRESS */}
            {activeTab === "file" && (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files?.[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center transition space-y-3 ${
                    dragOver ? "border-rose-500 bg-rose-500/10" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="text-slate-400 dark:text-slate-500 flex justify-center">
                    <IconUpload />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Kéo và thả tệp bài làm vào đây</p>
                    <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng PDF, DOCX, ZIP hoặc ảnh (Tối đa 25MB)</p>
                  </div>
                  <div>
                    <label className="cursor-pointer inline-flex px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-white transition">
                      <span>Chọn tệp từ máy tính</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Upload Progress Bar */}
                {isUploadingFile && (
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Đang tải lên: {fileName}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Upload Error Display */}
                {uploadError && (
                  <div className="bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 p-3 rounded-xl text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between">
                    <span>⚠️ {uploadError}</span>
                    <button
                      onClick={() => setUploadError("")}
                      className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Attached File Ready */}
                {fileUrl && !isUploadingFile && (
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{fileName || "Tệp bài làm đính kèm"}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">✓ Đã sẵn sàng nộp</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFileUrl("");
                        setFileName("");
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition"
                    >
                      Xóa tệp
                    </button>
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
                  Hủy Bỏ
                </Link>

                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitting || isUploadingFile || (!contentText.trim() && !fileAssetId && !audioAssetId)}
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
                Bài làm của bạn sẽ được nộp chính thức lên hệ thống LMS CSCA Academy và không thể tự ý sửa đổi sau khi nộp.
              </p>
            </div>

            {/* Submission preview summary */}
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Văn bản bài làm:</span>
                <span className="text-slate-900 dark:text-white font-bold">{contentText ? `${chineseCount} chữ Hán` : "Không có"}</span>
              </div>
              <div className="flex justify-between">
                <span>Tệp đính kèm:</span>
                <span className="text-slate-900 dark:text-white font-bold">{fileAssetId ? fileName || "1 tệp" : "Không có"}</span>
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
