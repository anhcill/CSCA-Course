import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react";
import { usePwaInstall } from "../../context/PwaContext.jsx";

const INITIAL_SHOW_DELAY_MS = 2500;

export default function PwaInstallPrompt() {
  const {
    shouldShowBanner,
    canPromptInstall,
    isIos,
    isIosSafari,
    installing,
    promptInstall,
    dismissBanner,
  } = usePwaInstall();

  const [delayElapsed, setDelayElapsed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (!shouldShowBanner) {
      setDelayElapsed(false);
      setShowIosGuide(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDelayElapsed(true);
    }, INITIAL_SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [shouldShowBanner]);

  if (!shouldShowBanner || !delayElapsed) return null;

  const handleInstallClick = async () => {
    if (canPromptInstall) {
      await promptInstall();
      return;
    }
    if (isIos) {
      setShowIosGuide((prev) => !prev);
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Cài đặt ứng dụng Moly Course"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md transform-gpu animate-in fade-in slide-in-from-bottom-5 duration-300 sm:left-auto sm:right-6 sm:w-96"
    >
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-slate-900 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-white">
        <div className="flex items-start gap-3.5">
          <img
            src="/favicon-192x192.png"
            alt="Moly Course Icon"
            className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black tracking-tight text-slate-950 dark:text-white">
              Cài đặt ứng dụng Moly Course
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              Mở nhanh từ màn hình chính, học tập mượt mà hơn. Bạn luôn có thể cài lại trong Hồ sơ cá nhân.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={installing}
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-60"
              >
                {canPromptInstall ? (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    {installing ? "Đang mở..." : "Cài đặt ngay"}
                  </>
                ) : (
                  <>
                    <Smartphone className="h-3.5 w-3.5" />
                    {showIosGuide ? "Ẩn hướng dẫn" : "Hướng dẫn cài"}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={dismissBanner}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Để sau
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissBanner}
            className="self-start rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Đóng thông báo cài đặt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIos && showIosGuide && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            {!isIosSafari && (
              <p className="mb-1.5 font-semibold text-amber-700 dark:text-amber-300">
                Hãy mở trang này bằng trình duyệt Safari trên iPhone/iPad để cài ứng dụng:
              </p>
            )}
            <ol className="space-y-1.5">
              <li className="flex items-center gap-1.5">
                <Share className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  1. Nhấn nút <strong>Chia sẻ</strong> ở thanh dưới trình duyệt Safari.
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                <PlusSquare className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  2. Chọn <strong>Thêm vào MH chính</strong> rồi nhấn <strong>Thêm</strong>.
                </span>
              </li>
            </ol>
          </div>
        )}
      </div>
    </aside>
  );
}
