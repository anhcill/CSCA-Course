/* eslint-disable react/prop-types */
import { useEffect } from 'react';
import { Clock, LogIn, X, RefreshCw } from 'lucide-react';

export default function SessionExpiredModal({ isOpen, onClose, onLoginAgain }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-900 p-6 sm:p-8 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          aria-label="Đóng thông báo"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
          <Clock className="h-8 w-8 animate-pulse" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-2">
          Phiên Làm Việc Hết Hạn
        </span>

        <h2 id="session-expired-title" className="text-xl font-black text-white mb-2">
          Hết Hạn Phiên Đăng Nhập
        </h2>

        <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
          Phiên đăng nhập của bạn đã hết hạn để đảm bảo an toàn bảo mật. Vui lòng đăng nhập lại để tiếp tục lưu tiến độ học tập và nộp bài.
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onLoginAgain}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition active:scale-[0.98]"
          >
            <LogIn className="h-4 w-4" /> Đăng Nhập Lại Ngay
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tải Lại Trang
          </button>
        </div>
      </div>
    </div>
  );
}
