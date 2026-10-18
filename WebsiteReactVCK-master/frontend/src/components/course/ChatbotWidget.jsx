import { useState } from 'react';
import { FaTimes, FaMinus } from "react-icons/fa";
import ChatBot from "./ChatBot"; 
import { useTranslation } from 'react-i18next';
import { Lottie } from "lottie-react";
import owlAnimation from "../../assets/owl.json";

const ChatbotWidget = ({ isMobileMenuOpen, isChatbotOpen: externalIsOpen, setIsChatbotOpen: externalSetIsOpen }) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(true);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem('moly_pet_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const isChatbotOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsChatbotOpen = externalSetIsOpen || setInternalIsOpen;

  const handleToggleMinimize = (minimized) => {
    setIsMinimized(minimized);
    if (minimized) {
      setIsChatbotOpen(false);
    }
    try {
      localStorage.setItem('moly_pet_minimized', minimized ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  // Trạng thái thu gọn thành bong bóng nhỏ
  if (isMinimized) {
    return (
      <div className={`fixed bottom-5 right-4 z-50 lg:bottom-7 lg:right-6 ${isMobileMenuOpen ? 'lg:z-50' : 'z-50'}`}>
        <button
          onClick={() => handleToggleMinimize(false)}
          className="group relative flex items-center justify-center w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 border-2 border-white/80 dark:border-slate-800 focus:outline-none"
          title="Hiện Moly Pet"
          aria-label="Hiện Moly Pet"
        >
          <div className="w-6 h-6 lg:w-7 lg:h-7 pointer-events-none filter drop-shadow">
            <Lottie
              src={owlAnimation}
              loop={true}
              autoplay={true}
              className="w-full h-full"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          {/* Chấm tròn báo trạng thái online */}
          <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white dark:border-slate-900 rounded-full animate-pulse" />

          {/* Tooltip khi hover vào bong bóng nhỏ */}
          <span className="absolute right-full mr-2.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-200 dark:border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Moly Pet 🦉
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-5 right-4 z-50 lg:bottom-7 lg:right-6 ${isMobileMenuOpen ? 'lg:z-50' : 'z-50'}`}>
      {/* Bong bóng chào hỏi dễ thương */}
      {!isChatbotOpen && showTooltip && (
        <div 
          onClick={() => setIsChatbotOpen(true)}
          className="cursor-pointer mb-2 mr-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-[11px] font-semibold py-1 px-2.5 rounded-full shadow-lg border border-blue-200 dark:border-gray-700 hover:shadow-xl transition-all flex items-center gap-1.5 float-right animate-bounce select-none"
        >
          <span>Hỏi Moly Pet nhé! 🦉✨</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs ml-1 font-bold"
            title="Đóng lời chào"
          >
            ×
          </button>
        </div>
      )}

      {/* Nút bấm Moly Pet nhỏ gọn */}
      <div className="clear-both flex justify-end">
        <div className="relative group">
          {/* Nút ẩn Moly Pet thành bong bóng nhỏ */}
          {!isChatbotOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMinimize(true);
              }}
              className="absolute -top-1 -left-1 z-10 w-5 h-5 rounded-full bg-slate-800/80 hover:bg-slate-950 text-white flex items-center justify-center text-[9px] shadow-md border border-white/40 backdrop-blur opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 hover:scale-110"
              title="Ẩn thành bong bóng nhỏ"
              aria-label="Ẩn thành bong bóng nhỏ"
            >
              <FaMinus size={8} />
            </button>
          )}

          <div
            onClick={() => setIsChatbotOpen(!isChatbotOpen)}
            className="cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center select-none"
            title={isChatbotOpen ? "Đóng Moly Pet" : "Mở Moly Pet"}
          >
            {isChatbotOpen ? (
              <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity">
                <FaTimes size={16} />
              </div>
            ) : (
              <div className="w-14 h-14 lg:w-16 lg:h-16 filter drop-shadow-lg flex items-center justify-center">
                <Lottie
                  src={owlAnimation}
                  loop={true}
                  autoplay={true}
                  className="w-full h-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Khung chat Moly Pet */}
      {isChatbotOpen && (
        <div className="fixed top-16 right-4 lg:right-6 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50
                      flex flex-col w-[calc(100vw-2rem)] lg:w-[380px] h-[calc(100vh-110px)] lg:h-[590px] max-h-[85vh]
                      border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
            <div className="flex items-center space-x-2.5">
              <div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center filter drop-shadow">
                <Lottie
                  src={owlAnimation}
                  loop={true}
                  autoplay={true}
                  className="w-full h-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
              <div className="flex flex-col">
                <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                  {t('chatTitle1')} <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                </h3>
                <p className="text-[11px] text-blue-100">{t('chatTitle2')}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 ml-auto">
              <button
                onClick={() => handleToggleMinimize(true)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Ẩn thành bong bóng nhỏ"
                aria-label="Ẩn thành bong bóng nhỏ"
              >
                <FaMinus size={12} />
              </button>
              <button
                onClick={() => setIsChatbotOpen(false)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Đóng chat"
                aria-label="Đóng chat"
              >
                <FaTimes size={16} />
              </button>
            </div>
          </div>

          {/* chatbot hiển thị khung chat */}
          <ChatBot />
        </div>
      )}
    </div>
  );
};

export default ChatbotWidget;