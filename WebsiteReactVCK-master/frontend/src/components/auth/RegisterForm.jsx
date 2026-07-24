// RegisterForm.jsx
import { useState } from "react";
import { motion } from "framer-motion";
import { User, Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../context/AuthContext";

const RegisterForm = ({ onSwitchMode }) => {
  const { initiateSignup, loading: authLoading } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    gender: "male",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const { username, email, password, confirmPassword } = formData;

    if (!username || !email || !password || !confirmPassword) {
      toast.error("Vui lòng điền đầy đủ tất cả các trường.");
      return false;
    }
    if (username.length < 3) {
      toast.error("Tên người dùng phải có ít nhất 3 ký tự.");
      return false;
    }
    if (/\s/.test(username)) {
      toast.error("Tên người dùng không được chứa khoảng trắng.");
      return false;
    }
    if (password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const success = await initiateSignup(formData);
      if (success) {
        sessionStorage.setItem("verificationStartTime", Date.now().toString());
        toast.success("Đăng ký thành công! Vui lòng kiểm tra email.");
        onSwitchMode("verify", {
          email: formData.email,
          username: formData.username,
        });
      }
    } catch (error) {
      toast.error(error.message || "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase =
    "w-full pl-10 pr-4 py-2.5 rounded-lg border bg-white dark:bg-gray-800 " +
    "text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 " +
    "focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 " +
    "caret-orange-500 transition-all duration-200 text-sm";

  const labelBase = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="flex w-full min-h-full">
      {/* ── LEFT PANEL ── */}
      <div className="hidden md:flex md:w-5/12 bg-gradient-to-br from-orange-500 to-yellow-500 flex-col items-center justify-center p-10 relative overflow-hidden select-none">
        {/* Decorative circles */}
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/5" />

        {/* Dragon/lantern decorative dots */}
        <div className="absolute top-8 right-8 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white/50" />
          ))}
        </div>
        <div className="absolute bottom-8 left-8 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white/50" />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-white text-center"
        >
          {/* Large Chinese characters */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-6"
          >
            <div className="text-6xl font-bold tracking-widest drop-shadow-lg leading-tight">
              开始你的
            </div>
            <div className="text-5xl font-bold tracking-widest drop-shadow-lg leading-tight mt-1">
              留学之旅
            </div>
          </motion.div>

          {/* Divider */}
          <div className="w-16 h-0.5 bg-white/60 rounded-full mb-5" />

          <p className="text-xl font-semibold tracking-wide mb-2">
            Join CSCA Community
          </p>
          <p className="text-sm text-white/75 max-w-xs leading-relaxed">
            Cùng hàng ngàn học sinh Việt Nam chinh phục học bổng du học Trung
            Quốc.
          </p>

          {/* Decorative lantern icons (CSS only) */}
          <div className="flex gap-6 mt-8">
            {["HSK", "HSKK", "CSCA"].map((tag) => (
              <div
                key={tag}
                className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold tracking-wider"
              >
                {tag}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 md:px-10 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md mx-auto"
        >
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Đăng ký tài khoản
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Tạo tài khoản CSCA để bắt đầu hành trình du học Trung Quốc.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className={labelBase}>Tên người dùng</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Nhập tên người dùng"
                  className={inputBase}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={labelBase}>Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Nhập địa chỉ email"
                  className={inputBase}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className={labelBase}>Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Ít nhất 6 ký tự"
                  className={inputBase + " pr-10"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className={labelBase}>Xác nhận mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Nhập lại mật khẩu"
                  className={inputBase + " pr-10"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className={labelBase}>Giới tính</label>
              <div className="flex gap-6 mt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={formData.gender === "male"}
                    onChange={handleChange}
                    className="w-4 h-4 accent-orange-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-orange-500 transition-colors">
                    Nam
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={formData.gender === "female"}
                    onChange={handleChange}
                    className="w-4 h-4 accent-orange-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-orange-500 transition-colors">
                    Nữ
                  </span>
                </label>
              </div>
            </div>

            {/* Submit */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading || authLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-sm
                shadow-md shadow-orange-400/40 hover:shadow-lg hover:shadow-orange-500/50
                hover:from-orange-600 hover:to-yellow-600
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-300 mt-2"
            >
              {isLoading || authLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Đăng ký"
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              hoặc
            </span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Google Register */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            type="button"
            onClick={() => {
              setGoogleLoading(true);
              window.location.assign("/api/auth/google");
            }}
            disabled={isLoading || authLoading || googleLoading}
            className="mt-4 w-full flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
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
            <span>{googleLoading ? "Đang chuyển đến Google..." : "Đăng ký với Google"}</span>
          </motion.button>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Đã có tài khoản?{" "}
            <button
              type="button"
              onClick={() => onSwitchMode("login")}
              className="font-semibold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Đăng nhập ngay
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterForm;
