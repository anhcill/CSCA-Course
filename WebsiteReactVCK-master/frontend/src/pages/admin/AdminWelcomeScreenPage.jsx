import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import {
  BookOpen,
  Eye,
  GraduationCap,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  UserCheck,
} from "lucide-react";
import FirstTimeWelcomeModal, {
  DEFAULT_WELCOME_CONFIG,
} from "../../components/welcome/FirstTimeWelcomeModal.jsx";
import {
  fetchAdminWelcomeSettingsApi,
  updateAdminWelcomeSettingsApi,
  resetAdminWelcomeSettingsApi,
  resetUserWelcomeStatusApi,
} from "../../features/api/lmsClient.js";
import { useAuthContext } from "../../context/AuthContext.jsx";
import Loading from "../../components/Loading.jsx";

const CARD_CLASS =
  "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
const FILTER_BAR_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/90";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export default function AdminWelcomeScreenPage() {
  const { authUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState("student");
  const [viewportMode, setViewportMode] = useState("desktop");
  const [previewKey, setPreviewKey] = useState(1);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingDefaults, setIsResettingDefaults] = useState(false);
  const [isResettingUserSeen, setIsResettingUserSeen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [config, setConfig] = useState(DEFAULT_WELCOME_CONFIG);
  const [originalConfig, setOriginalConfig] = useState(DEFAULT_WELCOME_CONFIG);

  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  }, [config, originalConfig]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminWelcomeSettingsApi();
      if (res?.success && res?.data?.config) {
        setConfig(res.data.config);
        setOriginalConfig(res.data.config);
        setUpdatedAt(res.data.updatedAt);
      } else {
        setConfig(DEFAULT_WELCOME_CONFIG);
        setOriginalConfig(DEFAULT_WELCOME_CONFIG);
      }
    } catch (err) {
      console.warn("Could not load welcome settings from server, using defaults:", err);
      setConfig(DEFAULT_WELCOME_CONFIG);
      setOriginalConfig(DEFAULT_WELCOME_CONFIG);
      toast.error("Không thể tải cấu hình từ máy chủ, đang dùng cấu hình mặc định.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleRoleFieldChange = (role, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [field]: value,
      },
    }));
  };

  const handleGlobalFieldChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReplay = () => {
    setPreviewKey((k) => k + 1);
    toast.success("Đang phát lại hiệu ứng mở đầu.", { id: "replay-toast", duration: 1500 });
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await updateAdminWelcomeSettingsApi(config);
      if (!res?.success) throw new Error(res?.message || "Không thể lưu cấu hình");
      setOriginalConfig(config);
      setUpdatedAt(new Date().toISOString());
      toast.success("Đã lưu cấu hình màn hình chào mừng.");
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err?.message || "Lỗi khi lưu cấu hình.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (
      !window.confirm(
        "Bạn có chắc chắn muốn khôi phục toàn bộ nội dung và thời lượng về mặc định ban đầu?"
      )
    ) {
      return;
    }

    setIsResettingDefaults(true);
    try {
      const res = await resetAdminWelcomeSettingsApi();
      if (!res?.success) throw new Error(res?.message || "Không thể khôi phục mặc định");
      const def = res?.data?.config || DEFAULT_WELCOME_CONFIG;
      setConfig(def);
      setOriginalConfig(def);
      setUpdatedAt(new Date().toISOString());
      handleReplay();
      toast.success("Đã khôi phục cài đặt mặc định.");
    } catch (err) {
      console.error("Reset error:", err);
      toast.error(err?.message || "Lỗi khi khôi phục mặc định.");
    } finally {
      setIsResettingDefaults(false);
    }
  };

  const handleResetMyWelcomeState = async () => {
    if (!authUser?.id) return;
    setIsResettingUserSeen(true);
    try {
      const res = await resetUserWelcomeStatusApi(authUser.id);
      if (!res?.success) throw new Error(res?.message || "Không thể đặt lại trạng thái");
      toast.success(
        "Đã đặt lại trạng thái đã xem. Khi đăng nhập lại với vai trò Học viên hoặc Giáo viên, màn hình chào mừng sẽ hiển thị lại.",
        { duration: 5000 }
      );
    } catch (err) {
      console.error("Reset user state error:", err);
      toast.error(err?.message || "Lỗi khi đặt lại trạng thái người dùng.");
    } finally {
      setIsResettingUserSeen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Đang tải cấu hình màn hình chào mừng..." />
      </div>
    );
  }

  const roleConfig = activeTab === "teacher" ? config.teacher : config.student;

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
              Màn hình chào mừng
            </h1>
            {isDirty && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300">
                Chưa lưu
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tùy chỉnh câu chào, thời lượng hiển thị và xem trước trực tiếp cho Học viên và Giáo viên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isResettingDefaults}
            className={BTN_SECONDARY}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isResettingDefaults ? "animate-spin" : ""}`} />
            <span>Mặc định</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreenPreview(true)}
            className={BTN_SECONDARY}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Toàn màn hình</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className={BTN_PRIMARY}
          >
            <Save className={`h-3.5 w-3.5 ${isSaving ? "animate-spin" : ""}`} />
            <span>{isSaving ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </button>
        </div>
      </header>

      {/* Role Switcher & Viewport Bar */}
      <div className={FILTER_BAR_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("student");
                handleReplay();
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                activeTab === "student"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              <span>Học viên</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("teacher");
                handleReplay();
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                activeTab === "teacher"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Giáo viên</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewportMode("desktop")}
                title="Khung máy tính"
                className={`rounded-lg p-1.5 transition ${
                  viewportMode === "desktop"
                    ? "bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewportMode("tablet")}
                title="Khung máy tính bảng"
                className={`rounded-lg p-1.5 transition ${
                  viewportMode === "tablet"
                    ? "bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Tablet className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewportMode("mobile")}
                title="Khung điện thoại"
                className={`rounded-lg p-1.5 transition ${
                  viewportMode === "mobile"
                    ? "bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>

            <button type="button" onClick={handleReplay} className={BTN_SECONDARY}>
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Phát lại</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2-Column Desktop / Stacked Mobile Layout */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Live Preview Canvas (7 cols) */}
        <section className={`${CARD_CLASS} min-w-0 p-4 sm:p-5 lg:col-span-7 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Xem trước trực tiếp · {activeTab === "teacher" ? "Giáo viên" : "Học viên"}
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Thay đổi nội dung bên phải để cập nhật ngay
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-2 sm:p-3">
            <div className="mb-2 flex items-center justify-between border-b border-slate-800 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-[11px] font-medium text-slate-400">
                  {activeTab === "teacher" ? "Không gian Giáo viên" : "Không gian Học viên"}
                </span>
              </div>
              <span className="text-[10px] font-medium text-slate-500">
                {viewportMode === "mobile"
                  ? "Điện thoại"
                  : viewportMode === "tablet"
                  ? "Máy tính bảng"
                  : "Máy tính"}
              </span>
            </div>

            <div
              className={`mx-auto transition-all duration-300 ${
                viewportMode === "mobile"
                  ? "max-w-[360px]"
                  : viewportMode === "tablet"
                  ? "max-w-[560px]"
                  : "w-full"
              }`}
            >
              <div
                key={`preview-${activeTab}-${previewKey}`}
                className="relative overflow-hidden rounded-xl"
              >
                <FirstTimeWelcomeModal
                  isPreview={true}
                  previewRole={activeTab}
                  customConfig={config}
                  embedded={true}
                  onClose={() => {}}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Form (5 cols) */}
        <div className="min-w-0 space-y-4 lg:col-span-5">
          {/* Role Content Form */}
          <section className={`${CARD_CLASS} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    activeTab === "teacher"
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                      : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                  }`}
                >
                  {activeTab === "teacher" ? (
                    <BookOpen className="h-4 w-4" />
                  ) : (
                    <GraduationCap className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Nội dung hiển thị
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Áp dụng cho {activeTab === "teacher" ? "Giáo viên" : "Học viên"}
                  </p>
                </div>
              </div>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  activeTab === "teacher"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                }`}
              >
                {activeTab === "teacher" ? "Giáo viên" : "Học viên"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-title">Tiêu đề chào mừng</label>
                <span className="text-[10px] font-normal text-slate-400">
                  {roleConfig?.title?.length || 0}/120
                </span>
              </div>
              <input
                id="welcome-title"
                type="text"
                value={roleConfig?.title || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "title", e.target.value)}
                placeholder="VD: Chào mừng đến với không gian học tập"
                maxLength={120}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-desc">Lời dẫn</label>
                <span className="text-[10px] font-normal text-slate-400">
                  {roleConfig?.description?.length || 0}/300
                </span>
              </div>
              <textarea
                id="welcome-desc"
                rows={3}
                value={roleConfig?.description || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "description", e.target.value)}
                placeholder="VD: Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn."
                maxLength={300}
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-btn">Nhãn nút bắt đầu</label>
                <span className="text-[10px] font-normal text-slate-400">
                  {roleConfig?.buttonText?.length || 0}/60
                </span>
              </div>
              <input
                id="welcome-btn"
                type="text"
                value={roleConfig?.buttonText || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "buttonText", e.target.value)}
                placeholder="VD: Bắt đầu học"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-note">Thông báo đang tải</label>
                <span className="text-[10px] font-normal text-slate-400">
                  {roleConfig?.loadingNote?.length || 0}/150
                </span>
              </div>
              <input
                id="welcome-note"
                type="text"
                value={roleConfig?.loadingNote || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "loadingNote", e.target.value)}
                placeholder="VD: Đang chuẩn bị không gian học tập của bạn..."
                maxLength={150}
                className={INPUT_CLASS}
              />
            </div>
          </section>

          {/* Global Settings */}
          <section className={`${CARD_CLASS} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cài đặt chung & Thời lượng
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Áp dụng cho cả Học viên và Giáo viên
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="brand-badge"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nhãn thương hiệu
              </label>
              <input
                id="brand-badge"
                type="text"
                value={config.badge || ""}
                onChange={(e) => handleGlobalFieldChange("badge", e.target.value)}
                placeholder="VD: CSCA Course"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="transition-duration">Thời lượng tự động chuyển</label>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {config.autoTransitionDuration || 4.8} giây
                </span>
              </div>
              <input
                id="transition-duration"
                type="range"
                min="2.0"
                max="12.0"
                step="0.2"
                value={config.autoTransitionDuration || 4.8}
                onChange={(e) =>
                  handleGlobalFieldChange("autoTransitionDuration", parseFloat(e.target.value))
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-slate-700"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>2.0s</span>
                <span>Khuyên dùng 4.8s</span>
                <span>12.0s</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Tự động chuyển sau khi hết giờ
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nếu tắt, người dùng cần bấm nút để vào hệ thống.
                </p>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={config.autoTransitionEnabled !== false}
                  onChange={(e) =>
                    handleGlobalFieldChange("autoTransitionEnabled", e.target.checked)
                  }
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-slate-300 transition after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full dark:bg-slate-700" />
              </label>
            </div>
          </section>

          {/* Testing Utility */}
          <section className={`${CARD_CLASS} p-4 sm:p-5 space-y-3`}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Kiểm thử hiển thị
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Đặt lại trạng thái đã xem để kiểm tra màn hình khi đăng nhập lại.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetMyWelcomeState}
              disabled={isResettingUserSeen}
              className={`${BTN_SECONDARY} w-full`}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isResettingUserSeen ? "animate-spin" : ""}`} />
              <span>
                {isResettingUserSeen
                  ? "Đang xử lý..."
                  : "Đặt lại trạng thái đã xem của tài khoản tôi"}
              </span>
            </button>

            {updatedAt && (
              <p className="text-center font-mono text-[10px] text-slate-400">
                Cập nhật lần cuối: {new Date(updatedAt).toLocaleString("vi-VN")}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Full-Screen Preview Modal */}
      {isFullscreenPreview && (
        <FirstTimeWelcomeModal
          isPreview={true}
          previewRole={activeTab}
          customConfig={config}
          onClose={() => setIsFullscreenPreview(false)}
        />
      )}
    </div>
  );
}
