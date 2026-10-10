/* eslint-disable react/prop-types */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Heart,
  MessageSquare, Share2, Bookmark, Send, ShieldCheck, GraduationCap,
  Sparkles, ExternalLink, Pin
} from 'lucide-react';
import toast from 'react-hot-toast';
import Meta from '../../components/Meta.jsx';
import MOLY_ARTICLES, { getMolyArticle } from '../../data/molyArticles.js';
import { useAuthContext } from '../../context/AuthContext.jsx';
import {
  getStoredPosts, saveStoredPosts, getStoredBookmarks,
  toggleStoredBookmark, TOPIC_BADGES
} from '../../features/community/communityData';
import {
  fetchCommunityPostById, toggleLikeCommunityPost,
  addCommentToCommunityPost, toggleBookmarkCommunityPost
} from '../../features/community/communityApi';

const formatDate = (date) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date(date));

export default function PostDetail() {
  const { id } = useParams();
  const { authUser } = useAuthContext();
  const [posts, setPosts] = useState(() => getStoredPosts());
  const [bookmarks, setBookmarks] = useState(() => getStoredBookmarks());
  const [commentText, setCommentText] = useState('');
  const [serverPost, setServerPost] = useState(null);

  // Fetch post from backend if available
  useEffect(() => {
    let isMounted = true;
    fetchCommunityPostById(id).then((data) => {
      if (isMounted && data) {
        setServerPost(data);
      }
    });
    return () => { isMounted = false; };
  }, [id]);

  // Check if this is a community post
  const communityPost = serverPost || posts.find((p) => String(p.id) === String(id));
  const article = !communityPost ? getMolyArticle(id) : null;

  if (!communityPost && !article) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#f8fafc] px-4 dark:bg-slate-950">
        <Meta title="Không tìm thấy bài viết | Moly Course" noindex={true} />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600 dark:text-sky-400">CỘNG ĐỒNG CSCA</p>
          <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white">Không tìm thấy bài viết</h1>
          <p className="mt-2 text-sm text-slate-500">Bài viết hoặc chủ đề thảo luận có thể đã bị xóa hoặc không tồn tại.</p>
          <Link to="/post" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
            <ArrowLeft className="h-4 w-4" /> Về Bảng tin Cộng đồng
          </Link>
        </div>
      </div>
    );
  }

  // Handle Community Post Actions
  if (communityPost) {
    const isLiked = authUser?.id && Array.isArray(communityPost.likedBy) && communityPost.likedBy.includes(String(authUser.id));
    const isBookmarked = bookmarks.includes(communityPost.id);
    const topicInfo = TOPIC_BADGES[communityPost.topic] || { label: 'Thảo luận', badgeClass: 'bg-slate-100 text-slate-700' };

    const handleLike = async () => {
      const userId = authUser?.id ? String(authUser.id) : 'guest';
      const updated = posts.map((p) => {
        if (p.id !== communityPost.id) return p;
        const likedBy = Array.isArray(p.likedBy) ? [...p.likedBy] : [];
        const alreadyLiked = likedBy.includes(userId);
        const newLikedBy = alreadyLiked ? likedBy.filter((i) => i !== userId) : [...likedBy, userId];
        const likesCount = Math.max(0, (p.likesCount || 0) + (alreadyLiked ? -1 : 1));
        return { ...p, likedBy: newLikedBy, likesCount };
      });
      setPosts(updated);
      saveStoredPosts(updated);
      if (serverPost) {
        setServerPost((prev) => {
          if (!prev) return prev;
          const likedBy = Array.isArray(prev.likedBy) ? [...prev.likedBy] : [];
          const alreadyLiked = likedBy.includes(userId);
          const newLikedBy = alreadyLiked ? likedBy.filter((i) => i !== userId) : [...likedBy, userId];
          const likesCount = Math.max(0, (prev.likesCount || 0) + (alreadyLiked ? -1 : 1));
          return { ...prev, likedBy: newLikedBy, likesCount };
        });
      }
      try {
        await toggleLikeCommunityPost(communityPost.id);
      } catch (err) {
        console.warn('Like sync error:', err.message);
      }
    };

    const handleComment = async (e) => {
      e.preventDefault();
      if (!commentText.trim()) return;
      const tempComment = {
        id: `c-${Date.now()}`,
        author: {
          id: authUser?.id || `user-${Date.now()}`,
          name: authUser?.name || authUser?.username || 'Học viên CSCA',
          username: authUser?.username || 'hocvien',
          role: authUser?.role || 'user',
          avatarUrl: authUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser?.name || 'User')}&background=0284c7&color=fff`,
        },
        content: commentText.trim(),
        createdAt: new Date().toISOString(),
        likesCount: 0,
      };

      let serverComment = null;
      try {
        serverComment = await addCommentToCommunityPost(communityPost.id, commentText.trim());
      } catch (err) {
        console.warn('Comment api error:', err.message);
      }

      const commentToAdd = serverComment || tempComment;
      const updated = posts.map((p) => {
        if (p.id !== communityPost.id) return p;
        const comments = Array.isArray(p.comments) ? [...p.comments, commentToAdd] : [commentToAdd];
        return { ...p, comments, commentsCount: comments.length };
      });
      setPosts(updated);
      saveStoredPosts(updated);
      if (serverPost) {
        setServerPost((prev) => {
          if (!prev) return prev;
          const comments = Array.isArray(prev.comments) ? [...prev.comments, commentToAdd] : [commentToAdd];
          return { ...prev, comments, commentsCount: comments.length };
        });
      }
      setCommentText('');
      toast.success('Đã gửi phản hồi thảo luận!');
    };

    const handleShare = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
        toast.success('Đã sao chép liên kết vào bộ nhớ tạm!');
      } else {
        toast.success(`Liên kết: ${window.location.href}`);
      }
    };

    const handleBookmark = async () => {
      const updated = toggleStoredBookmark(communityPost.id);
      setBookmarks(updated);
      toast.success(updated.includes(communityPost.id) ? 'Đã lưu bài viết!' : 'Đã bỏ lưu bài viết.');
      try {
        await toggleBookmarkCommunityPost(communityPost.id);
      } catch (err) {
        console.warn('Bookmark sync error:', err.message);
      }
    };

    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 py-10 transition-colors duration-200">
        <Meta
          title={`${communityPost.title || 'Thảo luận'} | Cộng đồng CSCA`}
          description={communityPost.content.substring(0, 160)}
        />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
          <Link
            to="/post"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại Bảng tin Cộng đồng
          </Link>

          <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {communityPost.isPinned && (
              <div className="mb-4 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Pin className="h-3.5 w-3.5 rotate-45" /> Bài viết được ghim
              </div>
            )}

            {/* Author bar */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src={communityPost.author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(communityPost.author?.name || 'User')}&background=0284c7&color=fff`}
                  alt={communityPost.author?.name}
                  className="h-12 w-12 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {communityPost.author?.name}
                    </h2>
                    {communityPost.author?.role === 'admin' && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                        Quản trị viên
                      </span>
                    )}
                    {communityPost.author?.role === 'creator' && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/60 dark:text-sky-400">
                        Giảng viên
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    @{communityPost.author?.username} · {new Date(communityPost.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${topicInfo.badgeClass}`}>
                {topicInfo.label}
              </span>
            </div>

            {/* Post Title & Content */}
            <div className="mt-6 space-y-4">
              {communityPost.title && (
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  {communityPost.title}
                </h1>
              )}
              <p className="whitespace-pre-line text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-200">
                {communityPost.content}
              </p>
            </div>

            {/* Image if any */}
            {communityPost.imageUrl && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <img
                  src={communityPost.imageUrl}
                  alt="Ảnh đính kèm"
                  className="max-h-[500px] w-full object-cover"
                />
              </div>
            )}

            {/* Tags */}
            {Array.isArray(communityPost.tags) && communityPost.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {communityPost.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-slate-800 dark:text-sky-300"
                  >
                    #{tag.replace(/^#/, '')}
                  </span>
                ))}
              </div>
            )}

            {/* Action Bar */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLike}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition active:scale-95 ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span>{communityPost.likesCount || 0} Lượt thích</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Share2 className="h-4 w-4" /> Chia sẻ
                </button>
              </div>

              <button
                type="button"
                onClick={handleBookmark}
                className={`rounded-xl p-2.5 transition ${
                  isBookmarked
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isBookmarked ? 'Bỏ lưu' : 'Lưu'}
              >
                <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
              </button>
            </div>
          </article>

          {/* Comments Section */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <span>Thảo luận ({communityPost.comments?.length || 0})</span>
            </h3>

            {/* Post comment input */}
            <form onSubmit={handleComment} className="flex gap-3">
              <img
                src={authUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser?.name || authUser?.username || 'You')}&background=0284c7&color=fff`}
                alt="Avatar"
                className="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700 shrink-0 mt-0.5"
              />
              <div className="flex-1 space-y-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  placeholder="Viết phản hồi hoặc chia sẻ suy nghĩ của bạn về chủ đề này..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" /> Gửi phản hồi
                  </button>
                </div>
              </div>
            </form>

            {/* Comment list */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {(communityPost.comments || []).length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-400 italic">
                  Chưa có bình luận nào. Hãy bắt đầu cuộc trò chuyện ngay!
                </p>
              ) : (
                communityPost.comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                    <img
                      src={comment.author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author?.name || 'User')}&background=6366f1&color=fff`}
                      alt={comment.author?.name}
                      className="h-8 w-8 rounded-full border border-slate-200 object-cover dark:border-slate-700 shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {comment.author?.name || 'Học viên'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(comment.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Fallback: If it's a legacy static blog article
  const related = MOLY_ARTICLES.filter((item) => item.id !== article.id && item.category === article.category).slice(0, 2);

  return (
    <div className="min-h-screen bg-[#fffaf6] py-12 dark:bg-slate-950 sm:py-16">
      <Meta
        title={`${article.title} | MOLY COURSE 2026`}
        description={article.excerpt}
        keywords={`MOLY COURSE 2026, ${article.tags.join(', ')}`}
        type="article"
        url={`https://www.molycourse.online/post/${article.id}`}
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
