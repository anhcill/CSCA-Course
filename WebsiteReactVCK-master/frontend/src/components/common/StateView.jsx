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
  message = 'Đang tải dữ liệu...',
  variant = 'auto',
}) {
  const isExplicitLight = variant === 'light';
  const isExplicitDark = variant === 'dark';

  const skeletonCard = isExplicitLight
    ? 'bg-white border-slate-200 shadow-sm'
    : isExplicitDark
    ? 'bg-slate-900/60 border-white/10'
    : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none';

  const skeletonFill = isExplicitLight
    ? 'bg-slate-100'
    : isExplicitDark
    ? 'bg-slate-800'
    : 'bg-slate-100 dark:bg-slate-800';

  const skeletonMuted = isExplicitLight
    ? 'bg-slate-50'
    : isExplicitDark
    ? 'bg-slate-800/60'
    : 'bg-slate-50 dark:bg-slate-800/60';

  return (
    <div className="w-full py-8 space-y-6" aria-live="polite" aria-busy="true">
      <div className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-wider ${
        isExplicitLight ? 'text-slate-500' : isExplicitDark ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
      }`}>
        <div className={`h-4 w-4 rounded-full border-2 border-t-transparent animate-spin ${
          isExplicitLight ? 'border-blue-600' : isExplicitDark ? 'border-sky-500' : 'border-blue-600 dark:border-sky-400'
        }`} />
        <span>{message}</span>
      </div>

      {type === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: count }).map((_, idx) => (
            <div 
              key={idx} 
              className={`${skeletonCard} border rounded-2xl p-6 space-y-4 animate-pulse`}
            >
              <div className={`h-36 rounded-xl ${skeletonMuted}`} />
              <div className="space-y-2">
                <div className={`h-4 rounded w-1/3 ${skeletonFill}`} />
                <div className={`h-6 rounded w-3/4 ${skeletonFill}`} />
                <div className={`h-3 rounded w-full ${skeletonMuted}`} />
              </div>
              <div className={`pt-4 border-t flex justify-between items-center ${
                isExplicitLight ? 'border-slate-100' : isExplicitDark ? 'border-white/5' : 'border-slate-100 dark:border-slate-800'
              }`}>
                <div className={`h-4 rounded w-1/4 ${skeletonFill}`} />
                <div className={`h-8 rounded-lg w-1/3 ${skeletonFill}`} />
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
              className={`${skeletonCard} border rounded-xl p-4 flex items-center justify-between animate-pulse`}
            >
              <div className="space-y-2 w-2/3">
                <div className={`h-4 rounded w-1/2 ${skeletonFill}`} />
                <div className={`h-3 rounded w-3/4 ${skeletonMuted}`} />
              </div>
              <div className={`h-8 rounded-lg w-24 ${skeletonFill}`} />
            </div>
          ))}
        </div>
      )}

      {type === 'detail' && (
        <div className={`${skeletonCard} border rounded-3xl p-8 space-y-6 animate-pulse`}>
          <div className={`h-8 rounded w-1/2 ${skeletonFill}`} />
          <div className={`h-4 rounded w-3/4 ${skeletonMuted}`} />
          <div className={`h-64 rounded-2xl ${skeletonMuted}`} />
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
  onAction,
  variant = 'auto',
}) {
  const isExplicitLight = variant === 'light';
  const isExplicitDark = variant === 'dark';

  const containerClass = isExplicitLight
    ? 'border-slate-200 bg-white shadow-sm'
    : isExplicitDark
    ? 'border-white/10 bg-slate-900/40 backdrop-blur-sm'
    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm dark:shadow-none';

  const iconBg = isExplicitLight
    ? 'border-blue-100 bg-blue-50 text-blue-600'
    : isExplicitDark
    ? 'border-white/10 bg-slate-800/60 text-slate-400'
    : 'border-blue-100 dark:border-slate-800 bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-sky-400';

  const titleClass = isExplicitLight
    ? 'text-slate-900'
    : isExplicitDark
    ? 'text-white'
    : 'text-slate-900 dark:text-white';

  const descClass = isExplicitLight
    ? 'text-slate-500'
    : isExplicitDark
    ? 'text-slate-400'
    : 'text-slate-500 dark:text-slate-400';

  return (
    <div className={`w-full rounded-3xl border p-8 sm:p-12 text-center ${containerClass}`}>
      <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border shadow-inner ${iconBg}`}>
        <Icon className="h-8 w-8" />
      </div>
      <h3 className={`text-lg sm:text-xl font-bold mb-2 ${titleClass}`}>{title}</h3>
      <p className={`mx-auto max-w-md text-sm mb-6 leading-relaxed ${descClass}`}>
        {description}
      </p>

      {actionLabel && (actionTo ? (
        <Link 
          to={actionTo}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-bold shadow-lg shadow-blue-600/20 transition"
        >
          {actionLabel}
        </Link>
      ) : onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-bold shadow-lg shadow-blue-600/20 transition"
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
  onRetry,
  variant = 'auto',
}) {
  const isExplicitLight = variant === 'light';
  const isExplicitDark = variant === 'dark';

  const containerClass = isExplicitLight
    ? 'border-rose-100 bg-rose-50/70'
    : isExplicitDark
    ? 'border-red-500/20 bg-red-950/20'
    : 'border-rose-100 dark:border-rose-900/30 bg-rose-50/70 dark:bg-rose-950/20';

  const iconBg = isExplicitLight
    ? 'border-rose-100 bg-white text-rose-600'
    : isExplicitDark
    ? 'border-red-500/30 bg-red-900/30 text-red-400'
    : 'border-rose-100 dark:border-rose-900/40 bg-white dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';

  return (
    <div className={`w-full rounded-3xl border p-8 sm:p-10 text-center ${containerClass}`}>
      <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border ${iconBg}`}>
        <AlertCircle className="h-7 w-7" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold mb-2 text-slate-900 dark:text-white">{title}</h3>
      <p className="mx-auto max-w-md text-sm mb-6 text-slate-600 dark:text-slate-300">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 px-5 py-2.5 text-sm font-bold transition"
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
    <div className="w-full rounded-3xl border border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-950/20 p-8 sm:p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-emerald-200/70 mb-6">
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
  redirectPath = '/lms/dashboard'
}) {
  return (
    <div className="w-full rounded-3xl border border-amber-500/20 bg-white dark:bg-slate-900/80 p-8 sm:p-12 text-center shadow-sm dark:shadow-none backdrop-blur-md">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400">
        <Lock className="h-8 w-8" />
      </div>
      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 mb-3">
        Quyền hạn không đủ
      </span>
      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
        {message}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link 
          to={redirectPath}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-bold shadow-lg shadow-blue-600/20 transition"
        >
          <BookOpen className="h-4 w-4" /> Về LMS Học Viên
        </Link>
        <Link 
          to="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800 px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
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
