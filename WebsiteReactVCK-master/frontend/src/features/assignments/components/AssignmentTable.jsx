import {
  AlertCircle,
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
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-400 whitespace-nowrap">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Đã hoàn thành
          </span>
        );
      case "grading":
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-400 whitespace-nowrap">
            <Hourglass className="h-2.5 w-2.5" />
            Đang chấm
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-400 whitespace-nowrap">
            <AlertCircle className="h-2.5 w-2.5" />
            Quá hạn
          </span>
        );
      case "todo":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-400 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            Chưa nộp
          </span>
        );
    }
  };

  const getItemStatusBadge = (item) => {
    if (item.isInProgress) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-400 whitespace-nowrap">
          <Clock className="h-2.5 w-2.5" />
          Đang làm
        </span>
      );
    }
    if (item.canRetry) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-400 whitespace-nowrap">
          <Clock className="h-2.5 w-2.5" />
          Còn {Math.max(0, item.attemptLimit - item.attemptCount)} lượt
        </span>
      );
    }
    if (item.canResubmit) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-400 whitespace-nowrap">
          <Clock className="h-2.5 w-2.5" />
          Được nộp lại
        </span>
      );
    }
    return getStatusBadge(item.normalizedStatus);
  };

  const getDeadlineHintClass = (tone) => {
    if (tone === "overdue" || tone === "urgent") {
      return "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300";
    }
    if (tone === "soon") {
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300";
    }
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300";
  };

  const getActionButton = (item, mobile = false) => {
    const status = item.normalizedStatus || "todo";
    const sizeCls = mobile ? "px-3.5 py-1.5 text-xs" : "px-3 py-1 text-[10px]";
    const secondarySizeCls = mobile ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[10px]";

    if (item.isInProgress || item.canRetry || item.canResubmit) {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, item.isQuiz ? "play" : "submit")}
          className={`rounded-lg border border-blue-200 bg-blue-50 ${sizeCls} font-bold text-blue-600 shadow-2xs transition hover:bg-blue-600 hover:text-white dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white whitespace-nowrap`}
        >
          {item.isInProgress ? "Tiếp tục" : item.isQuiz ? "Làm lại" : "Nộp lại"}
        </button>
      );
    }
    if (status === "todo") {
      return (
        <button
          type="button"
          onClick={() => onAction && onAction(item, item.isQuiz ? "play" : "submit")}
          className={`rounded-lg bg-blue-600 ${sizeCls} font-bold text-white shadow-2xs transition hover:bg-blue-500 whitespace-nowrap`}
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
          className={`rounded-lg border border-slate-200 bg-white ${secondarySizeCls} font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400 whitespace-nowrap`}
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
          className={`rounded-lg border border-slate-200 bg-white ${secondarySizeCls} font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400 whitespace-nowrap`}
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
          className={`rounded-lg border border-rose-200 bg-rose-50 ${secondarySizeCls} font-bold text-rose-700 shadow-2xs transition hover:bg-rose-600 hover:text-white dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-600 dark:hover:text-white whitespace-nowrap`}
        >
          {item.isQuiz ? "Xem đề & đáp án" : "Xem bài"}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onAction && onAction(item, "view")}
        className={`rounded-lg border border-slate-200 bg-white ${secondarySizeCls} font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400 whitespace-nowrap`}
      >
        Xem bài
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      {/* Mobile Card List (< sm): Zero horizontal scrolling, thumb-friendly CTAs */}
      <div className="divide-y divide-slate-100/90 dark:divide-slate-800/80 sm:hidden">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
            Không tìm thấy bài tập hoặc bài kiểm tra nào.
          </div>
        ) : (
          items.map((item) => {
            const Icon = item.icon || FileText;
            return (
              <div
                key={item.id}
                className="space-y-2.5 p-3.5 transition hover:bg-blue-50/30 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      item.iconStyle || "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {getItemStatusBadge(item)}
                      {item.deadlineHint && (
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none ${getDeadlineHintClass(item.deadlineTone)}`}>
                          {item.deadlineHint}
                        </span>
                      )}
                    </div>
                    <h4
                      onClick={() => onAction && onAction(item, "open")}
                      className="mt-1 cursor-pointer break-words text-sm font-bold leading-snug text-slate-900 transition hover:text-blue-600 dark:text-white dark:hover:text-sky-300"
                    >
                      {item.title}
                    </h4>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {item.courseTitle || "Khóa học CSCA"}
                      {item.courseCode ? ` · ${item.courseCode}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100/80 pt-2.5 dark:border-slate-800/80">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Hạn: {item.dueDateFormatted || "—"}
                    </span>
                    {item.dueTimeFormatted ? ` · ${item.dueTimeFormatted}` : ""}
                    {item.scoreDisplay && item.scoreDisplay !== "-" && (
                      <span className="ml-2 font-black text-emerald-600 dark:text-emerald-400">
                        Điểm: {item.scoreDisplay}
                      </span>
                    )}
                  </div>
                  {getActionButton(item, true)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop / Tablet Table (>= sm) */}
      <div className="hidden overflow-x-auto [scrollbar-width:thin] sm:block">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <th className="py-2 pl-3.5 pr-1.5 min-w-[160px]">Tiêu đề</th>
              <th className="py-2 px-1.5 min-w-[100px] max-w-[140px]">Khóa học</th>
              <th className="py-2 px-1.5 whitespace-nowrap min-w-[95px]">Hạn nộp</th>
              <th className="py-2 px-1.5 whitespace-nowrap min-w-[90px]">Trạng thái</th>
              <th className="py-2 px-1 text-center whitespace-nowrap min-w-[50px]">Điểm</th>
              <th className="py-2 pr-3 pl-1 text-right whitespace-nowrap min-w-[76px]">Thao tác</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100/90 text-xs dark:divide-slate-800/80">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                  Không tìm thấy bài tập hoặc bài kiểm tra nào.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const Icon = item.icon || FileText;

                return (
                  <tr
                    key={item.id}
                    className="transition hover:bg-blue-50/40 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2 pl-3.5 pr-1.5 min-w-[160px] align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            item.iconStyle || "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <h4
                            onClick={() => onAction && onAction(item, "open")}
                            className="font-bold text-[11px] leading-snug text-slate-900 dark:text-white transition hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer line-clamp-1 sm:line-clamp-2"
                            title={item.title}
                          >
                            {item.title}
                          </h4>
                          <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 leading-tight">
                            {item.subTypeLabel || (item.isQuiz ? "Kiểm tra trên máy" : "Bài tập cá nhân")}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-2 px-1.5 min-w-[100px] max-w-[140px] align-middle">
                      <div className="min-w-0">
                        <p
                          className="font-semibold text-[11px] text-slate-800 dark:text-slate-200 leading-snug truncate"
                          title={item.courseTitle || "Khóa học CSCA"}
                        >
                          {item.courseTitle || "Khóa học CSCA"}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 leading-tight truncate">
                          {item.courseCode || "CSCA101"}
                        </p>
                      </div>
                    </td>

                    <td className="py-2 px-1.5 whitespace-nowrap align-middle">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[11px] text-slate-800 dark:text-slate-200 leading-snug">
                          {item.dueDateFormatted || "—"}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {item.dueTimeFormatted && (
                            <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 leading-tight">
                              {item.dueTimeFormatted}
                            </span>
                          )}
                          {item.deadlineHint && (
                            <span className={`inline-flex items-center rounded border px-1 py-0.2 text-[9px] font-bold leading-tight ${getDeadlineHintClass(item.deadlineTone)}`}>
                              {item.deadlineHint}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-2 px-1.5 whitespace-nowrap align-middle">
                      {getItemStatusBadge(item)}
                    </td>

                    <td className="py-2 px-1 text-center whitespace-nowrap align-middle">
                      <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                        {item.scoreDisplay || "-"}
                      </span>
                    </td>

                    <td className="py-2 pr-3 pl-1 text-right whitespace-nowrap align-middle">
                      {getActionButton(item, false)}
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
