// VerifyEmailForm.jsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../context/AuthContext";

const VerifyEmailForm = ({ onSwitchMode, registrationData }) => {
  const { completeSignup, loading } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  // ── Timer (persisted in sessionStorage) ──────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(() => {
    const startTime = sessionStorage.getItem("verificationStartTime");
    if (!startTime) {
      sessionStorage.setItem("verificationStartTime", Date.now().toString());
      return 300;
    }
    const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
    const remaining = 300 - elapsed;
    return remaining > 0 ? remaining : 0;
  });

  useEffect(() => {
    if (!registrationData || timeLeft <= 0) {
      sessionStorage.removeItem("verificationStartTime");
      onSwitchMode && onSwitchMode("register");
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          sessionStorage.removeItem("verificationStartTime");
          onSwitchMode && onSwitchMode("register");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [registrationData, timeLeft, onSwitchMode]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Colour the timer: green → yellow → red as time decreases
  const timerColor =
    timeLeft > 120
      ? "text-emerald-400"
      : timeLeft > 60
      ? "text-yellow-400"
      : "text-red-400";

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!verificationCode || verificationCode.length !== 6) {
      toast.error("Vui lòng nhập đúng 6 chữ số mã xác thực.");
      return;
    }

    setIsLoading(true);
    try {
      const success = await completeSignup(
        registrationData.email,
        verificationCode
      );
      if (success) {
        toast.success("Xác thực email thành công! Chào mừng bạn đến CSCA.");
        sessionStorage.removeItem("verificationStartTime");
        setTimeout(() => {
          onSwitchMode && onSwitchMode("login");
        }, 2000);
      }
    } catch (error) {
      let msg = "Xác thực thất bại. Vui lòng thử lại.";
      if (error.message === "No pending registration found") {
        msg = "Không tìm thấy yêu cầu đăng ký. Vui lòng đăng ký lại.";
      } else if (error.message === "Invalid verification code") {
        msg = "Mã xác thực không đúng. Vui lòng kiểm tra lại.";
      }
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ── OTP input: only digits, max 6 ─────────────────────────────────────────
  const handleOtpChange = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(val);
  };

  return (
    <div className="flex w-full min-h-full">
      {/* ── LEFT PANEL ── */}
      <div className="hidden md:flex md:w-5/12 bg-gradient-to-br from-red-500 to-pink-500 flex-col items-center justify-center p-10 relative overflow-hidden select-none">
        {/* Decorative circles */}
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/5" />

        {/* Decorative dots */}
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
          {/* Shield icon */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, type: "spring" }}
            className="mb-5 p-5 rounded-full bg-white/20 backdrop-blur-sm"
          >
            <ShieldCheck className="w-14 h-14 text-white drop-shadow" />
          </motion.div>

          {/* Chinese characters */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="mb-5"
          >
            <div className="text-5xl font-bold tracking-widest drop-shadow-lg leading-tight">
              验证邮箱
            </div>
          </motion.div>

          {/* Divider */}
          <div className="w-16 h-0.5 bg-white/60 rounded-full mb-5" />

          <p className="text-lg font-semibold tracking-wide mb-2">
            Xác thực Email
          </p>
          <p className="text-sm text-white/75 max-w-xs leading-relaxed">
            Mã xác thực đã được gửi đến hộp thư của bạn. Vui lòng kiểm tra
            email và nhập mã trong thời gian cho phép.
          </p>

          {/* Timer display on left panel */}
          <div className="mt-8 px-5 py-3 rounded-xl bg-white/15 backdrop-blur-sm">
            <p className="text-xs text-white/70 mb-1 uppercase tracking-widest">
              Thời gian còn lại
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {formatTime(timeLeft)}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8 md:px-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md mx-auto"
        >
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Xác thực Email
            </h2>
            {registrationData ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Mã OTP đã được gửi đến{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {registrationData.email}
                </span>
                .
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Nhập mã 6 chữ số từ email của bạn.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OTP Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Mã xác thực (6 chữ số)
              </label>

              {/* Large centered OTP field */}
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={verificationCode}
                onChange={handleOtpChange}
                maxLength={6}
                placeholder="000000"
                className="w-full text-center text-4xl font-bold tracking-[0.6em] py-4 px-4
                  rounded-xl border-2 border-gray-200 dark:border-gray-600
                  bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400
                  caret-red-500 placeholder:text-gray-300 dark:placeholder:text-gray-600
                  transition-all duration-200"
                autoComplete="one-time-code"
              />

              {/* Mobile timer (visible on small screens only) */}
              <div className="flex items-center justify-between mt-3 md:hidden">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Thời gian còn lại:
                </span>
                <span className={`text-sm font-bold tabular-nums ${timerColor}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>

              {/* Desktop timer indicator */}
              <div className="hidden md:flex items-center justify-between mt-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Hết hạn sau:
                </span>
                <span className={`text-sm font-bold tabular-nums ${timerColor}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-pink-500"
                  style={{ width: `${(timeLeft / 300) * 100}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
            </div>

            {/* Submit button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading || loading || verificationCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold text-sm
                shadow-md shadow-red-400/40 hover:shadow-lg hover:shadow-red-500/50
                hover:from-red-600 hover:to-pink-600
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-300"
            >
              {isLoading || loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Xác thực ngay"
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Chưa nhận được mã?{" "}
            <button
              type="button"
              onClick={() => onSwitchMode && onSwitchMode("register")}
              className="font-semibold text-red-500 hover:text-red-600 transition-colors"
            >
              Quay lại đăng ký
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default VerifyEmailForm;
