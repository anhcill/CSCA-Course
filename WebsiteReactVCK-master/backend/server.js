import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { pool } from "./db/connect.js";
import userRouter from "./router/user.router.js";
import profileRouter from "./router/profile.router.js";
import courseRouter from "./router/course.router.js";
import enrollmentRouter from "./router/enrollment.router.js";
import progressRouter from "./router/progress.router.js";
import videoRouter from "./router/video.router.js";
import liveClassRouter from "./router/liveClass.router.js";
import assignmentRouter from "./router/assignment.router.js";
import notificationRouter from "./router/notification.router.js";
import attendanceRouter from "./router/attendance.router.js";
import certificateRouter from "./router/certificate.router.js";
import teacherRouter from "./router/teacher.router.js";
import adminRouter from "./router/admin.router.js";
import managementIntegrationRouter from "./router/managementIntegration.router.js";
import platformAdminRouter from "./router/platformAdmin.router.js";
import orchestrationRouter from "./router/orchestration.router.js";
import fileRouter from "./router/file.router.js";
import { isAllowedOrigin, securityHeaders } from "./middleware/security.js";

dotenv.config({ path: "./backend/.env" });

const PORT = process.env.PORT || 7000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const __dirname = path.resolve();
const app = express();

const validateEnvironment = () => {
  const required = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_URL"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (String(process.env.JWT_SECRET).length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  if (process.env.NODE_ENV === "production") {
    const origins = FRONTEND_URL.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (origins.some((origin) => !origin.startsWith("https://"))) throw new Error("Production FRONTEND_URL must use HTTPS");
    const googleOAuthVariables = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
      "GOOGLE_OAUTH_STATE_SECRET",
    ];
    const configuredGoogleOAuthVariables = googleOAuthVariables.filter((name) => process.env[name]?.trim());
    if (configuredGoogleOAuthVariables.length > 0 && configuredGoogleOAuthVariables.length !== googleOAuthVariables.length) {
      throw new Error("Google OAuth production configuration is incomplete");
    }
    if (configuredGoogleOAuthVariables.length === googleOAuthVariables.length && !process.env.GOOGLE_REDIRECT_URI.startsWith("https://")) {
      throw new Error("Production GOOGLE_REDIRECT_URI must use HTTPS");
    }
    if (configuredGoogleOAuthVariables.length === 0) {
      console.warn("Google OAuth is disabled until all Google OAuth environment variables are configured.");
    }
    if (process.env.AUTH_DEBUG_CODES === "true") throw new Error("AUTH_DEBUG_CODES must be disabled in production");
  }
};

validateEnvironment();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(securityHeaders);

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, FRONTEND_URL)) return callback(null, true);
    const error = new Error("CORS_ORIGIN_NOT_ALLOWED");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
app.use(express.json({
  limit: "1mb",
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(cookieParser());

app.use("/api/integrations/v1", managementIntegrationRouter);
app.use("/api/v1/admin", platformAdminRouter);
app.use("/api/v1/application-orchestration", orchestrationRouter);
app.use("/api/auth", userRouter);
app.use("/api/profile", profileRouter);
app.use("/api/courses", courseRouter);
app.use("/api/enrollments", enrollmentRouter);
app.use("/api/progress", progressRouter);
app.use("/api/videos", videoRouter);
app.use("/api/live-classes", liveClassRouter);
app.use("/api/assignments", assignmentRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/certificates", certificateRouter);
app.use("/api/teacher", teacherRouter);
app.use("/api/admin", adminRouter);
app.use("/api", fileRouter);
app.use("/api", attendanceRouter);

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API không tồn tại",
    errorCode: "NOT_FOUND",
  });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "frontend", "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.message === "CORS_ORIGIN_NOT_ALLOWED") {
    return res.status(403).json({ success: false, message: "Origin không được phép", errorCode: "CORS_ORIGIN_NOT_ALLOWED" });
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Unhandled server error:", error?.name || "Error", error?.message || "Unknown error");
  } else {
    console.error("Unhandled server error:", error);
  }
  if (error instanceof SyntaxError && error.status === 400 && error.body) {
    return res.status(422).json({
      success: false,
      message: "JSON request không hợp lệ",
      errorCode: "VALIDATION_ERROR",
    });
  }
  return res.status(500).json({ success: false, message: "Lỗi server" });
});

app.listen(PORT, async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log(`[PostgreSQL] Connected successfully at ${result.rows[0].now}`);
  } catch (error) {
    console.error("[PostgreSQL] Connection failed:", error.message);
  }
  console.log(`Server run at http://localhost:${PORT}`);
});
