import React from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";

export default function RecordingStudyTipsWidget() {
  const tips = [
    "Tăng tốc độ phát 1.25x – 1.5x với các phần lý thuyết đã nắm vững để tiết kiệm thời gian.",
    "Dừng video trước khi giảng viên giải bài tập để tự nháp lời giải trước.",
    "Ghi chú lại mốc thời gian (timestamp) các câu hỏi hay để ôn tập lại trước kỳ thi.",
  ];

  return (
    <section className="rounded-2xl border border-white/85 bg-white/92 p-4 sm:p-5 shadow-[0_8px_30px_rgba(32,78,120,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-black text-[#102f63] tracking-tight">
          Mẹo ôn tập hiệu quả
        </h2>
      </div>

      <div className="space-y-2.5">
        {tips.map((tip, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
