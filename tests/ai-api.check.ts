/**
 * Kiểm chứng lớp API /api/ai-chat + /api/health (api/_handler.js).
 *
 * Không gọi mạng thật: `fetch` được thay bằng hàm giả để mô phỏng đúng các tình huống
 * hay gặp khi deploy — khoá dán kèm khoảng trắng, khoá sai, model đã bị khai tử,
 * model đầu lỗi 404 rồi rơi xuống model dự phòng, quota, Google lỗi 5xx.
 */
import handler, {
  buildApiKeyList,
  buildHealthPayload,
  describeKey,
  explainGeminiError,
  healthHandler,
  isKeyRotationFailure,
  isModelUnavailable,
  normalizeApiKey,
  probeKeys,
  resolveModels,
  splitApiKeys
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

/** Hàm giả lập fetch ghi lại **khoá đã dùng** ở từng lời gọi (để kiểm cơ chế xoay khoá). */
const mockFetchKeys = (responses: MockResponse[]) => {
  let index = 0;
  const keysUsed: string[] = [];
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    keysUsed.push(headers["x-goog-api-key"] || "");
    void url;
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      headers: new Headers()
    } as unknown as Response;
  };
  globalThis.fetch = fake as unknown as typeof fetch;
  return { keysUsed, count: () => index };
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
expect("model", resolveModels({} as NodeJS.ProcessEnv)[0], "gemini-3.6-flash", "model mặc định");
expect(
  "model",
  resolveModels({ GEMINI_MODEL: "gemini-9-flash" } as unknown as NodeJS.ProcessEnv)[0],
  "gemini-9-flash",
  "tôn trọng GEMINI_MODEL do người dùng đặt (giá trị tuỳ ý)"
);
expect("model", resolveModels({} as NodeJS.ProcessEnv).length, 1, "mặc định chỉ dùng đúng một model");
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

/* ── 3b. Nhiều khoá: gom danh sách, chuẩn hoá, không lộ nội dung ──────── */

expect("nhiều khoá", splitApiKeys("AIza1, AIza2;AIza3\nAIza4").length, 4, "tách danh sách ngăn cách bằng dấu phẩy/chấm phẩy/xuống dòng");
expect("nhiều khoá", splitApiKeys("AIzaSyAAA, AIzaSyAAA").length, 2, "hàm tách chỉ tách, không khử trùng (khử ở buildApiKeyList)");
expect("nhiều khoá", splitApiKeys("").length, 0, "chuỗi rỗng → không khoá nào");
expect("nhiều khoá", splitApiKeys(undefined).length, 0, "không có biến → không khoá nào");

const multiEnv = {
  GEMINI_API_KEYS: "AIzaSyLIST-1, AIzaSyLIST-2\nAIzaSyDUP",
  GEMINI_API_KEY: "AIzaSyDUP",
  GEMINI_API_KEY_2: "  AIzaSySUB-2  ",
  GEMINI_API_KEY_3: '"AIzaSySUB-3"',
  GEMINI_API_KEY_4: "",
  GEMINI_API_KEY_10: "AIzaSyQUA-10"
} as unknown as NodeJS.ProcessEnv;
const multiKeys = buildApiKeyList(multiEnv);
expect("nhiều khoá", multiKeys, ["AIzaSyLIST-1", "AIzaSyLIST-2", "AIzaSyDUP", "AIzaSySUB-2", "AIzaSySUB-3"], "gộp đúng thứ tự ưu tiên và khử trùng");
ok();
if (multiKeys.some((value) => value !== value.trim())) fail("nhiều khoá", "khoá còn khoảng trắng sau khi chuẩn hoá");
ok();
if (buildApiKeyList(multiEnv).join(",").includes("GEMINI_API_KEY_10")) fail("nhiều khoá", "chỉ nhận _2…_9, không nhận _10");

expect("nhiều khoá", buildApiKeyList({ GEMINI_API_KEY: "AIzaOnly" } as unknown as NodeJS.ProcessEnv), ["AIzaOnly"], "cách khai một khoá cũ vẫn chạy y như trước");
expect("nhiều khoá", buildApiKeyList({ GEMINI_API_KEY: "  " } as unknown as NodeJS.ProcessEnv), [], "biến rỗng → coi như chưa có khoá");
expect("nhiều khoá", describeKey("AIzaSyABCDEF", 0), "khoá #1 (…CDEF)", "nhãn khoá chỉ lộ 4 ký tự cuối");
expect("nhiều khoá", describeKey("", 4), "khoá #5", "khoá rỗng thì chỉ có số thứ tự");

