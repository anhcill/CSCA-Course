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
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { requestVideoPlaybackToken, updateVideoWatchProgress } from "../../api/lmsClient";
import { formatTimeMMSS } from "../utils/videoTime";

const REQUIRED_WATCH_PERCENT = 60;

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
  onDurationDetected,
  onQuickNoteAtTime,
}) {
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const hlsRef = useRef(null);
  const watchedDeltaRef = useRef(0);
  const baseWatchedSecondsRef = useRef(Number(initialProgress?.watchedSeconds || 0));
  const lastPlaybackTimeRef = useRef(Number(initialProgress?.lastPositionSeconds || 0));
  const lastWallTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  const heartbeatBusyRef = useRef(false);

  const partList = useMemo(() => (videos.length > 0 ? videos : video ? [video] : []), [video, videos]);
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const activeVideo = partList[selectedPartIndex] || null;
  const assetId = activeVideo?.assetId || activeVideo?.id || null;
  const rawStatus = activeVideo?.playbackStatus || "none";
  const isPublished = activeVideo?.isPublished !== false;

  const [signedData, setSignedData] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState(null);
  const [nativePlayback, setNativePlayback] = useState(false);
  const [detectedDuration, setDetectedDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(Number(initialProgress?.lastPositionSeconds || 0));
  const [watchedSeconds, setWatchedSeconds] = useState(Number(initialProgress?.watchedSeconds || 0));
  const [completionPercent, setCompletionPercent] = useState(Number(initialProgress?.completionPercent || 0));
  const [unitDurationSeconds, setUnitDurationSeconds] = useState(Number(initialProgress?.durationSeconds || 0));
  const [partCompletionPercent, setPartCompletionPercent] = useState(Number(activeVideo?.watchProgress?.completionPercent || 0));
  const [isCompleted, setIsCompleted] = useState(
    Boolean(initialProgress?.isVideoCompleted ?? initialProgress?.isCompleted),
  );
  const [saveStatus, setSaveStatus] = useState("saved");

  const durationSeconds = useMemo(() => (
    Math.max(
      0,
      Number(detectedDuration || signedData?.durationSeconds || activeVideo?.durationSeconds || 0),
    )
  ), [activeVideo?.durationSeconds, detectedDuration, signedData?.durationSeconds]);

  const reportDurationIfValid = useCallback((rawDuration) => {
    const clean = Math.round(Number(rawDuration || 0));
    if (clean > 0 && Number.isFinite(clean)) {
      setDetectedDuration((prev) => (prev !== clean ? clean : prev));
      onDurationDetected?.(unitId, clean);
    }
  }, [onDurationDetected, unitId]);

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
      if (!response?.success || !response.data?.embedUrl) {
        throw new Error("Máy chủ không trả về URL phát video hợp lệ");
      }
      setSignedData(response.data);
      if (Number(response.data?.durationSeconds || 0) > 0) {
        reportDurationIfValid(response.data.durationSeconds);
      }
      const partProgress = response.data.watchProgress || activeVideo?.watchProgress || {};
      const unitProgress = response.data.unitProgress || initialProgress;
      const initPos = Number(partProgress?.lastPositionSeconds || 0);
      const initPartWatched = Number(partProgress?.watchedSeconds || 0);
      const initPartPercent = Number(partProgress?.completionPercent || 0);
      const initUnitWatched = Number(unitProgress?.watchedSeconds || 0);
      const initUnitPercent = Number(unitProgress?.completionPercent || 0);
      const initDone = Boolean(unitProgress?.isCompleted ?? unitProgress?.isVideoCompleted);

      setCurrentTime(initPos);
      setWatchedSeconds(initUnitWatched);
      setCompletionPercent(initUnitPercent);
      setUnitDurationSeconds(Number(unitProgress?.durationSeconds || initialProgress?.durationSeconds || 0));
      setPartCompletionPercent(initPartPercent);
      setIsCompleted(initDone);
      baseWatchedSecondsRef.current = initPartWatched;
      watchedDeltaRef.current = 0;
      lastPlaybackTimeRef.current = initPos;
      lastWallTimeRef.current = performance.now();
    } catch (error) {
      setSignedData(null);
      setTokenError({
        errorCode: error?.errorCode || "PLAYBACK_BLOCKED",
        message: error?.message || "Không thể cấp quyền phát video.",
      });
    } finally {
      setTokenLoading(false);
    }
  }, [activeVideo?.watchProgress, assetId, courseId, initialProgress, isPublished, liveClassId, rawStatus, reportDurationIfValid, unitId]);

  useEffect(() => {
    setSelectedPartIndex(0);
    setDetectedDuration(0);
    watchedDeltaRef.current = 0;
    const firstPartProgress = partList[0]?.watchProgress || {};
    const initWatched = Number(initialProgress?.watchedSeconds || 0);
    const initPartWatched = Number(firstPartProgress?.watchedSeconds || 0);
    const initPos = Number(firstPartProgress?.lastPositionSeconds || initialProgress?.lastPositionSeconds || 0);
    const initPercent = Number(initialProgress?.completionPercent || 0);
    baseWatchedSecondsRef.current = initPartWatched;
    lastPlaybackTimeRef.current = initPos;
    lastWallTimeRef.current = performance.now();
    setCurrentTime(initPos);
    setWatchedSeconds(initWatched);
    setCompletionPercent(initPercent);
    setUnitDurationSeconds(Number(initialProgress?.durationSeconds || 0));
    setPartCompletionPercent(Number(partList[0]?.watchProgress?.completionPercent || 0));
    setIsCompleted(Boolean(initialProgress?.isVideoCompleted ?? initialProgress?.isCompleted));
    setSaveStatus("saved");
  }, [unitId, partList, initialProgress?.watchedSeconds, initialProgress?.lastPositionSeconds, initialProgress?.completionPercent, initialProgress?.durationSeconds, initialProgress?.isCompleted, initialProgress?.isVideoCompleted]);

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

    const fallbackToEmbed = () => {
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
      player.pause();
      player.removeAttribute("src");
      player.load();
      setNativePlayback(false);
    };

    const startAt = Number(signedData.watchProgress?.lastPositionSeconds || initialProgress?.lastPositionSeconds || 0);
    const applyStart = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        reportDurationIfValid(player.duration);
        if (startAt > 0) {
          player.currentTime = Math.min(startAt, Math.max(0, player.duration - 1));
          lastPlaybackTimeRef.current = player.currentTime;
        }
      }
    };

    if (player.canPlayType("application/vnd.apple.mpegurl")) {
      player.src = signedData.hlsUrl;
      const handleNativeReady = () => {
        applyStart();
        setNativePlayback(true);
      };
      player.addEventListener("loadedmetadata", handleNativeReady, { once: true });
      player.addEventListener("error", fallbackToEmbed, { once: true });
      return () => {
        player.removeEventListener("loadedmetadata", handleNativeReady);
        player.removeEventListener("error", fallbackToEmbed);
      };
    }

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const instance = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = instance;
      instance.loadSource(signedData.hlsUrl);
      instance.attachMedia(player);
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        applyStart();
        setNativePlayback(true);
      });
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) fallbackToEmbed();
      });
    }).catch(() => setNativePlayback(false));

    return () => {
      cancelled = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  }, [initialProgress?.lastPositionSeconds, reportDurationIfValid, signedData?.hlsUrl, signedData?.watchProgress?.lastPositionSeconds]);

  const flushProgress = useCallback(async ({ keepalive = false } = {}) => {
    if (!assetId || heartbeatBusyRef.current) return;
    const player = videoRef.current;
    const position = Number(player?.currentTime || lastPlaybackTimeRef.current || 0);
    const resolvedDuration = Math.round(Number(player?.duration || durationSeconds || 0));
    const delta = Math.max(0, Math.floor(watchedDeltaRef.current));
    if (delta === 0 && position === 0) return;

    heartbeatBusyRef.current = true;
    watchedDeltaRef.current = Math.max(0, watchedDeltaRef.current - delta);
    setSaveStatus("saving");
    try {
      const response = await updateVideoWatchProgress(assetId, {
        unitId,
        currentTimeSeconds: Math.round(position),
        watchedDeltaSeconds: delta,
        durationSeconds: resolvedDuration,
      }, { keepalive });
      if (response?.success && response.data) {
        const progress = response.data;
        const unitProgress = progress.unitProgress || progress;
        const serverPartWatched = Number(progress.watchedSeconds || 0);
        const serverPartPercent = Number(progress.completionPercent || 0);
        const serverWatched = Number(unitProgress.watchedSeconds || serverPartWatched);
        const serverPercent = Number(unitProgress.completionPercent || 0);
        const serverDone = Boolean(unitProgress.isCompleted);

        baseWatchedSecondsRef.current = serverPartWatched;
        setWatchedSeconds(Math.round(serverWatched));
        setCompletionPercent(serverPercent);
        setUnitDurationSeconds(Number(unitProgress.durationSeconds || 0));
        setPartCompletionPercent(serverPartPercent);
        setIsCompleted(serverDone);
        setSaveStatus("saved");

        if (Number(progress.durationSeconds || resolvedDuration) > 0) {
          reportDurationIfValid(progress.durationSeconds || resolvedDuration);
        }

        onProgressChange?.({
          unitId,
          currentTimeSeconds: Number(progress.lastPositionSeconds || position),
          watchedSeconds: serverWatched,
          durationSeconds: Number(unitProgress.durationSeconds || progress.durationSeconds || resolvedDuration || 0),
          completionPercent: serverPercent,
          isCompleted: serverDone,
        });
      }
    } catch (error) {
      watchedDeltaRef.current += delta;
      setSaveStatus("error");
      if (error?.status === 401 || error?.status === 403) {
        videoRef.current?.pause?.();
        setTokenError({
          errorCode: error?.errorCode || "PLAYBACK_BLOCKED",
          message: error?.message || "Quyền phát video đã hết hiệu lực.",
        });
      }
    } finally {
      heartbeatBusyRef.current = false;
    }
  }, [assetId, durationSeconds, onProgressChange, reportDurationIfValid, unitId]);

  useEffect(() => {
    const interval = window.setInterval(flushProgress, 8_000);
    return () => {
      window.clearInterval(interval);
      if (watchedDeltaRef.current >= 1) flushProgress();
    };
  }, [flushProgress]);

  useEffect(() => {
    const flushBeforeLeaving = () => {
      if (watchedDeltaRef.current >= 1) flushProgress({ keepalive: true });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushBeforeLeaving();
    };
    window.addEventListener("pagehide", flushBeforeLeaving);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushBeforeLeaving);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [flushProgress]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || !seekRequest || typeof seekRequest.seconds !== "number") return;
    isSeekingRef.current = true;
    const nextTarget = Math.max(0, Math.min(Number(seekRequest.seconds), Number(player.duration || durationSeconds || 0)));
    player.currentTime = nextTarget;
    lastPlaybackTimeRef.current = nextTarget;
    lastWallTimeRef.current = performance.now();
    player.play().catch(() => {});
  }, [durationSeconds, seekRequest]);

  // Verified anti-seek continuous playback tracker (works for both <video> and Bunny Stream Player.js <iframe>)
  const recordContinuousPlayback = useCallback((nextPositionSeconds, mediaDurationSeconds = 0, playbackRate = 1) => {
    const next = Math.max(0, Number(nextPositionSeconds || 0));
    const now = performance.now();
    const mediaDelta = next - lastPlaybackTimeRef.current;
    const wallDelta = lastWallTimeRef.current > 0 ? (now - lastWallTimeRef.current) / 1000 : 0;

    const effectiveDuration = Math.max(0, Number(mediaDurationSeconds || durationSeconds || 0));
    if (effectiveDuration > 0) {
      reportDurationIfValid(effectiveDuration);
    }

    // Anti-seek verification:
    // Only credit watch time when playback moves forward continuously (0 < mediaDelta <= 2.5s)
    // and never credit more than real wall-clock elapsed time * playbackRate.
    if (!isSeekingRef.current && mediaDelta > 0 && mediaDelta <= 2.5) {
      const safeRate = Math.min(Math.max(Number(playbackRate) || 1, 0.5), 2);
      const maxWallCredit = wallDelta > 0 ? Math.min(2.5, wallDelta * safeRate * 1.25 + 0.15) : mediaDelta;
      const creditedDelta = Math.max(0, Math.min(mediaDelta, maxWallCredit));
      watchedDeltaRef.current += creditedDelta;

      const optimisticWatched = effectiveDuration > 0
        ? Math.min(effectiveDuration, baseWatchedSecondsRef.current + watchedDeltaRef.current)
        : baseWatchedSecondsRef.current + watchedDeltaRef.current;

      const optimisticPartPercent = effectiveDuration > 0
        ? Math.min(100, Number(((optimisticWatched / effectiveDuration) * 100).toFixed(2)))
        : partCompletionPercent;

      // Unit/course progress is server-authoritative, especially for multi-part lessons.
      setPartCompletionPercent((prev) => Math.max(prev, optimisticPartPercent));
      setSaveStatus("pending");
    }

    lastPlaybackTimeRef.current = next;
    lastWallTimeRef.current = now;
    setCurrentTime(next);
  }, [durationSeconds, partCompletionPercent, reportDurationIfValid]);

  const handleTimeUpdate = () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.seeking || player.paused) {
      lastPlaybackTimeRef.current = Number(player.currentTime || 0);
      lastWallTimeRef.current = performance.now();
      setCurrentTime(Number(player.currentTime || 0));
      return;
    }
    recordContinuousPlayback(player.currentTime, player.duration, player.playbackRate || 1);
  };

  const handleLoadedMetadata = () => {
    const player = videoRef.current;
    if (!player) return;
    if (Number.isFinite(player.duration) && player.duration > 0) {
      reportDurationIfValid(player.duration);
    }
  };

  const handleSeeking = () => {
    isSeekingRef.current = true;
    const player = videoRef.current;
    if (player) {
      lastPlaybackTimeRef.current = Number(player.currentTime || 0);
      lastWallTimeRef.current = performance.now();
      setCurrentTime(Number(player.currentTime || 0));
    }
  };

  const handleSeeked = () => {
    const player = videoRef.current;
    if (player) {
      lastPlaybackTimeRef.current = Number(player.currentTime || 0);
      lastWallTimeRef.current = performance.now();
      setCurrentTime(Number(player.currentTime || 0));
    }
    isSeekingRef.current = false;
  };

  // Listen to Bunny Stream <iframe> Player.js postMessage events when native HLS is not active
  useEffect(() => {
    if (nativePlayback || !signedData?.embedUrl) return undefined;
    const iframeOrigin = new URL(signedData.embedUrl).origin;

    const subscribeIframeEvents = () => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      ["ready", "timeupdate", "play", "pause", "ended", "seeking", "seeked"].forEach((evt) => {
        win.postMessage(JSON.stringify({ context: "player.js", method: "addEventListener", value: evt }), iframeOrigin);
      });
      win.postMessage(JSON.stringify({ context: "player.js", method: "getDuration" }), iframeOrigin);
    };

    const handleMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== iframeOrigin) return;
      if (!event?.data) return;
      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || (payload.context && payload.context !== "player.js")) return;

      const evtName = payload.event || payload.method;
      const val = payload.value;

      if (evtName === "ready") {
        subscribeIframeEvents();
        if (val && typeof val === "object" && Number(val.duration) > 0) {
          reportDurationIfValid(val.duration);
        }
      } else if (evtName === "getDuration" && Number(val) > 0) {
        reportDurationIfValid(val);
      } else if (evtName === "seeking") {
        isSeekingRef.current = true;
        if (val && typeof val === "object" && Number.isFinite(Number(val.seconds ?? val.currentTime))) {
          const sec = Number(val.seconds ?? val.currentTime);
          lastPlaybackTimeRef.current = sec;
          lastWallTimeRef.current = performance.now();
          setCurrentTime(sec);
        }
      } else if (evtName === "seeked") {
        if (val && typeof val === "object" && Number.isFinite(Number(val.seconds ?? val.currentTime))) {
          const sec = Number(val.seconds ?? val.currentTime);
          lastPlaybackTimeRef.current = sec;
          lastWallTimeRef.current = performance.now();
          setCurrentTime(sec);
        }
        isSeekingRef.current = false;
      } else if (evtName === "timeupdate" && val && typeof val === "object") {
        const sec = Number(val.seconds ?? val.currentTime ?? 0);
        const dur = Number(val.duration ?? durationSeconds ?? 0);
        recordContinuousPlayback(sec, dur, 1);
      } else if (evtName === "pause" || evtName === "ended") {
        flushProgress();
      }
    };

    window.addEventListener("message", handleMessage);
    const timer = window.setTimeout(subscribeIframeEvents, 1200);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timer);
    };
  }, [durationSeconds, flushProgress, nativePlayback, recordContinuousPlayback, reportDurationIfValid, signedData?.embedUrl]);

  const statusPanel = (icon, title, message) => (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center text-white sm:rounded-3xl">
      {icon}
      <h3 className="text-base font-black sm:text-lg">{title}</h3>
      <p className="max-w-lg text-xs leading-5 text-slate-400">{message}</p>
    </div>
  );

  if (!activeVideo) return statusPanel(<Play className="h-9 w-9 text-slate-500" />, "Chưa có video bài giảng", "Bạn vẫn có thể xem lý thuyết, tài liệu và bài tập của buổi học này.");
  if (rawStatus === "uploading") return statusPanel(<UploadCloud className="h-9 w-9 text-sky-400" />, "Video đang được tải lên", "Bài giảng đang được chuẩn bị, bạn vui lòng quay lại sau nhé.");
  if (["created", "processing"].includes(rawStatus)) return statusPanel(<Loader2 className="h-9 w-9 animate-spin text-amber-400" />, "Video đang được xử lý", "Video sẽ tự động sẵn sàng sau khi quá trình chuẩn bị hoàn tất.");
  if (rawStatus === "failed") return statusPanel(<AlertTriangle className="h-9 w-9 text-red-400" />, "Không thể xử lý video", activeVideo.processingError || "Quản trị viên cần thay thế hoặc tải lại video này.");
  if (!isPublished) return statusPanel(<Lock className="h-9 w-9 text-amber-400" />, "Video chưa được phát hành", "Quản trị viên chưa mở video này cho học viên.");
  if (tokenLoading && !signedData) return statusPanel(<Loader2 className="h-9 w-9 animate-spin text-amber-400" />, "Đang chuẩn bị bài giảng", "Hệ thống đang kiểm tra quyền xem và thiết bị của bạn.");
  if (tokenError) return statusPanel(<Lock className="h-9 w-9 text-red-400" />, "Chưa thể mở video", tokenError.message);

  const clampedPercent = Math.min(100, Math.max(0, Math.round(completionPercent)));
  const requiredSeconds = unitDurationSeconds > 0 ? Math.ceil(unitDurationSeconds * (REQUIRED_WATCH_PERCENT / 100)) : 0;

  return (
    <div className="space-y-3">
      {partList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {partList.map((part, index) => (
            <button
              key={part.id || index}
              type="button"
              onClick={() => setSelectedPartIndex(index)}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                selectedPartIndex === index
                  ? "border-amber-500 bg-amber-500 text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
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
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onSeeked={handleSeeked}
          onPlay={() => {
            lastWallTimeRef.current = performance.now();
          }}
          onPause={() => flushProgress()}
          onEnded={() => flushProgress()}
        />
        {!nativePlayback && (
          <iframe
            ref={iframeRef}
            src={signedData?.embedUrl}
            title={unitTitle || "Video bài giảng"}
            className="h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/35 px-2 py-1 font-mono text-[10px] text-white/45">
          {signedData?.watermark?.email || userEmail}
        </div>
      </div>

      {/* Learning progress and next-lesson target */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 text-xs shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 sm:px-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                isCompleted
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-500"
              }`}
            >
              {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  Tiến độ xem bài: {clampedPercent}%
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {isCompleted ? "Đã sẵn sàng học bài tiếp" : `Mục tiêu ${REQUIRED_WATCH_PERCENT}%`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Đã ghi nhận:{" "}
                <strong className="font-bold text-slate-700 dark:text-slate-200">
                  {formatTimeMMSS(watchedSeconds)}
                </strong>
                {unitDurationSeconds > 0 && (
                  <>
                    {" / "}
                    <strong className="font-bold text-slate-700 dark:text-slate-200">
                      {formatTimeMMSS(unitDurationSeconds)}
                    </strong>
                    {" "}
                    (Mục tiêu: {formatTimeMMSS(requiredSeconds)})
                  </>
                )}
                {" · "}Vị trí phát: {formatTimeMMSS(currentTime)}
              </p>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                {partList.length > 1 && `Phần ${selectedPartIndex + 1}/${partList.length}: ${Math.round(partCompletionPercent)}% · `}
                {saveStatus === "saving" && "Đang lưu tiến độ..."}
                {saveStatus === "pending" && "Tiến độ mới sẽ được lưu tự động"}
                {saveStatus === "error" && "Chưa lưu được, hệ thống sẽ thử lại"}
                {saveStatus === "saved" && "Tiến độ đã được lưu"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onQuickNoteAtTime && (
              <button
                type="button"
                onClick={() => onQuickNoteAtTime(Math.floor(videoRef.current?.currentTime || currentTime || 0))}
                className="rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-1.5 font-bold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                + Ghi chú tại {formatTimeMMSS(currentTime)}
              </button>
            )}
            <button
              type="button"
              disabled={!prevUnit}
              onClick={() => prevUnit && onSelectUnit?.(prevUnit)}
              title={prevUnit ? `Buổi trước: ${prevUnit.title}` : "Không có buổi trước"}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600 transition hover:border-amber-400 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Bài trước</span>
            </button>
            <button
              type="button"
              disabled={!nextUnit}
              onClick={() => nextUnit && onSelectUnit?.(nextUnit)}
              title={
                nextUnit
                  ? nextUnit.isLocked
                    ? nextUnit.lockReason || `Xem khoảng ${REQUIRED_WATCH_PERCENT}% video và hoàn thành bài trắc nghiệm để tiếp tục nhé`
                    : `Buổi tiếp theo: ${nextUnit.title}`
                  : "Đã ở buổi cuối"
              }
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 font-bold transition disabled:opacity-30 ${
                nextUnit?.isLocked
                  ? "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400"
                  : "border-slate-200 text-slate-700 hover:border-amber-400 dark:border-slate-700 dark:text-slate-200"
              }`}
            >
              {nextUnit?.isLocked && <Lock className="h-3.5 w-3.5 text-amber-500" />}
              <span className="hidden sm:inline">Bài tiếp</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={fetchSignedToken}
              className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:border-amber-400 hover:text-amber-500 dark:border-slate-700 dark:text-slate-400"
              title="Làm mới quyền phát"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Visual learning progress with the next-lesson target */}
        <div className="mt-3.5 space-y-1.5">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400"
              }`}
              style={{ width: `${clampedPercent}%` }}
            />
            {/* Next-lesson target marker */}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-slate-900/60 dark:bg-white/70"
              style={{ left: `${REQUIRED_WATCH_PERCENT}%` }}
              title={`Mục tiêu ${REQUIRED_WATCH_PERCENT}% để tiếp tục bài tiếp theo`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            <span>0%</span>
            <span className="text-amber-600 dark:text-amber-400 text-center line-clamp-1 sm:line-clamp-none mx-2 truncate sm:overflow-visible">
              Tiến độ tự động lưu để bạn học thuận tiện
            </span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
