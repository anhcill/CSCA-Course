import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  fetchAttendanceReviewQueue, fetchFinalizedAttendanceSheet, fetchFinalizedAttendanceSheets,
  fetchTeacherDashboardStats, reviewAttendanceAmendment, reviewFinalizedAttendanceSheet,
} from "../../api/lmsClient";
import { panel, input, button, secondary } from "../components/workflowStyles";

const labels = { present: "Có mặt", absent: "Vắng", excused: "Có phép", pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };

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
    setLoading(true); setError("");
    try {
      const result = await fetchFinalizedAttendanceSheets({ status, page });
      setRows(result.data || []); setTotal(result.meta?.total || 0);
    } catch (e) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [status, page]);
  useEffect(() => { load(); }, [load]);
  const open = async (sessionId) => {
    if (String(detail?.sessionId) === String(sessionId)) { setDetail(null); return; }
    setDetailLoading(true); setDetail(null); setReviewNote("");
    try { setDetail((await fetchFinalizedAttendanceSheet(sessionId)).data); }
    catch (e) { toast.error(e.message); }
    finally { setDetailLoading(false); }
  };
  const acknowledge = async (sessionId) => {
    setSaving(true);
    try {
      await reviewFinalizedAttendanceSheet(sessionId, reviewNote);
      toast.success("Đã ghi nhận kiểm tra bản điểm danh.");
      setDetail(null); setReviewNote(""); await load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  return <section className={panel + " space-y-4"}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Bản điểm danh giáo viên đã chốt</h2><p className="mt-1 text-xs text-slate-500">Có hiệu lực ngay sau khi chốt. Admin kiểm tra và ghi nhận tại đây; thao tác kiểm tra không thay đổi điểm danh.</p></div><button className={secondary} onClick={load}>Tải lại</button></div>
    <select aria-label="Trạng thái kiểm tra bản chốt" className={input + " sm:w-48"} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); setDetail(null); }}><option value="pending">Chờ kiểm tra</option><option value="reviewed">Đã kiểm tra</option><option value="all">Tất cả</option></select>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading ? <p className="text-sm">Đang tải bản chốt...</p> : !rows.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">Không có bản điểm danh trong bộ lọc này.</p> : rows.map((row) => <article key={row.sessionId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{row.classTitle} · {row.sessionTitle}</h3><p className="mt-1 text-xs text-slate-500">Buổi học {new Date(row.startTime).toLocaleString("vi-VN")} · Chốt bởi {row.finalizedByName || "Giáo viên"} lúc {new Date(row.finalizedAt).toLocaleString("vi-VN")}</p><p className="mt-2 text-sm">{row.counts.total} học viên · Có mặt {row.counts.present} · Vắng {row.counts.absent} · Có phép {row.counts.excused}</p></div><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{row.reviewedAt ? "Đã kiểm tra" : "Chờ kiểm tra"}</span></div>
      <button type="button" className={secondary + " mt-3"} disabled={detailLoading} onClick={() => open(row.sessionId)}>{String(detail?.sessionId) === String(row.sessionId) ? "Đóng chi tiết" : "Xem điểm danh"}</button>
      {String(detail?.sessionId) === String(row.sessionId) && <div className="mt-4 space-y-3"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b dark:border-slate-700"><th className="py-2 pr-3">Học viên</th><th className="py-2 pr-3">Trạng thái</th><th className="py-2">Ghi chú</th></tr></thead><tbody>{detail.students.map((student) => <tr key={student.userId} className="border-b border-slate-100 dark:border-slate-800"><td className="py-2 pr-3">{student.name}</td><td className="py-2 pr-3">{labels[student.status] || student.status}</td><td className="py-2">{student.note || "—"}</td></tr>)}</tbody></table></div>{!row.reviewedAt && <div className="flex flex-wrap items-end gap-2"><label className="min-w-52 flex-1 text-xs">Ghi chú kiểm tra (nếu có)<input className={input + " mt-1"} maxLength={2000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></label><button type="button" className={button} disabled={saving} onClick={() => acknowledge(row.sessionId)}>{saving ? "Đang lưu..." : "Đánh dấu đã kiểm tra"}</button></div>}{row.reviewedAt && <p className="text-xs text-slate-500">Kiểm tra bởi {row.reviewedByName || "Admin"} lúc {new Date(row.reviewedAt).toLocaleString("vi-VN")}{row.reviewNote ? ` · ${row.reviewNote}` : ""}</p>}</div>}
    </article>)}
    <div className="flex items-center gap-3 text-sm"><button disabled={page === 1 || loading} className={secondary} onClick={() => { setPage(page - 1); setDetail(null); }}>Trước</button><span>Trang {page} · {total} bản chốt</span><button disabled={page * 30 >= total || loading} className={secondary} onClick={() => { setPage(page + 1); setDetail(null); }}>Tiếp</button></div>
  </section>;
}

