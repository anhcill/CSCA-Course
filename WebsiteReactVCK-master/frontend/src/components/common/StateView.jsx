/* eslint-disable react/prop-types */
import { Link } from 'react-router-dom';
import { 
  AlertCircle, 
  CheckCircle2, 
  Inbox, 
  Lock, 
  RefreshCw, 
  Home,
  BookOpen
} from 'lucide-react';

/**
 * 1. LOADING SKELETON STATE
 */
export function LoadingState({ 
  type = 'cards', 
  count = 3, 
  message = 'Đang tải dữ liệu...' 
}) {
  return (
    <div className="w-full py-8 space-y-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
        <div className="h-4 w-4 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
        <span>{message}</span>
      </div>

      {type === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: count }).map((_, idx) => (
            <div 
              key={idx} 
              className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4 animate-pulse"
            >
              <div className="h-36 bg-slate-800/70 rounded-xl" />
              <div className="space-y-2">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
                <div className="h-6 bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-800/60 rounded w-full" />
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                <div className="h-4 bg-slate-800 rounded w-1/4" />
                <div className="h-8 bg-slate-800 rounded-lg w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {type === 'list' && (
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, idx) => (
            <div 
              key={idx} 
              className="bg-slate-900/60 border border-white/10 rounded-xl p-4 flex items-center justify-between animate-pulse"
            >
              <div className="space-y-2 w-2/3">
                <div className="h-4 bg-slate-800 rounded w-1/2" />
                <div className="h-3 bg-slate-800/60 rounded w-3/4" />
              </div>
              <div className="h-8 bg-slate-800 rounded-lg w-24" />
            </div>
          ))}
        </div>
      )}

      {type === 'detail' && (
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-8 space-y-6 animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/2" />
          <div className="h-4 bg-slate-800/60 rounded w-3/4" />
          <div className="h-64 bg-slate-800/40 rounded-2xl" />
        </div>
      )}
    </div>
  );
}

/**
 * 2. EMPTY STATE
 */
export function EmptyState({ 
  icon: Icon = Inbox, 
  title = 'Không có dữ liệu', 
  description = 'Hiện tại chưa có nội dung nào để hiển thị trong mục này.', 
  actionLabel, 
  actionTo, 
  onAction 
}) {
  return (
    <div className="w-full rounded-3xl border border-white/10 bg-slate-900/40 p-8 sm:p-12 text-center backdrop-blur-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-800/60 text-slate-400 shadow-inner">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-slate-400 mb-6 leading-relaxed">
        {description}
      </p>

      {actionLabel && (actionTo ? (
        <Link 
          to={actionTo}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500"
        >
          {actionLabel}
        </Link>
      ) : onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500"
        >
          {actionLabel}
        </button>
      ) : null)}
    </div>
  );
}

/**
 * 3. ERROR STATE
 */
export function ErrorState({ 
  title = 'Đã xảy ra lỗi tải dữ liệu', 
  message = 'Không thể kết nối đến máy chủ hoặc phiên làm việc đã hết hạn.', 
  onRetry 
}) {
  return (
    <div className="w-full rounded-3xl border border-red-500/20 bg-red-950/20 p-8 sm:p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-900/30 text-red-400">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-red-200/70 mb-6">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-600/20 px-5 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-600/30"
        >
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      )}
    </div>
  );
}

/**
 * 4. SUCCESS STATE
 */
export function SuccessState({ 
  title = 'Thao tác thành công!', 
  message = 'Dữ liệu của bạn đã được lưu thành công.', 
  actionLabel, 
  actionTo, 
  onAction 
}) {
  return (
    <div className="w-full rounded-3xl border border-emerald-500/20 bg-emerald-950/20 p-8 sm:p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-900/30 text-emerald-400">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-emerald-200/70 mb-6">
        {message}
      </p>
      {actionLabel && (actionTo ? (
        <Link 
          to={actionTo}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500"
        >
          {actionLabel}
        </Link>
      ) : onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500"
        >
          {actionLabel}
        </button>
      ) : null)}
    </div>
  );
}

/**
 * 5. PERMISSION DENIED STATE
 */
export function PermissionDeniedState({ 
  title = 'Truy Cập Bị Từ Chối', 
  message = 'Bạn không có quyền truy cập vào khu vực này. Khu vực này yêu cầu quyền Giảng Viên hoặc Quản Trị Viên.', 
  redirectPath = '/lms/my-learning' 
}) {
  return (
    <div className="w-full rounded-3xl border border-amber-500/20 bg-slate-900/80 p-8 sm:p-12 text-center backdrop-blur-md">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
        <Lock className="h-8 w-8" />
      </div>
      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-3">
        Quyền hạn không đủ
      </span>
      <h3 className="text-xl sm:text-2xl font-black text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-slate-400 mb-8 leading-relaxed">
        {message}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link 
          to={redirectPath}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500"
        >
          <BookOpen className="h-4 w-4" /> Về LMS Học Viên
        </Link>
        <Link 
          to="/"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          <Home className="h-4 w-4" /> Về Trang Chủ
        </Link>
      </div>
    </div>
  );
}

export default {
  Loading: LoadingState,
  Empty: EmptyState,
  Error: ErrorState,
  Success: SuccessState,
  PermissionDenied: PermissionDeniedState,
};
