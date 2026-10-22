import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  FileText,
  RotateCw,
  ShieldCheck,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import {
  fetchAttendanceReviewQueue,
  fetchFinalizedAttendanceSheet,
  fetchFinalizedAttendanceSheets,
  fetchTeacherClassesLookup,
  reviewAttendanceAmendment,
  reviewFinalizedAttendanceSheet,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";

const STATUS_LABELS = {
  present: { label: "Có mặt", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  absent: { label: "Vắng", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  excused: { label: "Có phép", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  pending: { label: "Chờ duyệt", badge: "bg-amber-50 text-amber-800 border-amber-300" },
  approved: { label: "Đã duyệt", badge: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  rejected: { label: "Từ chối", badge: "bg-rose-50 text-rose-800 border-rose-300" },
};

function FinalizedSheetsPanel() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchFinalizedAttendanceSheets({ status, page });
      setRows(result.data || []);
      setTotal(result.meta?.total || 0);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (sessionId) => {
    if (String(detail?.sessionId) === String(sessionId)) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetail(null);
    setReviewNote("");
    try {
      setDetail((await fetchFinalizedAttendanceSheet(sessionId)).data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const acknowledge = async (sessionId) => {
    setSaving(true);
    try {
      await reviewFinalizedAttendanceSheet(sessionId, reviewNote);
      toast.success("Đã ghi nhận kiểm tra bản điểm danh thành công.");
      setDetail(null);
      setReviewNote("");
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/80 bg-white/92 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300 shadow-2xs">
              <FileCheck className="h-4 w-4" />
            </span>
            <h2 className="text-base font-black text-[#102f63] dark:text-white">
              Bản Điểm Danh Giảng Viên Đã Chốt
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Có hiệu lực ngay sau khi giảng viên chốt. Ban đào tạo kiểm tra và xác nhận; thao tác không làm thay đổi dữ liệu gốc.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Trạng thái kiểm tra bản chốt"
            className="rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setDetail(null);
            }}
          >
            <option value="pending">Chờ kiểm tra</option>
            <option value="reviewed">Đã kiểm tra</option>
            <option value="all">Tất cả bản chốt</option>
          </select>

          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RotateCw className="h-3.5 w-3.5" /> Tải lại
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <Loading loading text="Đang tải bản điểm danh đã chốt..." fullScreen={false} className="py-8" />
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
          Không có bản điểm danh nào trong bộ lọc này.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={row.sessionId}
              className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-800/60 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-[#102f63] dark:text-white">
                    {row.classTitle} · {row.sessionTitle}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Buổi học: {new Date(row.startTime).toLocaleString("vi-VN")} · Chốt bởi{" "}
                    <strong className="text-slate-700 dark:text-slate-200">{row.finalizedByName || "Giáo viên"}</strong> lúc{" "}
                    {new Date(row.finalizedAt).toLocaleString("vi-VN")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-700 font-mono">
                      {row.counts.total} học viên
                    </span>
                    <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 font-bold font-mono">
                      Có mặt: {row.counts.present}
                    </span>
                    <span className="rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 font-bold font-mono">
                      Vắng: {row.counts.absent}
                    </span>
                    <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 font-bold font-mono">
                      Có phép: {row.counts.excused}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold border ${
                      row.reviewedAt
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {row.reviewedAt ? "✓ Đã kiểm tra" : "⏳ Chờ kiểm tra"}
                  </span>
                  <button
                    type="button"
                    disabled={detailLoading}
                    onClick={() => open(row.sessionId)}
                    className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300"
                  >
                    {String(detail?.sessionId) === String(row.sessionId) ? "Đóng chi tiết" : "Xem chi tiết"}
                  </button>
                </div>
              </div>

              {/* Chi tiết sổ điểm danh khi mở */}
              {String(detail?.sessionId) === String(row.sessionId) && (
                <div className="mt-3 rounded-2xl border border-sky-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Danh Sách Học Viên Của Buổi Học ({detail.students?.length || 0})
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 text-[11px] font-black uppercase text-slate-600 dark:text-slate-300">
                          <th className="py-2.5 px-3">Học viên</th>
                          <th className="py-2.5 px-3">Trạng thái điểm danh</th>
                          <th className="py-2.5 px-3">Ghi chú của giảng viên</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {detail.students.map((student) => (
                          <tr key={student.userId} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                              {student.name}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${STATUS_LABELS[student.status]?.badge || "bg-slate-100"}`}>
                                {STATUS_LABELS[student.status]?.label || student.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-500">
                              {student.note || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!row.reviewedAt && (
                    <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="min-w-64 flex-1">
                        <label className="block text-xs font-bold text-slate-600 mb-1">
                          Ghi chú kiểm tra của ban đào tạo:
                        </label>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800"
                          maxLength={2000}
                          placeholder="Nhập ghi chú xác nhận (tùy chọn)..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => acknowledge(row.sessionId)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {saving ? "Đang lưu..." : "Đánh dấu đã kiểm tra"}
                      </button>
                    </div>
                  )}

                  {row.reviewedAt && (
                    <p className="text-xs text-slate-500 italic">
                      Kiểm tra bởi <strong className="text-slate-700 dark:text-slate-300">{row.reviewedByName || "Admin"}</strong> lúc{" "}
                      {new Date(row.reviewedAt).toLocaleString("vi-VN")}
                      {row.reviewNote ? ` · Ghi chú: "${row.reviewNote}"` : ""}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <span className="text-slate-500 font-mono">
          Trang {page} · Tổng cộng {total} bản chốt
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 1 || loading}
            onClick={() => {
              setPage(page - 1);
              setDetail(null);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
          >
            Trang trước
          </button>
          <button
            type="button"
            disabled={page * 30 >= total || loading}
            onClick={() => {
              setPage(page + 1);
              setDetail(null);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
          >
            Trang tiếp
          </button>
        </div>
      </div>
    </section>
  );
}

export default function AttendanceReviewPage() {
  const { authUser } = useAuthContext();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith("/admin/");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [review, setReview] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTeacherClassesLookup()
      .then((r) => setClasses(Array.isArray(r?.data) ? r.data : []))
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchAttendanceReviewQueue({ status, page, ...(classId ? { classId } : {}) });
      setRows(r.data || []);
      setTotal(r.meta?.total || 0);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [classId, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await reviewAttendanceAmendment({
        amendmentId: review.id,
        decision: review.decision,
        reviewNote: note,
      });
      setReview(null);
      toast.success(
        review.decision === "approved"
          ? "Đã duyệt điều chỉnh điểm danh thành công! 🎉"
          : "Đã từ chối phiếu điều chỉnh."
      );
      await load();
    } catch (e) {
      toast.error(e.message || "Không thể xử lý phiếu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
        
        {/* ================= 1. NÚT ĐIỀU HƯỚNG QUAY LẠI ================= */}
        <div className="flex items-center justify-between">
          <Link
            to={isAdminView ? "/admin/attendance-report" : "/lms/teach/attendance"}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-3.5 py-1.5 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md transition hover:bg-white hover:text-blue-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại Sổ điểm danh
          </Link>
        </div>

        {/* ================= 2. CALLIGRAPHIC HEADER HERO TRỰC TIẾP TRÊN NỀN Á ĐÔNG ================= */}
        <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>Thẩm tra chuyên cần & Phê duyệt điểm danh</span>
              </div>
              <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
                {authUser?.role === "admin" ? "Kiểm Tra & Phê Duyệt Điểm Danh" : "Duyệt Sửa Điểm Danh Giảng Dạy"}
              </h1>
              <p className="text-xs font-semibold italic text-[#244866] sm:text-sm">
                “Trung thực và minh bạch là nền tảng của uy tín giáo dục.”
              </p>
              <p className="font-['Ma_Shan_Zheng',cursive] text-sm sm:text-base tracking-wider text-slate-700">
                —— 实事求是 · 明辨是非。
              </p>
            </div>
          </div>
        </section>

        {/* ================= 3. BẢNG KIỂM TRA BẢN CHỐT (NẾU LÀ ADMIN) ================= */}
        {authUser?.role === "admin" && <FinalizedSheetsPanel />}

        {/* ================= 4. DANH SÁCH PHIẾU SỬA ĐIỂM DANH (AMENDMENTS) ================= */}
        <section className="rounded-3xl border border-white/80 bg-white/92 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Phiếu Chỉnh Sửa Điểm Danh Cần Phê Duyệt
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">
                Hiển thị {rows.length} / {total} phiếu theo bộ lọc
              </p>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Lọc theo lớp"
                className="rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả lớp học</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>

              <select
                aria-label="Lọc theo trạng thái phiếu"
                className="rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="pending">⏳ Chờ duyệt</option>
                <option value="approved">✓ Đã duyệt</option>
                <option value="rejected">✕ Bị từ chối</option>
                <option value="all">Tất cả trạng thái</option>
              </select>

              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RotateCw className="h-3.5 w-3.5" /> Làm mới
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <Loading loading text="Đang tải danh sách phiếu chỉnh sửa..." fullScreen={false} className="py-12" />
          ) : !rows.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
              Không tìm thấy phiếu điều chỉnh nào trong bộ lọc này.
            </div>
          ) : (
            <div className="space-y-3.5">
              {rows.map((r) => {
                const isPending = r.status === "pending";
                const isSelfRequested = String(r.requestedBy) === String(authUser?.id || authUser?._id);
                const statusMeta = STATUS_LABELS[r.status] || { label: r.status, badge: "bg-slate-100" };

                return (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-white/80 bg-white/90 p-4 sm:p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-800/70 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300">
                            <User className="h-3.5 w-3.5" />
                          </span>
                          <h3 className="text-sm font-black text-[#102f63] dark:text-white">
                            {r.studentName}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.classTitle} · {r.sessionTitle} · {new Date(r.startTime).toLocaleString("vi-VN")}
                        </p>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full border text-xs font-black ${statusMeta.badge}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    {/* So sánh Trước vs Sau */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/60 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Hiện tại khi gửi phiếu:
                        </p>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                          {STATUS_LABELS[r.originalStatus]?.label || r.originalStatus}
                        </p>
                        <p className="text-xs text-slate-500 italic">
                          {r.originalNote ? `Ghi chú: "${r.originalNote}"` : "Không có ghi chú"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/30 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
                          Đề nghị điều chỉnh thành:
                        </p>
                        <p className="text-xs font-black text-blue-700 dark:text-sky-300">
                          {STATUS_LABELS[r.requestedStatus]?.label || r.requestedStatus}
                        </p>
                        <p className="text-xs text-blue-600/80 italic">
                          {r.requestedNote ? `Ghi chú mới: "${r.requestedNote}"` : "Không có ghi chú"}
                        </p>
                      </div>
                    </div>

                    {/* Lý do đề nghị */}
                    <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
                      <strong>Lý do điều chỉnh:</strong> {r.reason}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                      <span>
                        Gửi bởi: <strong className="text-slate-600 dark:text-slate-300">{r.requestedByName || r.requestedBy}</strong> ·{" "}
                        {new Date(r.requestedAt).toLocaleString("vi-VN")}
                      </span>

                      {r.reviewedAt && (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Xử lý bởi {r.reviewedByName || r.reviewedBy} lúc {new Date(r.reviewedAt).toLocaleString("vi-VN")}
                          {r.reviewNote ? ` · "${r.reviewNote}"` : ""}
                        </span>
                      )}
                    </div>

                    {/* Quyết định duyệt / từ chối */}
                    {isPending && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isSelfRequested}
                          onClick={() => {
                            setReview({ ...r, decision: "approved" });
                            setNote("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40"
                          title={isSelfRequested ? "Bạn không thể tự duyệt phiếu do chính mình gửi" : "Phê duyệt điều chỉnh"}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt điều chỉnh
                        </button>

                        <button
                          type="button"
                          disabled={isSelfRequested}
                          onClick={() => {
                            setReview({ ...r, decision: "rejected" });
                            setNote("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-50 disabled:opacity-40"
                          title={isSelfRequested ? "Bạn không thể tự từ chối phiếu của mình" : "Từ chối phiếu"}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Từ chối
                        </button>

                        {isSelfRequested && (
                          <span className="text-[11px] font-medium text-amber-600 italic">
                            (Phiếu của bạn cần thành viên khác hoặc Quản trị viên duyệt)
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* Phân trang */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 font-mono">
              Trang {page} · Tổng cộng {total} phiếu
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1 || loading}
                onClick={() => setPage(page - 1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={page * 30 >= total || loading}
                onClick={() => setPage(page + 1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40"
              >
                Trang tiếp
              </button>
            </div>
          </div>
        </section>

        {/* ================= MODAL XỬ LÝ PHIẾU (DUYỆT / TỪ CHỐI) ================= */}
        {review && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          >
            <form
              onSubmit={save}
              className="w-full max-w-lg rounded-3xl border border-white/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-white ${
                      review.decision === "approved" ? "bg-emerald-600" : "bg-rose-600"
                    }`}
                  >
                    {review.decision === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </span>
                  <h3 className="text-base font-black text-[#102f63] dark:text-white">
                    {review.decision === "approved" ? "Duyệt Phiếu Điểm Danh" : "Từ Chối Phiếu Điểm Danh"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReview(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60 space-y-1">
                <p>
                  <strong>Học viên:</strong> {review.studentName}
                </p>
                <p>
                  <strong>Đề nghị:</strong> Chuyển từ{" "}
                  <span className="font-bold text-rose-600">{STATUS_LABELS[review.originalStatus]?.label}</span> sang{" "}
                  <span className="font-bold text-emerald-600">{STATUS_LABELS[review.requestedStatus]?.label}</span>
                </p>
                <p>
                  <strong>Lý do gửi:</strong> {review.reason}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú phản hồi {review.decision === "rejected" ? "(Bắt buộc đối với từ chối)" : "(Tùy chọn)"}:
                </label>
                <textarea
                  autoFocus
                  rows={4}
                  required={review.decision === "rejected"}
                  minLength={review.decision === "rejected" ? 10 : undefined}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    review.decision === "rejected"
                      ? "Nêu rõ lý do từ chối để giáo viên hiểu..."
                      : "Ghi chú thêm nếu cần..."
                  }
                  className="w-full rounded-2xl border border-slate-200/90 bg-white p-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-2xs dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setReview(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-50 ${
                    review.decision === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-500/25"
                  }`}
                >
                  {saving ? "Đang xử lý..." : "Xác nhận quyết định"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
