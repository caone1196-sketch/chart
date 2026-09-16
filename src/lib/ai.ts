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
    let payload: { reply?: string; error?: string; code?: string; model?: string; hint?: string; detail?: string; modelsTried?: string[] } = {};

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
export const askServerAi = async (payload: AskPayload): Promise<AskResult | { error: string; code: string; hint?: string }> => {
  try {
    const { ok, status, payload: data } = await postJson("/api/ai-chat", payload);

    if (!ok || !data.reply) {
      const note = data.hint ? `${data.error || `Máy chủ AI trả về mã ${status}.`} ${data.hint}` : data.error;
      return { error: note || `Máy chủ AI trả về mã ${status}.`, code: data.code || "SERVER_ERROR", hint: data.hint };
    }

    return { reply: data.reply, engine: "gemini", model: data.model };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Máy chủ AI phản hồi quá chậm."
        : "Không kết nối được tới máy chủ AI.";
    return { error: message, code: "NETWORK" };
  }
};

export const isLocalFallback = (value: AskResult | { error: string; code: string }): value is { error: string; code: string } =>
  typeof (value as { error?: string }).error === "string" && !(value as AskResult).reply;
