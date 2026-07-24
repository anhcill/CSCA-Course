import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Các câu tips du học xoay vòng ──────────────────────────────────────────────
const TIPS = [
  "Mỗi ngày học 10 từ mới, một năm bạn sẽ biết 3.650 từ!",
  "HSK 4 là yêu cầu tối thiểu để du học Trung Quốc.",
  "Hãy luyện nghe mỗi ngày, tai bạn sẽ quen với thanh điệu.",
  "Viết chữ Hán giúp bạn nhớ lâu hơn gấp 3 lần đọc thuộc.",
  "HSKK giúp bạn tự tin giao tiếp trong môi trường thực tế.",
  "Trung Quốc có hơn 500 trường đại học mở cửa cho du học sinh.",
  "Học bổng CSC là cơ hội tuyệt vời cho sinh viên Việt Nam.",
  "Luyện đề thi thường xuyên giúp bạn quen với cấu trúc bài thi.",
];

// ── Các chữ Hán bay lơ lửng ────────────────────────────────────────────────────
const HANZI = ["学", "梦", "书", "友", "思", "知", "行", "志"];

const FloatingHanzi = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {HANZI.map((char, i) => (
      <motion.span
        key={i}
        className="absolute text-red-500/[0.07] dark:text-red-400/[0.07] font-serif select-none"
        style={{
          fontSize: `${28 + (i % 4) * 14}px`,
          left: `${8 + i * 11}%`,
          top: `${10 + ((i * 7) % 60)}%`,
        }}
        animate={{
          y: [0, -18, 0],
          rotate: [0, (i % 2 === 0 ? 6 : -6), 0],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 3.5 + i * 0.4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.3,
        }}
      >
        {char}
      </motion.span>
    ))}
  </div>
);

// ── Máy bay giấy bay ───────────────────────────────────────────────────────────
const PaperPlane = () => (
  <motion.svg
    viewBox="0 0 64 64"
    className="w-8 h-8 text-amber-500 dark:text-amber-400 drop-shadow"
    fill="currentColor"
    animate={{
      x: [0, 12, 0, -12, 0],
      y: [0, -6, 0, -6, 0],
      rotate: [0, 8, 0, -8, 0],
    }}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
  >
    <path d="M4.3 8.3 58 30.2a2 2 0 0 1 0 3.6L4.3 55.7a2 2 0 0 1-2.7-2.4l5.5-19.6a1 1 0 0 0 0-.5L1.6 10.7a2 2 0 0 1 2.7-2.4ZM10 32l42.3-1M10 32l4-14.4M10 32l4 14.4" />
  </motion.svg>
);

// ── Đèn lồng ───────────────────────────────────────────────────────────────────
const Lantern = ({ delay = 0, size = "w-5 h-7" }) => (
  <motion.div
    className={`${size} relative`}
    animate={{ rotate: [-4, 4, -4], y: [0, -3, 0] }}
    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay }}
  >
    {/* Dây treo */}
    <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-px h-2 bg-amber-700/50 dark:bg-amber-500/40" />
    {/* Thân đèn */}
    <div className="w-full h-full rounded-[40%] bg-gradient-to-b from-red-500 to-red-700 dark:from-red-600 dark:to-red-800 shadow-lg shadow-red-500/30 flex items-center justify-center">
      <span className="text-[8px] text-amber-200 font-bold select-none">福</span>
    </div>
    {/* Tua đèn */}
    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-px h-1.5 bg-amber-600/60" />
  </motion.div>
);

// ── Progress dots ───────────────────────────────────────────────────────────────
const ProgressDots = () => (
  <div className="flex items-center gap-1.5">
    {[0, 1, 2, 3].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400"
        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.2,
        }}
      />
    ))}
  </div>
);

// ── Component chính ─────────────────────────────────────────────────────────────
const Loading = ({
  loading = true,
  text = "Đang tải...",
  fullScreen = true,
  className = "",
}) => {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 3500);
    return () => clearInterval(id);
  }, [loading]);

  if (!loading) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        ${fullScreen ? "fixed inset-0 z-50" : "w-full h-full min-h-[320px]"}
        flex items-center justify-center
        bg-gradient-to-br from-orange-50 via-white to-red-50
        dark:from-gray-900 dark:via-gray-900 dark:to-gray-800
        ${className}
      `}
    >
      {/* Chữ Hán bay lơ lửng nền */}
      <FloatingHanzi />

      {/* Card chính */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative z-10 flex flex-col items-center gap-5 px-8 py-10 sm:px-12 sm:py-12 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-xl shadow-red-500/10 dark:shadow-red-500/5 border border-red-100/60 dark:border-gray-700/60 max-w-sm w-[90vw]"
      >
        {/* Đèn lồng trên header */}
        <div className="flex items-end gap-6 mb-1">
          <Lantern delay={0} size="w-4 h-6" />
          <Lantern delay={0.4} size="w-5 h-7" />
          <Lantern delay={0.8} size="w-4 h-6" />
        </div>

        {/* Máy bay + text */}
        <div className="flex flex-col items-center gap-3">
          <PaperPlane />
          <p className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-wide">
            {text}
          </p>
        </div>

        {/* Progress dots */}
        <ProgressDots />

        {/* Tips xoay vòng */}
        <div className="h-12 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="text-xs text-center text-gray-500 dark:text-gray-400 leading-relaxed max-w-[260px]"
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Branding nhỏ */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs font-black text-red-600 dark:text-red-500 tracking-tight">
            CSCA
          </span>
          <span className="text-[10px] font-semibold text-orange-500 dark:text-orange-400 tracking-wider">
            COURSE
          </span>
        </div>
      </motion.div>
    </motion.div>
  );

  return <AnimatePresence>{loading && content}</AnimatePresence>;
};

export default Loading;
