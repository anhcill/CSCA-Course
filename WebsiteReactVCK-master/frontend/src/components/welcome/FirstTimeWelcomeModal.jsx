/* eslint-disable react/prop-types */
import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  GraduationCap,
  Sparkles,
  ArrowRight,
  X,
  Compass,
  CheckCircle2,
} from "lucide-react";
import { useAuthContext } from "../../context/AuthContext.jsx";
import { USER_ROLES } from "../../constants/roles.js";

/**
 * FirstTimeWelcomeModal
 * 
 * Liquid Glass welcome screen for first-time login of Teachers and Students.
 * Conforms strictly to requirements:
 * - Liquid Glass iOS design: specular highlights, frosted blur, soft ambient lighting.
 * - Non-purple palette: ocean slate, cyan, emerald, warm amber, champagne gold.
 * - Sequential reveal: Icon/visual -> Title (word-by-word) -> Description -> Action button.
 * - Teacher animation: Liquid Glass book opens, flips 2-3 pages, warm amber glow, teaching symbol.
 * - Student animation: Luminous particles gather from multiple directions to forge a glass graduation cap,
 *                      lifts gently leaving a glowing curved journey arc and subtle starlight.
 * - Accessible: prefers-reduced-motion fallback, clean skip button, responsive, non-blocking on failure.
 */

