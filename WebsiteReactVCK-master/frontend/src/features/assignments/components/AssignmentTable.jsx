import React from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
} from "lucide-react";

export default function AssignmentTable({
  items = [],
  onAction,
}) {
  const getStatusBadge = (status) => {
    switch (status) {
      case "graded":
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 whitespace-nowrap">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Đã hoàn thành
          </span>
        );
      case "grading":
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 whitespace-nowrap">
            <Hourglass className="h-2.5 w-2.5" />
            Đang chấm
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 whitespace-nowrap">
            <AlertCircle className="h-2.5 w-2.5" />
            Quá hạn
          </span>
        );
      case "todo":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            Chưa nộp
          </span>
        );
    }
  };

  const getActionButton = (item) => {
    const status = item.normalizedStatus || "todo";
    if (status === "todo") {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, item.isQuiz ? "play" : "submit")}
          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 shadow-2xs transition hover:bg-blue-600 hover:text-white whitespace-nowrap"
        >
          {item.isQuiz ? "Làm bài" : "Nộp bài"}
        </button>
      );
    }
    if (status === "grading" || status === "submitted") {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, "view")}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 whitespace-nowrap"
        >
          Xem chi tiết
        </button>
      );
    }
    if (status === "graded" || status === "completed") {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, "review")}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 whitespace-nowrap"
        >
          {item.isQuiz ? "Xem lại" : "Xem bài"}
        </button>
      );
    }
    if (status === "overdue") {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, "open")}
          className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 shadow-2xs transition hover:bg-rose-600 hover:text-white whitespace-nowrap"
        >
          {item.isQuiz ? "Xem đề & đáp án" : "Xem bài"}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onAction && onAction(item, "view")}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 whitespace-nowrap"
      >
        Xem bài
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold text-slate-400">
              <th className="py-2 pl-3.5 pr-1.5 min-w-[160px]">Tiêu đề</th>
              <th className="py-2 px-1.5 min-w-[100px] max-w-[140px]">Khóa học</th>
              <th className="py-2 px-1.5 whitespace-nowrap min-w-[78px]">Hạn nộp</th>
              <th className="py-2 px-1.5 whitespace-nowrap min-w-[90px]">Trạng thái</th>
              <th className="py-2 px-1 text-center whitespace-nowrap min-w-[50px]">Điểm</th>
              <th className="py-2 pr-3 pl-1 text-right whitespace-nowrap min-w-[70px]">Thao tác</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100/90 text-xs">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                  Không tìm thấy bài tập hoặc bài kiểm tra nào.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const Icon = item.icon || FileText;

                return (
                  <tr
                    key={item.id}
                    className="transition hover:bg-blue-50/40"
                  >
                    {/* Tiêu đề & Loại bài tập */}
                    <td className="py-1.5 pl-3.5 pr-1.5 min-w-[160px] align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            item.iconStyle || "bg-blue-50 text-blue-600"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <h4
                            onClick={() => onAction && onAction(item, "open")}
                            className="font-bold text-[11px] leading-snug text-slate-900 transition hover:text-blue-600 cursor-pointer line-clamp-1 sm:line-clamp-2"
                            title={item.title}
                          >
                            {item.title}
                          </h4>
                          <p className="text-[9px] font-medium text-slate-400 leading-tight">
                            {item.subTypeLabel || (item.isQuiz ? "Kiểm tra trên máy" : "Bài tập cá nhân")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Khóa học & Mã môn */}
                    <td className="py-1.5 px-1.5 min-w-[100px] max-w-[140px] align-middle">
                      <div className="min-w-0">
                        <p
                          className="font-semibold text-[11px] text-slate-800 leading-snug truncate"
                          title={item.courseTitle || "Khóa học CSCA"}
                        >
                          {item.courseTitle || "Khóa học CSCA"}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400 leading-tight truncate">
                          {item.courseCode || "CSCA101"}
                        </p>
                      </div>
                    </td>

                    {/* Hạn nộp & Giờ */}
                    <td className="py-1.5 px-1.5 whitespace-nowrap align-middle">
                      <div>
                        <p className="font-semibold text-[11px] text-slate-800 leading-snug">
                          {item.dueDateFormatted || "—"}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400 leading-tight">
                          {item.dueTimeFormatted || ""}
                        </p>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-1.5 px-1.5 whitespace-nowrap align-middle">
                      {getStatusBadge(item.normalizedStatus)}
                    </td>

                    {/* Điểm */}
                    <td className="py-1.5 px-1 text-center whitespace-nowrap align-middle">
                      <span className="font-bold text-[11px] text-slate-800">
                        {item.scoreDisplay || "-"}
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td className="py-1.5 pr-3 pl-1 text-right whitespace-nowrap align-middle">
                      {getActionButton(item)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
