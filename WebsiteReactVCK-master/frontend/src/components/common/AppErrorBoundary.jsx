import React from "react";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { isChunkLoadError, reloadOnceForStaleChunk } from "../../utils/chunkRecovery.js";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[AppErrorBoundary] Uncaught render/chunk error:", error, errorInfo);
    if (isChunkLoadError(error)) {
      reloadOnceForStaleChunk();
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const chunkError = isChunkLoadError(this.state.error);
    const containerClass = this.props.fullScreen
      ? "min-h-screen px-4 py-12"
      : "min-h-[55vh] px-4 py-10";

    return (
      <div className={`flex w-full items-center justify-center ${containerClass}`}>
        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/95 p-6 text-center shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {chunkError
              ? "Hệ thống vừa cập nhật phiên bản mới"
              : "Không thể tải trang này"}
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
            {chunkError
              ? "Một số tài nguyên của phiên làm việc cũ đã được thay thế. Vui lòng tải lại trang để tiếp tục sử dụng."
              : "Đã xảy ra sự cố khi hiển thị nội dung. Bạn có thể tải lại trang hoặc thử lại ngay."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95 sm:text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Tải lại trang
            </button>

            {!chunkError && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
              >
                Thử lại
              </button>
            )}

            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
            >
              <Home className="h-4 w-4" />
              Trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }
}
