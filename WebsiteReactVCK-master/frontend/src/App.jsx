import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Unauthorized from "./pages/client/Unauthorized.jsx";
import Forbidden from "./pages/client/Forbidden.jsx";

// Public website pages
const Home = lazy(() => import("./pages/client/Home.jsx"));
const NotFound = lazy(() => import("./pages/client/NotFound.jsx"));
const Courses = lazy(() => import("./pages/client/Courses.jsx"));
const DetailCourse = lazy(() => import("./pages/client/DetailCourse.jsx"));
const Profile = lazy(() => import("./pages/client/Profile.jsx"));
const Post = lazy(() => import("./pages/client/Post.jsx"));
const PostDetail = lazy(() => import("./pages/client/PostDetail.jsx"));
const About = lazy(() => import("./pages/client/About.jsx"));
const Schedule = lazy(() => import("./pages/client/Schedule.jsx"));
const SelectCourse = lazy(() => import("./pages/client/SelectCourse.jsx"));
const SelectLevel = lazy(() => import("./pages/client/SelectLevel.jsx"));
const PoliceAndLegal = lazy(() => import("./pages/client/PoliceAndLegal.jsx"));

// Admin pages

// Shared chrome and route policy
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
const StudentLmsLayout = lazy(() => import("./components/layouts/StudentLmsLayout.jsx"));
const TeacherLmsLayout = lazy(() => import("./components/layouts/TeacherLmsLayout.jsx"));
import LmsRouteGuard from "./components/LmsRouteGuard.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { ThemeProvider } from "./context/ThemeContext";
import { LoadingProvider } from "./context/LoadingContext.jsx";
import { useAuthContext } from "./context/AuthContext.jsx";
import { TEACHER_ROLES, USER_ROLES, isTeacherRole } from "./constants/roles";
import SessionExpiredModal from "./components/auth/SessionExpiredModal.jsx";
import PwaInstallPrompt from "./components/common/PwaInstallPrompt.jsx";
import FirstTimeWelcomeModal from "./components/welcome/FirstTimeWelcomeModal.jsx";

// LMS feature pages
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const AdminUser = lazy(() => import("./pages/admin/AdminUser.jsx"));
const AdminClassesPage = lazy(() => import("./pages/admin/AdminClassesPage.jsx"));
const AdminPermissionsPage = lazy(() => import("./pages/admin/AdminPermissionsPage.jsx"));
const AdminSyncPage = lazy(() => import("./pages/admin/AdminSyncPage.jsx"));
const AdminAuditLogPage = lazy(() => import("./pages/admin/AdminAuditLogPage.jsx"));
const AdminCalendarPage = lazy(() => import("./features/admin/pages/AdminCalendarPage.jsx"));
const ClassroomPage = lazy(() => import("./features/learning/pages/ClassroomPage.jsx"));
const StudentCourseListPage = lazy(() => import("./features/learning/pages/StudentCourseListPage.jsx"));
const CourseClassListPage = lazy(() => import("./features/learning/pages/CourseClassListPage.jsx"));
const CourseWorkspaceLayout = lazy(() => import("./features/learning/components/CourseWorkspaceLayout.jsx"));
const CourseWorkspaceOverviewPage = lazy(() => import("./features/learning/pages/CourseWorkspaceOverviewPage.jsx"));
const CourseResultsPage = lazy(() => import("./features/learning/pages/CourseResultsPage.jsx"));
const StudentAnalyticsPage = lazy(() => import("./features/learning/pages/StudentAnalyticsPage.jsx"));
const AdminCurriculumPage = lazy(() => import("./features/admin/pages/AdminCurriculumPage.jsx"));
const ClassCalendarPage = lazy(() => import("./features/calendar/pages/ClassCalendarPage.jsx"));
const SessionDetailPage = lazy(() => import("./features/calendar/pages/SessionDetailPage.jsx"));
const LiveClassRoomPage = lazy(() => import("./features/liveClass/pages/LiveClassRoomPage.jsx"));
const AssignmentListPage = lazy(() => import("./features/assignments/pages/AssignmentListPage.jsx"));
const AssignmentSubmitPage = lazy(() => import("./features/assignments/pages/AssignmentSubmitPage.jsx"));
const QuizPlayerPage = lazy(() => import("./features/assignments/pages/QuizPlayerPage.jsx"));
const TeacherGradingPage = lazy(() => import("./features/assignments/pages/TeacherGradingPage.jsx"));
const TeacherHubPage = lazy(() => import("./features/teacher/pages/TeacherHubPage.jsx"));
const TeacherSchedulePage = lazy(() => import("./features/teacher/pages/TeacherSchedulePage.jsx"));
const TeacherAttendancePage = lazy(() => import("./features/teacher/pages/TeacherAttendancePage.jsx"));
const TeacherClassDetailPage = lazy(() => import("./features/teacher/pages/TeacherClassDetailPage.jsx"));
const TeacherClassCurriculumPage = lazy(() => import("./features/teacher/pages/TeacherClassCurriculumPage.jsx"));
const TeacherSessionWorkspacePage = lazy(() => import("./features/teacher/pages/TeacherSessionWorkspacePage.jsx"));
const TeacherStudentProgressPage = lazy(() => import("./features/teacher/pages/TeacherStudentProgressPage.jsx"));
const AttendanceReviewPage = lazy(() => import("./features/teacher/pages/AttendanceReviewPage.jsx"));
const AttendanceReportPage = lazy(() => import("./pages/admin/AttendanceReportPage.jsx"));
const AdminGradesReportPage = lazy(() => import("./pages/admin/AdminGradesReportPage.jsx"));
const AdminTeacherSalaryPage = lazy(() => import("./features/admin/pages/AdminTeacherSalaryPage.jsx"));
const TeacherSalaryPage = lazy(() => import("./features/teacher/pages/TeacherSalaryPage.jsx"));
const QuestionBankPage = lazy(() => import("./features/teacher/pages/QuestionBankPage.jsx"));
const StudentSupportPage = lazy(() => import("./features/teacher/pages/StudentSupportPage.jsx"));
const StudentFilesPage = lazy(() => import("./features/learning/pages/StudentFilesPage.jsx"));
const TeacherFilesPage = lazy(() => import("./features/teacher/pages/TeacherFilesPage.jsx"));
const TeacherQuizPage = lazy(() => import("./features/teacher/pages/TeacherQuizPage.jsx"));
const NotificationCenterPage = lazy(() => import("./features/notifications/pages/NotificationCenterPage.jsx"));
const StudentRecordingsPage = lazy(() => import("./features/learning/pages/StudentRecordingsPage.jsx"));
const AdminRecordingsPage = lazy(() => import("./pages/admin/AdminRecordingsPage.jsx"));
const AdminWelcomeScreenPage = lazy(() => import("./pages/admin/AdminWelcomeScreenPage.jsx"));

