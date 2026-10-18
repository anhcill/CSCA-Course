import { query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

export const DEFAULT_WELCOME_CONFIG = {
  badge: "MolyCourse LMS",
  autoTransitionDuration: 4.8,
  autoTransitionEnabled: true,
  teacher: {
    title: "Chào mừng đến với không gian giảng dạy",
    description: "Quản lý lớp học, bài giảng và đồng hành cùng học viên của bạn.",
    buttonText: "Bắt đầu giảng dạy",
    loadingNote: "Đang chuẩn bị không gian giảng dạy của bạn...",
  },
  student: {
    title: "Chào mừng đến với không gian học tập",
    description: "Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn.",
    buttonText: "Bắt đầu học",
    loadingNote: "Đang chuẩn bị không gian học tập của bạn...",
  },
};

/**
 * Deep merge saved config with defaults to ensure all required fields are present
 */
export const sanitizeAndMergeConfig = (rawConfig) => {
  const c = typeof rawConfig === "object" && rawConfig !== null ? rawConfig : {};

  const cleanString = (val, fallback, maxLen = 300) => {
    if (typeof val !== "string") return fallback;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed.slice(0, maxLen) : fallback;
  };

  const cleanDuration = (val, fallback = 4.8) => {
    const num = Number(val);
    if (!Number.isFinite(num) || num < 1 || num > 30) return fallback;
    return Math.round(num * 10) / 10;
  };

  const rawTeacher = typeof c.teacher === "object" && c.teacher !== null ? c.teacher : {};
  const rawStudent = typeof c.student === "object" && c.student !== null ? c.student : {};

  return {
    badge: cleanString(c.badge, DEFAULT_WELCOME_CONFIG.badge, 60),
    autoTransitionDuration: cleanDuration(c.autoTransitionDuration, DEFAULT_WELCOME_CONFIG.autoTransitionDuration),
    autoTransitionEnabled: typeof c.autoTransitionEnabled === "boolean" ? c.autoTransitionEnabled : true,
    teacher: {
      title: cleanString(rawTeacher.title, DEFAULT_WELCOME_CONFIG.teacher.title, 120),
      description: cleanString(rawTeacher.description, DEFAULT_WELCOME_CONFIG.teacher.description, 300),
      buttonText: cleanString(rawTeacher.buttonText, DEFAULT_WELCOME_CONFIG.teacher.buttonText, 60),
      loadingNote: cleanString(rawTeacher.loadingNote, DEFAULT_WELCOME_CONFIG.teacher.loadingNote, 150),
    },
    student: {
      title: cleanString(rawStudent.title, DEFAULT_WELCOME_CONFIG.student.title, 120),
      description: cleanString(rawStudent.description, DEFAULT_WELCOME_CONFIG.student.description, 300),
      buttonText: cleanString(rawStudent.buttonText, DEFAULT_WELCOME_CONFIG.student.buttonText, 60),
      loadingNote: cleanString(rawStudent.loadingNote, DEFAULT_WELCOME_CONFIG.student.loadingNote, 150),
    },
  };
};

/**
 * Fetch current welcome screen configuration
 */
export const getWelcomeScreenConfig = async () => {
  try {
    const result = await query(
      "SELECT config, updated_at FROM welcome_screen_settings WHERE setting_key = 'default' LIMIT 1"
    );

    if (!result.rows[0]) {
      return {
        config: DEFAULT_WELCOME_CONFIG,
        updatedAt: null,
      };
    }

    const merged = sanitizeAndMergeConfig(result.rows[0].config);
    return {
      config: merged,
      updatedAt: result.rows[0].updated_at,
    };
  } catch (error) {
    console.error("getWelcomeScreenConfig error, returning fallback default:", error?.message);
    return {
      config: DEFAULT_WELCOME_CONFIG,
      updatedAt: null,
    };
  }
};

/**
 * Update welcome screen configuration (Admin only)
 */
export const updateWelcomeScreenConfig = async ({ config, userId, ip }) => {
  const merged = sanitizeAndMergeConfig(config);

  const prev = await getWelcomeScreenConfig();

  const result = await query(
    `INSERT INTO welcome_screen_settings (setting_key, config, updated_at, updated_by)
     VALUES ('default', $1::jsonb, NOW(), $2)
     ON CONFLICT (setting_key) DO UPDATE
       SET config = EXCLUDED.config,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by
     RETURNING setting_key, config, updated_at, updated_by`,
    [JSON.stringify(merged), userId]
  );

  await recordAuditEvent({
    actorId: userId,
    action: "welcome_screen.updated",
    entityType: "welcome_screen_settings",
    entityId: null,
    beforeState: prev.config,
    afterState: merged,
    metadata: { ip },
  });

  return {
    config: merged,
    updatedAt: result.rows[0].updated_at,
  };
};

/**
 * Reset welcome screen configuration to factory defaults
 */
export const resetWelcomeScreenConfig = async ({ userId, ip }) => {
  return updateWelcomeScreenConfig({
    config: DEFAULT_WELCOME_CONFIG,
    userId,
    ip,
  });
};

/**
 * Reset a user's welcome_seen_at so they can see the welcome screen again (e.g. for testing)
 */
export const resetUserWelcomeSeen = async ({ targetUserId, actorId, ip }) => {
  const userCheck = await query(
    "SELECT id, username, email, role, welcome_seen_at FROM users WHERE id = $1 LIMIT 1",
    [targetUserId]
  );

  if (!userCheck.rows[0]) {
    throw new Error("USER_NOT_FOUND");
  }

  const user = userCheck.rows[0];

  await query(
    "UPDATE users SET welcome_seen_at = NULL WHERE id = $1",
    [targetUserId]
  );

  await recordAuditEvent({
    actorId,
    action: "welcome_screen.reset_user_seen",
    entityType: "user",
    entityId: targetUserId,
    beforeState: { welcome_seen_at: user.welcome_seen_at },
    afterState: { welcome_seen_at: null },
    metadata: { ip, targetUsername: user.username },
  });

  return {
    userId: targetUserId,
    username: user.username,
    hasSeenWelcome: false,
    welcomeSeenAt: null,
  };
};
