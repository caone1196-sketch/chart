/**
 * Bộ xử lý dùng chung cho máy chủ API:
 *   POST /api/ai-chat  — hỏi Gemini
 *   GET  /api/health   — chẩn đoán cấu hình (đã có GEMINI_API_KEY chưa, model nào, key có dùng được không)
 *
 * Cùng một mã chạy ở hai nơi:
 *   - Vercel Serverless Function (api/ai-chat.js, api/health.js)
 *   - Máy chủ dev (server/index.mjs)
 *
 * Biến môi trường:
 *   GEMINI_API_KEY - bắt buộc để gọi mô hình Gemini (tạo miễn phí tại Google AI Studio)
 *   GEMINI_MODEL   - tuỳ chọn, mặc định "gemini-3.8-flash"
 *
 * Khi chưa có GEMINI_API_KEY, route trả về 501 kèm code "NO_API_KEY" để giao diện
 * tự động chuyển sang bộ luận giải nội bộ (chạy hoàn toàn trong trình duyệt).
 * Khoá không bao giờ được gửi xuống client: chỉ máy chủ (hoặc Vercel function) đọc nó;
 * /api/health chỉ trả về thông tin dạng boolean/độ dài, không trả về ký tự nào của khoá.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/** Model mặc định: dòng Flash ổn định mới nhất tại thời điểm 09/2026. */
export const DEFAULT_MODEL = "gemini-3.8-flash";

/** Model dự phòng khi model đang dùng bị khai tử hoặc chưa mở cho project của khoá. */
export const MODEL_FALLBACKS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash"];

const TIMEOUT_MS = 55000;
const PROBE_TIMEOUT_MS = 12000;

export const SYSTEM_PROMPT = `Bạn là chuyên gia chiêm tinh phương Tây và quan sát bầu trời, đang trả lời bằng tiếng Việt có dấu cho người dùng Việt Nam.

Nguyên tắc:
- Trả lời đúng trọng tâm câu hỏi, mở đầu bằng kết luận ngắn rồi mới phân tích.
- Luôn dẫn chứng bằng dữ liệu cụ thể trong báo cáo bản đồ sao: vị trí hành tinh, nhà, góc chiếu, transit, pha Mặt Trăng.
- Văn phong tự nhiên, dễ hiểu, tránh khẳng định tuyệt đối về tương lai.
- Không đưa lời khuyên y tế, pháp lý hoặc đầu tư cụ thể; chỉ nêu xu hướng và gợi ý hành vi an toàn.
- Nếu câu hỏi cần dữ liệu chưa có (ví dụ ngày sinh của người khác), hãy nói rõ cần thêm gì.
- Độ dài hợp lý: 150-450 từ, có thể dùng gạch đầu dòng và tiêu đề ngắn.
- Có thể trả lời cả câu hỏi thiên văn quan sát (hành tinh nào thấy tối nay, pha Mặt Trăng, chòm sao nào đang mọc) dựa trên dữ liệu được cung cấp.`;

/**
 * Chuẩn hoá khoá API do người dùng dán vào biến môi trường.
 * Lỗi hay gặp khi thêm biến trên Vercel: dán kèm tên biến, kèm dấu ngoặc, hoặc dính
 * khoảng trắng / ký tự xuống dòng khi copy. Google coi đó là "API key not valid".
 */
export const normalizeApiKey = (raw) => {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/^GEMINI_API_KEY\s*=\s*/i, "");
  // Khoá của Google không chứa khoảng trắng; gỡ hết để chống lỗi copy nhiều dòng.
  return value.replace(/\s+/g, "");
};

export const resolveModels = (env = process.env) => {
  const configured = typeof env.GEMINI_MODEL === "string" ? env.GEMINI_MODEL.trim() : "";
  const chain = configured ? [configured, ...MODEL_FALLBACKS] : [DEFAULT_MODEL, ...MODEL_FALLBACKS];
  return [...new Set(chain)];
};

