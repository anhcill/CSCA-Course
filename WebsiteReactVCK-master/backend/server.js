import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { pool } from "./db/connect.js";
import userRouter from "./router/user.router.js";
import profileRouter from "./router/profile.router.js";

dotenv.config({ path: "./backend/.env" });

const PORT = process.env.PORT || 7000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const __dirname = path.resolve();
const app = express();

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/auth", userRouter);
app.use("/api/profile", profileRouter);

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API này đang được xây dựng lại bằng PostgreSQL",
  });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "frontend", "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);
  if (res.headersSent) return next(error);
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