const multiHealth = buildHealthPayload(multiEnv);
expect("nhiều khoá", multiHealth.keys.total, 5, "health báo tổng số khoá");
expect("nhiều khoá", multiHealth.keys.usable, 5, "cả 5 khoá đều giống khoá Google");
expect("nhiều khoá", multiHealth.keys.rotation, true, "nhiều hơn 1 khoá → bật xoay khoá");
expect("nhiều khoá", multiHealth.keys.sources, ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"], "health báo tên biến đang cấp khoá");
expect("nhiều khoá", JSON.stringify(multiHealth).includes("AIzaSyLIST-1"), false, "health KHÔNG được chứa nội dung khoá");
expect("nhiều khoá", multiHealth.key.length, "AIzaSyLIST-1".length, "trường key cũ vẫn báo độ dài khoá đầu tiên");
expect("nhiều khoá", multiHealth.model, "gemini-3.6-flash", "model không đổi khi có nhiều khoá");

const quirkyHealth = buildHealthPayload({ GEMINI_API_KEYS: "khong-phai-khoa-google,AIzaSyOK" } as unknown as NodeJS.ProcessEnv);
expect("nhiều khoá", quirkyHealth.keys.needsReview, 1, "đếm khoá trông không giống khoá Google để nhắc kiểm tra");

/* ── 3c. Chỉ xoay khoá với lỗi thuộc về khoá ──────────────────────────── */

expect("xoay khoá", isKeyRotationFailure("GEMINI_QUOTA"), true, "hết quota → xoay khoá");
expect("xoay khoá", isKeyRotationFailure("GEMINI_BAD_KEY"), true, "khoá sai → xoay khoá");
expect("xoay khoá", isKeyRotationFailure("GEMINI_KEY_RESTRICTED"), true, "khoá bị giới hạn → xoay khoá");
expect("xoay khoá", isKeyRotationFailure("GEMINI_EMPTY"), false, "câu trả lời rỗng (bộ lọc an toàn) không xoay khoá");
expect("xoay khoá", isKeyRotationFailure("GEMINI_TIMEOUT"), false, "quá thời gian không xoay khoá");

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
expect("ai-chat", success.payload.model, "gemini-3.6-flash", "báo model đã dùng");

// Chỉ dùng một model duy nhất: model không tồn tại → báo lỗi rõ ràng, không thử model khác.
mockFetch([
  { status: 404, body: { error: { message: "models/gemini-3.6-flash is not found for API version v1beta" } } }
]);
const missingModel = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", missingModel.status, 502, "model không tồn tại → 502");
expect("ai-chat", missingModel.payload.code, "GEMINI_MODEL_NOT_FOUND", "mã lỗi GEMINI_MODEL_NOT_FOUND");
expect("ai-chat", missingModel.payload.modelsTried, ["gemini-3.6-flash"], "chỉ thử đúng model đã cấu hình");

// Khoá sai → báo đúng mã lỗi và KHÔNG thử thêm model (tránh nhân số lần gọi lỗi).
const retryLog: string[] = [];
const badKey = mockFetch([{ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } }], retryLog);
const badKeyResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", badKeyResult.status, 502, "khoá sai → 502");
expect("ai-chat", badKeyResult.payload.code, "GEMINI_BAD_KEY", "mã lỗi GEMINI_BAD_KEY");
expect("ai-chat", badKey.count(), 1, "khoá sai chỉ gọi Google một lần");

// ── Nhiều khoá: khoá #1 sai → tự xoay sang khoá #2 và trả lời bình thường ──
const KEY_A = "AIzaSyKEY-AAAA-1111";
const KEY_B = "AIzaSyKEY-BBBB-2222";
process.env.GEMINI_API_KEYS = `${KEY_A},${KEY_B}`;
delete process.env.GEMINI_API_KEY;

