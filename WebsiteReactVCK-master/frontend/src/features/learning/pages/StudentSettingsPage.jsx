import { useState, useEffect, useCallback } from "react";
import {
  User,
  Lock,
  Globe,
  Bell,
  Palette,
  Image as ImageIcon,
  Sun,
  Moon,
  Monitor,
  Check,
  Plus,
  Pencil,
  Camera,
  Laptop,
  Smartphone,
  ShieldCheck,
  GraduationCap,
  FileText,
  Calendar,
  Megaphone,
  X,
  ChevronDown,
  Upload,
  Link as LinkIcon,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Wifi,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuthContext } from "../../../context/AuthContext";
import useCUDUser from "../../../hooks/useCUDUser";
import AvatarModal from "../../../components/AvatarModal";
import { getAvatarUrl, handleAvatarError } from "../../../utils/avatar";
import { fetchMyTrustedDevices } from "../../api/accountSecurityClient";
import { fetchNotificationPreferences, updateNotificationPreferences } from "../../api/lmsClient";

import { CSCA_WALLPAPERS, normalizeLmsWallpaper } from "../../../utils/classWallpapers";

// Default wallpapers list with aesthetic names for CSCA students
const DEFAULT_WALLPAPERS = CSCA_WALLPAPERS;

const formatDeviceTime = (value) => {
  if (!value) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const isMobileDevice = (device) => /iphone|ipad|android|mobile/i.test(
  `${device?.deviceName || ""} ${device?.userAgent || ""}`,
);

export default function StudentSettingsPage() {
  const { authUser } = useAuthContext();
  const { i18n } = useTranslation();
  const { updateUserInfo, updateStudentProfile, saving } = useCUDUser();

  // Modals
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editInfoModalOpen, setEditInfoModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [devicesModalOpen, setDevicesModalOpen] = useState(false);
  const [addWallpaperModalOpen, setAddWallpaperModalOpen] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState({ limit: 2, used: 0, devices: [] });
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");

  // Student Profile state
  const [studentInfo, setStudentInfo] = useState({
    fullName: "",
    studentCode: "",
    email: "",
    phone: "",
    classCode: "",
    department: "",
    program: "",
  });

  // Load student info from authUser
  useEffect(() => {
    if (authUser) {
      const study = authUser.studentProfile || {};
      const code =
        authUser.studentCode ||
        study.studentCode ||
        authUser.externalStudentId ||
        (authUser.id ? `CSCA-${String(authUser.id).padStart(3, "0")}` : "CSCA-001");
      const phone = authUser.phone || authUser.managementPhone || "Chưa cập nhật";
      const cls =
        authUser.classCode ||
        authUser.managementClassSourceId ||
        authUser.enrolledClasses?.[0]?.classCode ||
        "Chưa phân lớp";
      const dept = authUser.department || study.targetMajor || "Ban Đào Tạo CSCA";
      setStudentInfo({
        fullName: authUser.fullName || study.fullName || authUser.username || "Học viên CSCA",
        studentCode: code,
        email: authUser.email || "student@csca.edu.vn",
        phone: phone,
        classCode: cls,
        department: dept,
        program: study.targetProgram || "Luyện thi Học bổng CSCA - Cử nhân",
      });
    }
  }, [authUser]);

  const loadTrustedDevices = useCallback(async () => {
    try {
      setDevicesLoading(true);
      setDevicesError("");
      const response = await fetchMyTrustedDevices();
      setTrustedDevices(response?.data || { limit: 2, used: 0, devices: [] });
    } catch (error) {
      setDevicesError(error?.message || "Không thể tải danh sách thiết bị");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.id) loadTrustedDevices();
  }, [authUser?.id, loadTrustedDevices]);

  const handleOpenDevices = () => {
    setDevicesModalOpen(true);
    loadTrustedDevices();
  };

  // Notification Preferences State
  const [notifications, setNotifications] = useState({
    courses: true,
    assignments: true,
    calendar: true,
    announcements: true,
  });

  useEffect(() => {
    let active = true;
    fetchNotificationPreferences()
      .then((response) => {
        if (active) setNotifications((current) => ({ ...current, ...(response?.data || {}) }));
      })
      .catch((error) => console.warn("Unable to load notification preferences", error));
    return () => { active = false; };
  }, []);

  const handleToggleNotification = async (key) => {
    const previous = notifications;
    const updated = { ...previous, [key]: !previous[key] };
    setNotifications(updated);
    try {
      const response = await updateNotificationPreferences({ [key]: updated[key] });
      setNotifications((current) => ({ ...current, ...(response?.data || {}) }));
      toast.success("Đã lưu tùy chọn thông báo", { duration: 1500 });
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
    } catch (error) {
      setNotifications(previous);
      toast.error(error?.message || "Không thể lưu tùy chọn thông báo");
    }
  };

  // Language state
  const [languageOpen, setLanguageOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem("csca_selected_language");
    if (saved === "en" || saved === "vi") return saved;
    return i18n.language?.startsWith("en") ? "en" : "vi";
  });

  const languages = [
    { code: "vi", name: "Tiếng Việt", flag: "🇻🇳", available: true },
    { code: "zh", name: "中文 (Tiếng Trung)", flag: "🇨🇳", available: false },
    { code: "en", name: "English", flag: "🇬🇧", available: true },
  ];

  const handleSelectLanguage = async (code) => {
    const langObj = languages.find((language) => language.code === code);
    if (!langObj?.available) {
      toast("Tiếng Trung đang được hoàn thiện và chưa áp dụng cho toàn hệ thống.", { icon: "🌐" });
      return;
    }
    setSelectedLanguage(code);
    localStorage.setItem("csca_selected_language", code);
    await i18n.changeLanguage(code);
    setLanguageOpen(false);
    toast.success(`Đã chuyển ngôn ngữ hiển thị sang: ${langObj?.name}`);
  };

  // Theme selection
  const handleSelectTheme = (themeKey) => {
    if (themeKey === "dark") {
      toast("Chế độ Tối (Dark mode) đang được hoàn thiện và sẽ sớm cập nhật!", {
        icon: "🌙",
        duration: 3000,
      });
      return;
    }
    if (themeKey === "system") {
      toast("Chế độ tự động theo thiết bị đang được phát triển!", {
        icon: "🖥️",
        duration: 3000,
      });
      return;
    }
    toast.success("Đang sử dụng Giao diện Sáng mặc định");
  };

  // Wallpapers list & active selection
  const [wallpapers, setWallpapers] = useState(() => {
    const savedCustom = localStorage.getItem("csca_custom_wallpapers");
    if (savedCustom) {
      try {
        const parsed = JSON.parse(savedCustom);
        return [...DEFAULT_WALLPAPERS, ...parsed];
      } catch {
        // fallback
      }
    }
    return DEFAULT_WALLPAPERS;
  });

  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    const savedWallpaper = localStorage.getItem("csca_lms_wallpaper");
    const wallpaper = normalizeLmsWallpaper(savedWallpaper);
    if (wallpaper !== savedWallpaper) localStorage.setItem("csca_lms_wallpaper", wallpaper);
    return wallpaper;
  });

  const handleSelectWallpaper = (wp) => {
    setCurrentWallpaper(wp.url);
    localStorage.setItem("csca_lms_wallpaper", wp.url);
    window.dispatchEvent(new CustomEvent("csca_wallpaper_changed", { detail: wp.url }));
    toast.success(`Đã đổi hình nền: ${wp.title}`);
  };

  // Password Change Form State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      toast.error("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    try {
      setPasswordLoading(true);
      await updateUserInfo({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success("Đổi mật khẩu thành công!");
      setPasswordModalOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err.message || "Không thể đổi mật khẩu");
    } finally {
      setPasswordLoading(false);
    }
  };

  // Edit Info Form State
  const [infoForm, setInfoForm] = useState({
    fullName: "",
    department: "",
    program: "",
    studentCode: "",
  });

  const handleOpenEditInfo = () => {
    setInfoForm({
      fullName: studentInfo.fullName,
      department: studentInfo.department,
      program: studentInfo.program,
      studentCode: studentInfo.studentCode,
    });
    setEditInfoModalOpen(true);
  };

  const handleSaveEditInfo = async (e) => {
    e.preventDefault();
    if (!infoForm.fullName.trim()) {
      toast.error("Họ và tên không được để trống");
      return;
    }

    try {
      await updateStudentProfile({
        fullName: infoForm.fullName.trim(),
        targetMajor: infoForm.department.trim(),
        targetProgram: infoForm.program.trim(),
      });
      setStudentInfo((prev) => ({
        ...prev,
        fullName: infoForm.fullName.trim(),
        department: infoForm.department.trim(),
        program: infoForm.program.trim(),
        studentCode: infoForm.studentCode.trim() || prev.studentCode,
      }));
      toast.success("Đã cập nhật thông tin học viên thành công!");
      setEditInfoModalOpen(false);
    } catch (err) {
      toast.error(err.message || "Không thể cập nhật thông tin");
    }
  };

  // Add Custom Wallpaper Form State
  const [newWallpaperUrl, setNewWallpaperUrl] = useState("");
  const [newWallpaperTitle, setNewWallpaperTitle] = useState("");

  const handleAddCustomWallpaper = (e) => {
    e.preventDefault();
    const url = newWallpaperUrl.trim();
    if (!url) {
      toast.error("Vui lòng nhập đường dẫn hình ảnh hoặc tải ảnh lên");
      return;
    }

    const newWp = {
      id: `custom-${Date.now()}`,
      title: newWallpaperTitle.trim() || "Hình nền tùy chỉnh",
      subtitle: "Người dùng tải lên",
      url: url,
    };

    const existingCustom = JSON.parse(localStorage.getItem("csca_custom_wallpapers") || "[]");
    const updatedCustom = [newWp, ...existingCustom];
    localStorage.setItem("csca_custom_wallpapers", JSON.stringify(updatedCustom));
    setWallpapers([...DEFAULT_WALLPAPERS, ...updatedCustom]);

    handleSelectWallpaper(newWp);
    setNewWallpaperUrl("");
    setNewWallpaperTitle("");
    setAddWallpaperModalOpen(false);
  };

  const handleCustomFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp hình ảnh");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Kích thước ảnh tối đa là 12MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setNewWallpaperUrl(event.target.result);
      if (!newWallpaperTitle) {
        setNewWallpaperTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
      toast.success("Đã nạp hình ảnh từ máy tính!");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async (url) => {
    try {
      await updateUserInfo({ avatarUrl: url });
      setAvatarModalOpen(false);
      toast.success("Cập nhật ảnh đại diện thành công!");
    } catch (err) {
      toast.error(err.message || "Không thể cập nhật ảnh đại diện");
    }
  };

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-[#102f63] sm:text-3xl">Cài đặt</h1>
        <p className="mt-1 text-sm text-slate-500">Tùy chỉnh tài khoản và trải nghiệm học tập của bạn</p>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ================= LEFT COLUMN ================= */}
        <div className="space-y-6">
          {/* CARD 1: THÔNG TIN TÀI KHOẢN */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <User className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-[#102f63]">Thông tin tài khoản</h2>
            </div>

            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              {/* Avatar with cherry blossom aura */}
              <div className="relative shrink-0">
                {/* Decorative subtle cherry blossoms watercolor spray behind avatar */}
                <div className="pointer-events-none absolute -inset-3 -z-10 flex items-center justify-center opacity-85">
                  <div className="h-32 w-32 rounded-full bg-gradient-to-tr from-pink-200/50 via-rose-100/40 to-blue-100/30 blur-md" />
                </div>

                <div className="relative">
                  <img
                    src={getAvatarUrl(authUser)}
                    onError={handleAvatarError}
                    alt={studentInfo.fullName}
                    className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-[0_8px_24px_rgba(30,80,120,0.18)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-md ring-2 ring-white transition hover:bg-blue-600 hover:scale-105"
                    title="Đổi ảnh đại diện"
                    aria-label="Đổi ảnh đại diện"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Student details list */}
              <div className="w-full flex-1 space-y-2.5 text-xs sm:text-sm">
                {/* Họ và tên */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Họ và tên</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#102f63]">{studentInfo.fullName}</span>
                    <button
                      type="button"
                      onClick={handleOpenEditInfo}
                      className="rounded-lg p-1 text-blue-500 transition hover:bg-blue-50 hover:text-blue-700"
                      title="Chỉnh sửa thông tin học viên"
                      aria-label="Chỉnh sửa thông tin"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mã học viên */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Mã học viên</span>
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-mono font-bold text-blue-700 border border-blue-200">
                    {studentInfo.studentCode}
                  </span>
                </div>

                {/* Số điện thoại */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Số điện thoại</span>
                  <span className="font-semibold text-slate-700">{studentInfo.phone}</span>
                </div>

                {/* Email */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Email</span>
                  <span className="font-semibold text-slate-700">{studentInfo.email}</span>
                </div>

                {/* Mã lớp */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Mã lớp</span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-800 border border-slate-200">
                    {studentInfo.classCode}
                  </span>
                </div>

                {/* Khoa / Ban chuyên môn */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Khoa / Ban</span>
                  <span className="font-semibold text-slate-700">{studentInfo.department}</span>
                </div>

                {/* Chương trình */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-medium text-slate-500">Chương trình</span>
                  <span className="text-right font-semibold text-slate-700">{studentInfo.program}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: BẢO MẬT */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Bảo mật</h2>
                <p className="text-xs text-slate-500">Bảo vệ tài khoản của bạn</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Row 1: Mật khẩu */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200/80 text-slate-600">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Mật khẩu</p>
                    <p className="text-xs tracking-widest text-slate-400">••••••••••</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(true)}
                  className="rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800"
                >
                  Đổi mật khẩu
                </button>
              </div>

              {/* 2FA is not exposed until the server-side enrollment flow exists. */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Xác thực 2 bước (2FA)</p>
                    <p className="text-xs text-slate-500">Chưa được bật trên máy chủ</p>
                  </div>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                  Sắp ra mắt
                </span>
              </div>

              {/* Row 3: Thiết bị đăng nhập */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Laptop className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Thiết bị đăng nhập</p>
                    <p className="text-xs text-slate-500">
                      {trustedDevices.used}/{trustedDevices.limit} thiết bị tin cậy đã dùng
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenDevices}
                  className="rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800"
                >
                  Xem chi tiết
                </button>
              </div>
            </div>
          </div>

          {/* CARD 3: NGÔN NGỮ */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#102f63]">Ngôn ngữ</h2>
                  <p className="text-xs text-slate-500">Chọn ngôn ngữ hiển thị trong hệ thống</p>
                </div>
              </div>

              {/* Language Dropdown Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLanguageOpen(!languageOpen)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <span>{languages.find((l) => l.code === selectedLanguage)?.flag}</span>
                  <span>{languages.find((l) => l.code === selectedLanguage)?.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {languageOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleSelectLanguage(lang.code)}
                        aria-disabled={!lang.available}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          !lang.available
                            ? "cursor-not-allowed text-slate-400"
                            : selectedLanguage === lang.code
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                        </span>
                        {!lang.available ? (
                          <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Sắp có</span>
                        ) : selectedLanguage === lang.code ? (
                          <Check className="h-3.5 w-3.5 text-blue-600" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="space-y-6">
          {/* CARD 4: THÔNG BÁO */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Thông báo</h2>
                <p className="text-xs text-slate-500">Tùy chọn được lưu riêng trên trình duyệt này</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Option 1: Thông báo khóa học */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Thông báo khóa học</p>
                    <p className="text-xs text-slate-500">Thông tin về lớp học, lịch học, thay đổi từ giảng viên</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.courses}
                  onClick={() => handleToggleNotification("courses")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    notifications.courses ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.courses ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 2: Bài tập và kiểm tra */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Bài tập và kiểm tra</p>
                    <p className="text-xs text-slate-500">Nhắc nhở về bài tập, hạn nộp và kết quả</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.assignments}
                  onClick={() => handleToggleNotification("assignments")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    notifications.assignments ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.assignments ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 3: Lịch và sự kiện */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Lịch và sự kiện</p>
                    <p className="text-xs text-slate-500">Thông báo về lịch học, lịch thi và các sự kiện quan trọng</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.calendar}
                  onClick={() => handleToggleNotification("calendar")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    notifications.calendar ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.calendar ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 4: Tin tức và cập nhật */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Tin tức và cập nhật</p>
                    <p className="text-xs text-slate-500">Thông báo về tính năng mới, bảo trì hệ thống</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.announcements}
                  onClick={() => handleToggleNotification("announcements")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    notifications.announcements ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.announcements ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* CARD 5: GIAO DIỆN */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Giao diện</h2>
                <p className="text-xs text-slate-500">Tùy chọn giao diện hiển thị</p>
              </div>
            </div>

            {/* 3 Theme Options Grid */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Theme 1: Sáng (Active) */}
              <div
                onClick={() => handleSelectTheme("light")}
                className="group relative cursor-pointer rounded-2xl border-2 border-blue-500 bg-white p-2.5 shadow-sm ring-2 ring-blue-500/20 transition hover:shadow-md"
              >
                <div className="relative h-20 w-full overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src="/student-campus-spring.webp"
                    alt="Giao diện Sáng"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  {/* Selected badge */}
                  <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Sáng</p>
                    <p className="text-[10px] text-slate-500">Giao diện mặc định</p>
                  </div>
                </div>
              </div>

              {/* Theme 2: Tối (Disabled / Sắp ra mắt) */}
              <div
                onClick={() => handleSelectTheme("dark")}
                className="group relative cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 opacity-80 transition hover:border-slate-300"
              >
                <div className="relative h-20 w-full overflow-hidden rounded-xl bg-slate-900">
                  <img
                    src="/wallpapers/imperial-lake.jpg"
                    alt="Giao diện Tối"
                    className="h-full w-full object-cover brightness-[0.35] contrast-125 saturate-150"
                  />
                  {/* Night moon badge */}
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-slate-200 backdrop-blur-sm">
                      Sắp ra mắt
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Tối</p>
                    <p className="text-[10px] text-slate-400">Dễ nhìn vào ban đêm</p>
                  </div>
                </div>
              </div>

              {/* Theme 3: Theo hệ thống (Disabled / Sắp ra mắt) */}
              <div
                onClick={() => handleSelectTheme("system")}
                className="group relative cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 opacity-80 transition hover:border-slate-300"
              >
                <div className="relative flex h-20 w-full overflow-hidden rounded-xl">
                  {/* Left half daylight */}
                  <div className="h-full w-1/2 overflow-hidden">
                    <img
                      src="/student-campus-spring.webp"
                      alt="Hệ thống ngày"
                      className="h-full w-[200%] max-w-none object-cover"
                    />
                  </div>
                  {/* Right half night */}
                  <div className="h-full w-1/2 overflow-hidden bg-slate-900">
                    <img
                      src="/wallpapers/imperial-lake.jpg"
                      alt="Hệ thống đêm"
                      className="h-full w-[200%] max-w-none -translate-x-1/2 object-cover brightness-[0.35] contrast-125"
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-slate-200 backdrop-blur-sm">
                      Sắp ra mắt
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Theo hệ thống</p>
                    <p className="text-[10px] text-slate-400">Tự động theo thiết bị</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 6: TÙY CHỈNH ẢNH NỀN */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Tùy chỉnh ảnh nền</h2>
                <p className="text-xs text-slate-500">Chọn hình nền yêu thích cho trải nghiệm học tập của bạn</p>
              </div>
            </div>

            {/* Horizontal Wallpaper Thumbnails */}
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]">
              {wallpapers.map((wp) => {
                const isSelected = currentWallpaper === wp.url;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => handleSelectWallpaper(wp)}
                    className={`group relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border-2 transition-all focus:outline-none ${
                      isSelected
                        ? "border-blue-600 ring-2 ring-blue-500/30 scale-[1.02] shadow-md"
                        : "border-slate-200 hover:border-blue-300 hover:scale-[1.01]"
                    }`}
                    title={wp.title}
                  >
                    <img
                      src={wp.url}
                      alt={wp.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    {/* Dark gradient label overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-left">
                      <p className="truncate text-[10px] font-bold text-white drop-shadow">{wp.title}</p>
                    </div>

                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Add Custom Wallpaper Button */}
              <button
                type="button"
                onClick={() => setAddWallpaperModalOpen(true)}
                className="flex h-20 w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                title="Thêm ảnh nền tùy chỉnh"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 group-hover:bg-blue-100">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-[11px] font-bold">Thêm ảnh nền</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. EDIT INFO MODAL */}
      {editInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Pencil className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-[#102f63]">Chỉnh sửa thông tin học viên</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditInfoModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInfo} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={infoForm.fullName}
                  onChange={(e) => setInfoForm({ ...infoForm, fullName: e.target.value })}
                  placeholder="Nhập họ và tên học viên"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Mã học viên (CSCA)</label>
                <input
                  type="text"
                  value={infoForm.studentCode}
                  onChange={(e) => setInfoForm({ ...infoForm, studentCode: e.target.value })}
                  placeholder="Ví dụ: CSCA-2026-HV01"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Khoa / Ban chuyên môn</label>
                <input
                  type="text"
                  value={infoForm.department}
                  onChange={(e) => setInfoForm({ ...infoForm, department: e.target.value })}
                  placeholder="Ví dụ: Ban Tự Nhiên (Toán - Lý - Hóa - Trung)"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Chương trình học</label>
                <input
                  type="text"
                  value={infoForm.program}
                  onChange={(e) => setInfoForm({ ...infoForm, program: e.target.value })}
                  placeholder="Ví dụ: Luyện thi Học bổng CSCA - Cử nhân"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditInfoModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. CHANGE PASSWORD MODAL */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Lock className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-[#102f63]">Đổi mật khẩu tài khoản</h3>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePassword} className="mt-5 space-y-4">
              {/* Current password */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Mật khẩu hiện tại</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword.current ? "text" : "password"}
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Nhập mật khẩu hiện tại"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => ({ ...p, current: !p.current }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Mật khẩu mới</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword.new ? "text" : "password"}
                    required
                    minLength={6}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Tối thiểu 6 ký tự"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => ({ ...p, new: !p.new }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Xác nhận mật khẩu mới</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword.confirm ? "text" : "password"}
                    required
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Nhập lại mật khẩu mới"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => ({ ...p, confirm: !p.confirm }))}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {passwordLoading ? "Đang đổi..." : "Cập nhật mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. LOGGED-IN DEVICES MODAL */}
      {devicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Laptop className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#102f63]">Thiết bị tin cậy</h3>
                  <p className="text-xs text-slate-500">
                    Đã dùng {trustedDevices.used}/{trustedDevices.limit} thiết bị
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDevicesModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 max-h-[48vh] space-y-3 overflow-y-auto pr-1">
              {devicesLoading && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 py-8 text-xs font-semibold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang kiểm tra thiết bị...
                </div>
              )}

              {!devicesLoading && devicesError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <AlertTriangle className="mx-auto h-5 w-5 text-rose-500" />
                  <p className="mt-2 text-xs font-semibold text-rose-700">{devicesError}</p>
                  <button
                    type="button"
                    onClick={loadTrustedDevices}
                    className="mt-3 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-sm"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {!devicesLoading && !devicesError && trustedDevices.devices.length === 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 py-8 text-center text-xs text-slate-500">
                  Chưa có thiết bị tin cậy nào.
                </div>
              )}

              {!devicesLoading && !devicesError && trustedDevices.devices.map((device) => {
                const DeviceIcon = isMobileDevice(device) ? Smartphone : Laptop;
                return (
                  <div
                    key={device.id}
                    className={`rounded-2xl border p-3.5 ${
                      device.isCurrent ? "border-blue-200 bg-blue-50/60" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        device.isCurrent ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"
                      }`}>
                        <DeviceIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{device.deviceName}</p>
                          {device.isCurrent && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                              Thiết bị này
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                          <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />IP gần nhất: {device.lastIp || "Không xác định"}</span>
                          <span>Lần đăng nhập: {formatDeviceTime(device.lastLoginAt)}</span>
                          <span>Ghi nhận từ: {formatDeviceTime(device.firstSeenAt)}</span>
                          <span>{device.activeSessions > 0 ? `${device.activeSessions} phiên còn hiệu lực` : "Không có phiên còn hiệu lực"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
              <div className="flex gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Thiết bị vẫn được ghi nhớ khi token đăng nhập hết hạn. Học viên không thể tự xóa thiết bị;
                  chỉ quản trị viên mới có quyền giải phóng một trong 2 vị trí này.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setDevicesModalOpen(false)}
                className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADD WALLPAPER MODAL */}
      {addWallpaperModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Plus className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-[#102f63]">Thêm ảnh nền tùy chỉnh</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddWallpaperModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomWallpaper} className="mt-5 space-y-4">
              {/* File upload option */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Tải ảnh từ máy tính</label>
                <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-400 hover:bg-blue-50/40">
                  <Upload className="h-6 w-6 text-slate-400" />
                  <span className="mt-1 text-xs font-semibold text-slate-600">Nhấn để chọn tệp hình ảnh</span>
                  <span className="text-[10px] text-slate-400">JPG, PNG, WEBP (Tối đa 12MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Or URL input */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Hoặc nhập đường dẫn ảnh (Cloudinary / Railway / Web URL)
                </label>
                <div className="relative mt-1.5">
                  <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="url"
                    value={newWallpaperUrl}
                    onChange={(e) => setNewWallpaperUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/.../wallpaper.jpg"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-bold text-slate-700">Tên gợi nhớ cho ảnh nền</label>
                <input
                  type="text"
                  value={newWallpaperTitle}
                  onChange={(e) => setNewWallpaperTitle(e.target.value)}
                  placeholder="Ví dụ: Thư viện Bắc Kinh, Hoa anh đào..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              {/* Preview if url exists */}
              {newWallpaperUrl && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img
                    src={newWallpaperUrl}
                    alt="Preview"
                    className="h-28 w-full object-cover"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setAddWallpaperModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
                >
                  Áp dụng hình nền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. AVATAR MODAL */}
      <AvatarModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        onSave={handleSaveAvatar}
        currentAvatarUrl={getAvatarUrl(authUser)}
        saving={saving}
      />
    </div>
  );
}
