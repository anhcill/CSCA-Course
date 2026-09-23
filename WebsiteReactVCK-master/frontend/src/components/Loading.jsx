import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Loading component toàn hệ thống:
 * - Vị trí: Chính giữa màn hình (Center)
 * - Thiết kế: Vòng tròn xoay (Circle Spinner) + Dòng chữ hiển thị
 * - Đặc tính: 100% KHÔNG NỀN (transparent), không che tối, không blur giao diện
 */
const Loading = ({
  loading = true,
  text = "Đang tải...",
  fullScreen = true,
  size = "md",
  className = "",
}) => {
  if (!loading) return null;

  const sizeMap = {
    sm: {
      spinner: "w-7 h-7",
      text: "text-xs",
    },
    md: {
      spinner: "w-10 h-10",
      text: "text-sm",
    },
    lg: {
      spinner: "w-14 h-14",
      text: "text-base",
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const content = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`
        ${fullScreen ? "fixed inset-0 z-[9999] pointer-events-none" : "w-full h-full min-h-[140px]"}
        flex flex-col items-center justify-center bg-transparent
        ${className}
      `}
    >
      <div className="flex flex-col items-center justify-center p-3 select-none">
        {/* Vòng tròn xoay (Circular Spinner) */}
        <div className={`relative ${currentSize.spinner} flex items-center justify-center`}>
          <svg
            className="w-full h-full animate-spin text-sky-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <path
              className="opacity-95"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>

        {/* Chữ Loading bên dưới vòng tròn */}
        {text && (
          <p
            className={`mt-3 ${currentSize.text} font-semibold text-slate-700 dark:text-slate-200 tracking-wide drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
          >
            {text}
          </p>
        )}
      </div>
    </motion.div>
  );

  return <AnimatePresence>{loading && content}</AnimatePresence>;
};

export default React.memo(Loading);
