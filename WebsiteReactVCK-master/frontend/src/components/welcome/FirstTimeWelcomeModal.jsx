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
} from "lucide-react";
import { useAuthContext } from "../../context/AuthContext.jsx";
import { USER_ROLES } from "../../constants/roles.js";

/**
 * FirstTimeWelcomeModal
 * 
 * Liquid Glass welcome screen for first-time login of Teachers and Students.
 * Features ultra-refined visual craftsmanship:
 * - Liquid Glass iOS / Apple Keynote aesthetics: specular reflections, frosted glass, 3D depth.
 * - Non-purple palette: Deep ocean slate, cyan, emerald, champagne gold, warm amber.
 * - Teacher: 3D Liquid Glass Book opening with 3 layered flipping pages, warm radiant core,
 *            glowing golden knowledge threads, and floating educator compass emblem.
 * - Student: Dynamic multi-angle luminous starlight convergence, fusion flash, 3D beveled
 *            liquid glass mortarboard with physics-based swaying tassel, lifting with an
 *            extended glowing curved journey arc and twinkle starlight.
 * - Sequential reveal: Visual -> Title (word-by-word) -> Description -> Action button.
 * - Strict constraints: Zero bottom note banner, no generic purple, accessible with reduced motion.
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
          initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
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
// TEACHER VISUAL: 3D Liquid Glass Book with Flipping Pages & Warm Inner Glow
// ============================================================
const TeacherBookVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-32 h-32 mx-auto mb-6">
        <div className="absolute inset-0 rounded-3xl bg-amber-500/20 blur-2xl" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 border border-white/25 shadow-2xl backdrop-blur-xl text-amber-300">
          <BookOpen className="w-12 h-12 drop-shadow-[0_2px_10px_rgba(251,191,36,0.6)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center w-64 h-48 mx-auto mb-3 select-none perspective-[1200px]">
      {/* 1. Deep Radiant Warm Amber Core & Volumetric Glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: [0, 0.85, 1],
          scale: [0.4, 1.25, 1.1],
        }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute -inset-6 rounded-full bg-gradient-to-t from-amber-500/35 via-amber-300/20 to-emerald-400/10 blur-3xl pointer-events-none"
      />

      {/* Upward Warm God Rays */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: [0, 0.7, 0.4], scaleY: 1 }}
        transition={{ duration: 1.8, delay: 0.6, ease: "easeOut" }}
        className="absolute top-2 w-32 h-28 bg-gradient-to-t from-amber-300/30 via-amber-200/10 to-transparent blur-xl pointer-events-none origin-bottom"
      />

      {/* 2. Main Open Book Structure */}
      <motion.div
        initial={{ scale: 0.75, opacity: 0, rotateX: 22 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-52 h-36 flex items-center justify-center"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* SVG Curved Book Base (Left Wing & Right Wing with Natural Page Curvature) */}
        <svg
          className="absolute inset-0 w-full h-full overflow-visible drop-shadow-[0_20px_40px_rgba(0,0,0,0.65)]"
          viewBox="0 0 208 144"
          fill="none"
        >
          <defs>
            <linearGradient id="bookGlassLeft" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="bookGlassRight" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="goldSpine" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="pageThread" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#fef08a" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Left Bed Page (Curved Frosted Glass) */}
          <path
            d="M 104 18 C 70 14, 25 18, 10 26 C 8 28, 8 116, 10 118 C 25 110, 70 106, 104 112 Z"
            fill="url(#bookGlassLeft)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.2"
          />
          {/* Subtle text threads on left page */}
          <path d="M 28 42 Q 60 38, 92 41" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 28 56 Q 60 52, 85 55" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 28 70 Q 60 66, 90 69" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 28 84 Q 60 80, 75 83" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />

          {/* Right Bed Page (Curved Frosted Glass) */}
          <path
            d="M 104 18 C 138 14, 183 18, 198 26 C 200 28, 200 116, 198 118 C 183 110, 138 106, 104 112 Z"
            fill="url(#bookGlassRight)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.2"
          />
          {/* Subtle text threads on right page */}
          <path d="M 116 41 Q 148 38, 180 42" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 116 55 Q 148 52, 172 56" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 116 69 Q 148 66, 178 70" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 116 83 Q 148 80, 160 84" stroke="url(#pageThread)" strokeWidth="1.5" strokeLinecap="round" />

          {/* Golden Center Spine Highlight */}
          <line x1="104" y1="16" x2="104" y2="114" stroke="url(#goldSpine)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {/* 3. Layered 3D Flipping Pages (Right to Left) */}
        {/* Flipping Page 1 */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180, skewY: [0, -6, 0] }}
          transition={{ duration: 1.0, delay: 0.35, ease: [0.4, 0.0, 0.2, 1] }}
          className="absolute right-2 top-3 w-[98px] h-[98px] rounded-r-2xl border-y border-r border-amber-300/40 bg-gradient-to-l from-white/30 via-amber-200/20 to-transparent backdrop-blur-md shadow-lg"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        >
          <div className="p-3 space-y-2 opacity-50">
            <div className="h-1 bg-amber-200/50 rounded w-full" />
            <div className="h-1 bg-white/40 rounded w-3/4" />
            <div className="h-1 bg-white/40 rounded w-5/6" />
          </div>
        </motion.div>

        {/* Flipping Page 2 */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180, skewY: [0, -7, 0] }}
          transition={{ duration: 1.05, delay: 0.75, ease: [0.4, 0.0, 0.2, 1] }}
          className="absolute right-2 top-3 w-[98px] h-[98px] rounded-r-2xl border-y border-r border-white/50 bg-gradient-to-l from-white/35 via-emerald-200/15 to-transparent backdrop-blur-md shadow-lg"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        >
          <div className="p-3 space-y-2 opacity-50">
            <div className="h-1 bg-emerald-200/50 rounded w-full" />
            <div className="h-1 bg-white/40 rounded w-2/3" />
            <div className="h-1 bg-white/40 rounded w-4/5" />
          </div>
        </motion.div>

        {/* Flipping Page 3 (Final reveal page) */}
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -180, skewY: [0, -6, 0] }}
          transition={{ duration: 1.1, delay: 1.15, ease: [0.4, 0.0, 0.2, 1] }}
          className="absolute right-2 top-3 w-[98px] h-[98px] rounded-r-2xl border-y border-r border-amber-200/60 bg-gradient-to-l from-white/40 via-amber-300/25 to-transparent backdrop-blur-md shadow-xl"
          style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
        >
          <div className="p-3 space-y-2 opacity-60">
            <div className="h-1 bg-amber-300/60 rounded w-5/6" />
            <div className="h-1 bg-white/50 rounded w-3/4" />
            <div className="h-1 bg-white/40 rounded w-1/2" />
          </div>
        </motion.div>

        {/* 4. Illuminated Floating Educator Emblem (Emerges after 3rd page turns) */}
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.3 }}
          animate={{
            opacity: 1,
            y: -32,
            scale: 1,
          }}
          transition={{
            duration: 0.75,
            delay: 1.8,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="absolute z-20 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-white/40 via-amber-400/20 to-slate-900/60 border border-white/50 backdrop-blur-2xl shadow-[0_12px_30px_rgba(251,191,36,0.45),inset_0_1px_1px_rgba(255,255,255,0.7)] text-amber-200"
        >
          <Compass className="w-8 h-8 text-amber-300 drop-shadow-[0_2px_10px_rgba(251,191,36,0.7)]" />

          {/* Orbiting Sparkle Star */}
          <motion.div
            animate={{
              scale: [0.8, 1.3, 0.8],
              opacity: [0.5, 1, 0.5],
              rotate: [0, 90, 180],
            }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-2 -right-2 text-amber-300"
          >
            <StarSparkle className="w-5 h-5 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
          </motion.div>

          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.4, 0.9, 0.4],
            }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            className="absolute -bottom-1 -left-2 text-emerald-300"
          >
            <StarSparkle className="w-4 h-4 drop-shadow-[0_0_6px_rgba(110,231,183,0.8)]" />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};

