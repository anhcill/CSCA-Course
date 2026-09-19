import { Link } from 'react-router-dom';
import { ShieldAlert, BookOpen, Home, LogOut } from 'lucide-react';
import Meta from '../../components/Meta';
import { useAuthContext } from '../../context/AuthContext';
import useLogout from '../../hooks/useLogout';

export default function Forbidden() {
  const { authUser } = useAuthContext();
  const { logout } = useLogout();

  const currentRole = authUser?.role || 'Khách';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <Meta
        title="Từ Chối Truy Cập (403) - CSCA LMS"
        description="Bạn không có quyền truy cập vào phân hệ này."
      />

      <div className="w-full max-w-lg rounded-3xl border border-amber-500/25 bg-slate-900/80 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md">
        {/* Glowing Badge */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-inner">
          <ShieldAlert className="h-10 w-10" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-3">
          Mã Lỗi 403 • Quyền Hạn Không Đủ
        </span>

        <h1 className="text-2xl sm:text-3xl font-black text-white mb-3">
          Không Đủ Quyền Truy Cập
        </h1>

        <p className="text-sm text-slate-400 leading-relaxed mb-4">
          Tài khoản hiện tại của bạn có vai trò là{' '}
          <span className="font-bold text-amber-400 uppercase">
            {currentRole === 'student' ? 'Học Viên' : currentRole}
          </span>
          . Khu vực này yêu cầu quyền{' '}
          <span className="font-bold text-emerald-400">Giảng Viên (Creator)</span> hoặc{' '}
          <span className="font-bold text-rose-400">Quản Trị Viên (Admin)</span>.
        </p>

        <p className="text-xs text-slate-500 mb-8">
          Nếu bạn là giảng viên phụ trách lớp học nhưng gặp lỗi này, vui lòng liên hệ ban quản trị để được nâng cấp quyền.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/lms/my-learning"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/30 transition active:scale-[0.98]"
          >
            <BookOpen className="h-4 w-4" /> Về LMS Học Viên
          </Link>

          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-3 text-sm font-bold text-slate-300 hover:text-white transition active:scale-[0.98]"
          >
            <Home className="h-4 w-4" /> Về Trang Chủ
          </Link>
        </div>

        {authUser && (
          <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-center">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
            >
              <LogOut className="h-3.5 w-3.5" /> Đăng nhập bằng tài khoản khác
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
