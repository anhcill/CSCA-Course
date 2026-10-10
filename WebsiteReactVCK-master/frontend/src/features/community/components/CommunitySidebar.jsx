/* eslint-disable react/prop-types */
import { Link } from 'react-router-dom';
import {
  Flame, Award, Shield, CheckCircle2, TrendingUp, Users, BookOpen,
  CalendarDays, ExternalLink, Sparkles
} from 'lucide-react';
import { TOP_CONTRIBUTORS, TRENDING_TAGS } from '../communityData';

export default function CommunitySidebar({ onTagClick, selectedTag }) {
  return (
    <aside className="space-y-4">
      {/* Widget 1: Top Contributors */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Thành viên tích cực</h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400">Tuần này</span>
        </div>

        <div className="mt-3.5 space-y-3">
          {TOP_CONTRIBUTORS.map((member, index) => (
            <div key={member.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="h-8 w-8 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white shadow-xs ${
                      index === 0
                        ? 'bg-amber-500 ring-1 ring-white'
                        : index === 1
                        ? 'bg-slate-400 ring-1 ring-white'
                        : index === 2
                        ? 'bg-amber-700 ring-1 ring-white'
                        : 'bg-blue-500 ring-1 ring-white'
                    }`}
                  >
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {member.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {member.badge}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                  {member.points} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Widget 2: Trending Hashtags */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Flame className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Chủ đề thịnh hành</h3>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {TRENDING_TAGS.map((item) => {
            const isSelected = selectedTag === item.tag;
            return (
              <button
                key={item.tag}
                type="button"
                onClick={() => onTagClick(item.tag)}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span>#{item.tag}</span>
                <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Widget 3: Community Guidelines */}
      <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-blue-50/40 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-blue-950/20">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-blue-600 dark:text-sky-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Nội quy cộng đồng văn minh
          </h3>
        </div>
        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>Tôn trọng bạn học và giảng viên trong mọi thảo luận.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>Ghi rõ nguồn tài liệu, đề thi hoặc trích dẫn bài toán.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>Khuyến khích trình bày từng bước giải để cùng tiến bộ.</span>
          </li>
        </ul>

        <div className="mt-4 border-t border-slate-200/60 pt-3 dark:border-slate-800">
          <Link
            to="/police-and-legal"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-sky-400"
          >
            Xem quy chế học tập đầy đủ <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </section>
    </aside>
  );
}
