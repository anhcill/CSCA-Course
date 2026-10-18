import { cleanQuizOcrText } from "./quizOcr.service.js";

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_MOLI_MODEL = "ag/gemini-3-flash";
const DEFAULT_FALLBACK_MODELS = ["ag/gemini-3.8-flash-low"];

let keyRotationCursor = 0;

const intFromEnv = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const csv = (value) => String(value || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const unique = (items) => [...new Set(items.filter(Boolean))];

const envFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const chatCompletionsUrl = (baseUrl) => {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/(?:v1|api\/v1)$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
};

export const getMoliPetConfig = (env = process.env) => {
  const baseUrl = (
    env.MOLI_PET_BASE_URL ||
    env.NINEROUTER_BASE_URL ||
    env.NINEROUTER_URL ||
    env.ADMIN_EXAM_AI_BASE_URL ||
    env.QUIZ_OCR_BASE_URL ||
    ""
  ).trim();

  const apiKeys = [
    ...csv(env.MOLI_PET_API_KEYS),
    ...csv(env.MOLI_PET_API_KEY),
    ...csv(env.NINEROUTER_API_KEYS),
    ...csv(env.NINEROUTER_API_KEY),
    ...csv(env.ADMIN_EXAM_AI_API_KEYS),
    ...csv(env.QUIZ_OCR_API_KEYS),
    ...csv(env.QUIZ_OCR_API_KEY),
  ];

  const model = String(env.MOLI_PET_MODEL || env.NINEROUTER_MODEL || DEFAULT_MOLI_MODEL).trim();
  const fallbackModels = csv(env.MOLI_PET_FALLBACK_MODELS);

  return {
    enabled: envFlag(env.MOLI_PET_ENABLED),
    baseUrl,
    apiKeys: unique(apiKeys),
    model,
    models: unique([model, ...(fallbackModels.length ? fallbackModels : DEFAULT_FALLBACK_MODELS)]),
    timeoutMs: intFromEnv(env.MOLI_PET_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, { min: 5000, max: 120000 }),
    maxTokens: intFromEnv(env.MOLI_PET_MAX_TOKENS, DEFAULT_MAX_TOKENS, { min: 256, max: 8000 }),
  };
};

const getRequestCandidates = (config) => {
  const keys = unique(config.apiKeys || []);
  const models = unique(config.models?.length ? config.models : [config.model]);
  if (!keys.length || !models.length) return [];

  const start = keyRotationCursor % keys.length;
  keyRotationCursor = (keyRotationCursor + 1) % keys.length;
  const rotatedKeys = [...keys.slice(start), ...keys.slice(0, start)];

  return models.flatMap((model) => rotatedKeys.map((apiKey) => ({ apiKey, model })));
};

const sanitizeMoliPetAnswer = (text) => {
  return String(text || "")
    .replace(/^\s*(với vai trò là|là một|as an)\s+(ai|mô hình|trợ lý)[^\n.?!]*[.?!]\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const buildMoliPetSystemPrompt = (context = {}) => {
  const {
    petName = "Moly",
    userName = "",
    page = "/",
    pageType = "",
    subject = "",
    routeHint = "",
    localTime = "",
    mood = "friendly",
  } = context;

  return `Bạn là ${petName}, bé pet học tập 3D thông minh và cực kỳ dễ thương của MolyCourse.
Nhiệm vụ của bạn là đồng hành, giải đáp thắc mắc bài vở, động viên và trợ giúp học viên học tập hiệu quả.

Tính cách & Phong cách giao tiếp:
- Xưng hô thân thiện: "mình" và "bạn" (hoặc gọi tên học viên: ${userName || "bạn"}).
- Giọng điệu ấm áp, thông minh, ân cần nhưng không nhảm nhí, không sáo rỗng.
- Tâm trạng hiện tại: ${mood}.
- Thời gian hiện tại của học viên: ${localTime || "hôm nay"}.
- Vị trí trang hiện tại: ${page || "/"} (${pageType || "không gian học tập"}).
- Môn học / bối cảnh: ${subject || "Lập trình & Khoa học"}.
${routeHint ? `- Gợi ý bối cảnh: ${routeHint}` : ""}

Quy tắc chuyên môn:
1. Nếu học viên hỏi bài tập / code: phân tích ngắn gọn, hướng dẫn từng bước rõ ràng, giải thích bản chất, chỉ ra lỗi thường gặp.
2. Nếu câu hỏi liên quan đến toán / công thức: dùng chuẩn LaTeX như $x^2$, $\\frac{a}{b}$, \\sqrt{x} để hệ thống tự render bằng KaTeX đẹp mắt.
3. Nếu học viên hỏi kế hoạch học / động lực: gợi ý 2-3 hành động cụ thể, thực tế có thể làm ngay trong 15-30 phút.
4. Trả lời bằng tiếng Việt tự nhiên, có dấu, rõ ràng. Độ dài vừa phải (khoảng 3-6 câu cho câu hỏi nhanh, hoặc chia bước đánh số nếu bài tập phức tạp).
5. Tuyệt đối không nhận mình là mô hình AI hay nhắc đến token/key/hệ thống.`;
};

const buildMessagesPayload = (message, context = {}) => {
  const messages = [
    { role: "system", content: buildMoliPetSystemPrompt(context) },
  ];

  if (Array.isArray(context.conversationHistory)) {
    context.conversationHistory.slice(-6).forEach((item) => {
      if (item && item.content && (item.role === "user" || item.role === "assistant")) {
        messages.push({
          role: item.role,
          content: String(item.content).slice(0, 1500),
        });
      }
    });
  }

  const userContent = [];
  if (message) {
    userContent.push({ type: "text", text: message });
  }

  if (context.imageDataUrl && String(context.imageDataUrl).startsWith("data:image/")) {
    userContent.push({
      type: "image_url",
      image_url: { url: context.imageDataUrl },
    });
  }

  messages.push({
    role: "user",
    content: userContent.length === 1 && userContent[0].type === "text" ? userContent[0].text : userContent,
  });

  return messages;
};

export async function askMoliPet(message, context = {}, {
  config = getMoliPetConfig(),
  fetchImpl = fetch,
} = {}) {
  const trimmedMessage = String(message || "").trim();
  const url = chatCompletionsUrl(config.baseUrl);
  const candidates = getRequestCandidates(config);

  if (!url || candidates.length === 0) {
    return {
      success: false,
      answer: "Moly chưa được cấu hình kết nối AI. Bạn báo quản trị viên giúp mình nhé.",
      timestamp: new Date().toISOString(),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    for (const candidate of candidates) {
      if (controller.signal.aborted) break;
      const payload = {
        model: candidate.model,
        temperature: 0.6,
        max_tokens: config.maxTokens,
        stream: false,
        messages: buildMessagesPayload(trimmedMessage, context),
      };

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${candidate.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.warn("MoliPet provider error:", response.status, candidate.model);
          continue;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";
        if (!String(content).trim()) continue;
        return {
          success: true,
          answer: sanitizeMoliPetAnswer(cleanQuizOcrText(content)),
          timestamp: new Date().toISOString(),
          model: candidate.model,
        };
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn("MoliPet provider request failed:", candidate.model, error?.message || error);
      }
    }

    return {
      success: false,
      answer: "Moly đang hơi bận xử lý bài một xíu. Bạn đợi mình vài giây rồi thử lại nhé! 🐾",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("askMoliPet network error:", err);
    return {
      success: false,
      answer: "Moly đang bị ngắt kết nối tạm thời. Bạn thử nhắn lại sau một chút nhé!",
      timestamp: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function streamMoliPet(message, context = {}, onDelta, {
  config = getMoliPetConfig(),
  fetchImpl = fetch,
} = {}) {
  const trimmedMessage = String(message || "").trim();
  const url = chatCompletionsUrl(config.baseUrl);
  const candidates = getRequestCandidates(config);

  if (!url || candidates.length === 0) {
    throw new Error("MoliPet is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    for (const candidate of candidates) {
      let emittedContent = false;
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${candidate.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: candidate.model,
            temperature: 0.6,
            max_tokens: config.maxTokens,
            stream: true,
            messages: buildMessagesPayload(trimmedMessage, context),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          console.warn("MoliPet stream provider error:", response.status, candidate.model);
          continue;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = done ? "" : (lines.pop() || "");

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (trimmed === "data: [DONE]") return;
            if (!trimmed.startsWith("data:")) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              const delta = parsed?.choices?.[0]?.delta?.content || "";
              if (delta) {
                emittedContent = true;
                onDelta(delta);
              }
            } catch {
              // Ignore keepalive and non-JSON provider frames.
            }
          }
          if (done) break;
        }

        if (emittedContent) return;
      } catch (error) {
        if (emittedContent || controller.signal.aborted) throw error;
        console.warn("MoliPet stream request failed:", candidate.model, error?.message || error);
      }
    }

    throw new Error("All MoliPet providers failed");
  } finally {
    clearTimeout(timer);
  }
}
