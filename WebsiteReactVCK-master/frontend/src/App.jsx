import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "react-hot-toast";

// Public website pages
import Home from "./pages/client/Home.jsx";
import Rank from "./pages/client/Rank.jsx";
import NotFound from "./pages/client/NotFound.jsx";
import Courses from "./pages/client/Courses.jsx";
import DetailCourse from "./pages/client/DetailCourse.jsx";
import Profile from "./pages/client/Profile.jsx";
import Post from "./pages/client/Post.jsx";
import PostDetail from "./pages/client/PostDetail.jsx";
import About from "./pages/client/About.jsx";
import Schedule from "./pages/client/Schedule.jsx";
import SelectCourse from "./pages/client/SelectCourse.jsx";
import SelectLevel from "./pages/client/SelectLevel.jsx";
import PoliceAndLegal from "./pages/client/PoliceAndLegal.jsx";
import Unauthorized from "./pages/client/Unauthorized.jsx";
import Forbidden from "./pages/client/Forbidden.jsx";

// Admin pages
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import AdminCourses from "./pages/admin/AdminCourses.jsx";
import AdminLessons from "./pages/admin/AdminLessons.jsx";
import AdminExercises from "./pages/admin/AdminExercises.jsx";
import AdminUser from "./pages/admin/AdminUser.jsx";
import AdminPost from "./pages/admin/AdminPost.jsx";
import AdminClassesPage from "./pages/admin/AdminClassesPage.jsx";
import AdminPermissionsPage from "./pages/admin/AdminPermissionsPage.jsx";
import AdminSyncPage from "./pages/admin/AdminSyncPage.jsx";
import AdminAuditLogPage from "./pages/admin/AdminAuditLogPage.jsx";

// Shared chrome and route policy
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import StudentLmsLayout from "./components/layouts/StudentLmsLayout.jsx";
import TeacherLmsLayout from "./components/layouts/TeacherLmsLayout.jsx";
import LmsRouteGuard from "./components/LmsRouteGuard.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { ThemeProvider } from "./context/ThemeContext";
import { useAuthContext } from "./context/AuthContext.jsx";
import { LMS_ROLES, TEACHER_ROLES, USER_ROLES, isTeacherRole } from "./constants/roles";
import SessionExpiredModal from "./components/auth/SessionExpiredModal.jsx";

// LMS feature pages
import ClassroomPage from "./features/learning/pages/ClassroomPage.jsx";
import StudentCourseListPage from "./features/learning/pages/StudentCourseListPage.jsx";
import CourseClassListPage from "./features/learning/pages/CourseClassListPage.jsx";
import CourseWorkspaceLayout from "./features/learning/components/CourseWorkspaceLayout.jsx";
import CourseWorkspaceOverviewPage from "./features/learning/pages/CourseWorkspaceOverviewPage.jsx";
import CourseResultsPage from "./features/learning/pages/CourseResultsPage.jsx";
import AdminCurriculumPage from "./features/admin/pages/AdminCurriculumPage.jsx";
import LiveClassSchedulePage from "./features/liveClass/pages/LiveClassSchedulePage.jsx";
import AssignmentListPage from "./features/assignments/pages/AssignmentListPage.jsx";
import AssignmentSubmitPage from "./features/assignments/pages/AssignmentSubmitPage.jsx";
import QuizPlayerPage from "./features/assignments/pages/QuizPlayerPage.jsx";
import TeacherGradingPage from "./features/assignments/pages/TeacherGradingPage.jsx";
import LeaderboardPage from "./features/gamification/pages/LeaderboardPage.jsx";
import CertificatePage from "./features/certificates/pages/CertificatePage.jsx";
import TeacherHubPage from "./features/admin/pages/TeacherHubPage.jsx";
import TeacherSchedulePage from "./features/teacher/pages/TeacherSchedulePage.jsx";
import TeacherAttendancePage from "./features/teacher/pages/TeacherAttendancePage.jsx";
import TeacherClassDetailPage from "./features/teacher/pages/TeacherClassDetailPage.jsx";
import StudentFilesPage from "./features/learning/pages/StudentFilesPage.jsx";
import TeacherQuizPage from "./features/teacher/pages/TeacherQuizPage.jsx";
import NotificationCenterPage from "./features/notifications/pages/NotificationCenterPage.jsx";

const isTeacherLmsPath = (pathname) => (
  pathname === "/lms/teacher-hub" ||
  pathname.startsWith("/lms/teacher/") ||
  pathname === "/lms/admin/curriculum" ||
  pathname === "/lms/admin/grading"
);

const isSharedTeacherPath = (pathname, authUser) => (
  pathname === "/lms/live-schedule" && isTeacherRole(authUser?.role)
);

