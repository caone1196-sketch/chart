/**
 * Kiểm chứng lớp API /api/ai-chat + /api/health (api/_handler.js).
 *
 * Không gọi mạng thật: `fetch` được thay bằng hàm giả để mô phỏng đúng các tình huống
 * hay gặp khi deploy — khoá dán kèm khoảng trắng, khoá sai, model đã bị khai tử,
 * model đầu lỗi 404 rồi rơi xuống model dự phòng, quota, Google lỗi 5xx.
 */
import handler, {
  buildHealthPayload,
  explainGeminiError,
  healthHandler,
  isModelUnavailable,
  normalizeApiKey,
  resolveModels
} from "../api/_handler.js";

type MockResponse = { status: number; body: unknown };

const failures: string[] = [];
let checks = 0;

const fail = (group: string, message: string) => failures.push(`${group}: ${message}`);
const ok = () => {
  checks += 1;
};

const expect = (group: string, actual: unknown, expected: unknown, label: string) => {
  ok();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(group, `${label} — nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`);
  }
};

/** Hàm giả lập fetch: nhận danh sách phản hồi theo thứ tự gọi. */
const mockFetch = (responses: MockResponse[], log?: string[]) => {
  let index = 0;
  const calls: string[] = [];
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    if (log) log.push(String(url));
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      headers: new Headers(),
      ...(init ? {} : {})
    } as unknown as Response;
  };
  globalThis.fetch = fake as unknown as typeof fetch;
  return { calls, count: () => index };
};

const geminiReply = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }]
});

/** req/res tối giản giống Node http + Vercel. */
const makeRes = () => {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  return {
    state,
    res: {
      set statusCode(value: number) {
        state.statusCode = value;
      },
      get statusCode() {
        return state.statusCode;
      },
      setHeader(key: string, value: string) {
        state.headers[key] = value;
      },
      end(chunk?: string) {
        state.body = chunk || "";
      }
    }
  };
};

const callChat = async (body: unknown, method = "POST") => {
  const { state, res } = makeRes();
  await handler({ method, body, url: "/api/ai-chat" } as never, res as never);
  return { status: state.statusCode, payload: JSON.parse(state.body || "{}") };
};

const callHealth = async (url = "/api/health") => {
  const { state, res } = makeRes();
  await healthHandler({ method: "GET", url } as never, res as never);
  return { status: state.statusCode, payload: JSON.parse(state.body || "{}") };
};

/* ── 1. Chuẩn hoá khoá API ─────────────────────────────────────────────── */
expect("chuẩn hoá khoá", normalizeApiKey("  AIzaSyABC-123_def  "), "AIzaSyABC-123_def", "cắt khoảng trắng hai đầu");
expect("chuẩn hoá khoá", normalizeApiKey('"AIzaSyABC"'), "AIzaSyABC", "bỏ dấu ngoặc kép (lỗi hay gặp khi dán trên Vercel)");
expect("chuẩn hoá khoá", normalizeApiKey("'AIzaSyABC'"), "AIzaSyABC", "bỏ dấu ngoặc đơn");
expect("chuẩn hoá khoá", normalizeApiKey("GEMINI_API_KEY=AIzaSyABC"), "AIzaSyABC", "bỏ tiền tố tên biến");
expect("chuẩn hoá khoá", normalizeApiKey("AIzaSy\nABC\r\n123"), "AIzaSyABC123", "gỡ ký tự xuống dòng khi copy nhiều dòng");
expect("chuẩn hoá khoá", normalizeApiKey(undefined), "", "giá trị rỗng");
expect("chuẩn hoá khoá", normalizeApiKey(12345 as unknown as string), "", "giá trị không phải chuỗi");

/* ── 2. Payload /api/health ───────────────────────────────────────────── */
const healthWithoutKey = buildHealthPayload({} as NodeJS.ProcessEnv);
expect("health", healthWithoutKey.llm, "local-fallback", "chưa có khoá → dùng bộ nội bộ");
expect("health", healthWithoutKey.key.present, false, "báo chưa có khoá");

const KEY = "AIzaSyTEST-1234567890_abcdefghijklmnop";
const healthWithKey = buildHealthPayload({ GEMINI_API_KEY: KEY } as unknown as NodeJS.ProcessEnv);
expect("health", healthWithKey.llm, "gemini", "có khoá → bật Gemini");
expect("health", healthWithKey.key.length, KEY.length, "báo độ dài khoá");
expect("health", healthWithKey.key.looksLikeGoogleKey, true, "nhận ra khoá Google");
expect("health", JSON.stringify(healthWithKey).includes(KEY), false, "không được lộ nội dung khoá ra JSON");

