import express from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

const parseId = (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0 ? Number(value) : null;
const invalid = (res, message) => res.status(422).json({ success: false, message, errorCode: "VALIDATION_ERROR" });

// Optional auth middleware so guests can browse posts while authenticated users get isLiked/isBookmarked
const optionalAuth = async (req, res, next) => {
  const token = req.cookies?.jwt;
  if (!token) return next();
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, username, email, role, avatar_url, is_locked FROM users WHERE id = $1`,
      [verified.userId]
    );
    if (rows[0] && !rows[0].is_locked) {
      req.user = rows[0];
    }
  } catch {
    // Ignore invalid token in optional auth
  }
  next();
};

const formatAuthor = (row) => ({
  id: String(row.author_id),
  name: row.author_name || row.author_username || "Học viên CSCA",
  username: row.author_username || "hocvien",
  role: row.author_role || "user",
  roleLabel: row.author_role === "admin" ? "Quản trị viên" : row.author_role === "creator" ? "Giảng viên" : "Học viên CSCA",
  avatarUrl: row.author_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(row.author_name || row.author_username || "User")}&background=0284c7&color=fff`,
  badge: row.author_role === "admin" ? "admin" : row.author_role === "creator" ? "teacher" : undefined,
});

// GET /api/posts - Get community feed
router.get("/", optionalAuth, async (req, res) => {
  try {
    const currentUserId = req.user ? req.user.id : null;
    const { topic, search, tag, sort, page = 1, limit = 40 } = req.query;

    const conditions = [];
    const params = [];

    if (topic && topic !== "all") {
      params.push(topic);
      conditions.push(`p.topic = $${params.length}`);
    }

    if (tag) {
      params.push(tag.replace(/^#/, ""));
      conditions.push(`$${params.length} = ANY(p.tags)`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(LOWER(p.title) LIKE $${params.length} OR LOWER(p.content) LIKE $${params.length} OR LOWER(u.username) LIKE $${params.length} OR LOWER(COALESCE(sp.full_name, '')) LIKE $${params.length})`);
    }

    if (sort === "mine" && currentUserId) {
      params.push(currentUserId);
      conditions.push(`p.author_id = $${params.length}`);
    }

    if (sort === "saved" && currentUserId) {
      params.push(currentUserId);
      conditions.push(`EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = $${params.length})`);
    }

    let orderBy = "p.is_pinned DESC, p.created_at DESC";
    if (sort === "trending") {
      orderBy = "p.is_pinned DESC, (p.likes_count * 2 + p.comments_count * 3) DESC, p.created_at DESC";
    } else if (sort === "latest") {
      orderBy = "p.is_pinned DESC, p.created_at DESC";
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    params.push(Math.min(100, Math.max(1, parseInt(limit, 10))));
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const sql = `
      SELECT
        p.id, p.author_id, p.title, p.slug, p.content, p.image_url, p.topic,
        p.is_pinned, p.likes_count, p.comments_count, p.tags, p.created_at, p.updated_at,
        u.username AS author_username,
        u.role AS author_role,
        u.avatar_url AS author_avatar,
        COALESCE(sp.full_name, u.management_display_name, u.username) AS author_name,
        COALESCE((
          SELECT array_agg(pl.user_id::text)
          FROM post_likes pl WHERE pl.post_id = p.id
        ), '{}') AS liked_by,
        ${currentUserId ? `EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = ${currentUserId})` : "false"} AS is_bookmarked
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const { rows } = await query(sql, params);

    // Fetch latest 3 comments for each post
    const postIds = rows.map((r) => r.id);
    let commentsByPost = {};
    if (postIds.length > 0) {
      const commSql = `
        SELECT
          c.id, c.post_id, c.author_id, c.content, c.likes_count, c.created_at,
          u.username, u.role, u.avatar_url,
          COALESCE(sp.full_name, u.management_display_name, u.username) AS author_name
        FROM post_comments c
        JOIN users u ON u.id = c.author_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE c.post_id = ANY($1::bigint[])
        ORDER BY c.created_at ASC
      `;
      const commRes = await query(commSql, [postIds]);
      commRes.rows.forEach((c) => {
        if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
        commentsByPost[c.post_id].push({
          id: String(c.id),
          author: {
            id: String(c.author_id),
            name: c.author_name,
            username: c.username,
            role: c.role,
            avatarUrl: c.avatar_url,
          },
          content: c.content,
          likesCount: c.likes_count,
          createdAt: c.created_at,
        });
      });
    }

    const formattedPosts = rows.map((row) => ({
      id: String(row.id),
      title: row.title || undefined,
      content: row.content,
      imageUrl: row.image_url || undefined,
      topic: row.topic || "qa",
      isPinned: Boolean(row.is_pinned),
      likesCount: Number(row.likes_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
      tags: row.tags || [],
      createdAt: row.created_at,
      author: formatAuthor(row),
      likedBy: row.liked_by || [],
      isBookmarked: Boolean(row.is_bookmarked),
      comments: commentsByPost[row.id] || [],
    }));

    return res.json({
      success: true,
      data: formattedPosts,
    });
  } catch (error) {
    console.error("Error in GET /api/posts:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi tải bài viết", errorCode: "SERVER_ERROR" });
  }
});

// GET /api/posts/:id - Get single post detail with all comments
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return invalid(res, "ID bài viết không hợp lệ");

    const currentUserId = req.user ? req.user.id : null;

    const sql = `
      SELECT
        p.id, p.author_id, p.title, p.slug, p.content, p.image_url, p.topic,
        p.is_pinned, p.likes_count, p.comments_count, p.tags, p.created_at, p.updated_at,
        u.username AS author_username,
        u.role AS author_role,
        u.avatar_url AS author_avatar,
        COALESCE(sp.full_name, u.management_display_name, u.username) AS author_name,
        COALESCE((
          SELECT array_agg(pl.user_id::text)
          FROM post_likes pl WHERE pl.post_id = p.id
        ), '{}') AS liked_by,
        ${currentUserId ? `EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = ${currentUserId})` : "false"} AS is_bookmarked
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE p.id = $1
    `;

    const { rows } = await query(sql, [postId]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết", errorCode: "NOT_FOUND" });
    }

    const row = rows[0];

    // Fetch all comments
    const commSql = `
      SELECT
        c.id, c.author_id, c.content, c.likes_count, c.created_at,
        u.username, u.role, u.avatar_url,
        COALESCE(sp.full_name, u.management_display_name, u.username) AS author_name
      FROM post_comments c
      JOIN users u ON u.id = c.author_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `;
    const commRes = await query(commSql, [postId]);
    const comments = commRes.rows.map((c) => ({
      id: String(c.id),
      author: {
        id: String(c.author_id),
        name: c.author_name,
        username: c.username,
        role: c.role,
        avatarUrl: c.avatar_url,
      },
      content: c.content,
      likesCount: c.likes_count,
      createdAt: c.created_at,
    }));

    return res.json({
      success: true,
      data: {
        id: String(row.id),
        title: row.title || undefined,
        content: row.content,
        imageUrl: row.image_url || undefined,
        topic: row.topic || "qa",
        isPinned: Boolean(row.is_pinned),
        likesCount: Number(row.likes_count) || 0,
        commentsCount: comments.length,
        tags: row.tags || [],
        createdAt: row.created_at,
        author: formatAuthor(row),
        likedBy: row.liked_by || [],
        isBookmarked: Boolean(row.is_bookmarked),
        comments,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/posts/:id:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "SERVER_ERROR" });
  }
});

