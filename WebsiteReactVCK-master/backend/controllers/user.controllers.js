import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getClient, query } from "../db/connect.js";
import generateTokenAndSetCookie, { jwtCookieOptions } from "../utils/generateToken.js";
import {
  clearGoogleOAuthCookie,
  consumeGoogleCallback,
  createGoogleAuthorization,
  getGoogleOAuthCookieName,
} from "../utils/googleOAuth.js";
import { getUserDtoById, toUserDto } from "../utils/userDto.js";

const PRESET_AVATAR_PATTERN = /^\/avatar\/avt_(?:[1-9]|[1-9]\d|1[01]\d|12[0-6])\.webp$/;
const VALID_GENDERS = new Set(["male", "female", "other"]);
const VALID_ROLES = new Set(["user", "creator", "admin"]);
const VALID_EDUCATION_LEVELS = new Set(["high_school", "vocational", "undergraduate", "graduate", "other"]);
const VALID_TARGET_PROGRAMS = new Set(["language", "bachelor", "master", "doctorate", "other"]);
const VALID_INTAKE_TERMS = new Set(["spring", "fall"]);
const VALID_HSKK_LEVELS = new Set(["beginner", "intermediate", "advanced"]);

const isValidAvatarUrl = (value) => {
  if (PRESET_AVATAR_PATTERN.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeOptionalText = (value, maxLength) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("INVALID_STUDENT_PROFILE");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error("INVALID_STUDENT_PROFILE");
  return normalized || null;
};

const GOOGLE_AUTH_ERRORS = new Set([
  "cancelled",
  "state_invalid",
  "email_unverified",
  "account_conflict",
  "account_locked",
  "oauth_failed",
]);

const getFrontendUrl = () => {
  const value = process.env.FRONTEND_URL?.trim();
  if (!value) throw new Error("Missing required environment variable: FRONTEND_URL");
  return value.replace(/\/$/, "");
};

const redirectGoogleResult = (res, status, reason) => {
  const url = new URL(getFrontendUrl());
  url.searchParams.set("auth", status);
  if (reason && GOOGLE_AUTH_ERRORS.has(reason)) url.searchParams.set("reason", reason);
  return res.redirect(302, url.toString());
};

const normalizeUsernameBase = (email, name) => {
  const source = email.split("@")[0] || name || "user";
  const normalized = source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40);
  return normalized || "user";
};

const createUsernameCandidate = (base, attempt) => {
  if (attempt === 0) return base.slice(0, 50);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${base.slice(0, 41)}-${suffix}`;
};

const findOrCreateGoogleUser = async ({ googleId, email, name, picture }) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const { rows: googleUsers } = await client.query(
        "SELECT * FROM users WHERE google_id = $1 FOR UPDATE",
        [googleId]
      );
      if (googleUsers[0]) {
        await client.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [googleUsers[0].id]);
        await client.query("COMMIT");
        return googleUsers[0];
      }

      const { rows: emailUsers } = await client.query(
        "SELECT * FROM users WHERE LOWER(email) = $1 FOR UPDATE",
        [email]
      );
      const emailUser = emailUsers[0];

      if (emailUser) {
        // A Management-provisioned account has no local password yet. A Google
        // sign-in with the same verified Google email is the safe activation path.
        if (!emailUser.email_verified && !emailUser.is_management_managed) throw new Error("GOOGLE_ACCOUNT_CONFLICT");
        if (emailUser.google_id && emailUser.google_id !== googleId) {
          throw new Error("GOOGLE_ACCOUNT_CONFLICT");
        }

        const { rows } = await client.query(
          `UPDATE users
           SET google_id = $1, oauth_provider = 'google', email_verified = TRUE,
               last_login_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [googleId, emailUser.id]
        );
        await client.query("COMMIT");
        return rows[0];
      }

      const username = createUsernameCandidate(normalizeUsernameBase(email, name), attempt);
      const { rows } = await client.query(
        `INSERT INTO users
           (username, email, password_hash, avatar_url, google_id, oauth_provider,
            email_verified, last_login_at)
         VALUES ($1, $2, NULL, $3, $4, 'google', TRUE, NOW())
         RETURNING *`,
        [username, email, picture, googleId]
      );
      await client.query("COMMIT");
      return rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505" && attempt < 3) continue;
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("GOOGLE_ACCOUNT_CONFLICT");
};

export const startGoogleLogin = (req, res) => {
  try {
    const { authorizationUrl, cookieValue, cookieOptions } = createGoogleAuthorization();
    res.cookie(getGoogleOAuthCookieName(), cookieValue, cookieOptions);
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    console.error("Start Google login error:", error.message);
    return redirectGoogleResult(res, "google-error", "oauth_failed");
  }
};

