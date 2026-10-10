/* eslint-disable react/prop-types */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, MessageSquare, Share2, Bookmark, MoreHorizontal, Trash2,
  Send, Pin, CheckCircle2, ShieldCheck, GraduationCap, Sparkles, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TOPIC_BADGES } from '../communityData';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return 'Vừa xong';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr));
};

export default function CommunityPostCard({
  post,
  currentUser,
  onLike,
  onComment,
  onDelete,
  isBookmarked,
  onToggleBookmark,
  onTagClick,
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isLiked = currentUser?.id && Array.isArray(post.likedBy) && post.likedBy.includes(String(currentUser.id));
  const isAuthor = currentUser?.id && String(post.author?.id) === String(currentUser.id);
  const isAdmin = currentUser?.role === 'admin';
  const topicInfo = TOPIC_BADGES[post.topic] || { label: 'Thảo luận', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };

  const handleShare = (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success('Đã sao chép liên kết bài viết vào bộ nhớ đệm!');
    } else {
      toast.success(`Liên kết: ${url}`);
    }
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      onComment(post.id, commentText.trim());
      setCommentText('');
      setShowComments(true);
      toast.success('Đã gửi bình luận!');
    } catch {
      toast.error('Không thể gửi bình luận.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const renderBadge = () => {
    if (post.author?.role === 'admin' || post.author?.badge === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800">
          <ShieldCheck className="h-3 w-3" /> Quản trị viên
        </span>
      );
    }
    if (post.author?.role === 'creator' || post.author?.badge === 'teacher') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-sky-300 dark:ring-blue-800">
          <GraduationCap className="h-3 w-3" /> Giảng viên
        </span>
      );
    }
    if (post.author?.badge === 'top_student') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800">
          <Sparkles className="h-3 w-3" /> Học viên tiêu biểu
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
        Học viên CSCA
      </span>
    );
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      {post.isPinned && (
        <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          <Pin className="h-3.5 w-3.5 rotate-45" /> Bài viết được ghim từ Ban Quản Trị
        </div>
      )}

      {/* Header: Author + Meta */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={post.author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author?.name || 'User')}&background=0284c7&color=fff`}
            alt={post.author?.name || 'Tác giả'}
            className="h-10 w-10 rounded-full border border-slate-200 object-cover shadow-xs dark:border-slate-700"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm hover:underline cursor-pointer">
                {post.author?.name || 'Thành viên ẩn danh'}
              </span>
              {renderBadge()}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {post.author?.username && <span>@{post.author.username}</span>}
              <span>·</span>
              <span>{formatTimeAgo(post.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${topicInfo.badgeClass}`}>
            {topicInfo.label}
          </span>

          {(isAuthor || isAdmin) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Tùy chọn bài viết"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onDelete(post.id); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Xóa bài viết
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title & Body */}
      <div className="mt-3.5 space-y-2">
        {post.title && (
          <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
            {post.title}
          </h2>
        )}
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {post.content}
        </p>
      </div>

      {/* Image Preview if available */}
      {post.imageUrl && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-800">
          <img
            src={post.imageUrl}
            alt="Đính kèm bài viết"
            className="max-h-96 w-full object-cover transition duration-300 hover:scale-[1.01]"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Tags */}
      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick && onTagClick(tag)}
              className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
            >
              #{tag.replace(/^#/, '')}
            </button>
          ))}
        </div>
      )}

      {/* Action Bar (Like, Comment, Bookmark, Share) */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Like */}
          <button
            type="button"
            onClick={() => onLike(post.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-90 ${
              isLiked
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                : 'text-slate-600 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>{post.likesCount || 0}</span>
            <span className="hidden sm:inline font-normal">Thích</span>
          </button>

          {/* Comment toggle */}
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              showComments
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400'
                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>{(post.comments || []).length || post.commentsCount || 0}</span>
            <span className="hidden sm:inline font-normal">Bình luận</span>
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline font-normal">Chia sẻ</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Bookmark */}
          <button
            type="button"
            onClick={() => onToggleBookmark(post.id)}
            className={`rounded-xl p-2 text-xs transition ${
              isBookmarked
                ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-400'
                : 'text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800'
            }`}
            title={isBookmarked ? 'Bỏ lưu bài viết' : 'Lưu bài viết'}
          >
            <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>

          {/* Direct link to detail */}
          <Link
            to={`/post/${post.id}`}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-sky-400"
            title="Mở toàn màn hình bài viết"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Expandable Comments Drawer */}
      {showComments && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
          {/* Input Box */}
          <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <img
              src={currentUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'Bạn')}&background=0284c7&color=fff`}
              alt="Avatar của bạn"
              className="h-8 w-8 rounded-full border border-slate-200 object-cover dark:border-slate-700 shrink-0"
            />
            <div className="relative flex-1">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Viết câu trả lời hoặc thảo luận..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 pr-10 text-xs text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:text-sky-400 dark:hover:bg-slate-700"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>

          {/* Comments List */}
          <div className="mt-3.5 space-y-2.5">
            {(post.comments || []).length === 0 ? (
              <p className="text-center py-3 text-xs text-slate-400 italic">
                Chưa có bình luận nào. Hãy là người đầu tiên trao đổi!
              </p>
            ) : (
              (post.comments || []).map((comment) => (
                <div key={comment.id} className="flex items-start gap-2.5 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-800/50">
                  <img
                    src={comment.author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author?.name || 'User')}&background=6366f1&color=fff`}
                    alt={comment.author?.name}
                    className="h-7 w-7 rounded-full border border-slate-200 object-cover dark:border-slate-700 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {comment.author?.name || 'Học viên'}
                        </span>
                        {comment.author?.role === 'creator' && (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded-full">
                            Giảng viên
                          </span>
                        )}
                        {comment.author?.role === 'admin' && (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded-full">
                            QTV
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}
