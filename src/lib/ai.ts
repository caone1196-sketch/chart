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

const TIMEOUT_MS = 60000;

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
    let payload: { reply?: string; error?: string; code?: string; model?: string } = {};

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
 * Gọi Gemini qua API route /api/ai-chat.
 * Nếu máy chủ chưa cấu hình API key (hoặc lỗi mạng), trả về lỗi để lớp gọi
 * chuyển sang bộ luận giải nội bộ.
 */
export const askServerAi = async (payload: AskPayload): Promise<AskResult | { error: string; code: string }> => {
  try {
    const { ok, status, payload: data } = await postJson("/api/ai-chat", payload);

    if (!ok || !data.reply) {
      return { error: data.error || `Máy chủ AI trả về mã ${status}.`, code: data.code || "SERVER_ERROR" };
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
