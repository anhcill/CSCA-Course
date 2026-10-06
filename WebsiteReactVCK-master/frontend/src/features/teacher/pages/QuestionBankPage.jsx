import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fetchAdminCourses, fetchQuestionBank, createQuestionBankItem, updateQuestionBankItem, deleteQuestionBankItem } from "../../api/lmsClient";
import { panel,input,button,secondary } from "../components/workflowStyles";
const blank = () => ({questionText:"",options:["","","",""],correctAnswer:0,points:1,explanation:"",tags:[],difficulty:"medium",visibility:"private"});
const levels = {easy:"Dễ",medium:"Vừa",hard:"Khó"};
export default function QuestionBankPage(){
  const [courses,setCourses]=useState([]),[courseId,setCourseId]=useState("");
  const [rows,setRows]=useState([]),[search,setSearch]=useState(""),[difficulty,setDifficulty]=useState(""),[page,setPage]=useState(1),[total,setTotal]=useState(0);
  const [editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(false),[deleting,setDeleting]=useState(null);
  useEffect(()=>{fetchAdminCourses().then((r)=>{setCourses(r.data||[]);setCourseId(String(r.data?.[0]?.id||""));}).catch((e)=>setError(e.message));},[]);
  const load=useCallback(async()=>{
    if(!courseId)return;
    setLoading(true);setError("");
    try{const r=await fetchQuestionBank({courseId,search,difficulty,page});setRows(r.data);setTotal(r.meta.total);}
    catch(e){setError(e.message);}finally{setLoading(false);}
  },[courseId,search,difficulty,page]);
  useEffect(()=>{const timer=setTimeout(load,250);return()=>clearTimeout(timer);},[load]);
  const save=async(e)=>{
    e.preventDefault();setBusy(true);
    try{const payload={...editing,courseId:Number(courseId)};if(editing.id)await updateQuestionBankItem(editing.id,payload);else await createQuestionBankItem(payload);setEditing(null);await load();toast.success("Đã lưu câu hỏi.");}
    catch(err){toast.error(err.message);}finally{setBusy(false);}
  };
  const remove=async()=>{
    setBusy(true);try{await deleteQuestionBankItem(deleting.id);setDeleting(null);await load();toast.success("Đã xóa khỏi ngân hàng; các đề đã tạo giữ nguyên câu hỏi.");}
    catch(e){toast.error(e.message);}finally{setBusy(false);}
  };
  return <div className="mx-auto max-w-6xl space-y-5 p-4 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Ngân hàng câu hỏi</h1><p className="mt-1 text-sm text-slate-500">Quản lý câu gốc theo khóa học. Chia sẻ để giáo viên cùng khóa sử dụng.</p></div><button disabled={!courseId} className={button} onClick={()=>setEditing(blank())}>Thêm câu hỏi</button></header>
    <div className={panel+" grid gap-3 sm:grid-cols-3"}><select aria-label="Khóa học" className={input} value={courseId} onChange={(e)=>{setCourseId(e.target.value);setPage(1);setEditing(null);}}>{courses.map((c)=><option key={c.id} value={c.id}>{c.title||c.name}</option>)}</select><input className={input} aria-label="Tìm câu hỏi hoặc chủ đề" placeholder="Tìm nội dung hoặc thẻ chủ đề..." value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1);}}/><select aria-label="Độ khó" className={input} value={difficulty} onChange={(e)=>{setDifficulty(e.target.value);setPage(1);}}><option value="">Tất cả độ khó</option>{Object.entries(levels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading?<p>Đang tải...</p>:!rows.length?<p className={panel}>Chưa có câu hỏi phù hợp.</p>:rows.map((q)=><article key={q.id} className={panel+" space-y-2"}><p className="font-semibold whitespace-pre-wrap">{q.questionText}</p><p className="text-xs text-slate-500">{levels[q.difficulty]} · {q.points} điểm · {q.visibility==="course"?"Dùng chung trong khóa":"Cá nhân"} · {q.tags.join(", ")}</p><details><summary className="cursor-pointer text-sm text-blue-600">Xem đáp án và giải thích</summary>{q.options.map((o,i)=><p key={i} className={"mt-1 text-sm "+(q.correctAnswer===i?"font-semibold text-emerald-600":"")}>{String.fromCharCode(65+i)}. {o}{q.correctAnswer===i?" ✓":""}</p>)}<p className="mt-2 text-sm">{q.explanation}</p></details>{q.canEdit && <div className="flex gap-2"><button className={secondary} onClick={()=>setEditing({...q,options:[...q.options]})}>Sửa</button><button className={secondary+" text-red-600"} onClick={()=>setDeleting(q)}>Xóa</button></div>}</article>)}
    <div className="flex items-center gap-3"><button className={secondary} disabled={page===1||loading} onClick={()=>setPage(page-1)}>Trước</button><span className="text-sm">Trang {page} · {total} câu</span><button className={secondary} disabled={page*30>=total||loading} onClick={()=>setPage(page+1)}>Tiếp</button></div>
    {editing && <div role="dialog" aria-modal="true" aria-label="Soạn câu hỏi" className="fixed inset-0 z-[80] overflow-y-auto bg-black/50 p-4"><form onSubmit={save} className={panel+" mx-auto my-6 max-w-2xl space-y-4"}><h2 className="font-bold">{editing.id?"Sửa câu hỏi":"Thêm câu hỏi"}</h2><label className="block text-sm">Nội dung<textarea required maxLength={6000} rows={3} className={input} value={editing.questionText} onChange={(e)=>setEditing({...editing,questionText:e.target.value})}/></label>
      <fieldset className="space-y-2"><legend className="text-sm">Các lựa chọn — chọn một đáp án đúng</legend>{editing.options.map((o,i)=><label key={i} className="flex items-center gap-2"><input type="radio" name="correct-answer" checked={editing.correctAnswer===i} onChange={()=>setEditing({...editing,correctAnswer:i})}/><span>{String.fromCharCode(65+i)}</span><input required maxLength={2000} className={input} value={o} onChange={(e)=>setEditing({...editing,options:editing.options.map((v,j)=>i===j?e.target.value:v)})}/></label>)}<div className="flex gap-2"><button type="button" className={secondary} disabled={editing.options.length>=6} onClick={()=>setEditing({...editing,options:[...editing.options,""]})}>Thêm đáp án</button><button type="button" className={secondary} disabled={editing.options.length<=2} onClick={()=>setEditing({...editing,options:editing.options.slice(0,-1),correctAnswer:Math.min(editing.correctAnswer,editing.options.length-2)})}>Bớt đáp án cuối</button></div></fieldset>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Độ khó<select className={input} value={editing.difficulty} onChange={(e)=>setEditing({...editing,difficulty:e.target.value})}>{Object.entries(levels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="text-sm">Điểm<input required type="number" min="0.25" max="100" step="0.25" className={input} value={editing.points} onChange={(e)=>setEditing({...editing,points:Number(e.target.value)})}/></label><label className="text-sm">Phạm vi<select className={input} value={editing.visibility} onChange={(e)=>setEditing({...editing,visibility:e.target.value})}><option value="private">Cá nhân</option><option value="course">Giáo viên cùng khóa</option></select></label></div>
      <label className="block text-sm">Chủ đề (phân cách bằng dấu phẩy)<input className={input} value={editing.tags.join(",")} onChange={(e)=>setEditing({...editing,tags:e.target.value.split(",")})}/></label>
      <label className="block text-sm">Giải thích<textarea maxLength={4000} className={input} value={editing.explanation} onChange={(e)=>setEditing({...editing,explanation:e.target.value})}/></label>
      <p className="text-xs text-slate-500">Sửa câu gốc không làm đổi nội dung hoặc đáp án của các đề đã tạo.</p>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={secondary} onClick={()=>setEditing(null)}>Hủy</button><button disabled={busy} className={button}>{busy?"Đang lưu...":"Lưu câu hỏi"}</button></div></form></div>}
    {deleting && <div role="dialog" aria-modal="true" aria-label="Xóa câu hỏi" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"><div className={panel+" max-w-lg space-y-4"}><p>Xóa câu hỏi này khỏi ngân hàng? Các đề đã sử dụng câu hỏi vẫn giữ nguyên.</p><div className="flex justify-end gap-2"><button disabled={busy} className={secondary} onClick={()=>setDeleting(null)}>Hủy</button><button disabled={busy} className={button} onClick={remove}>Xóa câu hỏi</button></div></div></div>}
  </div>;
}
