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
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-sky-500/25 border-t-sky-500" />
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        {text}
      </p>

      {isSlow && (
        <div className="mt-2 flex max-w-sm flex-col items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <p className="text-xs text-slate-500 dark:text-slate-400">
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
  );
}
