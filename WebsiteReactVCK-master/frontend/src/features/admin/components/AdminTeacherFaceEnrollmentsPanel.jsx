import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  Unlock,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAdminTeacherFaceEnrollments,
  reviewAdminTeacherFaceEnrollment,
} from "../../api/teacherFaceAttendanceClient";

const AwsFaceLivenessModal = lazy(() => import("../../teacher/components/AwsFaceLivenessModal.jsx"));

const STATUS_META = {
  pending_approval: {
    label: "Chờ duyệt",
    badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70",
    icon: Clock,
  },
  approved: {
    label: "Đã duyệt & khóa",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
    icon: Lock,
  },
  rejected: {
    label: "Đã từ chối",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70",
    icon: XCircle,
  },
  unlocked: {
    label: "Đã mở khóa",
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70",
    icon: Unlock,
  },
  not_enrolled: {
    label: "Chưa đăng ký",
    badge: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    icon: ShieldAlert,
  },
};

export default function AdminTeacherFaceEnrollmentsPanel({ onEnrollmentReviewed }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [aws, setAws] = useState(null);
  const [actingTeacherId, setActingTeacherId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [testModalOpen, setTestModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchAdminTeacherFaceEnrollments();
      setItems(res?.data?.enrollments || []);
      setAws(res?.data?.aws || null);
    } catch (error) {
      toast.error(error?.message || "Không thể tải danh sách khuôn mặt giảng viên");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (teacher, action) => {
    let note = "";
    if (action === "reject" || action === "unlock") {
      const promptText =
        action === "reject"
          ? "Nhập lý do từ chối ảnh mẫu (giảng viên sẽ thấy để chụp lại):"
          : "Ghi chú mở khóa (tùy chọn):";
      const entered = window.prompt(promptText, "");
      if (entered === null) return;
      note = entered;
    }

    try {
      setActingTeacherId(teacher.teacherId);
      const res = await reviewAdminTeacherFaceEnrollment(teacher.teacherId, { action, note });
      toast.success(res?.message || "Đã cập nhật trạng thái khuôn mặt giảng viên");
      await load();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
      onEnrollmentReviewed?.();
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật trạng thái");
    } finally {
      setActingTeacherId(null);
    }
  };

  const pendingCount = items.filter((item) => item.status === "pending_approval").length;

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Duyệt khuôn mặt gốc giảng viên (AWS Rekognition)
              </h2>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {pendingCount} chờ duyệt
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Khi Admin duyệt & khóa khuôn mặt mẫu, các buổi dạy sau đó áp dụng Cách 1 (đủ chấm công Vào + Ra hoặc Admin duyệt mới cộng lương).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aws && (
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                aws.configured
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : aws.mockMode
                    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300"
                    : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {aws.configured
                ? `AWS Rekognition sẵn sàng (${aws.region})`
                : aws.mockMode
                  ? `Chế độ Mock (${aws.region})`
                  : "Chưa điền AWS Key (.env)"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTestModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-700 transition"
            title="Chạy thử nhận diện khuôn mặt AWS Rekognition thật mà không ảnh hưởng bảng lương"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Test AWS Rekognition
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          Đang tải danh sách khuôn mặt giảng viên...
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Chưa có giảng viên nào.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((teacher) => {
            const meta = STATUS_META[teacher.status] || STATUS_META.not_enrolled;
            const MetaIcon = meta.icon;
            const busy = actingTeacherId === teacher.teacherId;

            return (
              <div
                key={teacher.teacherId}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="flex items-start gap-3">
                  {teacher.photoUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(teacher)}
                      className="shrink-0 overflow-hidden rounded-xl ring-2 ring-white dark:ring-slate-700 shadow-xs transition hover:scale-105"
                      title="Xem ảnh khuôn mặt mẫu"
                    >
                      <img
                        src={teacher.photoUrl}
                        alt={teacher.fullName}
                        className="h-14 w-14 object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                      <ScanFace className="h-6 w-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                      {teacher.fullName}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      @{teacher.username}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}
                    >
                      <MetaIcon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    {teacher.reviewNote && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        Ghi chú: {teacher.reviewNote}
                      </p>
                    )}
                  </div>
                </div>

                {teacher.status !== "not_enrolled" && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                    {teacher.status !== "approved" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(teacher, "approve")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt & Khóa
                      </button>
                    )}
                    {teacher.status === "pending_approval" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(teacher, "reject")}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Từ chối
                      </button>
                    )}
                    {teacher.status === "approved" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(teacher, "unlock")}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60"
                      >
                        <Unlock className="h-3.5 w-3.5" /> Mở khóa cho chụp lại
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {previewItem.fullName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Ảnh khuôn mặt gốc đăng ký chấm công</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <img
              src={previewItem.photoUrl}
              alt={previewItem.fullName}
              className="w-full rounded-2xl object-cover aspect-square bg-slate-100 dark:bg-slate-800"
            />
          </div>
        </div>
      )}

      {testModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-xs font-bold text-slate-700 shadow-xl dark:bg-slate-900 dark:text-slate-100">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                Đang mở bài test AWS Rekognition...
              </div>
            </div>
          }
        >
          <AwsFaceLivenessModal
            isOpen={testModalOpen}
            adminTestMode={true}
            sessionId={0}
            type="admin_test"
            onClose={() => setTestModalOpen(false)}
          />
        </Suspense>
      )}
    </section>
  );
}