export default function AttendanceReviewPage() {
  const { authUser } = useAuthContext();
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
  useEffect(() => { fetchTeacherDashboardStats({limit:1}).then((r) => setClasses(r.data.classes || [])).catch((e) => setError(e.message)); }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetchAttendanceReviewQueue({ status, page, ...(classId ? {classId} : {}) });
      setRows(r.data); setTotal(r.meta.total);
    } catch (e) { setError(e.message); setRows([]); } finally { setLoading(false); }
  }, [classId, status, page]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      await reviewAttendanceAmendment({amendmentId:review.id, decision:review.decision, reviewNote:note});
      setReview(null); toast.success("Đã xử lý phiếu và gửi thông báo."); await load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-5xl space-y-5 p-4 text-slate-900 dark:text-slate-100">
    <header><h1 className="text-2xl font-bold">{authUser?.role === "admin" ? "Kiểm tra điểm danh" : "Duyệt sửa điểm danh"}</h1><p className="mt-2 text-sm text-slate-500">{authUser?.role === "admin" ? "Bản chốt của giáo viên xuất hiện ngay bên dưới. Phiếu sửa chỉ dùng khi cần thay đổi điểm danh đã chốt." : "Đối chiếu nội dung cũ và đề nghị mới. Người gửi phiếu cần một người khác duyệt."}</p></header>
    {authUser?.role === "admin" && <FinalizedSheetsPanel />}
    <h2 className="text-lg font-bold">Phiếu sửa điểm danh</h2>
    <div className={panel + " flex flex-wrap gap-3"}>
      <select aria-label="Lọc lớp" className={input + " sm:w-64"} value={classId} onChange={(e) => {setClassId(e.target.value);setPage(1);}}><option value="">Tất cả lớp</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      <select aria-label="Trạng thái phiếu" className={input + " sm:w-44"} value={status} onChange={(e) => {setStatus(e.target.value);setPage(1);}}>{["pending","approved","rejected","all"].map((s) => <option key={s} value={s}>{labels[s] || "Tất cả"}</option>)}</select>
      <button className={secondary} onClick={load}>Tải lại</button>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p>Đang tải phiếu...</p> : !rows.length ? <p className={panel}>Không có phiếu trong bộ lọc này.</p> : rows.map((r) => <article key={r.id} className={panel + " space-y-3"}>
      <div className="flex justify-between gap-3"><div><h2 className="font-bold">{r.studentName}</h2><p className="text-sm text-slate-500">{r.classTitle} · {r.sessionTitle} · {new Date(r.startTime).toLocaleString("vi-VN")}</p></div><span className="text-sm font-semibold">{labels[r.status]}</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Hiện tại khi gửi phiếu</p><p>{labels[r.originalStatus]}</p><p className="text-sm">{r.originalNote || "Không có ghi chú"}</p></div><div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950"><p className="text-xs text-slate-500">Đề nghị chỉnh thành</p><p>{labels[r.requestedStatus]}</p><p className="text-sm">{r.requestedNote || "Không có ghi chú"}</p></div></div>
      <p className="text-sm"><b>Lý do:</b> {r.reason}</p>
      <p className="text-xs text-slate-500">Gửi bởi {r.requestedByName || r.requestedBy} · {new Date(r.requestedAt).toLocaleString("vi-VN")}</p>
      {r.reviewedAt && <p className="text-sm">Xử lý bởi {r.reviewedByName || r.reviewedBy} · {new Date(r.reviewedAt).toLocaleString("vi-VN")} · {r.reviewNote || "Không thêm ghi chú"}</p>}
      {r.status === "pending" && <div className="flex gap-2">{["approved","rejected"].map((decision) => <button key={decision} disabled={String(r.requestedBy) === String(authUser?.id || authUser?._id)} className={decision === "approved" ? button : secondary} onClick={() => {setReview({...r,decision});setNote("");}}>{decision === "approved" ? "Duyệt điều chỉnh" : "Từ chối"}</button>)}</div>}
    </article>)}
    <div className="flex items-center gap-3"><button disabled={page===1 || loading} className={secondary} onClick={() => setPage(page-1)}>Trước</button><span className="text-sm">Trang {page} · {total} phiếu</span><button disabled={page*30>=total || loading} className={secondary} onClick={() => setPage(page+1)}>Tiếp</button></div>
    {review && <div role="dialog" aria-modal="true" aria-label="Xử lý phiếu" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><form className={panel + " w-full max-w-lg space-y-4"} onSubmit={save}><h2 className="text-lg font-bold">{review.decision==="approved" ? "Duyệt điều chỉnh" : "Từ chối phiếu"} của {review.studentName}</h2><label className="block text-sm">Lý do / ghi chú {review.decision==="rejected" && "(bắt buộc)"}<textarea autoFocus rows={4} className={input} required={review.decision==="rejected"} minLength={review.decision==="rejected" ? 10 : undefined} maxLength={2000} value={note} onChange={(e)=>setNote(e.target.value)}/></label><div className="flex justify-end gap-2"><button type="button" disabled={saving} className={secondary} onClick={()=>setReview(null)}>Hủy</button><button disabled={saving} className={button}>{saving?"Đang xử lý...":"Xác nhận"}</button></div></form></div>}
  </div>;
}
