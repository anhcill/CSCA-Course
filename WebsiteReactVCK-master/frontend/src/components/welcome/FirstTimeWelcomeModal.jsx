import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  X,
} from "lucide-react";
import { useAuthContext } from "../../context/AuthContext.jsx";
import { USER_ROLES } from "../../constants/roles.js";
import { fetchWelcomeSettingsApi } from "../../features/api/lmsClient.js";
import { Lottie } from "lottie-react";
import pigeonAnimation from "../../assets/pigeon.json";
import magicBookAnimation from "../../assets/magic-book.json";

/**
 * FirstTimeWelcomeModal
 * 
 * Full-screen Cinematic Liquid Glass welcome experience for first-time login.
 * - Full-screen edge-to-edge immersive presentation (NO small boxed modal).
 * - NO close or skip button (completely clean, cinema style).
 * - Automatic smooth transition to LMS dashboard after animation finishes.
 * - Teacher: 3D Liquid Glass Open Book with layered flipping pages, warm amber radiance & educator emblem.
 * - Student: Multi-particle convergence, fusion flash, 3D glass mortarboard with physics tassel,
 *            extended curved journey arc & twinkle stars.
 * - Fluid Liquid Glass iOS aesthetics: specular highlights, deep ocean slate, cyan, emerald, amber.
 */

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_WELCOME_CONFIG = {
  badge: "MolyCourse LMS",
  autoTransitionDuration: 4.8,
  autoTransitionEnabled: true,
  teacher: {
    title: "Chào mừng đến với không gian giảng dạy",
    description: "Quản lý lớp học, bài giảng và đồng hành cùng học viên của bạn.",
    buttonText: "Bắt đầu giảng dạy",
    loadingNote: "Đang chuẩn bị không gian giảng dạy của bạn...",
  },
  student: {
    title: "Chào mừng đến với không gian học tập",
    description: "Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn.",
    buttonText: "Bắt đầu học",
    loadingNote: "Đang chuẩn bị không gian học tập của bạn...",
  },
};

// Stagger word reveal animation helper
export const WordReveal = ({ text, delay = 0, shouldReduceMotion }) => {
  const words = useMemo(() => (text ? text.split(" ") : []), [text]);

  if (shouldReduceMotion) {
    return <span>{text}</span>;
  }

  return (
    <span className="inline-flex flex-wrap justify-center gap-x-3 sm:gap-x-4">
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.5,
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

// 4-Point Starlight SVG Component
const StarSparkle = ({ className, style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
  </svg>
);

// ============================================================
// TEACHER VISUAL: Full-Size 3D Liquid Glass Book with Flipping Pages
// ============================================================
export const TeacherBookVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-amber-500/25 blur-3xl" />
        <div className="relative flex items-center justify-center w-28 h-28">
          <Lottie
            src={magicBookAnimation}
            loop={true}
            autoplay={true}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center w-72 sm:w-80 h-52 sm:h-56 mx-auto select-none">
      {/* Radiant Warm Amber Volumetric Glow Core */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: [0, 0.9, 1],
          scale: [0.4, 1.35, 1.15],
        }}
        transition={{ duration: 2.4, ease: "easeOut" }}
        className="absolute -inset-8 rounded-full bg-gradient-to-t from-amber-500/40 via-amber-300/25 to-emerald-400/15 blur-3xl pointer-events-none"
      />

      {/* Upward Volumetric Warm Light Beams */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: [0, 0.8, 0.45], scaleY: 1 }}
        transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
        className="absolute top-0 w-44 h-36 bg-gradient-to-t from-amber-300/35 via-amber-200/15 to-transparent blur-2xl pointer-events-none origin-bottom"
      />

      {/* Main Animated Magic Book */}
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-48 sm:w-56 h-48 sm:h-56 flex items-center justify-center filter drop-shadow-[0_20px_40px_rgba(251,191,36,0.35)]"
      >
        <Lottie
          src={magicBookAnimation}
          loop={true}
          autoplay={true}
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
        />
      </motion.div>
    </div>
  );
};

