/* eslint-disable react/prop-types */
import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { fetchMyLiveSchedule, getLiveSessionAccess } from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";

/* ── SVG Icons ───────────────────────────────────────────────── */
const IconVideo = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const IconClock = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
  </svg>
);
const IconUsers = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconCalendar = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const IconList = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const IconGrid = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconLock = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

/* ── Helpers & Constants ─────────────────────────────────────── */
function getSessionStatus(s) {
  const now = Date.now();
  const start = new Date(s.start_time).getTime();
  const end = new Date(s.end_time).getTime();
  if (s.status === "live" || (now >= start && now <= end)) return "LIVE";
  if (now > end) return "ENDED";
  if (start - now <= 15 * 60 * 1000) return "IMMINENT"; // Starting in <= 15 mins (eligible to join)
  if (start - now <= 60 * 60 * 1000) return "STARTING"; // Starting in 1 hour
  if (new Date(s.start_time).toDateString() === new Date().toDateString()) return "TODAY";
  return "UPCOMING";
}

const STATUS_CFG = {
  LIVE:     { label: "ĐANG LIVE",       cls: "bg-rose-500/20 text-rose-400 border-rose-500/40", dot: true },
  IMMINENT: { label: "SẮP BẮT ĐẦU",    cls: "bg-amber-500/20 text-amber-400 border-amber-500/40", dot: true },
  STARTING: { label: "HÔM NAY (1H TỚI)", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  TODAY:    { label: "HÔM NAY",         cls: "bg-sky-500/20 text-sky-400 border-sky-500/40" },
  UPCOMING: { label: "SẮP TỚI",         cls: "bg-slate-700/40 text-slate-300 border-slate-600/40" },
  ENDED:    { label: "ĐÃ KẾT THÚC",     cls: "bg-slate-800/60 text-slate-500 border-slate-700/40" },
};

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const FILTERS = [
  { id: "ALL",   label: "Tất Cả Buổi Học" },
  { id: "LIVE",  label: "Đang Live 🔴" },
  { id: "TODAY", label: "Hôm Nay" },
  { id: "WEEK",  label: "Tuần Này" },
];

export default function LiveClassSchedulePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("list");
  const [countdown, setCountdown] = useState(null);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetchMyLiveSchedule();
      if (res.success && res.data) {
        setSessions(res.data);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error("Error loading live schedule:", err);
      setErrorMessage("Không thể nạp lịch học trực tuyến. Vui lòng kiểm tra lại kết nối mạng!");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Live countdown to nearest upcoming session
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const next = sessions
        .filter((s) => new Date(s.start_time).getTime() > now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

      if (!next) {
        setCountdown(null);
        return;
      }

      const diff = new Date(next.start_time).getTime() - now;
      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      setCountdown({
        title: next.title,
        hours: Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sessions]);

  // Handle student clicking Join Meeting
  const handleJoin = async (session) => {
    const status = getSessionStatus(session);
    if (status === "ENDED") {
      toast("Buổi học này đã kết thúc.");
      return;
    }

    const start = new Date(session.start_time).getTime();
    const now = Date.now();
    // Check if within 15 minutes window
    if (start - now > 15 * 60 * 1000) {
      toast("🔒 Phòng học chỉ mở trước giờ học 15 phút. Bạn vui lòng quay lại sau nhé!", {
        icon: "⏰",
      });
      return;
    }

    try {
      const r = await getLiveSessionAccess(session.id);
      if (r.success && r.data?.meetUrl) {
        const provider = r.data.provider || "Google Meet";
        toast.success(`Đang chuyển hướng vào phòng học ${provider}... 🚀`);
        window.open(r.data.meetUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Chưa có link phòng học hoặc bạn chưa ghi danh vào lớp này!");
      }
    } catch {
      toast.error("Lỗi khi kết nối phòng học trực tuyến!");
    }
  };

  const enriched = useMemo(() => sessions.map((s) => ({ ...s, _st: getSessionStatus(s) })), [sessions]);

  const filtered = useMemo(() => {
    if (filter === "LIVE") return enriched.filter((s) => s._st === "LIVE");
    if (filter === "TODAY") {
      const todayStr = new Date().toDateString();
      return enriched.filter((s) => new Date(s.start_time).toDateString() === todayStr);
    }
    if (filter === "WEEK") {
      const now = new Date();
      const ws = new Date(now);
      ws.setDate(now.getDate() - now.getDay());
      const we = new Date(ws);
      we.setDate(ws.getDate() + 7);
      return enriched.filter((s) => {
        const d = new Date(s.start_time);
        return d >= ws && d < we;
      });
    }
    return enriched;
  }, [enriched, filter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    live: enriched.filter((s) => s._st === "LIVE").length,
    done: enriched.filter((s) => s._st === "ENDED").length,
    upcoming: enriched.filter((s) => !["ENDED", "LIVE"].includes(s._st)).length,
  }), [enriched, sessions.length]);

  const calGrid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => []);
    filtered.forEach((s) => g[new Date(s.start_time).getDay()].push(s));
    return g;
  }, [filtered]);

  // Session Card Component
  const SessionCard = ({ s }) => {
    const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
    const isLive = s._st === "LIVE";
    const isImminent = s._st === "IMMINENT";
    const isEnded = s._st === "ENDED";
    const provider = s.provider || "Google Meet";
    const cap = s.capacity || s.max_students || 30;
    const enrolled = s.enrolled_count || 0;
    const dur = s.start_time && s.end_time ? Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000) : 60;

    return (
      <div
        className={`group bg-slate-900 rounded-3xl border transition-all duration-300 p-5 md:p-6 hover:shadow-2xl ${
          isLive
            ? "border-rose-500/60 shadow-rose-500/10 bg-gradient-to-r from-slate-900 to-rose-950/20"
            : isEnded
            ? "border-slate-800/40 opacity-60"
            : "border-slate-800/90 hover:border-slate-700"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Metadata info */}
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
                {cfg.dot && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                {cfg.label}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {provider}
              </span>
              {s.course_title && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20 truncate max-w-[200px]">
                  {s.course_title}
                </span>
              )}
            </div>

            <h3 className={`text-base md:text-lg font-bold truncate ${isLive ? "text-rose-300" : "text-white"} group-hover:text-rose-400 transition`}>
              {s.title}
            </h3>

            {s.class_title && (
              <p className="text-xs text-slate-400 font-medium truncate">
                Lớp: <span className="text-slate-200">{s.class_title}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <IconClock />
                <span>
                  {new Date(s.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                  {new Date(s.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconClock />
                <span>{dur} phút</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconUsers />
                <span>{enrolled}/{cap} học viên</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar />
                <span>{new Date(s.start_time).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
              </span>
            </div>
          </div>

          {/* Conditional Action Button */}
          <div className="shrink-0 flex items-center">
            {isLive ? (
              <button
                onClick={() => handleJoin(s)}
                className="w-full md:w-auto px-6 py-3 rounded-2xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-600/30 transform hover:scale-105"
              >
                <IconVideo />
                <span>Vào Lớp Ngay (Đang Live) 🔴</span>
              </button>
            ) : isImminent ? (
              <button
                onClick={() => handleJoin(s)}
                className="w-full md:w-auto px-6 py-3 rounded-2xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20"
              >
                <IconVideo />
                <span>Phòng Đã Mở • Vào Sớm</span>
              </button>
            ) : isEnded ? (
              <button
                disabled
                className="w-full md:w-auto px-5 py-2.5 rounded-xl font-medium text-xs text-slate-500 bg-slate-800/40 border border-slate-800 cursor-not-allowed"
              >
                Đã Kết Thúc
              </button>
            ) : (
              <button
                onClick={() => handleJoin(s)}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 transition flex items-center justify-center gap-1.5"
                title="Phòng học sẽ mở trước giờ học 15 phút"
              >
                <IconLock />
                <span>Chưa Mở Phòng</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Compact Dashboard Header */}
      <div className="border-b border-white/[0.08] bg-slate-900/40 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-5">
        <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                LMS • Lớp Học Trực Tuyến
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Lịch Học & Phòng Học Live
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Luyện đề thi thử CSCA trực tiếp và sửa ngữ âm HSKK qua Google Meet & Zoom.
            </p>
          </div>

          {/* Compact Live Countdown Widget */}
          {countdown && (
            <div className="bg-slate-900/90 backdrop-blur-xl border border-rose-500/30 rounded-2xl px-3.5 py-2 shadow-xl flex items-center gap-3">
              <div className="text-left">
                <span className="text-[9px] uppercase tracking-wider text-rose-400 font-bold block">Sắp diễn ra</span>
                <p className="text-xs font-bold text-white truncate max-w-[140px]">{countdown.title}</p>
              </div>
              <div className="flex items-center gap-1 font-mono text-xs">
                <span className="bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 font-bold text-rose-400">
                  {String(countdown.hours).padStart(2, "0")}h
                </span>
                <span className="text-rose-400 font-bold">:</span>
                <span className="bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 font-bold text-rose-400">
                  {String(countdown.minutes).padStart(2, "0")}m
                </span>
                <span className="text-rose-400 font-bold">:</span>
                <span className="bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 font-bold text-rose-400">
                  {String(countdown.seconds).padStart(2, "0")}s
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {/* Statistics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tổng số buổi học", value: stats.total, color: "text-white", bg: "from-white/5 to-transparent border-white/10" },
            { label: "Đang diễn ra Live", value: stats.live, color: "text-rose-400", bg: "from-rose-500/10 to-transparent border-rose-500/20" },
            { label: "Đã hoàn thành", value: stats.done, color: "text-emerald-400", bg: "from-emerald-500/10 to-transparent border-emerald-500/20" },
            { label: "Sắp tới", value: stats.upcoming, color: "text-amber-400", bg: "from-amber-500/10 to-transparent border-amber-500/20" },
          ].map((st) => (
            <div key={st.label} className={`bg-gradient-to-br ${st.bg} bg-slate-900/60 border rounded-2xl p-3.5 text-center`}>
              <p className={`text-2xl font-black font-mono ${st.color}`}>{st.value}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">{st.label}</p>
            </div>
          ))}
        </div>

        {/* Filters and View Switcher Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="inline-flex p-1 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-x-auto max-w-full">
            <div className="flex items-center gap-1">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 select-none whitespace-nowrap ${
                      active
                        ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_4px_16px_-2px_rgba(244,63,94,0.45),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    {f.id === "live" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    )}
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === "list" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Xem dạng danh sách"
            >
              <IconList />
              <span className="hidden sm:inline">Danh Sách</span>
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === "calendar" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Xem dạng lịch tuần"
            >
              <IconGrid />
              <span className="hidden sm:inline">Lịch Tuần</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingState message="Đang nạp lịch học trực tuyến của bạn..." count={3} />
        ) : errorMessage ? (
          <ErrorState
            title="Lỗi Tải Lịch Học"
            message={errorMessage}
            onRetry={loadSchedule}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Không Có Buổi Học Nào"
            message={filter === "ALL" ? "Bạn hiện chưa có buổi học trực tuyến nào được lên lịch." : "Không có buổi học nào phù hợp với bộ lọc đã chọn."}
            actionLabel={filter !== "ALL" ? "Xem Tất Cả Buổi Học" : null}
            onAction={filter !== "ALL" ? () => setFilter("ALL") : null}
          />
        ) : viewMode === "list" ? (
          <div className="space-y-4">
            {filtered.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          /* Calendar Grid View */
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className="space-y-2 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-3">
                <div className="text-center text-xs font-bold text-slate-400 pb-2 border-b border-slate-800">
                  {day}
                </div>
                {calGrid[i].length === 0 ? (
                  <div className="h-24 rounded-xl flex items-center justify-center text-[10px] text-slate-600">
                    Trống
                  </div>
                ) : (
                  calGrid[i].map((s) => {
                    const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleJoin(s)}
                        className={`cursor-pointer w-full text-left bg-slate-900 border rounded-xl p-2.5 text-[11px] space-y-1 transition hover:border-slate-600 ${
                          s._st === "LIVE" ? "border-rose-500/50 bg-rose-950/20" : "border-slate-800"
                        }`}
                      >
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                        <p className="font-semibold text-white truncate">{s.title}</p>
                        <p className="text-slate-400 font-mono text-[10px]">
                          {new Date(s.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
