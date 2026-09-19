import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Tips xoay vòng ─────────────────────────────────────────────────────────────
const TIPS = [
  "Mỗi ngày học 10 từ mới, một năm bạn sẽ tích lũy 3.650 từ vựng!",
  "HSK 4 là mốc tối thiểu để chinh phục học bổng du học Trung Quốc.",
  "Hãy luyện nghe mỗi ngày, tai bạn sẽ quen với 4 thanh điệu tiếng Trung.",
  "Viết chữ Hán giúp bạn ghi nhớ lâu hơn gấp 3 lần so with đọc thuộc.",
  "HSKK giúp bạn tự tin phản xạ giao tiếp trong môi trường thực tế.",
  "Trung Quốc có hơn 500 trường đại học mở cửa chào đón du học sinh.",
  "Học bổng CSC & Chỉnh phủ là cơ hội lớn cho sinh viên Việt Nam.",
  "Luyện đề thi CSCA thường xuyên giúp bạn bứt phá điểm số tối đa.",
];

// ── Chữ Hán nghệ thuật bay lơ lửng ──────────────────────────────────────────────
const HANZI = ["学", "梦", "书", "友", "思", "知", "行", "志"];

const FloatingHanzi = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {HANZI.map((char, i) => (
      <motion.span
        key={i}
        className="absolute text-rose-500/10 font-serif select-none font-black"
        style={{
          fontSize: `${32 + (i % 4) * 16}px`,
          left: `${6 + i * 12}%`,
          top: `${12 + ((i * 11) % 65)}%`,
        }}
        animate={{
          y: [0, -24, 0],
          rotate: [0, (i % 2 === 0 ? 8 : -8), 0],
          opacity: [0.3, 0.8, 0.3],
          scale: [0.9, 1.1, 0.9],
        }}
        transition={{
          duration: 4 + i * 0.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.25,
        }}
      >
        {char}
      </motion.span>
    ))}
  </div>
);

// ── Máy bay giấy phát sáng ──────────────────────────────────────────────────────
const PaperPlane = () => (
  <div className="relative flex items-center justify-center">
    {/* Radial glow background */}
    <div className="absolute w-20 h-20 bg-amber-500/20 rounded-full blur-xl animate-pulse" />
    <motion.svg
      viewBox="0 0 64 64"
      className="w-12 h-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
      fill="currentColor"
      animate={{
        x: [0, 10, 0, -10, 0],
        y: [0, -8, 0, -8, 0],
        rotate: [0, 6, 0, -6, 0],
      }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M4.3 8.3 58 30.2a2 2 0 0 1 0 3.6L4.3 55.7a2 2 0 0 1-2.7-2.4l5.5-19.6a1 1 0 0 0 0-.5L1.6 10.7a2 2 0 0 1 2.7-2.4ZM10 32l42.3-1M10 32l4-14.4M10 32l4 14.4" />
    </motion.svg>
  </div>
);

// ── Đèn lồng truyền thống mạ vàng ─────────────────────────────────────────────
const Lantern = ({ delay = 0, size = "w-7 h-10" }) => (
  <motion.div
    className={`${size} relative`}
    animate={{ rotate: [-6, 6, -6], y: [0, -4, 0] }}
    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay }}
  >
    {/* Dây treo vàng */}
    <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-0.5 h-3 bg-amber-400/80 shadow-[0_0_5px_rgba(251,191,36,0.6)]" />
    {/* Thân đèn lồng */}
    <div className="w-full h-full rounded-[45%] bg-gradient-to-b from-red-600 via-rose-600 to-red-800 shadow-[0_0_15px_rgba(225,29,72,0.6)] border border-amber-400/40 flex items-center justify-center">
      <span className="text-[10px] text-amber-200 font-bold select-none font-serif drop-shadow">福</span>
    </div>
    {/* Tua rua vàng */}
    <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0.5 h-2 bg-amber-400" />
  </motion.div>
);

// ── Wave Dots Animation ────────────────────────────────────────────────────────
const ProgressDots = () => (
  <div className="flex items-center gap-2 py-1">
    {[0, 1, 2, 3].map((i) => (
      <motion.div
        key={i}
        className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-500 to-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
        animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.18,
        }}
      />
    ))}
  </div>
);

// ── Component Loading Cao Cấp ─────────────────────────────────────────────────
const Loading = ({
  loading = true,
  text = "Đang tải phản hồi...",
  fullScreen = true,
  className = "",
}) => {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 3800);
    return () => clearInterval(id);
  }, [loading]);

  if (!loading) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className={`
        ${fullScreen ? "fixed inset-0 z-50" : "w-full h-full min-h-[360px]"}
        flex items-center justify-center
        bg-slate-950/90 backdrop-blur-2xl
        ${className}
      `}
    >
      {/* Background Glowing Aura */}
      <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-red-600/20 via-rose-600/20 to-amber-500/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Chữ Hán bay lơ lửng */}
      <FloatingHanzi />

      {/* Main Glassmorphism Card */}
      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center gap-6 px-8 py-10 sm:px-12 sm:py-12 rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] border-t-white/20 max-w-sm w-[90vw] text-center"
      >
        {/* Đèn lồng treo header */}
        <div className="flex items-end gap-6 mb-1">
          <Lantern delay={0} size="w-5 h-7" />
          <Lantern delay={0.4} size="w-7 h-9" />
          <Lantern delay={0.8} size="w-5 h-7" />
        </div>

        {/* Máy bay giấy + Text */}
        <div className="flex flex-col items-center gap-3">
          <PaperPlane />
          <h4 className="text-lg font-black text-white tracking-wide bg-gradient-to-r from-white via-rose-100 to-amber-200 bg-clip-text text-transparent">
            {text}
          </h4>
        </div>

        {/* Progress dots */}
        <ProgressDots />

        {/* Tips xoay vòng */}
        <div className="h-14 flex items-center justify-center overflow-hidden w-full px-2">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="text-xs text-slate-300 leading-relaxed font-medium max-w-[280px]"
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Branding Footer Badge */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 w-full justify-center">
          <span className="text-xs font-black text-rose-500 tracking-wider">
            CSCA
          </span>
          <span className="text-[11px] font-bold text-amber-400 tracking-widest uppercase font-mono">
            COURSE
          </span>
        </div>
      </motion.div>
    </motion.div>
  );

  return <AnimatePresence>{loading && content}</AnimatePresence>;
};

export default Loading;
