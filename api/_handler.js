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
 *   GEMINI_API_KEY   - khoá Gemini (tạo miễn phí tại Google AI Studio)
 *   GEMINI_API_KEYS  - tuỳ chọn, NHIỀU khoá ngăn cách bằng dấu phẩy / chấm phẩy / xuống dòng
 *   GEMINI_API_KEY_2 … GEMINI_API_KEY_9 - tuỳ chọn, khai từng khoá dự phòng
 *   GEMINI_MODEL     - tuỳ chọn, mặc định "gemini-3.6-flash"
 *
 * Nhiều khoá: app thử khoá #1 trước; gặp lỗi **thuộc về khoá** (khoá sai, khoá bị giới hạn
 * referrer/IP, hết quota) thì tự xoay sang khoá kế tiếp — vẫn chỉ gọi đúng model
 * `gemini-3.6-flash`. Lỗi thuộc về model thì không xoay khoá (tránh nhân số lần gọi lỗi).
 * Khoá chỉ nằm ở máy chủ: mọi phản hồi (kể cả lỗi) chỉ nói số thứ tự khoá, không bao giờ
 * trả lại nội dung khoá.
 *
 * Khi chưa có GEMINI_API_KEY, route trả về 501 kèm code "NO_API_KEY" để giao diện
 * tự động chuyển sang bộ luận giải nội bộ (chạy hoàn toàn trong trình duyệt).
 * Khoá không bao giờ được gửi xuống client: chỉ máy chủ (hoặc Vercel function) đọc nó;
 * /api/health chỉ trả về thông tin dạng boolean/độ dài, không trả về ký tự nào của khoá.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/** Model duy nhất app sử dụng: Gemini 3.6 Flash. */
export const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * Không còn chuỗi model dự phòng: app chỉ gọi đúng một model (mặc định
 * gemini-3.6-flash, hoặc GEMINI_MODEL nếu người dùng tự đặt). Mảng rỗng này
 * được giữ lại để các hàm resolveModels / probeKey không phải đổi chữ ký.
 */
export const MODEL_FALLBACKS = [];

const TIMEOUT_MS = 55000;
const PROBE_TIMEOUT_MS = 9000;

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

/**
 * Tách một biến môi trường chứa nhiều khoá (ngăn cách bằng dấu phẩy, chấm phẩy,
 * khoảng trắng hoặc xuống dòng) thành từng khoá đã chuẩn hoá.
 */
export const splitApiKeys = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/[\s,;]+/)
    .map((piece) => normalizeApiKey(piece))
    .filter(Boolean);
};

/**
 * Danh sách khoá dùng để gọi Gemini, theo thứ tự ưu tiên:
 *   1. GEMINI_API_KEYS       (danh sách gộp, nên đặt khoá mạnh nhất trước)
 *   2. GEMINI_API_KEY        (khoá chính, cách khai cũ vẫn chạy y như trước)
 *   3. GEMINI_API_KEY_2 … _9 (từng khoá dự phòng)
 * Khoá trùng nhau bị gỡ, khoá rỗng bị bỏ qua.
 */
export const buildApiKeyList = (env = process.env) => {
  const collected = [
    ...splitApiKeys(env.GEMINI_API_KEYS),
    ...(normalizeApiKey(env.GEMINI_API_KEY) ? [normalizeApiKey(env.GEMINI_API_KEY)] : []),
  ];

  for (let index = 2; index <= 9; index += 1) {
    const value = normalizeApiKey(env[`GEMINI_API_KEY_${index}`]);
    if (value) collected.push(value);
  }

  return [...new Set(collected)];
};

/** Nhãn an toàn cho một khoá trong thông báo: chỉ số thứ tự + 4 ký tự cuối, không lộ khoá. */
export const describeKey = (apiKey, index) => {
  const tail = typeof apiKey === "string" && apiKey.length >= 4 ? apiKey.slice(-4) : "";
  return `khoá #${index + 1}${tail ? ` (…${tail})` : ""}`;
};

export const resolveModels = (env = process.env) => {
  const configured = typeof env.GEMINI_MODEL === "string" ? env.GEMINI_MODEL.trim() : "";
  const chain = configured ? [configured, ...MODEL_FALLBACKS] : [DEFAULT_MODEL, ...MODEL_FALLBACKS];
  return [...new Set(chain)];
};