// POST /api/posts - Create new post (auth required)
router.post("/", protectRoute, async (req, res) => {
  try {
    const { title, content, topic = "qa", imageUrl, tags = [] } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return invalid(res, "Nội dung bài viết không được để trống");
    }

    const cleanTitle = typeof title === "string" && title.trim() ? title.trim() : null;
    const cleanContent = content.trim();
    const cleanTopic = ["qa", "materials", "experience", "study_group", "chat"].includes(topic) ? topic : "qa";
    const cleanImage = typeof imageUrl === "string" && imageUrl.trim().startsWith("http") ? imageUrl.trim() : null;
    const cleanTags = Array.isArray(tags) ? tags.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean) : [];

    const slug = `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const insertSql = `
      INSERT INTO posts (author_id, title, slug, content, image_url, topic, tags, is_approved, is_pinned, likes_count, comments_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, 0, 0)
      RETURNING id, created_at
    `;

    const result = await query(insertSql, [
      req.user.id,
      cleanTitle || "Thảo luận",
      slug,
      cleanContent,
      cleanImage,
      cleanTopic,
      cleanTags,
    ]);

    const created = result.rows[0];

    const postObj = {
      id: String(created.id),
      title: cleanTitle || undefined,
      content: cleanContent,
      imageUrl: cleanImage || undefined,
      topic: cleanTopic,
      isPinned: false,
      likesCount: 0,
      commentsCount: 0,
      tags: cleanTags,
      createdAt: created.created_at,
      author: {
        id: String(req.user.id),
        name: req.user.username,
        username: req.user.username,
        role: req.user.role,
        avatarUrl: req.user.avatar_url,
      },
      likedBy: [],
      isBookmarked: false,
      comments: [],
    };

    return res.status(201).json({
      success: true,
      message: "Đăng bài thành công",
      data: postObj,
    });
  } catch (error) {
    console.error("Error in POST /api/posts:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi đăng bài", errorCode: "SERVER_ERROR" });
  }
});

// POST /api/posts/:id/like - Toggle like
router.post("/:id/like", protectRoute, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return invalid(res, "ID bài viết không hợp lệ");

    const userId = req.user.id;

    // Check if already liked
    const exist = await query("SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2", [postId, userId]);
    let liked = false;

    if (exist.rows.length > 0) {
      await query("DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2", [postId, userId]);
      await query("UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1", [postId]);
      liked = false;
    } else {
      await query("INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [postId, userId]);
      await query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1", [postId]);
      liked = true;
    }

    const updated = await query("SELECT likes_count FROM posts WHERE id = $1", [postId]);
    const likesCount = updated.rows[0]?.likes_count || 0;

    return res.json({
      success: true,
      data: { liked, likesCount },
    });
  } catch (error) {
    console.error("Error in POST /api/posts/:id/like:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi thích bài viết", errorCode: "SERVER_ERROR" });
  }
});

// POST /api/posts/:id/comments - Add comment
router.post("/:id/comments", protectRoute, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return invalid(res, "ID bài viết không hợp lệ");

    const { content } = req.body;
    if (!content || typeof content !== "string" || !content.trim()) {
      return invalid(res, "Nội dung bình luận không được để trống");
    }

    const ins = await query(
      `INSERT INTO post_comments (post_id, author_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [postId, req.user.id, content.trim()]
    );

    await query("UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1", [postId]);

    const created = ins.rows[0];
    const commentObj = {
      id: String(created.id),
      author: {
        id: String(req.user.id),
        name: req.user.username,
        username: req.user.username,
        role: req.user.role,
        avatarUrl: req.user.avatar_url,
      },
      content: content.trim(),
      likesCount: 0,
      createdAt: created.created_at,
    };

    return res.status(201).json({
      success: true,
      data: commentObj,
    });
  } catch (error) {
    console.error("Error in POST /api/posts/:id/comments:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi gửi bình luận", errorCode: "SERVER_ERROR" });
  }
});

