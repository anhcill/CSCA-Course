import { useOutletContext, useParams } from "react-router-dom";
import ClassPendingTasksCard from "../components/overview/ClassPendingTasksCard";
import ClassProgressCard from "../components/overview/ClassProgressCard";
import ClassChaptersCard from "../components/overview/ClassChaptersCard";

export default function CourseWorkspaceOverviewPage() {
  const { courseId, classId } = useParams();
  const workspace = useOutletContext();
  const {
    progress = {},
    assignments = [],
    selectedClass = {}
  } = workspace;

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const totalLessons = Number(progress.totalLessons || 0);
  const completedLessons = Number(progress.completedLessons || 0);
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));

  // Việc cần hoàn thành (Bài tập / Quiz chưa làm hoặc trễ hạn)
  const pendingTasks = assignments
    .filter((item) => ["todo", "late"].includes(item.status))
    .slice(0, 4);

  return (
    <div className="space-y-6 pb-10 transition-colors duration-200">
      <ClassChaptersCard classId={classId} basePath={basePath} />

      {/* MAIN 2 COLUMNS: Việc cần làm & Tiến độ học tập */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ClassPendingTasksCard
          pendingTasks={pendingTasks}
          basePath={basePath}
        />

        <ClassProgressCard
          percent={percent}
          completedLessons={completedLessons}
          totalLessons={totalLessons}
        />
      </div>

      {selectedClass.description && (
        <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <h2 className="mb-2 font-bold text-slate-900 dark:text-white">Thông báo lớp {selectedClass.title || ""}</h2>
          <p className="whitespace-pre-line">{selectedClass.description}</p>
        </section>
      )}
    </div>
  );
}
