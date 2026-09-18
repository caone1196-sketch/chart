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
 *   GEMINI_MODEL_FALLBACKS - tuỳ chọn, model dự phòng (ngăn bằng dấu phẩy) khi model chính
 *                      bị Google báo quá tải / không mở cho khoá; mặc định KHÔNG có model nào
 *   GEMINI_MAX_ATTEMPTS / GEMINI_RETRY_BASE_MS / GEMINI_RETRY_MAX_MS / GEMINI_BUDGET_MS /
 *   GEMINI_QUOTA_WAIT_MS - tuỳ chọn, chỉnh số lần tự thử lại khi Google lỗi tạm thời
 *
 * Nhiều khoá: app thử khoá #1 trước; gặp lỗi **thuộc về khoá** (khoá sai, khoá bị giới hạn
 * referrer/IP, hết quota) thì tự xoay sang khoá kế tiếp — vẫn chỉ gọi đúng model
 * `gemini-3.6-flash`. Lỗi thuộc về model thì không xoay khoá (tránh nhân số lần gọi lỗi).
 * Khoá chỉ nằm ở máy chủ: mọi phản hồi (kể cả lỗi) chỉ nói số thứ tự khoá, không bao giờ
 * trả lại nội dung khoá.
 *
 * Lỗi TẠM THỜI của Google (5xx — hay gặp nhất là 503 "The model is overloaded", hoặc rớt
 * kết nối giữa chừng) KHÔNG phải lỗi khoá: chờ rồi gọi lại thường là được. Vì vậy máy chủ tự
 * thử lại tối đa GEMINI_MAX_ATTEMPTS lần với thời gian chờ tăng dần (backoff + jitter), tôn
 * trọng header `Retry-After` / `RetryInfo.retryDelay` của Google, và luôn dừng trước
 * GEMINI_BUDGET_MS để kịp trả lời trong maxDuration 60 giây của Vercel Function. Hết lượt thử
 * lại mới xoay khoá / đổi model, và phản hồi lỗi luôn kèm `retryable: true` để giao diện hiện
 * nút “Thử lại với Gemini”.
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
 * Không còn chuỗi model dự phòng CỨNG: app chỉ gọi đúng một model (mặc định
 * gemini-3.6-flash, hoặc GEMINI_MODEL nếu người dùng tự đặt). Mảng rỗng này
 * được giữ lại để các hàm resolveModels / probeKey không phải đổi chữ ký.
 * Muốn có model dự phòng (ví dụ khi model chính bị Google báo quá tải), khai
 * biến môi trường GEMINI_MODEL_FALLBACKS=gemini-3.5-flash,gemini-2.5-flash.
 */
export const MODEL_FALLBACKS = [];

const TIMEOUT_MS = 55000;
const PROBE_TIMEOUT_MS = 9000;

/** Một lần gọi Gemini phải còn ít nhất chừng này mili-giây thì mới đáng bắt đầu. */
const MIN_ATTEMPT_MS = 4000;

