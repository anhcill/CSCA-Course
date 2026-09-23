/* eslint-disable react/prop-types */
import { useState } from "react";
import toast from "react-hot-toast";
import {
  requestVideoUploadUrl,
  confirmVideoAsset,
} from "../../api/lmsClient";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024;

export default function VideoUploader({ onVideoUploaded }) {
  const [file, setFile] = useState(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedAsset, setUploadedAsset] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const selectFile = (selected) => {
    if (!selected) return;
    if (!ALLOWED_VIDEO_TYPES.has(selected.type)) {
      setErrorMsg("Vui lòng chọn MP4, MKV, MOV hoặc WEBM");
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_VIDEO_SIZE_BYTES) {
      setErrorMsg("Video phải lớn hơn 0 và không vượt quá 1GB");
      return;
    }
    setFile(selected);
    setUploadedAsset(null);
    setErrorMsg("");
    if (!videoTitle) {
      setVideoTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleFileChange = (e) => selectFile(e.target.files[0]);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartUpload = async () => {
    if (!file) {
      setErrorMsg("Chưa chọn file video");
      return;
    }
    if (!videoTitle.trim() || videoTitle.trim().length > 255) {
      setErrorMsg("Tiêu đề video không được trống và không quá 255 ký tự");
      return;
    }

    setUploading(true);
    setProgress(10);
    setErrorMsg("");

    try {
      // 1. Request presigned upload URL from backend
      const presignedRes = await requestVideoUploadUrl({
        filename: file.name,
        mimeType: file.type || "video/mp4",
        sizeBytes: file.size,
      });

      if (!presignedRes.success || !presignedRes.data) {
        throw new Error(presignedRes.message || "Không lấy được link upload R2");
      }

      const { uploadUrl, fileKey, headers = {} } = presignedRes.data;
      setProgress(40);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`R2 từ chối upload (${uploadResponse.status})`);
      setProgress(90);

      // Confirm metadata only after the private object upload succeeds.
      const confirmRes = await confirmVideoAsset({
        title: videoTitle.trim(),
        r2Key: fileKey,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSeconds: 0,
      });

      if (!confirmRes.success || !confirmRes.data) throw new Error(confirmRes.message || "Không thể xác nhận video");
      setProgress(100);
      setUploadedAsset(confirmRes.data);
      toast.success("Upload video bài giảng lên Cloudflare R2 thành công! 🎥");
      if (onVideoUploaded) onVideoUploaded(confirmRes.data);
      setUploading(false);
    } catch (err) {
      console.error("Upload error:", err);
      setErrorMsg(err.message || "Xảy ra lỗi trong quá trình upload video");
      toast.error("Lỗi khi tải video lên R2!");
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-slate-900 dark:text-white space-y-6 shadow-sm">
      <h3 className="text-xl font-bold flex items-center gap-2">
        <span>📹</span>
        <span>Upload Video Bài Giảng Lên Cloudflare R2</span>
      </h3>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 p-3 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      {/* Video Title Input */}
      <div>
        <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">Tiêu Đề Video</label>
        <input
          id="video-title-input"
          type="text"
          placeholder="Nhập tiêu đề video bài giảng..."
          value={videoTitle}
          onChange={(e) => setVideoTitle(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 text-slate-900 dark:text-white"
        />
      </div>

      {/* File Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${
          file ? "border-rose-500/50 bg-rose-500/5" : "border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-700"
        }`}
      >
        <input
          id="video-file-input"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {file ? (
          <div className="space-y-2">
            <div className="text-4xl">🎬</div>
            <p className="font-semibold text-rose-500 dark:text-rose-400">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <button
              onClick={() => setFile(null)}
              className="text-xs text-slate-500 dark:text-slate-400 underline hover:text-slate-700 dark:hover:text-slate-200 mt-2"
            >
              Chọn file khác
            </button>
          </div>
        ) : (
          <label htmlFor="video-file-input" className="cursor-pointer space-y-2 block">
            <div className="text-4xl text-slate-400 dark:text-slate-600">☁️</div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Kéo thả file video vào đây hoặc <span className="text-rose-500 dark:text-rose-400 underline">duyệt chọn file</span></p>
            <p className="text-xs text-slate-500">Hỗ trợ định dạng MP4, MKV, MOV, WEBM (Tải thẳng lên R2 Private Bucket)</p>
          </label>
        )}
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-600 dark:text-slate-400">Đang tải lên Cloudflare R2...</span>
            <span className="text-rose-500 dark:text-rose-400">{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
            <div
              className="bg-gradient-to-r from-rose-600 to-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Upload Button */}
      {file && !uploadedAsset && !uploading && (
        <button
          id="start-upload-btn"
          onClick={handleStartUpload}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-rose-600/20"
        >
          Bắt Đầu Upload R2
        </button>
      )}

      {/* Success State & Preview */}
      {uploadedAsset && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between text-emerald-400 font-bold text-sm">
            <span>✅ Upload Video Thành Công!</span>
            <span className="text-xs font-mono bg-emerald-500/20 px-2 py-0.5 rounded">R2 Ready</span>
          </div>
          <div className="text-xs text-slate-400 space-y-1 font-mono">
            <p>R2 Key: {uploadedAsset.r2_key}</p>
            <p>Title: {uploadedAsset.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
