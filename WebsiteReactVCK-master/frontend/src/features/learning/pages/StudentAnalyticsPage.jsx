import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  PieChart as PieChartIcon,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { fetchAssignments, fetchMyEnrolledCourses } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";

const SCORE_RANGES = [
  {
    id: "poor",
    label: "Cần luyện tập",
    range: "< 50%",
    min: 0,
    max: 49,
    color: "#ef4444",
    bgBadge: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900/60",
    desc: "Điểm dưới 5.0 — Cần ôn tập lại kiến thức trọng tâm",
  },
  {
    id: "average",
    label: "Trung bình",
    range: "50% - 69%",
    min: 50,
    max: 69,
    color: "#f59e0b",
    bgBadge: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900/60",
    desc: "Điểm 5.0 - 6.9 — Nắm được căn bản, cần rèn luyện thêm",
  },
  {
    id: "good",
    label: "Khá",
    range: "70% - 84%",
    min: 70,
    max: 84,
    color: "#3b82f6",
    bgBadge: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 ring-1 ring-blue-200 dark:ring-blue-900/60",
    desc: "Điểm 7.0 - 8.4 — Kết quả tốt, nắm vững kiến thức",
  },
  {
    id: "excellent",
    label: "Giỏi / Xuất sắc",
    range: "≥ 85%",
    min: 85,
    max: 100,
    color: "#10b981",
    bgBadge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900/60",
    desc: "Điểm 8.5 - 10 — Xuất sắc, hiểu sâu toàn bộ bài học",
  },
];

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

function CustomChartTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1">
        <p className="font-black text-slate-900 dark:text-white">{label || payload[0]?.name}</p>
        {payload.map((entry, index) => (
          <p key={index} className="flex items-center gap-2 font-semibold" style={{ color: entry.color || entry.fill }}>
            <span>{entry.name}:</span>
            <span className="font-black">
              {entry.value}
              {entry.unit || ""}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function StudentAnalyticsPage() {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterTier, setFilterTier] = useState("all"); // 'all' | 'poor' | 'average' | 'good' | 'excellent'

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, assignmentsResponse] = await Promise.all([
        fetchMyEnrolledCourses(),
        fetchAssignments(),
      ]);
      if (!response?.success) throw new Error(response?.message || "Không thể tải tiến độ học tập.");
      setCourses(Array.isArray(response.data) ? response.data : []);
      setAssignments(
        assignmentsResponse?.success && Array.isArray(assignmentsResponse.data)
          ? assignmentsResponse.data
          : []
      );
    } catch (requestError) {
      setCourses([]);
      setAssignments([]);
      setError(requestError.message || "Không thể tải tiến độ học tập.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Process and normalize assignments with detailed score metrics
  const processedAssignments = useMemo(() => {
    return assignments.map((item) => {
      const rawScore = Number(item.score);
      const maxScore = Number(item.max_score || item.maxScore || 10);
      const isGraded = item.score !== null && item.score !== undefined && Number.isFinite(rawScore);
      const percentage = isGraded && maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
      const scaled10 = isGraded && maxScore > 0 ? Number(((rawScore / maxScore) * 10).toFixed(1)) : 0;

      let rangeTier = "none";
      if (isGraded) {
        if (percentage < 50) rangeTier = "poor";
        else if (percentage < 70) rangeTier = "average";
        else if (percentage < 85) rangeTier = "good";
        else rangeTier = "excellent";
      }

      const tierObj = SCORE_RANGES.find((r) => r.id === rangeTier) || null;

      const dateStr = item.submitted_at || item.graded_at || item.created_at;
      const formattedDate = dateStr
        ? new Date(dateStr).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "Chưa rõ ngày";

      return {
        ...item,
        isGraded,
        rawScore,
        maxScore,
        percentage,
        scaled10,
        rangeTier,
        tierObj,
        formattedDate,
      };
    });
  }, [assignments]);

  const gradedList = useMemo(() => {
    return processedAssignments.filter((a) => a.isGraded);
  }, [processedAssignments]);

  // List of assignments needing urgent practice (under 50% or under 70%)
  const needsPracticeList = useMemo(() => {
    return gradedList.filter((a) => a.percentage < 70).sort((a, b) => a.percentage - b.percentage);
  }, [gradedList]);

  // General summary numbers
  const summary = useMemo(() => {
    const totalCourses = courses.length;
    const completedCourses = courses.filter((c) => getProgress(c) === 100).length;
    const avgProgress = totalCourses
      ? Math.round(courses.reduce((sum, c) => sum + getProgress(c), 0) / totalCourses)
      : 0;

    const totalEarned = gradedList.reduce((sum, item) => sum + item.rawScore, 0);
    const totalPossible = gradedList.reduce((sum, item) => sum + item.maxScore, 0);
    const overallPercentage = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
    const overallScaled10 = totalPossible > 0 ? ((totalEarned / totalPossible) * 10).toFixed(1) : "0.0";

    let ratingText = "Chưa có dữ liệu bài làm";
    let ratingBadge = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (gradedList.length > 0) {
      if (overallPercentage >= 85) {
        ratingText = "Học lực Giỏi / Xuất sắc";
        ratingBadge = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300";
      } else if (overallPercentage >= 70) {
        ratingText = "Học lực Khá";
        ratingBadge = "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-sky-300 border border-blue-300";
      } else if (overallPercentage >= 50) {
        ratingText = "Học lực Trung bình";
        ratingBadge = "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300";
      } else {
        ratingText = "Cần cải thiện & Luyện tập thêm";
        ratingBadge = "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300";
      }
    }

    return {
      totalCourses,
      completedCourses,
      avgProgress,
      gradedCount: gradedList.length,
      totalEarned,
      totalPossible,
      overallPercentage,
      overallScaled10,
      ratingText,
      ratingBadge,
      needsPracticeCount: needsPracticeList.length,
    };
  }, [courses, gradedList, needsPracticeList]);

  // Chart 1: Score Range Distribution Data for BarChart & Donut
  const scoreRangeData = useMemo(() => {
    return SCORE_RANGES.map((tier) => {
      const count = gradedList.filter((a) => a.rangeTier === tier.id).length;
      const percent = gradedList.length ? Math.round((count / gradedList.length) * 100) : 0;
      return {
        name: tier.label,
        shortName: tier.range,
        count,
        percent,
        fill: tier.color,
      };
    });
  }, [gradedList]);

  // Chart 2: Score Trend Over Time / Submissions
  const trendData = useMemo(() => {
    const sorted = [...gradedList].sort((a, b) => {
      const tA = new Date(a.submitted_at || a.graded_at || 0).getTime();
      const tB = new Date(b.submitted_at || b.graded_at || 0).getTime();
      return tA - tB;
    });

    return sorted.map((item, idx) => ({
      name: item.title && item.title.length > 20 ? item.title.slice(0, 18) + "..." : item.title || `Bài ${idx + 1}`,
      fullName: item.title || `Bài ${idx + 1}`,
      "Điểm (%)": item.percentage,
      "Điểm (Hệ 10)": item.scaled10,
      scoreInfo: `${item.rawScore}/${item.maxScore} (${item.percentage}%)`,
      date: item.formattedDate,
    }));
  }, [gradedList]);

  // Group performance by Course / Topic
  const coursePerformance = useMemo(() => {
    return courses.map((course) => {
      const courseAssignments = gradedList.filter((a) => Number(a.course_id) === Number(course.course_id));
      const totalEarned = courseAssignments.reduce((s, a) => s + a.rawScore, 0);
      const totalPossible = courseAssignments.reduce((s, a) => s + a.maxScore, 0);
      const coursePct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : null;
      const poorCount = courseAssignments.filter((a) => a.percentage < 50).length;

      return {
        ...course,
        progress: getProgress(course),
        gradedCount: courseAssignments.length,
        avgScore: coursePct,
        poorCount,
      };
    });
  }, [courses, gradedList]);

  // Filtered list of graded assignments for the detailed table
  const visibleGradedList = useMemo(() => {
    if (filterTier === "all") return gradedList;
    return gradedList.filter((a) => a.rangeTier === filterTier);
  }, [gradedList, filterTier]);

  if (loading) {
    return <Loading loading={true} text="Đang đồng bộ và phân tích dữ liệu điểm số..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (error) {
    return (
      <div className="bg-[#f6f9fd] dark:bg-slate-950 px-4 py-12 sm:px-8">
        <ErrorState title="Chưa thể tải phân tích" message={error} onRetry={loadAnalytics} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 pb-16 pt-6 sm:px-8 lg:px-10 transition-colors duration-200">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* Page Header */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 px-3 py-1 text-xs font-bold text-blue-600 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" /> Báo cáo năng lực học tập
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              Kết quả tổng quan & Phân tích điểm
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Thống kê chi tiết các bài đã làm, biểu đồ phân bố điểm số và danh sách các chủ đề trọng tâm cần luyện tập thêm.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-white dark:hover:bg-slate-700 hover:border-blue-300 shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Cập nhật dữ liệu
          </button>
        </header>

        {/* Top 4 Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Điểm tổng kết */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 shadow-xs">
                <Award className="h-5 w-5" />
              </span>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${summary.ratingBadge}`}>
                {summary.ratingText}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                {summary.overallPercentage}%
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500 ml-2">
                  ({summary.overallScaled10}/10)
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tổng điểm: <b>{summary.totalEarned}/{summary.totalPossible}</b> điểm ({summary.gradedCount} bài đã chấm)
              </p>
            </div>
          </div>

          {/* Card 2: Bài cần luyện tập */}
          <div className="relative overflow-hidden rounded-3xl border border-rose-200/80 dark:border-rose-900/60 bg-gradient-to-br from-white via-rose-50/20 to-rose-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 p-5 shadow-xs transition hover:shadow-md">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 to-pink-600" />
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shadow-xs">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
                Ưu tiên ôn tập
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-rose-600 dark:text-rose-400">
                {summary.needsPracticeCount} <span className="text-sm font-semibold text-slate-500">bài</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {summary.needsPracticeCount > 0
                  ? "Điểm dưới 70% cần làm lại hoặc củng cố kiến thức"
                  : "Tuyệt vời! Không có bài nào dưới 70%"}
              </p>
            </div>
          </div>

          {/* Card 3: Tiến độ khóa học */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shadow-xs">
                <TrendingUp className="h-5 w-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                Tiến độ bài học
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                {summary.avgProgress}%
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {summary.completedCourses}/{summary.totalCourses} khóa học đã hoàn tất 100%
              </p>
            </div>
          </div>

          {/* Card 4: Khóa học đã cấp */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-violet-500 to-purple-600" />
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 shadow-xs">
                <BookOpen className="h-5 w-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-violet-50 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300">
                Khóa học
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                {summary.totalCourses} <span className="text-sm font-semibold text-slate-500">khóa</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Được hệ thống quản lý cấp quyền và phân lớp
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 1: CẢNH BÁO & GỢI Ý CÁC BÀI, CHỦ ĐỀ CẦN LUYỆN TẬP THÊM */}
        <section className="rounded-3xl border border-rose-200/90 dark:border-rose-900/50 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                Chủ đề & Bài cần luyện tập thêm ({needsPracticeList.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các bài kiểm tra hoặc bài tập có điểm số dưới 70% cần được ưu tiên ôn tập lại để củng cố kỹ năng.
              </p>
            </div>
            {needsPracticeList.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                <Zap className="h-3.5 w-3.5" /> Khuyến nghị ôn tập ngay
              </span>
            )}
          </div>

          {needsPracticeList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-2 text-sm font-black text-emerald-800 dark:text-emerald-200">
                Rất xuất sắc! Bạn chưa có bài nào cần cảnh báo luyện tập lại.
              </p>
              <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Tất cả các bài kiểm tra đã làm đều đạt từ 70% trở lên. Hãy tiếp tục duy trì phong độ nhé!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {needsPracticeList.map((item) => (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-rose-200/90 dark:border-rose-900/60 bg-gradient-to-br from-rose-50/30 via-white to-pink-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/30 p-4 shadow-2xs hover:shadow-md transition"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500" />
                  <div className="pl-1.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        {item.percentage < 50 ? "Điểm yếu (< 50%)" : "Cần củng cố"}
                      </span>
                      <span className="text-[11px] font-black text-rose-600 dark:text-rose-400">
                        {item.rawScore}/{item.maxScore} điểm ({item.percentage}%)
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-black text-slate-950 dark:text-white line-clamp-2 group-hover:text-rose-600 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                        Khóa: <b>{item.course_title || "CSCA"}</b> {item.session_title ? `• ${item.session_title}` : ""}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/80 dark:bg-slate-950/70 p-2.5 border border-rose-100 dark:border-rose-950/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <p className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1 text-[11px]">
                        <Compass className="h-3 w-3" /> Gợi ý hành động:
                      </p>
                      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.feedback_text
                          ? `Giáo viên nhận xét: "${item.feedback_text}"`
                          : "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-2 pl-1.5 border-t border-rose-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {item.formattedDate}
                    </span>
                    <Link
                      to="/lms/assignments"
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 transition"
                    >
                      Mở bài học <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 2: BIỂU ĐỒ PHÂN BỐ PHỔ ĐIỂM & XU HƯỚNG */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Biểu đồ 1: Phổ điểm đang ở khoảng nào (Bar Chart) */}
          <div className="lg:col-span-7 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600 dark:text-sky-400" /> Phân bố phổ điểm các bài thi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Điểm số các bài kiểm tra của bạn đang tập trung ở khoảng nào.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-3 py-1 text-xs font-bold text-blue-600 dark:text-sky-300">
                {gradedList.length} bài đã làm
              </span>
            </div>

            {gradedList.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
                Chưa có bài thi nào được chấm điểm để tạo biểu đồ.
              </div>
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreRangeData} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b822" />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                      axisLine={{ stroke: "#94a3b833" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#94a3b833" }}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="count" name="Số bài" radius={[8, 8, 0, 0]}>
                      {scoreRangeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Thống kê 4 khoảng điểm */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {SCORE_RANGES.map((tier) => {
                const item = scoreRangeData.find((d) => d.name === tier.label) || { count: 0, percent: 0 };
                return (
                  <div key={tier.id} className="rounded-xl border border-slate-100 dark:border-slate-800/80 p-2.5 bg-slate-50/50 dark:bg-slate-950/40">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{tier.label}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-base font-black text-slate-900 dark:text-white">{item.count} bài</span>
                      <span className="text-[11px] font-bold text-slate-500">{item.percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Biểu đồ 2: Xu hướng điểm qua các bài gần đây (Area Chart) */}
          <div className="lg:col-span-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" /> Xu hướng điểm theo thời gian
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Đường biến thiên điểm (%) qua các bài làm gần nhất.
                </p>
              </div>
            </div>

            {trendData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                <TrendingUp className="h-10 w-10 mb-2 opacity-40" />
                Chưa có dữ liệu bài nộp để tạo đường xu hướng.
              </div>
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 20, right: 15, left: -25, bottom: 20 }}>
                    <defs>
                      <linearGradient id="scoreTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b822" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }}
                      axisLine={{ stroke: "#94a3b833" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={{ stroke: "#94a3b833" }}
                      tickLine={false}
                    />
                    <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Mốc đạt 50%", fill: "#ef4444", fontSize: 10, position: "insideBottomLeft" }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="Điểm (%)"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#scoreTrendGradient)"
                      activeDot={{ r: 6, fill: "#8b5cf6", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-3 text-xs text-violet-900 dark:text-violet-200 flex items-center justify-between">
              <span className="font-semibold">Đường cơ sở điểm đạt: 50%</span>
              <span className="font-black">Điểm TB: {summary.overallPercentage}%</span>
            </div>
          </div>
        </section>

        {/* SECTION 3: DANH SÁCH CHI TIẾT CÁC BÀI ĐÃ LÀM */}
        <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Danh sách chi tiết các bài đã làm ({gradedList.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Xem lại điểm số, xếp loại và nhận xét của giảng viên cho từng bài nộp.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Lọc:
              </span>
              <button
                type="button"
                onClick={() => setFilterTier("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTier === "all"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                Tất cả ({gradedList.length})
              </button>
              {SCORE_RANGES.map((tier) => {
                const count = gradedList.filter((a) => a.rangeTier === tier.id).length;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setFilterTier(tier.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      filterTier === tier.id
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tier.color }} />
                    {tier.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {visibleGradedList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Không tìm thấy bài làm nào trong bộ lọc này.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleGradedList.map((item) => (
                <article
                  key={item.id}
                  className="py-4 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 p-3 rounded-2xl transition"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {item.type === "quiz" ? "Trắc nghiệm" : "Bài tập"}
                      </span>
                      {item.tierObj && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${item.tierObj.bgBadge}`}>
                          {item.tierObj.label} ({item.tierObj.range})
                        </span>
                      )}
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {item.formattedDate}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h3>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Khóa học: <b>{item.course_title || "CSCA"}</b> {item.session_title ? `• Buổi: ${item.session_title}` : ""}
                    </p>

                    {item.feedback_text && (
                      <p className="text-xs italic text-blue-700 dark:text-sky-300 bg-blue-50/60 dark:bg-blue-950/40 p-2 rounded-xl border border-blue-100 dark:border-blue-900/40">
                        💬 Nhận xét: {item.feedback_text}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right">
                      <p className="text-lg font-black text-slate-950 dark:text-white">
                        {item.rawScore}/{item.maxScore}
                        <span className="text-xs text-slate-500 ml-1">({item.percentage}%)</span>
                      </p>
                      <p className="text-[11px] font-bold text-slate-400">
                        Thang 10: <b className="text-slate-700 dark:text-slate-200">{item.scaled10}</b>
                      </p>
                    </div>

                    <Link
                      to="/lms/assignments"
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-sky-300 transition shadow-2xs"
                    >
                      Xem lại bài
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 4: TIẾN ĐỘ THEO KHÓA HỌC */}
        <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-blue-600 dark:text-sky-400" />
                Tiến độ theo khóa học ({courses.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mức độ hoàn thành nội dung và điểm trung bình theo từng chương trình học.
              </p>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Chưa có dữ liệu khóa học.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {coursePerformance.map((course) => (
                <div
                  key={course.course_id}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                        {course.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {course.category || "CSCA"}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-sky-300">
                      {course.progress}%
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        course.progress === 100
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                          : "bg-gradient-to-r from-blue-600 to-indigo-600"
                      }`}
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/80">
                    <span>{course.gradedCount} bài đã chấm</span>
                    {course.avgScore !== null ? (
                      <span>
                        Điểm TB: <b className="text-slate-900 dark:text-white">{course.avgScore}%</b>
                      </span>
                    ) : (
                      <span>Chưa có điểm bài tập</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
