/* eslint-disable react/prop-types */
import { useState, useEffect, useMemo, useCallback } from "react";

/* ── Icons ────────────────────────────────────────────────────── */
const IconFlame = () => (
  <svg className="w-5 h-5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 23c-3.866 0-7-2.686-7-6.5 0-2.818 1.658-4.89 3-6.5.452-.543.907-1.076 1.3-1.65C10.208 7.078 10.5 5.5 10.5 4c0 0 1.395.844 2.5 2.5 1.105 1.656 1.5 3 1.5 3s.617-1.344 1.5-2.5C16.885 5.894 17 5 17 5s1 1.5 1 3.5c0 1.5-.5 2.5-.5 2.5s.5.5 1 1.5c.5 1 .5 2 .5 4C19 20.314 15.866 23 12 23z" />
  </svg>
);

const IconTrophy = () => (
  <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15l-2 5h4l-2-5zm0 0a7 7 0 007-7V4H5v4a7 7 0 007 7zm-7-7H3m18 0h-2" />
  </svg>
);

const BADGE_DEFS = [
  { id: "diligent", name: "Cần Cù Bứt Phá", desc: "Giữ chuỗi Daily Streak 7 ngày", svg: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id: "hsk_conquer", name: "Chinh Phục HSK", desc: "Hoàn thành bài thi đạt >= 8.5", svg: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "speaker", name: "Nhà Hùng Biện HSKK", desc: "Nộp audio khẩu ngữ đạt chuẩn", svg: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" },
  { id: "top3", name: "Bảng Vàng Danh Dự", desc: "Lọt vào Top 3 BXH tuần/tháng", svg: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
];

/* MOCK_UI_ONLY: Dữ liệu mẫu bảng xếp hạng theo phạm vi (Scope) và thời gian (Period) */
const MOCK_LEADERBOARDS = {
  class: {
    week: [
      { rank: 1, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 940, streak_days: 14, is_current_user: true },
      { rank: 2, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 880, streak_days: 12, is_current_user: false },
      { rank: 3, username: "lehoangnam", full_name: "Lê Hoàng Nam", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", total_xp: 810, streak_days: 10, is_current_user: false },
      { rank: 4, username: "phamthihuong", full_name: "Phạm Thị Hương", avatar: "", total_xp: 750, streak_days: 9, is_current_user: false },
      { rank: 5, username: "vuminhtuan", full_name: "Vũ Minh Tuấn", avatar: "", total_xp: 690, streak_days: 7, is_current_user: false },
      { rank: 6, username: "dangthulan", full_name: "Đặng Thu Lan", avatar: "", total_xp: 620, streak_days: 5, is_current_user: false },
    ],
    month: [
      { rank: 1, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 3250, streak_days: 28, is_current_user: false },
      { rank: 2, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 3100, streak_days: 14, is_current_user: true },
      { rank: 3, username: "lehoangnam", full_name: "Lê Hoàng Nam", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", total_xp: 2890, streak_days: 22, is_current_user: false },
      { rank: 4, username: "vuminhtuan", full_name: "Vũ Minh Tuấn", avatar: "", total_xp: 2450, streak_days: 18, is_current_user: false },
      { rank: 5, username: "phamthihuong", full_name: "Phạm Thị Hương", avatar: "", total_xp: 2180, streak_days: 16, is_current_user: false },
    ],
    all: [
      { rank: 1, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 8900, streak_days: 45, is_current_user: false },
      { rank: 2, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 7650, streak_days: 14, is_current_user: true },
      { rank: 3, username: "lehoangnam", full_name: "Lê Hoàng Nam", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", total_xp: 6800, streak_days: 30, is_current_user: false },
    ],
  },
  global: {
    week: [
      { rank: 1, username: "duongngocminh", full_name: "Dương Ngọc Minh", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80", total_xp: 1420, streak_days: 25, is_current_user: false },
      { rank: 2, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 1250, streak_days: 28, is_current_user: false },
      { rank: 3, username: "hoanggiabao", full_name: "Hoàng Gia Bảo", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80", total_xp: 1100, streak_days: 19, is_current_user: false },
      { rank: 4, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 940, streak_days: 14, is_current_user: true },
      { rank: 5, username: "lehoangnam", full_name: "Lê Hoàng Nam", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", total_xp: 890, streak_days: 10, is_current_user: false },
    ],
    month: [
      { rank: 1, username: "duongngocminh", full_name: "Dương Ngọc Minh", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80", total_xp: 4900, streak_days: 35, is_current_user: false },
      { rank: 2, username: "hoanggiabao", full_name: "Hoàng Gia Bảo", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80", total_xp: 4350, streak_days: 29, is_current_user: false },
      { rank: 3, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 4120, streak_days: 28, is_current_user: false },
      { rank: 4, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 3100, streak_days: 14, is_current_user: true },
    ],
    all: [
      { rank: 1, username: "duongngocminh", full_name: "Dương Ngọc Minh", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80", total_xp: 18500, streak_days: 120, is_current_user: false },
      { rank: 2, username: "hoanggiabao", full_name: "Hoàng Gia Bảo", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80", total_xp: 16200, streak_days: 95, is_current_user: false },
      { rank: 3, username: "tranthimai", full_name: "Trần Thị Mai", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80", total_xp: 15400, streak_days: 80, is_current_user: false },
      { rank: 4, username: "nguyenvana", full_name: "Đại Ca Học Bá (Bạn)", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80", total_xp: 11200, streak_days: 14, is_current_user: true },
    ],
  },
};

function getLevelInfo(xp) {
  const level = Math.floor(xp / 200) + 1;
  const xpInLevel = xp % 200;
  const titles = ["Tân Binh Đồng", "Chiến Binh Bạc", "Học Giả Vàng", "Bậc Thầy Bạch Kim", "Huyền Thoại Kim Cương"];
  const tierIdx = Math.min(Math.floor((level - 1) / 5), titles.length - 1);
  return { level, xpInLevel, xpNeeded: 200, title: titles[tierIdx] };
}

const PodiumCard = ({ user, rank }) => {
  if (!user) return null;
  const colors = {
    1: {
      border: "border-amber-400/80 shadow-amber-500/20",
      bg: "from-amber-950/50 via-slate-900 to-slate-900",
      text: "text-amber-300",
      badge: "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black",
      medal: "🥇",
    },
    2: {
      border: "border-slate-400/60 shadow-slate-400/10",
      bg: "from-slate-800/40 via-slate-900 to-slate-900",
      text: "text-slate-200",
      badge: "bg-slate-300 text-slate-950 font-black",
      medal: "🥈",
    },
    3: {
      border: "border-amber-700/60 shadow-amber-900/10",
      bg: "from-amber-900/30 via-slate-900 to-slate-900",
      text: "text-amber-200",
      badge: "bg-amber-700 text-amber-100 font-black",
      medal: "🥉",
    },
  };
  const c = colors[rank];
  const isTop1 = rank === 1;

  return (
    <div
      className={`bg-gradient-to-b ${c.bg} border-2 ${c.border} rounded-3xl p-6 text-center space-y-4 relative shadow-2xl transition-all duration-300 hover:scale-[1.02] ${
        isTop1 ? "scale-105 ring-4 ring-amber-400/20 z-10" : ""
      } ${rank === 2 ? "md:translate-y-4" : ""} ${rank === 3 ? "md:translate-y-8" : ""}`}
    >
      {/* Rank Indicator Badge */}
      <div
        className={`w-10 h-10 ${c.badge} text-base rounded-2xl flex items-center justify-center mx-auto absolute -top-5 left-1/2 -translate-x-1/2 shadow-lg border border-white/20`}
      >
        {rank}
      </div>

      {isTop1 && (
        <div className="text-3xl absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce">
          👑
        </div>
      )}

      {/* Avatar */}
      <div className="relative inline-block mt-2">
        <img
          src={
            user.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username)}&background=1e293b&color=fbbf24`
          }
          alt={user.full_name}
          className={`${
            isTop1 ? "w-24 h-24 border-4" : "w-20 h-20 border-2"
          } rounded-full ${c.border} mx-auto object-cover shadow-inner`}
        />
        {user.is_current_user && (
          <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full border border-slate-900 shadow">
            BẠN
          </span>
        )}
      </div>

      <div>
        <h3 className={`font-bold ${isTop1 ? "text-lg" : "text-base"} ${c.text} truncate`}>
          {user.full_name || user.username}
        </h3>
        <p className="text-xs text-slate-500 font-mono">@{user.username}</p>
      </div>

      <div className="space-y-1.5 pt-1">
        <div
          className={`inline-flex items-center gap-1.5 ${
            isTop1
              ? "bg-amber-500 text-slate-950 font-black text-sm px-5 py-2 shadow-lg shadow-amber-500/20"
              : "bg-slate-800 text-slate-200 font-bold text-xs px-4 py-1.5 border border-slate-700"
          } rounded-full font-mono`}
        >
          <span>{user.total_xp} XP</span>
          <span>{c.medal}</span>
        </div>

        <p className="text-[11px] text-amber-400/90 font-medium flex items-center justify-center gap-1">
          <IconFlame /> {user.streak_days} ngày streak
        </p>
      </div>
    </div>
  );
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userStreak, setUserStreak] = useState({
    currentStreakDays: 14,
    totalXp: 1250,
    weeklyXp: [30, 45, 20, 60, 50, 40, 20],
    weekDays: [true, true, true, true, true, true, false],
    unlockedBadges: ["diligent", "hsk_conquer"],
  });
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("class"); // "class" | "global"
  const [period, setPeriod] = useState("week"); // "week" | "month" | "all"
  const [showCelebration, setShowCelebration] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?scope=${scope}&period=${period}`);
      const data = await res.json();
      if (data.success && data.data && Array.isArray(data.data.leaderboard) && data.data.leaderboard.length > 0) {
        setLeaderboard(data.data.leaderboard);
        if (data.data.userStreak) {
          setUserStreak((prev) => ({ ...prev, ...data.data.userStreak }));
        }
      } else {
        // Fallback: Lấy từ MOCK_LEADERBOARDS tương ứng scope & period
        const fallback = MOCK_LEADERBOARDS[scope]?.[period] || MOCK_LEADERBOARDS.class.week;
        setLeaderboard(fallback);
      }
    } catch {
      const fallback = MOCK_LEADERBOARDS[scope]?.[period] || MOCK_LEADERBOARDS.class.week;
      setLeaderboard(fallback);
    } finally {
      setLoading(false);
    }
  }, [scope, period]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const top1 = leaderboard[0];
  const top2 = leaderboard[1];
  const top3 = leaderboard[2];
  const rest = leaderboard.slice(3);

  const lvl = useMemo(() => getLevelInfo(userStreak.totalXp), [userStreak.totalXp]);
  const maxWeeklyXp = Math.max(...(userStreak.weeklyXp || [1]), 1);
  const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Compact Dashboard Header */}
      <div className="border-b border-white/[0.08] bg-slate-900/40 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-5">
        <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <IconTrophy />
                <span>CSCA Gamification</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Bảng Xếp Hạng & Tiến Trình Học Tập
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Tích lũy điểm kinh nghiệm (XP) qua bài giảng, bài tập và duy trì chuỗi Daily Streak.
            </p>
          </div>

          {/* Compact Daily Streak Pill */}
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/25">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <IconFlame />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-amber-300 font-mono leading-none">
                  {userStreak.currentStreakDays} NGÀY
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                  Chuỗi liên tục 🔥
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Milestone Celebration Banner */}
        {showCelebration && (
          <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 rounded-3xl p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-start gap-4">
              <span className="text-3xl p-2 bg-amber-500/20 border border-amber-500/30 rounded-2xl shrink-0">
                🎉
              </span>
              <div>
                <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                  <span>Chúc Mừng Đại Ca Đạt Cột Mốc 14 Ngày Học!</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-xs uppercase">
                    Cột mốc mới
                  </span>
                </h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl">
                  Đại ca vừa hoàn thành xuất sắc chuỗi streak 14 ngày, thăng cấp lên <strong className="text-amber-400">{lvl.title} (Level {lvl.level})</strong> và mở khóa huy hiệu <em>Cần Cù Bứt Phá</em>. Tiếp tục duy trì để nhận chứng chỉ danh dự nhé!
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCelebration(false)}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold shrink-0 transition"
            >
              Đã hiểu
            </button>
          </div>
        )}

        {/* Thống kê học viên & Streak Heatmap */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Level & XP Progress Card */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Cấp Độ Năng Lực Học Tập
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  Level {lvl.level} — <span className="text-amber-400">{lvl.title}</span>
                </h3>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-amber-400 font-mono">{userStreak.totalXp}</p>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tổng XP Tích Lũy</p>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tiến độ lên Level {lvl.level + 1}</span>
                <span className="text-amber-400 font-mono font-bold">
                  {lvl.xpInLevel} / {lvl.xpNeeded} XP
                </span>
              </div>
              <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (lvl.xpInLevel / lvl.xpNeeded) * 100)}%` }}
                />
              </div>
            </div>

            {/* Weekly XP Chart */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  XP Thu Thập 7 Ngày Gần Nhất
                </h4>
                <span className="text-xs text-slate-500 font-mono">Đạt mục tiêu tuần</span>
              </div>
              <div className="flex items-end gap-3 h-24 pt-2">
                {(userStreak.weeklyXp || [0, 0, 0, 0, 0, 0, 0]).map((xp, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] text-slate-400 font-mono font-semibold">{xp}</span>
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-300 group hover:brightness-125"
                      style={{ height: `${Math.max(6, (xp / maxWeeklyXp) * 100)}%` }}
                    />
                    <span className="text-[10px] text-slate-500 font-bold">{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Streak & Badges Showcase */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Theo Dõi Chuỗi Tuần Này
              </h3>
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((d, i) => {
                  const active = (userStreak.weekDays || [])[i];
                  return (
                    <div key={d} className="text-center space-y-1">
                      <span className="text-[10px] text-slate-500 font-medium">{d}</span>
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 mx-auto rounded-xl flex items-center justify-center text-xs font-black transition ${
                          active
                            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-sm"
                            : "bg-slate-950 border border-slate-800 text-slate-600"
                        }`}
                        title={active ? "Đã hoàn thành bài học" : "Chưa học"}
                      >
                        {active ? "✓" : "·"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Badges */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Huy Hiệu Đã Mở Khóa
                </h4>
                <span className="text-[10px] text-amber-400 font-bold">
                  {userStreak.unlockedBadges.length} / {BADGE_DEFS.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BADGE_DEFS.map((b) => {
                  const unlocked = (userStreak.unlockedBadges || []).includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`p-2.5 rounded-xl border text-center space-y-1 transition ${
                        unlocked
                          ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                          : "bg-slate-950/60 border-slate-800 opacity-40"
                      }`}
                      title={`${b.name}: ${b.desc}`}
                    >
                      <svg
                        className={`w-5 h-5 mx-auto ${unlocked ? "text-amber-400" : "text-slate-600"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={b.svg} />
                      </svg>
                      <p className={`text-[10px] font-bold truncate ${unlocked ? "text-amber-300" : "text-slate-500"}`}>
                        {b.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* BỘ LỌC PHẠM VI (SCOPE) & THỜI GIAN (PERIOD) - Tách biệt LMS Scope vs Public */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            {/* Scope Switcher: Lớp học của tôi vs Toàn hệ thống */}
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                onClick={() => setScope("class")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  scope === "class"
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🏫 Lớp Học Của Tôi</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/20 rounded font-normal">HSK3-K24</span>
              </button>
              <button
                onClick={() => setScope("global")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  scope === "global"
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🌐 Toàn Hệ Thống CSCA</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/20 rounded font-normal">Tất cả</span>
              </button>
            </div>

            {/* Period Tabs: Tuần này / Tháng này / Toàn bộ */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              {[
                { id: "week", label: "Tuần Này" },
                { id: "month", label: "Tháng Này" },
                { id: "all", label: "Toàn Thời Gian" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPeriod(t.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    period === t.id
                      ? "bg-slate-800 text-amber-400 border border-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            {scope === "class" ? (
              <span>Đang hiển thị bảng xếp hạng trong phạm vi <strong>Lớp học HSK 3 - Khóa K24</strong> của đại ca.</span>
            ) : (
              <span>Đang hiển thị bảng xếp hạng đua top chung trên <strong>Toàn bộ học viên CSCA Academy</strong>.</span>
            )}
          </p>
        </div>

        {/* Podium Top 3 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 bg-slate-900 rounded-3xl border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-6">
              <PodiumCard user={top2} rank={2} />
              <PodiumCard user={top1} rank={1} />
              <PodiumCard user={top3} rank={3} />
            </div>

            {/* Bảng xếp hạng các vị trí còn lại (#4+) */}
            {rest.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Các Thứ Hạng Tiếp Theo
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Top {rest.length + 3} học viên dẫn đầu
                  </span>
                </div>

                <div className="space-y-2">
                  {rest.map((item) => (
                    <div
                      key={item.username}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        item.is_current_user
                          ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30"
                          : "bg-slate-950/80 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="w-8 text-center font-mono font-black text-sm text-slate-400 shrink-0">
                          #{item.rank}
                        </span>
                        <img
                          src={
                            item.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(item.full_name || item.username)}&background=1e293b&color=fff`
                          }
                          alt=""
                          className="w-10 h-10 rounded-full border border-slate-800 object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-white truncate">
                              {item.full_name || item.username}
                            </p>
                            {item.is_current_user && (
                              <span className="px-2 py-0.2 bg-amber-400 text-slate-950 font-black text-[9px] rounded-full uppercase shrink-0">
                                Bạn
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-mono truncate">@{item.username}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0">
                        <span className="text-xs text-amber-400 font-bold hidden sm:flex items-center gap-1">
                          <IconFlame /> {item.streak_days || 0} ngày
                        </span>
                        <span className="font-mono font-black text-sm text-white bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
                          {item.total_xp} XP
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