/**
 * Thông tin chẩn đoán — không bao giờ chứa nội dung khoá API.
 *
 * `key` giữ nguyên hình dạng cũ (khoá đầu tiên) để giao diện/phiên bản cũ không vỡ;
 * `keys` bổ sung thông tin nhiều khoá: tổng số, số khoá dùng được, và nguồn khai báo
 * (`GEMINI_API_KEYS` / `GEMINI_API_KEY` / `GEMINI_API_KEY_n`) — chỉ là tên biến, không phải giá trị.
 */
export const buildHealthPayload = (env = process.env) => {
  const raw = env.GEMINI_API_KEY;
  const keys = buildApiKeyList(env);
  const models = resolveModels(env);
  const first = keys[0] || "";
  const sources = [];
  if (splitApiKeys(env.GEMINI_API_KEYS).length) sources.push("GEMINI_API_KEYS");
  if (normalizeApiKey(raw)) sources.push("GEMINI_API_KEY");
  for (let index = 2; index <= 9; index += 1) {
    if (normalizeApiKey(env[`GEMINI_API_KEY_${index}`])) sources.push(`GEMINI_API_KEY_${index}`);
  }

  return {
    ok: true,
    service: "astral-chart-vn",
    runtime: env.VERCEL ? "vercel" : "node",
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
    region: env.VERCEL_REGION || null,
    node: process.version,
    llm: keys.length ? "gemini" : "local-fallback",
    model: keys.length ? models[0] : null,
    modelFallbacks: models.slice(1),
    key: {
      present: typeof raw === "string" && raw.length > 0,
      usable: first.length > 0,
      length: first.length,
      hadWhitespace: typeof raw === "string" && raw !== raw.trim(),
      looksLikeGoogleKey: first.startsWith("AIza")
    },
    keys: {
      total: keys.length,
      usable: keys.filter((value) => value.startsWith("AIza")).length,
      needsReview: keys.filter((value) => !value.startsWith("AIza")).length,
      sources,
      /** Chỉ độ dài của từng khoá — không bao giờ trả nội dung khoá. */
      lengths: keys.map((value) => value.length),
      rotation: keys.length > 1
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
      hint: "Chờ một lát rồi thử lại."
    };
  }

  if (isModelUnavailable(status, data)) {
    return {
      code: "GEMINI_MODEL_NOT_FOUND",
      error: `Model “${model}” không tồn tại hoặc chưa mở cho khoá này.`,
      detail,
      hint: `App chỉ dùng model ${DEFAULT_MODEL}. Gọi /api/health?probe=1 để xem model này có mở cho khoá của bạn không.`
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

/**
 * Lỗi thuộc về KHOÁ (hoặc lỗi tạm thời của Google) → thử khoá kế tiếp là hợp lý:
 *   · GEMINI_BAD_KEY / GEMINI_KEY_RESTRICTED: khoá sai hoặc bị giới hạn referrer/IP
 *   · GEMINI_QUOTA: hết quota của khoá đó
 *   · GEMINI_MODEL_NOT_FOUND / GEMINI_UPSTREAM: khoá thuộc project khác hoặc Google đang lỗi
 * Lỗi còn lại (câu trả lời rỗng do bộ lọc an toàn, quá thời gian, mất mạng) không xoay khoá
 * vì xoay cũng không giải quyết được gì, chỉ nhân thêm số lần gọi.
 */
export const isKeyRotationFailure = (code) =>
  code === "GEMINI_BAD_KEY" ||
  code === "GEMINI_KEY_RESTRICTED" ||
  code === "GEMINI_QUOTA" ||
  code === "GEMINI_MODEL_NOT_FOUND" ||
  code === "GEMINI_UPSTREAM";

/**
 * Gọi Gemini, tự xoay khoá khi cần.
 *
 * `apiKeys` là danh sách khoá theo thứ tự ưu tiên (xem `buildApiKeyList`). Với mỗi khoá, app
 * thử lần lượt các model; lỗi thuộc về khoá thì chuyển ngay sang khoá kế tiếp, còn lỗi thuộc
 * về model thì thử model khác trên cùng khoá. Kết quả trả về **không bao giờ** chứa nội dung
 * khoá — chỉ có số thứ tự `keyIndex` (0-based) và ghi chú `keyNote` đã ẩn danh.
 *
 * Vẫn nhận tham số `apiKey` đơn cũ để không phá vỡ nơi gọi khác.
 */
export const generateReply = async ({ apiKeys, apiKey, contents, models = resolveModels() }) => {
  const keys = Array.isArray(apiKeys) && apiKeys.length ? apiKeys : apiKey ? [apiKey] : [];
  if (!keys.length) {
    return {
      ok: false,
      model: models[0] || DEFAULT_MODEL,
      tried: [],
      keyIndex: -1,
      keyCount: 0,
      keyRotations: 0,
      keyAttempts: [],
      failure: {
        code: "NO_API_KEY",
        error: "Máy chủ chưa cấu hình GEMINI_API_KEY (hoặc GEMINI_API_KEYS / GEMINI_API_KEY_2…9).",
        hint: "Thêm biến môi trường rồi deploy lại; kiểm tra bằng /api/health."
      }
    };
  }

  const tried = [];
  const keyAttempts = [];
  let last = null;

  const noteFor = (currentIndex) =>
    keyAttempts.length
      ? `Đã xoay sang ${describeKey(keys[currentIndex], currentIndex)} sau khi ${keyAttempts
          .map((attempt) => `${describeKey(keys[attempt.index], attempt.index)} lỗi ${attempt.code}`)
          .join(", ")}.`
      : null;

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const currentKey = keys[keyIndex];
    let rotate = false;

    for (const model of models) {
      if (!tried.includes(model)) tried.push(model);

      let result;
      try {
        result = await callGemini({ apiKey: currentKey, model, contents });
      } catch (error) {
        const isTimeout = error instanceof Error && error.name === "AbortError";
        const failure = isTimeout
          ? { code: "GEMINI_TIMEOUT", error: "Gemini phản hồi quá chậm (quá 55 giây).", hint: "Thử lại sau ít phút." }
          : explainGeminiError({ networkError: error, model });
        return { ok: false, model, tried, keyIndex, keyCount: keys.length, keyRotations: keyAttempts.length, keyAttempts, failure };
      }

      const reply = extractReply(result.data);
      if (result.ok && reply) {
        return {
          ok: true,
          model,
          reply,
          tried,
          finishReason: result.data?.candidates?.[0]?.finishReason || null,
          keyIndex,
          keyCount: keys.length,
          keyRotations: keyAttempts.length,
          keyNote: noteFor(keyIndex)
        };
      }

      const finishReason = result.data?.candidates?.[0]?.finishReason || "";
      const emptyButOk = result.ok && !reply;
      const failure = emptyButOk
        ? {
            code: "GEMINI_EMPTY",
            error:
              finishReason === "MAX_TOKENS"
                ? "Gemini trả lời nhưng bị cắt vì hết hạn mức token."
                : "Gemini không trả về nội dung (có thể do bộ lọc an toàn).",
            detail: describeEmptyReply(result.data),
            hint: "Thử hỏi lại ngắn gọn hơn."
          }
        : explainGeminiError({ status: result.status, data: result.data, model });

      last = { model, keyIndex, failure };

      // Câu trả lời rỗng / lỗi lạ: xoay khoá không giúp gì → dừng ngay.
      if (emptyButOk) {
        return { ok: false, model, tried, keyIndex, keyCount: keys.length, keyRotations: keyAttempts.length, keyAttempts, failure };
      }

      if (isModelUnavailable(result.status, result.data)) {
        continue; // model này không mở cho khoá này → thử model kế trên cùng khoá
      }

      if (isKeyRotationFailure(failure.code) && keyIndex + 1 < keys.length) {
        keyAttempts.push({ index: keyIndex, code: failure.code, model });
        rotate = true;
        break; // sang khoá kế tiếp
      }

      if (isKeyRotationFailure(failure.code)) {
        keyAttempts.push({ index: keyIndex, code: failure.code, model });
        return { ok: false, model, tried, keyIndex, keyCount: keys.length, keyRotations: keyAttempts.length, keyAttempts, failure };
      }

      return { ok: false, model, tried, keyIndex, keyCount: keys.length, keyRotations: keyAttempts.length, keyAttempts, failure };
    }

    // Hết danh sách model mà không lỗi nào thuộc về khoá: khoá khác có thể thuộc project
    // đã mở model → vẫn thử khoá kế (ghi lại lý do để người dùng biết đã xoay).
    if (!rotate && keyIndex + 1 < keys.length) {
      const failure = last?.failure ?? { code: "GEMINI_MODEL_NOT_FOUND", error: `Không gọi được model ${models[0]}.` };
      keyAttempts.push({ index: keyIndex, code: failure.code, model: last?.model || models[0] });
      rotate = true;
    }
  }

  const fallbackFailure =
    last?.failure ?? explainGeminiError({ status: 0, data: {}, model: models[0] }) ?? { code: "GEMINI_ERROR", error: "Không gọi được model nào." };

  return {
    ok: false,
    model: last?.model || models[0] || DEFAULT_MODEL,
    tried,
    keyIndex: last?.keyIndex ?? keys.length - 1,
    keyCount: keys.length,
    keyRotations: keyAttempts.length,
    keyAttempts,
    failure: fallbackFailure
  };
};

/** POST /api/ai-chat */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Chỉ hỗ trợ phương thức POST.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKeys = buildApiKeyList();
  if (!apiKeys.length) {
    sendJson(res, 501, {
      error: "Máy chủ chưa cấu hình khoá Gemini. Giao diện sẽ dùng bộ luận giải nội bộ trên trình duyệt.",
      code: "NO_API_KEY",
      hint: "Thêm GEMINI_API_KEY (hoặc GEMINI_API_KEYS / GEMINI_API_KEY_2…9) cho đúng môi trường (Production/Preview) rồi deploy lại; sau đó kiểm tra /api/health."
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
    const result = await generateReply({ apiKeys, contents, models });

    if (!result.ok) {
      const failure = result.failure || { code: "GEMINI_ERROR", error: "Lỗi khi gọi Gemini." };
      sendJson(res, 502, {
        error: failure.error,
        code: failure.code,
        hint: failure.hint || null,
        detail: failure.detail || null,
        model: result.model,
        modelsTried: result.tried,
        keysConfigured: result.keyCount,
        keyAttempts: result.keyAttempts.map((attempt) => ({ key: attempt.index + 1, code: attempt.code }))
      });
      return;
    }

    sendJson(res, 200, {
      reply: result.reply,
      model: result.model,
      finishReason: result.finishReason,
      modelsTried: result.tried,
      keyUsed: result.keyIndex + 1,
      keysConfigured: result.keyCount,
      keyRotations: result.keyRotations,
      keyNote: result.keyNote
    });
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

/**
 * Kiểm tra từng khoá bằng ListModels (không tốn quota sinh nội dung).
 * Trả về kết quả của **tối đa** `limit` khoá, kèm bản tổng kết; không bao giờ lộ nội dung khoá.
 */
export const probeKeys = async (apiKeys, preferredModel, limit = 5) => {
  const keys = Array.isArray(apiKeys) ? apiKeys.slice(0, Math.max(1, limit)) : [];
  // Kiểm tra song song: 5 khoá vẫn chỉ tốn thời gian của một lần gọi (giới hạn 60 giây
  // của function trên Vercel), trong khi tuần tự sẽ là 5 lần.
  const settled = await Promise.all(
    keys.map((key) => probeKey(key, preferredModel).catch((error) => explainGeminiError({ networkError: error, model: preferredModel })))
  );
  const results = settled.map((result, index) => ({ key: index + 1, ...result }));
  const usable = results.filter((item) => item.ok).length;
  return {
    /** Kết quả khoá đầu tiên — giữ nguyên hình dạng cũ cho giao diện cũ. */
    first: results[0] ?? { ok: false, status: 0, code: "NO_API_KEY", error: "Chưa có khoá để kiểm tra." },
    results,
    summary: {
      checked: results.length,
      total: Array.isArray(apiKeys) ? apiKeys.length : 0,
      usable,
      allFailed: results.length > 0 && usable === 0
    }
  };
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
  const apiKeys = buildApiKeyList();

  if (wantsProbe && apiKeys.length) {
    const probed = await probeKeys(apiKeys, payload.model);
    payload.probe = probed.first;
    payload.probes = probed.results;
    payload.probeSummary = probed.summary;
    payload.keys.usable = probed.summary.usable;
    payload.keys.failed = probed.summary.checked - probed.summary.usable;

    if (probed.first.suggestedModel && probed.first.suggestedModel !== payload.model) {
      payload.modelSuggestion = probed.first.suggestedModel;
    }
    if (probed.summary.allFailed) {
      payload.hint =
        apiKeys.length > 1
          ? "Không khoá nào dùng được — kiểm tra lại từng khoá trong GEMINI_API_KEYS / GEMINI_API_KEY_n."
          : "Khoá chưa dùng được — xem mã lỗi trong probe rồi làm theo gợi ý.";
    }
  } else if (wantsProbe) {
    payload.probe = { ok: false, status: 0, code: "NO_API_KEY", error: "Chưa có khoá Gemini để kiểm tra." };
    payload.probes = [];
    payload.probeSummary = { checked: 0, total: 0, usable: 0, allFailed: false };
  }

  sendJson(res, 200, payload);
};

/** Dùng cho script dòng lệnh (npm run check:ai). */
export { probeKey };
