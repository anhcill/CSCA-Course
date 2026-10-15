import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
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
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-5 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header riêng cho trang Bảng lương */}
        <section className="overflow-hidden rounded-2xl border border-emerald-100 dark:border-emerald-950/60 bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40 dark:from-slate-900 dark:via-slate-900/95 dark:to-emerald-950/20 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-200 dark:ring-emerald-800">
                <Wallet className="h-3 w-3" /> Thu Nhập Giảng Dạy
              </span>
              <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl">
                Bảng Lương Giảng Viên
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Theo dõi chi tiết số buổi đã dạy, thù lao tạm tính tích lũy và tổng lương dự kiến theo từng lớp học.
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <Loading
            loading={true}
            text="Đang tính toán bảng lương..."
            fullScreen={false}
            className="py-12"
          />
        ) : error ? (
          <ErrorState
            title="Chưa thể tải dữ liệu bảng lương"
            message={error}
            onRetry={loadSalary}
          />
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