// ============================================================
// STUDENT VISUAL: Full-Size Starlight Convergence & 3D Glass Mortarboard
// ============================================================
export const StudentCapVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="relative flex items-center justify-center w-28 h-28">
          <Lottie
            src={pigeonAnimation}
            loop={true}
            autoplay={true}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    );
  }

  // 14 converging particles with dynamic trajectory origins and delays
  const particles = [
    { startX: -160, startY: -80, delay: 0.05, size: 4, color: "bg-cyan-200" },
    { startX: 160, startY: -75, delay: 0.1, size: 3.5, color: "bg-teal-200" },
    { startX: -130, startY: 70, delay: 0.15, size: 3.5, color: "bg-emerald-200" },
    { startX: 135, startY: 80, delay: 0.12, size: 4.5, color: "bg-cyan-100" },
    { startX: 0, startY: -130, delay: 0.22, size: 4, color: "bg-amber-100" },
    { startX: -90, startY: -110, delay: 0.18, size: 3, color: "bg-cyan-300" },
    { startX: 95, startY: -105, delay: 0.25, size: 3.5, color: "bg-teal-100" },
    { startX: 0, startY: 120, delay: 0.2, size: 4, color: "bg-emerald-100" },
    { startX: -170, startY: 0, delay: 0.08, size: 3.5, color: "bg-cyan-200" },
    { startX: 170, startY: 15, delay: 0.14, size: 4, color: "bg-cyan-100" },
    { startX: -60, startY: 95, delay: 0.28, size: 3, color: "bg-teal-200" },
    { startX: 70, startY: 95, delay: 0.26, size: 3.5, color: "bg-amber-200" },
    { startX: -120, startY: -30, delay: 0.16, size: 3.5, color: "bg-cyan-200" },
    { startX: 120, startY: -30, delay: 0.24, size: 3, color: "bg-teal-100" },
  ];

  return (
    <div className="relative flex items-center justify-center w-72 sm:w-88 h-52 sm:h-60 mx-auto select-none">
      {/* Ambient Background Glow Aura (Cyan, Teal, Amber - Zero Purple) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: [0, 0.85, 1],
          scale: [0.4, 1.3, 1.1],
        }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute -inset-8 rounded-full bg-gradient-to-r from-cyan-500/30 via-teal-400/25 to-emerald-400/20 blur-3xl pointer-events-none"
      />

      {/* Converging Starlight Particles Swarm */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{
            x: p.startX,
            y: p.startY,
            opacity: 0,
            scale: 0.3,
          }}
          animate={{
            x: 0,
            y: 0,
            opacity: [0, 1, 0.85, 0],
            scale: [0.3, 1.7, 1, 0.2],
          }}
          transition={{
            duration: 1.1,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ width: `${p.size}px`, height: `${p.size}px` }}
          className={`absolute rounded-full ${p.color} shadow-[0_0_14px_rgba(103,232,249,0.95)] pointer-events-none z-10`}
        />
      ))}

      {/* Fusion Nova Flash when particles collide at center */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: [0, 2, 2.8],
          opacity: [0, 0.95, 0],
        }}
        transition={{
          duration: 0.75,
          delay: 0.9,
          ease: "easeOut",
        }}
        className="absolute w-24 h-24 rounded-full bg-gradient-to-r from-cyan-300 via-teal-200 to-amber-200 blur-lg pointer-events-none z-10"
      />

      {/* Curved Luminous Journey Arc (Flows gracefully behind the cap) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
        viewBox="0 0 320 240"
        fill="none"
      >
        <defs>
          <linearGradient id="journeyArcGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="45%" stopColor="#2dd4bf" stopOpacity="0.9" />
            <stop offset="80%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <filter id="arcBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Ambient Soft Blur Track */}
        <motion.path
          d="M 20 190 C 80 215, 150 190, 205 115 C 245 65, 270 38, 305 25"
          stroke="url(#journeyArcGlow)"
          strokeWidth="8"
          strokeLinecap="round"
          filter="url(#arcBlur)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.55 }}
          transition={{ duration: 1.5, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Crisp Radiant Journey Path */}
        <motion.path
          d="M 20 190 C 80 215, 150 190, 205 115 C 245 65, 270 38, 305 25"
          stroke="url(#journeyArcGlow)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="8 10"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Lead Shooting Star at the tip of the arc */}
        <motion.circle
          cx="305"
          cy="25"
          r="4.5"
          fill="#ffffff"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.95] }}
          transition={{ duration: 0.5, delay: 2.5, ease: "easeOut" }}
          className="drop-shadow-[0_0_12px_rgba(255,255,255,1)]"
        />
      </svg>

      {/* The 3D Liquid Glass Graduation Cap (Forms & Gently Lifts) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.35, y: 20 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [-2, -18, -12],
          rotate: [-1, 1.5, 0],
        }}
        transition={{
          opacity: { duration: 0.6, delay: 0.9 },
          scale: { duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 3, delay: 1.1, times: [0, 0.5, 1], ease: "easeInOut" },
          rotate: { duration: 3.2, delay: 1.1, ease: "easeInOut" },
        }}
        className="relative z-10 flex flex-col items-center justify-center drop-shadow-[0_25px_45px_rgba(6,182,212,0.4)]"
      >
        {/* Animated Pigeon Character */}
        <div className="relative w-48 sm:w-56 h-48 sm:h-56 flex items-center justify-center filter drop-shadow-[0_15px_30px_rgba(6,182,212,0.35)]">
          <Lottie
            src={pigeonAnimation}
            loop={true}
            autoplay={true}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Delicate Floating Sparkle Stars */}
        <motion.div
          animate={{
            scale: [0.8, 1.4, 0.8],
            opacity: [0.4, 1, 0.4],
            rotate: [0, 90, 180],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="absolute -top-3 -left-4 text-cyan-200"
        >
          <StarSparkle className="w-6 h-6 drop-shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
        </motion.div>

        <motion.div
          animate={{
            scale: [1, 1.45, 1],
            opacity: [0.3, 0.95, 0.3],
            rotate: [180, 90, 0],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute -bottom-1 -right-5 text-emerald-200"
        >
          <StarSparkle className="w-5 h-5 drop-shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
        </motion.div>

        <motion.div
          animate={{
            scale: [0.7, 1.3, 0.7],
            opacity: [0.2, 0.85, 0.2],
          }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
          className="absolute top-2 right-2 text-amber-200"
        >
          <Sparkles className="w-4 h-4 drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]" />
        </motion.div>
      </motion.div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT: Full-Screen Edge-to-Edge Liquid Glass Showcase
// ============================================================
export default function FirstTimeWelcomeModal({
  isPreview = false,
  previewRole = null,
  customConfig = null,
  onClose = null,
  embedded = false,
} = {}) {
  const { authUser, markWelcomeSeen } = useAuthContext();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [serverConfig, setServerConfig] = useState(null);

  // Fetch customizable settings from server when live (not in preview with local edits)
  useEffect(() => {
    if (isPreview || customConfig) return;
    let isSubscribed = true;
    fetchWelcomeSettingsApi()
      .then((res) => {
        if (isSubscribed && res?.data) {
          setServerConfig(res.data);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch welcome settings, using defaults:", err);
      });
    return () => {
      isSubscribed = false;
    };
  }, [isPreview, customConfig]);

  const activeConfig = customConfig || serverConfig || DEFAULT_WELCOME_CONFIG;

  const role = isPreview ? (previewRole || USER_ROLES.STUDENT) : authUser?.role;
  const isTeacher = role === USER_ROLES.TEACHER || role === "creator" || role === "teacher";
  const isStudent = role === USER_ROLES.STUDENT || role === "user" || role === "student";

  const handleDismissAndNavigate = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (isPreview) {
      setIsVisible(false);
      onClose?.();
      return;
    }

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
  }, [isSubmitting, isPreview, onClose, markWelcomeSeen, isTeacher, navigate]);

  const durationSec = typeof activeConfig.autoTransitionDuration === "number"
    ? activeConfig.autoTransitionDuration
    : 4.8;
  const autoTransitionEnabled = activeConfig.autoTransitionEnabled !== false;

  // Automatic Scene Transition: After animation finishes, auto-transition smoothly to LMS
  useEffect(() => {
    if (!isVisible || isSubmitting) return;
    if (!autoTransitionEnabled) return;
    if (embedded) return; // In embedded preview inside admin dashboard, don't auto-dismiss

    const autoTransitionDurationMs = shouldReduceMotion
      ? Math.max(1800, durationSec * 600)
      : durationSec * 1000;

    const timer = setTimeout(() => {
      handleDismissAndNavigate();
    }, autoTransitionDurationMs);

    return () => clearTimeout(timer);
  }, [isVisible, isSubmitting, autoTransitionEnabled, embedded, shouldReduceMotion, durationSec, handleDismissAndNavigate]);

  // Safety guard: Admin must never see this modal in real mode
  if (!isPreview) {
    if (!authUser || role === USER_ROLES.ADMIN || (!isTeacher && !isStudent)) {
      return null;
    }

    // Already seen guard
    if (authUser.hasSeenWelcome || !isVisible) {
      return null;
    }
  }

  // Content specifications
  const roleData = isTeacher ? activeConfig.teacher : activeConfig.student;
  const fallbackRoleData = isTeacher ? DEFAULT_WELCOME_CONFIG.teacher : DEFAULT_WELCOME_CONFIG.student;

  const title = roleData?.title?.trim() || fallbackRoleData.title;
  const description = roleData?.description?.trim() || fallbackRoleData.description;
  const actionButtonText = roleData?.buttonText?.trim() || fallbackRoleData.buttonText;
  const loadingNote = roleData?.loadingNote?.trim() || fallbackRoleData.loadingNote;
  const badgeText = activeConfig.badge?.trim() || DEFAULT_WELCOME_CONFIG.badge;

  const containerClasses = embedded
    ? "relative w-full h-[620px] rounded-2xl overflow-hidden bg-slate-950 flex flex-col justify-between py-8 px-4 sm:px-8 select-none border border-slate-800 shadow-2xl"
    : "fixed inset-0 z-[9999] h-screen w-screen overflow-hidden bg-slate-950 flex flex-col justify-between py-12 sm:py-16 px-6 sm:px-12 select-none";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="first-time-welcome-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: "blur(14px)" }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className={containerClasses}
          style={{ willChange: "transform, opacity, filter" }}
        >
          {isPreview && !embedded && (
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
              <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                Chế độ xem trước ({isTeacher ? "Giáo viên" : "Học viên"})
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsVisible(false);
                  onClose?.();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700/90 text-white text-xs font-medium border border-white/20 shadow-xl backdrop-blur-md cursor-pointer transition-all hover:scale-105 active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
                <span>Thoát xem trước</span>
              </button>
            </div>
          )}
          {/* Edge-to-edge Ambient Fluid Light Orbs (Cyan, Emerald, Amber - NO generic purple) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, 40, 0],
                      y: [0, -50, 0],
                      scale: [1, 1.2, 1],
                    }
              }
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-cyan-500/20 blur-[150px]"
            />
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, -45, 0],
                      y: [0, 50, 0],
                      scale: [1, 1.15, 1],
                    }
              }
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/18 blur-[160px]"
            />
            <motion.div
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      x: [0, 30, 0],
                      y: [0, 30, 0],
                      scale: [1, 1.1, 1],
                    }
              }
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-amber-400/15 blur-[170px]"
            />

            {/* Subtle Liquid Glass Specular Sheen across the whole screen */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(255,255,255,0.06),transparent_70%)]" />
          </div>

          {/* Top Brand Watermark */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative z-10 w-full flex items-center justify-center text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-xs font-semibold tracking-wider uppercase text-slate-300/80">
                {badgeText}
              </span>
            </div>
          </motion.div>

          {/* Central Full-Screen Content Showcase */}
          <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center my-auto px-4">
            {/* 1. Animated Liquid Glass Visual */}
            <div className="mb-4 sm:mb-6">
              {isTeacher ? (
                <TeacherBookVisual shouldReduceMotion={shouldReduceMotion} />
              ) : (
                <StudentCapVisual shouldReduceMotion={shouldReduceMotion} />
              )}
            </div>

            {/* 2. Welcome Title (Word-by-word reveal) */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[44px] font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(255,255,255,0.35)] leading-tight max-w-3xl">
              <WordReveal
                text={title}
                delay={shouldReduceMotion ? 0 : 1.7}
                shouldReduceMotion={shouldReduceMotion}
              />
            </h1>

            {/* 3. Description line */}
            <motion.p
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: shouldReduceMotion ? 0.1 : 2.6,
                ease: "easeOut",
              }}
              className="mt-4 sm:mt-5 text-base sm:text-lg md:text-xl text-slate-300/90 font-light leading-relaxed max-w-2xl mx-auto drop-shadow"
            >
              {description}
            </motion.p>

            {/* 4. Action Button with Slide-up & Glow */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: shouldReduceMotion ? 0.2 : 3.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="mt-8 sm:mt-10 flex items-center justify-center"
            >
              <button
                type="button"
                onClick={handleDismissAndNavigate}
                disabled={isSubmitting}
                className="relative group min-w-[220px] sm:min-w-[250px] inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-bold text-base sm:text-lg text-slate-950 bg-gradient-to-r from-amber-300 via-amber-200 to-emerald-300 hover:from-amber-200 hover:to-emerald-200 shadow-[0_12px_40px_rgba(251,191,36,0.4),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:shadow-[0_15px_45px_rgba(251,191,36,0.55)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-300/60 cursor-pointer"
              >
                <span>{actionButtonText}</span>
                <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </motion.div>
          </div>

          {/* Bottom Area: Cinematic Auto-Transition Indicator & Progress Line */}
          <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center gap-3">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
              className="text-xs text-slate-400/80 tracking-wider text-center px-4"
            >
              {loadingNote}
            </motion.span>

            {/* Glowing countdown progress bar */}
            <div className="w-48 sm:w-64 h-1 rounded-full bg-white/10 overflow-hidden backdrop-blur-md">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{
                  duration: shouldReduceMotion ? Math.max(1.8, durationSec * 0.6) : durationSec,
                  ease: "linear",
                }}
                className="h-full bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
