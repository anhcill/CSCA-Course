import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { requestVideoPlaybackToken, updateVideoWatchProgress } from "../../api/lmsClient";
import { formatTimeMMSS } from "../utils/videoTime";

export default function BunnyStreamPlayer({
  video,
  videos = [],
  unitId,
  unitTitle = "",
  courseId = null,
  liveClassId = null,
  initialProgress = {},
  userEmail = "",
  prevUnit = null,
  nextUnit = null,
  seekRequest = null,
  onSelectUnit,
  onProgressChange,
  onQuickNoteAtTime,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const watchedDeltaRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const heartbeatBusyRef = useRef(false);

  const partList = videos.length > 0 ? videos : video ? [video] : [];
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const activeVideo = partList[selectedPartIndex] || null;
  const assetId = activeVideo?.assetId || activeVideo?.id || null;
  const rawStatus = activeVideo?.playbackStatus || "none";
  const isPublished = activeVideo?.isPublished !== false;

  const [signedData, setSignedData] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState(null);
  const [nativePlayback, setNativePlayback] = useState(false);
  const [currentTime, setCurrentTime] = useState(Number(initialProgress?.lastPositionSeconds || 0));
  const [completionPercent, setCompletionPercent] = useState(Number(initialProgress?.completionPercent || 0));
  const [isCompleted, setIsCompleted] = useState(Boolean(initialProgress?.isCompleted));

  const durationSeconds = useMemo(() => (
    Math.max(0, Number(signedData?.durationSeconds || activeVideo?.durationSeconds || 0))
  ), [activeVideo?.durationSeconds, signedData?.durationSeconds]);

  const fetchSignedToken = useCallback(async () => {
    if (!assetId || rawStatus !== "ready" || !isPublished) {
      setSignedData(null);
      setTokenError(null);
      return;
    }

    setTokenLoading(true);
    setTokenError(null);
    try {
      const response = await requestVideoPlaybackToken(assetId, { unitId, courseId, liveClassId });
      if (!response?.success || !response.data?.embedUrl) throw new Error("Máy chủ không trả về URL phát video hợp lệ");
      setSignedData(response.data);
      const progress = response.data.watchProgress || initialProgress;
      setCurrentTime(Number(progress?.lastPositionSeconds || 0));
      setCompletionPercent(Number(progress?.completionPercent || 0));
      setIsCompleted(Boolean(progress?.isCompleted));
      lastPlaybackTimeRef.current = Number(progress?.lastPositionSeconds || 0);
    } catch (error) {
      setSignedData(null);
      setTokenError({ errorCode: error?.errorCode || "PLAYBACK_BLOCKED", message: error?.message || "Không thể cấp quyền phát video." });
    } finally {
      setTokenLoading(false);
    }
  }, [assetId, courseId, initialProgress, isPublished, liveClassId, rawStatus, unitId]);

  useEffect(() => {
    setSelectedPartIndex(0);
  }, [unitId]);

  useEffect(() => {
    fetchSignedToken();
  }, [fetchSignedToken]);

  useEffect(() => {
    if (!signedData?.expiresAt) return undefined;
    const refreshIn = Math.max(30_000, new Date(signedData.expiresAt).getTime() - Date.now() - 60_000);
    const timeout = window.setTimeout(fetchSignedToken, refreshIn);
    return () => window.clearTimeout(timeout);
  }, [fetchSignedToken, signedData?.expiresAt]);

  useEffect(() => {
    let cancelled = false;
    const player = videoRef.current;
    setNativePlayback(false);
    hlsRef.current?.destroy?.();
    hlsRef.current = null;
    if (!player || !signedData?.hlsUrl) return undefined;

    const startAt = Number(signedData.watchProgress?.lastPositionSeconds || initialProgress?.lastPositionSeconds || 0);
    const applyStart = () => {
      if (startAt > 0 && Number.isFinite(player.duration)) player.currentTime = Math.min(startAt, Math.max(0, player.duration - 1));
    };

    if (player.canPlayType("application/vnd.apple.mpegurl")) {
      player.src = signedData.hlsUrl;
      player.addEventListener("loadedmetadata", applyStart, { once: true });
      setNativePlayback(true);
      return () => player.removeEventListener("loadedmetadata", applyStart);
    }

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const instance = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = instance;
      instance.loadSource(signedData.hlsUrl);
      instance.attachMedia(player);
      instance.on(Hls.Events.MANIFEST_PARSED, applyStart);
      setNativePlayback(true);
    }).catch(() => setNativePlayback(false));

    return () => {
      cancelled = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  }, [initialProgress?.lastPositionSeconds, signedData?.hlsUrl, signedData?.watchProgress?.lastPositionSeconds]);

  const flushProgress = useCallback(async () => {
    if (!assetId || heartbeatBusyRef.current) return;
    const player = videoRef.current;
    const position = Number(player?.currentTime || currentTime || 0);
    const delta = Math.max(0, Math.floor(watchedDeltaRef.current));
    if (delta === 0 && position === 0) return;

    heartbeatBusyRef.current = true;
    watchedDeltaRef.current = 0;
    try {
      const response = await updateVideoWatchProgress(assetId, {
        unitId,
        currentTimeSeconds: Math.round(position),
        watchedDeltaSeconds: delta,
        durationSeconds: Number(player?.duration || durationSeconds || 0),
      });
      if (response?.success && response.data) {
        const progress = response.data;
        setCompletionPercent(Number(progress.completionPercent || 0));
        setIsCompleted(Boolean(progress.isCompleted));
        onProgressChange?.({
          currentTimeSeconds: Number(progress.lastPositionSeconds || position),
          watchedSeconds: Number(progress.watchedSeconds || 0),
          completionPercent: Number(progress.completionPercent || 0),
          isCompleted: Boolean(progress.isCompleted),
        });
      }
    } catch (error) {
      watchedDeltaRef.current += delta;
      if (error?.status === 401 || error?.status === 403) {
        videoRef.current?.pause?.();
        setTokenError({ errorCode: error?.errorCode || "PLAYBACK_BLOCKED", message: error?.message || "Quyền phát video đã hết hiệu lực." });
      }
    } finally {
      heartbeatBusyRef.current = false;
    }
  }, [assetId, currentTime, durationSeconds, onProgressChange, unitId]);

  useEffect(() => {
    const interval = window.setInterval(flushProgress, 10_000);
    return () => {
      window.clearInterval(interval);
      if (watchedDeltaRef.current > 0) flushProgress();
    };
  }, [flushProgress]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || !seekRequest || typeof seekRequest.seconds !== "number") return;
    player.currentTime = Math.max(0, Math.min(Number(seekRequest.seconds), Number(player.duration || durationSeconds || 0)));
    player.play().catch(() => {});
  }, [durationSeconds, seekRequest]);

  const handleTimeUpdate = () => {
    const player = videoRef.current;
    if (!player) return;
    const next = Number(player.currentTime || 0);
    const delta = next - lastPlaybackTimeRef.current;
    if (!player.seeking && !player.paused && delta > 0 && delta <= 2.5) watchedDeltaRef.current += delta;
    lastPlaybackTimeRef.current = next;
    setCurrentTime(next);
  };

  const statusPanel = (icon, title, message) => (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center text-white sm:rounded-3xl">
      {icon}
      <h3 className="text-base font-black sm:text-lg">{title}</h3>
      <p className="max-w-lg text-xs leading-5 text-slate-400">{message}</p>
    </div>
  );

  if (!activeVideo) return statusPanel(<Play className="h-9 w-9 text-slate-500" />, "Chưa có video bài giảng", "Bạn vẫn có thể xem lý thuyết, tài liệu và bài tập của buổi học này.");
  if (rawStatus === "uploading") return statusPanel(<UploadCloud className="h-9 w-9 text-sky-400" />, "Video đang được tải lên", "File video được upload trực tiếp lên Bunny Stream, không đi qua máy chủ ứng dụng.");
  if (["created", "processing"].includes(rawStatus)) return statusPanel(<Loader2 className="h-9 w-9 animate-spin text-amber-400" />, "Bunny Stream đang xử lý video", "Video sẽ tự động sẵn sàng sau khi quá trình mã hóa hoàn tất.");
  if (rawStatus === "failed") return statusPanel(<AlertTriangle className="h-9 w-9 text-red-400" />, "Không thể xử lý video", activeVideo.processingError || "Quản trị viên cần thay thế hoặc tải lại video này.");
  if (!isPublished) return statusPanel(<Lock className="h-9 w-9 text-amber-400" />, "Video chưa được phát hành", "Quản trị viên chưa mở video này cho học viên.");
  if (tokenLoading && !signedData) return statusPanel(<Loader2 className="h-9 w-9 animate-spin text-amber-400" />, "Đang xác thực quyền xem", "Hệ thống đang kiểm tra enrollment, thiết bị và quyền học.");
  if (tokenError) return statusPanel(<Lock className="h-9 w-9 text-red-400" />, tokenError.errorCode, tokenError.message);

  return (
    <div className="space-y-3">
      {partList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {partList.map((part, index) => (
            <button key={part.id || index} type="button" onClick={() => setSelectedPartIndex(index)} className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold ${selectedPartIndex === index ? "border-amber-500 bg-amber-500 text-slate-950" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}>
              {part.title || `Phần ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl sm:rounded-3xl">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          className={`h-full w-full ${nativePlayback ? "block" : "hidden"}`}
          onTimeUpdate={handleTimeUpdate}
          onPause={flushProgress}
          onEnded={flushProgress}
        />
        {!nativePlayback && (
          <iframe src={signedData?.embedUrl} title={unitTitle || "Bunny Stream video"} className="h-full w-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        )}
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/35 px-2 py-1 font-mono text-[10px] text-white/45">{signedData?.watermark?.email || userEmail}</div>
      </div>

      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:px-5">
        <div className="flex items-center gap-3">
          {isCompleted ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Clock className="h-5 w-5 text-amber-500" />}
          <div>
            <p className="font-bold text-slate-900 dark:text-white">Tiến độ đã xác nhận: {Math.round(completionPercent)}%</p>
            <p className="text-[11px] text-slate-500">Vị trí gần nhất: {formatTimeMMSS(currentTime)} · Hoàn thành khi xem đủ 85%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onQuickNoteAtTime && nativePlayback && <button type="button" onClick={() => onQuickNoteAtTime(Math.floor(videoRef.current?.currentTime || 0))} className="rounded-xl border border-amber-300 px-3 py-1.5 font-bold text-amber-700 dark:border-amber-800 dark:text-amber-300">Ghi chú tại {formatTimeMMSS(currentTime)}</button>}
          <button type="button" disabled={!prevUnit} onClick={() => prevUnit && onSelectUnit?.(prevUnit)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30 dark:border-slate-700"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" disabled={!nextUnit} onClick={() => nextUnit && onSelectUnit?.(nextUnit)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30 dark:border-slate-700"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={fetchSignedToken} className="rounded-lg border border-slate-200 p-1.5 dark:border-slate-700" title="Làm mới quyền phát"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
