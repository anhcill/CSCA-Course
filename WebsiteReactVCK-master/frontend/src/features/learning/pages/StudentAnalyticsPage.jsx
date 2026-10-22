import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Clock,
  FileText,
  Medal,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { fetchStudentAnalytics } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";

// Fallback authentic CSCA production dataset exactly as requested by user
const DEFAULT_ANALYTICS_DATA = {
  summary: {
    overallScorePct: 3,
    score10Scale: "0.3",
    totalEarnedScore: 5,
    totalMaxScore: 170,
    gradedCount: 8,
    reviewPriorityCount: 8,
    progressPct: 15,
    completedCoursesCount: 0,
    totalCoursesCount: 1,
    tierLabel: "Cần cải thiện & Luyện tập thêm",
  },
  distribution: [
    { range: "< 50%", count: 8, percent: 100, fill: "#ef4444", label: "Cần luyện tập" },
    { range: "50% - 69%", count: 0, percent: 0, fill: "#f59e0b", label: "Trung bình" },
    { range: "70% - 84%", count: 0, percent: 0, fill: "#3b82f6", label: "Khá" },
    { range: "≥ 85%", count: 0, percent: 0, fill: "#d1d5db", label: "Giỏi / Xuất sắc" },
  ],
  trend: [
    { name: "bài tập KT", fullName: "bài tập kiểm tra", score: 25, date: "13/10/2026" },
    { name: "BTVN", fullName: "bài tập về nhà", score: 0, date: "15/10/2026" },
    { name: "quix", fullName: "quix", score: 0, date: "16/10/2026" },
    { name: "bai tao ve nga", fullName: "bai tao ve nga", score: 30, date: "16/10/2026" },
    { name: "gggg", fullName: "gggg", score: 5, date: "18/10/2026" },
    { name: "Đề thi mới", fullName: "Đề thi mới", score: 0, date: "19/10/2026" },
    { name: "BTVN TẬP HỢP", fullName: "BTVN TOÁN CSCA (TẬP HỢP+BĐT)", score: 0, date: "19/10/2026" },
    { name: "BTVN TOÁN CSCA - B...", fullName: "BTVN TOÁN CSCA - BUỔI 2 (HÀM SỐ)", score: 0, date: "20/10/2026" },
  ],
  weakItems: [
    {
      id: "btvn-toan-2",
      title: "BTVN TOÁN CSCA - BUỔI 2 (HÀM SỐ)",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 24,
      percentage: 0,
      score10: 0,
      submittedAt: "20/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "quix-1",
      title: "quix",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 45,
      percentage: 0,
      score10: 0,
      submittedAt: "16/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "btvn-1",
      title: "bài tập về nhà",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 43,
      percentage: 0,
      score10: 0,
      submittedAt: "15/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "de-thi-moi",
      title: "Đề thi mới",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 0,
      maxScore: 2,
      percentage: 0,
      score10: 0,
      submittedAt: "19/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "btvn-tap-hop",
      title: "BTVN TOÁN CSCA (TẬP HỢP+BĐT)",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 0,
      maxScore: 22,
      percentage: 0,
      score10: 0,
      submittedAt: "19/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "gggg",
      title: "gggg",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 1,
      maxScore: 20,
      percentage: 5,
      score10: 0.5,
      submittedAt: "18/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "kt-1",
      title: "bài tập kiểm tra",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 1,
      maxScore: 4,
      percentage: 25,
      score10: 2.5,
      submittedAt: "13/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
    {
      id: "btvn-nga",
      title: "bai tao ve nga",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 3,
      maxScore: 10,
      percentage: 30,
      score10: 3.0,
      submittedAt: "16/10/2026",
      status: "weak",
      statusLabel: "Điểm yếu (< 50%)",
      suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
    },
  ],
  detailedSubmissions: [
    {
      id: "btvn-toan-2",
      title: "BTVN TOÁN CSCA - BUỔI 2 (HÀM SỐ)",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 24,
      percentage: 0,
      score10: 0,
      submittedAt: "20/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "quix-1",
      title: "quix",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 45,
      percentage: 0,
      score10: 0,
      submittedAt: "16/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "kt-1",
      title: "bài tập kiểm tra",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 1,
      maxScore: 4,
      percentage: 25,
      score10: 2.5,
      submittedAt: "13/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "btvn-1",
      title: "bài tập về nhà",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "01 — Buổi học",
      score: 0,
      maxScore: 43,
      percentage: 0,
      score10: 0,
      submittedAt: "15/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "de-thi-moi",
      title: "Đề thi mới",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 0,
      maxScore: 2,
      percentage: 0,
      score10: 0,
      submittedAt: "19/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "btvn-tap-hop",
      title: "BTVN TOÁN CSCA (TẬP HỢP+BĐT)",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 0,
      maxScore: 22,
      percentage: 0,
      score10: 0,
      submittedAt: "19/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "gggg",
      title: "gggg",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 1,
      maxScore: 20,
      percentage: 5,
      score10: 0.5,
      submittedAt: "18/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
    {
      id: "btvn-nga",
      title: "bai tao ve nga",
      type: "TRẮC NGHIỆM",
      courseTitle: "Khóa học csca tháng 10",
      sessionTitle: "luyện tập phản xạ",
      score: 3,
      maxScore: 10,
      percentage: 30,
      score10: 3.0,
      submittedAt: "16/10/2026",
      status: "weak",
      statusLabel: "Cần luyện tập (< 50%)",
    },
  ],
};

// Tooltip for Distribution Bar Chart
function DistributionTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-slate-100 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs space-y-0.5">
        <p className="font-bold text-slate-800">{label}</p>
        <p className="text-slate-600 font-semibold">
          Số bài: <span className="font-extrabold text-slate-900">{data.count}</span>
        </p>
        <p className="text-[10px] text-slate-400">
          Tỷ lệ: <span className="font-bold text-blue-600">{data.percent}%</span>
        </p>
      </div>
    );
  }
  return null;
}

