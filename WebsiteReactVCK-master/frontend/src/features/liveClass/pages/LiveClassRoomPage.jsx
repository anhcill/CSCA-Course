import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RotateCcw, Video, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "../../../context/AuthContext";
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
  const [meetingUrl, setMeetingUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [accessError, setAccessError] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [loadingAccess, setLoadingAccess] = useState(true);

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
            prejoinPageEnabled: true,
          },
        });
        api.addListener("readyToClose", () => navigate(-1));
      })
      .catch((error) => {
        if (active) setEmbedError(error.message || "Không thể khởi tạo phòng học Jitsi.");
      });

    return () => {
      active = false;
      api?.dispose?.();
    };
  }, [displayName, jitsiConfig, navigate]);

  const errorMessage = accessError || parsedMeeting.error || embedError;

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
            <Video className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black sm:text-base">Phòng học trực tuyến</h1>
            <p className="truncate text-xs text-slate-400">{provider || "Đang kiểm tra quyền truy cập..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {meetingUrl && (
            <a href={meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10">
              <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Mở ở tab riêng</span><span className="sm:hidden">Mở riêng</span>
            </a>
          )}
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900 transition hover:bg-slate-200">
            <X className="h-3.5 w-3.5" /> Rời phòng
          </button>
        </div>
      </header>

      <main className="relative min-h-[32rem] flex-1 bg-[#101827] sm:min-h-[38rem]">
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
            <div className="max-w-md rounded-2xl border border-rose-400/20 bg-rose-500/10 p-6 text-center">
              <h2 className="text-lg font-black">Không thể mở phòng học</h2>
              <p className="mt-2 text-sm text-slate-300">{errorMessage}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900">
                  <RotateCcw className="h-3.5 w-3.5" /> Thử lại
                </button>
                {meetingUrl && <a href={meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold"><ExternalLink className="h-3.5 w-3.5" /> Mở ở tab riêng</a>}
              </div>
            </div>
          </div>
        )}
        <div ref={meetingNodeRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
      </main>
    </div>
  );
}
