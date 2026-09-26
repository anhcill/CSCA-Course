import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import useLogin from "../../hooks/useLogin";

// ─── tiny reusable input wrapper ─────────────────────────────────────────────
const InputField = ({
  id,
  label,
  type = "text",
  icon: Icon,
  value,
  onChange,
  placeholder,
  required,
  rightSlot,
}) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
    >
      {label}
    </label>
    <div className="relative">
      {/* left icon */}
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </div>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="
          block w-full pl-10 pr-10 py-2.5
          bg-gray-50 dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
          rounded-lg text-sm text-gray-900 dark:text-white
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500
          dark:focus:border-red-400
          transition-colors duration-200
          caret-red-500
        "
      />

      {/* right slot (e.g. show/hide password button) */}
      {rightSlot && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {rightSlot}
        </div>
      )}
    </div>
  </div>
);

// ─── LoginForm ────────────────────────────────────────────────────────────────
const LoginForm = ({ onSwitchMode, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, login } = useLogin();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // lightweight client-side guard (hook also validates, but this gives
    // instant feedback without a round-trip)
    if (!formData.email.includes("@")) {
      toast.error("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    try {
      const user = await login(formData);
      if (user) {
        toast.success("Đăng nhập thành công! Chào mừng trở lại 🎉");
        setFormData({ email: "", password: "" });
        onClose(); // close modal

        // Canonical landing per role according to LMS spec Section 2.2:
        if (user.role === "admin") {
          navigate("/admin");
        } else if (user.role === "creator") {
          navigate("/lms/teach");
        } else {
          navigate("/lms/my-learning");
        }
      }
    } catch (error) {
      // useLogin already throws; error toast shown by hook itself
      // only show here if hook didn't (safety net)
      if (error?.message) {
        toast.error(error.message);
      }
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    window.location.assign("/api/auth/google");
  };

  const handleForgotPassword = () => onSwitchMode("forgotPassword");
  const handleSwitchToRegister = () => onSwitchMode("register");

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm mx-auto">
      {/* ── header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 text-center"
      >
        {/* CSCA logo text */}
        <div className="inline-flex items-center gap-1 mb-3">
          <span className="text-2xl font-black text-red-600 dark:text-red-500 tracking-tight">
            CSCA
          </span>
          <span className="text-xs font-semibold text-orange-500 dark:text-orange-400 self-end mb-0.5 tracking-wider">
            COURSE
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("login") || "Đăng nhập"}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Chào mừng bạn trở lại nền tảng học HSK/HSKK
        </p>
      </motion.div>

      {/* ── form ── */}
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        {/* email */}
        <InputField
          id="email"
          label={t("email") || "Email"}
          type="email"
          icon={Mail}
          value={formData.email}
          onChange={handleChange}
          placeholder="example@gmail.com"
          required
        />

        {/* password */}
        <InputField
          id="password"
          label={t("password") || "Mật khẩu"}
          type={showPassword ? "text" : "password"}
          icon={Lock}
          value={formData.password}
          onChange={handleChange}
          placeholder="••••••••"
          required
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-150"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={showPassword ? "hide" : "show"}
                  initial={{ opacity: 0, rotate: -15 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 15 }}
                  transition={{ duration: 0.15 }}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
          }
        />

        {/* forgot password */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-colors duration-150"
          >
            {t("forgotPassword") || "Quên mật khẩu?"}
          </button>
        </div>

        {/* submit */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          type="submit"
          disabled={loading}
          className="
            relative w-full flex items-center justify-center gap-2
            py-2.5 px-4 rounded-xl
            text-sm font-semibold text-white
            bg-gradient-to-r from-red-600 to-orange-500
            hover:from-red-700 hover:to-orange-600
            shadow-md shadow-red-500/30
            hover:shadow-lg hover:shadow-red-500/40
            disabled:opacity-70 disabled:cursor-not-allowed
            transition-all duration-200
            overflow-hidden
            before:absolute before:inset-0
            before:bg-white/10 before:opacity-0
            hover:before:opacity-100
            before:transition-opacity before:duration-200
          "
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang đăng nhập…</span>
            </>
          ) : (
            <span>{t("loginButton") || "Đăng nhập"}</span>
          )}
        </motion.button>
      </motion.form>

      {/* ── divider ── */}
      <div className="mt-6 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
          hoặc
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading || googleLoading}
        className="mt-4 w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
            <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
          </svg>
        )}
        <span>{googleLoading ? "Đang chuyển đến Google…" : "Tiếp tục với Google"}</span>
      </motion.button>

      {/* ── footer — switch to register ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400"
      >
        {t("noAccount") || "Chưa có tài khoản?"}{" "}
        <button
          type="button"
          onClick={handleSwitchToRegister}
          className="font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-colors duration-150"
        >
          {t("registerNow") || "Đăng ký ngay"}
        </button>
      </motion.p>

      {/* ── tiny branding note ── */}
      <p className="mt-5 text-center text-[10px] text-gray-400 dark:text-gray-600">
        Nền tảng luyện thi HSK · HSKK · CSCA &nbsp;|&nbsp; 汉语水平考试
      </p>
    </div>
  );
};

export default LoginForm;