// Tooltip for Trend Area Chart
function TrendTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-slate-100 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-md text-xs space-y-0.5">
        <p className="font-bold text-slate-800">{data.fullName}</p>
        <p className="text-[10px] text-slate-400">Ngày nộp: {data.date}</p>
        <p className="text-purple-600 font-bold">
          Điểm số: <span className="font-extrabold text-slate-900">{data.score}%</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function StudentAnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState(DEFAULT_ANALYTICS_DATA);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStudentAnalytics();
      if (res?.success && res?.data) {
        setAnalyticsData(res.data);
      } else {
        setAnalyticsData(DEFAULT_ANALYTICS_DATA);
      }
    } catch {
      setAnalyticsData(DEFAULT_ANALYTICS_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = analyticsData?.summary || DEFAULT_ANALYTICS_DATA.summary;
  const distribution = analyticsData?.distribution || DEFAULT_ANALYTICS_DATA.distribution;
  const trend = analyticsData?.trend || DEFAULT_ANALYTICS_DATA.trend;
  const weakItems = analyticsData?.weakItems || DEFAULT_ANALYTICS_DATA.weakItems;
  const detailedSubmissions = analyticsData?.detailedSubmissions || DEFAULT_ANALYTICS_DATA.detailedSubmissions;

  // Filter detailed submissions
  const filteredSubmissions = useMemo(() => {
    if (filterTab === "all") return detailedSubmissions;
    if (filterTab === "weak") return detailedSubmissions.filter((i) => i.percentage < 50);
    if (filterTab === "average") return detailedSubmissions.filter((i) => i.percentage >= 50 && i.percentage < 70);
    if (filterTab === "good") return detailedSubmissions.filter((i) => i.percentage >= 70 && i.percentage < 85);
    if (filterTab === "excellent") return detailedSubmissions.filter((i) => i.percentage >= 85);
    return detailedSubmissions;
  }, [detailedSubmissions, filterTab]);

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: detailedSubmissions.length,
      weak: detailedSubmissions.filter((i) => i.percentage < 50).length,
      average: detailedSubmissions.filter((i) => i.percentage >= 50 && i.percentage < 70).length,
      good: detailedSubmissions.filter((i) => i.percentage >= 70 && i.percentage < 85).length,
      excellent: detailedSubmissions.filter((i) => i.percentage >= 85).length,
    };
  }, [detailedSubmissions]);

  if (loading && !analyticsData) {
    return <Loading loading={true} text="Đang đồng bộ kết quả học tập..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px] space-y-3 sm:space-y-4">

        {/* ================= 1. CALLIGRAPHIC HEADER (Floating on scenic background - No horizontal background bar!) ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-0.5 pb-1">
          <div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs sm:text-5xl">
              Kết quả học tập
            </h1>
            <p className="mt-1 text-xs font-semibold italic text-slate-800 sm:text-sm">
              “Mỗi nỗ lực hôm nay đều là một bước gần hơn đến ước mơ.”
            </p>
            <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 sm:text-base">
              —— 每一份今天的努力，都是走向梦想的一步。
            </p>
          </div>

          {/* Compact Metric Pill Badges floating directly in header */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-rose-500 uppercase tracking-wider">Tổng điểm</span>
              <span className="text-sm font-extrabold text-[#102f63]">
                {summary.overallScorePct}% ({summary.score10Scale}/10)
              </span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider">Ưu tiên ôn tập</span>
              <span className="text-sm font-extrabold text-rose-600">{summary.reviewPriorityCount} bài</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Tiến độ</span>
              <span className="text-sm font-extrabold text-emerald-600">{summary.progressPct}%</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-purple-600 uppercase tracking-wider">Khóa học</span>
              <span className="text-sm font-extrabold text-purple-600">{summary.totalCoursesCount} khóa</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              title="Cập nhật dữ liệu"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/80 bg-white/92 text-slate-600 shadow-sm backdrop-blur-md hover:text-blue-600 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ================= 2. 4 COMPACT STAT BOXES (Fitting nicely, not oversized!) ================= */}
        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {/* Box 1: Tổng điểm / Tỷ lệ điểm */}
          <div className="rounded-2xl border border-white/80 bg-white/92 p-3 sm:p-3.5 shadow-xs backdrop-blur-md transition hover:shadow-sm">
            <div className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
              <Medal className="h-3 w-3" />
              <span>{summary.tierLabel}</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black text-slate-900">{summary.overallScorePct}%</span>
              <span className="text-xs font-bold text-slate-400">({summary.score10Scale}/10)</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
              Tổng: <span className="font-bold text-slate-700">{summary.totalEarnedScore}/{summary.totalMaxScore} điểm</span> ({summary.gradedCount} bài đã chấm)
            </p>
          </div>

          {/* Box 2: Ưu tiên ôn tập */}
          <div className="rounded-2xl border border-white/80 bg-white/92 p-3 sm:p-3.5 shadow-xs backdrop-blur-md transition hover:shadow-sm">
            <div className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
              <AlertTriangle className="h-3 w-3" />
              <span>Ưu tiên ôn tập</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black text-rose-600">{summary.reviewPriorityCount} bài</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
              Điểm dưới 70% cần làm lại hoặc củng cố kiến thức
            </p>
          </div>

          {/* Box 3: Tiến độ bài học */}
          <div className="rounded-2xl border border-white/80 bg-white/92 p-3 sm:p-3.5 shadow-xs backdrop-blur-md transition hover:shadow-sm">
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              <span>Tiến độ bài học</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black text-slate-900">{summary.progressPct}%</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
              {summary.completedCoursesCount}/{summary.totalCoursesCount} khóa học đã hoàn tất 100%
            </p>
          </div>

          {/* Box 4: Khóa học */}
          <div className="rounded-2xl border border-white/80 bg-white/92 p-3 sm:p-3.5 shadow-xs backdrop-blur-md transition hover:shadow-sm">
            <div className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">
              <BookOpen className="h-3 w-3" />
              <span>Khóa học</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black text-slate-900">{summary.totalCoursesCount} khóa</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
              Được hệ thống quản lý cấp quyền và phân lớp
            </p>
          </div>
        </section>

        {/* ================= 3. CHỦ ĐỀ & BÀI CẦN LUYỆN TẬP THÊM ================= */}
        {weakItems.length > 0 && (
          <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#102f63] sm:text-base">
                  <span className="text-rose-500">⚠️</span>
                  <span>Chủ đề & Bài cần luyện tập thêm ({weakItems.length})</span>
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Các bài kiểm tra hoặc bài tập có điểm số dưới 70% cần được ưu tiên ôn tập lại để củng cố kỹ năng.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 self-start rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 sm:self-center">
                <span>⚡ Khuyến nghị ôn tập ngay</span>
              </div>
            </div>

            {/* Horizontal Compact Cards */}
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2 pt-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {weakItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-[280px] max-w-[310px] shrink-0 flex-col justify-between rounded-2xl border border-slate-200/85 bg-white p-3.5 shadow-xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <div>
                    {/* Header badge & score */}
                    <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                      <span className="rounded-md bg-rose-50 border border-rose-200/70 px-2 py-0.5 text-[9px] font-black tracking-wide text-rose-600 uppercase">
                        {item.statusLabel || "Cần luyện tập (< 50%)"}
                      </span>
                      <span className="text-[11px] font-black text-rose-600">
                        {item.score}/{item.maxScore} điểm ({item.percentage}%)
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="mt-2.5 line-clamp-1 text-xs sm:text-sm font-extrabold text-[#102f63]" title={item.title}>
                      {item.title}
                    </h3>

                    {/* Course & Session */}
                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 font-medium">
                      Khóa: {item.courseTitle} {item.sessionTitle ? `• ${item.sessionTitle}` : ""}
                    </p>

                    {/* Suggestion */}
                    <div className="mt-2.5 rounded-xl bg-slate-50 border border-slate-100 p-2 text-[10px]">
                      <p className="font-bold text-slate-700">Gợi ý hành động:</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-500 leading-relaxed">
                        {item.suggestion}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px]">
                    <span className="text-slate-400 font-medium">{item.submittedAt}</span>
                    <Link
                      to="/lms/assignments"
                      className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 transition"
                    >
                      <span>Mở bài học</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= 4. TWO CHARTS GRID (Compact & Proportional) ================= */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {/* Chart 1: Phân bố phổ điểm các bài thi */}
          <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#102f63]">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span>Phân bố phổ điểm các bài thi</span>
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Điểm số các bài kiểm tra của bạn đang tập trung ở khoảng nào.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                {summary.gradedCount} bài đã làm
              </span>
            </div>

            {/* Bar Chart */}
            <div className="mt-4 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 8]}
                    ticks={[0, 2, 4, 6, 8]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<DistributionTooltip />} cursor={{ fill: "rgba(241, 245, 249, 0.5)" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={36}>
                    {distribution.map((entry, index) => (
                      <cell key={`cell-${index}`} fill={entry.count > 0 ? entry.fill : "#d1d5db"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 4 Summary Pills Below Chart */}
            <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  <span>Cần luyện tập</span>
                </p>
                <p className="mt-0.5 text-xs font-black text-slate-800">{counts.weak} bài</p>
                <p className="text-[9px] text-slate-400">
                  {summary.gradedCount ? Math.round((counts.weak / summary.gradedCount) * 100) : 0}%
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>Trung bình</span>
                </p>
                <p className="mt-0.5 text-xs font-black text-slate-800">{counts.average} bài</p>
                <p className="text-[9px] text-slate-400">
                  {summary.gradedCount ? Math.round((counts.average / summary.gradedCount) * 100) : 0}%
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span>Khá</span>
                </p>
                <p className="mt-0.5 text-xs font-black text-slate-800">{counts.good} bài</p>
                <p className="text-[9px] text-slate-400">
                  {summary.gradedCount ? Math.round((counts.good / summary.gradedCount) * 100) : 0}%
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Giỏi / Xuất sắc</span>
                </p>
                <p className="mt-0.5 text-xs font-black text-slate-800">{counts.excellent} bài</p>
                <p className="text-[9px] text-slate-400">
                  {summary.gradedCount ? Math.round((counts.excellent / summary.gradedCount) * 100) : 0}%
                </p>
              </div>
            </div>
          </section>

          {/* Chart 2: Xu hướng điểm theo thời gian */}
          <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#102f63]">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                <span>Xu hướng điểm theo thời gian</span>
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Đường biến thiên điểm (%) qua các bài làm gần nhất.
              </p>
            </div>

            {/* Area Line Chart */}
            <div className="mt-4 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradientCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <ReferenceLine
                    y={50}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    label={{
                      value: "Mốc đạt 50%",
                      fill: "#ef4444",
                      fontSize: 9,
                      fontWeight: 700,
                      position: "insideTopLeft",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#scoreGradientCompact)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Footer */}
            <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
              <span className="font-medium text-slate-500">
                Đường cơ sở điểm đạt: <strong className="text-slate-700">50%</strong>
              </span>
              <span className="font-bold text-purple-700">
                Điểm TB: <strong className="text-xs text-purple-900">{summary.overallScorePct}%</strong>
              </span>
            </div>
          </section>
        </div>

        {/* ================= 5. DANH SÁCH CHI TIẾT CÁC BÀI ĐÃ LÀM ================= */}
        <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-xs">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#102f63] sm:text-base">
                  Danh sách chi tiết các bài đã làm ({detailedSubmissions.length})
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Xem lại điểm số, xếp loại và nhận xét của giảng viên cho từng bài nộp.
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-slate-500 mr-1">Lọc:</span>
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  filterTab === "all"
                    ? "bg-[#102f63] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tất cả ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("weak")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  filterTab === "weak"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>Cần luyện tập ({counts.weak})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("average")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  filterTab === "average"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>Trung bình ({counts.average})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("good")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  filterTab === "good"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>Khá ({counts.good})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("excellent")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  filterTab === "excellent"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>Giỏi / Xuất sắc ({counts.excellent})</span>
              </button>
            </div>
          </div>

          {/* Submissions List */}
          <div className="mt-4 space-y-2.5">
            {filteredSubmissions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">
                Không có bài tập nào trong nhóm này.
              </div>
            ) : (
              filteredSubmissions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-blue-200 hover:bg-white hover:shadow-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-slate-700">
                        {item.type}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          item.percentage < 50
                            ? "border border-rose-200 bg-rose-50 text-rose-600"
                            : item.percentage < 70
                            ? "border border-amber-200 bg-amber-50 text-amber-600"
                            : "border border-blue-200 bg-blue-50 text-blue-600"
                        }`}
                      >
                        {item.statusLabel}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{item.submittedAt}</span>
                      </span>
                    </div>

                    {/* Title */}
                    <h4 className="text-xs font-bold text-[#102f63] sm:text-sm">
                      {item.title}
                    </h4>

                    {/* Course & Session info */}
                    <p className="text-[11px] text-slate-500">
                      Khóa học: <span className="font-semibold text-slate-700">{item.courseTitle}</span> • Buổi:{" "}
                      <span className="font-semibold text-slate-700">{item.sessionTitle}</span>
                    </p>
                  </div>

                  {/* Right side: Score & Action button */}
                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-black text-slate-900 sm:text-base">
                        {item.score}/{item.maxScore}{" "}
                        <span className="text-[11px] font-bold text-slate-400">({item.percentage}%)</span>
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500">
                        Thang 10: <span className="font-bold text-slate-800">{item.score10}</span>
                      </p>
                    </div>

                    <Link
                      to="/lms/assignments"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
                    >
                      Xem lại bài
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
