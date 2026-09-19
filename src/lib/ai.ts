export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ChatEngine = "gemini" | "local";

export type AskResult = {
  reply: string;
  engine: ChatEngine;
  model?: string;
  note?: string;
  /** Khoá đã dùng (1-based) và tổng số khoá máy chủ đang có. */
  keyUsed?: number;
  keysConfigured?: number;
  keyRotations?: number;
  /** Ghi chú ẩn danh khi phải xoay khoá (không chứa nội dung khoá). */
  keyNote?: string | null;
  /** Tổng số lần máy chủ gọi Google và số lần phải tự thử lại vì lỗi tạm thời (5xx / rớt mạng). */
  attempts?: number;
  retries?: number;
  /** Ghi chú khi có câu trả lời nhờ tự thử lại (để người dùng biết Google vừa chập chờn). */
  retryNote?: string | null;
};

/** Lỗi khi gọi /api/ai-chat — kèm đủ thông tin để giao diện quyết định có nên mời bấm thử lại. */
export type AskFailure = {
  error: string;
  code: string;
  hint?: string;
  /** Lỗi tạm thời phía Google (5xx / rớt mạng / quota theo phút) → bấm thử lại có thể được. */
  retryable?: boolean;
  /** Mã HTTP Google trả về (null khi máy chủ không nói). */
  httpStatus?: number | null;
  /** Số lần máy chủ đã gọi Google cho câu hỏi này (kể cả các lần tự thử lại). */
  attempts?: number;
  /** Câu hỏi nên gửi lại khi người dùng bấm “Thử lại với Gemini”. */
  retryQuestion?: string;
};

export type AskPayload = {
  messages: ChatTurn[];
  chartReport: string;
  senderName: string;
};

/** Kết quả gọi /api/health — dùng để hiển thị trạng thái và chẩn đoán lỗi cấu hình. */
export type ServerHealth = {
  /** Có gọi được route /api/health và nhận được JSON hay không. */
  reachable: boolean;
  /** Máy chủ đã có GEMINI_API_KEY dùng được chưa. */
  llm: "gemini" | "local";
  model: string | null;
  modelFallbacks: string[];
  runtime: string | null;
  environment: string | null;
  region: string | null;
  keyPresent: boolean;
  keyLength: number | null;
  keyLooksValid: boolean | null;
  /** Tổng số khoá Gemini máy chủ đang có (GEMINI_API_KEY + GEMINI_API_KEYS + GEMINI_API_KEY_n). */
  keysTotal: number;
  /** Số khoá dùng được (đúng sau khi gọi ?probe=1). */
  keysUsable: number;
  /** Tên các biến môi trường đang cung cấp khoá (không phải giá trị khoá). */
  keySources: string[];
  /** Có nhiều hơn 1 khoá → máy chủ tự xoay khi khoá lỗi / hết quota. */
  keyRotation: boolean;
  /** Máy chủ tự thử lại mấy lần khi Google lỗi tạm thời (5xx) — null nếu máy chủ chạy bản cũ. */
  retry: { maxAttempts: number; budgetMs: number } | null;
  /** Kết quả kiểm tra từng khoá khi gọi ?probe=1. */
  probeKeys: Array<{
    key: number;
    ok: boolean;
    code?: string;
    error?: string;
    hint?: string;
    modelCount?: number;
    preferredModelAvailable?: boolean;
    suggestedModel?: string | null;
  }>;
  probe: {
    ok: boolean;
    status: number;
    code?: string;
    error?: string;
    hint?: string;
    modelCount?: number;
    preferredModelAvailable?: boolean;
    suggestedModel?: string | null;
  } | null;
  /** Lỗi khi không gọi được route (ví dụ bị rewrite SPA trả về index.html). */
  error: string | null;
};

const TIMEOUT_MS = 60000;
const HEALTH_TIMEOUT_MS = 15000;

const postJson = async (url: string, body: unknown) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    let payload: {
      reply?: string;
      error?: string;
      code?: string;
      model?: string;
      hint?: string;
      detail?: string;
      modelsTried?: string[];
      keyUsed?: number;
      keysConfigured?: number;
      keyRotations?: number;
      keyNote?: string | null;
      keyAttempts?: Array<{ key: number; code: string }>;
      retryable?: boolean;
      httpStatus?: number | null;
      upstreamStatus?: string | null;
      attempts?: number | null;
      retries?: number;
      retryNote?: string | null;
    } = {};

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text.slice(0, 200) };
    }

    return { ok: response.ok, status: response.status, payload };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Hỏi trạng thái máy chủ AI. Hàm này chịu được cả trường hợp route không tồn tại
 * (Vercel rewrite trả về index.html) — khi đó `reachable: false` thay vì báo "chưa có key".
 */
