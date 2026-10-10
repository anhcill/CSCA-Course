/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchGradebook, saveGradebookPolicy, finalizeGradebook, reopenGradebook } from "../../api/lmsClient";
import { panel, input, button, secondary } from "./workflowStyles";

export default function GradebookPolicyPanel({ classId, sessionId, search = "" }) {
  const [book, setBook] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const r = await fetchGradebook(classId, sessionId); setBook(r.data); setPolicy(r.data.policy); }
    catch (e) { setError(e.message); setBook(null); }
  }, [classId, sessionId]);
  useEffect(() => { load(); }, [load]);
  const act = async (action) => {
    if ((action === "save" && !book?.capabilities?.canManagePolicy)
      || (action === "finalize" && !book?.capabilities?.canFinalize)
      || (action === "reopen" && !book?.capabilities?.canReopen)) return;
    setBusy(true);
    try {
      if (action==="save") await saveGradebookPolicy(classId,policy);
      else if (action==="finalize") await finalizeGradebook(classId);
      else await reopenGradebook(classId,reason);
      setConfirm(""); setReason(""); await load(); toast.success("Đã cập nhật sổ điểm.");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (error) return <div className={panel}><p role="alert" className="text-red-600">{error}</p><button className={secondary} onClick={load}>Thử lại</button></div>;
  if (!book || !policy) return <p className={panel}>Đang tải điểm tổng kết...</p>;
  const filtered = book.rows.filter((r) => (r.name+" "+r.email).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const dirty = JSON.stringify(policy) !== JSON.stringify(book.policy);
  const { canManagePolicy = false, canFinalize = false, canReopen = false } = book.capabilities || {};
  return <section className={panel + " space-y-4"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Điểm tổng kết theo trọng số</h2><p className="text-xs text-slate-500">{book.finalization ? `Sổ đã chốt lúc ${new Date(book.finalization.finalizedAt).toLocaleString("vi-VN")}` : "Điểm tạm tính; lưu quy tắc trước khi chốt."}{sessionId!=="all" && " · Đang xem riêng buổi được chọn."}</p></div><button className={secondary} onClick={load}>Cập nhật điểm</button></div>
    <details><summary className="cursor-pointer text-sm font-semibold text-blue-600">Quy tắc tính điểm</summary>
      <fieldset disabled={busy || Boolean(book.finalization) || !canManagePolicy} className="mt-3 grid gap-3 sm:grid-cols-3">
        {Object.entries({assignment:"Bài tập (%)",quiz:"Quiz (%)",attendance:"Chuyên cần (%)"}).map(([key,label]) => <label key={key} className="text-sm">{label}<input className={input} type="number" min="0" max="100" value={policy.weights[key]} onChange={(e)=>setPolicy({...policy,weights:{...policy.weights,[key]:Number(e.target.value)}})}/></label>)}
        <label className="text-sm">Quiz nhiều lượt<select className={input} value={policy.quizStrategy} onChange={(e)=>setPolicy({...policy,quizStrategy:e.target.value})}><option value="latest">Lượt cuối</option><option value="best">Điểm cao nhất</option><option value="average">Trung bình các lượt</option></select></label>
        <label className="text-sm">Chưa có điểm<select className={input} value={policy.missingPolicy} onChange={(e)=>setPolicy({...policy,missingPolicy:e.target.value})}><option value="exclude">Tạm bỏ qua</option><option value="zero">Tính 0 điểm</option></select></label>
        <label className="text-sm">Ngưỡng đạt (%)<input className={input} type="number" min="0" max="100" value={policy.passMark} onChange={(e)=>setPolicy({...policy,passMark:Number(e.target.value)})}/></label>
        <p className="text-xs text-slate-500 sm:col-span-3">Tổng trọng số phải bằng 100%. Nhóm không có hoạt động được bỏ qua; buổi vắng có phép không tính vào chuyên cần. Bài chưa nộp và chờ chấm vẫn được ghi rõ trong file xuất.</p>
        {canManagePolicy && <button type="button" className={button} onClick={()=>act("save")}>Lưu quy tắc</button>}
      </fieldset>
    </details>
    <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b dark:border-slate-700"><th className="py-2">Học viên</th><th>Điểm /100</th><th>Kết quả</th></tr></thead><tbody>{filtered.map((r)=><tr key={r.id} className="border-b dark:border-slate-800"><td className="py-2">{r.name}</td><td>{r.total??"Chưa có điểm"}</td><td>{r.passed===null?"Chưa xác định":r.passed?"Đạt":"Chưa đạt"}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap gap-2">
      {!book.finalization && canFinalize && <button disabled={busy || dirty || sessionId!=="all"} className={button} onClick={()=>setConfirm("finalize")}>Chốt điểm toàn lớp</button>}
      {book.finalization && canReopen && <button disabled={busy} className={secondary} onClick={()=>setConfirm("reopen")}>Mở lại để điều chỉnh</button>}
      {!book.finalization && dirty && canFinalize && <p className="text-xs text-amber-600">Cần lưu quy tắc trước khi chốt.</p>}
    </div>
    <details><summary className="cursor-pointer text-xs text-slate-500">Lịch sử chốt / mở lại ({book.history.length})</summary>{book.history.map((h)=><p key={h.id} className="mt-2 text-xs">#{h.id} · {h.finalized_by_name} · {new Date(h.finalized_at).toLocaleString("vi-VN")}{h.reopened_at && ` · Mở lại: ${h.reopen_reason}`}</p>)}</details>
    {confirm && <form className="space-y-3 rounded-xl border border-amber-200 p-4 dark:border-amber-800" onSubmit={(e)=>{e.preventDefault();act(confirm);}}><p className="text-sm">{confirm==="finalize"?"Chốt bản điểm hiện tại? Sau khi chốt, cần mở lại kèm lý do để sửa điểm hoặc nhận bài nộp mới.":"Nhập lý do mở lại sổ điểm; bản chốt cũ vẫn được lưu."}</p>{confirm==="reopen" && <textarea aria-label="Lý do mở sổ điểm" required minLength={10} maxLength={2000} className={input} value={reason} onChange={(e)=>setReason(e.target.value)}/>}<div className="flex gap-2"><button disabled={busy} className={button}>Xác nhận</button><button type="button" disabled={busy} className={secondary} onClick={()=>setConfirm("")}>Hủy</button></div></form>}
  </section>;
}
