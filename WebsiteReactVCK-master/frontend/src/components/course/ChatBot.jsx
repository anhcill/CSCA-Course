import { useEffect, useState, useRef, useContext } from "react";
import { FaPaperPlane, FaTrash } from "react-icons/fa";
import { Oval, ThreeDots } from "react-loader-spinner";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../context/AuthContext";
import { Lottie } from "lottie-react";
import owlAnimation from "../../assets/owl.json";
import RichMathText from "../common/RichMathText.jsx";

const ChatBot = () => {
  const [userInput, setUserInput] = useState("");
  const { authUser } = useContext(AuthContext);
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const storedHistory = localStorage.getItem(`chat-history-${authUser?._id || authUser?.id || "guest"}`);
      return storedHistory ? JSON.parse(storedHistory) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [showIntroMessage, setShowIntroMessage] = useState(() => {
    return chatHistory.length === 0;
  });
  const chatAreaRef = useRef(null);
  const [keywords] = useState([
    "Tóm tắt nội dung bài học",
    "Tạo bài tập ôn tập",
    "Giải thích công thức",
    "Kế hoạch học tập hôm nay",
  ]);

  const { t } = useTranslation();

  useEffect(() => {
    const key = `chat-history-${authUser?._id || authUser?.id || "guest"}`;
    // Only persist string text messages (not React components)
    const serializable = chatHistory
      .filter((m) => typeof m.text === "string")
      .slice(-30);
    localStorage.setItem(key, JSON.stringify(serializable));

    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chatHistory, authUser?._id, authUser?.id]);

  useEffect(() => {
    setShowIntroMessage(chatHistory.length === 0);
  }, [chatHistory]);

  const handleUserInput = (e) => {
    setUserInput(e.target.value);
  };

  const sendMessage = async () => {
    const trimmed = userInput.trim();
    if (!trimmed || loading) return;
    if (showIntroMessage) {
      setShowIntroMessage(false);
    }

    const currentHistory = [...chatHistory, { role: "user", text: trimmed }];
    const loadingMessage = {
      role: "assistant",
      text: (
        <ThreeDots
          height={30}
          width={60}
          color="#718096"
          secondaryColor="#A0AEC0"
          wrapperClass="inline-block"
        />
      ),
    };

    setChatHistory([...currentHistory, loadingMessage]);
    setUserInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/moli-pet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "include",
        body: JSON.stringify({
          message: trimmed,
          page: window.location.pathname,
          petName: "Moly Pet",
          conversationHistory: currentHistory.slice(-6).map((item) => ({
            role: item.role,
            content: typeof item.text === "string" ? item.text : "",
          })),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setChatHistory((curr) => {
            const next = [...curr];
            next[next.length - 1] = {
              role: "assistant",
              text: "Bạn đăng nhập xong Moly Pet mới dùng AI để trò chuyện và giải bài được nha! 🐾",
            };
            return next;
          });
          return;
        }
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.answer || errorData?.message || "Moly Pet đang bận xử lý bài, bạn thử lại sau ít giây nhé!");
      }

      if (!response.body) throw new Error("Không nhận được phản hồi từ Moly Pet.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let pending = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (value) pending += decoder.decode(value, { stream: !done });
        if (done) pending += decoder.decode();

        const lines = pending.split(/\r?\n/);
        pending = done ? "" : (lines.pop() || "");

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            const chunk = parsed?.choices?.[0]?.delta?.content;
            if (typeof chunk === "string" && chunk) {
              fullContent += chunk;
              setChatHistory((curr) => {
                const next = [...curr];
                next[next.length - 1] = {
                  role: "assistant",
                  text: fullContent,
                };
                return next;
              });
            }
          } catch {
            // ignore JSON parse for non-JSON lines
          }
        }
        if (done) break;
      }

      if (!fullContent.trim()) {
        setChatHistory((curr) => {
          const next = [...curr];
          next[next.length - 1] = {
            role: "assistant",
            text: "Moly Pet đã nhận được tin nhắn của bạn!",
          };
          return next;
        });
      }
    } catch (error) {
      console.error("Lỗi khi gửi tin nhắn Moly Pet:", error);
      setChatHistory((curr) => {
        const next = [...curr];
        next[next.length - 1] = {
          role: "assistant",
          text: error.message || "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.",
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) {
      sendMessage();
    }
  };

  const clearChatHistory = () => {
    const key = `chat-history-${authUser?._id || authUser?.id || "guest"}`;
    localStorage.removeItem(key);
    setChatHistory([]);
    setShowIntroMessage(true);
  };

  const handleKeywordClick = (keyword) => {
    setUserInput(keyword);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div
        ref={chatAreaRef}
        className="flex-1 overflow-y-auto p-4 mb-2"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {showIntroMessage && chatHistory.length === 0 && (
          <div className="mb-2 flex justify-start">
            <div className="mr-2 flex-shrink-0 w-11 h-11 flex items-center justify-center filter drop-shadow-sm">
              <Lottie
                src={owlAnimation}
                loop={true}
                autoplay={true}
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
            <div className="flex flex-col items-start">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                {t("chatName") || "Moly Pet"}
              </div>
              <div className="rounded-xl p-3 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 max-w-xs shadow-sm text-sm">
                Chào bạn! Mình là Moly Pet, trợ lý học tập thông minh của MolyCourse. Rất vui được đồng hành cùng bạn. Bạn cần hỗ trợ bài học hay giải bài tập nào cứ nhắn mình nhé! 🐾✨
              </div>
            </div>
          </div>
        )}
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={`mb-3 flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "assistant" && (
              <div className="mr-2 flex-shrink-0 w-11 h-11 flex items-center justify-center filter drop-shadow-sm">
                <Lottie
                  src={owlAnimation}
                  loop={true}
                  autoplay={true}
                  className="w-full h-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )}
            <div
              className={`flex flex-col ${
                message.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`text-xs font-semibold ${
                  message.role === "user"
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-900 dark:text-white"
                } mb-1`}
              >
                {message.role === "user" ? "Bạn" : (t("chatName") || "Moly Pet")}
              </div>
              <div
                className={`rounded-xl p-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm"
                } max-w-xs sm:max-w-md break-words`}
              >
                {message.role === "assistant" && typeof message.text !== "string" ? (
                  message.text
                ) : (
                  <RichMathText
                    value={message.text}
                    className={`prose max-w-none text-sm break-words ${
                      message.role === "user" ? "text-white prose-invert" : "dark:prose-invert text-gray-800 dark:text-gray-100"
                    }`}
                  />
                )}
              </div>
            </div>
            {message.role === "user" && (
              <div className="ml-2 avatar">
                <div
                  className="grid h-10 w-10 place-items-center rounded-full border border-blue-200 bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-bold uppercase text-white shadow-sm dark:border-gray-700"
                  aria-label="Avatar người dùng"
                >
                  {(authUser?.display_name || authUser?.fullName || authUser?.username || "B").trim().charAt(0) || "B"}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pt-2 pb-4 mt-auto">
        <div className="max-w-screen-xl mx-auto flex flex-col gap-2 px-4">
          {showIntroMessage && (
            <div className="flex flex-nowrap overflow-x-auto gap-3 mb-3 py-2 px-1 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-transparent">
              {keywords.map((keyword, index) => (
                <button
                  key={index}
                  className="
                    px-4 py-2
                    rounded-full 
                    text-xs font-medium
                    transition-all duration-300 
                    shadow-sm
                    whitespace-nowrap
                    border
                    transform hover:scale-105
                    hover:shadow-md
                    bg-white
                    text-blue-700
                    dark:text-blue-200
                    dark:bg-gray-800
                    border-blue-200
                    dark:border-blue-700/50
                    hover:bg-blue-50
                    dark:hover:bg-gray-700
                  "
                  onClick={() => handleKeywordClick(keyword)}
                >
                  {keyword}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                className="w-full p-3 border dark:bg-gray-900 bg-white border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-300 outline-none text-sm dark:text-gray-100"
                placeholder={t("chatInput") || "Hỏi Moly Pet điều bạn thắc mắc..."}
                value={userInput}
                onChange={handleUserInput}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>
            <button
              className={`p-3 rounded-lg ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600"
              } text-white font-medium transition-colors duration-200`}
              onClick={sendMessage}
              disabled={loading}
              aria-label="Send message"
            >
              {loading ? (
                <Oval
                  height={20}
                  width={20}
                  color="#ffffff"
                  secondaryColor="#ffffff"
                  strokeWidth={4}
                  strokeWidthSecondary={4}
                />
              ) : (
                <FaPaperPlane className="w-5 h-5" />
              )}
            </button>
            <button
              className="p-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors duration-200 ml-1"
              onClick={() => {
                if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử chat?")) {
                  clearChatHistory();
                }
              }}
              aria-label="Clear chat history"
              title="Xóa lịch sử chat"
            >
              <FaTrash className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBot;