// Stagger word reveal animation helper
const WordReveal = ({ text, delay = 0, shouldReduceMotion }) => {
  const words = useMemo(() => text.split(" "), [text]);

  if (shouldReduceMotion) {
    return <span>{text}</span>;
  }

  return (
    <span className="inline-flex flex-wrap justify-center gap-x-2.5">
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.45,
            delay: delay + index * 0.08,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
};

// Teacher Visual: Liquid Glass 3D Book with Flipping Pages & Warm Inner Glow
const TeacherBookVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-28 h-28 mx-auto mb-6">
        <div className="absolute inset-0 rounded-3xl bg-amber-500/20 blur-xl" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 border border-white/25 shadow-2xl backdrop-blur-xl text-amber-300">
          <BookOpen className="w-12 h-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center w-40 h-36 mx-auto mb-5 select-none perspective-[1000px]">
      {/* Warm ambient radiant backlight from inside the book */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.8, 1], scale: [0.5, 1.2, 1.1] }}
        transition={{ duration: 2.2, times: [0, 0.6, 1], ease: "easeOut" }}
        className="absolute -inset-4 rounded-full bg-gradient-to-r from-amber-400/25 via-emerald-400/15 to-amber-300/30 blur-2xl pointer-events-none"
      />

      {/* Book 3D Container */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0, rotateX: 18 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-32 h-24 flex items-center justify-center"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Left Book Base Page (Frosted Glass) */}
        <div
          className="absolute left-0 top-0 w-16 h-24 rounded-l-xl border-y border-l border-white/30 bg-gradient-to-br from-white/20 via-white/10 to-slate-800/40 backdrop-blur-xl shadow-lg flex items-center justify-center"
          style={{ transformOrigin: "right center" }}
        >
          <div className="w-10 h-16 rounded border border-white/10 bg-white/5 p-1 flex flex-col justify-around opacity-60">
            <div className="h-1 bg-amber-200/40 rounded w-full" />
            <div className="h-1 bg-white/30 rounded w-3/4" />
            <div className="h-1 bg-white/30 rounded w-5/6" />
            <div className="h-1 bg-white/30 rounded w-2/3" />
          </div>
        </div>

        {/* Right Book Base Page */}
        <div
          className="absolute right-0 top-0 w-16 h-24 rounded-r-xl border-y border-r border-white/30 bg-gradient-to-bl from-white/20 via-white/10 to-slate-800/40 backdrop-blur-xl shadow-lg flex items-center justify-center"
          style={{ transformOrigin: "left center" }}
        >
          <div className="w-10 h-16 rounded border border-white/10 bg-white/5 p-1 flex flex-col justify-around opacity-60">
            <div className="h-1 bg-amber-200/40 rounded w-full" />
            <div className="h-1 bg-white/30 rounded w-4/5" />
            <div className="h-1 bg-white/30 rounded w-3/4" />
            <div className="h-1 bg-white/30 rounded w-1/2" />
          </div>
        </div>

        {/* Flipping Page 1 */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180 }}
          transition={{ duration: 1.1, delay: 0.3, ease: [0.45, 0.05, 0.55, 0.95] }}
          className="absolute right-0 top-0 w-16 h-24 rounded-r-xl border-y border-r border-amber-300/40 bg-gradient-to-l from-white/30 via-amber-200/20 to-transparent backdrop-blur-md shadow-md"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        />

        {/* Flipping Page 2 */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180 }}
          transition={{ duration: 1.15, delay: 0.65, ease: [0.45, 0.05, 0.55, 0.95] }}
          className="absolute right-0 top-0 w-16 h-24 rounded-r-xl border-y border-r border-white/40 bg-gradient-to-l from-white/25 via-emerald-200/15 to-transparent backdrop-blur-md shadow-md"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        />

        {/* Flipping Page 3 (Final reveal page) */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180 }}
          transition={{ duration: 1.2, delay: 1.0, ease: [0.45, 0.05, 0.55, 0.95] }}
          className="absolute right-0 top-0 w-16 h-24 rounded-r-xl border-y border-r border-amber-200/40 bg-gradient-to-l from-white/35 via-amber-300/25 to-transparent backdrop-blur-md shadow-md"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        />

        {/* Book Spine glow line */}
        <div className="absolute top-0 bottom-0 w-1 bg-gradient-to-b from-amber-300 via-amber-100 to-amber-400 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.8)] z-10" />

        {/* Illuminated Educator Emblem floating out after final page turns */}
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.4 }}
          animate={{ opacity: 1, y: -26, scale: 1 }}
          transition={{ duration: 0.7, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute z-20 flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-white/30 to-amber-500/20 border border-white/40 backdrop-blur-2xl shadow-[0_10px_25px_rgba(245,158,11,0.35)] text-amber-200"
        >
          <Compass className="w-7 h-7 text-amber-300 drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]" />
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-1.5 -right-1.5 text-amber-300"
          >
            <Sparkles className="w-4 h-4" />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};

// Student Visual: Starlight Particles Converging into Liquid Glass Cap, Floating Lift & Curved Journey Arc
const StudentCapVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-28 h-28 mx-auto mb-6">
        <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 blur-xl" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 border border-white/25 shadow-2xl backdrop-blur-xl text-cyan-300">
          <GraduationCap className="w-12 h-12" />
        </div>
      </div>
    );
  }

  // Pre-calculated particle origins for clean convergence
  const particles = [
    { startX: -90, startY: -50, delay: 0.1 },
    { startX: 90, startY: -45, delay: 0.15 },
    { startX: -80, startY: 40, delay: 0.2 },
    { startX: 85, startY: 45, delay: 0.12 },
    { startX: 0, startY: -80, delay: 0.25 },
    { startX: -60, startY: -70, delay: 0.18 },
    { startX: 65, startY: -65, delay: 0.22 },
    { startX: 0, startY: 70, delay: 0.28 },
  ];

  return (
    <div className="relative flex items-center justify-center w-48 h-36 mx-auto mb-4 select-none">
      {/* Ambient background aura (Cyan & Emerald, zero purple) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.7, 0.9], scale: [0.4, 1.1, 1] }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute -inset-4 rounded-full bg-gradient-to-r from-cyan-500/20 via-teal-400/20 to-emerald-400/20 blur-2xl pointer-events-none"
      />

      {/* Converging Luminous Starlight Particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{
            x: p.startX,
            y: p.startY,
            opacity: 0,
            scale: 0.2,
          }}
          animate={{
            x: 0,
            y: 0,
            opacity: [0, 1, 0.8, 0],
            scale: [0.2, 1.4, 0.8, 0.2],
          }}
          transition={{
            duration: 1.1,
            delay: p.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="absolute w-2.5 h-2.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.9)] pointer-events-none z-10"
        />
      ))}

      {/* Curved radiant journey arc path drawn behind the cap */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
        viewBox="0 0 192 144"
        fill="none"
      >
        <motion.path
          d="M 20 120 C 50 140, 120 130, 150 70 C 165 40, 175 25, 185 20"
          stroke="url(#journeyGradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="4 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.85 }}
          transition={{ duration: 1.4, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="journeyGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fef08a" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>

      {/* The Liquid Glass Graduation Cap */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3, y: 15 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [-4, -14, -8],
        }}
        transition={{
          opacity: { duration: 0.6, delay: 0.95 },
          scale: { duration: 0.7, delay: 0.95, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 2.6, delay: 1.2, times: [0, 0.45, 1], ease: "easeInOut" },
        }}
        className="relative z-10 flex flex-col items-center justify-center"
      >
        {/* Cap Diamond Top (Frosted glass with specular bevel) */}
        <div className="relative w-28 h-14 flex items-center justify-center">
          <div
            className="w-24 h-12 rounded-xl bg-gradient-to-br from-white/35 via-cyan-300/15 to-slate-900/60 border border-white/40 shadow-[0_12px_30px_rgba(6,182,212,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)] backdrop-blur-2xl flex items-center justify-center transform rotate-[16deg] skew-x-12"
          >
            {/* Center Cap Button */}
            <div className="w-3 h-3 rounded-full bg-cyan-200 border border-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          </div>

          {/* Liquid Glass Tassel hanging down */}
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: [-6, 12, -4, 0] }}
            transition={{ duration: 2, delay: 1.3, ease: "easeInOut" }}
            className="absolute right-3 top-6 w-1 h-10 origin-top flex flex-col items-center"
          >
            <div className="w-0.5 h-6 bg-gradient-to-b from-cyan-200 to-amber-200" />
            <div className="w-2 h-4 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
          </motion.div>
        </div>

        {/* Cap Base Ring */}
        <div className="w-16 h-5 -mt-2 rounded-b-xl bg-gradient-to-b from-white/20 via-cyan-500/10 to-slate-950/80 border-x border-b border-white/25 backdrop-blur-xl shadow-lg" />

        {/* Delicate floating sparkle stars */}
        <motion.div
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="absolute -top-3 -left-4 text-cyan-200"
        >
          <Sparkles className="w-4 h-4" />
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
          className="absolute -bottom-2 -right-3 text-emerald-200"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default function FirstTimeWelcomeModal() {
  const { authUser, markWelcomeSeen } = useAuthContext();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const role = authUser?.role;
  const isTeacher = role === USER_ROLES.TEACHER; // 'creator'
  const isStudent = role === USER_ROLES.STUDENT; // 'user'

  // Safety guard: Admin must never see this modal
  if (!authUser || role === USER_ROLES.ADMIN || (!isTeacher && !isStudent)) {
    return null;
  }

  // Already seen guard
  if (authUser.hasSeenWelcome || !isVisible) {
    return null;
  }

  const handleDismissAndNavigate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Mark in backend & optimistic local update
      await markWelcomeSeen();
    } catch (err) {
      console.warn("Welcome dismiss error ignored to ensure seamless transition:", err);
    } finally {
      setIsVisible(false);
      // 2. Navigate smoothly to target destination
      if (isTeacher) {
        navigate("/lms/teach", { replace: true });
      } else {
        navigate("/lms/my-learning", { replace: true });
      }
    }
  };

  const handleSkip = (e) => {
    e.stopPropagation();
    handleDismissAndNavigate();
  };

  // Content specifications from requirements
  const title = isTeacher
    ? "Chào mừng đến với không gian giảng dạy"
    : "Chào mừng đến với không gian học tập";

  const description = isTeacher
    ? "Quản lý lớp học, bài giảng và đồng hành cùng học viên của bạn."
    : "Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn.";

  const actionButtonText = isTeacher ? "Bắt đầu giảng dạy" : "Bắt đầu học";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="first-time-welcome-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4 sm:px-6 select-none overflow-hidden bg-slate-950/85 backdrop-blur-2xl"
          style={{ willChange: "transform, opacity" }}
        >
          {/* Animated Soft Ambient Light Orbs (Cyan, Emerald, Amber - absolutely NO generic purple) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, 25, 0],
                      y: [0, -30, 0],
                      scale: [1, 1.15, 1],
                    }
              }
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-500/15 blur-[120px]"
            />
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, -30, 0],
                      y: [0, 35, 0],
                      scale: [1, 1.12, 1],
                    }
              }
              transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-500/15 blur-[120px]"
            />
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, 20, 0],
                      y: [0, 25, 0],
                      scale: [1, 1.08, 1],
                    }
              }
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-amber-400/10 blur-[130px]"
            />
          </div>

          {/* Central Liquid Glass Card (iOS Inspired) */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl mx-auto rounded-3xl p-7 sm:p-10 text-center border border-white/20 bg-gradient-to-b from-white/[0.12] via-slate-900/60 to-slate-950/80 shadow-[0_30px_100px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.35)] backdrop-blur-3xl overflow-hidden"
          >
            {/* Top Specular Sheen (Liquid Glass refraction line) */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="absolute top-0 right-1/4 w-1/2 h-24 bg-gradient-to-b from-white/10 to-transparent blur-md pointer-events-none transform -rotate-12" />

            {/* Subtle Skip Button at top right */}
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300/80 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/25 backdrop-blur-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label="Bỏ qua phần giới thiệu"
            >
              <span>Bỏ qua</span>
              <X className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
            </button>

            {/* 1. Animated Liquid Glass Visual */}
            <div className="pt-2">
              {isTeacher ? (
                <TeacherBookVisual shouldReduceMotion={shouldReduceMotion} />
              ) : (
                <StudentCapVisual shouldReduceMotion={shouldReduceMotion} />
              )}
            </div>

            {/* 2. Welcome Title (Word-by-word reveal) */}
            <h1 className="mt-2 text-2xl sm:text-3xl lg:text-[28px] font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)] leading-snug">
              <WordReveal
                text={title}
                delay={shouldReduceMotion ? 0 : 1.7}
                shouldReduceMotion={shouldReduceMotion}
              />
            </h1>

            {/* 3. Description line */}
            <motion.p
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: shouldReduceMotion ? 0.1 : 2.6,
                ease: "easeOut",
              }}
              className="mt-3 text-sm sm:text-base text-slate-300 font-normal leading-relaxed max-w-md mx-auto"
            >
              {description}
            </motion.p>

            {/* 4. Action Button with Slide-up & Fade */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: shouldReduceMotion ? 0.2 : 3.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <button
                type="button"
                onClick={handleDismissAndNavigate}
                disabled={isSubmitting}
                className="relative group w-full sm:w-auto min-w-[200px] inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl font-semibold text-sm sm:text-base text-slate-950 bg-gradient-to-r from-amber-300 via-amber-200 to-emerald-300 hover:from-amber-200 hover:to-emerald-200 shadow-[0_10px_30px_rgba(251,191,36,0.35),inset_0_1px_1px_rgba(255,255,255,0.8)] hover:shadow-[0_12px_35px_rgba(251,191,36,0.5)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
              >
                <span>{actionButtonText}</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </motion.div>

            {/* Subtle bottom note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: shouldReduceMotion ? 0.3 : 3.4, duration: 0.4 }}
              className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Chỉ hiển thị tại lần đăng nhập đầu tiên</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