const rotated = mockFetchKeys([
  { status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } },
  { status: 200, body: geminiReply("Trả lời bằng khoá dự phòng.") }
]);
const rotatedResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("xoay khoá", rotatedResult.status, 200, "khoá lỗi → xoay khoá và vẫn trả lời được");
expect("xoay khoá", rotatedResult.payload.reply, "Trả lời bằng khoá dự phòng.", "trả lại nội dung của khoá dự phòng");
expect("xoay khoá", rotatedResult.payload.keyUsed, 2, "báo đã dùng khoá #2");
expect("xoay khoá", rotatedResult.payload.keysConfigured, 2, "báo tổng số khoá");
expect("xoay khoá", rotatedResult.payload.keyRotations, 1, "báo đã xoay 1 lần");
ok();
if (typeof rotatedResult.payload.keyNote !== "string" || !rotatedResult.payload.keyNote.includes("khoá #1")) {
  fail("xoay khoá", `ghi chú xoay khoá phải nêu khoá #1 gặp lỗi, nhận ${JSON.stringify(rotatedResult.payload.keyNote)}`);
}
expect("xoay khoá", rotated.keysUsed, [KEY_A, KEY_B], "gọi Google bằng khoá #1 rồi khoá #2, đúng thứ tự");
ok();
if (JSON.stringify(rotatedResult.payload).includes(KEY_A)) fail("xoay khoá", "phản hồi không được chứa nội dung khoá");

// Hết quota ở khoá #1 cũng phải xoay khoá.
const quotaRotate = mockFetchKeys([
  { status: 429, body: { error: { message: "Quota exceeded for quota metric 'GenerateContent requests'" } } },
  { status: 200, body: geminiReply("Vẫn trả lời được.") }
]);
const quotaResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("xoay khoá", quotaResult.payload.keyUsed, 2, "hết quota khoá #1 → dùng khoá #2");
expect("xoay khoá", quotaRotate.keysUsed, [KEY_A, KEY_B], "quota: thử đúng hai khoá");

// Tất cả khoá đều hỏng → báo rõ đã thử những khoá nào (chỉ số thứ tự, không lộ khoá).
const allBad = mockFetchKeys([
  { status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } },
  { status: 429, body: { error: { message: "Quota exceeded" } } }
]);
const allBadResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("xoay khoá", allBadResult.status, 502, "mọi khoá hỏng → 502");
expect(
  "xoay khoá",
  allBadResult.payload.keyAttempts,
  [
    { key: 1, code: "GEMINI_BAD_KEY" },
    { key: 2, code: "GEMINI_QUOTA" }
  ],
  "báo danh sách MỌI khoá đã thử kèm mã lỗi (và không kèm nội dung khoá)"
);
expect("xoay khoá", allBad.keysUsed, [KEY_A, KEY_B], "thử lần lượt cả hai khoá rồi mới bỏ cuộc");
ok();
if (JSON.stringify(allBadResult.payload).includes(KEY_B)) fail("xoay khoá", "payload lỗi không được chứa nội dung khoá");

// Lỗi câu trả lời rỗng KHÔNG xoay khoá (xoay cũng vô ích, chỉ nhân số lần gọi).
const emptyNoRotate = mockFetchKeys([{ status: 200, body: { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] } }]);
const emptyResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("xoay khoá", emptyResult.payload.code, "GEMINI_EMPTY", "câu trả lời rỗng vẫn báo GEMINI_EMPTY");
expect("xoay khoá", emptyNoRotate.count(), 1, "câu trả lời rỗng chỉ gọi Google một lần dù có 2 khoá");

// Model không tồn tại: thử khoá khác vì khoá có thể thuộc project đã mở model.
const modelAcrossKeys = mockFetchKeys([
  { status: 404, body: { error: { message: "models/gemini-3.6-flash is not found for API version v1beta" } } },
  { status: 404, body: { error: { message: "models/gemini-3.6-flash is not found for API version v1beta" } } }
]);
const modelResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("xoay khoá", modelResult.payload.code, "GEMINI_MODEL_NOT_FOUND", "model không mở → báo đúng mã lỗi");
expect("xoay khoá", modelAcrossKeys.count(), 2, "model không mở: thử khoá thứ hai trước khi kết luận");
expect("xoay khoá", modelResult.payload.modelsTried, ["gemini-3.6-flash"], "vẫn chỉ dùng đúng một model");

// Quay lại cấu hình một khoá cho các bài kiểm bên dưới.
process.env.GEMINI_API_KEY = KEY;
delete process.env.GEMINI_API_KEYS;

// Gemini trả về nhưng không có chữ (ví dụ bị cắt vì hết token) → mã lỗi riêng.
mockFetch([{ status: 200, body: { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] } }]);
const empty = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu" });
expect("ai-chat", empty.payload.code, "GEMINI_EMPTY", "câu trả lời rỗng có mã riêng");

