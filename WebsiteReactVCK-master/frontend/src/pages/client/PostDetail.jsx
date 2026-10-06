import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import Meta from '../../components/Meta.jsx';
import MOLY_ARTICLES, { getMolyArticle } from '../../data/molyArticles.js';

const formatDate = (date) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date(date));

export default function PostDetail() {
  const { id } = useParams();
  const article = getMolyArticle(id);

  if (!article) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#fffaf6] px-4 dark:bg-slate-950">
        <Meta title="Không tìm thấy bài viết | Moly Course" noindex={true} />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600 dark:text-amber-300">MOLY COURSE 2026</p>
          <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white">Không tìm thấy bài viết</h1>
          <Link to="/post" className="mt-6 inline-flex items-center gap-2 font-bold text-red-600 dark:text-amber-300"><ArrowLeft className="h-4 w-4" /> Về danh sách bài viết</Link>
        </div>
      </div>
    );
  }

  const related = MOLY_ARTICLES.filter((item) => item.id !== article.id && item.category === article.category).slice(0, 2);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": article.title,
    "description": article.excerpt,
    "datePublished": article.publishedAt,
    "author": {
      "@type": "Organization",
      "name": article.author || "Moly Course"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Moly Course",
      "logo": {
        "@type": "ImageObject",
        "url": "https://molycourse.online/favicon-512x512.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://molycourse.online/post/${article.id}`
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf6] py-12 dark:bg-slate-950 sm:py-16">
      <Meta
        title={`${article.title} | MOLY COURSE 2026`}
        description={article.excerpt}
        keywords={`MOLY COURSE 2026, ${article.tags.join(', ')}`}
        type="article"
        url={`https://molycourse.online/post/${article.id}`}
        structuredData={articleSchema}
      />
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link to="/post" className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-red-600 dark:text-slate-300 dark:hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Tất cả bài viết</Link>

        <article className="mt-8 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className={`relative overflow-hidden bg-gradient-to-br ${article.tone} px-6 py-14 text-white sm:px-12 sm:py-20`}>
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/20" />
            <div className="relative max-w-3xl">
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-black tracking-[0.18em] backdrop-blur">{article.category}</span>
              <h1 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-5xl">{article.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">{article.excerpt}</p>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/80">
                <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(article.publishedAt)}</span>
                <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />{article.readTime}</span>
                <span>{article.author}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-10 sm:px-12 sm:py-14">
            <div className="mb-10 flex flex-wrap gap-2">
              {article.tags.map((tag) => <span key={tag} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-amber-200">#{tag}</span>)}
            </div>
            <div className="space-y-10">
              {article.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{section.heading}</h2>
                  <div className="mt-4 space-y-4 text-base leading-8 text-slate-600 dark:text-slate-300">
                    {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {section.bullets && (
                      <ul className="space-y-3 rounded-2xl bg-slate-50 p-5 dark:bg-white/5 sm:p-6">
                        {section.bullets.map((bullet) => <li key={bullet} className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-red-600 dark:text-amber-300" /><span>{bullet}</span></li>)}
                      </ul>
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              Nội dung được biên soạn cho mục đích tham khảo và học tập. Với yêu cầu tuyển sinh hoặc kỳ thi, hãy kiểm tra thông báo chính thức của đơn vị tổ chức trước khi đưa ra quyết định.
            </div>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">Đọc tiếp</h2>
              <Link to="/post" className="text-sm font-bold text-red-600 dark:text-amber-300">Xem tất cả</Link>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {related.map((item) => (
                <Link key={item.id} to={`/post/${item.id}`} className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:ring-white/10">
                  <span className="text-[10px] font-black tracking-[0.18em] text-red-600 dark:text-amber-300">{item.category}</span>
                  <h3 className="mt-3 font-black leading-6 text-slate-900 group-hover:text-red-600 dark:text-white dark:group-hover:text-amber-300">{item.title}</h3>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">Đọc tiếp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
