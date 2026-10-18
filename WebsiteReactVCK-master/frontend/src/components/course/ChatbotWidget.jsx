import { useState } from 'react';
import { FaTimes } from "react-icons/fa";
import ChatBot from "./ChatBot"; 
import { useTranslation } from 'react-i18next';
import { Lottie } from "lottie-react";
import owlAnimation from "../../assets/owl.json";

const ChatbotWidget = ({ isMobileMenuOpen, isChatbotOpen: externalIsOpen, setIsChatbotOpen: externalSetIsOpen }) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(true);
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isChatbotOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsChatbotOpen = externalSetIsOpen || setInternalIsOpen;

  return (
    <div className={`fixed bottom-6 right-4 z-50 lg:bottom-8 lg:right-8 ${isMobileMenuOpen ? 'lg:z-50' : 'z-50'}`}>
      {/* Bong bóng chào hỏi dễ thương */}
      {!isChatbotOpen && showTooltip && (
        <div 
          onClick={() => setIsChatbotOpen(true)}
          className="cursor-pointer mb-2 mr-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-semibold py-1.5 px-3 rounded-full shadow-lg border border-blue-200 dark:border-gray-700 hover:shadow-xl transition-all flex items-center gap-1.5 float-right animate-bounce select-none"
        >
          <span>Hỏi Moly Pet nhé! 🦉✨</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm ml-1 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Nút bấm Chatbot hình bé Cú 3D hoạt ảnh */}
      <div className="clear-both flex justify-end">
        <div
          onClick={() => setIsChatbotOpen(!isChatbotOpen)}
          className="cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center select-none"
          title="Mở Moly Pet"
        >
          {isChatbotOpen ? (
            <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-2xl hover:opacity-90 transition-opacity">
              <FaTimes size={22} />
            </div>
          ) : (
            <div className="w-20 h-20 lg:w-24 lg:h-24 filter drop-shadow-2xl flex items-center justify-center">
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

      {/* chatbot hiển thị khung chat */}
      {isChatbotOpen && (
        <div className="fixed top-16 right-4 lg:right-6 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50
                      flex flex-col w-[calc(100vw-2rem)] lg:w-[400px] h-[calc(100vh-100px)] lg:h-[620px] max-h-[85vh]
                      border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
            <div className="flex items-center space-x-2.5">
              <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center filter drop-shadow">
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
            <button
              onClick={() => setIsChatbotOpen(false)}
              className="ml-auto text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <FaTimes size={18} />
            </button>
          </div>

          {/* chatbot hiển thị khung chat */}
          <ChatBot />
        </div>
      )}
    </div>
  );
};

export default ChatbotWidget;