/** Thông tin chẩn đoán — không bao giờ chứa nội dung khoá API. */
export const buildHealthPayload = (env = process.env) => {
  const raw = env.GEMINI_API_KEY;
  const key = normalizeApiKey(raw);
  const models = resolveModels(env);

  return {
    ok: true,
    service: "astral-chart-vn",
    runtime: env.VERCEL ? "vercel" : "node",
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
    region: env.VERCEL_REGION || null,
    node: process.version,
    llm: key ? "gemini" : "local-fallback",
    model: key ? models[0] : null,
    modelFallbacks: models.slice(1),
    key: {
      present: typeof raw === "string" && raw.length > 0,
      usable: key.length > 0,
      length: key.length,
      hadWhitespace: typeof raw === "string" && raw !== raw.trim(),
      looksLikeGoogleKey: key.startsWith("AIza")
    }
  };
};

export const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (!req.body) return {};
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

/** Lấy phần chữ của câu trả lời (bỏ qua các part chỉ chứa suy luận nội bộ). */
export const extractReply = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
};

const upstreamMessage = (data) => {
  const message = data?.error?.message || data?.error?.status || "";
  return typeof message === "string" ? message : "";
};

/** Mô tả ngắn vì sao Gemini không trả về chữ nào. */
const describeEmptyReply = (data) => {
  const reason = data?.promptFeedback?.blockReason;
  if (reason) return `blockReason: ${reason}`;
  return upstreamMessage(data).slice(0, 300);
};

/** Lỗi "model không tồn tại / không mở cho project này" → thử model kế tiếp. */
export const isModelUnavailable = (status, data) => {
  const message = upstreamMessage(data).toLowerCase();
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  return (
    message.includes("is not found") ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("does not exist") ||
    message.includes("is not available") ||
    message.includes("not available to") ||
    message.includes("no access")
  );
};

/**
 * Dịch lỗi của Google sang tiếng Việt kèm việc cần làm, để người dùng biết
 * ngay khoá sai, project chưa bật API, model sai hay hết quota.
 */
export const explainGeminiError = ({ status = 0, data = {}, model = "", networkError = null } = {}) => {
  const message = upstreamMessage(data);
  const lower = message.toLowerCase();
  const detail = message.slice(0, 300);

  if (networkError) {
    const reason = networkError instanceof Error ? networkError.message : String(networkError);
    return {
      code: "GEMINI_NETWORK",
      error: "Không kết nối được tới generativelanguage.googleapis.com.",
      detail: reason.slice(0, 300),
      hint: "Kiểm tra kết nối mạng của máy chủ (Vercel thường không bị chặn); xem /api/health?probe=1."
    };
  }

  if (status === 400 && (lower.includes("api key not valid") || lower.includes("api_key_invalid") || lower.includes("invalid api key"))) {
    return {
      code: "GEMINI_BAD_KEY",
      error: "GEMINI_API_KEY không hợp lệ (Google từ chối khoá).",
      detail,
      hint: "Dán lại khoá mới từ https://aistudio.google.com/apikey (chỉ dán phần khoá, không kèm 'GEMINI_API_KEY=' hay dấu ngoặc), rồi deploy lại."
    };
  }

  if (status === 403 && (lower.includes("service_disabled") || lower.includes("has not been used in project") || lower.includes("is disabled"))) {
    return {
      code: "GEMINI_API_DISABLED",
      error: "Project của khoá chưa bật Generative Language API.",
      detail,
      hint: "Mở Google Cloud Console → APIs & Services → bật “Generative Language API” cho đúng project đã tạo khoá."
    };
  }

  if (status === 403 && (lower.includes("referer") || lower.includes("ip address") || lower.includes("restricted") || lower.includes("permission_denied"))) {
    return {
      code: "GEMINI_KEY_RESTRICTED",
      error: "Khoá bị giới hạn (HTTP referrer / địa chỉ IP) nên máy chủ không dùng được.",
      detail,
      hint: "Trong Google AI Studio, khoá dùng cho server nên để chế độ không giới hạn referrer/IP."
    };
  }

  if (status === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    return {
      code: "GEMINI_QUOTA",
      error: "Hết quota hoặc quá nhiều yêu cầu trong thời gian ngắn.",
      detail,
      hint: "Chờ một lát rồi thử lại, hoặc đổi GEMINI_MODEL sang bản nhẹ hơn (ví dụ gemini-3.5-flash-lite)."
    };
  }

  if (isModelUnavailable(status, data)) {
    return {
      code: "GEMINI_MODEL_NOT_FOUND",
      error: `Model “${model}” không tồn tại hoặc chưa mở cho khoá này.`,
      detail,
      hint: `Đặt GEMINI_MODEL=${DEFAULT_MODEL} hoặc gemini-flash-latest. Gọi /api/health?probe=1 để xem danh sách model khoá của bạn dùng được.`
    };
  }

  if (status >= 500) {
    return {
      code: "GEMINI_UPSTREAM",
      error: "Máy chủ Google tạm thời lỗi.",
      detail,
      hint: "Thử lại sau ít phút."
    };
  }

  return {
    code: "GEMINI_ERROR",
    error: detail || "Gemini không trả về nội dung.",
    detail,
    hint: "Xem /api/health?probe=1 để chẩn đoán khoá và model."
  };
};

