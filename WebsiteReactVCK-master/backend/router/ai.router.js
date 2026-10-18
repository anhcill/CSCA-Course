import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { askMoliPet, getMoliPetConfig, streamMoliPet } from "../services/moliPet.service.js";

const router = express.Router();

const activeRequests = new Set();
const userRequestTimestamps = new Map();
const MAX_IMAGE_DATA_URL_LENGTH = 800_000;
const ALLOWED_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\r\n]+$/i;

export const validateMoliPetImageDataUrl = (value) => {
  if (!value) return null;
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return "Ảnh quá lớn. Hãy cắt nhỏ hoặc nén ảnh rồi gửi lại.";
  }
  if (!ALLOWED_IMAGE_DATA_URL.test(value)) {
    return "Ảnh không hợp lệ. Moly chỉ nhận PNG, JPG hoặc WEBP.";
  }
  return null;
};

const isRateLimited = (userId) => {
  const now = Date.now();
  const history = userRequestTimestamps.get(userId) || [];
  const recent = history.filter((t) => now - t < 60000); // 60s window
  if (recent.length >= 15) {
    return true;
  }
  recent.push(now);
  userRequestTimestamps.set(userId, recent);
  return false;
};

// Route: POST /api/ai/moli-pet
router.post("/moli-pet", protectRoute, async (req, res) => {
  const config = getMoliPetConfig();
  if (!config.enabled) {
    return res.status(503).json({
      success: false,
      answer: "Moly Pet đang tạm tắt. Bạn thử lại sau nhé.",
    });
  }
  if (!config.baseUrl || config.apiKeys.length === 0) {
    return res.status(503).json({
      success: false,
      answer: "Moly Pet chưa được cấu hình kết nối AI.",
    });
  }

  const userId = req.user?.id || req.user?._id || "anonymous";
  const {
    message,
    imageDataUrl,
    page,
    pageType,
    subject,
    routeHint,
    localTime,
    petName,
    mood,
    conversationHistory,
  } = req.body || {};

  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage && !imageDataUrl) {
    return res.status(400).json({
      success: false,
      message: "Nội dung tin nhắn không được để trống.",
    });
  }

  if (trimmedMessage.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Tin nhắn quá dài (tối đa 2000 ký tự).",
    });
  }

  const imageValidationError = validateMoliPetImageDataUrl(imageDataUrl);
  if (imageValidationError) {
    return res.status(400).json({
      success: false,
      message: imageValidationError,
    });
  }

  if (activeRequests.has(userId)) {
    return res.status(429).json({
      success: false,
      answer: "Moly đang trả lời tin nhắn trước của bạn. Đợi mình một xíu nhé! 🐾",
    });
  }

  if (isRateLimited(userId)) {
    return res.status(429).json({
      success: false,
      answer: "Bạn nhắn nhanh quá nè! Nghỉ tay một lát rồi trò chuyện tiếp với Moly nhé.",
    });
  }

  activeRequests.add(userId);

  const context = {
    petName: String(petName || "Moly").trim().slice(0, 24) || "Moly",
    userName: req.user?.fullName || req.user?.display_name || req.user?.username || "bạn",
    page: String(page || "").slice(0, 150),
    pageType: String(pageType || "").slice(0, 80),
    subject: String(subject || "").slice(0, 80),
    routeHint: String(routeHint || "").slice(0, 250),
    localTime: String(localTime || "").slice(0, 80),
    mood: String(mood || "friendly").slice(0, 32),
    imageDataUrl,
    conversationHistory,
  };

  const wantsStream = String(req.get("accept") || "").includes("text/event-stream");

  try {
    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      await streamMoliPet(trimmedMessage, context, (delta) => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
          res.flush?.();
        }
      }, { config });

      if (!res.writableEnded && !res.destroyed) {
        res.write("data: [DONE]\n\n");
        res.flush?.();
        res.end();
      }
      return;
    }

    const result = await askMoliPet(trimmedMessage, context, { config });
    return res.json(result);
  } catch (err) {
    console.error("ai.router POST /moli-pet error:", err);
    if (wantsStream && !res.headersSent) {
      return res.status(500).json({
        success: false,
        answer: "Moly đang bị ngắt kết nối tạm thời. Bạn vui lòng thử lại sau.",
      });
    }
    if (wantsStream && res.headersSent && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: "Moly bị ngắt kết nối." })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    return res.status(500).json({
      success: false,
      answer: "Lỗi kết nối tới trợ lý Moly Pet.",
    });
  } finally {
    activeRequests.delete(userId);
  }
});

export default router;