const isTeacherLmsPath = (p) => (
  p === "/lms/teach" || p.startsWith("/lms/teach/") || p === "/lms/teacher-hub" ||
  p.startsWith("/lms/teacher/") || p.startsWith("/lms/admin/")
);

const isSharedTeacherPath = (pathname, authUser) => (
  (pathname === "/lms/live-schedule" || pathname.startsWith("/lms/live-room/"))
  && isTeacherRole(authUser?.role)
);

function CourseClassRedirect() {
  const { courseId } = useParams();
  return <Navigate to={`/lms/courses/${courseId}/classes`} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center px-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Đang tải không gian học tập...</div>}>
    <Routes>
      {/* === Public website === */}
      <Route path="/" element={<Home />} />
      <Route path="/rank" element={<Navigate to={{ pathname: "/", hash: "#bang-xep-hang" }} replace />} />
      <Route path="/courses" element={<Courses />} />
      <Route path="/post" element={<Post />} />
      <Route path="/about" element={<About />} />
      <Route path="/policy-and-legal" element={<PoliceAndLegal />} />
      <Route path="/post/:id" element={<PostDetail />} />
      <Route path="/detail-course/:id" element={<ProtectedRoute><DetailCourse /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/select-course" element={<ProtectedRoute><SelectCourse /></ProtectedRoute>} />
      <Route path="/select-level" element={<ProtectedRoute><SelectLevel /></ProtectedRoute>} />
      <Route path="/shedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />

      {/* === Student LMS === */}
      <Route path="/lms" element={<Navigate to="/lms/my-learning" replace />} />
      <Route path="/lms/my-learning" element={<StudentCourseListPage />} />
      <Route path="/lms/catalog" element={<Navigate to="/lms/my-learning" replace />} />
      <Route path="/lms/dashboard" element={<Navigate to="/lms/my-learning" replace />} />
      <Route path="/lms/analytics" element={<StudentAnalyticsPage />} />
      <Route path="/lms/live-schedule" element={<ClassCalendarPage />} />
      <Route path="/lms/live-room/:sessionId" element={<LiveClassRoomPage />} />
      <Route path="/lms/calendar" element={<ClassCalendarPage />} />
      <Route path="/lms/live-classes" element={<Navigate to="/lms/live-schedule" replace />} />
      <Route path="/lms/assignments" element={<AssignmentListPage />} />
      <Route path="/lms/files" element={<StudentFilesPage />} />
      <Route path="/lms/recordings" element={<StudentRecordingsPage />} />
      <Route path="/lms/materials" element={<StudentFilesPage />} />
      <Route path="/lms/notifications" element={<NotificationCenterPage />} />
      <Route path="/lms/courses/:courseId" element={<CourseClassListPage />} />
      <Route path="/lms/courses/:courseId/classes" element={<CourseClassListPage />} />
      <Route path="/lms/courses/:courseId/classes/:classId" element={<CourseWorkspaceLayout />}>
        <Route index element={<CourseWorkspaceOverviewPage />} />
        <Route path="overview" element={<CourseWorkspaceOverviewPage />} />
        <Route path="learn" element={<ClassroomPage />} />
        <Route path="calendar" element={<ClassCalendarPage />} />
        <Route path="schedule" element={<Navigate to="calendar" replace />} />
        <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="assignments" element={<AssignmentListPage />} />
        <Route path="assignments/:id/submit" element={<AssignmentSubmitPage />} />
        <Route path="quizzes/:quizId" element={<QuizPlayerPage />} />
        <Route path="materials" element={<StudentFilesPage />} />
        <Route path="files" element={<StudentFilesPage />} />
        <Route path="results" element={<CourseResultsPage />} />
      </Route>
      <Route path="/lms/courses/:courseId/workspace" element={<CourseClassRedirect />} />
      <Route path="/lms/courses/:slug" element={<Navigate to="/lms/my-learning" replace />} />
      <Route path="/lms/learn/:courseId" element={<CourseClassRedirect />} />
      <Route path="/lms/assignment/:id/submit" element={<AssignmentSubmitPage />} />
      <Route path="/lms/quiz/:quizId" element={<QuizPlayerPage />} />
      <Route path="/lms/leaderboard" element={<Navigate to="/lms/my-learning" replace />} />
      <Route path="/lms/certificates" element={<Navigate to="/profile" replace />} />

      {/* === Teacher LMS: canonical routes plus migration aliases === */}
      <Route path="/lms/teach" element={<TeacherHubPage />} />
      <Route path="/lms/teach/salary" element={<TeacherSalaryPage />} />
      <Route path="/lms/teach/classes" element={<TeacherSchedulePage />} />
      <Route path="/lms/teach/classes/:classId" element={<TeacherClassDetailPage />} />
      <Route path="/lms/teach/classes/:classId/curriculum" element={<TeacherClassCurriculumPage />} />
      <Route path="/lms/teach/classes/:classId/sessions/:sessionId" element={<TeacherSessionWorkspacePage />} />
      <Route path="/lms/teach/classes/:classId/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teach/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teach/student-progress" element={<TeacherStudentProgressPage />} />
      <Route path="/lms/teach/attendance-review" element={<AttendanceReviewPage />} />
      <Route path="/lms/teach/question-bank" element={<QuestionBankPage />} />
      <Route path="/lms/teach/support" element={<StudentSupportPage />} />
      <Route path="/lms/teach/calendar" element={<ClassCalendarPage />} />
      <Route path="/lms/teacher-hub" element={<Navigate to="/lms/teach" replace />} />
      <Route path="/lms/teacher/schedule" element={<Navigate to="/lms/teach/calendar" replace />} />
      <Route path="/lms/teacher/classes" element={<Navigate to="/lms/teach/classes" replace />} />
      <Route path="/lms/teacher/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teacher/classes/:classId/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teacher/curriculum" element={<Navigate to="/lms/teach/classes" replace />} />
      <Route path="/lms/teach/files" element={<TeacherFilesPage />} />
      <Route path="/lms/teacher/files" element={<Navigate to="/lms/teach/files" replace />} />
      <Route path="/lms/teacher/grading" element={<TeacherGradingPage />} />
      <Route path="/lms/teacher/quizzes" element={<TeacherQuizPage />} />
      <Route path="/lms/admin/curriculum" element={<Navigate to="/admin/curriculum" replace />} />
      <Route path="/lms/admin/grading" element={<Navigate to="/admin/grading" replace />} />
      <Route path="/lms/admin/courses" element={<Navigate to="/admin/courses" replace />} />
      <Route path="/lms/admin/classes" element={<Navigate to="/admin/classes" replace />} />
      <Route path="/lms/admin/calendar" element={<Navigate to="/admin/calendar" replace />} />
      <Route path="/lms/admin/operations" element={<Navigate to="/admin/sync" replace />} />

      {/* === Admin console === */}
      <Route path="/admin" element={<LmsRouteGuard allowedRoles={[USER_ROLES.ADMIN]}><AdminLayout /></LmsRouteGuard>}>
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="courses" element={<Navigate to="/admin/curriculum" replace />} />
        <Route path="courses/:courseId/lessons" element={<Navigate to="/admin/curriculum" replace />} />
        <Route path="lessons/:lessonId/exercises" element={<Navigate to="/admin/curriculum" replace />} />
        <Route path="curriculum" element={<AdminCurriculumPage />} />
        <Route path="files" element={<TeacherFilesPage />} />
        <Route path="grading" element={<TeacherGradingPage />} />
        <Route path="quizzes" element={<TeacherQuizPage />} />
        <Route path="attendance-review" element={<AttendanceReviewPage />} />
        <Route path="attendance-report" element={<AttendanceReportPage />} />
        <Route path="grades-report" element={<AdminGradesReportPage />} />
        <Route path="salaries" element={<AdminTeacherSalaryPage />} />
        <Route path="teacher-salaries" element={<Navigate to="/admin/salaries" replace />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="student-progress" element={<TeacherStudentProgressPage />} />
        <Route path="support" element={<StudentSupportPage />} />
        <Route path="classes" element={<AdminClassesPage />} />
        <Route path="classes/:classId" element={<TeacherClassDetailPage />} />
        <Route path="classes/:classId/curriculum" element={<TeacherClassCurriculumPage />} />
        <Route path="classes/:classId/sessions/:sessionId" element={<TeacherSessionWorkspacePage />} />
        <Route path="classes/:classId/attendance" element={<TeacherAttendancePage />} />
        <Route path="calendar" element={<AdminCalendarPage />} />
        <Route path="recordings" element={<AdminRecordingsPage />} />
        <Route path="permissions" element={<AdminPermissionsPage />} />
        <Route path="sync" element={<AdminSyncPage />} />
        <Route path="audit-logs" element={<AdminAuditLogPage />} />
        <Route path="welcome-screen" element={<AdminWelcomeScreenPage />} />
        <Route path="users" element={<AdminUser />} />
        <Route path="posts" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

function AppContent() {
  const { authUser, sessionExpired, dismissSessionExpired } = useAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLiveRoomPage = pathname.startsWith("/lms/live-room/");
  const isLmsPage = pathname === "/lms" || pathname.startsWith("/lms/");
  const isTeacherPage = isTeacherLmsPath(pathname) || isSharedTeacherPath(pathname, authUser);

  const isEligibleForWelcome = Boolean(
    authUser && (authUser.role === USER_ROLES.TEACHER || authUser.role === USER_ROLES.STUDENT)
  );
  const shouldShowWelcome = isEligibleForWelcome && !authUser.hasSeenWelcome;

  if (shouldShowWelcome) {
    return (
      <div className="fixed inset-0 z-[9999] h-screen w-screen overflow-hidden bg-slate-950">
        <Toaster position="top-center" reverseOrder={false} />
        <FirstTimeWelcomeModal />
      </div>
    );
  }

  if (isLiveRoomPage) {
    return (
      <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-slate-950">
        <Toaster position="top-center" reverseOrder={false} />
        <LmsRouteGuard allowedRoles={[...TEACHER_ROLES, USER_ROLES.STUDENT]}>
          <AppRoutes />
        </LmsRouteGuard>
        <SessionExpiredModal
          isOpen={sessionExpired}
          onClose={dismissSessionExpired}
          onLoginAgain={() => {
            dismissSessionExpired();
            navigate("/", { replace: true, state: { openAuthModal: "login" } });
          }}
        />
      </div>
    );
  }

  if (isLmsPage) {
    const Layout = isTeacherPage ? TeacherLmsLayout : StudentLmsLayout;
    const allowedRoles = isTeacherPage ? TEACHER_ROLES : [USER_ROLES.STUDENT];

    // Teacher/admin accounts live exclusively in the teaching workspace. They
    // do not inherit the student dashboard or its navigation by role alone.
    if (!isTeacherPage && isTeacherRole(authUser?.role)) {
      return <Navigate to="/lms/teach" replace />;
    }

    return (
      <div className="min-h-screen">
        <Toaster position="top-center" reverseOrder={false} />
        <LmsRouteGuard allowedRoles={allowedRoles}>
          <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center px-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Đang tải không gian học tập...</div>}>
            <Layout>
              <AppRoutes />
            </Layout>
          </Suspense>
        </LmsRouteGuard>
        <PwaInstallPrompt />
        <SessionExpiredModal
          isOpen={sessionExpired}
          onClose={dismissSessionExpired}
          onLoginAgain={() => {
            dismissSessionExpired();
            navigate("/", { replace: true, state: { openAuthModal: "login" } });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {!isAdminPage && <Navbar />}
      <Toaster position="top-center" reverseOrder={false} />
      <main className={`flex-grow ${isAdminPage ? "" : "pt-16 xl:pt-[108px]"}`}>
        <AppRoutes />
      </main>
      {!isAdminPage && <Footer />}
      <PwaInstallPrompt />
      <SessionExpiredModal
        isOpen={sessionExpired}
        onClose={dismissSessionExpired}
        onLoginAgain={() => {
          dismissSessionExpired();
          navigate("/", { replace: true, state: { openAuthModal: "login" } });
        }}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LoadingProvider>
        <AppContent />
      </LoadingProvider>
    </ThemeProvider>
  );
}

export default App;