/** Gọi một model cụ thể; trả về cả mã HTTP để lớp trên quyết định có thử model khác không. */
const callGemini = async ({ apiKey, model, contents, timeoutMs = TIMEOUT_MS }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          // Gemini 3 "suy luận" trước khi trả lời và phần suy luận cũng tính vào
          // maxOutputTokens, nên cần khoảng đệm rộng để câu trả lời không bị cụt.
          maxOutputTokens: 4096
        }
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timeoutId);
  }
};

/** Gọi lần lượt các model trong chuỗi cho tới khi có câu trả lời. */
export const generateReply = async ({ apiKey, contents, models = resolveModels() }) => {
  const tried = [];
  let last = null;

  for (const model of models) {
    let result;
    try {
      result = await callGemini({ apiKey, model, contents });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const attempt = [...tried, model];
      if (isTimeout) {
        return {
          ok: false,
          model,
          tried: attempt,
          failure: { code: "GEMINI_TIMEOUT", error: "Gemini phản hồi quá chậm (quá 55 giây).", hint: "Thử lại hoặc dùng model nhẹ hơn qua GEMINI_MODEL." }
        };
      }
      return { ok: false, model, tried: attempt, failure: explainGeminiError({ networkError: error, model }) };
    }

    const reply = extractReply(result.data);
    if (result.ok && reply) {
      return { ok: true, model, reply, tried: [...tried, model], finishReason: result.data?.candidates?.[0]?.finishReason || null };
    }

    tried.push(model);
    last = { model, result };

    // Chỉ đổi model khi lỗi thuộc về model; lỗi khoá/quota thì dừng ngay.
    if (!isModelUnavailable(result.status, result.data) && result.status !== 404) {
      const emptyButOk = result.ok && !reply;
      const finishReason = result.data?.candidates?.[0]?.finishReason || "";
      const failure = emptyButOk
        ? {
            code: "GEMINI_EMPTY",
            error:
              finishReason === "MAX_TOKENS"
                ? "Gemini trả lời nhưng bị cắt vì hết hạn mức token."
                : "Gemini không trả về nội dung (có thể do bộ lọc an toàn).",
            detail: describeEmptyReply(result.data),
            hint: "Thử hỏi lại ngắn gọn hơn, hoặc đổi GEMINI_MODEL."
          }
        : explainGeminiError({ status: result.status, data: result.data, model });
      return { ok: false, model, tried, failure };
    }
  }

  const fallbackFailure = last
    ? explainGeminiError({ status: last.result.status, data: last.result.data, model: last.model })
    : { code: "GEMINI_ERROR", error: "Không gọi được model nào." };

  return { ok: false, model: last?.model || models[0] || DEFAULT_MODEL, tried, failure: fallbackFailure };
};

