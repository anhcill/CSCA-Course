/* eslint-disable react/prop-types */
import { useState } from 'react';
import {
  HelpCircle, BookOpen, Award, Users, MessageCircle, Image, Tag,
  Send, Sparkles, X, ChevronDown, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { COMMUNITY_TOPICS } from '../communityData';

export default function CreatePostCard({ currentUser, onPostCreated }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('qa');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const availableTopics = COMMUNITY_TOPICS.filter((t) => t.id !== 'all');

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().replace(/^[#,]/, '');
      if (clean && !tags.includes(clean)) {
        if (tags.length >= 5) {
          toast.error('Tối đa 5 thẻ tag');
          return;
        }
        setTags([...tags, clean]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error('Vui lòng nhập nội dung bài viết!');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim() || undefined,
        content: content.trim(),
        topic,
        imageUrl: imageUrl.trim() || undefined,
        tags: tags.length ? tags : ['ThaoLuanCSCA'],
      };

      await onPostCreated(payload);

      // Reset
      setTitle('');
      setContent('');
      setImageUrl('');
      setShowImageInput(false);
      setTags([]);
      setTagInput('');
      setIsExpanded(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Không thể đăng bài viết.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all">
      <div className="flex items-start gap-3">
        <img
          src={currentUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'Ban')}&background=0284c7&color=fff`}
          alt="Avatar của bạn"
          className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700 shrink-0 mt-0.5"
        />

        <div className="flex-1">
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs sm:text-sm text-slate-500 hover:border-blue-300 hover:bg-white hover:text-slate-800 transition dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            >
              <span>Bạn có bài tập cần hỏi, kinh nghiệm hay tài liệu muốn chia sẻ?...</span>
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Topic Selector */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 mr-1">Chủ đề:</span>
                {availableTopics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTopic(t.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      topic === t.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Title input */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tiêu đề câu hỏi hoặc chủ đề thảo luận (tùy chọn)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-sky-500"
                maxLength={200}
              />

              {/* Content Textarea */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Nêu chi tiết câu hỏi, bài toán cần giải đáp, tài liệu hoặc chia sẻ của bạn..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-sky-500"
                required
              />

              {/* Image Input Drawer if toggled */}
              {showImageInput && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-2.5 dark:border-slate-700">
                  <Image className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Dán đường dẫn ảnh đính kèm (URL ảnh đề thi, hình chụp bài tập...)"
                    className="flex-1 bg-transparent text-xs text-slate-800 outline-none dark:text-slate-200"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Image Live Preview */}
              {imageUrl && (
                <div className="relative max-h-48 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <img
                    src={imageUrl}
                    alt="Xem trước ảnh đính kèm"
                    className="max-h-48 w-full object-cover"
                    onError={(e) => {
                      toast.error('Không thể tải URL ảnh này.');
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Tagging */}
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300"
                  >
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Thêm thẻ (nhấn Enter để thêm)..."
                    className="rounded-lg bg-transparent py-1 text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowImageInput(!showImageInput)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      showImageInput || imageUrl
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Image className="h-3.5 w-3.5" /> Thêm ảnh
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Thu gọn
                  </button>
                  <button
                    type="submit"
                    disabled={!content.trim() || submitting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" /> {submitting ? 'Đang đăng...' : 'Đăng bài'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