/** Đọc số nguyên từ biến môi trường, sai định dạng thì dùng giá trị mặc định. */
const numberFromEnv = (raw, fallback) => {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Cài đặt cơ chế tự thử lại. Tất cả đều chỉnh được bằng biến môi trường để người dùng
 * tự cân giữa “cố chờ Gemini” và “rơi nhanh về bộ luận giải nội bộ”:
 *   maxAttempts - số lần gọi Google tối đa cho MỖI (khoá, model) trước khi đổi khoá/model
 *   baseDelayMs - thời gian chờ trước lần thử thứ 2 (tăng gấp đôi mỗi lần, có jitter)
 *   maxDelayMs  - trần của mỗi khoảng chờ
 *   budgetMs    - tổng quỹ thời gian cho cả chuỗi thử (phải < maxDuration 60s của Vercel)
 *   quotaWaitMs - chỉ chờ 429 khi Google bảo chờ không lâu hơn mức này (0 = không bao giờ chờ)
 */
export const retrySettings = (env = process.env) => ({
  maxAttempts: clamp(Math.round(numberFromEnv(env.GEMINI_MAX_ATTEMPTS, 3)), 1, 6),
  baseDelayMs: clamp(Math.round(numberFromEnv(env.GEMINI_RETRY_BASE_MS, 800)), 0, 20000),
  maxDelayMs: clamp(Math.round(numberFromEnv(env.GEMINI_RETRY_MAX_MS, 6000)), 0, 30000),
  budgetMs: clamp(Math.round(numberFromEnv(env.GEMINI_BUDGET_MS, 45000)), MIN_ATTEMPT_MS, 55000),
  quotaWaitMs: clamp(Math.round(numberFromEnv(env.GEMINI_QUOTA_WAIT_MS, 10000)), 0, 30000)
});

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Google nói phải chờ bao lâu trước khi thử lại:
 *   · header `Retry-After` (giây hoặc HTTP-date)
 *   · `error.details[].retryDelay` dạng "12.5s" (RetryInfo của google.rpc)
 * Trả về mili-giây, hoặc `null` khi Google không nói gì.
 */
export const parseRetryDelayMs = (headers, data) => {
  const header = typeof headers?.get === "function" ? headers.get("retry-after") : null;
  if (typeof header === "string" && header.trim()) {
    const seconds = Number(header.trim());
    if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
    const when = Date.parse(header.trim());
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  }

  const details = Array.isArray(data?.error?.details) ? data.error.details : [];
  for (const item of details) {
    const delay = item?.retryDelay ?? item?.metadata?.retryDelay;
    if (typeof delay === "string") {
      const match = /^\s*([\d.]+)\s*s\s*$/.exec(delay);
      if (match) return Math.max(0, Math.round(Number(match[1]) * 1000));
    }
  }
  return null;
};

/**
 * Thời gian chờ trước lần thử kế tiếp: exponential backoff + jitter, nhưng không nhỏ hơn
 * mốc Google yêu cầu (nếu Google yêu cầu chờ lâu hơn mức cho phép thì coi như không chờ).
 */
export const backoffDelayMs = ({ retryIndex, settings, retryAfterMs = null, capMs }) => {
  const exponential = Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** Math.max(0, retryIndex - 1));
  // baseDelayMs = 0 (thường là trong test) thì không cộng jitter để kết quả đo được.
  const jitter = settings.baseDelayMs > 0 ? Math.floor(Math.random() * 250) : 0;
  const own = exponential + jitter;
  const suggested = retryAfterMs === null ? own : Math.max(own, retryAfterMs);
  return Math.min(suggested, capMs);
};

/**
 * Lỗi TẠM THỜI — chờ một chút rồi gọi lại cùng khoá, cùng model là cách xử lý đúng:
 *   · GEMINI_UPSTREAM: Google trả 5xx (503 "model is overloaded" là phổ biến nhất)
 *   · GEMINI_NETWORK : rớt kết nối / reset giữa chừng
 * Không phải lỗi khoá, nên thông báo phải nói rõ điều đó để người dùng không đi tạo khoá mới.
 */
export const TRANSIENT_CODES = ["GEMINI_UPSTREAM", "GEMINI_NETWORK"];

export const isTransientFailure = (code) => TRANSIENT_CODES.includes(code);

/** Tên trạng thái kiểu Google (UNAVAILABLE, INTERNAL…) để đưa vào thông báo chẩn đoán. */
const upstreamStatusName = (data) => {
  const value = data?.error?.status;
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

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
 * Tách một biến môi trường dạng danh sách (ngăn cách bằng dấu phẩy, chấm phẩy, khoảng trắng
 * hoặc xuống dòng) thành từng phần tử đã chuẩn hoá (bỏ dấu ngoặc, bỏ khoảng trắng thừa).
 */
export const splitList = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/[\s,;]+/)
    .map((piece) => normalizeApiKey(piece))
    .filter(Boolean);
};

/**
 * Tách một biến môi trường chứa nhiều khoá (ngăn cách bằng dấu phẩy, chấm phẩy,
 * khoảng trắng hoặc xuống dòng) thành từng khoá đã chuẩn hoá.
 */
export const splitApiKeys = (raw) => splitList(raw);

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

/**
 * Chuỗi model sẽ gọi, theo thứ tự:
 *   1. GEMINI_MODEL (hoặc gemini-3.6-flash mặc định)
 *   2. GEMINI_MODEL_FALLBACKS (tuỳ chọn, ngăn bằng dấu phẩy / khoảng trắng / xuống dòng)
 * Mặc định không khai GEMINI_MODEL_FALLBACKS nên chuỗi vẫn chỉ có đúng MỘT model.
 */