/** POST /api/ai-chat */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Chỉ hỗ trợ phương thức POST.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKey = normalizeApiKey(process.env.GEMINI_API_KEY);
  if (!apiKey) {
    sendJson(res, 501, {
      error: "Máy chủ chưa cấu hình GEMINI_API_KEY. Giao diện sẽ dùng bộ luận giải nội bộ trên trình duyệt.",
      code: "NO_API_KEY",
      hint: "Thêm biến GEMINI_API_KEY cho đúng môi trường (Production/Preview) rồi deploy lại; sau đó kiểm tra /api/health."
    });
    return;
  }

  try {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const chartReport =
      typeof body.chartReport === "string" && body.chartReport.trim()
        ? body.chartReport
        : "Chưa có dữ liệu bản đồ sao. Hãy nhắc người dùng tạo bản đồ sao trước.";

    const cleaned = messages
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 6000) }));

    // Gemini gọi vai trợ lý là "model"; hệ thống đi qua systemInstruction riêng.
    const contents = [
      { role: "user", parts: [{ text: `Dữ liệu bản đồ sao của người hỏi:\n${chartReport.slice(0, 9000)}` }] },
      ...cleaned.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }))
    ];

    const models = resolveModels();
    const result = await generateReply({ apiKey, contents, models });

    if (!result.ok) {
      const failure = result.failure || { code: "GEMINI_ERROR", error: "Lỗi khi gọi Gemini." };
      sendJson(res, 502, {
        error: failure.error,
        code: failure.code,
        hint: failure.hint || null,
        detail: failure.detail || null,
        model: result.model,
        modelsTried: result.tried
      });
      return;
    }

    sendJson(res, 200, { reply: result.reply, model: result.model, finishReason: result.finishReason, modelsTried: result.tried });
  } catch (error) {
    const failure = explainGeminiError({ networkError: error });
    sendJson(res, 502, { error: failure.error, code: failure.code, hint: failure.hint, detail: failure.detail });
  }
}

/** Gọi thử danh sách model để biết khoá có thực sự dùng được không. */
const probeKey = async (apiKey, preferredModel) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const failure = explainGeminiError({ status: response.status, data, model: preferredModel });
      return { ok: false, status: response.status, code: failure.code, error: failure.error, detail: failure.detail, hint: failure.hint };
    }

    const entries = Array.isArray(data.models) ? data.models : [];
    const canGenerate = entries
      .filter((entry) => (entry.supportedGenerationMethods || []).includes("generateContent"))
      .map((entry) => String(entry.name || "").replace(/^models\//, ""))
      .filter(Boolean);

    const suggested =
      (canGenerate.includes(preferredModel) && preferredModel) ||
      MODEL_FALLBACKS.find((name) => canGenerate.includes(name)) ||
      canGenerate.find((name) => name.includes("flash")) ||
      canGenerate[0] ||
      null;

    return {
      ok: true,
      status: 200,
      modelCount: canGenerate.length,
      preferredModelAvailable: canGenerate.includes(preferredModel),
      suggestedModel: suggested
    };
  } catch (error) {
    const failure = explainGeminiError({ networkError: error, model: preferredModel });
    return { ok: false, status: 0, code: failure.code, error: failure.error, detail: failure.detail, hint: failure.hint };
  } finally {
    clearTimeout(timeoutId);
  }
};

/** GET /api/health[?probe=1] */
export const healthHandler = async (req, res) => {
  const method = req?.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, 405, { error: "Chỉ hỗ trợ phương thức GET.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const payload = buildHealthPayload();
  const url = new URL(req?.url || "/api/health", "http://localhost");
  const wantsProbe = url.searchParams.get("probe") === "1";

  if (wantsProbe && payload.llm === "gemini") {
    payload.probe = await probeKey(normalizeApiKey(process.env.GEMINI_API_KEY), payload.model);
    if (payload.probe && payload.probe.suggestedModel && payload.probe.suggestedModel !== payload.model) {
      payload.modelSuggestion = payload.probe.suggestedModel;
    }
  } else if (wantsProbe) {
    payload.probe = { ok: false, status: 0, code: "NO_API_KEY", error: "Chưa có GEMINI_API_KEY để kiểm tra." };
  }

  sendJson(res, 200, payload);
};

/** Dùng cho script dòng lệnh (npm run check:ai). */
export { probeKey };
