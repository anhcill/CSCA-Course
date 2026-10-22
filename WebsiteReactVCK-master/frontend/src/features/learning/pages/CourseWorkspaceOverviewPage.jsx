import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import ClassWorkspaceHero from "../components/overview/ClassWorkspaceHero";
import ClassPendingTasksCard from "../components/overview/ClassPendingTasksCard";
import ClassProgressCard from "../components/overview/ClassProgressCard";
import ClassChaptersCard from "../components/overview/ClassChaptersCard";

export default function CourseWorkspaceOverviewPage() {
  const { courseId, classId } = useParams();
  const workspace = useOutletContext() || {};
  const {
    progress = {},
    assignments = [],
    selectedClass = {},
    upcomingSessions = [],
  } = workspace;

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const totalLessons = Number(progress.totalLessons || 0);
  const completedLessons = Number(progress.completedLessons || 0);
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));

  // Upcoming sessions
  const activeUpcomingSessions = useMemo(
    () =>
      (upcomingSessions || [])
        .filter((session) => session.status !== "cancelled" && new Date(session.end_time).getTime() > Date.now())
        .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()),
    [upcomingSessions]
  );
  const nextSession = activeUpcomingSessions[0] || (upcomingSessions && upcomingSessions[upcomingSessions.length - 1]) || null;
  const isTodaySession = Boolean(
    nextSession?.start_time && new Date(nextSession.start_time).toDateString() === new Date().toDateString()
  );

  // Việc cần hoàn thành (Bài tập / Quiz chưa làm hoặc trễ hạn)
  const pendingTasks = assignments
    .filter((item) => ["todo", "late"].includes(item.status))
    .slice(0, 4);

  return (
    <div className="space-y-5 pb-10">
      {/* Gộp thông tin Lớp, Giảng viên và Buổi học tiếp theo vào 1 Hero Card duy nhất */}
      <ClassWorkspaceHero
        classTitle={selectedClass.title}
        instructorName={selectedClass.instructor_name}
        percent={percent}
        nextSession={nextSession}
        isTodaySession={isTodaySession}
        otherSessions={activeUpcomingSessions.slice(1, 3)}
        basePath={basePath}
      />

      {/* Danh sách các chương và buổi học của lớp */}
      <ClassChaptersCard classId={classId} basePath={basePath} />

      {/* 2 Cột: Việc cần hoàn thành & Tiến độ học tập */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ClassPendingTasksCard pendingTasks={pendingTasks} basePath={basePath} />

        <ClassProgressCard
          percent={percent}
          completedLessons={completedLessons}
          totalLessons={totalLessons}
          unitType={progress.unitType || "sessions"}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