export const resolveModels = (env = process.env) => {
  const configured = typeof env.GEMINI_MODEL === "string" ? env.GEMINI_MODEL.trim() : "";
  const extra = splitApiKeys(env.GEMINI_MODEL_FALLBACKS); // cùng bộ tách chuỗi: phẩy/chấm phẩy/xuống dòng
  const chain = [configured || DEFAULT_MODEL, ...extra, ...MODEL_FALLBACKS];
  return [...new Set(chain.map((name) => name.trim()).filter(Boolean))];
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
    },
    /** Cơ chế tự thử lại khi Google lỗi tạm thời (5xx) — để /api/health và UI nói rõ app sẽ cố mấy lần. */
    retry: retrySettings(env)
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
 *
 * Mỗi lỗi còn kèm các trường chẩn đoán:
 *   `retryable`  - lỗi tạm thời, chờ rồi gọi lại có thể được (5xx / rớt mạng / 429)
 *   `httpStatus` - mã HTTP Google trả về (0 khi chưa gọi được tới Google)
 *   `upstreamStatus` - tên trạng thái kiểu Google (UNAVAILABLE, INTERNAL, RESOURCE_EXHAUSTED…)
 *   `attempts`   - đã gọi Google bao nhiêu lần cho lỗi này (kể cả các lần tự thử lại)
 * Riêng GEMINI_QUOTA có thêm `retryAfterMs` khi Google nói rõ phải chờ bao lâu.
 */
