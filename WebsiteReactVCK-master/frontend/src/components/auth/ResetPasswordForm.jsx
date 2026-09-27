import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import { Lock, Eye, EyeOff, KeyRound, Loader2, ArrowLeft, AlertCircle, RotateCcw } from "lucide-react";
import useForgotPassword from "../../hooks/useForgotPassword";

const ResetPasswordForm = ({ onSwitchMode, email }) => {
  const { t } = useTranslation();
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 phút

  const { forgotPassword } = useForgotPassword();

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleResendCode = async () => {
    if (!email) {
      toast.error("Không tìm thấy email. Vui lòng quay lại bước trước.");
      onSwitchMode("forgotPassword");
      return;
    }
    setIsResending(true);
    try {
      await forgotPassword(email);
      setTimeLeft(300);
      setErrorMessage("");
      toast.success("Đã gửi lại mã xác thực mới đến email của bạn!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Không thể gửi lại mã. Vui lòng thử lại sau.");
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email) {
      setErrorMessage("Thiếu thông tin email. Vui lòng thực hiện lại từ đầu.");
      return;
    }

    const cleanCode = (verificationCode || "").trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setErrorMessage("Vui lòng nhập đúng 6 chữ số mã xác thực.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận không khớp với mật khẩu mới.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post("/api/auth/reset-password", {
        email: email.trim().toLowerCase(),
        resetCode: cleanCode,
        newPassword,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || "Đặt lại mật khẩu thất bại.");
      }

      toast.success("Đặt lại mật khẩu thành công! Hãy đăng nhập lại bằng mật khẩu mới 🎉");
      setTimeout(() => {
        onSwitchMode("login");
      }, 1200);
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Mã xác thực không hợp lệ hoặc đã hết hạn.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-1.5"
      >
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-amber-500 text-white shadow-md shadow-red-500/30 mb-1">
          <KeyRound className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">
          Đặt Lại Mật Khẩu
        </h2>
        {email ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mã OTP 6 số đã được gửi đến{" "}
            <span className="font-bold text-gray-800 dark:text-gray-200">{email}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Nhập mã xác thực từ email và thiết lập mật khẩu mới.
          </p>
        )}
      </motion.div>

      {/* Error alert */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-300 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span className="leading-snug">{errorMessage}</span>
        </motion.div>
      )}

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* OTP Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300">
            <label htmlFor="reset-otp">Mã xác thực (6 số)</label>
            <span className={`font-mono text-xs font-semibold ${timeLeft <= 60 ? "text-red-500" : "text-amber-500"}`}>
              {timeLeft > 0 ? `Còn lại: ${formatTime(timeLeft)}` : "Đã hết hạn"}
            </span>
          </div>

          <input
            type="text"
            id="reset-otp"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="w-full text-center text-2xl font-black tracking-[0.4em] py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
            required
            autoComplete="one-time-code"
          />

          {timeLeft === 0 && (
            <div className="text-right pt-1">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isResending}
                className="text-xs font-bold text-red-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Gửi lại mã mới</span>
              </button>
            </div>
          )}
        </div>

        {/* New password */}
        <div className="space-y-1">
          <label htmlFor="new-password" className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Mật khẩu mới (tối thiểu 6 ký tự)
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div className="space-y-1">
          <label htmlFor="confirm-password" className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Xác nhận mật khẩu mới
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.01 }}
          type="submit"
          disabled={isLoading || verificationCode.length !== 6 || newPassword.length < 6}
          className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-700 hover:to-amber-600 shadow-md shadow-red-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <span>Xác Nhận Đổi Mật Khẩu</span>
          )}
        </motion.button>
      </motion.form>

      {/* Back to login */}
      <div className="text-center pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => onSwitchMode("login")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại đăng nhập</span>
        </button>
      </div>
    </div>
  );
};

export default ResetPasswordForm;