export const handleGoogleCallback = async (req, res) => {
  try {
    if (req.query.error) {
      clearGoogleOAuthCookie(res);
      return redirectGoogleResult(res, "google-error", "cancelled");
    }

    const profile = await consumeGoogleCallback({
      code: req.query.code,
      state: req.query.state,
      cookieValue: req.cookies[getGoogleOAuthCookieName()],
    });
    clearGoogleOAuthCookie(res);

    const user = await findOrCreateGoogleUser(profile);
    if (user.is_locked) {
      return redirectGoogleResult(res, "google-error", "account_locked");
    }
    generateTokenAndSetCookie(user, res);
    return redirectGoogleResult(res, "google-success");
  } catch (error) {
    clearGoogleOAuthCookie(res);
    console.error("Google callback error:", error.message);

    if (error.message === "OAUTH_EMAIL_UNVERIFIED") {
      return redirectGoogleResult(res, "google-error", "email_unverified");
    }
    if (error.message === "GOOGLE_ACCOUNT_CONFLICT") {
      return redirectGoogleResult(res, "google-error", "account_conflict");
    }
    if (error.message.startsWith("OAUTH_STATE") || error.message === "OAUTH_CODE_MISSING") {
      return redirectGoogleResult(res, "google-error", "state_invalid");
    }
    return redirectGoogleResult(res, "google-error", "oauth_failed");
  }
};

