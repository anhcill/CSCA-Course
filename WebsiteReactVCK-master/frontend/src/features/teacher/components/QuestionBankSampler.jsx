/* eslint-disable react/prop-types */
import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { sampleQuestionBank } from "../../api/lmsClient";
import { input,secondary } from "./workflowStyles";
export default function QuestionBankSampler({ courseId, onAdd }){
  const [blueprint,setBlueprint]=useState({easy:0,medium:0,hard:0});
  const [tag,setTag]=useState(""),[busy,setBusy]=useState(false);
  const sample=async()=>{
    setBusy(true);
    try{const r=await sampleQuestionBank({courseId:Number(courseId),blueprint,tag});onAdd(r.data);toast.success(`Đã thêm ${r.data.length} câu theo cấu trúc.`);}
    catch(e){toast.error(e.message);}finally{setBusy(false);}
  };
  return <div className="mt-3 space-y-2 border-t pt-3 dark:border-slate-700"><Link className="text-xs font-semibold text-blue-600" to="/lms/teach/question-bank">Mở trang quản lý ngân hàng →</Link><p className="text-xs text-slate-500">Rút ngẫu nhiên theo cấu trúc:</p><div className="grid grid-cols-3 gap-2">{Object.entries({easy:"Dễ",medium:"Vừa",hard:"Khó"}).map(([k,v])=><label className="text-xs" key={k}>{v}<input className={input} type="number" min="0" max="100" value={blueprint[k]} onChange={(e)=>setBlueprint({...blueprint,[k]:Number(e.target.value)})}/></label>)}</div><input aria-label="Chủ đề rút câu" className={input} value={tag} onChange={(e)=>setTag(e.target.value)} placeholder="Thẻ chủ đề (tùy chọn)"/><button type="button" className={secondary+" w-full"} disabled={!courseId||busy} onClick={sample}>{busy?"Đang rút câu...":"Thêm các câu ngẫu nhiên"}</button></div>;
}
