/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
  BookOpen,
  Calendar,
  X,
  ChevronDown,
  Upload,
  Link as LinkIcon,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  School,
  Users,
  ClipboardCheck,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Settings,
  GraduationCap,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuthContext } from "../../../context/AuthContext";
import useCUDUser from "../../../hooks/useCUDUser";
import AvatarModal from "../../../components/AvatarModal";
import { getAvatarUrl, handleAvatarError } from "../../../utils/avatar";
import { fetchMyTrustedDevices } from "../../api/accountSecurityClient";
import { fetchTeacherClassesLookup } from "../../api/lmsClient";
import { CSCA_WALLPAPERS, getClassCoverImage } from "../../../utils/classWallpapers";

const DEFAULT_WALLPAPERS = CSCA_WALLPAPERS;

const formatDeviceTime = (value) => {
  if (!value) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const isMobileDevice = (device) =>
  /iphone|ipad|android|mobile/i.test(
    `${device?.deviceName || ""} ${device?.userAgent || ""}`
  );

export default function TeacherSettingsPage() {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const { i18n } = useTranslation();
  const { updateUserInfo, updateStudentProfile, saving } = useCUDUser();

  // Modals state
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editInfoModalOpen, setEditInfoModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [devicesModalOpen, setDevicesModalOpen] = useState(false);
  const [addWallpaperModalOpen, setAddWallpaperModalOpen] = useState(false);

  // Security & Trusted devices state
  const [trustedDevices, setTrustedDevices] = useState({ limit: 2, used: 0, devices: [] });
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");

  // Classes lookup for teacher active classes section
  const [classesList, setClassesList] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);

  // Teacher Profile state
  const [teacherInfo, setTeacherInfo] = useState({
    fullName: "",
    teacherCode: "",
    email: "",
    phone: "",
    title: "",
    department: "",
    classCode: "",
    bio: "",
    experience: "",
  });

  // Load teacher profile info from authUser & localStorage
  useEffect(() => {
    if (authUser) {
      const study = authUser.studentProfile || {};
      const savedTeacherMeta = (() => {
        try {
          return JSON.parse(localStorage.getItem(`csca_teacher_profile_${authUser.id}`) || "{}");
        } catch {
          return {};
        }
      })();

      const yearPrefix = new Date().getFullYear().toString().slice(-2);
      const fallbackCode =
        authUser.teacherCode ||
        authUser.staffCode ||
        (authUser.id ? `MOLY-${yearPrefix}${String(authUser.id).padStart(3, "0")}` : `MOLY-${yearPrefix}001`);
      const phone = authUser.phone || authUser.managementPhone || "Chưa cập nhật";
      const cls =
        authUser.classCode ||
        authUser.teachingClasses?.[0]?.classCode ||
        "Chưa phân lớp";
      const pos = authUser.position || savedTeacherMeta.title || "Giảng viên";
      const dept = authUser.department || savedTeacherMeta.department || "Khoa Tiếng Trung & HSK";

      setTeacherInfo({
        fullName:
          authUser.fullName ||
          authUser.managementDisplayName ||
          savedTeacherMeta.fullName ||
          study.fullName ||
          authUser.username ||
          "Giảng viên CSCA",
        teacherCode: authUser.teacherCode || authUser.staffCode || savedTeacherMeta.teacherCode || fallbackCode,
        email: authUser.email || "giangvien@csca.edu.vn",
        phone: phone,
        classCode: cls,
        title: pos,
        department: dept,
        bio:
          savedTeacherMeta.bio ||
          "Giảng dạy, hướng dẫn đồ án và bồi dưỡng chuyên đề phản xạ học bổng CSCA.",
        experience: savedTeacherMeta.experience || "5+ năm kinh nghiệm giảng dạy & luyện thi CSCA",
      });
    }
  }, [authUser]);

  // Load classes lookup for teacher
  useEffect(() => {
    let isMounted = true;
    async function loadClasses() {
      try {
        setClassesLoading(true);
        const res = await fetchTeacherClassesLookup();
        if (isMounted) {
          setClassesList(Array.isArray(res?.data) ? res.data : []);
        }
      } catch (err) {
        console.error("Lỗi tải danh sách lớp giảng dạy:", err);
      } finally {
        if (isMounted) setClassesLoading(false);
      }
    }
    loadClasses();
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Notification Preferences for Teachers
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem("csca_teacher_notification_prefs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return {
      schedules: true,
      grading: true,
      attendance: true,
      payroll: true,
    };
  });

  const handleToggleNotification = (key) => {
    setNotifications((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem("csca_teacher_notification_prefs", JSON.stringify(updated));
      toast.success("Đã lưu tùy chọn thông báo giảng dạy", { duration: 1500 });
      return updated;
    });
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
    return localStorage.getItem("csca_lms_wallpaper") || "/student-campus-spring.webp";
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

  // Edit Teacher Info Form State
  const [infoForm, setInfoForm] = useState({
    fullName: "",
    title: "",
    department: "",
    bio: "",
    experience: "",
  });

  const handleOpenEditInfo = () => {
    setInfoForm({
      fullName: teacherInfo.fullName,
      title: teacherInfo.title,
      department: teacherInfo.department,
      bio: teacherInfo.bio,
      experience: teacherInfo.experience,
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
      // Sync with backend student_profile full_name & target fields
      await updateStudentProfile({
        fullName: infoForm.fullName.trim(),
        targetMajor: infoForm.department.trim(),
        targetProgram: infoForm.title.trim(),
      });

      const updatedProfile = {
        fullName: infoForm.fullName.trim(),
        title: infoForm.title.trim(),
        department: infoForm.department.trim(),
        bio: infoForm.bio.trim(),
        experience: infoForm.experience.trim(),
        teacherCode: teacherInfo.teacherCode,
      };

      if (authUser?.id) {
        localStorage.setItem(
          `csca_teacher_profile_${authUser.id}`,
          JSON.stringify(updatedProfile)
        );
      }

      setTeacherInfo((prev) => ({
        ...prev,
        ...updatedProfile,
      }));

      toast.success("Đã cập nhật thông tin giảng viên thành công!");
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
    <div className="relative mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-5 sm:py-6">
      {/* ================= HEADER HERO NGHỆ THUẬT ================= */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md mb-2">
          <Settings className="h-3.5 w-3.5 text-blue-600" />
          <span>Hồ sơ & Tài khoản Giảng viên</span>
        </div>
        <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
          Cài Đặt Giảng Viên
        </h1>
        <p className="mt-1 text-xs font-semibold italic text-slate-800 sm:text-sm">
          “Học quý ở người thầy, tận tâm gieo mầm tri thức cho thế hệ tương lai.”
        </p>
        <p className="font-['Ma_Shan_Zheng',cursive] text-xs sm:text-sm tracking-wider text-slate-600">
          —— 学贵得师，亦贵得友。
        </p>
      </div>

      {/* ================= BỐ CỤC 2 CỘT CHÍNH ================= */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ================= CỘT TRÁI (LEFT COLUMN) ================= */}
        <div className="space-y-5">
          {/* CARD 1: THÔNG TIN HỒ SƠ GIẢNG VIÊN */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#102f63]">Hồ sơ Giảng viên</h2>
                  <p className="text-xs text-slate-500">Thông tin đào tạo và hồ sơ công tác</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenEditInfo}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800 shadow-2xs"
                title="Chỉnh sửa thông tin giảng viên"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Chỉnh sửa</span>
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              {/* Avatar with subtle glow */}
              <div className="relative shrink-0">
                <div className="pointer-events-none absolute -inset-3 -z-10 flex items-center justify-center opacity-85">
                  <div className="h-32 w-32 rounded-full bg-gradient-to-tr from-sky-200/50 via-blue-100/40 to-indigo-100/30 blur-md" />
                </div>

                <div className="relative">
                  <img
                    src={getAvatarUrl(authUser)}
                    onError={handleAvatarError}
                    alt={teacherInfo.fullName}
                    className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-[0_8px_24px_rgba(30,80,120,0.18)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white transition hover:bg-blue-700 hover:scale-105"
                    title="Đổi ảnh đại diện"
                    aria-label="Đổi ảnh đại diện"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Teacher details list */}
              <div className="w-full flex-1 space-y-2 text-xs sm:text-sm">
                {/* Họ và tên */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Họ và tên</span>
                  <span className="font-bold text-[#102f63]">{teacherInfo.fullName}</span>
                </div>

                {/* Mã Giảng viên / Nhân sự */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Mã nhân sự / GV</span>
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-mono font-bold text-blue-700 border border-blue-200">
                    {teacherInfo.teacherCode}
                  </span>
                </div>

                {/* Số điện thoại */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Số điện thoại</span>
                  <span className="font-semibold text-slate-700">{teacherInfo.phone}</span>
                </div>

                {/* Email công vụ */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Email công vụ</span>
                  <span className="font-semibold text-slate-700 truncate max-w-[200px]" title={teacherInfo.email}>
                    {teacherInfo.email}
                  </span>
                </div>

                {/* Chức vụ / Vị trí Internal */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Chức vụ / Vị trí</span>
                  <span className="font-semibold text-slate-700 text-right">{teacherInfo.title}</span>
                </div>

                {/* Tổ / Bộ môn */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Khoa / Bộ môn</span>
                  <span className="font-semibold text-slate-700 text-right">{teacherInfo.department}</span>
                </div>

                {/* Lớp phụ trách */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-500">Mã lớp phụ trách</span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-800 border border-slate-200">
                    {teacherInfo.classCode}
                  </span>
                </div>

                {/* Vai trò hệ thống */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-medium text-slate-500">Vai trò hệ thống</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-100 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                    {isAdmin ? "QUẢN TRỊ VIÊN (ADMIN)" : "GIẢNG VIÊN (TEACHER)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Tiểu sử giảng dạy */}
            {teacherInfo.bio && (
              <div className="mt-4 rounded-2xl bg-sky-50/60 border border-sky-100 p-3 text-xs text-slate-700">
                <p className="font-bold text-[#102f63] mb-1 flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                  Tiểu sử & Giới thiệu giảng dạy
                </p>
                <p className="text-slate-600 leading-relaxed italic">
                  &ldquo;{teacherInfo.bio}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* CARD 2: LỚP HỌC ĐANG PHỤ TRÁCH (TEACHER CLASSES SUMMARY) */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-2xs">
                  <School className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#102f63]">Lớp học phụ trách</h2>
                  <p className="text-xs text-slate-500">
                    {classesList.length} lớp học bạn đang trực tiếp giảng dạy
                  </p>
                </div>
              </div>

              <Link
                to="/lms/teach/classes"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
              >
                <span>Xem tất cả</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {classesLoading ? (
              <div className="py-6 text-center text-xs text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-500 mb-1" />
                Đang tải danh sách lớp học...
              </div>
            ) : classesList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Hiện tại bạn chưa được phân công lớp học nào.
              </div>
            ) : (
              <div className="space-y-2.5">
                {classesList.slice(0, 3).map((cls, idx) => {
                  const cover = getClassCoverImage(cls, cls.id);
                  return (
                    <Link
                      key={cls.id}
                      to={`/lms/teach/classes/${cls.id}`}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-sky-300 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-xl bg-sky-100 border border-slate-200/80">
                          <img
                            src={cover}
                            alt={cls.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = "/student-campus-spring.webp";
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition">
                            {cls.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {cls.courseTitle || "Khóa học CSCA"}
                          </p>
                          <p className="text-[10px] font-semibold text-blue-700 mt-0.5 flex items-center gap-2">
                            <span>{cls.sessions?.length || 0} buổi học</span>
                            <span>·</span>
                            <span>{cls.total_students || 0} học viên</span>
                          </p>
                        </div>
                      </div>

                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition shrink-0" />
                    </Link>
                  );
                })}

                {classesList.length > 3 && (
                  <p className="text-center text-[11px] text-slate-500 pt-1">
                    Và còn <strong>{classesList.length - 3} lớp khác</strong> trong danh sách giảng dạy.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* CARD 3: BẢO MẬT & ĐỔI MẬT KHẨU */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Bảo mật</h2>
                <p className="text-xs text-slate-500">Bảo vệ tài khoản và quyền truy cập giảng dạy</p>
              </div>
            </div>

            <div className="space-y-3">
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
                  className="rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800 shadow-2xs"
                >
                  Đổi mật khẩu
                </button>
              </div>

              {/* Row 2: 2FA */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Xác thực 2 bước (2FA)</p>
                    <p className="text-xs text-slate-500">Bảo vệ nâng cao cho tài khoản giảng viên</p>
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
                  className="rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800 shadow-2xs"
                >
                  Xem chi tiết
                </button>
              </div>
            </div>
          </div>

          {/* CARD 4: NGÔN NGỮ */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#102f63]">Ngôn ngữ</h2>
                  <p className="text-xs text-slate-500">Chọn ngôn ngữ hiển thị hệ thống giảng dạy</p>
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

        {/* ================= CỘT PHẢI (RIGHT COLUMN) ================= */}
        <div className="space-y-5">
          {/* CARD 5: THÔNG BÁO GIẢNG DẠY */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Thông báo Giảng dạy</h2>
                <p className="text-xs text-slate-500">Tùy chỉnh thông báo nhắc lịch dạy và bài nộp</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Option 1: Nhắc nhở Lịch dạy & Buổi học */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Lịch dạy & Buổi học trực tuyến</p>
                    <p className="text-xs text-slate-500">Nhắc nhở trước khi buổi dạy bắt đầu 15 phút và thay đổi lịch</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.schedules}
                  onClick={() => handleToggleNotification("schedules")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    notifications.schedules ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.schedules ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 2: Bài tập & Bài nộp cần chấm */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Bài nộp chờ chấm điểm</p>
                    <p className="text-xs text-slate-500">Thông báo khi có học viên mới nộp bài tập hoặc bài kiểm tra</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.grading}
                  onClick={() => handleToggleNotification("grading")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    notifications.grading ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.grading ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 3: Chuyên cần & Học viên */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Học viên & Chuyên cần</p>
                    <p className="text-xs text-slate-500">Cảnh báo học viên vắng mặt nhiều buổi hoặc xin nghỉ phép</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.attendance}
                  onClick={() => handleToggleNotification("attendance")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    notifications.attendance ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.attendance ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Option 4: Thù lao & Quyết toán giảng dạy */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 sm:text-sm">Thù lao & Quyết toán giảng dạy</p>
                    <p className="text-xs text-slate-500">Thông báo bảng lương hàng tháng và thông báo từ ban quản trị</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.payroll}
                  onClick={() => handleToggleNotification("payroll")}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    notifications.payroll ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notifications.payroll ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* CARD 6: GIAO DIỆN */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Giao diện</h2>
                <p className="text-xs text-slate-500">Tùy chọn hiển thị không gian làm việc</p>
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
                  <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Sáng</p>
                    <p className="text-[10px] text-slate-500">Mặc định hệ thống</p>
                  </div>
                </div>
              </div>

              {/* Theme 2: Tối (Sắp ra mắt) */}
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
                    <p className="text-[10px] text-slate-400">Dễ nhìn ban đêm</p>
                  </div>
                </div>
              </div>

              {/* Theme 3: Theo hệ thống (Sắp ra mắt) */}
              <div
                onClick={() => handleSelectTheme("system")}
                className="group relative cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 opacity-80 transition hover:border-slate-300"
              >
                <div className="relative flex h-20 w-full overflow-hidden rounded-xl">
                  <div className="h-full w-1/2 overflow-hidden">
                    <img
                      src="/student-campus-spring.webp"
                      alt="Hệ thống ngày"
                      className="h-full w-[200%] max-w-none object-cover"
                    />
                  </div>
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
                    <p className="text-xs font-bold text-slate-700">Theo thiết bị</p>
                    <p className="text-[10px] text-slate-400">Tự động thích ứng</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 7: TÙY CHỈNH ẢNH NỀN PHONG CẢNH Á ĐÔNG */}
          <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#102f63]">Tùy chỉnh ảnh nền</h2>
                <p className="text-xs text-slate-500">Hình nền phong cảnh Á Đông cho toàn bộ bàn làm việc giảng viên</p>
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
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-left">
                      <p className="truncate text-[10px] font-bold text-white drop-shadow">{wp.title}</p>
                    </div>

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

      {/* 1. EDIT TEACHER INFO MODAL */}
      {editInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                  <Pencil className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-[#102f63]">Cập nhật thông tin Giảng viên</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditInfoModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInfo} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={infoForm.fullName}
                  onChange={(e) => setInfoForm({ ...infoForm, fullName: e.target.value })}
                  placeholder="Ví dụ: ThS. Nguyễn Hà"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Học vị / Chức danh</label>
                <input
                  type="text"
                  value={infoForm.title}
                  onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })}
                  placeholder="Ví dụ: Giảng viên chính CSCA / Thạc sĩ Sư phạm"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Khoa / Tổ chuyên môn</label>
                <input
                  type="text"
                  value={infoForm.department}
                  onChange={(e) => setInfoForm({ ...infoForm, department: e.target.value })}
                  placeholder="Ví dụ: Tổ Toán & Khoa Học Tự Nhiên CSCA"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kinh nghiệm giảng dạy</label>
                <input
                  type="text"
                  value={infoForm.experience}
                  onChange={(e) => setInfoForm({ ...infoForm, experience: e.target.value })}
                  placeholder="Ví dụ: 5+ năm kinh nghiệm giảng dạy & luyện thi CSCA"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tiểu sử / Giới thiệu bản thân</label>
                <textarea
                  rows={3}
                  value={infoForm.bio}
                  onChange={(e) => setInfoForm({ ...infoForm, bio: e.target.value })}
                  placeholder="Mô tả ngắn gọn về kinh nghiệm, phong cách giảng dạy và triết lý giáo dục..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditInfoModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#102f63] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
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
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                  <Lock className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-[#102f63]">Đổi mật khẩu tài khoản</h3>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePassword} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu hiện tại *</label>
                <div className="relative">
                  <input
                    type={showPassword.current ? "text" : "password"}
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword({ ...showPassword, current: !showPassword.current })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu mới (tối thiểu 6 ký tự) *</label>
                <div className="relative">
                  <input
                    type={showPassword.new ? "text" : "password"}
                    required
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Xác nhận mật khẩu mới *</label>
                <div className="relative">
                  <input
                    type={showPassword.confirm ? "text" : "password"}
                    required
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-xl bg-[#102f63] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                >
                  {passwordLoading ? "Đang cập nhật..." : "Lưu mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. TRUSTED DEVICES MODAL */}
      {devicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-2xs">
                  <Laptop className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#102f63]">Thiết bị đăng nhập</h3>
                  <p className="text-xs text-slate-500">
                    Giới hạn {trustedDevices.limit} thiết bị đăng nhập đồng thời
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDevicesModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {devicesLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-500 mb-1" />
                  Đang tải danh sách thiết bị...
                </div>
              ) : devicesError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                  {devicesError}
                </div>
              ) : trustedDevices.devices?.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  Chưa có thông tin thiết bị nào được ghi nhận.
                </div>
              ) : (
                trustedDevices.devices?.map((dev) => {
                  const isMobile = isMobileDevice(dev);
                  return (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 shadow-2xs">
                          {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {dev.deviceName || (isMobile ? "Điện thoại / Di động" : "Máy tính / Trình duyệt")}
                            {dev.isCurrent && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                                Thiết bị này
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Hoạt động: {formatDeviceTime(dev.lastActiveAt || dev.createdAt)} · IP: {dev.ipAddress || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setDevicesModalOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADD CUSTOM WALLPAPER MODAL */}
      {addWallpaperModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                  <ImageIcon className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-[#102f63]">Thêm ảnh nền tùy chỉnh</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddWallpaperModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomWallpaper} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên hình nền</label>
                <input
                  type="text"
                  value={newWallpaperTitle}
                  onChange={(e) => setNewWallpaperTitle(e.target.value)}
                  placeholder="Ví dụ: Lớp học CSCA mùa thu"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn ảnh từ máy tính</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCustomFileSelect}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:font-bold file:text-white hover:file:bg-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hoặc dán URL ảnh</label>
                <input
                  type="url"
                  value={newWallpaperUrl}
                  onChange={(e) => setNewWallpaperUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              {newWallpaperUrl && (
                <div className="relative h-28 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img
                    src={newWallpaperUrl}
                    alt="Xem trước hình nền"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white">
                    Xem trước
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddWallpaperModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!newWallpaperUrl}
                  className="rounded-xl bg-[#102f63] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                >
                  Áp dụng hình nền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. AVATAR MODAL */}
      {avatarModalOpen && (
        <AvatarModal
          open={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          onSave={handleSaveAvatar}
          currentAvatar={getAvatarUrl(authUser)}
        />
      )}
    </div>
  );
}
