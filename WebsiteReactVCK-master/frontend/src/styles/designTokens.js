/**
 * CSCA LMS - DESIGN TOKENS & SYSTEM
 * 
 * Bảng quy chuẩn Design System cho toàn bộ các màn hình LMS (Student, Teacher, Admin).
 * Tuân thủ nguyên tắc thiết kế giáo dục, hiện đại, tối giản, độ tương phản cao.
 */

export const DESIGN_TOKENS = {
  colors: {
    // Brand Primary - Sắc xanh nước biển nhạt Monet (Light Sea Blue)
    primary: {
      DEFAULT: '#2b76a4', // Deep sea blue
      hover: '#205b80',   // Hover
      light: 'rgba(43, 118, 164, 0.1)',
      border: 'rgba(197, 226, 243, 0.6)',
      glow: 'rgba(43, 118, 164, 0.25)',
    },
    // Accent Sunrise Coral - Lấy từ mặt trời mọc trong tranh Monet
    accent: {
      DEFAULT: '#f05d3b', // sunrise coral
      hover: '#d84827',   // dark sunrise coral
      light: 'rgba(240, 93, 59, 0.12)',
      border: 'rgba(240, 93, 59, 0.25)',
      text: '#f05d3b',    // sunrise text
    },
    // Semantic States
    success: {
      DEFAULT: '#10b981', // emerald-500
      light: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.25)',
      text: '#34d399',    // emerald-400
    },
    info: {
      DEFAULT: '#0ea5e9', // sky-500
      light: 'rgba(14, 165, 233, 0.12)',
      border: 'rgba(14, 165, 233, 0.25)',
      text: '#38bdf8',    // sky-400
    },
    warning: {
      DEFAULT: '#f97316', // orange-500
      light: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.25)',
      text: '#fb923c',    // orange-400
    },
    danger: {
      DEFAULT: '#ef4444', // red-500
      light: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.25)',
      text: '#f87171',    // red-400
    },
    // Dark Theme Backgrounds
    dark: {
      bg: '#020617',        // slate-950
      card: '#0f172a',      // slate-900
      cardElevated: '#1e293b', // slate-800
      border: 'rgba(255, 255, 255, 0.08)',
      borderHover: 'rgba(255, 255, 255, 0.16)',
      textPrimary: '#f8fafc',  // slate-50
      textSecondary: '#94a3b8',// slate-400
      textMuted: '#64748b',    // slate-500
    }
  },

  radius: {
    sm: 'rounded-lg',    // 8px
    md: 'rounded-xl',    // 12px
    lg: 'rounded-2xl',   // 16px
    xl: 'rounded-3xl',   // 24px
    full: 'rounded-full'
  },

  shadows: {
    card: 'shadow-lg shadow-black/20',
    elevated: 'shadow-2xl shadow-black/40',
    primaryGlow: 'shadow-lg shadow-rose-600/25',
    accentGlow: 'shadow-lg shadow-amber-500/25',
  }
};

/**
 * Các class Tailwind tái sử dụng chuẩn hóa UI
 */
export const UI_CLASSES = {
  // Container bám sát viewport
  container: 'container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl',

  // Cards
  card: 'bg-slate-900/80 border border-white/10 rounded-2xl p-5 sm:p-6 backdrop-blur-md transition-all duration-200',
  cardHover: 'hover:border-white/20 hover:bg-slate-900 shadow-lg hover:shadow-xl',
  cardGlowRose: 'border-rose-500/20 hover:border-rose-500/40 bg-gradient-to-br from-rose-500/5 via-slate-900/90 to-slate-900',
  cardGlowAmber: 'border-amber-400/20 hover:border-amber-400/40 bg-gradient-to-br from-amber-400/5 via-slate-900/90 to-slate-900',

  // Buttons
  btnPrimary: 'inline-flex items-center justify-center gap-2 font-bold px-4 py-2.5 rounded-xl bg-[#2b76a4] hover:bg-[#205b80] text-white text-sm shadow-md shadow-[#2b76a4]/30 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
  btnAccent: 'inline-flex items-center justify-center gap-2 font-bold px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm shadow-md shadow-amber-400/20 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary: 'inline-flex items-center justify-center gap-2 font-bold px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-white/10 transition active:scale-[0.98]',
  btnGhost: 'inline-flex items-center justify-center gap-2 font-semibold px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 text-sm transition',
  btnDanger: 'inline-flex items-center justify-center gap-2 font-bold px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm border border-red-500/30 transition active:scale-[0.98]',

  // Badges / Tags
  badgeRose: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25',
  badgeAmber: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/25',
  badgeEmerald: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  badgeSky: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25',
  badgeSlate: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-white/10',

  // Input & Forms
  input: 'w-full rounded-xl bg-slate-950/80 border border-white/15 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition',
  
  // Section Headers
  sectionTitle: 'text-2xl sm:text-3xl font-black text-white tracking-tight',
  sectionSubtitle: 'text-sm sm:text-base text-slate-400 mt-1 max-w-2xl',
};