export const explainGeminiError = ({ status = 0, data = {}, model = "", networkError = null, headers = null, attempts = 1 } = {}) => {
  const message = upstreamMessage(data);
  const lower = message.toLowerCase();
  const detail = message.slice(0, 300);
  const upstreamStatus = upstreamStatusName(data);
  const retryAfterMs = parseRetryDelayMs(headers, data);
  /** Nhãn HTTP để người dùng tự tra: "HTTP 503 · UNAVAILABLE". */
  const statusLabel = status ? `HTTP ${status}${upstreamStatus ? ` · ${upstreamStatus}` : ""}` : "";

  if (networkError) {
    const reason = networkError instanceof Error ? networkError.message : String(networkError);
    return {
      code: "GEMINI_NETWORK",
      error: "Không kết nối được tới generativelanguage.googleapis.com.",
      detail: reason.slice(0, 300),
      hint:
        attempts > 1
          ? `Máy chủ đã gọi Google ${attempts} lần (tự thử lại ${attempts - 1} lần) vẫn không kết nối được. Kiểm tra mạng của máy chủ; xem /api/health?probe=1.`
          : "Kiểm tra kết nối mạng của máy chủ (Vercel thường không bị chặn); xem /api/health?probe=1.",
      retryable: true,
      httpStatus: 0,
      upstreamStatus,
      attempts
    };
  }

  if (status === 400 && (lower.includes("api key not valid") || lower.includes("api_key_invalid") || lower.includes("invalid api key"))) {
    return {
      code: "GEMINI_BAD_KEY",
      error: "GEMINI_API_KEY không hợp lệ (Google từ chối khoá).",
      detail,
      hint: "Dán lại khoá mới từ https://aistudio.google.com/apikey (chỉ dán phần khoá, không kèm 'GEMINI_API_KEY=' hay dấu ngoặc), rồi deploy lại.",
      retryable: false,
      httpStatus: status,
      upstreamStatus,
      attempts
    };
  }

  if (status === 403 && (lower.includes("service_disabled") || lower.includes("has not been used in project") || lower.includes("is disabled"))) {
    return {
      code: "GEMINI_API_DISABLED",
      error: "Project của khoá chưa bật Generative Language API.",
      detail,
      hint: "Mở Google Cloud Console → APIs & Services → bật “Generative Language API” cho đúng project đã tạo khoá.",
      retryable: false,
      httpStatus: status,
      upstreamStatus,
      attempts
    };
  }

  if (status === 403 && (lower.includes("referer") || lower.includes("ip address") || lower.includes("restricted") || lower.includes("permission_denied"))) {
    return {
      code: "GEMINI_KEY_RESTRICTED",
      error: "Khoá bị giới hạn (HTTP referrer / địa chỉ IP) nên máy chủ không dùng được.",
      detail,
      hint: "Trong Google AI Studio, khoá dùng cho server nên để chế độ không giới hạn referrer/IP.",
      retryable: false,
      httpStatus: status,
      upstreamStatus,
      attempts
    };
  }

  if (status === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    const waitSeconds = retryAfterMs === null ? null : Math.max(1, Math.round(retryAfterMs / 1000));
    return {
      code: "GEMINI_QUOTA",
      error: "Hết quota / quá số yêu cầu mỗi phút — khoá vẫn hợp lệ, chỉ đang bị Google chặn tạm thời.",
      detail,
      hint: waitSeconds
        ? `Google yêu cầu chờ khoảng ${waitSeconds} giây rồi gọi lại. Nếu hay gặp, hãy thêm khoá dự phòng (GEMINI_API_KEYS=khoá1,khoá2) để máy chủ tự xoay.`
        : "Chờ một lát rồi thử lại (hạn mức miễn phí tính theo phút). Nếu hay gặp, thêm khoá dự phòng GEMINI_API_KEYS để máy chủ tự xoay.",
      retryable: true,
      httpStatus: status,
      upstreamStatus,
      retryAfterMs,
      attempts
    };
  }

  if (isModelUnavailable(status, data)) {
    return {
      code: "GEMINI_MODEL_NOT_FOUND",
      error: `Model “${model}” không tồn tại hoặc chưa mở cho khoá này.`,
      detail: detail || statusLabel,
      hint: `App chỉ dùng model ${DEFAULT_MODEL}. Gọi /api/health?probe=1 để xem model này có mở cho khoá của bạn không.`,
      retryable: false,
      httpStatus: status,
      upstreamStatus,
      attempts
    };
  }

  if (status >= 500) {
    const overloaded = status === 503 || lower.includes("overloaded") || lower.includes("unavailable") || lower.includes("capacity");
    return {
      code: "GEMINI_UPSTREAM",
      error: overloaded
        ? `Máy chủ Google đang quá tải (${statusLabel || `HTTP ${status}`}) — không phải lỗi khoá của bạn.`
        : `Máy chủ Google tạm thời lỗi (${statusLabel || `HTTP ${status}`}).`,
      detail: detail || statusLabel,
      hint:
        attempts > 1
          ? `Máy chủ đã gọi Google ${attempts} lần (tự thử lại ${attempts - 1} lần, chờ tăng dần) vẫn lỗi. Chờ 1–2 phút rồi bấm “Thử lại với Gemini”; nếu lỗi kéo dài hãy thêm khoá dự phòng (GEMINI_API_KEYS) hoặc model dự phòng (GEMINI_MODEL_FALLBACKS).`
          : "Chờ 1–2 phút rồi thử lại — đây là lỗi phía Google, không phải lỗi khoá.",
      retryable: true,
      httpStatus: status,
      upstreamStatus,
      attempts
    };
  }

  return {
    code: "GEMINI_ERROR",
    error: detail || `Gemini không trả về nội dung${statusLabel ? ` (${statusLabel})` : ""}.`,
    detail: detail || statusLabel,
    hint: "Xem /api/health?probe=1 để chẩn đoán khoá và model.",
    retryable: false,
    httpStatus: status,
    upstreamStatus,
    attempts
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
    return { status: response.status, ok: response.ok, data, headers: response.headers ?? null };
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Gọi Gemini cho MỘT (khoá, model), tự thử lại khi Google lỗi tạm thời.
 *
 * Vì sao phải tự thử lại: lỗi hay gặp nhất trên thực tế là 503 "The model is overloaded"
 * hoặc 500 INTERNAL — lỗi của máy chủ Google, kéo dài vài giây, và **không liên quan tới
 * khoá API**. Mã cũ gọi đúng một lần rồi rơi thẳng về bộ luận giải nội bộ, nên một cú chớp
 * lỗi của Google làm mất luôn câu trả lời của mô hình lớn.
 *
 * Nguyên tắc:
 *   · Chỉ thử lại với lỗi tạm thời (`isTransientFailure`) và 429 khi Google bảo chờ ngắn
 *     VÀ đã hết khoá để xoay (xoay khoá vẫn nhanh hơn chờ).
 *   · Chờ tăng dần (backoff + jitter), tôn trọng `Retry-After` / `RetryInfo.retryDelay`.
 *   · Không bắt đầu lượt mới nếu quỹ thời gian (`deadline`) không còn đủ — Vercel Function
 *     bị giết ở 60 giây, thà trả lỗi rõ ràng còn hơn bị cắt giữa chừng.
 *   · Mỗi lượt gọi chỉ dùng phần thời gian còn lại của quỹ, nên tổng thời gian không vượt
 *     `GEMINI_BUDGET_MS` (mặc định 45 giây).
 */
const callGeminiWithRetry = async ({ apiKey, model, contents, settings, deadline, allowQuotaWait }) => {
  let attempts = 0;
  let retries = 0;

  for (;;) {
    attempts += 1;
    const remaining = deadline - Date.now();
    const timeoutMs = Math.max(MIN_ATTEMPT_MS, Math.min(TIMEOUT_MS, remaining));

    let result;
    try {
      result = await callGemini({ apiKey, model, contents, timeoutMs });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const failure = isTimeout
        ? {
            code: "GEMINI_TIMEOUT",
            error: `Gemini phản hồi quá chậm (quá ${Math.round(timeoutMs / 1000)} giây).`,
            hint: "Thử lại sau ít phút, hoặc hỏi ngắn gọn hơn để mô hình trả lời nhanh hơn.",
            retryable: false,
            httpStatus: 0,
            attempts
          }
        : explainGeminiError({ networkError: error, model, attempts });

      // Quá thời gian nghĩa là quỹ đã cạn → không thử lại. Lỗi mạng thì đáng thử lại,
      // nhưng vẫn phải tôn trọng trần GEMINI_MAX_ATTEMPTS để không gọi Google vô hạn.
      const canRetry = !isTimeout && isTransientFailure(failure.code);
      if (!canRetry || attempts >= settings.maxAttempts || !hasTimeForRetry({ settings, deadline, retryAfterMs: null, retries })) {
        return { ok: false, model, attempts, retries, failure };
      }
      retries += 1;
      await sleep(backoffDelayMs({ retryIndex: retries, settings, retryAfterMs: null, capMs: Math.max(0, deadline - Date.now() - MIN_ATTEMPT_MS) }));
      continue;
    }

    const reply = extractReply(result.data);
    if (result.ok && reply) {
      return {
        ok: true,
        model,
        reply,
        attempts,
        retries,
        finishReason: result.data?.candidates?.[0]?.finishReason || null
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
          hint: "Thử hỏi lại ngắn gọn hơn.",
          retryable: false,
          httpStatus: result.status,
          upstreamStatus: upstreamStatusName(result.data),
          attempts
        }
      : explainGeminiError({ status: result.status, data: result.data, model, headers: result.headers, attempts });

    const retryAfterMs = failure.retryAfterMs ?? parseRetryDelayMs(result.headers, result.data);
    const quotaWorthWaiting = failure.code === "GEMINI_QUOTA" && allowQuotaWait && settings.quotaWaitMs > 0 &&
      retryAfterMs !== null && retryAfterMs <= settings.quotaWaitMs;
    const canRetry = (isTransientFailure(failure.code) || quotaWorthWaiting) && !emptyButOk;

    if (!canRetry || attempts >= settings.maxAttempts || !hasTimeForRetry({ settings, deadline, retryAfterMs, retries })) {
      return { ok: false, model, attempts, retries, failure };
    }

    retries += 1;
    await sleep(backoffDelayMs({ retryIndex: retries, settings, retryAfterMs, capMs: Math.max(0, deadline - Date.now() - MIN_ATTEMPT_MS) }));
  }
};

/** Còn đủ thời gian cho một lượt chờ + một lượt gọi nữa không? */
const hasTimeForRetry = ({ settings, deadline, retryAfterMs, retries }) => {
  const wait = backoffDelayMs({ retryIndex: retries + 1, settings, retryAfterMs, capMs: settings.maxDelayMs });
  return Date.now() + wait + MIN_ATTEMPT_MS <= deadline;
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
/**
 * Gọi Gemini: tự thử lại khi Google lỗi tạm thời, tự xoay khoá khi lỗi thuộc về khoá.
 *
 * `apiKeys` là danh sách khoá theo thứ tự ưu tiên (xem `buildApiKeyList`). Với mỗi khoá, app
 * thử lần lượt các model; lỗi thuộc về khoá thì chuyển ngay sang khoá kế tiếp, còn lỗi thuộc
 * về model thì thử model khác trên cùng khoá. Kết quả trả về **không bao giờ** chứa nội dung
 * khoá — chỉ có số thứ tự `keyIndex` (0-based) và ghi chú `keyNote` đã ẩn danh.
 *
 * Thứ tự xử lý một lỗi (xem `callGeminiWithRetry`):
 *   1. Lỗi TẠM THỜI (5xx / rớt mạng / 429 còn chờ được) → chờ ngắn rồi gọi lại cùng khoá, cùng model.
 *   2. Hết lượt thử lại mà model không mở cho khoá → thử model kế (nếu có GEMINI_MODEL_FALLBACKS).
 *   3. Lỗi thuộc về khoá → xoay sang khoá kế tiếp.
 *   4. Không còn đường nào → trả lỗi kèm `retryable` để giao diện hiện nút “Thử lại”.
 *
 * Kết quả còn kèm `attempts` (tổng số lần gọi Google) và `retries` (số lần phải thử lại vì
 * lỗi tạm thời) để người dùng biết máy chủ đã cố tới đâu trước khi rơi về bộ luận giải nội bộ.
 *
 * Vẫn nhận tham số `apiKey` đơn cũ để không phá vỡ nơi gọi khác.
 */
export const generateReply = async ({ apiKeys, apiKey, contents, models = resolveModels(), env = process.env }) => {
  const keys = Array.isArray(apiKeys) && apiKeys.length ? apiKeys : apiKey ? [apiKey] : [];
  const settings = retrySettings(env);

  if (!keys.length) {
    return {
      ok: false,
      model: models[0] || DEFAULT_MODEL,
      tried: [],
      keyIndex: -1,
      keyCount: 0,
      keyRotations: 0,
      keyAttempts: [],
      attempts: 0,
      retries: 0,
      retryable: false,
      failure: {
        code: "NO_API_KEY",
        error: "Máy chủ chưa cấu hình GEMINI_API_KEY (hoặc GEMINI_API_KEYS / GEMINI_API_KEY_2…9).",
        hint: "Thêm biến môi trường rồi deploy lại; kiểm tra bằng /api/health.",
        retryable: false,
        httpStatus: 0,
        attempts: 0
      }
    };
  }

  /** Mốc phải trả lời xong: nhỏ hơn maxDuration của Vercel Function để không bị giết giữa chừng. */
  const deadline = Date.now() + settings.budgetMs;
  const tried = [];
  const keyAttempts = [];
  let last = null;
  let attempts = 0;
  let retries = 0;

  const noteFor = (currentIndex) =>
    keyAttempts.length
      ? `Đã xoay sang ${describeKey(keys[currentIndex], currentIndex)} sau khi ${keyAttempts
          .map((attempt) => `${describeKey(keys[attempt.index], attempt.index)} lỗi ${attempt.code}`)
          .join(", ")}.`
      : null;

  const failWith = (failure, model, keyIndex) => ({
    ok: false,
    model,
    tried,
    keyIndex,
    keyCount: keys.length,
    keyRotations: keyAttempts.length,
    keyAttempts,
    attempts,
    retries,
    retryable: failure?.retryable === true,
    failure: { ...(failure || { code: "GEMINI_ERROR", error: "Không gọi được Gemini." }), attempts }
  });

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const currentKey = keys[keyIndex];
    const isLastKey = keyIndex + 1 >= keys.length;
    let rotate = false;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      if (!tried.includes(model)) tried.push(model);
      const isLastModel = modelIndex + 1 >= models.length;

      const outcome = await callGeminiWithRetry({
        apiKey: currentKey,
        model,
        contents,
        settings,
        deadline,
        // Chỉ "ngồi chờ" 429 khi không còn khoá nào khác để xoay — xoay khoá nhanh hơn chờ.
        allowQuotaWait: isLastKey && isLastModel
      });

      attempts += outcome.attempts;
      retries += outcome.retries;

      if (outcome.ok) {
        return {
          ok: true,
          model,
          reply: outcome.reply,
          tried,
          finishReason: outcome.finishReason,
          keyIndex,
          keyCount: keys.length,
          keyRotations: keyAttempts.length,
          keyNote: noteFor(keyIndex),
          attempts,
          retries,
          retryNote: retries
            ? `Google lỗi tạm thời ở ${retries} lượt đầu, máy chủ đã tự thử lại và có câu trả lời.`
            : null
        };
      }

      const failure = outcome.failure;
      last = { model, keyIndex, failure };

      // Câu trả lời rỗng (bộ lọc an toàn / hết token): đổi model hay xoay khoá đều vô ích.
      if (failure.code === "GEMINI_EMPTY") return failWith(failure, model, keyIndex);

      // Model này không mở cho khoá này → thử model kế trên cùng khoá (nếu người dùng có khai).
      if (failure.code === "GEMINI_MODEL_NOT_FOUND" && !isLastModel) continue;

      // Google quá tải trên model này → thử model dự phòng (thường ít người gọi hơn).
      if (failure.code === "GEMINI_UPSTREAM" && !isLastModel) continue;

      if (isKeyRotationFailure(failure.code)) {
        keyAttempts.push({ index: keyIndex, code: failure.code, model });
        if (!isLastKey) {
          rotate = true;
          break; // sang khoá kế tiếp
        }
        return failWith(failure, model, keyIndex);
      }

      return failWith(failure, model, keyIndex);
    }

    // Hết danh sách model mà không lỗi nào thuộc về khoá: khoá khác có thể thuộc project
    // đã mở model → vẫn thử khoá kế (ghi lại lý do để người dùng biết đã xoay).
    if (!rotate && !isLastKey) {
      const failure = last?.failure ?? { code: "GEMINI_MODEL_NOT_FOUND", error: `Không gọi được model ${models[0]}.` };
      keyAttempts.push({ index: keyIndex, code: failure.code, model: last?.model || models[0] });
      rotate = true;
    }
  }

  const fallbackFailure =
    last?.failure ?? explainGeminiError({ status: 0, data: {}, model: models[0] }) ?? { code: "GEMINI_ERROR", error: "Không gọi được model nào." };

  return failWith(fallbackFailure, last?.model || models[0] || DEFAULT_MODEL, last?.keyIndex ?? keys.length - 1);
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
        keyAttempts: result.keyAttempts.map((attempt) => ({ key: attempt.index + 1, code: attempt.code })),
        // Lỗi tạm thời của Google (5xx / rớt mạng / 429) → giao diện hiện nút “Thử lại với Gemini”
        // thay vì để người dùng tưởng khoá API của mình hỏng.
        retryable: failure.retryable === true,
        httpStatus: typeof failure.httpStatus === "number" ? failure.httpStatus : null,
        upstreamStatus: failure.upstreamStatus || null,
        attempts: result.attempts ?? null,
        retries: result.retries ?? 0
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
      keyNote: result.keyNote,
      attempts: result.attempts ?? null,
      retries: result.retries ?? 0,
      retryNote: result.retryNote ?? null
    });
  } catch (error) {
    const failure = explainGeminiError({ networkError: error });
    sendJson(res, 502, {
      error: failure.error,
      code: failure.code,
      hint: failure.hint,
      detail: failure.detail,
      retryable: failure.retryable === true,
      httpStatus: failure.httpStatus ?? 0,
      attempts: failure.attempts ?? 1,
      retries: 0
    });
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

    // Ưu tiên model người dùng đã cấu hình; nếu không mở cho khoá thì gợi ý model dự phòng
    // mà họ khai trong GEMINI_MODEL_FALLBACKS, rồi mới tới một model flash bất kỳ.
    const configuredFallbacks = [...MODEL_FALLBACKS, ...resolveModels().slice(1)];
    const suggested =
      (canGenerate.includes(preferredModel) && preferredModel) ||
      configuredFallbacks.find((name) => canGenerate.includes(name)) ||
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
