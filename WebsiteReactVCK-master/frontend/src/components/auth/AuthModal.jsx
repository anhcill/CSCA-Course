import { useState, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useTranslation } from "react-i18next";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import VerifyEmailForm from "./VerifyEmailForm";
import ForgotPasswordForm from "./ForgotPasswordForm";
import ResetPasswordForm from "./ResetPasswordForm";
import { X, ChevronRight, GraduationCap } from "lucide-react";

// ─── decorative panel content per mode ───────────────────────────────────────
const PANEL_CONTENT = {
  login: {
    hanzi: "欢迎回来",
    pinyin: "Huānyíng huí lái",
    sub: "Tiếp tục hành trình chinh phục học bổng Trung Quốc của bạn.",
    hint: "Kéo sang phải để đăng ký →",
  },
  register: {
    hanzi: "加入我们",
    pinyin: "Jiārù wǒmen",
    sub: "Bắt đầu con đường du học Trung Quốc cùng hàng nghìn học sinh.",
    hint: "← Kéo sang trái để đăng nhập",
  },
  forgotPassword: {
    hanzi: "别担心",
    pinyin: "Bié dānxīn",
    sub: "Chúng tôi sẽ giúp bạn lấy lại quyền truy cập tài khoản.",
    hint: "",
  },
  verify: {
    hanzi: "验证邮箱",
    pinyin: "Yànzhèng yóuxiāng",
    sub: "Vui lòng kiểm tra hộp thư và nhập mã xác thực.",
    hint: "",
  },
  resetPassword: {
    hanzi: "重置密码",
    pinyin: "Chóngzhì mìmǎ",
    sub: "Tạo mật khẩu mới an toàn cho tài khoản của bạn.",
    hint: "",
  },
};

// ─── floating decorative circles ─────────────────────────────────────────────
const DecorativeCircles = () => (
  <>
    {/* large faint ring top-left */}
    <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full border border-white/10" />
    {/* medium ring bottom-right */}
    <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full border border-white/10" />
    {/* small solid dot top-right */}
    <div className="absolute top-10 right-10 w-4 h-4 rounded-full bg-white/20" />
    {/* medium solid dot bottom-left */}
    <div className="absolute bottom-16 left-8 w-8 h-8 rounded-full bg-orange-300/30" />
    {/* tiny dot cluster */}
    <div className="absolute top-1/3 left-6 flex flex-col gap-2">
      <div className="w-2 h-2 rounded-full bg-white/20" />
      <div className="w-2 h-2 rounded-full bg-white/20" />
      <div className="w-2 h-2 rounded-full bg-white/20" />
    </div>
  </>
);

