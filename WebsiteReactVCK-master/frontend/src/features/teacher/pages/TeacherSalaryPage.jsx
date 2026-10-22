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

  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("csca_lms_wallpaper") || "/student-campus-spring.webp";
    }
    return "/student-campus-spring.webp";
  });

  useEffect(() => {
    const handleWallpaperChange = (event) => {
      const newWp = event?.detail || localStorage.getItem("csca_lms_wallpaper") || "/student-campus-spring.webp";
      setCurrentWallpaper(newWp);
    };
    window.addEventListener("csca_wallpaper_changed", handleWallpaperChange);
    return () => window.removeEventListener("csca_wallpaper_changed", handleWallpaperChange);
  }, []);

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
    <div
      className="relative min-h-[calc(100vh-6.5rem)] -mx-4 -mt-2 p-2.5 sm:p-3.5 xl:px-4 xl:py-3 text-slate-900 dark:text-slate-100 transition-colors duration-200"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(222,241,255,0.06) 0%, rgba(230,244,253,0.14) 50%, rgba(237,246,252,0.22) 100%), url('${currentWallpaper}')`,
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-[1440px] space-y-2.5">
        {/* Floating Hero Title directly on wallpaper - matching Student style */}
        <div className="pt-0.5 pb-1">
          <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs sm:text-5xl">
            Bảng Lương Giảng Viên
          </h1>
          <p className="mt-1 text-xs font-semibold italic text-slate-800 sm:text-sm">
            “Tận tâm truyền thụ tri thức, xứng đáng với mọi cống hiến.”
          </p>
          <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 sm:text-base">
            —— 学而不厌，诲人不倦。
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/80 bg-white/90 p-12 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <Loading
              loading={true}
              text="Đang tính toán bảng lương giảng viên..."
              fullScreen={false}
              className="py-12"
            />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-white/80 bg-white/90 p-8 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
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
