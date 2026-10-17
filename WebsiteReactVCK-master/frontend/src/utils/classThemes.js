/**
 * High-quality, theme-compatible color palettes for classes across LMS
 * Designed to look vibrant and accessible in both Light and Dark mode.
 */
export const CLASS_THEMES = [
  // 1. Ocean Blue
  {
    name: "blue",
    topBar: "from-blue-500 via-indigo-500 to-sky-500",
    cardBorder: "border-blue-300 dark:border-blue-500/60",
    borderHover: "hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-blue-500/20",
    codeBadge: "bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-sky-300 ring-1 ring-blue-200 dark:ring-blue-800/70",
    studentBox: "bg-blue-50/60 dark:bg-blue-950/40 border-blue-200/70 dark:border-blue-900/60",
    studentText: "text-blue-700 dark:text-sky-300",
    accentText: "text-blue-600 dark:text-sky-400",
    glow: "from-blue-500/20 to-indigo-500/10",
    buttonBg: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-600/25 active:scale-95",
    iconBg: "bg-blue-500/10 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400 border border-blue-200 dark:border-blue-900/60 group-hover:bg-blue-600 group-hover:text-white",
    badge: "bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800",
  },
  // 2. Neon Purple / Fuchsia
  {
    name: "purple",
    topBar: "from-purple-500 via-fuchsia-500 to-pink-500",
    cardBorder: "border-purple-300 dark:border-purple-500/60",
    borderHover: "hover:border-purple-500 dark:hover:border-purple-400 hover:shadow-purple-500/20",
    codeBadge: "bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-800/70",
    studentBox: "bg-purple-50/60 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-900/60",
    studentText: "text-purple-700 dark:text-purple-300",
    accentText: "text-purple-600 dark:text-purple-400",
    glow: "from-purple-500/20 to-pink-500/10",
    buttonBg: "bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-md shadow-purple-600/25 active:scale-95",
    iconBg: "bg-purple-500/10 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200 dark:border-purple-900/60 group-hover:bg-purple-600 group-hover:text-white",
    badge: "bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
  },
  // 3. Vivid Emerald / Mint
  {
    name: "emerald",
    topBar: "from-emerald-500 via-teal-500 to-cyan-500",
    cardBorder: "border-emerald-300 dark:border-emerald-500/60",
    borderHover: "hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-emerald-500/20",
    codeBadge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/70",
    studentBox: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/60",
    studentText: "text-emerald-700 dark:text-emerald-300",
    accentText: "text-emerald-600 dark:text-emerald-400",
    glow: "from-emerald-500/20 to-teal-500/10",
    buttonBg: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/25 active:scale-95",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 group-hover:bg-emerald-600 group-hover:text-white",
    badge: "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  },
  // 4. Sunset Amber / Tangerine
  {
    name: "amber",
    topBar: "from-amber-400 via-orange-500 to-rose-500",
    cardBorder: "border-amber-300 dark:border-amber-500/60",
    borderHover: "hover:border-amber-500 dark:hover:border-amber-400 hover:shadow-amber-500/20",
    codeBadge: "bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800/70",
    studentBox: "bg-amber-50/60 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-900/60",
    studentText: "text-amber-700 dark:text-amber-300",
    accentText: "text-amber-600 dark:text-amber-400",
    glow: "from-amber-500/20 to-orange-500/10",
    buttonBg: "bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white shadow-md shadow-orange-600/25 active:scale-95",
    iconBg: "bg-amber-500/10 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 group-hover:bg-amber-600 group-hover:text-white",
    badge: "bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  },
  // 5. Electric Cyan / Sky
  {
    name: "cyan",
    topBar: "from-cyan-400 via-teal-500 to-blue-500",
    cardBorder: "border-cyan-300 dark:border-cyan-500/60",
    borderHover: "hover:border-cyan-500 dark:hover:border-cyan-400 hover:shadow-cyan-500/20",
    codeBadge: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-800/70",
    studentBox: "bg-cyan-50/60 dark:bg-cyan-950/40 border-cyan-200/70 dark:border-cyan-900/60",
    studentText: "text-cyan-700 dark:text-cyan-300",
    accentText: "text-cyan-600 dark:text-cyan-400",
    glow: "from-cyan-500/20 to-teal-500/10",
    buttonBg: "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white shadow-md shadow-cyan-600/25 active:scale-95",
    iconBg: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-900/60 group-hover:bg-cyan-600 group-hover:text-white",
    badge: "bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800",
  },
  // 6. Rose / Hot Pink
  {
    name: "rose",
    topBar: "from-rose-500 via-pink-500 to-red-500",
    cardBorder: "border-rose-300 dark:border-rose-500/60",
    borderHover: "hover:border-rose-500 dark:hover:border-rose-400 hover:shadow-rose-500/20",
    codeBadge: "bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800/70",
    studentBox: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-900/60",
    studentText: "text-rose-700 dark:text-rose-300",
    accentText: "text-rose-600 dark:text-rose-400",
    glow: "from-rose-500/20 to-pink-500/10",
    buttonBg: "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-md shadow-rose-600/25 active:scale-95",
    iconBg: "bg-rose-500/10 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 group-hover:bg-rose-600 group-hover:text-white",
    badge: "bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
  },
  // 7. Indigo / Deep Violet
  {
    name: "indigo",
    topBar: "from-indigo-500 via-violet-500 to-purple-600",
    cardBorder: "border-indigo-300 dark:border-indigo-500/60",
    borderHover: "hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-indigo-500/20",
    codeBadge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800/70",
    studentBox: "bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-900/60",
    studentText: "text-indigo-700 dark:text-indigo-300",
    accentText: "text-indigo-600 dark:text-indigo-400",
    glow: "from-indigo-500/20 to-violet-500/10",
    buttonBg: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-600/25 active:scale-95",
    iconBg: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 group-hover:bg-indigo-600 group-hover:text-white",
    badge: "bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800",
  },
  // 8. Lime / Bright Green
  {
    name: "lime",
    topBar: "from-lime-400 via-emerald-500 to-teal-500",
    cardBorder: "border-lime-300 dark:border-lime-500/60",
    borderHover: "hover:border-lime-500 dark:hover:border-lime-400 hover:shadow-lime-500/20",
    codeBadge: "bg-lime-50 text-lime-700 dark:bg-lime-950/80 dark:text-lime-300 ring-1 ring-lime-200 dark:ring-lime-800/70",
    studentBox: "bg-lime-50/60 dark:bg-lime-950/40 border-lime-200/70 dark:border-lime-900/60",
    studentText: "text-lime-700 dark:text-lime-300",
    accentText: "text-lime-600 dark:text-lime-400",
    glow: "from-lime-500/20 to-emerald-500/10",
    buttonBg: "bg-gradient-to-r from-emerald-600 via-lime-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-lime-600/25 active:scale-95",
    iconBg: "bg-lime-500/10 text-lime-600 dark:bg-lime-950/60 dark:text-lime-400 border border-lime-200 dark:border-lime-900/60 group-hover:bg-lime-600 group-hover:text-white",
    badge: "bg-lime-50 dark:bg-lime-950/80 text-lime-700 dark:text-lime-300 border border-lime-200 dark:border-lime-800",
  },
  // 9. Coral / Crimson Red
  {
    name: "red",
    topBar: "from-red-500 via-rose-500 to-orange-500",
    cardBorder: "border-red-300 dark:border-red-500/60",
    borderHover: "hover:border-red-500 dark:hover:border-red-400 hover:shadow-red-500/20",
    codeBadge: "bg-red-50 text-red-700 dark:bg-red-950/80 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-800/70",
    studentBox: "bg-red-50/60 dark:bg-red-950/40 border-red-200/70 dark:border-red-900/60",
    studentText: "text-red-700 dark:text-red-300",
    accentText: "text-red-600 dark:text-red-400",
    glow: "from-red-500/20 to-orange-500/10",
    buttonBg: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md shadow-red-600/25 active:scale-95",
    iconBg: "bg-red-500/10 text-red-600 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900/60 group-hover:bg-red-600 group-hover:text-white",
    badge: "bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
  },
  // 10. Sky Blue / Aqua
  {
    name: "sky",
    topBar: "from-sky-400 via-blue-500 to-indigo-500",
    cardBorder: "border-sky-300 dark:border-sky-500/60",
    borderHover: "hover:border-sky-500 dark:hover:border-sky-400 hover:shadow-sky-500/20",
    codeBadge: "bg-sky-50 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 ring-1 ring-sky-200 dark:ring-sky-800/70",
    studentBox: "bg-sky-50/60 dark:bg-sky-950/40 border-sky-200/70 dark:border-sky-900/60",
    studentText: "text-sky-700 dark:text-sky-300",
    accentText: "text-sky-600 dark:text-sky-400",
    glow: "from-sky-500/20 to-blue-500/10",
    buttonBg: "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white shadow-md shadow-sky-600/25 active:scale-95",
    iconBg: "bg-sky-500/10 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-200 dark:border-sky-900/60 group-hover:bg-sky-600 group-hover:text-white",
    badge: "bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800",
  },
];

/**
 * Deterministic pseudo-random theme selection for a class
 * Ensures each class gets a consistent, unique color, and adjacent cards differ.
 */
export function getClassTheme(item, index = 0) {
  let hash = 0;
  const key = String(item?.id || item?.title || item?.name || index || "");
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  // Offset by index so sequential classes always alternate colors smoothly
  const themeIndex = Math.abs(hash + index * 3) % CLASS_THEMES.length;
  return CLASS_THEMES[themeIndex];
}
