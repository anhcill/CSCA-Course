import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Maximize, Minimize, RotateCcw, Video, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import { getLiveSessionAccess } from "../../api/lmsClient";
import { isJitsiMeeting } from "../utils/meetingLaunch";

const parseJitsiUrl = (meetingUrl) => {
  const url = new URL(meetingUrl);
  const roomName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (!roomName) throw new Error("Link Jitsi không có tên phòng hợp lệ.");
  return {
    domain: url.hostname,
    roomName,
    jwt: url.searchParams.get("jwt") || undefined,
  };
};

const loadJitsiApi = (domain) => new Promise((resolve, reject) => {
  if (window.JitsiMeetExternalAPI) {
    resolve(window.JitsiMeetExternalAPI);
    return;
  }

  const scriptId = "jitsi-external-api";
  const existingScript = document.getElementById(scriptId);
  if (existingScript) {
    existingScript.addEventListener("load", () => resolve(window.JitsiMeetExternalAPI), { once: true });
    existingScript.addEventListener("error", () => reject(new Error("Không thể tải trình học Jitsi.")), { once: true });
    return;
  }

  const script = document.createElement("script");
  script.id = scriptId;
  script.src = `https://${domain}/external_api.js`;
  script.async = true;
  script.onload = () => resolve(window.JitsiMeetExternalAPI);
  script.onerror = () => reject(new Error("Không thể tải trình học Jitsi."));
  document.head.appendChild(script);
});

export default function LiveClassRoomPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const meetingNodeRef = useRef(null);
  const [sessionData, setSessionData] = useState(null);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [accessError, setAccessError] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const displayName = authUser?.fullName || authUser?.name || authUser?.username || "Học viên";
  const parsedMeeting = useMemo(() => {
    if (!meetingUrl) return { config: null, error: "" };
    try {
      return { config: parseJitsiUrl(meetingUrl), error: "" };
    } catch (error) {
      return { config: null, error: error.message };
    }
  }, [meetingUrl]);
  const jitsiConfig = parsedMeeting.config;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  const handleLeave = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isTeacherRole(authUser?.role) ? "/lms/teach" : "/lms/my-learning");
    }
  }, [authUser?.role, navigate]);

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      setLoadingAccess(true);
      setAccessError("");
      try {
        const result = await getLiveSessionAccess(sessionId);
        if (!result?.success || !result?.data?.meetUrl) {
          throw new Error(result?.message || "Phòng học chưa sẵn sàng.");
        }
        if (!isJitsiMeeting(result.data.meetUrl)) {
          throw new Error("Máy chủ Jitsi này chưa được cho phép nhúng trong LMS.");
        }
        if (active) {
          setSessionData(result.data);
          setMeetingUrl(result.data.meetUrl);
          setProvider(result.data.provider || "Jitsi Meet");
        }
      } catch (error) {
        if (active) setAccessError(error.message || "Không thể kiểm tra quyền vào phòng học.");
      } finally {
        if (active) setLoadingAccess(false);
      }
    };
    loadAccess();
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!jitsiConfig || !meetingNodeRef.current) return undefined;
    let active = true;
    let api;
    setEmbedError("");

    loadJitsiApi(jitsiConfig.domain)
      .then((JitsiMeetExternalAPI) => {
        if (!active || !JitsiMeetExternalAPI || !meetingNodeRef.current) return;
        api = new JitsiMeetExternalAPI(jitsiConfig.domain, {
          roomName: jitsiConfig.roomName,
          parentNode: meetingNodeRef.current,
          width: "100%",
          height: "100%",
          ...(jitsiConfig.jwt ? { jwt: jitsiConfig.jwt } : {}),
          userInfo: { displayName },
          configOverwrite: {
            disableDeepLinking: true,
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            enableClosePage: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
        });

        // Ensure iframe has permissions for camera, microphone, display capture, autoplay
        const iframe = api.getIFrame?.();
        if (iframe) {
          iframe.setAttribute(
            "allow",
            "camera *; microphone *; display-capture *; autoplay *; clipboard-write *; screen-wake-lock *; fullscreen *"
          );
          iframe.setAttribute("allowfullscreen", "true");
        }

        api.addListener("readyToClose", handleLeave);
      })
      .catch((error) => {
        if (active) setEmbedError(error.message || "Không thể khởi tạo phòng học Jitsi.");
      });

    return () => {
      active = false;
      api?.dispose?.();
    };
  }, [displayName, handleLeave, jitsiConfig]);

  const errorMessage = accessError || parsedMeeting.error || embedError;

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 dark:bg-slate-950 text-white overflow-hidden select-none">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 dark:border-slate-800 bg-slate-950/95 dark:bg-slate-950/95 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
            <Video className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xs font-bold text-white sm:text-sm">
                {sessionData?.sessionTitle || "Phòng học trực tuyến"}
              </h1>
              <span className="hidden rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30 sm:inline-block">
                Trực tiếp
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-400">
              {sessionData?.classTitle ? `${sessionData.classTitle} · ` : ""}{provider || "Jitsi Meet"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 dark:border-slate-800 bg-white/5 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 dark:text-slate-300 transition hover:bg-white/15 dark:hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span>
          </button>

          {meetingUrl && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noreferrer"
              title="Mở trong tab riêng"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 dark:border-slate-800 bg-white/5 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 dark:text-slate-300 transition hover:bg-white/15 dark:hover:bg-slate-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mở tab riêng</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleLeave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-500 shadow-sm"
          >
            <X className="h-3.5 w-3.5" />
            <span>Rời phòng</span>
          </button>
        </div>
      </header>

      <main className="relative flex-1 w-full bg-[#101827] dark:bg-slate-950 overflow-hidden">
        {loadingAccess && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950">
            <div className="text-center">
              <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-blue-400" />
              <p className="mt-3 text-sm font-semibold text-slate-300">Đang kiểm tra quyền và chuẩn bị phòng học...</p>
            </div>
          </div>
        )}
        {errorMessage && !loadingAccess && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950 px-4">
            <div className="max-w-md rounded-2xl border border-rose-400/20 dark:border-rose-900/40 bg-rose-500/10 dark:bg-rose-950/30 p-6 text-center">
              <h2 className="text-lg font-black text-rose-200">Không thể mở phòng học</h2>
              <p className="mt-2 text-sm text-slate-300">{errorMessage}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800 px-3 py-2 text-xs font-black text-slate-900 dark:text-white transition hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Thử lại
                </button>
                {meetingUrl && (
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 dark:text-slate-300 transition hover:bg-white/10 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Mở ở tab riêng
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        <div ref={meetingNodeRef} className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0" />
      </main>
    </div>
  );
}
