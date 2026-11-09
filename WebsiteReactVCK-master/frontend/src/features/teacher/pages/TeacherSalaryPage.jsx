import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherSalarySummary } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState, PermissionDeniedState } from "../../../components/common/StateView";
import TeacherSalarySection from "../components/TeacherSalarySection.jsx";

export default function TeacherSalaryPage() {
  const { authUser } = useAuthContext();
  const isTeacher = authUser?.role === "creator" || authUser?.role === "admin";
  const [salaryData, setSalaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSalary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherSalarySummary();
      setSalaryData(response?.data || null);
    } catch (err) {
      console.error("Failed to fetch teacher salary summary:", err);
      setError(err?.message || "Không thể tải bảng lương giảng viên");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTeacher) {
      loadSalary();
    }
  }, [isTeacher, loadSalary]);

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
              onRetry={loadSalary}
            />
          </div>
        ) : (
          <TeacherSalarySection
            salaryData={salaryData}
            onRefresh={loadSalary}
            refreshing={loading}
          />
        )}
      </div>
    </div>
  );
}
