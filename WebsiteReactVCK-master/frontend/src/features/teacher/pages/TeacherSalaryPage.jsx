import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherSalarySummary, fetchAdminTeacherSalaries } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState, PermissionDeniedState } from "../../../components/common/StateView";
import TeacherSalarySection from "../components/TeacherSalarySection.jsx";

export default function TeacherSalaryPage() {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const isTeacher = authUser?.role === "creator" || isAdmin;
  const [salaryData, setSalaryData] = useState(null);
  const [teachersList, setTeachersList] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminTeacherSalaries()
        .then((res) => {
          const list = Array.isArray(res?.data?.teachers) ? res.data.teachers : [];
          setTeachersList(list);
          if (list.length > 0 && !selectedTeacherId) {
            // Default to teacher who has assigned classes if admin has none
            const withClasses = list.find((t) => Number(t.assignedClassesCount || t.totalClasses || 0) > 0);
            if (withClasses) setSelectedTeacherId(String(withClasses.id));
          }
        })
        .catch((err) => console.warn("Could not load teachers list for admin salary preview:", err));
    }
  }, [isAdmin]);

  const loadSalary = useCallback(async (teacherIdOverride) => {
    setLoading(true);
    setError(null);
    try {
      const targetTid = teacherIdOverride !== undefined ? teacherIdOverride : selectedTeacherId;
      const response = await fetchTeacherSalarySummary(targetTid ? { teacherId: targetTid } : {});
      setSalaryData(response?.data || null);
    } catch (err) {
      console.error("Failed to fetch teacher salary summary:", err);
      setError(err?.message || "Không thể tải bảng lương giảng viên");
    } finally {
      setLoading(false);
    }
  }, [selectedTeacherId]);

  useEffect(() => {
    if (isTeacher) {
      loadSalary();
    }
  }, [isTeacher, selectedTeacherId, loadSalary]);

  if (!isTeacher) {
    return (
      <PermissionDeniedState
        title="Không có quyền truy cập"
        message="Khu vực bảng lương chỉ dành cho Giảng viên và Quản trị viên."
      />
    );
  }

  return (
    <div className="min-h-full px-3 pb-12 pt-1 sm:px-5 lg:px-6 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        {/* Floating Hero Title directly on wallpaper - matching Student style */}
        <div className="pt-0.5 pb-1">
          <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] dark:text-sky-200 drop-shadow-xs sm:text-5xl">
            Bảng Lương Giảng Viên
          </h1>
          <p className="mt-1 text-xs font-semibold italic text-slate-800 dark:text-slate-200 sm:text-sm">
            “Tận tâm truyền thụ tri thức, xứng đáng với mọi cống hiến.”
          </p>
          <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 dark:text-slate-400 sm:text-base">
            —— 学而不厌，诲人不倦。
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-sky-50/90 dark:border-sky-800/80 dark:bg-sky-950/50 p-3 text-xs text-sky-900 dark:text-sky-200 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="font-semibold">Chế độ Quản trị viên: Xem bảng lương theo từng giảng viên</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="admin-teacher-select" className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Chọn GV:
              </label>
              <select
                id="admin-teacher-select"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="h-8 rounded-xl border border-sky-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">-- Tài khoản của tôi --</option>
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName || t.username} ({t.email})
                  </option>
                ))}
              </select>
              <Link
                to="/admin/salaries"
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white shadow-xs transition hover:bg-blue-700"
              >
                Bảng lương Admin →
              </Link>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-12 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
            <Loading
              loading={true}
              text="Đang tính toán bảng lương giảng viên..."
              fullScreen={false}
              className="py-12"
            />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-8 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
            <ErrorState
              title="Chưa thể tải dữ liệu bảng lương"
              message={error}
              onRetry={() => loadSalary()}
            />
          </div>
        ) : (
          <TeacherSalarySection
            salaryData={salaryData}
            onRefresh={() => loadSalary()}
            refreshing={loading}
          />
        )}
      </div>
    </div>
  );
}
