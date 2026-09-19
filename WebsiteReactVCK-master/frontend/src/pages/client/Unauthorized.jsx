import { Link } from 'react-router-dom';
import { LogIn, Home, ArrowLeft } from 'lucide-react';
import Meta from '../../components/Meta';

export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <Meta
        title="Yêu Cầu Đăng Nhập (401) - CSCA LMS"
        description="Bạn cần đăng nhập để truy cập không gian học tập trực tuyến CSCA Academy."
      />

      <div className="w-full max-w-lg rounded-3xl border border-rose-500/25 bg-slate-900/80 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md">
        {/* Glowing Badge */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-inner">
          <LogIn className="h-10 w-10" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-rose-500/15 text-rose-400 border border-rose-500/30 mb-3">
          Mã Lỗi 401 • Unauthorized
        </span>

        <h1 className="text-2xl sm:text-3xl font-black text-white mb-3">
          Yêu Cầu Đăng Nhập
        </h1>

        <p className="text-sm text-slate-400 leading-relaxed mb-8">
          Không gian học tập, lịch học trực tuyến và bài tập LMS yêu cầu tài khoản học viên hoặc giảng viên được xác thực. Vui lòng đăng nhập để tiếp tục lộ trình học tập của bạn.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            state={{ openAuthModal: 'login' }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/30 transition active:scale-[0.98]"
          >
            <LogIn className="h-4 w-4" /> Đăng Nhập Ngay
          </Link>

          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-3 text-sm font-bold text-slate-300 hover:text-white transition active:scale-[0.98]"
          >
            <Home className="h-4 w-4" /> Về Trang Chủ
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-xs text-slate-500 flex items-center justify-center gap-2">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Chưa có tài khoản? Bạn có thể đăng ký miễn phí tại trang chủ.</span>
        </div>
      </div>
    </div>
  );
}
