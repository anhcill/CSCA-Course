import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  const startedAt = Date.now();
  try {
    await query("SELECT 1");
    return res.status(200).json({ success: true, data: { status: "ok", database: "ok", latencyMs: Date.now() - startedAt } });
  } catch (error) {
    console.error("[health] database check failed:", error.message);
    return res.status(503).json({ success: false, message: "Dịch vụ đang tạm thời không sẵn sàng", errorCode: "SERVICE_UNAVAILABLE" });
  }
});

router.get("/ready", protectRoute, async (req, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Bạn không có quyền xem tình trạng hệ thống", errorCode: "FORBIDDEN" });
  try {
    const result = await query(
      `SELECT
         to_regclass('public.schema_migrations') IS NOT NULL AS migration_ledger,
         to_regclass('public.class_announcements') IS NOT NULL AS announcements_table,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'event_type'
         ) AS notification_metadata,
         (SELECT MAX(filename) FROM schema_migrations) AS latest_migration`,
    );
    const data = result.rows[0];
    const ready = Boolean(data?.migration_ledger && data?.announcements_table && data?.notification_metadata);
    return res.status(ready ? 200 : 503).json({
      success: ready,
      data: { status: ready ? "ready" : "migration_required", ...data },
      ...(ready ? {} : { message: "Database chưa hoàn tất migration bắt buộc", errorCode: "MIGRATION_REQUIRED" }),
    });
  } catch (error) {
    console.error("[health] readiness check failed:", error.message);
    return res.status(503).json({ success: false, message: "Không thể kiểm tra trạng thái sẵn sàng", errorCode: "SERVICE_UNAVAILABLE" });
  }
});

export default router;