function CourseClassRedirect() {
  const { courseId } = useParams();
  return <Navigate to={`/lms/courses/${courseId}/classes`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* === Public website === */}
      <Route path="/" element={<Home />} />
      <Route path="/rank" element={<Rank />} />
      <Route path="/courses" element={<Courses />} />
      <Route path="/post" element={<Post />} />
      <Route path="/about" element={<About />} />
      <Route path="/policy-and-legal" element={<PoliceAndLegal />} />
      <Route path="/post/:id" element={<PostDetail />} />
      <Route path="/detail-course/:id" element={
        <ProtectedRoute>
          <DetailCourse />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      } />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/forbidden" element={<Forbidden />} />

      {/* Legacy authenticated website routes */}
      <Route path="/select-course" element={
        <ProtectedRoute><SelectCourse /></ProtectedRoute>
      } />
      <Route path="/select-level" element={
        <ProtectedRoute><SelectLevel /></ProtectedRoute>
      } />
      <Route path="/shedule" element={
        <ProtectedRoute><Schedule /></ProtectedRoute>
      } />

      {/* === Student LMS === */}
      <Route path="/lms" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/catalog" element={<StudentCourseListPage />} />
      <Route path="/lms/courses/:courseId/classes" element={<CourseClassListPage />} />
      <Route path="/lms/courses/:courseId/classes/:classId" element={<CourseWorkspaceLayout />}>
        <Route index element={<CourseWorkspaceOverviewPage />} />
        <Route path="learn" element={<ClassroomPage />} />
        <Route path="assignments" element={<AssignmentListPage />} />
        <Route path="assignments/:id/submit" element={<AssignmentSubmitPage />} />
        <Route path="quizzes/:quizId" element={<QuizPlayerPage />} />
        <Route path="schedule" element={<LiveClassSchedulePage />} />
        <Route path="files" element={<StudentFilesPage />} />
        <Route path="results" element={<CourseResultsPage />} />
      </Route>
      <Route path="/lms/courses/:courseId/workspace" element={<CourseClassRedirect />} />
      <Route path="/lms/courses/:slug" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/learn/:courseId" element={<CourseClassRedirect />} />
      {/* Legacy entry: the LMS now always begins with the course catalog. */}
      <Route path="/lms/my-learning" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/live-schedule" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/assignments" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/assignment/:id/submit" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/quiz/:quizId" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/leaderboard" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/certificates" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/files" element={<Navigate to="/lms/catalog" replace />} />
      <Route path="/lms/notifications" element={<Navigate to="/lms/catalog" replace />} />

      {/* === Teacher LMS: canonical routes plus migration aliases === */}
      <Route path="/lms/teacher-hub" element={<TeacherHubPage />} />
      <Route path="/lms/teacher/schedule" element={<TeacherSchedulePage />} />
      <Route path="/lms/teacher/classes" element={<TeacherSchedulePage />} />
      <Route path="/lms/teacher/classes/:classId" element={<TeacherClassDetailPage />} />
      <Route path="/lms/teacher/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teacher/classes/:classId/attendance" element={<TeacherAttendancePage />} />
      <Route path="/lms/teacher/curriculum" element={<AdminCurriculumPage />} />
      <Route path="/lms/teacher/grading" element={<TeacherGradingPage />} />
      <Route path="/lms/teacher/quizzes" element={<TeacherQuizPage />} />
      <Route path="/lms/admin/curriculum" element={<AdminCurriculumPage />} />
      <Route path="/lms/admin/grading" element={<TeacherGradingPage />} />

      {/* === Admin console === */}
      <Route path="/admin" element={
        <LmsRouteGuard allowedRoles={[USER_ROLES.ADMIN]}>
          <AdminLayout />
        </LmsRouteGuard>
      }>
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="courses/:courseId/lessons" element={<AdminLessons />} />
        <Route path="lessons/:lessonId/exercises" element={<AdminExercises />} />
        <Route path="classes" element={<AdminClassesPage />} />
        <Route path="permissions" element={<AdminPermissionsPage />} />
        <Route path="sync" element={<AdminSyncPage />} />
        <Route path="audit-logs" element={<AdminAuditLogPage />} />
        <Route path="users" element={<AdminUser />} />
        <Route path="posts" element={<AdminPost />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppContent() {
  const { authUser, sessionExpired, dismissSessionExpired } = useAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLmsPage = pathname === "/lms" || pathname.startsWith("/lms/");
  const isTeacherPage = isTeacherLmsPath(pathname) || isSharedTeacherPath(pathname, authUser);

  if (isLmsPage) {
    const Layout = isTeacherPage ? TeacherLmsLayout : StudentLmsLayout;
    const allowedRoles = isTeacherPage ? TEACHER_ROLES : LMS_ROLES;

    return (
      <div className="min-h-screen">
        <Toaster position="top-center" reverseOrder={false} />
        <LmsRouteGuard allowedRoles={allowedRoles}>
          <Layout>
            <AppRoutes />
          </Layout>
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

  return (
    <div className="flex flex-col min-h-screen">
      {!isAdminPage && <Navbar />}
      <Toaster position="top-center" reverseOrder={false} />
      <main className={`flex-grow ${isAdminPage ? "" : "pt-16 xl:pt-[108px]"}`}>
        <AppRoutes />
      </main>
      {!isAdminPage && <Footer />}
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
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