// POST /api/posts/:id/bookmark - Toggle bookmark
router.post("/:id/bookmark", protectRoute, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return invalid(res, "ID bài viết không hợp lệ");

    const userId = req.user.id;
    const exist = await query("SELECT id FROM post_bookmarks WHERE post_id = $1 AND user_id = $2", [postId, userId]);
    let bookmarked = false;

    if (exist.rows.length > 0) {
      await query("DELETE FROM post_bookmarks WHERE post_id = $1 AND user_id = $2", [postId, userId]);
      bookmarked = false;
    } else {
      await query("INSERT INTO post_bookmarks (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [postId, userId]);
      bookmarked = true;
    }

    return res.json({
      success: true,
      data: { bookmarked },
    });
  } catch (error) {
    console.error("Error in POST /api/posts/:id/bookmark:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "SERVER_ERROR" });
  }
});

// DELETE /api/posts/:id - Delete post (author or admin)
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return invalid(res, "ID bài viết không hợp lệ");

    const postRes = await query("SELECT author_id FROM posts WHERE id = $1", [postId]);
    if (!postRes.rows[0]) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài viết", errorCode: "NOT_FOUND" });
    }

    const isAuthor = String(postRes.rows[0].author_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa bài viết này", errorCode: "FORBIDDEN" });
    }

    await query("DELETE FROM posts WHERE id = $1", [postId]);

    return res.json({
      success: true,
      message: "Đã xóa bài viết thành công",
    });
  } catch (error) {
    console.error("Error in DELETE /api/posts/:id:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi xóa bài", errorCode: "SERVER_ERROR" });
  }
});

export default router;
