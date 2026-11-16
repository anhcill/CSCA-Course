import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function RouteLoadingFallback({
  text = "Đang tải không gian học tập...",
  slowThresholdMs = 12_000,
}) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsSlow(true);
    }, slowThresholdMs);

    return () => window.clearTimeout(timer);
  }, [slowThresholdMs]);

  return (
    <div
      className="relative isolate flex min-h-[48vh] items-center justify-center overflow-hidden bg-[#eaf5fc] px-4 py-12 text-center dark:bg-slate-950"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-500/10" />

      <div className="relative flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border border-sky-200/80 bg-white/90 px-6 py-8 shadow-lg shadow-sky-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="relative mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 shadow-inner dark:bg-sky-950/70">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-sky-300/50 border-t-sky-600 motion-reduce:animate-none dark:border-sky-900 dark:border-t-sky-400" />
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {text}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Vui lòng chờ trong giây lát</p>

        {isSlow && (
          <div className="mt-2 flex max-w-sm flex-col items-center gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Trang đang tải lâu hơn bình thường do kết nối mạng chậm hoặc hệ thống vừa cập nhật.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tải lại trang
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
