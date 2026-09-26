import { useOutletContext, useParams } from "react-router-dom";
import ClassNextSessionHero from "../components/overview/ClassNextSessionHero";
import ClassPendingTasksCard from "../components/overview/ClassPendingTasksCard";
import ClassProgressCard from "../components/overview/ClassProgressCard";
import ClassMaterialsNoticesCard from "../components/overview/ClassMaterialsNoticesCard";

export default function CourseWorkspaceOverviewPage() {
  const { courseId, classId } = useParams();
  const workspace = useOutletContext();
  const {
    progress = {},
    sections = [],
    upcomingSessions = [],
    assignments = [],
    files = [],
    selectedClass = {}
  } = workspace;

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const totalLessons = Number(progress.totalLessons || 0);
  const completedLessons = Number(progress.completedLessons || 0);
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));

  // 1. Phân tích buổi học sắp tới
  const nextSession = upcomingSessions && upcomingSessions.length > 0 ? upcomingSessions[0] : null;
  const isTodaySession = Boolean(
    nextSession?.start_time &&
    new Date(nextSession.start_time).toDateString() === new Date().toDateString()
  );
  const otherSessions = upcomingSessions.slice(1, 3);

  // 2. Việc cần hoàn thành (Bài tập / Quiz chưa làm hoặc trễ hạn)
  const pendingTasks = assignments
    .filter((item) => ["todo", "late"].includes(item.status))
    .slice(0, 4);

  return (
    <div className="space-y-6 pb-10 transition-colors duration-200">
      {/* 1. HERO CARD: Hôm nay hoặc Buổi học tiếp theo */}
      <ClassNextSessionHero
        nextSession={nextSession}
        isTodaySession={isTodaySession}
        otherSessions={otherSessions}
        instructorName={selectedClass.instructor_name}
        classTitle={selectedClass.title}
        basePath={basePath}
      />

      {/* 2. MAIN 2 COLUMNS: Việc cần làm & Tiến độ học tập */}
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
