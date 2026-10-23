import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookA,
  BookOpen,
  Calendar,
  Check,
  GraduationCap,
  Play,
  RotateCcw,
  Search,
  Star,
  Volume2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchVocabularySessions,
  submitVocabularyPractice,
  toggleVocabularyStar,
} from "../../api/lmsClient";
import { speakChinese } from "../utils/speech";
import VocabularyPracticeModal from "../components/VocabularyPracticeModal";
import usePersistentClassSelection from "../hooks/usePersistentClassSelection";

export default function StudentVocabularyHubPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("sessions"); // "sessions" | "wordbank" | "starred"
  const [searchQuery, setSearchQuery] = useState("");
  const [activePracticeSession, setActivePracticeSession] = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchVocabularySessions();
      const apiSessions = response?.data?.sessions;
      if (!response?.success || !Array.isArray(apiSessions)) throw new Error(response?.message || "Dữ liệu từ vựng không hợp lệ");
      setSessions(apiSessions);
    } catch (err) {
      console.error("Error loading vocabulary sessions:", err);
      setSessions([]);
      setError(err.message || "Không thể tải danh sách từ vựng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    let totalWords = 0;
    let masteredCount = 0;
    let learningCount = 0;
    let starredCount = 0;

    sessions.forEach((s) => {
      (s.vocabularies || []).forEach((w) => {
        totalWords += 1;
        if (w.status === "mastered") masteredCount += 1;
        else learningCount += 1;
        if (w.isStarred) starredCount += 1;
      });
    });

    const masteryRate = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;
    return { totalWords, masteredCount, learningCount, starredCount, masteryRate };
  }, [sessions]);

  // Distinct Classes List for Class selector
  const classList = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      const id = String(s.classId || s.courseId || "default");
      const title = s.classTitle || s.courseTitle || "Lớp học CSCA";
      if (!map.has(id)) {
        map.set(id, title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [sessions]);

  const classIds = useMemo(() => classList.map((item) => item.id), [classList]);
  const [selectedClassId, setSelectedClassId] = usePersistentClassSelection({
    scope: "vocabulary",
    availableClassIds: classIds,
    allValue: "ALL",
    ready: !loading,
  });

  // Filtered Sessions according to Class & Search
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedClassId !== "ALL" && String(s.classId || s.courseId) !== String(selectedClassId)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSession =
          String(s.chapter || "").toLowerCase().includes(q) ||
          String(s.sessionTitle || "").toLowerCase().includes(q) ||
          String(s.classTitle || "").toLowerCase().includes(q);
        const matchesWords = (s.vocabularies || []).some(
          (w) =>
            String(w.term || "").toLowerCase().includes(q) ||
            String(w.pinyin || "").toLowerCase().includes(q) ||
            String(w.meaning || "").toLowerCase().includes(q) ||
            String(w.sinoVietnamese || "").toLowerCase().includes(q)
        );
        return matchesSession || matchesWords;
      }
      return true;
    });
  }, [sessions, selectedClassId, searchQuery]);

  // Flattened All Words for Table & Starred tabs
  const allWords = useMemo(() => {
    const list = [];
    filteredSessions.forEach((s) => {
      (s.vocabularies || []).forEach((w) => {
        list.push({
          ...w,
          sessionId: s.sessionId,
          sessionTitle: s.sessionTitle || s.chapter,
          classTitle: s.classTitle || "Lớp học",
        });
      });
    });
    return list;
  }, [filteredSessions]);

  const displayedWords = useMemo(() => {
    if (activeTab === "starred") {
      return allWords.filter((w) => w.isStarred);
    }
    return allWords;
  }, [allWords, activeTab]);

  const handleToggleStar = async (sessionId, wordId) => {
    try {
      await toggleVocabularyStar(wordId);
      setSessions((current) =>
        current.map((session) => ({
          ...session,
          vocabularies: (session.vocabularies || []).map((word) =>
            String(word.id) === String(wordId)
              ? { ...word, isStarred: !word.isStarred }
              : word
          ),
        }))
      );
    } catch (requestError) {
      toast.error(requestError.message || "Không thể cập nhật từ đã lưu.");
    }
  };

  const handlePracticeComplete = async (results) => {
    if (!activePracticeSession) return;
    try {
      const response = await submitVocabularyPractice(activePracticeSession.sessionId, results);
      const xpAwarded = Number(response?.data?.gamification?.xp || 50);
      toast.success(`Đã hoàn thành luyện tập! Nhận +${xpAwarded} XP 🎉`);
      await loadSessions();
    } catch (requestError) {
      toast.error(requestError.message || "Không thể lưu kết quả ôn tập từ vựng.");
    } finally {
      setActivePracticeSession(null);
    }
  };

  if (!loading && error) {
    return (
      <div className="min-h-[60vh] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white/90 p-8 text-center shadow-sm backdrop-blur-md">
          <BookA className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-4 text-lg font-black text-[#102f63]">Chưa thể tải kho từ vựng</h1>
          <p className="mt-2 text-sm text-[#487291]">{error}</p>
          <button type="button" onClick={loadSessions} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700">
            <RotateCcw className="h-4 w-4" /> Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px] space-y-3">
        {/* Calligraphic Header directly on Scenic Background */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-0.5 pb-1">
          <div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs sm:text-5xl">
              Từ vựng
            </h1>
            <p className="mt-1 text-xs font-semibold italic text-slate-800 sm:text-sm">
              “Vốn từ tích lũy mỗi ngày, tương lai rộng mở tự tin vững bước.”
            </p>
            <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 sm:text-base">
              —— 温故而知新，可以为师矣。
            </p>
          </div>

          {/* 4 Compact Metric Pill Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tổng từ</span>
              <span className="text-sm font-extrabold text-[#102f63]">{stats.totalWords}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Đã thuộc</span>
              <span className="text-sm font-extrabold text-emerald-600">{stats.masteredCount}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-wider">Đang học</span>
              <span className="text-sm font-extrabold text-amber-600">{stats.learningCount}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-blue-600 uppercase tracking-wider">Thành thạo</span>
              <span className="text-sm font-extrabold text-blue-600">{stats.masteryRate}%</span>
            </div>
          </div>
        </div>

        {/* Toolbar: View Tabs, Class Selector, Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/92 p-2.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
          {/* View mode switcher */}
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "sessions"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Theo buổi học</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("wordbank")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "wordbank"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <BookA className="h-3.5 w-3.5" />
              <span>Sổ từ vựng ({allWords.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("starred")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "starred"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              <span>Từ đã lưu ⭐ ({stats.starredCount})</span>
            </button>
          </div>

          {/* Right: Class Filter & Search */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Class Pill / Dropdown Selector */}
            <div className="flex items-center gap-1 text-xs">
              <span className="hidden sm:inline-block font-semibold text-slate-500 text-[11px]">
                Lớp:
              </span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="h-8 rounded-xl border border-slate-200/90 bg-slate-50/90 px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
              >
                <option value="ALL">Tất cả lớp học</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm từ vựng, pinyin, nghĩa..."
                className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/90 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: SESSIONS VIEW (Theo buổi học) */}
        {activeTab === "sessions" && (
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-white/80 bg-white/95 p-12 text-center shadow-xs">
                <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                <p className="text-xs font-bold text-slate-700">Đang tải danh sách từ vựng...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="rounded-2xl border border-white/80 bg-white/95 p-12 text-center shadow-xs">
                <BookA className="mx-auto h-9 w-9 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-700">Chưa có từ vựng nào trong các buổi học</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Từ vựng tiếng Trung chuyên ngành sẽ hiển thị tại đây khi giáo viên cập nhật theo buổi học.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSessions.map((session, index) => {
                  const words = session.vocabularies || [];
                  const mastered = words.filter((w) => w.status === "mastered").length;
                  const total = words.length;
                  const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;

                  return (
                    <div
                      key={session.sessionId || index}
                      className="group flex flex-col justify-between rounded-2xl border border-white/80 bg-white/95 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="space-y-2">
                        {/* Header: Class title & Date */}
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-700 border border-blue-200/60 truncate max-w-[180px]">
                            <GraduationCap className="h-3 w-3 shrink-0" />
                            {session.classTitle || "Lớp học CSCA"}
                          </span>
                          <span className="text-slate-400 font-medium text-[10px]">
                            {session.formattedDate || "Theo lịch"}
                          </span>
                        </div>

                        {/* Title & Topic */}
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition leading-snug line-clamp-1">
                            {session.chapter || session.sessionTitle}
                          </h3>
                          {session.sessionTitle && session.sessionTitle !== session.chapter && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {session.sessionTitle}
                            </p>
                          )}
                        </div>

                        {/* Word chips preview */}
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {words.slice(0, 4).map((w) => (
                            <span
                              key={w.id}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-100"
                            >
                              <span className="font-bold text-[#102f63]">{w.term}</span>
                              <span className="text-[9px] text-slate-400">({w.pinyin})</span>
                            </span>
                          ))}
                          {words.length > 4 && (
                            <span className="inline-flex items-center rounded-md bg-slate-100/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                              +{words.length - 4} từ
                            </span>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Tiến độ ghi nhớ:</span>
                            <span className="font-bold text-slate-700">
                              {mastered}/{total} từ ({percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                percent === 100
                                  ? "bg-emerald-500"
                                  : percent >= 50
                                  ? "bg-blue-600"
                                  : "bg-amber-500"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="grid grid-cols-2 gap-1.5 pt-3 mt-1 border-t border-slate-100/80">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClassId(String(session.classId || session.courseId || "ALL"));
                            setActiveTab("wordbank");
                          }}
                          className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-blue-600 transition"
                        >
                          <BookOpen className="h-3 w-3" />
                          <span>Xem {total} từ</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActivePracticeSession(session)}
                          className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-98 transition"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Luyện Flashcard</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2 & 3: WORD BANK & STARRED (Sổ từ vựng / Từ trọng tâm) */}
        {(activeTab === "wordbank" || activeTab === "starred") && (
          <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="overflow-x-auto [scrollbar-width:thin]">
              <table className="w-full text-left border-collapse table-auto text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold text-slate-400">
                    <th className="py-2 pl-3.5 pr-1.5 min-w-[130px]">Hán tự & Phát âm</th>
                    <th className="py-2 px-1.5 min-w-[90px]">Phiên âm (Pinyin)</th>
                    <th className="py-2 px-1.5 min-w-[80px]">Hán Việt</th>
                    <th className="py-2 px-2 min-w-[160px]">Nghĩa tiếng Việt</th>
                    <th className="py-2 px-1.5 min-w-[140px] max-w-[200px]">Buổi & Lớp</th>
                    <th className="py-2 px-1.5 text-center whitespace-nowrap min-w-[80px]">Trạng thái</th>
                    <th className="py-2 pr-3.5 pl-1.5 text-center whitespace-nowrap min-w-[50px]">Lưu</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100/90 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                        Đang tải danh sách từ vựng...
                      </td>
                    </tr>
                  ) : displayedWords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                        {activeTab === "starred"
                          ? "Bạn chưa đánh dấu lưu từ vựng nào. Hãy bấm ngôi sao để lưu từ cần ôn thi nhé!"
                          : "Không tìm thấy từ vựng nào theo bộ lọc hiện tại."}
                      </td>
                    </tr>
                  ) : (
                    displayedWords.map((word) => (
                      <tr key={word.id} className="transition hover:bg-blue-50/40">
                        {/* Hán tự & Speaker button */}
                        <td className="py-1.5 pl-3.5 pr-1.5 min-w-[130px] align-middle">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => speakChinese(word.term)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                              title="Nghe phát âm chuẩn"
                            >
                              <Volume2 className="h-3 w-3" />
                            </button>
                            <span className="font-bold text-sm text-[#102f63]">
                              {word.term}
                            </span>
                          </div>
                        </td>

                        {/* Pinyin */}
                        <td className="py-1.5 px-1.5 font-mono text-[11px] text-slate-600 align-middle">
                          {word.pinyin}
                        </td>

                        {/* Hán Việt */}
                        <td className="py-1.5 px-1.5 font-semibold text-[11px] text-slate-500 align-middle">
                          {word.sinoVietnamese || "—"}
                        </td>

                        {/* Nghĩa tiếng Việt & Ví dụ */}
                        <td className="py-1.5 px-2 align-middle">
                          <div>
                            <p className="font-semibold text-[11px] text-slate-800 leading-snug">
                              {word.meaning}
                            </p>
                            {word.exampleSentence && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">
                                {word.exampleSentence} — {word.exampleMeaning}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Buổi & Lớp */}
                        <td className="py-1.5 px-1.5 align-middle">
                          <div className="min-w-0">
                            <p className="font-semibold text-[10px] text-slate-700 truncate">
                              {word.sessionTitle}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate">
                              {word.classTitle}
                            </p>
                          </div>
                        </td>

                        {/* Trạng thái */}
                        <td className="py-1.5 px-1.5 text-center whitespace-nowrap align-middle">
                          {word.status === "mastered" ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                              <Check className="h-2.5 w-2.5" />
                              Đã thuộc
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                              <RotateCcw className="h-2.5 w-2.5" />
                              Đang học
                            </span>
                          )}
                        </td>

                        {/* Star Button */}
                        <td className="py-1.5 pr-3.5 pl-1.5 text-center whitespace-nowrap align-middle">
                          <button
                            type="button"
                            onClick={() => handleToggleStar(word.sessionId, word.id)}
                            className={`p-1 rounded-md transition ${
                              word.isStarred
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-slate-300 hover:text-amber-500"
                            }`}
                            title={word.isStarred ? "Bỏ lưu" : "Lưu vào từ trọng tâm"}
                          >
                            <Star className={`h-3.5 w-3.5 ${word.isStarred ? "fill-current" : ""}`} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vocabulary Flashcard Practice Modal */}
        {activePracticeSession && (
          <VocabularyPracticeModal
            isOpen={Boolean(activePracticeSession)}
            onClose={() => setActivePracticeSession(null)}
            session={activePracticeSession}
            vocabularies={activePracticeSession.vocabularies || []}
            sessionTitle={activePracticeSession.sessionTitle || activePracticeSession.chapter}
            sessionId={activePracticeSession.sessionId}
            onComplete={handlePracticeComplete}
          />
        )}
      </div>
    </div>
  );
}
