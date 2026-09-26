import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileQuestion,
  FileText,
  Lock,
  Play,
  Users,
  Video
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import { fetchLiveClassSessions, getLiveSessionAccess } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";

const formatDateTime = (value) => {
  if (!value) return "Chưa xác định";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function SessionDetailPage() {
  const { courseId, classId, sessionId } = useParams();
  const { authUser } = useAuthContext();
  const isTeacher = isTeacherRole(authUser?.role);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchLiveClassSessions(classId);
      if (res?.success && Array.isArray(res.data)) {
        const found = res.data.find((s) => String(s.id) === String(sessionId));
        if (found) {
          setSession(found);
        } else {
          setError("Không tìm thấy thông tin buổi học này.");
        }
      } else {
        setError("Không thể tải thông tin lớp học.");
      }
    } catch (err) {
      setError(err.message || "Lỗi khi tải thông tin buổi học.");
    } finally {
      setLoading(false);
    }
  }, [classId, sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleJoin = async () => {
    if (!session) return;
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      }
      window.open(result.data.meetUrl, "_blank", "noopener,noreferrer");
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (err) {
      toast.error(err.message || "Không thể truy cập phòng học.");
    }
  };

  if (loading) {
    return <Loading loading={true} text="Đang mở buổi học..." fullScreen={false} className="min-h-[50vh] py-16" />;
  }

  if (error || !session) {
    return (
      <div className="py-12">
        <ErrorState title="Chưa thể mở buổi học" message={error} onRetry={loadSession} />
      </div>
    );
  }

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const now = Date.now();
  const start = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  const isLive = session.status === "live" || (now >= start && now <= end);
  const isJoinable = isLive || (start - now <= 15 * 60 * 1000);
  const isEnded = now > end;
  const isRescheduled = session.status === "rescheduled";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 transition-colors duration-200">
      {/* Breadcrumb quay lại */}
      <Link
        to={`${basePath}/calendar`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại lịch học
      </Link>

      {/* Header Banner buổi học */}
      <section className="overflow-hidden rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 sm:p-8 text-white shadow-lg dark:shadow-none">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
            <Video className="h-3.5 w-3.5" /> Buổi học trực tuyến
          </span>
          {isRescheduled && (
            <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-black text-white">
              Đã đổi lịch
            </span>
          )}
          {session.provider && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-blue-100">
              {session.provider}
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          {session.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-blue-100">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Clock className="h-4 w-4 text-blue-200" />
            {formatDateTime(session.start_time)} – {new Date(session.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {session.instructor_name && (
            <span>Giảng viên: <strong className="text-white">{session.instructor_name}</strong></span>
          )}
        </div>

        {/* 4 Nút hành động chuẩn Section 3.2.E */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isJoinable ? (
            <button
              type="button"
              onClick={handleJoin}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-black text-blue-700 shadow-md transition hover:bg-blue-50 active:scale-95"
            >
              <Play className="h-4 w-4" /> Vào lớp học ngay
            </button>
          ) : isEnded ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2.5 text-xs font-bold text-white">
              <CheckCircle2 className="h-4 w-4" /> Buổi học đã kết thúc
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2.5 text-xs font-bold text-white">
              <Lock className="h-4 w-4" /> Phòng mở trước 15 phút
            </span>
          )}

          <Link
            to={`${basePath}/materials`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20 transition border border-white/20"
          >
            <FileText className="h-4 w-4" /> Tài liệu buổi học
          </Link>

          <Link
            to={`${basePath}/assignments`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20 transition border border-white/20"
          >
            <CalendarDays className="h-4 w-4" /> Bài tập & Quiz
          </Link>

          {isTeacher && (
            <Link
              to={`/lms/teach/classes/${classId}/attendance`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/80 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 transition"
            >
              <Users className="h-4 w-4" /> Điểm danh
            </Link>
          )}
        </div>
      </section>

      {/* Nội dung chi tiết các khu vực học tập */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Nội dung buổi học
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {session.description || "Nội dung chi tiết của buổi học sẽ được giảng viên hướng dẫn trực tiếp trong buổi học trực tuyến."}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Ghi chú từ giáo viên
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {session.change_reason ? `Lưu ý thay đổi lịch: ${session.change_reason}` : "Học viên vui lòng chuẩn bị tài liệu và vào lớp đúng giờ."}
          </p>
        </section>
      </div>
    </div>
  );
}