// ============================================================
// STUDENT VISUAL: Multi-Particle Convergence, Glass Mortarboard & Curved Journey Arc
// ============================================================
const StudentCapVisual = ({ shouldReduceMotion }) => {
  if (shouldReduceMotion) {
    return (
      <div className="relative flex items-center justify-center w-32 h-32 mx-auto mb-6">
        <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 blur-2xl" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 border border-white/25 shadow-2xl backdrop-blur-xl text-cyan-300">
          <GraduationCap className="w-12 h-12 drop-shadow-[0_2px_10px_rgba(103,232,249,0.6)]" />
        </div>
      </div>
    );
  }

  // 14 converging particles with dynamic trajectory origins and delays
  const particles = [
    { startX: -130, startY: -60, delay: 0.05, size: 3.5, color: "bg-cyan-200" },
    { startX: 130, startY: -55, delay: 0.1, size: 3, color: "bg-teal-200" },
    { startX: -110, startY: 50, delay: 0.15, size: 3, color: "bg-emerald-200" },
    { startX: 115, startY: 60, delay: 0.12, size: 4, color: "bg-cyan-100" },
    { startX: 0, startY: -100, delay: 0.22, size: 3.5, color: "bg-amber-100" },
    { startX: -70, startY: -85, delay: 0.18, size: 2.5, color: "bg-cyan-300" },
    { startX: 75, startY: -80, delay: 0.25, size: 3, color: "bg-teal-100" },
    { startX: 0, startY: 90, delay: 0.2, size: 3.5, color: "bg-emerald-100" },
    { startX: -140, startY: 0, delay: 0.08, size: 3, color: "bg-cyan-200" },
    { startX: 140, startY: 10, delay: 0.14, size: 3.5, color: "bg-cyan-100" },
    { startX: -45, startY: 75, delay: 0.28, size: 2.5, color: "bg-teal-200" },
    { startX: 55, startY: 75, delay: 0.26, size: 3, color: "bg-amber-200" },
    { startX: -95, startY: -20, delay: 0.16, size: 3, color: "bg-cyan-200" },
    { startX: 95, startY: -20, delay: 0.24, size: 2.5, color: "bg-teal-100" },
  ];

  return (
    <div className="relative flex items-center justify-center w-64 h-48 mx-auto mb-2 select-none">
      {/* 1. Ambient Background Glow Aura (Cyan, Teal, Amber - Zero Purple) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: [0, 0.75, 0.9],
          scale: [0.4, 1.2, 1.05],
        }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute -inset-6 rounded-full bg-gradient-to-r from-cyan-500/25 via-teal-400/20 to-emerald-400/20 blur-3xl pointer-events-none"
      />

      {/* 2. Converging Starlight Particles Swarm */}
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
            opacity: [0, 1, 0.8, 0],
            scale: [0.3, 1.6, 1, 0.2],
          }}
          transition={{
            duration: 1.05,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ width: `${p.size}px`, height: `${p.size}px` }}
          className={`absolute rounded-full ${p.color} shadow-[0_0_12px_rgba(103,232,249,0.9)] pointer-events-none z-10`}
        />
      ))}

      {/* Fusion Nova Flash when particles collide at center */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: [0, 1.8, 2.4],
          opacity: [0, 0.9, 0],
        }}
        transition={{
          duration: 0.7,
          delay: 0.9,
          ease: "easeOut",
        }}
        className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-cyan-300 via-teal-200 to-amber-200 blur-md pointer-events-none z-10"
      />

      {/* 3. Curved Luminous Journey Arc (Flows gracefully behind the cap) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
        viewBox="0 0 256 192"
        fill="none"
      >
        <defs>
          <linearGradient id="journeyArcGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="45%" stopColor="#2dd4bf" stopOpacity="0.85" />
            <stop offset="80%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <filter id="arcBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Ambient Soft Blur Track */}
        <motion.path
          d="M 15 155 C 65 175, 120 155, 165 95 C 195 55, 215 32, 240 22"
          stroke="url(#journeyArcGlow)"
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#arcBlur)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5 }}
          transition={{ duration: 1.4, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Crisp Radiant Journey Path */}
        <motion.path
          d="M 15 155 C 65 175, 120 155, 165 95 C 195 55, 215 32, 240 22"
          stroke="url(#journeyArcGlow)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="6 8"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.95 }}
          transition={{ duration: 1.3, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Lead Shooting Star at the tip of the arc */}
        <motion.circle
          cx="240"
          cy="22"
          r="3.5"
          fill="#ffffff"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0.9] }}
          transition={{ duration: 0.5, delay: 2.4, ease: "easeOut" }}
          className="drop-shadow-[0_0_10px_rgba(255,255,255,1)]"
        />
      </svg>

      {/* 4. The 3D Liquid Glass Graduation Cap (Forms & Gently Lifts) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.35, y: 18 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [-2, -15, -10],
          rotate: [-1, 1.5, 0],
        }}
        transition={{
          opacity: { duration: 0.6, delay: 0.9 },
          scale: { duration: 0.75, delay: 0.9, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 2.8, delay: 1.1, times: [0, 0.5, 1], ease: "easeInOut" },
          rotate: { duration: 3.2, delay: 1.1, ease: "easeInOut" },
        }}
        className="relative z-10 flex flex-col items-center justify-center drop-shadow-[0_20px_35px_rgba(6,182,212,0.35)]"
      >
        {/* SVG Detailed 3D Glass Mortarboard Top & Beveled Crystal Edges */}
        <div className="relative w-36 h-20 flex items-center justify-center">
          <svg
            viewBox="0 0 144 80"
            className="w-full h-full overflow-visible"
            fill="none"
          >
            <defs>
              {/* Upper Glass Plane */}
              <linearGradient id="capGlassSurface" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                <stop offset="35%" stopColor="#67e8f9" stopOpacity="0.22" />
                <stop offset="70%" stopColor="#0f172a" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.3" />
              </linearGradient>

              {/* Beveled Edge Highlight */}
              <linearGradient id="capBevel" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.8" />
              </linearGradient>

              {/* Skull Cap Gradient */}
              <linearGradient id="skullBand" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                <stop offset="50%" stopColor="#0f172a" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* Skull band (lower head support) */}
            <path
              d="M 52 42 Q 72 56, 92 42 L 94 56 Q 72 70, 50 56 Z"
              fill="url(#skullBand)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />

            {/* Mortarboard Diamond Top */}
            <polygon
              points="72,8 136,36 72,64 8,36"
              fill="url(#capGlassSurface)"
              stroke="url(#capBevel)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />

            {/* Specular Glare Diagonal Slash across glass face */}
            <line
              x1="32"
              y1="34"
              x2="112"
              y2="38"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />

            {/* Center Crystal Button */}
            <circle
              cx="72"
              cy="36"
              r="4.5"
              fill="#cffafe"
              stroke="#ffffff"
              strokeWidth="1.5"
              className="drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
            />
          </svg>

          {/* Golden Silk Tassel with Physics-based Sway */}
          <motion.div
            initial={{ rotate: 0 }}
            animate={{
              rotate: [-14, 12, -7, 3, 0],
            }}
            transition={{
              duration: 2.6,
              delay: 1.25,
              ease: "easeInOut",
            }}
            className="absolute right-5 top-9 origin-top flex flex-col items-center pointer-events-none"
          >
            {/* Tassel cord */}
            <div className="w-0.5 h-7 bg-gradient-to-b from-cyan-200 via-amber-200 to-amber-300" />
            {/* Tassel head ring */}
            <div className="w-2.5 h-2.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)] -mt-0.5" />
            {/* Tassel brush */}
            <div className="w-2 h-5 rounded-b bg-gradient-to-b from-amber-300 to-amber-500 shadow-[0_2px_8px_rgba(251,191,36,0.5)]" />
          </motion.div>
        </div>

        {/* 5. Delicate Floating Sparkle Stars */}
        <motion.div
          animate={{
            scale: [0.8, 1.35, 0.8],
            opacity: [0.4, 1, 0.4],
            rotate: [0, 90, 180],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="absolute -top-3 -left-3 text-cyan-200"
        >
          <StarSparkle className="w-5 h-5 drop-shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
        </motion.div>

        <motion.div
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.3, 0.95, 0.3],
            rotate: [180, 90, 0],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute -bottom-1 -right-4 text-emerald-200"
        >
          <StarSparkle className="w-4 h-4 drop-shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
        </motion.div>

        <motion.div
          animate={{
            scale: [0.7, 1.25, 0.7],
            opacity: [0.2, 0.8, 0.2],
          }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
          className="absolute top-2 right-1 text-amber-200"
        >
          <Sparkles className="w-3.5 h-3.5 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        </motion.div>
      </motion.div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
