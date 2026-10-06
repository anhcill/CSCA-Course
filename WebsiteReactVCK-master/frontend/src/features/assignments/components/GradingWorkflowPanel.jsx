/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchSubmissionHistory, returnSubmission, saveGradingDraft } from "../../api/lmsClient";
import { button, input, secondary } from "../../teacher/components/workflowStyles";
import SubmissionHistory from "./SubmissionHistory";

export default function GradingWorkflowPanel({ submission, payload, onRestore, onReturned }) {
  const [draft,setDraft]=useState(null);
  const [busy,setBusy]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [reason,setReason]=useState("");
  const [until,setUntil]=useState("");
  const [savedAt,setSavedAt]=useState("");
  useEffect(()=>{
    let active=true;setDraft(null);setSavedAt("");setShowReturn(false);setReason("");setUntil("");
    fetchSubmissionHistory(submission.id).then((r)=>{if(active)setDraft(r.data.draft);}).catch((e)=>toast.error(e.message));
    return ()=>{active=false;};
  },[submission.id,submission.revision,submission.gradedAt]);
  const save=async()=>{
    setBusy(true);
    try{await saveGradingDraft(submission.id,{...payload,revision:submission.revision});setSavedAt(new Date().toLocaleTimeString("vi-VN"));toast.success("Đã lưu nháp riêng; học viên chưa thấy thay đổi.");}
    catch(e){toast.error(e.message);}finally{setBusy(false);}
  };
  const sendBack=async(e)=>{
    e.preventDefault();setBusy(true);
    try{await returnSubmission(submission.id,{revision:submission.revision,reason,resubmitUntil:new Date(until).toISOString()});toast.success("Đã trả bài và thông báo hạn nộp lại.");setShowReturn(false);onReturned();}
    catch(err){toast.error(err.message);}finally{setBusy(false);}
  };
  return <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
    <button type="button" disabled={busy || submission.returnRequested} className={secondary+" w-full"} onClick={save}>{busy?"Đang xử lý...":"Lưu nháp chấm bài"}</button>
    {savedAt && <p className="text-xs text-slate-500">Nháp đã lưu lúc {savedAt}.</p>}
    {draft && <button type="button" className={secondary+" w-full"} onClick={()=>{onRestore(draft.payload);setDraft(null);}}>Khôi phục nháp {new Date(draft.updated_at).toLocaleString("vi-VN")}</button>}
    {submission.returnRequested?<p className="text-sm text-amber-600">Đang chờ nộp lại đến {new Date(submission.resubmitUntil).toLocaleString("vi-VN")}. {submission.returnReason}</p>:<button type="button" className={secondary+" w-full"} onClick={()=>setShowReturn(!showReturn)}>Yêu cầu sửa và nộp lại</button>}
    {showReturn && <form className="space-y-2" onSubmit={sendBack}><label className="block text-xs">Nội dung cần sửa<textarea required minLength={10} maxLength={2000} className={input} value={reason} onChange={(e)=>setReason(e.target.value)}/></label><label className="block text-xs">Hạn nộp lại<input type="datetime-local" required className={input} value={until} onChange={(e)=>setUntil(e.target.value)}/></label><button disabled={busy} className={button}>Gửi yêu cầu</button></form>}
    <SubmissionHistory submissionId={submission.id} refreshKey={submission.revision+":"+submission.gradedAt+":"+submission.score}/>
  </div>;
}
