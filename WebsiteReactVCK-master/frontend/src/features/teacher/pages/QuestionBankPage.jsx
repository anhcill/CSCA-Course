
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Library,
  Search,
  Plus,
  Filter,
  Trash2,
  Pencil,
  X,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Tag,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Layers,
  Award,
  Compass,
  Copy,
} from "lucide-react";
import {
  fetchAdminCourses,
  fetchQuestionBank,
  createQuestionBankItem,
  updateQuestionBankItem,
  deleteQuestionBankItem,
} from "../../api/lmsClient";
import QuestionBankSampler from "../components/QuestionBankSampler";

const blankQuestion = () => ({
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  points: 1,
  explanation: "",
  tags: [],
  difficulty: "medium",
  visibility: "private",
});

const difficultyConfig = {
  easy: {
    label: "Dễ",
    badge: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "Vừa",
    badge: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  hard: {
    label: "Khó",
    badge: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    dot: "bg-rose-500",
  },
};

export default function QuestionBankPage() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Modals & form state
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [samplerOpen, setSamplerOpen] = useState(false);

  // Expanded explanations toggles
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  const toggleExpand = (id) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Load available courses
  useEffect(() => {
    fetchAdminCourses()
      .then((r) => {
        const list = r.data || [];
        setCourses(list);
        if (list.length > 0) {
          setCourseId(String(list[0].id));
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Load question bank items
  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetchQuestionBank({ courseId, search, difficulty, page });
      setRows(Array.isArray(r?.data) ? r.data : []);
      setTotal(Number(r?.meta?.total || 0));
    } catch (e) {
      setError(e.message || "Không thể tải danh sách câu hỏi.");
    } finally {
      setLoading(false);
    }
  }, [courseId, search, difficulty, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  // Save question handler (create or edit)
  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!editing.questionText.trim()) {
      return toast.error("Vui lòng nhập nội dung câu hỏi.");
    }
    if (editing.options.some((opt) => !opt.trim())) {
      return toast.error("Vui lòng điền đầy đủ các phương án lựa chọn.");
    }

    setBusy(true);
    try {
      const payload = {
        ...editing,
        courseId: Number(courseId),
        points: Number(editing.points) || 1,
        tags: Array.isArray(editing.tags)
          ? editing.tags.map((t) => t.trim()).filter(Boolean)
          : String(editing.tags || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
      };

      if (editing.id) {
        await updateQuestionBankItem(editing.id, payload);
        toast.success("Đã cập nhật câu hỏi thành công.");
      } else {
        await createQuestionBankItem(payload);
        toast.success("Đã thêm câu hỏi vào ngân hàng.");
      }

      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err.message || "Lỗi khi lưu câu hỏi.");
    } finally {
      setBusy(false);
    }
  };

  // Remove question handler
  const handleRemoveQuestion = async () => {
    if (!deleting?.id) return;
    setBusy(true);
    try {
      await deleteQuestionBankItem(deleting.id);
      setDeleting(null);
      await load();
      toast.success("Đã xóa khỏi ngân hàng; các đề đã tạo vẫn giữ nguyên.");
    } catch (e) {
      toast.error(e.message || "Không thể xóa câu hỏi.");
    } finally {
      setBusy(false);
    }
  };

  // Quick duplicate question into new form
  const handleDuplicate = (q) => {
    setEditing({
      questionText: `[Bản sao] ${q.questionText}`,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      points: q.points,
      explanation: q.explanation || "",
      tags: [...(q.tags || [])],
      difficulty: q.difficulty || "medium",
      visibility: q.visibility || "private",
    });
  };

  // Stats calculation
  const stats = useMemo(() => {
    let easyCount = 0;
    let mediumCount = 0;
    let hardCount = 0;
    let courseVisible = 0;
    for (const r of rows) {
      if (r.difficulty === "easy") easyCount++;
      else if (r.difficulty === "hard") hardCount++;
      else mediumCount++;
      if (r.visibility === "course") courseVisible++;
    }
    return {
      easyCount,
      mediumCount,
      hardCount,
      courseVisible,
      privateVisible: rows.length - courseVisible,
    };
  }, [rows]);

  const activeCourse = courses.find((c) => String(c.id) === String(courseId));

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
        {/* ================= 1. CALLIGRAPHIC HEADER HERO TRỰC TIẾP TRÊN NỀN PHONG CẢNH Á ĐÔNG ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 pb-1">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 px-3 py-1 text-xs font-bold text-[#102f63] dark:text-sky-300 shadow-2xs backdrop-blur-md">
              <Library className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Ngân hàng câu hỏi & Đề thi trắc nghiệm</span>
            </div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] dark:text-white drop-shadow-xs">
              Ngân Hàng Câu Hỏi CSCA
            </h1>
            <p className="text-xs font-semibold italic text-slate-800 dark:text-slate-300 sm:text-sm">
              “Bể học vô bờ, rèn luyện qua từng câu hỏi để vững bước thành tài.”
            </p>
            <p className="font-['Ma_Shan_Zheng',cursive] text-xs sm:text-sm tracking-wider text-slate-600 dark:text-slate-400">
              —— 问渠那得清如许，为有源头活水来。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={!courseId}
              onClick={() => setSamplerOpen(!samplerOpen)}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-[#102f63] dark:text-slate-200 shadow-2xs transition hover:bg-sky-50 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-50"
            >
              <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Rút đề ngẫu nhiên</span>
            </button>

            <button
              type="button"
              disabled={!courseId}
              onClick={() => setEditing(blankQuestion())}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#102f63] to-[#1d4f8d] dark:from-blue-700 dark:to-indigo-700 px-4 py-2.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(16,47,99,0.22)] transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm câu hỏi mới</span>
            </button>
          </div>
        </div>

        {/* ================= 2. 4 THẺ THỐNG KÊ KÍNH MỜ (KPI STAT TILES) ================= */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Tổng câu hỏi khóa này",
              value: total,
              subtext: activeCourse ? activeCourse.title || activeCourse.name : "Toàn bộ khóa học",
              icon: Library,
              iconStyle: "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400",
            },
            {
              label: "Phân bố độ khó",
              value: `${stats.easyCount}D · ${stats.mediumCount}V · ${stats.hardCount}K`,
              subtext: "Dễ · Vừa · Khó trên trang",
              icon: Award,
              iconStyle: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400",
            },
            {
              label: "Dùng chung trong khóa",
              value: `${stats.courseVisible} câu`,
              subtext: "Giáo viên cùng khóa sử dụng",
              icon: Layers,
              iconStyle: "bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400",
            },
            {
              label: "Câu hỏi riêng tư",
              value: `${stats.privateVisible} câu`,
              subtext: "Chỉ cá nhân bạn nhìn thấy",
              icon: Sparkles,
              iconStyle: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3.5 shadow-[0_8px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconStyle} shadow-2xs`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-black text-[#102f63] dark:text-white leading-none font-mono">
                    {item.value}
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight mt-1 truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.subtext}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        {/* ================= SAMPLER ACCORDION NẾU ĐƯỢC BẬT ================= */}
        {samplerOpen && courseId && (
          <div className="rounded-3xl border border-sky-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 sm:p-5 shadow-lg backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-black text-[#102f63] dark:text-white flex items-center gap-2">
                <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Công cụ rút câu hỏi ngẫu nhiên theo ma trận đề
              </h3>
              <button
                type="button"
                onClick={() => setSamplerOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <QuestionBankSampler
              courseId={courseId}
              onAdd={(sampledQuestions) => {
                toast.success(`Đã rút được ${sampledQuestions.length} câu hỏi ngẫu nhiên thành công!`);
              }}
            />
          </div>
        )}

        {/* ================= 3. BỘ LỌC TÌM KIẾM KHOA HỌC ================= */}
        <section className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/92 dark:bg-slate-900/90 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shadow-2xs">
                <Filter className="h-4 w-4" />
              </span>
              <h2 className="text-xs font-black uppercase tracking-wider text-[#102f63] dark:text-white">
                Bộ lọc & Tìm kiếm câu hỏi
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono">
              Trang {page} · Hiển thị {rows.length}/{total} câu
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* 1. Khóa học */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Khóa học / Giáo trình:
              </label>
              <select
                aria-label="Khóa học"
                className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none shadow-2xs focus:border-blue-500 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setPage(1);
                  setEditing(null);
                }}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id} className="dark:bg-slate-900 dark:text-white">
                    {c.title || c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Tìm kiếm */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Tìm kiếm từ khóa / thẻ chủ đề:
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  aria-label="Tìm câu hỏi hoặc chủ đề"
                  placeholder="Nội dung, công thức, thẻ bài tập..."
                  className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-950/80 py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none shadow-2xs focus:border-blue-500 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {/* 3. Độ khó */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Mức độ phân hóa:
              </label>
              <select
                aria-label="Độ khó"
                className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none shadow-2xs focus:border-blue-500 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900"
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  setPage(1);
                }}
              >
                <option value="" className="dark:bg-slate-900 dark:text-white">Tất cả độ khó (Dễ · Vừa · Khó)</option>
                <option value="easy" className="dark:bg-slate-900 dark:text-white">Dễ (Nhận biết & Thông hiểu)</option>
                <option value="medium" className="dark:bg-slate-900 dark:text-white">Vừa (Vận dụng)</option>
                <option value="hard" className="dark:bg-slate-900 dark:text-white">Khó (Vận dụng cao)</option>
              </select>
            </div>
          </div>
        </section>

        {/* ================= 4. DANH SÁCH CÂU HỎI HIỂN THỊ ================= */}
        {error ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 p-4 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-xs text-slate-400 dark:text-slate-500">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent" />
            <p className="mt-2 font-bold text-slate-600 dark:text-slate-300">Đang đồng bộ ngân hàng câu hỏi...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-12 text-center shadow-sm backdrop-blur-md space-y-3">
            <HelpCircle className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h3 className="text-base font-black text-slate-800 dark:text-white">Chưa có câu hỏi nào phù hợp</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Không tìm thấy câu hỏi nào trong bộ lọc hiện tại. Nhấp &quot;Thêm câu hỏi mới&quot; để bổ sung vào ngân hàng đề.
            </p>
            <button
              type="button"
              onClick={() => setEditing(blankQuestion())}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm câu hỏi ngay</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {rows.map((q, index) => {
              const diff = difficultyConfig[q.difficulty] || difficultyConfig.medium;
              const isExpanded = expandedKeys.has(q.id);
              const questionNumber = (page - 1) * 30 + index + 1;

              return (
                <article
                  key={q.id}
                  className="rounded-3xl border border-white/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs transition hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-md space-y-3.5"
                >
                  {/* Top Bar: Question Number + Badges + Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 px-2.5 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono font-black text-xs border border-blue-100 dark:border-blue-900/50">
                        Câu {questionNumber}
                      </span>

                      {/* Difficulty Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${diff.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${diff.dot}`} />
                        {diff.label}
                      </span>

                      {/* Points Badge */}
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {q.points} điểm
                      </span>

                      {/* Visibility Badge */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          q.visibility === "course"
                            ? "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-900/50"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {q.visibility === "course" ? "Dùng chung trong khóa" : "Cá nhân"}
                      </span>
                    </div>

                    {/* Action buttons (Edit / Duplicate / Delete) */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDuplicate(q)}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        title="Tạo bản sao câu hỏi này"
                      >
                        <Copy className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                        <span className="hidden sm:inline">Nhân bản</span>
                      </button>

                      {q.canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing({ ...q, options: [...q.options] })}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
                            title="Sửa câu hỏi"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Sửa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleting(q)}
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition"
                            title="Xóa khỏi ngân hàng"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Xóa</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                    {q.questionText}
                  </div>

                  {/* Options Grid (A, B, C, D) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt, i) => {
                      const isCorrect = q.correctAnswer === i;
                      const letter = String.fromCharCode(65 + i);

                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-2.5 rounded-2xl p-2.5 border transition ${
                            isCorrect
                              ? "border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold shadow-2xs"
                              : "border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[11px] font-black font-mono ${
                              isCorrect
                                ? "bg-emerald-600 text-white"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="flex-1 min-w-0 pt-0.5">{opt}</span>
                          {isCorrect && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer: Tags & Explanation Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                    {/* Tags Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Array.isArray(q.tags) && q.tags.length > 0 ? (
                        q.tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 border border-sky-100 dark:border-sky-800"
                          >
                            <Tag className="h-2.5 w-2.5 text-sky-500 dark:text-sky-400" />
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Chưa gắn thẻ chủ đề</span>
                      )}
                    </div>

                    {/* Toggle Explanation Button */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(q.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{isExpanded ? "Ẩn giải thích chi tiết" : "Xem lời giải chi tiết"}</span>
                    </button>
                  </div>

                  {/* Expanded Explanation Box */}
                  {isExpanded && (
                    <div className="rounded-2xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/30 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1 animate-in fade-in duration-150">
                      <p className="font-bold text-[#102f63] dark:text-sky-200 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        Lời giải và phương pháp tư duy:
                      </p>
                      <p className="leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                        {q.explanation || "Chưa có lời giải chi tiết được cập nhật cho câu hỏi này."}
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* ================= 5. THANH PHÂN TRANG (PAGINATION) ================= */}
        {total > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 shadow-sm backdrop-blur-md">
            <button
              type="button"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-400 disabled:opacity-40 transition shadow-2xs"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Trang trước</span>
            </button>

            <span className="text-xs font-bold text-[#102f63] dark:text-slate-200 font-mono">
              Trang {page} / {Math.max(1, Math.ceil(total / 30))} · Tổng cộng {total} câu
            </span>

            <button
              type="button"
              disabled={page * 30 >= total || loading}
              onClick={() => setPage(page + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-400 disabled:opacity-40 transition shadow-2xs"
            >
              <span>Trang kế tiếp</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ================= MODAL: SOẠN & CHỈNH SỬA CÂU HỎI ================= */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f63]/40 dark:bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-white/90 dark:border-slate-800 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                  <Pencil className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#102f63] dark:text-white">
                    {editing.id ? "Chỉnh sửa câu hỏi" : "Soạn câu hỏi trắc nghiệm mới"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lưu trữ vào ngân hàng đề để tái sử dụng cho các bài kiểm tra
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              {/* Nội dung câu hỏi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nội dung câu hỏi *
                </label>
                <textarea
                  required
                  maxLength={6000}
                  rows={3}
                  value={editing.questionText}
                  onChange={(e) => setEditing({ ...editing, questionText: e.target.value })}
                  placeholder="Nhập nội dung câu hỏi (hỗ trợ công thức toán học KaTeX)..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Các phương án lựa chọn */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Các lựa chọn — Tích chọn đáp án đúng *
                  </label>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Đáp án đúng: Phương án {String.fromCharCode(65 + editing.correctAnswer)}
                  </span>
                </div>

                <div className="space-y-2">
                  {editing.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                        <input
                          type="radio"
                          name="correct-answer-picker"
                          checked={editing.correctAnswer === i}
                          onChange={() => setEditing({ ...editing, correctAnswer: i })}
                          className="h-4 w-4 text-blue-600 accent-blue-600 cursor-pointer"
                        />
                        <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300 w-4">
                          {String.fromCharCode(65 + i)}
                        </span>
                      </label>
                      <input
                        required
                        maxLength={2000}
                        value={opt}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            options: editing.options.map((v, j) => (i === j ? e.target.value : v)),
                          })
                        }
                        placeholder={`Phương án ${String.fromCharCode(65 + i)}...`}
                        className={`w-full rounded-xl border px-3 py-1.5 text-xs font-medium outline-none transition ${
                          editing.correctAnswer === i
                            ? "border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 focus:bg-white dark:focus:bg-slate-900"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 text-slate-800 dark:text-slate-100 focus:border-blue-500 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900"
                        }`}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={editing.options.length >= 6}
                    onClick={() => setEditing({ ...editing, options: [...editing.options, ""] })}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition"
                  >
                    + Thêm phương án
                  </button>
                  <button
                    type="button"
                    disabled={editing.options.length <= 2}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        options: editing.options.slice(0, -1),
                        correctAnswer: Math.min(editing.correctAnswer, editing.options.length - 2),
                      })
                    }
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition"
                  >
                    - Bớt phương án cuối
                  </button>
                </div>
              </div>

              {/* Grid 3 cột: Độ khó, Điểm số, Phạm vi hiển thị */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Độ khó *</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500"
                    value={editing.difficulty}
                    onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}
                  >
                    <option value="easy" className="dark:bg-slate-900 dark:text-white">Dễ (Nhận biết)</option>
                    <option value="medium" className="dark:bg-slate-900 dark:text-white">Vừa (Thông hiểu / Vận dụng)</option>
                    <option value="hard" className="dark:bg-slate-900 dark:text-white">Khó (Vận dụng cao)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Điểm số *</label>
                  <input
                    required
                    type="number"
                    min="0.25"
                    max="100"
                    step="0.25"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500 font-mono"
                    value={editing.points}
                    onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phạm vi chia sẻ *</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500"
                    value={editing.visibility}
                    onChange={(e) => setEditing({ ...editing, visibility: e.target.value })}
                  >
                    <option value="private" className="dark:bg-slate-900 dark:text-white">Cá nhân (Chỉ mình bạn)</option>
                    <option value="course" className="dark:bg-slate-900 dark:text-white">Dùng chung trong khóa</option>
                  </select>
                </div>
              </div>

              {/* Thẻ chủ đề */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Thẻ chủ đề (phân cách bằng dấu phẩy)
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="Ví dụ: Đại số, Hàm số bậc hai, BĐT..."
                  value={Array.isArray(editing.tags) ? editing.tags.join(", ") : editing.tags}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
                />
              </div>

              {/* Lời giải chi tiết */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lời giải và giải thích chi tiết
                </label>
                <textarea
                  maxLength={4000}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-blue-500 dark:focus:border-sky-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="Hướng dẫn giải từng bước để học viên ôn tập..."
                  value={editing.explanation}
                  onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Lưu ý: Sửa câu hỏi không làm ảnh hưởng các đề thi đã tạo trước đó.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#102f63] dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                  >
                    {busy ? "Đang lưu..." : "Lưu câu hỏi"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: XÁC NHẬN XÓA CÂU HỎI ================= */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f63]/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-white/90 dark:border-slate-800 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-5 w-5" />
              </span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Xóa câu hỏi khỏi ngân hàng?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng không? Các đề thi đã sử dụng câu hỏi này vẫn giữ nguyên vẹn nội dung.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleting(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleRemoveQuestion}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-50 transition"
              >
                {busy ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
