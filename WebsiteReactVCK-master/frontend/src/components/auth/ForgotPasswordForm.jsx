import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { KeyRound, Mail, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import useForgotPassword from '../../hooks/useForgotPassword';

const ForgotPasswordForm = ({ onSwitchMode, onResetPassword }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { forgotPassword } = useForgotPassword();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      await forgotPassword(cleanEmail);
      toast.success('Mã xác thực đã được gửi đến email của bạn!');
      sessionStorage.setItem('verificationStartTime', Date.now().toString());
      if (onResetPassword) {
        onResetPassword(cleanEmail);
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Không thể gửi mã xác thực. Vui lòng kiểm tra lại email.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-2"
      >
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-amber-500 text-white shadow-md shadow-red-500/30 mb-2">
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">
          Quên Mật Khẩu
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed">
          Nhập địa chỉ email đăng ký tài khoản Moly Course. Chúng tôi sẽ gửi mã OTP gồm 6 chữ số để đặt lại mật khẩu.
        </p>
      </motion.div>

      {/* Error alert */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-300 flex items-start gap-2.5"
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
        <div className="space-y-1.5">
          <label htmlFor="reset-email" className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Địa chỉ email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Mail className="h-4 w-4" />
            </div>
            <input
              type="email"
              id="reset-email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="nhap-email@example.com"
              required
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all shadow-sm"
            />
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.01 }}
          type="submit"
          disabled={isLoading || !email.trim()}
          className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-700 hover:to-amber-600 shadow-md shadow-red-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang gửi mã...</span>
            </>
          ) : (
            <span>Gửi Mã Xác Thực</span>
          )}
        </motion.button>
      </motion.form>

      {/* Back to login */}
      <div className="text-center pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => onSwitchMode('login')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại đăng nhập</span>
        </button>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;