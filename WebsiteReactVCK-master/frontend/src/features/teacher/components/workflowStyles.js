export const panel = "rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md";
export const input = "w-full rounded-xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 shadow-2xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10";
export const button = "rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition";
export const secondary = "rounded-2xl border border-white/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-2xs hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50 transition";
export const datetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
