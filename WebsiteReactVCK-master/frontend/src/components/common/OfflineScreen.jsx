import { useEffect, useState } from 'react';
import { Lottie } from 'lottie-react';
import { WifiOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import notFoundAnimation from '../../assets/404-blue.json';

export default function OfflineScreen() {
  const [isOffline, setIsOffline] = useState(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Đã khôi phục kết nối Internet!', { id: 'online-toast' });
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.error('Mất kết nối Internet!', { id: 'offline-toast' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    if (navigator.onLine) {
      setIsOffline(false);
      setIsRetrying(false);
      toast.success('Kết nối mạng bình thường!');
    } else {
      setTimeout(() => {
        setIsRetrying(false);
        if (!navigator.onLine) {
          toast.error('Chưa có mạng, vui lòng kiểm tra lại đường truyền!');
        } else {
          setIsOffline(false);
        }
      }, 1000);
    }
  };

  if (!isOffline) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-8 animate-in fade-in duration-300"
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center text-center">
        {/* Lottie Animation 404 Robot */}
        <div className="w-60 h-60 sm:w-72 sm:h-72 filter drop-shadow-xl select-none pointer-events-none">
          <Lottie
            src={notFoundAnimation}
            loop={true}
            autoplay={true}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 text-xs font-bold mb-3 border border-red-200 dark:border-red-800/50">
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Mất kết nối mạng</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Bạn đang ngoại tuyến
        </h2>

        <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs sm:max-w-sm">
          Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối Wi-Fi hoặc dữ liệu di động 4G/5G của bạn.
        </p>

        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-70 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Đang thử lại...' : 'Thử kết nối lại'}
        </button>
      </div>
    </div>
  );
}
