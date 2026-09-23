import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import Loading from "../components/Loading";

const LoadingContext = createContext(null);

// Singleton ref để hỗ trợ gọi loading từ bất kỳ file JS nào ngoài React component (nếu cần)
let globalShowLoading = null;
let globalHideLoading = null;

export const globalLoading = {
  show: (text) => {
    if (globalShowLoading) globalShowLoading(text);
  },
  hide: () => {
    if (globalHideLoading) globalHideLoading();
  },
};

export const LoadingProvider = ({ children }) => {
  const [activeCount, setActiveCount] = useState(0);
  const [loadingText, setLoadingText] = useState("Đang tải...");

  const showLoading = useCallback((text = "Đang tải...") => {
    setLoadingText(text);
    setActiveCount((prev) => prev + 1);
  }, []);

  const hideLoading = useCallback(() => {
    setActiveCount((prev) => Math.max(0, prev - 1));
  }, []);

  const resetLoading = useCallback(() => {
    setActiveCount(0);
  }, []);

  // Tiện ích bọc trực tiếp một async function
  const withLoading = useCallback(async (asyncFn, text = "Đang tải...") => {
    showLoading(text);
    try {
      return await asyncFn();
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  // Gán singleton methods
  globalShowLoading = showLoading;
  globalHideLoading = hideLoading;

  const isLoading = activeCount > 0;

  const value = useMemo(
    () => ({
      isLoading,
      loadingText,
      showLoading,
      hideLoading,
      resetLoading,
      withLoading,
    }),
    [isLoading, loadingText, showLoading, hideLoading, resetLoading, withLoading]
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {/* Component loading toàn hệ thống: vòng tròn ở chính giữa, có chữ, không có nền */}
      <Loading loading={isLoading} text={loadingText} fullScreen={true} />
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};

export default LoadingContext;