const healthWithMessyKey = buildHealthPayload({ GEMINI_API_KEY: `  ${KEY}\n` } as unknown as NodeJS.ProcessEnv);
expect("health", healthWithMessyKey.key.hadWhitespace, true, "phát hiện khoảng trắng lạ trong biến môi trường");
expect("health", healthWithMessyKey.key.length, KEY.length, "độ dài sau khi chuẩn hoá");

/* ── 3. Chuỗi model & lỗi Google ──────────────────────────────────────── */
expect("model", resolveModels({} as NodeJS.ProcessEnv)[0], "gemini-3.8-flash", "model mặc định");
expect(
  "model",
  resolveModels({ GEMINI_MODEL: "gemini-2.5-flash" } as unknown as NodeJS.ProcessEnv)[0],
  "gemini-2.5-flash",
  "tôn trọng GEMINI_MODEL do người dùng đặt"
);
ok();
if (new Set(resolveModels({} as NodeJS.ProcessEnv)).size !== resolveModels({} as NodeJS.ProcessEnv).length) {
  fail("model", "chuỗi model bị trùng");
}

expect(
  "lỗi",
  explainGeminiError({ status: 400, data: { error: { message: "API key not valid. Please pass a valid API key." } } }).code,
  "GEMINI_BAD_KEY",
  "khoá sai"
);
expect(
  "lỗi",
  explainGeminiError({ status: 403, data: { error: { message: "Generative Language API has not been used in project 123 before" } } }).code,
  "GEMINI_API_DISABLED",
  "chưa bật API"
);
expect(
  "lỗi",
  explainGeminiError({ status: 403, data: { error: { message: "Requests from referer <empty> are blocked. PERMISSION_DENIED" } } }).code,
  "GEMINI_KEY_RESTRICTED",
  "khoá bị giới hạn referrer"
);
expect("lỗi", explainGeminiError({ status: 429, data: { error: { message: "Quota exceeded" } } }).code, "GEMINI_QUOTA", "hết quota");
expect(
  "lỗi",
  explainGeminiError({ status: 404, data: { error: { message: "models/gemini-9-flash is not found for API version v1beta" } }, model: "gemini-9-flash" }).code,
  "GEMINI_MODEL_NOT_FOUND",
  "model không tồn tại"
);
expect("lỗi", explainGeminiError({ status: 503, data: {} }).code, "GEMINI_UPSTREAM", "Google lỗi 5xx");
expect("lỗi", explainGeminiError({ networkError: new Error("getaddrinfo ENOTFOUND") }).code, "GEMINI_NETWORK", "lỗi mạng");
ok();
if (!explainGeminiError({ status: 400, data: { error: { message: "API key not valid" } } }).hint) {
  fail("lỗi", "lỗi khoá sai phải kèm gợi ý khắc phục");
}
expect("lỗi", isModelUnavailable(404, { error: { message: "not found" } }), true, "404 là model không dùng được");
expect("lỗi", isModelUnavailable(400, { error: { message: "API key not valid" } }), false, "lỗi khoá không phải lỗi model");

/* ── 4. POST /api/ai-chat ─────────────────────────────────────────────── */
delete process.env.GEMINI_API_KEY;
const noKey = await callChat({ messages: [{ role: "user", content: "xin chào" }] });
expect("ai-chat", noKey.status, 501, "chưa có khoá → 501");
expect("ai-chat", noKey.payload.code, "NO_API_KEY", "mã lỗi NO_API_KEY");

const methodCheck = await callChat({}, "GET");
expect("ai-chat", methodCheck.status, 405, "chặn phương thức khác POST");

process.env.GEMINI_API_KEY = KEY;
mockFetch([{ status: 200, body: geminiReply("Chào bạn, Mặt Trời Bọ Cạp.") }]);
const success = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", success.status, 200, "gọi thành công");
expect("ai-chat", success.payload.reply, "Chào bạn, Mặt Trời Bọ Cạp.", "trả lại nội dung Gemini");
expect("ai-chat", success.payload.model, "gemini-3.8-flash", "báo model đã dùng");

