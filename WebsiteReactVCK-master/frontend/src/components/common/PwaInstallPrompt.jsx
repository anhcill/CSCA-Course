import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Không hiển thị nếu ứng dụng đang chạy ở chế độ PWA Standalone (đã cài đặt)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) return;

    // Kiểm tra xem người dùng đã từ chối cài đặt trong vòng 7 ngày qua chưa
    const dismissedAt = localStorage.getItem('pwa_install_dismissed_at');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      // Ngăn chặn prompt mặc định của trình duyệt để tự điều khiển giao diện
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      localStorage.removeItem('pwa_install_dismissed_at');
      toast.success('Ứng dụng Moly Course đã được cài đặt thành công!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Hiển thị hộp thoại cài đặt của trình duyệt
    deferredPrompt.prompt();

    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Nhớ việc đóng trong 7 ngày
    localStorage.setItem('pwa_install_dismissed_at', Date.now().toString());
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <aside
      role="dialog"
      aria-label="Cài đặt ứng dụng Moly Course"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md transform-gpu animate-in fade-in slide-in-from-bottom-5 duration-300 sm:left-auto sm:right-6 sm:w-96"
    >
      <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-slate-900 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-white">
        <img
          src="/favicon-192x192.png"
          alt="Moly Course Icon"
          className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
        />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-tight text-slate-950 dark:text-white">
            Cài đặt Moly Course
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
            Truy cập nhanh từ màn hình chính, học tập mượt mà hơn.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              <Download className="h-3.5 w-3.5" /> Cài đặt ngay
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Để sau
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="self-start rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Đóng thông báo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
