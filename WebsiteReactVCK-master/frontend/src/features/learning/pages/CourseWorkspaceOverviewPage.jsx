import { useOutletContext, useParams } from "react-router-dom";
import ClassPendingTasksCard from "../components/overview/ClassPendingTasksCard";
import ClassProgressCard from "../components/overview/ClassProgressCard";
import ClassMaterialsNoticesCard from "../components/overview/ClassMaterialsNoticesCard";

export default function CourseWorkspaceOverviewPage() {
  const { courseId, classId } = useParams();
  const workspace = useOutletContext();
  const {
    progress = {},
    sections = [],
    assignments = [],
    files = [],
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
          sections={sections}
          basePath={basePath}
        />
      </div>

      {/* 3. TÀI LIỆU & THÔNG BÁO CỦA LỚP */}
      <ClassMaterialsNoticesCard
        files={files}
        classNotice={selectedClass.description}
        classTitle={selectedClass.title}
        basePath={basePath}
      />
    </div>
  );
}