export const checkServerHealth = async (probe = false): Promise<ServerHealth> => {
  const empty: ServerHealth = {
    reachable: false,
    llm: "local",
    model: null,
    modelFallbacks: [],
    runtime: null,
    environment: null,
    region: null,
    keyPresent: false,
    keyLength: null,
    keyLooksValid: null,
    keysTotal: 0,
    keysUsable: 0,
    keySources: [],
    keyRotation: false,
    retry: null,
    probeKeys: [],
    probe: null,
    error: null
  };

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), probe ? TIMEOUT_MS : HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/health${probe ? "?probe=1" : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();
    let payload: Record<string, unknown>;
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {
        ...empty,
        error: `Route /api/health trả về ${response.status} nhưng không phải JSON (nhiều khả năng bị rewrite SPA về index.html).`
      };
    }

    const key = (payload.key || {}) as Record<string, unknown>;
    const keys = (payload.keys || {}) as Record<string, unknown>;
    const probeSummary = (payload.probeSummary || {}) as Record<string, unknown>;
    const keysTotal = typeof keys.total === "number" ? keys.total : key.present === true ? 1 : 0;
    const keysUsable =
      typeof keys.usable === "number" ? keys.usable : typeof probeSummary.usable === "number" ? probeSummary.usable : keysTotal;
    const probedKeys = Array.isArray(payload.probes) ? (payload.probes as ServerHealth["probeKeys"]) : [];

    return {
      reachable: true,
      llm: payload.llm === "gemini" ? "gemini" : "local",
      model: typeof payload.model === "string" ? payload.model : null,
      modelFallbacks: Array.isArray(payload.modelFallbacks) ? (payload.modelFallbacks as string[]) : [],
      runtime: typeof payload.runtime === "string" ? payload.runtime : null,
      environment: typeof payload.environment === "string" ? payload.environment : null,
      region: typeof payload.region === "string" ? payload.region : null,
      keyPresent: key.present === true,
      keyLength: typeof key.length === "number" ? key.length : null,
      keyLooksValid: typeof key.looksLikeGoogleKey === "boolean" ? key.looksLikeGoogleKey : null,
      keysTotal,
      keysUsable,
      keySources: Array.isArray(keys.sources) ? (keys.sources as string[]) : [],
      keyRotation: keys.rotation === true || keysTotal > 1,
      retry:
        payload.retry && typeof payload.retry === "object"
          ? {
              maxAttempts: Number((payload.retry as Record<string, unknown>).maxAttempts ?? 0),
              budgetMs: Number((payload.retry as Record<string, unknown>).budgetMs ?? 0)
            }
          : null,
      probeKeys: probedKeys,
      probe: payload.probe && typeof payload.probe === "object" ? (payload.probe as ServerHealth["probe"]) : null,
      error: null
    };
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Máy chủ không phản hồi kịp khi kiểm tra /api/health."
          : "Không gọi được /api/health (máy chủ hoặc route API chưa sẵn sàng)."
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Gọi Gemini qua API route /api/ai-chat.
 * Nếu máy chủ chưa cấu hình API key (hoặc lỗi mạng), trả về lỗi để lớp gọi
 * chuyển sang bộ luận giải nội bộ. Trường `hint` cho biết cần sửa gì.
 */
/** Mã lỗi THUỘC VỀ KHOÁ — chỉ khi đó mới nói "đã thử N khoá" để người dùng không đổ oan cho khoá. */
const KEY_CODES = ["GEMINI_BAD_KEY", "GEMINI_API_DISABLED", "GEMINI_KEY_RESTRICTED", "GEMINI_QUOTA", "GEMINI_MODEL_NOT_FOUND"];

/** Lỗi tạm thời phía Google/mạng → giao diện nên mời bấm “Thử lại với Gemini”. */
export const isRetryableCode = (code?: string) =>
  code === "GEMINI_UPSTREAM" || code === "GEMINI_NETWORK" || code === "GEMINI_QUOTA" || code === "SERVER_ERROR" || code === "NETWORK";

export const askServerAi = async (payload: AskPayload): Promise<AskResult | AskFailure> => {
  try {
    const { ok, status, payload: data } = await postJson("/api/ai-chat", payload);

    if (!ok || !data.reply) {
      const attempts = data.keyAttempts || [];
      const aboutKeys = attempts.some((attempt) => KEY_CODES.includes(attempt.code));
      // Google lỗi 5xx mà lại nói "đã thử 1 khoá" thì người dùng tưởng khoá API hỏng
      // (và đi tạo khoá mới vô ích) — phải phân biệt rõ lỗi của khoá và lỗi của máy chủ Google.
      const tried = attempts.length
        ? aboutKeys
          ? ` Đã thử ${attempts.length} khoá: ${attempts.map((attempt) => `khoá #${attempt.key} (${attempt.code})`).join(", ")}.`
          : ` Đã gọi Google ${typeof data.attempts === "number" && data.attempts > 1 ? `${data.attempts} lần` : "một lần"} bằng ${attempts
              .map((attempt) => `khoá #${attempt.key}`)
              .join(", ")} — lỗi thuộc về máy chủ Google, không phải lỗi khoá.`
        : "";
      const headline = data.error || `Máy chủ AI trả về mã ${status}.`;
      const note = data.hint ? `${headline}${tried} ${data.hint}` : `${headline}${tried}`;
      return {
        error: note || `Máy chủ AI trả về mã ${status}.`,
        code: data.code || "SERVER_ERROR",
        hint: data.hint,
        retryable: data.retryable === true || isRetryableCode(data.code),
        httpStatus: typeof data.httpStatus === "number" ? data.httpStatus : null,
        attempts: typeof data.attempts === "number" ? data.attempts : undefined
      };
    }

    return {
      reply: data.reply,
      engine: "gemini",
      model: data.model,
      keyUsed: typeof data.keyUsed === "number" ? data.keyUsed : undefined,
      keysConfigured: typeof data.keysConfigured === "number" ? data.keysConfigured : undefined,
      keyRotations: typeof data.keyRotations === "number" ? data.keyRotations : undefined,
      keyNote: data.keyNote ?? null,
      attempts: typeof data.attempts === "number" ? data.attempts : undefined,
      retries: typeof data.retries === "number" ? data.retries : undefined,
      retryNote: data.retryNote ?? null
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return {
      error: timeout ? "Máy chủ AI phản hồi quá chậm." : "Không kết nối được tới máy chủ AI.",
      code: "NETWORK",
      retryable: true
    };
  }
};

export const isLocalFallback = (value: AskResult | AskFailure): value is AskFailure =>
  typeof (value as { error?: string }).error === "string" && !(value as AskResult).reply;
