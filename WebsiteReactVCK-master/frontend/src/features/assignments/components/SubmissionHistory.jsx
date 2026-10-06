/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { fetchSubmissionHistory } from "../../api/lmsClient";

export default function SubmissionHistory({ submissionId, refreshKey = "" }) {
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true; setError(""); setData(null);
    fetchSubmissionHistory(submissionId).then((r)=>{if(active)setData(r.data);}).catch((e)=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[submissionId,refreshKey]);
  return <details className="mt-4 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><summary className="cursor-pointer font-semibold">Lịch sử bài nộp và điểm</summary>
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    {data && <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">Phiên bản hiện tại: {data.current.revision}</p>
      {data.revisions.map((r)=><details key={r.revision} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950"><summary className="cursor-pointer">Bản {r.revision} · {new Date(r.snapshot.submitted_at).toLocaleString("vi-VN")}</summary><p className="mt-2 whitespace-pre-wrap">{r.snapshot.content_text}</p>{r.snapshot.file_asset_id && <a className="text-blue-600 underline" href={`/api/assignments/submission-assets/${r.snapshot.file_asset_id}/access`} target="_blank" rel="noreferrer">Mở file phiên bản này</a>}{r.snapshot.audio_asset_id && <audio controls className="mt-2 w-full" src={`/api/assignments/submission-assets/${r.snapshot.audio_asset_id}/access`}/>}<p className="mt-2 text-xs">Yêu cầu sửa: {r.snapshot.return_reason}</p></details>)}
      {data.grades.map((g)=><div key={g.id} className="border-l-2 border-blue-400 pl-3"><p className="font-semibold">Bản {g.submission_revision} · Điểm {g.score} · {g.grader_name}</p><p className="text-xs text-slate-500">{new Date(g.graded_at).toLocaleString("vi-VN")}</p><p className="whitespace-pre-wrap">{g.feedback_text}</p>{g.change_reason && <p className="text-xs">Lý do sửa điểm: {g.change_reason}</p>}{(g.annotations || []).map((a,i)=><p key={i} className="text-xs">Chú thích {i+1}, trang {a.page}: {a.text}</p>)}</div>)}
      {!data.grades.length && <p className="text-xs text-slate-500">Chưa có điểm được công bố.</p>}
    </div>}
  </details>;
}