// ============================================================
// SIGNUP — Bước 1: Gửi OTP qua email
// ============================================================
export const signup = async (req, res) => {
  try {
    const { username: rawUsername, email: rawEmail, password, confirmPassword, gender } = req.body;
    const username = typeof rawUsername === "string" ? rawUsername.trim() : "";
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    // Validate
    if (!username || !email || typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
    }
    if (!/^[A-Za-z0-9_-]{3,50}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Tên đăng nhập hoặc email không hợp lệ" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Mật khẩu xác nhận không khớp" });
    }
    if (password.length < 6 || password.length > 200) {
      return res.status(400).json({ success: false, message: "Mật khẩu phải có ít nhất 6 ký tự" });
    }
    if (gender !== undefined && !VALID_GENDERS.has(gender)) {
      return res.status(400).json({ success: false, message: "Giới tính không hợp lệ" });
    }

    // Kiểm tra email/username đã tồn tại
    const { rows: existingUsers } = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: "Email hoặc tên đăng nhập đã tồn tại" });
    }

    // Tạo OTP 6 số
    const otpCode = crypto.randomInt(100000, 1000000).toString();

    // Hash password trước
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Random avatar
    const avatarNum = Math.floor(Math.random() * 126) + 1;
    const avatarUrl = `/avatar/avt_${avatarNum}.webp`;

    // Xóa OTP cũ nếu có, rồi tạo mới
    await query('DELETE FROM user_otps WHERE email = $1 AND purpose = $2', [email, 'signup']);
    await query(
      `INSERT INTO user_otps (email, code, purpose, expires_at)
       VALUES ($1, $2, 'signup', NOW() + INTERVAL '5 minutes')`,
      [email, otpCode]
    );

    // Lưu tạm thông tin đăng ký (in-memory, sẽ chuyển sang Redis sau)
    if (!global.pendingRegistrations) global.pendingRegistrations = new Map();
    global.pendingRegistrations.set(email, {
      username, email, hashedPassword, gender: gender || 'other', avatarUrl,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    // Email delivery is still an infrastructure task. Never log a usable code
    // unless an operator explicitly enables local-only debugging.
    if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG_CODES === "true") {
      console.warn(`[AUTH_DEBUG] Signup OTP generated for ${email}: ${otpCode}`);
    }

    return res.status(200).json({
      success: true,
      message: "Mã xác thực đã được gửi đến email của bạn"
    });

  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// COMPLETE SIGNUP — Bước 2: Xác thực OTP, tạo user
// ============================================================
export const completeSignup = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const verificationCode = typeof req.body?.verificationCode === "string" ? req.body.verificationCode.trim() : "";

    if (!email || !/^\d{6}$/.test(verificationCode)) {
      return res.status(400).json({ success: false, message: "Thiếu email hoặc mã xác thực" });
    }

    // Kiểm tra OTP
    const { rows: otps } = await query(
      `SELECT * FROM user_otps
       WHERE email = $1 AND purpose = 'signup' AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (otps.length === 0) {
      return res.status(400).json({ success: false, message: "Mã xác thực không hợp lệ hoặc đã hết hạn" });
    }

    if (otps[0].code !== verificationCode) {
      return res.status(400).json({ success: false, message: "Mã xác thực không đúng" });
    }

    // Lấy thông tin đăng ký từ cache
    const pendingData = global.pendingRegistrations?.get(email);
    if (!pendingData) {
      return res.status(400).json({ success: false, message: "Phiên đăng ký đã hết hạn, vui lòng đăng ký lại" });
    }

    // Tạo user trong PostgreSQL
    await query(
      `INSERT INTO users (username, email, password_hash, gender, avatar_url, email_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [pendingData.username, pendingData.email, pendingData.hashedPassword,
       pendingData.gender, pendingData.avatarUrl]
    );

    // Đánh dấu OTP đã dùng
    await query('UPDATE user_otps SET used = TRUE WHERE id = $1', [otps[0].id]);

    // Xóa pending data
    global.pendingRegistrations.delete(email);

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công! Hãy đăng nhập."
    });

  } catch (error) {
    console.error("Complete signup error:", error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: "Email hoặc tên đăng nhập đã tồn tại" });
    }
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// LOGIN
// ============================================================
export const login = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập email và mật khẩu" });
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
    }

    if (user.is_locked) {
      return res.status(403).json({ success: false, message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.", errorCode: "ACCOUNT_LOCKED" });
    }

    if (!user.password_hash) {
      return res.status(400).json({ success: false, message: "Tài khoản này dùng đăng nhập Google" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
    }

    // Cập nhật last_login_at
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Tạo JWT
    generateTokenAndSetCookie(user, res);

    return res.status(200).json({
      success: true,
      message: toUserDto(user),
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// LOGOUT
// ============================================================
export const logout = (req, res) => {
  try {
    const { maxAge, ...cookieOptions } = jwtCookieOptions();
    res.clearCookie("jwt", cookieOptions);
    return res.status(200).json({ success: true, message: "Đăng xuất thành công" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// CURRENT USER PROFILE
// ============================================================
export const getCurrentUser = async (req, res) => {
  try {
    const user = await getUserDtoById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });
    return res.status(200).json({ success: true, message: user });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

export const updateOwnProfile = async (req, res) => {
  try {
    const allowedFields = new Set(["username", "gender", "avatarUrl", "currentPassword", "newPassword"]);
    const unknownFields = Object.keys(req.body).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) {
      return res.status(400).json({ success: false, message: "Dữ liệu cập nhật không hợp lệ" });
    }

    const setClauses = [];
    const values = [];
    const addUpdate = (column, value) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (req.body.username !== undefined) {
      const username = String(req.body.username).trim();
      if (!/^[A-Za-z0-9_-]{3,50}$/.test(username)) {
        return res.status(400).json({ success: false, message: "Tên đăng nhập phải có 3-50 ký tự hợp lệ" });
      }
      addUpdate("username", username);
    }

    if (req.body.gender !== undefined) {
      if (!VALID_GENDERS.has(req.body.gender)) {
        return res.status(400).json({ success: false, message: "Giới tính không hợp lệ" });
      }
      addUpdate("gender", req.body.gender);
    }

    if (req.body.avatarUrl !== undefined) {
      if (typeof req.body.avatarUrl !== "string" || !isValidAvatarUrl(req.body.avatarUrl)) {
        return res.status(400).json({ success: false, message: "Ảnh đại diện không hợp lệ" });
      }
      addUpdate("avatar_url", req.body.avatarUrl);
    }

    if (req.body.newPassword !== undefined) {
      if (typeof req.body.newPassword !== "string" || req.body.newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
      }

      const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
      if (!rows[0]?.password_hash) {
        return res.status(400).json({ success: false, message: "Tài khoản Google không đổi mật khẩu tại đây" });
      }
      if (!req.body.currentPassword) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu hiện tại" });
      }
      const matches = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
      if (!matches) {
        return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
      }
      addUpdate("password_hash", await bcrypt.hash(req.body.newPassword, 10));
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: "Không có gì để cập nhật" });
    }

    values.push(req.user.id);
    await query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
      values
    );
    const user = await getUserDtoById(req.user.id);
    return res.status(200).json({ success: true, message: user });
  } catch (error) {
    console.error("Update own profile error:", error);
    if (error.code === "23505") {
      return res.status(400).json({ success: false, message: "Tên đăng nhập đã tồn tại" });
    }
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

export const updateStudentProfile = async (req, res) => {
  const fieldMap = {
    fullName: ["full_name", 120],
    currentEducationLevel: ["current_education_level", VALID_EDUCATION_LEVELS],
    currentSchool: ["current_school", 160],
    targetProgram: ["target_program", VALID_TARGET_PROGRAMS],
    intendedIntakeYear: ["intended_intake_year", "year"],
    intendedIntakeTerm: ["intended_intake_term", VALID_INTAKE_TERMS],
    targetMajor: ["target_major", 120],
    targetCity: ["target_city", 100],
    hskLevel: ["hsk_level", "hsk"],
    hskkLevel: ["hskk_level", VALID_HSKK_LEVELS],
    studyGoal: ["study_goal", 500],
  };

  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0 || entries.some(([field]) => !fieldMap[field])) {
      return res.status(400).json({ success: false, message: "Dữ liệu hồ sơ du học không hợp lệ" });
    }

    const columns = [];
    const values = [];
    for (const [field, rawValue] of entries) {
      const [column, validator] = fieldMap[field];
      let value;
      if (validator instanceof Set) {
        value = rawValue === "" || rawValue === null ? null : rawValue;
        if (value !== null && !validator.has(value)) throw new Error("INVALID_STUDENT_PROFILE");
      } else if (validator === "year") {
        value = rawValue === "" || rawValue === null ? null : Number(rawValue);
        if (value !== null && (!Number.isInteger(value) || value < 2026 || value > 2040)) {
          throw new Error("INVALID_STUDENT_PROFILE");
        }
      } else if (validator === "hsk") {
        value = rawValue === "" || rawValue === null ? null : Number(rawValue);
        if (value !== null && (!Number.isInteger(value) || value < 1 || value > 9)) {
          throw new Error("INVALID_STUDENT_PROFILE");
        }
      } else {
        value = normalizeOptionalText(rawValue, validator);
      }
      columns.push(column);
      values.push(value);
    }

    const insertColumns = ["user_id", ...columns];
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);
    const updates = columns.map((column) => `${column} = EXCLUDED.${column}`);
    await query(
      `INSERT INTO student_profiles (${insertColumns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(", ")}`,
      [req.user.id, ...values]
    );

    const user = await getUserDtoById(req.user.id);
    return res.status(200).json({ success: true, message: user });
  } catch (error) {
    console.error("Update student profile error:", error);
    if (error.message === "INVALID_STUDENT_PROFILE") {
      return res.status(400).json({ success: false, message: "Dữ liệu hồ sơ du học không hợp lệ" });
    }
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// GET ALL USERS (Admin)
// ============================================================
export const getAllUsers = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, username, email, role, avatar_url, gender, is_vip,
              vip_expires_at, email_verified, is_locked, oauth_provider, password_hash,
              created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    return res.status(200).json({ success: true, data: rows.map(toUserDto) });
  } catch (error) {
    console.error("Get all users error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// CREATE USER (Admin)
// ============================================================
export const createUser = async (req, res) => {
  try {
    const { username, email, password, role, gender } = req.body;

    if (!username || !email || !password) {
      return res.status(422).json({ success: false, message: "Thiếu thông tin bắt buộc", errorCode: "VALIDATION_ERROR" });
    }
    if (role !== undefined && !VALID_ROLES.has(role)) {
      return res.status(422).json({ success: false, message: "Vai trò không hợp lệ", errorCode: "VALIDATION_ERROR" });
    }
    if (gender !== undefined && !VALID_GENDERS.has(gender)) {
      return res.status(422).json({ success: false, message: "Giới tính không hợp lệ", errorCode: "VALIDATION_ERROR" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const avatarNum = Math.floor(Math.random() * 126) + 1;
    const avatarUrl = `/avatar/avt_${avatarNum}.webp`;

    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, role, gender, avatar_url, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, email, role, avatar_url, gender, is_vip,
                 vip_expires_at, email_verified, oauth_provider, password_hash,
                 created_at, updated_at`,
      [username, email, hashedPassword, role || 'user', gender || 'other', avatarUrl]
    );

    return res.status(201).json({ success: true, message: toUserDto(rows[0]) });

  } catch (error) {
    console.error("Create user error:", error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: "Email hoặc tên đăng nhập đã tồn tại" });
    }
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// UPDATE USER
// ============================================================
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['username', 'gender', 'avatar_url', 'role'];
    if (updates.avatar_url !== undefined && !isValidAvatarUrl(updates.avatar_url)) {
      return res.status(422).json({ success: false, message: "Ảnh đại diện không hợp lệ", errorCode: "VALIDATION_ERROR" });
    }
    if (updates.gender !== undefined && !VALID_GENDERS.has(updates.gender)) {
      return res.status(422).json({ success: false, message: "Giới tính không hợp lệ", errorCode: "VALIDATION_ERROR" });
    }
    if (updates.role !== undefined && !VALID_ROLES.has(updates.role)) {
      return res.status(422).json({ success: false, message: "Vai trò không hợp lệ", errorCode: "VALIDATION_ERROR" });
    }
    if (updates.role && updates.role !== "admin") {
      const { rows: currentTarget } = await query('SELECT role FROM users WHERE id = $1', [id]);
      if (currentTarget.length === 0) {
        return res.status(404).json({ success: false, message: "User không tồn tại", errorCode: "NOT_FOUND" });
      }
      if (currentTarget[0].role === "admin") {
        const { rows: adminCount } = await query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
        if (Number(adminCount[0].count) <= 1) {
          return res.status(422).json({ success: false, message: "Không thể hạ cấp admin cuối cùng", errorCode: "VALIDATION_ERROR" });
        }
      }
    }
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    // Xử lý đổi mật khẩu
    if (updates.newPassword) {
      if (updates.currentPassword) {
        const { rows: userRows } = await query('SELECT password_hash FROM users WHERE id = $1', [id]);
        if (userRows.length === 0) {
          return res.status(404).json({ success: false, message: "User không tồn tại" });
        }
        const isMatch = await bcrypt.compare(updates.currentPassword, userRows[0].password_hash);
        if (!isMatch) {
          return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
        }
      }
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(updates.newPassword, salt);
      setClauses.push(`password_hash = $${paramIndex}`);
      values.push(hashed);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return res.status(422).json({ success: false, message: "Không có gì để cập nhật", errorCode: "VALIDATION_ERROR" });
    }

    values.push(id);
    const { rows } = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, email, role, avatar_url, gender, is_vip,
                 vip_expires_at, email_verified, oauth_provider, password_hash,
                 created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại", errorCode: "NOT_FOUND" });
    }

    return res.status(200).json({ success: true, message: toUserDto(rows[0]) });

  } catch (error) {
    console.error("Update user error:", error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: "Tên đăng nhập đã tồn tại" });
    }
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// DELETE USER (Admin)
// ============================================================
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: adminCount } = await query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
    const { rows: targetUser } = await query('SELECT role FROM users WHERE id = $1', [id]);

    if (targetUser.length === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại" });
    }

    if (targetUser[0].role === 'admin' && parseInt(adminCount[0].count) <= 1) {
      return res.status(400).json({ success: false, message: "Không thể xóa admin cuối cùng" });
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    return res.status(200).json({ success: true, message: "Xóa user thành công" });

  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// REQUEST PASSWORD RESET
// ============================================================
export const requestPasswordReset = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập email" });
    }

    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length > 0) {
      const resetCode = crypto.randomInt(100000, 1000000).toString();
      await query('DELETE FROM password_resets WHERE email = $1', [email]);
      await query(
        `INSERT INTO password_resets (email, reset_code, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
        [email, resetCode]
      );
      if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG_CODES === "true") {
        console.warn(`[AUTH_DEBUG] Password reset code generated for ${email}: ${resetCode}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Mã xác thực đã được gửi đến email của bạn"
    });

  } catch (error) {
    console.error("Request password reset error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ============================================================
// RESET PASSWORD
// ============================================================
export const resetPassword = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const resetCode = typeof req.body?.resetCode === "string" ? req.body.resetCode.trim() : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!email || !/^\d{6}$/.test(resetCode) || newPassword.length < 6 || newPassword.length > 200) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const resetResult = await client.query(
        `SELECT id FROM password_resets
         WHERE email = $1 AND reset_code = $2 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [email, resetCode],
      );
      if (resetResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Mã xác thực không hợp lệ hoặc đã hết hạn" });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      const userResult = await client.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
        [hashedPassword, email],
      );
      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Mã xác thực không hợp lệ hoặc đã hết hạn" });
      }
      const usedResult = await client.query(
        'UPDATE password_resets SET used = TRUE WHERE id = $1 AND used = FALSE RETURNING id',
        [resetResult.rows[0].id],
      );
      if (usedResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Mã xác thực không hợp lệ hoặc đã hết hạn" });
      }
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userResult.rows[0].id]);
      await client.query("COMMIT");
    } catch (transactionError) {
      await client.query("ROLLBACK").catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }

    return res.status(200).json({
      success: true,
      message: "Đặt lại mật khẩu thành công"
    });

  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
