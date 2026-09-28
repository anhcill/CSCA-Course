import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Compass, HeartHandshake, Sparkles } from 'lucide-react';
import Meta from '../../components/Meta.jsx';

const values = [
  {
    icon: Compass,
    title: 'Học theo mục tiêu',
    body: 'Mỗi lộ trình bắt đầu từ mục tiêu thật của học viên: giao tiếp, HSK, HSKK, CSCA hay chuẩn bị kế hoạch học tập tại Trung Quốc.'
  },
  {
    icon: BookOpenCheck,
    title: 'Học có hệ thống',
    body: 'Nội dung được chia thành các chặng vừa sức, kết hợp kiến thức nền, luyện tập và phản hồi để bạn biết mình cần cải thiện điều gì.'
  },
  {
    icon: HeartHandshake,
    title: 'Đồng hành rõ ràng',
    body: 'MOLY COURSE ưu tiên tư vấn minh bạch, hướng dẫn dễ hiểu và hỗ trợ đúng phần việc trong từng giai đoạn học tập.'
  }
];

export default function About() {
  return (
    <div className="min-h-screen bg-[#fffaf6] py-12 dark:bg-slate-950 sm:py-16">
      <Meta
        title="Về MOLY COURSE 2026"
        description="MOLY COURSE 2026 xây dựng lộ trình học tiếng Trung, HSK, HSKK, CSCA và chuẩn bị kế hoạch học tập tại Trung Quốc."
        keywords="MOLY COURSE 2026, về chúng tôi, học tiếng Trung, HSK, HSKK, CSCA"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-red-700 via-red-600 to-orange-500 px-6 py-14 text-white shadow-2xl sm:px-10 lg:px-16 lg:py-20">
          <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em]"><Sparkles className="h-3.5 w-3.5" /> MOLY COURSE 2026</span>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Học đúng hướng.<br /><span className="text-amber-200">Tiến bộ thật.</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">MOLY COURSE là không gian học tập dành cho những bạn muốn xây nền tiếng Trung vững, chuẩn bị kỳ thi có kế hoạch và từng bước mở rộng cơ hội học tập tại Trung Quốc.</p>
          </div>
        </header>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {values.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-amber-300"><Icon className="h-6 w-6" /></span>
              <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600 dark:text-amber-300">Tinh thần Moly</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Không học một mình trên một hành trình dài.</h2>
          </div>
          <div className="space-y-4 text-base leading-8 text-slate-600 dark:text-slate-300">
            <p>Chúng tôi tin rằng một lộ trình tốt không chỉ có giáo trình. Người học cần biết bắt đầu từ đâu, học đến mức nào là đủ cho mục tiêu hiện tại và làm gì tiếp theo khi gặp khó khăn.</p>
            <p>Vì vậy, các nội dung của MOLY COURSE được trình bày theo hướng thực tế: mục tiêu rõ, bài học có thể thực hành và tiến độ có thể nhìn thấy. Bạn có thể bắt đầu từ nền tảng hôm nay rồi nâng dần mức độ theo nhịp học của chính mình.</p>
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="text-2xl font-black">Sẵn sàng chọn lộ trình của bạn?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Xem các chương trình học hoặc nhắn Zalo 0815913408 để được tư vấn.</p>
          </div>
          <Link to="/courses" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">Xem khóa học <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </div>
  );
}
