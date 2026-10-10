/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Search, MessageSquare, Flame, Clock, Bookmark, User,
  Filter, HelpCircle, BookOpen, Award, Users, RefreshCw, X, MessageCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import Meta from '../../components/Meta.jsx';
import { useAuthContext } from '../../context/AuthContext.jsx';
import {
  COMMUNITY_TOPICS, getStoredPosts, saveStoredPosts,
  getStoredBookmarks, toggleStoredBookmark
} from '../../features/community/communityData';
import {
  fetchCommunityPosts, createCommunityPost, toggleLikeCommunityPost,
  addCommentToCommunityPost, toggleBookmarkCommunityPost, deleteCommunityPostApi
} from '../../features/community/communityApi';
import CommunityPostCard from '../../features/community/components/CommunityPostCard';
import CreatePostCard from '../../features/community/components/CreatePostCard';
import CommunitySidebar from '../../features/community/components/CommunitySidebar';

const SORT_OPTIONS = [
  { id: 'trending', label: 'Sôi nổi nhất', icon: Flame },
  { id: 'latest', label: 'Mới nhất', icon: Clock },
  { id: 'saved', label: 'Đã lưu', icon: Bookmark },
  { id: 'mine', label: 'Bài của tôi', icon: User },
];

export default function Post() {
  const { authUser } = useAuthContext();
  const [posts, setPosts] = useState(() => getStoredPosts());
  const [bookmarks, setBookmarks] = useState(() => getStoredBookmarks());
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedSort, setSelectedSort] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [loading, setLoading] = useState(false);

  // Load real posts from PostgreSQL Backend API on mount & on filters
  useEffect(() => {
    let isMounted = true;
    const loadPosts = async () => {
      setLoading(true);
      try {
        const backendPosts = await fetchCommunityPosts();
        if (isMounted && backendPosts && Array.isArray(backendPosts)) {
          setPosts(backendPosts);
          saveStoredPosts(backendPosts);
        }
      } catch (err) {
        console.warn('Could not load backend posts:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadPosts();
    return () => { isMounted = false; };
  }, []);

  // Synchronize posts back to state and cache
  const handleUpdatePosts = (newPosts) => {
    setPosts(newPosts);
    saveStoredPosts(newPosts);
  };

  const handlePostCreated = async (payload) => {
    try {
      const created = await createCommunityPost(payload);
      if (created) {
        const updated = [created, ...posts];
        handleUpdatePosts(updated);
        toast.success('Đã đăng bài viết thành công lên Cộng đồng! 🎉');
        return;
      }
    } catch (err) {
      console.warn('Backend create post error, falling back to local:', err);
    }
    // Fallback if not logged in or offline
    const fallback = {
      id: `post-${Date.now()}`,
      author: {
        id: authUser?.id || `anon-${Date.now()}`,
        name: authUser?.name || authUser?.username || 'Học viên CSCA',
        username: authUser?.username || 'hocvien',
        role: authUser?.role || 'user',
        avatarUrl: authUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser?.name || 'User')}&background=0284c7&color=fff`,
      },
      ...payload,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      likedBy: [],
      commentsCount: 0,
      comments: [],
    };
    const updated = [fallback, ...posts];
    handleUpdatePosts(updated);
    toast.success('Đã lưu bài viết của bạn! 🎉');
  };

  const handleLikePost = async (postId) => {
    const userId = authUser?.id ? String(authUser.id) : 'guest';
    const updated = posts.map((post) => {
      if (post.id !== postId) return post;
      const likedBy = Array.isArray(post.likedBy) ? [...post.likedBy] : [];
      const alreadyLiked = likedBy.includes(userId);
      const newLikedBy = alreadyLiked
        ? likedBy.filter((id) => id !== userId)
        : [...likedBy, userId];
      const likesCount = Math.max(0, (post.likesCount || 0) + (alreadyLiked ? -1 : 1));
      return { ...post, likedBy: newLikedBy, likesCount };
    });
    handleUpdatePosts(updated);

    try {
      await toggleLikeCommunityPost(postId);
    } catch (err) {
      console.warn('Backend like sync error:', err.message);
    }
  };

  const handleCommentPost = async (postId, text) => {
    const tempComment = {
      id: `c-${Date.now()}`,
      author: {
        id: authUser?.id || `user-${Date.now()}`,
        name: authUser?.name || authUser?.username || 'Học viên CSCA',
        username: authUser?.username || 'hocvien',
        role: authUser?.role || 'user',
        avatarUrl: authUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser?.name || 'User')}&background=0284c7&color=fff`,
      },
      content: text,
      createdAt: new Date().toISOString(),
      likesCount: 0,
    };

    let serverComment = null;
    try {
      serverComment = await addCommentToCommunityPost(postId, text);
    } catch (err) {
      console.warn('Backend comment error, using local:', err.message);
    }

    const commentToAdd = serverComment || tempComment;
    const updated = posts.map((post) => {
      if (post.id !== postId) return post;
      const comments = Array.isArray(post.comments) ? [...post.comments, commentToAdd] : [commentToAdd];
      return { ...post, comments, commentsCount: comments.length };
    });
    handleUpdatePosts(updated);
  };

  const handleDeletePost = async (postId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) {
      const updated = posts.filter((p) => p.id !== postId);
      handleUpdatePosts(updated);
      try {
        await deleteCommunityPostApi(postId);
      } catch (err) {
        console.warn('Backend delete error:', err.message);
      }
      toast.success('Đã xóa bài viết.');
    }
  };

  const handleToggleBookmark = async (postId) => {
    const updated = toggleStoredBookmark(postId);
    setBookmarks(updated);
    toast.success(updated.includes(postId) ? 'Đã lưu bài viết vào danh sách của bạn!' : 'Đã bỏ lưu bài viết.');
    try {
      await toggleBookmarkCommunityPost(postId);
    } catch (err) {
      console.warn('Backend bookmark error:', err.message);
    }
  };

  const handleTagClick = (tag) => {
    const clean = tag.replace(/^#/, '');
    setSelectedTag((prev) => (prev === clean ? '' : clean));
  };

  const clearFilters = () => {
    setSelectedTopic('all');
    setSelectedSort('trending');
    setSearchQuery('');
    setSelectedTag('');
  };

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    // Filter by Topic
    if (selectedTopic !== 'all') {
      result = result.filter((p) => p.topic === selectedTopic);
    }

    // Filter by Tag
    if (selectedTag) {
      result = result.filter((p) => Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      result = result.filter((p) => {
        const text = [p.title || '', p.content || '', p.author?.name || '', ...(p.tags || [])].join(' ').toLowerCase();
        return text.includes(needle);
      });
    }

    // Filter by Sort & Tab
    if (selectedSort === 'saved') {
      result = result.filter((p) => bookmarks.includes(p.id));
    } else if (selectedSort === 'mine') {
      const currentId = String(authUser?.id || '');
      result = result.filter((p) => String(p.author?.id) === currentId);
    } else if (selectedSort === 'trending') {
      // Hot: combination of likes and comments, pinned posts always top
      result.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const scoreA = (a.likesCount || 0) * 2 + ((a.comments || []).length || a.commentsCount || 0) * 3;
        const scoreB = (b.likesCount || 0) * 2 + ((b.comments || []).length || b.commentsCount || 0) * 3;
        return scoreB - scoreA;
      });
    } else if (selectedSort === 'latest') {
      result.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    }

    return result;
  }, [posts, selectedTopic, selectedTag, searchQuery, selectedSort, bookmarks, authUser]);

  const hasActiveFilter = selectedTopic !== 'all' || selectedTag || searchQuery.trim() || selectedSort === 'saved' || selectedSort === 'mine';

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 py-8 transition-colors duration-200">
      <Meta
        title="Cộng Đồng Học Tập & Trao Đổi Kiến Thức CSCA | Moly Course"
        description="Mạng xã hội học tập thu nhỏ dành cho học viên và giảng viên CSCA & Tiếng Trung: hỏi đáp bài tập, trao đổi giải đề, tìm bạn học nhóm và chia sẻ tài liệu."
        keywords="Cộng đồng CSCA, hỏi đáp toán CSCA, nhóm học tập, tài liệu luyện thi CSCA, Moly Course"
        url="https://www.molycourse.online/post"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Hero Banner Header */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 sm:p-10 text-white shadow-xl dark:border dark:border-slate-800">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl" />

          <div className="relative max-w-3xl space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-sky-300 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Mạng xã hội học tập CSCA
            </span>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Cộng Đồng Trao Đổi & Học Tập
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              Nơi học viên và thầy cô cùng giải đáp bài tập, chia sẻ chiến thuật làm đề thi CSCA, kết nối nhóm học và đồng hành đến ngày thi.
            </p>

            {/* Quick Community Metrics */}
            <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
              <span className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur">
                <Users className="h-3.5 w-3.5 text-sky-400" /> 2,400+ Học viên
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> {posts.length} Chủ đề thảo luận
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur">
                <Award className="h-3.5 w-3.5 text-amber-400" /> 98% Câu hỏi có giải đáp
              </span>
            </div>
          </div>
        </header>

        {/* Top Control Bar: Channels + Search */}
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          {/* Topics bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0" aria-label="Kênh thảo luận">
            {COMMUNITY_TOPICS.map((topic) => {
              const isSelected = selectedTopic === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setSelectedTopic(topic.id)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {topic.label}
                </button>
              );
            })}
          </div>

          {/* Search bar */}
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm câu hỏi, đề bài, tác giả..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-sky-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* Secondary Bar: Sort switcher & Active filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sort Filter Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800/80">
            {SORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedSort === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedSort(opt.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Filter Indicators */}
          {hasActiveFilter && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Đang lọc:</span>
              {selectedTag && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-950 dark:text-sky-300">
                  #{selectedTag}
                  <button type="button" onClick={() => setSelectedTag('')}><X className="h-3 w-3" /></button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  &ldquo;{searchQuery}&rdquo;
                  <button type="button" onClick={() => setSearchQuery('')}><X className="h-3 w-3" /></button>
                </span>
              )}
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline dark:text-sky-400"
              >
                <RefreshCw className="h-3 w-3" /> Đặt lại
              </button>
            </div>
          )}
        </div>

        {/* Main Layout: 2 Columns (Feed + Sidebar) */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Feed Column */}
          <main className="space-y-4">
            {/* Create Post Widget */}
            <CreatePostCard currentUser={authUser} onPostCreated={handlePostCreated} />

            {/* Posts List */}
            {filteredPosts.length > 0 ? (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
                  <CommunityPostCard
                    key={post.id}
                    post={post}
                    currentUser={authUser}
                    onLike={handleLikePost}
                    onComment={handleCommentPost}
                    onDelete={handleDeletePost}
                    isBookmarked={bookmarks.includes(post.id)}
                    onToggleBookmark={handleToggleBookmark}
                    onTagClick={handleTagClick}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400 mb-3">
                  <MessageCircle className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Chưa có bài thảo luận phù hợp
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {hasActiveFilter
                    ? 'Thử thay đổi bộ lọc, tìm từ khóa khác hoặc đặt lại điều kiện tìm kiếm.'
                    : 'Hãy là người đầu tiên đặt câu hỏi hoặc chia sẻ tài liệu cho cộng đồng!'}
                </p>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Xem tất cả bài viết
                  </button>
                )}
              </div>
            )}
          </main>

          {/* Right Sidebar Widgets */}
          <CommunitySidebar onTagClick={handleTagClick} selectedTag={selectedTag} />
        </div>
      </div>
    </div>
  );
}
