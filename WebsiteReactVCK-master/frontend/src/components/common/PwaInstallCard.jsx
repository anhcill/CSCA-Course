import { useState } from "react";
import {
  CheckCircle2,
  Download,
  HelpCircle,
  PlusSquare,
  Share,
  Smartphone,
} from "lucide-react";
import toast from "react-hot-toast";
import { usePwaInstall } from "../../context/PwaContext.jsx";

export default function PwaInstallCard({ variant = "lms", className = "" }) {
  const {
    isInstalled,
    isStandalone,
    canPromptInstall,
    isIos,
    isIosSafari,
    isDesktopSafari,
    installing,
    promptInstall,
  } = usePwaInstall();

  const [showGuide, setShowGuide] = useState(false);

  const handleAction = async () => {
    if (canPromptInstall) {
      const result = await promptInstall();
      if (result.outcome === "dismissed") {
        toast("Bạn có thể bấm cài đặt lại bất cứ lúc nào tại đây.", { icon: "📱" });
      }
      return;
    }
    setShowGuide((prev) => !prev);
  };

  const containerClass =
    variant === "profile"
      ? "rounded-2xl border border-cyan-200 bg-white/95 p-5 shadow-sm dark:border-stone-700 dark:bg-slate-800/95"
      : "rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";

  const titleClass =
    variant === "profile"
      ? "text-base font-bold text-stone-900 dark:text-white"
      : "text-base font-bold text-[#102f63] dark:text-white";

  const buttonClass =
    variant === "profile"
      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60 sm:text-sm"
      : "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60";

  return (
    <div className={`${containerClass} ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <img
              src="/favicon-192x192.png"
              alt="Moly Course App"
              className="h-11 w-11 rounded-2xl object-cover shadow-xs ring-1 ring-slate-200 dark:ring-slate-700"
            />
            {isInstalled && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-slate-900">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={titleClass}>Ứng dụng Moly Course (PWA)</h2>
              {isInstalled ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {isStandalone ? "Đang dùng ứng dụng" : "Đã cài đặt"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                  <Smartphone className="h-3 w-3" />
                  Chưa cài đặt
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {isStandalone
                ? "Bạn đang sử dụng Moly Course dưới dạng ứng dụng cài đặt trên thiết bị này."
                : isInstalled
                  ? "Ứng dụng đã được cài trên thiết bị này. Bạn có thể mở nhanh trực tiếp từ màn hình chính."
                  : "Cài Moly Course ra màn hình chính để mở nhanh như ứng dụng di động, toàn màn hình và ổn định hơn."}
            </p>
          </div>
        </div>

        {!isInstalled && (
          <div className="shrink-0">
            <button
              type="button"
              disabled={installing}
              onClick={handleAction}
              className={`w-full sm:w-auto ${buttonClass}`}
            >
              {canPromptInstall ? (
                <>
                  <Download className="h-4 w-4" />
                  <span>{installing ? "Đang mở cài đặt..." : "Cài đặt ứng dụng"}</span>
                </>
              ) : (
                <>
                  <HelpCircle className="h-4 w-4" />
                  <span>{showGuide ? "Ẩn hướng dẫn" : "Cách cài đặt"}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {!isInstalled && showGuide && (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          {isIos ? (
            <div className="space-y-2">
              {!isIosSafari && (
                <p className="font-semibold text-amber-700 dark:text-amber-300">
                  Trên iPhone/iPad, vui lòng mở đường dẫn này bằng trình duyệt Safari để cài ứng dụng:
                </p>
              )}
              <ol className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    Bước 1: Nhấn biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh công cụ phía dưới Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    Bước 2: Kéo xuống chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong> rồi nhấn <strong>Thêm</strong>.
                  </span>
                </li>
              </ol>
            </div>
          ) : isDesktopSafari ? (
            <p>
              Trên Safari máy tính (macOS): chọn menu <strong>Tệp (File)</strong> → <strong>Thêm vào Dock (Add to Dock)</strong> để cài Moly Course thành ứng dụng riêng.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Hướng dẫn cài đặt nhanh trên trình duyệt:
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <strong>Chrome / Edge (Máy tính):</strong> Nhấn biểu tượng cài đặt ở góc phải thanh địa chỉ hoặc mở menu <strong>⋮</strong> → <strong>Cài đặt Moly Course</strong>.
                </li>
                <li>
                  <strong>Chrome / Android:</strong> Nhấn menu <strong>⋮</strong> góc trên phải → <strong>Thêm vào màn hình chính / Cài đặt ứng dụng</strong>.
                </li>
                <li>
                  Nếu bạn vừa đóng hộp thoại cài đặt của trình duyệt, hãy tải lại trang để hiện lại nút cài đặt nhanh 1 chạm.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