/* ── 5. GET /api/health + probe ───────────────────────────────────────── */
process.env.GEMINI_API_KEY = `  ${KEY}  `;
const healthNoProbe = await callHealth();
expect("health-route", healthNoProbe.status, 200, "health trả 200");
expect("health-route", healthNoProbe.payload.llm, "gemini", "health thấy khoá");
expect("health-route", healthNoProbe.payload.model, "gemini-3.6-flash", "health báo model");
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
        { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }
      ]
    }
  }
]);
const healthProbe = await callHealth("/api/health?probe=1");
expect("health-probe", healthProbe.payload.probe.ok, true, "probe thấy khoá dùng được");
expect("health-probe", healthProbe.payload.probe.modelCount, 1, "đếm model gọi được generateContent");
expect("health-probe", healthProbe.payload.probe.preferredModelAvailable, true, "model đang dùng có trong danh sách");
expect("health-probe", probeOk.calls.length, 1, "probe chỉ gọi một lần");

// Google trả về danh sách không có model đang dùng → probe gợi ý model khác có thật.
const probeMissingModel = mockFetch([
  { status: 200, body: { models: [{ name: "models/gemini-9-flash", supportedGenerationMethods: ["generateContent"] }] } }
]);
const healthSuggestion = await callHealth("/api/health?probe=1");
expect("health-probe", healthSuggestion.payload.probe.preferredModelAvailable, false, "báo model đang dùng không mở cho khoá");
expect("health-probe", healthSuggestion.payload.probe.suggestedModel, "gemini-9-flash", "gợi ý model thay thế");
expect("health-probe", healthSuggestion.payload.modelSuggestion, "gemini-9-flash", "đưa gợi ý lên payload");
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

// ── Nhiều khoá: probe kiểm từng khoá, tổng kết số khoá dùng được ────────
process.env.GEMINI_API_KEYS = `${KEY_A},${KEY_B}`;
delete process.env.GEMINI_API_KEY;
const probeMulti = mockFetch([
  { status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } },
  {
    status: 200,
    body: { models: [{ name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] }] }
  }
]);
const multiHealthProbe = await callHealth("/api/health?probe=1");
expect("xoay khoá", multiHealthProbe.payload.probeSummary.usable, 1, "probe đếm được 1/2 khoá dùng được");
expect("xoay khoá", multiHealthProbe.payload.probeSummary.allFailed, false, "còn khoá dùng được thì không báo hỏng hết");
expect("xoay khoá", multiHealthProbe.payload.probes.length, 2, "probe trả kết quả cho từng khoá");
expect("xoay khoá", multiHealthProbe.payload.probes.map((item: { ok: boolean }) => item.ok), [false, true], "khoá #1 hỏng, khoá #2 chạy");
expect("xoay khoá", multiHealthProbe.payload.keys.usable, 1, "health cập nhật số khoá dùng được sau khi probe");
expect("xoay khoá", probeMulti.count(), 2, "probe gọi Google đúng một lần cho mỗi khoá");
ok();
if (JSON.stringify(multiHealthProbe.payload).includes(KEY_A)) fail("xoay khoá", "payload probe không được chứa nội dung khoá");

// Giới hạn: chỉ probe tối đa 5 khoá để không kéo dài thời gian phản hồi.
const sixKeys = Array.from({ length: 6 }, (_, index) => `AIzaSyMANY-${index}`).join(",");
process.env.GEMINI_API_KEYS = sixKeys;
delete process.env.GEMINI_API_KEY;
const manyProbe = await probeKeys(buildApiKeyList(), "gemini-3.6-flash");
expect("xoay khoá", manyProbe.summary.total, 6, "biết tổng số khoá đang có");
expect("xoay khoá", manyProbe.summary.checked, 5, "chỉ kiểm 5 khoá đầu");
expect("xoay khoá", manyProbe.results[4].key, 5, "kết quả đánh số theo thứ tự khoá");

// Trả môi trường về trạng thái "chưa có khoá nào" cho phần 6.
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_API_KEYS;

/* ── 6. Bảo vệ: không gọi Google khi thiếu khoá ───────────────────────── */
const guardedFetch = mockFetch([{ status: 200, body: geminiReply("không nên tới đây") }]);
await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("bảo vệ", guardedFetch.count(), 0, "thiếu khoá thì không gọi mạng");

console.log(
  `\n${failures.length ? "✘" : "✔"} API Gemini: ${checks} phép kiểm, ${failures.length} lỗi.`
);
for (const failure of failures) console.log(`  · ${failure}`);
if (failures.length) process.exit(1);