// ─── left illustration panel ──────────────────────────────────────────────────
const IllustrationPanel = ({ mode, registrationData, onDragEnd, dragX }) => {
  const content = PANEL_CONTENT[mode] ?? PANEL_CONTENT.login;
  const isDraggable = mode === "login" || mode === "register";

  const inner = (
    <div className="relative h-full flex flex-col justify-center items-center text-white px-8 py-10 overflow-hidden">
      <DecorativeCircles />

      {/* brand chip */}
      <div className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
        <GraduationCap className="w-4 h-4 text-orange-200" />
        <span className="text-xs font-semibold tracking-wider text-orange-100">
          CSCA Learning
        </span>
      </div>

      {/* chinese character display */}
      <motion.div
        key={mode + "-hanzi"}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center z-10"
      >
        <p className="text-6xl font-bold tracking-tight leading-none drop-shadow-lg">
          {content.hanzi}
        </p>
        <p className="mt-2 text-sm font-medium text-orange-200/80 tracking-widest">
          {content.pinyin}
        </p>
      </motion.div>

      {/* divider */}
      <div className="mt-6 mb-5 w-12 h-px bg-white/30 z-10" />

      {/* subtitle */}
      <motion.p
        key={mode + "-sub"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-center text-sm leading-relaxed text-white/80 max-w-[220px] z-10"
      >
        {mode === "verify" && registrationData?.email ? (
          <>
            Mã xác thực đã gửi đến
            <br />
            <span className="font-semibold text-orange-200">
              {registrationData.email}
            </span>
          </>
        ) : (
          content.sub
        )}
      </motion.p>

      {/* drag hint */}
      {isDraggable && content.hint && (
        <p className="absolute bottom-6 text-xs text-white/40 z-10">
          {content.hint}
        </p>
      )}

      {/* drag arrow indicator */}
      {isDraggable && (
        <div className="absolute inset-y-0 -right-4 flex items-center z-20">
          <div className="p-1 rounded-full bg-white/10 backdrop-blur">
            <ChevronRight className="w-5 h-5 text-white/60" />
          </div>
        </div>
      )}
    </div>
  );

  if (isDraggable) {
    return (
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={onDragEnd}
        style={{ x: dragX }}
        className="hidden md:block bg-gradient-to-br from-red-600 via-red-500 to-orange-500 relative cursor-grab active:cursor-grabbing rounded-l-xl"
      >
        {inner}
      </motion.div>
    );
  }

  return (
    <div className="hidden md:block bg-gradient-to-br from-red-600 via-red-500 to-orange-500 relative rounded-l-xl">
      {inner}
    </div>
  );
};

// ─── main AuthModal ───────────────────────────────────────────────────────────
const AuthModal = ({ isOpen, onClose, initialMode = "login" }) => {
  const [mode, setMode] = useState(initialMode);
  const [registrationData, setRegistrationData] = useState(null);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState(null);
  const { t } = useTranslation();

  const dragX = useMotionValue(0);
  // keep these in case child panels need them
  const _dragProgress = useTransform(dragX, [0, 200], [1, 0]);
  const _dragOpacity = useTransform(_dragProgress, [0, 0.5, 1], [0.3, 1, 0.3]);
  const _dragScale = useTransform(_dragProgress, [0, 0.5, 1], [0.95, 1, 0.95]);

  // sync mode when initialMode prop changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // lock body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDragEnd = (_, info) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      setMode(mode === "login" ? "register" : "login");
    }
  };

  const handleSwitchMode = (newMode, data = null) => {
    if (newMode === "verify" && data) {
      setRegistrationData(data);
    } else if (newMode === "resetPassword" && data) {
      setForgotPasswordEmail(data);
    }
    setMode(newMode);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          {/* backdrop — red-tinted overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-950/60 dark:bg-black/75 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* modal card */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative my-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-red-900/20 dark:bg-gray-900"
          >
            {/* close button */}
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="absolute right-4 top-4 z-30 p-2 rounded-full bg-black/5 dark:bg-white/10 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-200 group"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-red-500 transition-colors duration-200" />
            </button>

            {/* layout: register & verify are self-contained 2-col forms → span full width;
                login, forgotPassword, resetPassword use the shared IllustrationPanel */}
            <AnimatePresence mode="wait">
              {(mode === "register" || mode === "verify") ? (
                /* Full-width self-contained forms */
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="min-h-[600px] flex"
                >
                  {mode === "register" && (
                    <RegisterForm
                      onSwitchMode={handleSwitchMode}
                      onClose={onClose}
                    />
                  )}
                  {mode === "verify" && registrationData && (
                    <VerifyEmailForm
                      onSwitchMode={handleSwitchMode}
                      registrationData={registrationData}
                    />
                  )}
                </motion.div>
              ) : (
                /* Two-column layout for login, forgotPassword, resetPassword */
                <motion.div
                  key={mode + "-split"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid md:grid-cols-2 min-h-[600px] relative"
                >
                  {/* LEFT — illustration */}
                  <IllustrationPanel
                    mode={mode}
                    registrationData={registrationData}
                    onDragEnd={handleDragEnd}
                    dragX={dragX}
                  />

                  {/* RIGHT — form area */}
                  <div className="flex flex-col justify-center px-8 py-10 min-h-[600px] md:min-h-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mode}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                        className="w-full"
                      >
                        {mode === "login" && (
                          <LoginForm
                            onSwitchMode={handleSwitchMode}
                            onClose={onClose}
                          />
                        )}
                        {mode === "forgotPassword" && (
                          <ForgotPasswordForm
                            onSwitchMode={handleSwitchMode}
                            onResetPassword={(email) => {
                              setForgotPasswordEmail(email);
                              handleSwitchMode("resetPassword");
                            }}
                          />
                        )}
                        {mode === "resetPassword" && (
                          <ResetPasswordForm
                            onSwitchMode={handleSwitchMode}
                            email={forgotPasswordEmail}
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
