import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import {
  FiEye,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
  FiMonitor,
  FiSmartphone,
  FiTablet,
  FiUserCheck,
  FiSliders,
  FiInfo,
} from "react-icons/fi";
import { BookOpen, GraduationCap, Sparkles } from "lucide-react";
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

export default function AdminWelcomeScreenPage() {
  const { authUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState("student"); // 'student' | 'teacher'
  const [viewportMode, setViewportMode] = useState("desktop"); // 'desktop' | 'tablet' | 'mobile'
  const [previewKey, setPreviewKey] = useState(1);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingDefaults, setIsResettingDefaults] = useState(false);
  const [isResettingUserSeen, setIsResettingUserSeen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Editable configuration state
  const [config, setConfig] = useState(DEFAULT_WELCOME_CONFIG);
  const [originalConfig, setOriginalConfig] = useState(DEFAULT_WELCOME_CONFIG);

  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  }, [config, originalConfig]);

  // Load configuration from backend
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
      toast.error("Không thể tải cấu hình từ máy chủ, đang sử dụng cấu hình mặc định.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Handle nested state updates
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

  // Replay animation inside preview iframe/box
  const handleReplay = () => {
    setPreviewKey((k) => k + 1);
    toast.success("Đang phát lại hiệu ứng mở đầu!", { id: "replay-toast", duration: 1500 });
  };

  // Save changes to backend
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await updateAdminWelcomeSettingsApi(config);
      if (!res?.success) throw new Error(res?.message || "Không thể lưu cấu hình");
      setOriginalConfig(config);
      setUpdatedAt(new Date().toISOString());
      toast.success("Đã lưu cấu hình màn hình mở đầu thành công!");
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err?.message || "Lỗi khi lưu cấu hình.");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default
  const handleResetDefaults = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn khôi phục toàn bộ nội dung và thời gian về mặc định ban đầu?")) {
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
      toast.success("Đã khôi phục cài đặt mặc định thành công!");
    } catch (err) {
      console.error("Reset error:", err);
      toast.error(err?.message || "Lỗi khi khôi phục mặc định.");
    } finally {
      setIsResettingDefaults(false);
    }
  };

  // Reset current user's seen status for live testing
  const handleResetMyWelcomeState = async () => {
    if (!authUser?.id) return;
    setIsResettingUserSeen(true);
    try {
      const res = await resetUserWelcomeStatusApi(authUser.id);
      if (!res?.success) throw new Error(res?.message || "Không thể đặt lại trạng thái");
      toast.success(
        "Đã đặt lại trạng thái đã xem cho tài khoản của bạn! Khi đăng nhập lại với vai trò Học viên hoặc Giáo viên, màn hình mở đầu sẽ tự động hiển thị.",
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loading message="Đang tải cấu hình màn hình mở đầu..." />
      </div>
    );
  }

  const roleConfig = activeTab === "teacher" ? config.teacher : config.student;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <Sparkles className="w-3.5 h-3.5" />
              Giao diện & Trải nghiệm
            </span>
            {isDirty && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Chưa lưu thay đổi
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Màn hình mở đầu (Welcome Screen)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Xem lại màn hình Liquid Glass xuất hiện lần đầu dành cho Giảng viên & Học viên khi đăng nhập LMS, tinh chỉnh câu chào, thời lượng và thông điệp.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsFullscreenPreview(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm transition-all cursor-pointer"
          >
            <FiEye className="w-4 h-4" />
            <span>Xem toàn màn hình</span>
          </button>

          <button
            type="button"
            onClick={handleReplay}
            title="Phát lại hiệu ứng animation"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
            <span>Phát lại</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isResettingDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-all cursor-pointer"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isResettingDefaults ? "animate-spin" : ""}`} />
            <span>Mặc định</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer ${
              isDirty
                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20"
                : "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
            }`}
          >
            <FiSave className={`w-3.5 h-3.5 ${isSaving ? "animate-spin" : ""}`} />
            <span>{isSaving ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </button>
        </div>
      </div>

      {/* Role Selection Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab("student");
              handleReplay();
            }}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === "student"
                ? "bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <GraduationCap className="w-4 h-4 text-cyan-500" />
            <span>Màn xuất hiện Học viên (Student)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("teacher");
              handleReplay();
            }}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === "teacher"
                ? "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span>Màn xuất hiện Giáo viên (Teacher)</span>
          </button>
        </div>

        {/* Viewport size controls for preview */}
        <div className="flex items-center gap-1 px-2 self-end sm:self-auto">
          <span className="text-[11px] font-medium text-slate-400 mr-1 hidden md:inline">Khung xem:</span>
          <button
            type="button"
            onClick={() => setViewportMode("desktop")}
            title="Xem chế độ màn hình lớn"
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              viewportMode === "desktop"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <FiMonitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewportMode("tablet")}
            title="Xem chế độ máy tính bảng"
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              viewportMode === "tablet"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <FiTablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewportMode("mobile")}
            title="Xem chế độ di động"
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              viewportMode === "mobile"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <FiSmartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Real-time Live Interactive Preview Canvas (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 px-1">
            <span className="flex items-center gap-1.5">
              <FiEye className="w-3.5 h-3.5 text-blue-500" />
              Xem trước tương tác thời gian thực ({activeTab === "teacher" ? "Giáo viên" : "Học viên"})
            </span>
            <span className="text-[11px] text-slate-400 font-normal">
              {activeTab === "teacher"
                ? "Hiệu ứng: 3D Liquid Glass Book • Flipping Pages • Warm Amber"
                : "Hiệu ứng: 3D Crystal Mortarboard • Starlight • Journey Arc"}
            </span>
          </div>

          {/* Device Mockup Frame */}
          <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-slate-900 p-2 sm:p-3 shadow-2xl transition-all">
            {/* Mockup Titlebar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                <span className="text-[11px] font-mono text-slate-400 ml-2">
                  preview://welcome/{activeTab}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReplay}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  <FiRotateCcw className="w-3 h-3" />
                  <span>Phát lại</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-blue-300 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/50 transition cursor-pointer"
                >
                  <FiEye className="w-3 h-3" />
                  <span>Toàn màn hình</span>
                </button>
              </div>
            </div>

            {/* Embedded Screen Container with viewport mode constraint */}
            <div
              className={`mx-auto transition-all duration-300 ${
                viewportMode === "mobile"
                  ? "max-w-[360px]"
                  : viewportMode === "tablet"
                  ? "max-w-[560px]"
                  : "w-full"
              }`}
            >
              <div key={`preview-${activeTab}-${previewKey}`} className="relative rounded-xl overflow-hidden">
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

          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-700 dark:text-blue-300">
            <FiInfo className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Khung xem trước trên phản ánh chính xác từng câu chữ, hiệu ứng lật trang 3D và tiến trình chuyển cảnh. Khi học viên hoặc giảng viên đăng nhập lần đầu, họ sẽ được trải nghiệm đúng nội dung mà bạn điều chỉnh ở đây.
            </p>
          </div>
        </div>

        {/* Right Column: Customization Form (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Section 1: Role-specific Content Form */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-xl ${
                    activeTab === "teacher"
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400"
                  }`}
                >
                  {activeTab === "teacher" ? (
                    <BookOpen className="w-4 h-4" />
                  ) : (
                    <GraduationCap className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Nội dung cho {activeTab === "teacher" ? "Giáo viên" : "Học viên"}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Chỉnh sửa câu chào, lời dẫn và nút bấm
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  activeTab === "teacher"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300"
                }`}
              >
                {activeTab}
              </span>
            </div>

            {/* Field: Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-title">Tiêu đề mở đầu (Word Reveal Title)</label>
                <span className="text-[10px] text-slate-400">
                  {roleConfig?.title?.length || 0}/120 ký tự
                </span>
              </div>
              <input
                id="welcome-title"
                type="text"
                value={roleConfig?.title || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "title", e.target.value)}
                placeholder="VD: Chào mừng đến với không gian học tập"
                maxLength={120}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-medium"
              />
              <p className="text-[11px] text-slate-400">
                Hiệu ứng chuyển động Word Reveal sẽ tự động làm sáng từng từ trong tiêu đề này.
              </p>
            </div>

            {/* Field: Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-desc">Mô tả / Lời dẫn (Description)</label>
                <span className="text-[10px] text-slate-400">
                  {roleConfig?.description?.length || 0}/300 ký tự
                </span>
              </div>
              <textarea
                id="welcome-desc"
                rows={3}
                value={roleConfig?.description || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "description", e.target.value)}
                placeholder="VD: Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn."
                maxLength={300}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all resize-none font-normal"
              />
            </div>

            {/* Field: Action Button Text */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-btn">Chữ trên nút hành động chính</label>
                <span className="text-[10px] text-slate-400">
                  {roleConfig?.buttonText?.length || 0}/60 ký tự
                </span>
              </div>
              <input
                id="welcome-btn"
                type="text"
                value={roleConfig?.buttonText || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "buttonText", e.target.value)}
                placeholder="VD: Bắt đầu học"
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-medium"
              />
            </div>

            {/* Field: Loading / Transition Note */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="welcome-note">Dòng trạng thái đếm ngược (Loading Note)</label>
                <span className="text-[10px] text-slate-400">
                  {roleConfig?.loadingNote?.length || 0}/150 ký tự
                </span>
              </div>
              <input
                id="welcome-note"
                type="text"
                value={roleConfig?.loadingNote || ""}
                onChange={(e) => handleRoleFieldChange(activeTab, "loadingNote", e.target.value)}
                placeholder="VD: Đang chuẩn bị không gian học tập của bạn..."
                maxLength={150}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>

          {/* Section 2: Global LMS & Timing Settings */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <FiSliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cài đặt chung & Thời gian
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Áp dụng chung cho cả hai không gian
                </p>
              </div>
            </div>

            {/* Field: Brand Badge */}
            <div className="space-y-1.5">
              <label htmlFor="brand-badge" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Huy hiệu thương hiệu phía trên (Badge Text)
              </label>
              <input
                id="brand-badge"
                type="text"
                value={config.badge || ""}
                onChange={(e) => handleGlobalFieldChange("badge", e.target.value)}
                placeholder="VD: MolyCourse LMS"
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-medium"
              />
            </div>

            {/* Field: Auto Transition Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label htmlFor="transition-duration">Thời lượng hiển thị tự động</label>
                <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                  {config.autoTransitionDuration || 4.8} giây
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="transition-duration"
                  type="range"
                  min="2.0"
                  max="12.0"
                  step="0.2"
                  value={config.autoTransitionDuration || 4.8}
                  onChange={(e) => handleGlobalFieldChange("autoTransitionDuration", parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Nhanh (2.0s)</span>
                <span>Khuyên dùng (4.8s)</span>
                <span>Thong thả (12.0s)</span>
              </div>
            </div>

            {/* Toggle: Auto Transition Enabled */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Tự động chuyển trang sau khi hết giờ
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nếu tắt, học viên/giáo viên phải bấm nút để vào LMS
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoTransitionEnabled !== false}
                  onChange={(e) => handleGlobalFieldChange("autoTransitionEnabled", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          </div>

          {/* Section 3: Testing & Debugging Tools */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <FiUserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Thử nghiệm thực tế
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Đặt lại trạng thái đã xem cho tài khoản kiểm thử
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Tài khoản Admin không bao giờ bị chặn bởi màn hình chào mừng trong quá trình làm việc. Bạn có thể đặt lại trạng thái đã xem của tài khoản để thử nghiệm trên tài khoản Học viên hoặc Giáo viên.
            </p>

            <button
              type="button"
              onClick={handleResetMyWelcomeState}
              disabled={isResettingUserSeen}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
            >
              <FiRotateCcw className={`w-3.5 h-3.5 ${isResettingUserSeen ? "animate-spin" : ""}`} />
              <span>{isResettingUserSeen ? "Đang xử lý..." : "Đặt lại trạng thái đã xem cho tài khoản của tôi"}</span>
            </button>

            {updatedAt && (
              <p className="text-[10px] text-slate-400 text-center pt-1 font-mono">
                Cập nhật lần cuối: {new Date(updatedAt).toLocaleString("vi-VN")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Full-Screen Preview Cinema Modal */}
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
