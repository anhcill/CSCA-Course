/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, Search, Sparkles } from 'lucide-react';
import Meta from '../../components/Meta.jsx';
import MOLY_ARTICLES from '../../data/molyArticles.js';

const CATEGORIES = ['TẤT CẢ', ...new Set(MOLY_ARTICLES.map((article) => article.category))];

const formatDate = (date) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date(date));

function ArticleCard({ article, featured = false }) {
  return (
    <article className={`group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-slate-900 ${featured ? 'lg:grid lg:grid-cols-[0.95fr_1.05fr]' : ''}`}>
      <div className={`relative overflow-hidden bg-gradient-to-br ${article.tone} ${featured ? 'min-h-64 lg:min-h-full' : 'h-48'}`}>
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-white/25" />
        <div className="absolute bottom-6 left-6 right-6">
          <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-white backdrop-blur">
            {article.category}
          </span>
          <p className="mt-5 max-w-xs text-4xl font-black leading-none tracking-tight text-white/95">MOLY<br />COURSE</p>
          <p className="mt-3 text-sm font-semibold text-white/75">2026 · Học đúng mục tiêu</p>
        </div>
      </div>
      <div className="flex flex-col p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(article.publishedAt)}</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{article.readTime}</span>
        </div>
        <h2 className="mt-4 text-xl font-black leading-tight text-slate-950 transition group-hover:text-red-600 dark:text-white dark:group-hover:text-amber-300">
          {article.title}
        </h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{article.excerpt}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {article.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">#{tag}</span>)}
        </div>
        <Link to={`/post/${article.id}`} className="mt-6 inline-flex items-center gap-2 text-sm font-black text-red-600 transition group-hover:gap-3 dark:text-amber-300">
          Đọc bài viết <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}


const BLOG_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Trang chủ",
          "item": "https://www.molycourse.online/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Bài viết & Tin tức",
          "item": "https://www.molycourse.online/post"
        }
      ]
    },
    {
      "@type": "CollectionPage",
      "@id": "https://www.molycourse.online/post#collection",
      "url": "https://www.molycourse.online/post",
      "name": "Bài viết & Cẩm nang du học Trung Quốc | Moly Course",
      "description": "Tổng hợp bài viết chia sẻ kinh nghiệm học tiếng Trung, lộ trình ôn thi HSK, HSKK, bí quyết luyện thi CSCA và chuẩn bị hồ sơ du học Trung Quốc.",
      "publisher": {
        "@type": "Organization",
        "name": "Moly Course",
        "logo": {
          "@type": "ImageObject",
          "url": "https://www.molycourse.online/favicon-512x512.png"
        }
      }
    }
  ]
};

export default function Post() {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('TẤT CẢ');

  const articles = useMemo(() => {
    const needle = searchTerm.trim().toLocaleLowerCase('vi');
    return MOLY_ARTICLES.filter((article) => {
      const matchesCategory = category === 'TẤT CẢ' || article.category === category;
      const searchable = [article.title, article.excerpt, article.category, ...article.tags].join(' ').toLocaleLowerCase('vi');
      return matchesCategory && (!needle || searchable.includes(needle));
    });
  }, [category, searchTerm]);

  return (
    <div className="min-h-screen bg-[#fffaf6] py-12 dark:bg-slate-950 sm:py-16">
      <Meta
        title="Bài Viết & Cẩm Nang Luyện Thi CSCA, Tiếng Trung HSK | Moly Course"
        description="Tổng hợp bài viết hướng dẫn học tiếng Trung từ số 0, cẩm nang luyện thi HSK, HSKK, bí quyết thi CSCA và kinh nghiệm làm hồ sơ học bổng du học Trung Quốc."
        keywords="Moly Course, bài viết tiếng Trung, luyện thi HSK, kinh nghiệm thi CSCA, hồ sơ du học Trung Quốc"
        url="https://www.molycourse.online/post"
        structuredData={BLOG_STRUCTURED_DATA}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white shadow-2xl sm:px-10 lg:px-14 lg:py-16">
          <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-red-600/40 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-amber-200"><Sparkles className="h-3.5 w-3.5" /> MOLY COURSE 2026</span>
            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Góc học tập<br /><span className="text-amber-300">đúng mục tiêu</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Những hướng dẫn ngắn gọn, thực tế và được viết mới để bạn học tiếng Trung, chuẩn bị kỳ thi và xây dựng kế hoạch du học rõ ràng hơn.</p>
          </div>
        </header>

        <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Lọc chuyên mục">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-4 py-2 text-xs font-black transition ${category === item ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-red-600 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10 dark:hover:text-amber-300'}`}>
                {item}
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Tìm bài viết</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Tìm trong bài viết..." className="w-full rounded-2xl border-0 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-red-500 dark:bg-slate-900 dark:text-white dark:ring-white/10 dark:focus:ring-amber-400" />
          </label>
        </div>

        {articles.length > 0 ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {articles.map((article, index) => <ArticleCard key={article.id} article={article} featured={index === 0 && !searchTerm && category === 'TẤT CẢ'} />)}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl bg-white px-6 py-16 text-center shadow-sm dark:bg-slate-900">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Chưa tìm thấy bài viết phù hợp</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Thử từ khóa khác hoặc chọn lại chuyên mục.</p>
          </div>
        )}
      </div>
    </div>
  );
}
