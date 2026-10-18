const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 4500;

const intFromEnv = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const csv = (value) => String(value || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const chatCompletionsUrl = (baseUrl) => {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/(?:v1|api\/v1)$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
};

export const cleanQuizOcrText = (value) => String(value || "")
  .replace(/^```(?:text|txt|markdown)?\s*/i, "")
  .replace(/```$/i, "")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export const buildQuizOcrPrompt = () => `You are an OCR engine for one exam question image.

Return ONLY the OCR text. Do not solve the question. Do not add commentary.

Rules:
- Preserve original language: Chinese, Vietnamese, English, symbols.
- Do not translate, summarize, reorder, or correct the exam content.
- Transcribe exactly what is visible. If a small part is unreadable, write [khong ro] instead of guessing.
- Preserve question number, A/B/C/D options, answer marker if visible, and explanation markers like 解析, 答案解析, 解答, 说明, Loi giai, Giai thich.
- Preserve math as clean text/LaTeX where visible: fractions, roots, powers, vectors, log/trig/lim/sum/int, systems, intervals.
- Preserve comparison signs exactly: <, <=, ≤, >, >=, ≥, =, ≠. Do not change strict and non-strict signs.
- Preserve negative signs, decimal points, exponents, subscripts, domain conditions, set/interval notation, and answer labels exactly where visible.
- Keep option labels exactly as A., B., C., D. on separate lines when visible.
- If the image contains a stacked fraction, write it as \\frac{numerator}{denominator}.
- If the image contains a brace system, write it as \\begin{cases} row1 \\\\ row2 \\end{cases}.
- Use single LaTeX backslashes such as \\frac and \\( ... \\). Do not double-escape them in the returned text.
- If text color indicates the correct answer and the letter is visible, include a line like "答案: B". If color is ambiguous, do not guess.
- If the question needs a diagram/table/chart, include a short line "Hinh: ..." listing only visible labels, numbers, arrows, axes, or table headers.
- Keep line breaks between question, options, and explanation.`;

const contentText = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
};

export class QuizOcrError extends Error {
  constructor(code, message, { status = 502, retryAfter = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "QuizOcrError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const getQuizOcrConfig = (env = process.env) => {
  const primaryModel = String(env.QUIZ_OCR_MODEL || env.MOLI_PET_MODEL || "ag/gemini-3-flash").trim();
  const explicitEnabled = String(env.QUIZ_OCR_ENABLED || "").trim();
  return {
    enabled: String(explicitEnabled || env.MOLI_PET_ENABLED || "false").toLowerCase() === "true",
    baseUrl: String(env.QUIZ_OCR_BASE_URL || env.MOLI_PET_BASE_URL || "").trim(),
    apiKeys: [
      ...csv(env.QUIZ_OCR_API_KEYS),
      ...csv(env.QUIZ_OCR_API_KEY),
      ...csv(env.MOLI_PET_API_KEYS),
      ...csv(env.MOLI_PET_API_KEY),
    ],
    models: [...new Set([
      primaryModel,
      ...csv(env.QUIZ_OCR_FALLBACK_MODELS),
      ...csv(env.MOLI_PET_FALLBACK_MODELS),
    ].filter(Boolean))],
    timeoutMs: intFromEnv(env.QUIZ_OCR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, { min: 1000, max: 300000 }),
    maxTokens: intFromEnv(env.QUIZ_OCR_MAX_TOKENS, DEFAULT_MAX_TOKENS, { min: 256, max: 12000 }),
  };
};

const requestSignal = (externalSignal, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("QUIZ_OCR_TIMEOUT")), timeoutMs);
  timeout.unref?.();
  const abortFromExternal = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
};

const parseProviderError = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const message = body?.error?.message || body?.message || `OCR provider returned HTTP ${response.status}`;
  const retryAfter = response.headers.get("retry-after");
  if (response.status === 429) {
    return new QuizOcrError("OCR_PROVIDER_RATE_LIMITED", message, {
      status: 429,
      retryAfter: retryAfter ? Number(retryAfter) || retryAfter : null,
    });
  }
  return new QuizOcrError("OCR_PROVIDER_ERROR", message, { status: response.status >= 500 ? 502 : 500 });
};

export const extractQuizImageOcrText = async (file, {
  signal,
  fetchImpl = fetch,
  config = getQuizOcrConfig(),
} = {}) => {
  if (!config.enabled) throw new QuizOcrError("OCR_DISABLED", "OCR ảnh chưa được bật", { status: 503 });
  if (!config.baseUrl || config.apiKeys.length === 0 || config.models.length === 0) {
    throw new QuizOcrError("OCR_NOT_CONFIGURED", "Máy chủ OCR chưa được cấu hình", { status: 503 });
  }
  if (!file?.buffer || !file?.mimetype) {
    throw new QuizOcrError("OCR_INVALID_IMAGE", "Ảnh OCR không hợp lệ", { status: 400 });
  }

  const imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  let lastError = null;

  for (let index = 0; index < Math.max(config.apiKeys.length, config.models.length); index += 1) {
    const apiKey = config.apiKeys[index % config.apiKeys.length];
    const model = config.models[index % config.models.length];
    const timeout = requestSignal(signal, config.timeoutMs);
    try {
      const response = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: config.maxTokens,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: buildQuizOcrPrompt() },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          }],
        }),
        signal: timeout.signal,
      });
      if (!response.ok) throw await parseProviderError(response);
      const body = await response.json();
      const text = cleanQuizOcrText(contentText(body?.choices?.[0]?.message?.content));
      if (!text) throw new QuizOcrError("OCR_EMPTY_RESULT", "Không đọc được chữ từ ảnh", { status: 422 });
      return text;
    } catch (error) {
      if (signal?.aborted) throw new QuizOcrError("OCR_REQUEST_ABORTED", "Yêu cầu OCR đã bị hủy", { status: 499, cause: error });
      if (timeout.signal.aborted) throw new QuizOcrError("OCR_TIMEOUT", "AI OCR quá thời gian", { status: 504, cause: error });
      lastError = error instanceof QuizOcrError
        ? error
        : new QuizOcrError("OCR_PROVIDER_UNAVAILABLE", "Không thể kết nối máy chủ OCR", { status: 502, cause: error });
      if (![429, 502, 503, 504].includes(lastError.status)) break;
    } finally {
      timeout.cleanup();
    }
  }

  throw lastError || new QuizOcrError("OCR_PROVIDER_UNAVAILABLE", "OCR ảnh thất bại", { status: 502 });
};

