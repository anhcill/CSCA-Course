/* eslint-disable react/prop-types */
import { useState } from "react";
import { input, secondary } from "../../teacher/components/workflowStyles";

export default function SubmissionAnnotations({ items = [], onChange, fileUrl, fileName, readOnly = false }) {
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [position, setPosition] = useState(null);
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(fileName || "");
  const isPdf = /\.pdf$/i.test(fileName || "");
  const add = () => {
    if (!text.trim() || items.length >= 100) return;
    onChange([...items, {text:text.trim(),page:Number(page),x:position?.x ?? null,y:position?.y ?? null}]);
    setText(""); setPosition(null);
  };
  return <div className="space-y-3">
    {isImage && fileUrl && <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <img src={fileUrl} alt="Bài nộp có chú thích" className="block h-auto w-full" onClick={readOnly ? undefined : (event) => {const rect=event.currentTarget.getBoundingClientRect();setPosition({x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height});}}/>
      {items.map((item,index)=>item.x!==null && item.x!==undefined && <span key={index} title={item.text} className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow" style={{left:`${item.x*100}%`,top:`${item.y*100}%`}}>{index+1}</span>)}
      {position && <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-blue-200" style={{left:`${position.x*100}%`,top:`${position.y*100}%`}}/>}
    </div>}
    {isPdf && fileUrl && <iframe title="Bài nộp PDF" src={`${fileUrl}#page=${page}`} className="h-96 w-full rounded-xl border dark:border-slate-700"/>}
    {!readOnly && <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{isImage?"Nhấn lên ảnh để chọn vị trí, rồi nhập nhận xét.":"Ghi chú theo trang PDF hoặc nhận xét cho bài làm."}</p>
      {!isImage && <label className="block text-xs">Trang<input className={input} type="number" min="1" max="10000" value={page} onChange={(e)=>setPage(e.target.value)}/></label>}
      <textarea aria-label="Nội dung chú thích" rows={2} maxLength={2000} className={input} value={text} onChange={(e)=>setText(e.target.value)} placeholder="Nêu lỗi và gợi ý sửa..."/>
      <button type="button" className={secondary} disabled={!text.trim() || Number(page)<1 || items.length>=100} onClick={add}>Thêm chú thích</button>
    </div>}
    {items.map((item,index)=><div key={index} className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-slate-800 dark:bg-amber-950/30 dark:text-slate-200"><p><b>{index+1}. {!isImage && `Trang ${item.page}: `}</b>{item.text}</p>{!readOnly && <button type="button" aria-label={`Xóa chú thích ${index+1}`} onClick={()=>onChange(items.filter((_,i)=>i!==index))}>×</button>}</div>)}
  </div>;
}