// Model đầu tiên bị khai tử → tự rơi xuống model dự phòng.
mockFetch([
  { status: 404, body: { error: { message: "models/gemini-3.8-flash is not found for API version v1beta" } } },
  { status: 200, body: geminiReply("Trả lời từ model dự phòng") }
]);
const fallbackModel = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", fallbackModel.status, 200, "đổi model khi model đầu không tồn tại");
expect("ai-chat", fallbackModel.payload.model, "gemini-flash-latest", "dùng model dự phòng đầu tiên");
expect("ai-chat", fallbackModel.payload.modelsTried.length, 2, "ghi lại các model đã thử");

// Khoá sai → báo đúng mã lỗi và KHÔNG thử thêm model (tránh nhân số lần gọi lỗi).
const retryLog: string[] = [];
const badKey = mockFetch([{ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } }], retryLog);
const badKeyResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", badKeyResult.status, 502, "khoá sai → 502");
expect("ai-chat", badKeyResult.payload.code, "GEMINI_BAD_KEY", "mã lỗi GEMINI_BAD_KEY");
expect("ai-chat", badKey.count(), 1, "khoá sai chỉ gọi Google một lần");

// Gemini trả về nhưng không có chữ (ví dụ bị cắt vì hết token) → mã lỗi riêng.
mockFetch([{ status: 200, body: { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] } }]);
const empty = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", empty.payload.code, "GEMINI_EMPTY", "câu trả lời rỗng có mã riêng");

/* ── 5. GET /api/health + probe ───────────────────────────────────────── */
process.env.GEMINI_API_KEY = `  ${KEY}  `;
const healthNoProbe = await callHealth();
expect("health-route", healthNoProbe.status, 200, "health trả 200");
expect("health-route", healthNoProbe.payload.llm, "gemini", "health thấy khoá");
expect("health-route", healthNoProbe.payload.model, "gemini-3.8-flash", "health báo model");
expect("health-route", healthNoProbe.payload.key.hadWhitespace, true, "health báo khoá có khoảng trắng thừa");

const healthMethod = await healthHandler({ method: "POST", url: "/api/health" } as never, makeRes().res as never);
ok();
if (healthMethod !== undefined) {
  /* helper không trả về giá trị; giữ nhánh để tránh cảnh báo */
}

const probeOk = mockFetch([
  {
    status: 200,
    body: {
      models: [
        { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }
      ]
    }
  }
]);
const healthProbe = await callHealth("/api/health?probe=1");
expect("health-probe", healthProbe.payload.probe.ok, true, "probe thấy khoá dùng được");
expect("health-probe", healthProbe.payload.probe.modelCount, 2, "đếm model gọi được generateContent");
expect("health-probe", healthProbe.payload.probe.preferredModelAvailable, true, "model đang dùng có trong danh sách");
expect("health-probe", probeOk.calls.length, 1, "probe chỉ gọi một lần");

const probeMissingModel = mockFetch([
  { status: 200, body: { models: [{ name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] }] } }
]);
const healthSuggestion = await callHealth("/api/health?probe=1");
expect("health-probe", healthSuggestion.payload.probe.suggestedModel, "gemini-3.6-flash", "gợi ý model thay thế");
expect("health-probe", healthSuggestion.payload.modelSuggestion, "gemini-3.6-flash", "đưa gợi ý lên payload");
expect("health-probe", probeMissingModel.count(), 1, "gợi ý model chỉ sau một lần gọi");

const probeBadKey = mockFetch([{ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }]);
const healthBadKey = await callHealth("/api/health?probe=1");
expect("health-probe", healthBadKey.payload.probe.ok, false, "probe phát hiện khoá sai");
expect("health-probe", healthBadKey.payload.probe.code, "GEMINI_BAD_KEY", "probe trả mã lỗi rõ ràng");
expect("health-probe", probeBadKey.calls[0].includes("generativelanguage.googleapis.com"), true, "probe gọi đúng endpoint Google");

delete process.env.GEMINI_API_KEY;
mockFetch([{ status: 200, body: {} }]);
const noKeyProbe = await callHealth("/api/health?probe=1");
expect("health-probe", noKeyProbe.payload.probe.code, "NO_API_KEY", "chưa có khoá thì probe báo NO_API_KEY");

/* ── 6. Bảo vệ: không gọi Google khi thiếu khoá ───────────────────────── */
const guardedFetch = mockFetch([{ status: 200, body: geminiReply("không nên tới đây") }]);
await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("bảo vệ", guardedFetch.count(), 0, "thiếu khoá thì không gọi mạng");

console.log(
  `\n${failures.length ? "✘" : "✔"} API Gemini: ${checks} phép kiểm, ${failures.length} lỗi.`
);
for (const failure of failures) console.log(`  · ${failure}`);
if (failures.length) process.exit(1);
