/**
 * Kiểm chứng lớp API /api/ai-chat + /api/health (api/_handler.js).
 *
 * Không gọi mạng thật: `fetch` được thay bằng hàm giả để mô phỏng đúng các tình huống
 * hay gặp khi deploy — khoá dán kèm khoảng trắng, khoá sai, model đã bị khai tử,
 * model đầu lỗi 404 rồi rơi xuống model dự phòng, quota, Google lỗi 5xx.
 */
import handler, {
  backoffDelayMs,
  looksLikePastedWrong,
  buildApiKeyList,
  buildHealthPayload,
  describeKey,
  explainGeminiError,
  healthHandler,
  isKeyRotationFailure,
  isModelUnavailable,
  isTransientFailure,
  normalizeApiKey,
  parseRetryDelayMs,
  probeKeys,
  resolveModels,
  retrySettings,
  splitApiKeys
} from "../api/_handler.js";

type MockResponse = { status: number; body: unknown; headers?: Record<string, string>; networkError?: string };

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
    if (response.networkError) throw new TypeError(response.networkError);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      headers: new Headers(response.headers || {}),
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
    if (response.networkError) throw new TypeError(response.networkError);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      headers: new Headers(response.headers || {})
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
  GEMINI_API_KEYS: "AIzaSyLIST-1-0000000000000, AIzaSyLIST-2-0000000000000\nAIzaSyDUP-00000000000000",
  GEMINI_API_KEY: "AIzaSyDUP-00000000000000",
  GEMINI_API_KEY_2: "  AIzaSySUB-2-00000000000000  ",
  GEMINI_API_KEY_3: '"AIzaSySUB-3-00000000000000"',
  GEMINI_API_KEY_4: "",
  GEMINI_API_KEY_10: "AIzaSyQUA-10-000000000000"
} as unknown as NodeJS.ProcessEnv;
const multiKeys = buildApiKeyList(multiEnv);
expect(
  "nhiều khoá",
  multiKeys,
  [
    "AIzaSyLIST-1-0000000000000",
    "AIzaSyLIST-2-0000000000000",
    "AIzaSyDUP-00000000000000",
    "AIzaSySUB-2-00000000000000",
    "AIzaSySUB-3-00000000000000"
  ],
  "gộp đúng thứ tự ưu tiên và khử trùng"
);
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
expect("nhiều khoá", multiHealth.keys.usable, 5, "cả 5 khoá đều không có dấu hiệu dán sai");
expect("nhiều khoá", multiHealth.keys.aizaPrefixed, 5, "đếm riêng khoá có tiền tố AIza (chỉ để tham khảo)");
expect("nhiều khoá", multiHealth.keys.rotation, true, "nhiều hơn 1 khoá → bật xoay khoá");
expect("nhiều khoá", multiHealth.keys.sources, ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"], "health báo tên biến đang cấp khoá");
expect("nhiều khoá", JSON.stringify(multiHealth).includes("AIzaSyLIST-1"), false, "health KHÔNG được chứa nội dung khoá");
expect("nhiều khoá", multiHealth.key.length, "AIzaSyLIST-1-0000000000000".length, "trường key cũ vẫn báo độ dài khoá đầu tiên");
expect("nhiều khoá", multiHealth.model, "gemini-3.6-flash", "model không đổi khi có nhiều khoá");

// Khoá bị nghi dán sai là khoá CÓ DẤU HIỆU (còn dấu "=", quá ngắn, có ký tự lạ) — không phải
// "không bắt đầu bằng AIza": Google phát hành cả khoá dài không theo tiền tố đó và vẫn hợp lệ.
const LONG_NON_AIZA = "AgxK9vQ2mZ7pR4tW8yB1cD6fH3jL5nS0uX2eG7iV9kM4oT";
const quirkyHealth = buildHealthPayload({
  GEMINI_API_KEYS: `GEMINI_KEY=AIzaSyDaiDuHaiMuoiKyTuNhat0,AIzaSyOK,${LONG_NON_AIZA}`
} as unknown as NodeJS.ProcessEnv);
expect("nhiều khoá", quirkyHealth.keys.needsReview, 2, "đánh dấu khoá còn dấu “=” (dán kèm tên biến lạ) và khoá quá ngắn");
expect("nhiều khoá", quirkyHealth.keys.usable, 1, "khoá dài không có tiền tố AIza vẫn được coi là hợp lệ về hình thức");
expect("nhiều khoá", quirkyHealth.keys.aizaPrefixed, 1, "chỉ 1 khoá có tiền tố AIza");
expect("heuristic", looksLikePastedWrong(LONG_NON_AIZA), false, "khoá 47 ký tự không tiền tố AIza → KHÔNG báo động giả");
expect("heuristic", looksLikePastedWrong("AgxK9vQ2mZ7pR4tW8yB1cD6fH3jL5nS0uX2eG7iV9kM4oTzW1bQp"), false, "khoá 53 ký tự như trên bản deploy thật → không bị nghi");
expect("heuristic", looksLikePastedWrong(KEY), false, "khoá AIza chuẩn → hợp lệ");
expect("heuristic", looksLikePastedWrong("AIzaSyOK"), true, "khoá quá ngắn → nghi dán thiếu");
expect("heuristic", looksLikePastedWrong("GEMINI_KEY=AIzaSyDaiDuHaiMuoiKyTuNhat0"), true, "dán kèm tên biến (còn dấu =) → nghi dán sai");
expect("heuristic", looksLikePastedWrong(normalizeApiKey("GEMINI_API_KEY=AIzaSyDaiDuHaiMuoiKyTuNhat0")), false, "dán kèm ĐÚNG tên biến GEMINI_API_KEY= thì máy chủ tự gỡ nên không còn nghi");
expect("heuristic", looksLikePastedWrong("AIzaSy co khoang trang trong khoa"), true, "còn khoảng trắng → nghi dán sai");
expect("heuristic", looksLikePastedWrong(""), true, "chuỗi rỗng → nghi");
expect("heuristic", buildHealthPayload({ GEMINI_API_KEY: LONG_NON_AIZA } as unknown as NodeJS.ProcessEnv).key.looksLikeGoogleKey, true, "khoá không tiền tố AIza vẫn báo looksLikeGoogleKey=true");

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

/* ── 4b. Google lỗi tạm thời (5xx / rớt mạng): phải TỰ THỬ LẠI trước khi bỏ cuộc ──
 *
 * Lỗi người dùng báo: "Mô hình lớn chưa sẵn sàng (Máy chủ Google tạm thời lỗi. Đã thử 1 khoá:
 * khoá #1 (GEMINI_UPSTREAM). Thử lại sau ít phút.)" — Google trả 503 "model is overloaded" đúng
 * một lần là app rơi thẳng về bộ luận giải nội bộ, và thông báo không nói rõ đây KHÔNG phải
 * lỗi khoá API. Nhóm bài kiểm này khoá hành vi mới: tự thử lại có chờ tăng dần, tôn trọng
 * Retry-After, dừng đúng quỹ thời gian của Vercel Function, và báo `retryable` cho giao diện.
 */

const overloadBody = { error: { message: "The model is overloaded. Please try again later.", status: "UNAVAILABLE" } };

// Chẩn đoán lỗi: 5xx phải nói rõ không phải lỗi khoá và đánh dấu là lỗi thử lại được.
expect("lỗi tạm thời", explainGeminiError({ status: 503, data: overloadBody, model: "gemini-3.6-flash" }).code, "GEMINI_UPSTREAM", "5xx → mã GEMINI_UPSTREAM");
expect("lỗi tạm thời", explainGeminiError({ status: 503, data: overloadBody }).retryable, true, "5xx là lỗi tạm thời → cho phép thử lại");
expect("lỗi tạm thời", explainGeminiError({ status: 503, data: overloadBody }).httpStatus, 503, "giữ mã HTTP để người dùng tự tra");
expect("lỗi tạm thời", explainGeminiError({ status: 503, data: overloadBody }).upstreamStatus, "UNAVAILABLE", "giữ tên trạng thái Google trả về");
expect(
  "lỗi tạm thời",
  explainGeminiError({ status: 500, data: { error: { message: "Internal error encountered.", status: "INTERNAL" } } }).retryable,
  true,
  "500 INTERNAL cũng thuộc nhóm thử lại được"
);
expect("lỗi tạm thời", explainGeminiError({ status: 400, data: { error: { message: "API key not valid." } } }).retryable, false, "khoá sai → thử lại vô ích");
expect("lỗi tạm thời", explainGeminiError({ networkError: new TypeError("fetch failed") }).retryable, true, "rớt mạng → thử lại được");
ok();
if (!explainGeminiError({ status: 503, data: overloadBody }).error.includes("không phải lỗi khoá")) {
  fail("lỗi tạm thời", "thông báo 5xx phải khẳng định đây không phải lỗi khoá API");
}
expect("lỗi tạm thời", isTransientFailure("GEMINI_UPSTREAM"), true, "GEMINI_UPSTREAM thuộc nhóm lỗi tạm thời");
expect("lỗi tạm thời", isTransientFailure("GEMINI_NETWORK"), true, "GEMINI_NETWORK thuộc nhóm lỗi tạm thời");
expect("lỗi tạm thời", isTransientFailure("GEMINI_BAD_KEY"), false, "lỗi khoá không phải lỗi tạm thời");
expect("lỗi tạm thời", isTransientFailure("GEMINI_EMPTY"), false, "bộ lọc an toàn không phải lỗi tạm thời");
expect("lỗi tạm thời", isKeyRotationFailure("GEMINI_UPSTREAM"), true, "Google lỗi dai dẳng thì vẫn nên thử khoá khác");

// Đọc đúng "chờ bao lâu" từ header Retry-After và RetryInfo.retryDelay của Google.
expect("chờ bao lâu", parseRetryDelayMs(new Headers({ "retry-after": "7" }), {}), 7000, "đọc header Retry-After theo giây");
expect("chờ bao lâu", parseRetryDelayMs(new Headers(), { error: { details: [{ retryDelay: "12.5s" }] } }), 12500, "đọc RetryInfo.retryDelay");
expect("chờ bao lâu", parseRetryDelayMs(new Headers({ "retry-after": "0" }), {}), 0, "Retry-After 0 → chờ 0 giây");
expect("chờ bao lâu", parseRetryDelayMs(new Headers(), {}), null, "Google không nói gì → null");
expect("chờ bao lâu", parseRetryDelayMs(null, null), null, "không có header lẫn body → null");

// Backoff: chờ tăng dần, có trần, tôn trọng mức Google yêu cầu, và đo được khi base = 0.
const backoffSettings = retrySettings({ GEMINI_RETRY_BASE_MS: "500", GEMINI_RETRY_MAX_MS: "2000" } as unknown as NodeJS.ProcessEnv);
const zeroSettings = retrySettings({ GEMINI_RETRY_BASE_MS: "0" } as unknown as NodeJS.ProcessEnv);
expect("backoff", retrySettings({} as NodeJS.ProcessEnv).maxAttempts, 3, "mặc định gọi tối đa 3 lần cho mỗi (khoá, model)");
expect("backoff", retrySettings({} as NodeJS.ProcessEnv).budgetMs, 45000, "quỹ thời gian mặc định 45s — nhỏ hơn maxDuration 60s của Vercel");
expect("backoff", retrySettings({ GEMINI_MAX_ATTEMPTS: "abc" } as unknown as NodeJS.ProcessEnv).maxAttempts, 3, "biến rác → dùng mặc định");
expect("backoff", retrySettings({ GEMINI_MAX_ATTEMPTS: "99" } as unknown as NodeJS.ProcessEnv).maxAttempts, 6, "kẹp số lần thử trong giới hạn an toàn");
ok();
if (backoffDelayMs({ retryIndex: 1, settings: backoffSettings, capMs: 60000 }) < 500) fail("backoff", "lần chờ đầu phải ≥ GEMINI_RETRY_BASE_MS");
ok();
if (backoffDelayMs({ retryIndex: 2, settings: backoffSettings, capMs: 60000 }) < 1000) fail("backoff", "lần chờ sau phải tăng dần (backoff)");
ok();
if (backoffDelayMs({ retryIndex: 9, settings: backoffSettings, capMs: 60000 }) > backoffSettings.maxDelayMs + 250) {
  fail("backoff", "chờ không được vượt trần GEMINI_RETRY_MAX_MS (cộng jitter)");
}
expect("backoff", backoffDelayMs({ retryIndex: 3, settings: zeroSettings, capMs: 60000 }), 0, "base = 0 (chế độ test) → không chờ, không jitter");
expect("backoff", backoffDelayMs({ retryIndex: 1, settings: zeroSettings, retryAfterMs: 3000, capMs: 60000 }), 3000, "Google bảo chờ 3s thì chờ đúng 3s");
expect("backoff", backoffDelayMs({ retryIndex: 1, settings: zeroSettings, retryAfterMs: 90000, capMs: 5000 }), 5000, "không chờ lâu hơn quỹ thời gian còn lại");

// Cấu hình một khoá + tắt thời gian chờ để bài kiểm chạy nhanh (chỉ đo số lần gọi).
process.env.GEMINI_API_KEY = KEY;
delete process.env.GEMINI_API_KEYS;
process.env.GEMINI_RETRY_BASE_MS = "0";
process.env.GEMINI_MAX_ATTEMPTS = "3";

// 503 thoáng qua rồi hết: vẫn có câu trả lời Gemini, KHÔNG rơi về bộ luận giải nội bộ.
const recovered = mockFetch([{ status: 503, body: overloadBody }, { status: 200, body: geminiReply("Trả lời sau khi Google hết quá tải.") }]);
const recoveredResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("thử lại", recoveredResult.status, 200, "503 thoáng qua → máy chủ tự thử lại và có câu trả lời");
expect("thử lại", recoveredResult.payload.reply, "Trả lời sau khi Google hết quá tải.", "trả đúng nội dung của lượt thử lại");
expect("thử lại", recoveredResult.payload.attempts, 2, "báo đã gọi Google 2 lần");
expect("thử lại", recoveredResult.payload.retries, 1, "báo đã tự thử lại 1 lần");
expect("thử lại", recoveredResult.payload.keyUsed, 1, "quá tải không phải lỗi khoá → không đổi khoá");
expect("thử lại", recovered.count(), 2, "gọi đúng 2 lần rồi dừng, không nhân số lần gọi");
ok();
if (typeof recoveredResult.payload.retryNote !== "string" || !recoveredResult.payload.retryNote.includes("thử lại")) {
  fail("thử lại", `câu trả lời thành công sau khi thử lại phải kèm ghi chú, nhận ${JSON.stringify(recoveredResult.payload.retryNote)}`);
}

// 503 dai dẳng: thử đủ số lần rồi báo lỗi rõ ràng + retryable để giao diện hiện nút “Thử lại”.
const stuck = mockFetch([{ status: 503, body: overloadBody }]);
const stuckResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("thử lại", stuckResult.status, 502, "Google lỗi mãi → 502");
expect("thử lại", stuckResult.payload.code, "GEMINI_UPSTREAM", "giữ mã lỗi GEMINI_UPSTREAM");
expect("thử lại", stuckResult.payload.retryable, true, "báo lỗi này thử lại được");
expect("thử lại", stuckResult.payload.httpStatus, 503, "kèm mã HTTP Google trả về");
expect("thử lại", stuckResult.payload.upstreamStatus, "UNAVAILABLE", "kèm tên trạng thái UNAVAILABLE");
expect("thử lại", stuckResult.payload.attempts, 3, "đã gọi đúng GEMINI_MAX_ATTEMPTS lần");
expect("thử lại", stuckResult.payload.retries, 2, "trong đó 2 lần là thử lại");
expect("thử lại", stuck.count(), 3, "số lần gọi mạng khớp số lần thử");
expect("thử lại", stuckResult.payload.keyAttempts, [{ key: 1, code: "GEMINI_UPSTREAM" }], "ghi rõ khoá #1 lỗi gì (không lộ nội dung khoá)");
ok();
if (JSON.stringify(stuckResult.payload).includes(KEY)) fail("thử lại", "payload lỗi sau khi thử lại không được chứa nội dung khoá");
ok();
if (!String(stuckResult.payload.hint).includes("Thử lại")) fail("thử lại", "gợi ý phải chỉ người dùng chỗ bấm thử lại");
ok();
if (!String(stuckResult.payload.error).includes("503")) fail("thử lại", "thông báo phải nêu mã HTTP 503");

// Tắt tự thử lại (GEMINI_MAX_ATTEMPTS=1) → hành vi giống hệt mã cũ: gọi đúng một lần.
process.env.GEMINI_MAX_ATTEMPTS = "1";
const noRetry = mockFetch([{ status: 503, body: overloadBody }]);
const noRetryResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("thử lại", noRetry.count(), 1, "GEMINI_MAX_ATTEMPTS=1 → chỉ gọi Google một lần");
expect("thử lại", noRetryResult.payload.code, "GEMINI_UPSTREAM", "vẫn báo đúng mã lỗi");
expect("thử lại", noRetryResult.payload.attempts, 1, "attempts = 1");
expect("thử lại", noRetryResult.payload.retries, 0, "không thử lại lần nào");
process.env.GEMINI_MAX_ATTEMPTS = "3";

// Rớt kết nối giữa chừng (fetch ném lỗi) cũng được gọi lại.
const networkRecovered = mockFetch([
  { status: 0, body: {}, networkError: "fetch failed" },
  { status: 200, body: geminiReply("Có câu trả lời sau khi kết nối lại.") }
]);
const networkResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("thử lại", networkResult.status, 200, "rớt mạng thoáng qua → thử lại thành công");
expect("thử lại", networkResult.payload.reply, "Có câu trả lời sau khi kết nối lại.", "trả nội dung lượt thử lại");
expect("thử lại", networkRecovered.count(), 2, "gọi lại đúng một lần sau lỗi mạng");

// Mất mạng thật sự: thử đủ lượt rồi báo GEMINI_NETWORK (vẫn retryable).
const networkDead = mockFetch([{ status: 0, body: {}, networkError: "fetch failed" }]);
const deadResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("thử lại", deadResult.payload.code, "GEMINI_NETWORK", "hết lượt thử → GEMINI_NETWORK");
expect("thử lại", deadResult.payload.retryable, true, "lỗi mạng cũng là lỗi thử lại được");
expect("thử lại", networkDead.count(), 3, "thử đủ 3 lần trước khi kết luận");

// 429 mà Google cho chờ ngắn và KHÔNG còn khoá nào khác → chờ rồi gọi lại (nhanh hơn rơi về bộ nội bộ).
const quotaWait = mockFetch([
  { status: 429, body: { error: { message: "Quota exceeded for quota metric 'GenerateContent requests' per minute.", status: "RESOURCE_EXHAUSTED" } }, headers: { "retry-after": "0" } },
  { status: 200, body: geminiReply("Trả lời sau khi qua hạn mức phút.") }
]);
const quotaWaitResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("quota", quotaWaitResult.status, 200, "429 chờ được → vẫn có câu trả lời Gemini");
expect("quota", quotaWaitResult.payload.reply, "Trả lời sau khi qua hạn mức phút.", "đúng nội dung sau khi chờ");
expect("quota", quotaWait.count(), 2, "chờ một nhịp rồi gọi lại, không gọi tràn lan");
ok();
if (quotaWaitResult.payload.retries < 1) fail("quota", "phải ghi nhận đã thử lại khi chờ quota");

// 429 mà Google bắt chờ lâu hơn GEMINI_QUOTA_WAIT_MS → không ngồi chờ, nói rõ phải chờ bao lâu.
const quotaLong = mockFetch([
  { status: 429, body: { error: { message: "Quota exceeded for quota metric 'GenerateContent requests' per day.", status: "RESOURCE_EXHAUSTED" } }, headers: { "retry-after": "120" } }
]);
const quotaLongResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("quota", quotaLong.count(), 1, "Google bắt chờ lâu → không gọi lại, trả lời ngay bằng bộ nội bộ");
expect("quota", quotaLongResult.payload.code, "GEMINI_QUOTA", "mã lỗi quota");
expect("quota", quotaLongResult.payload.retryable, true, "quota vẫn là lỗi thử lại được (sau khi hết phút/ngày)");
ok();
if (!String(quotaLongResult.payload.hint).includes("120")) fail("quota", "gợi ý phải nói Google yêu cầu chờ khoảng 120 giây");

// GEMINI_MODEL_FALLBACKS (opt-in): model chính quá tải dai dẳng → thử model dự phòng.
process.env.GEMINI_MODEL_FALLBACKS = "gemini-3.5-flash";
process.env.GEMINI_MAX_ATTEMPTS = "2";
expect("model dự phòng", resolveModels(), ["gemini-3.6-flash", "gemini-3.5-flash"], "chuỗi model = model chính + model dự phòng khai trong env");
expect("model dự phòng", buildHealthPayload(process.env).modelFallbacks, ["gemini-3.5-flash"], "/api/health báo model dự phòng");
const fallbackRun = mockFetch([
  { status: 503, body: overloadBody },
  { status: 503, body: overloadBody },
  { status: 200, body: geminiReply("Trả lời bằng model dự phòng.") }
]);
const fallbackResult = await callChat({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x" });
expect("model dự phòng", fallbackResult.status, 200, "model chính quá tải → đổi sang model dự phòng và trả lời được");
expect("model dự phòng", fallbackResult.payload.reply, "Trả lời bằng model dự phòng.", "đúng nội dung của model dự phòng");
expect("model dự phòng", fallbackResult.payload.model, "gemini-3.5-flash", "báo đúng model đã trả lời");
expect("model dự phòng", fallbackResult.payload.modelsTried, ["gemini-3.6-flash", "gemini-3.5-flash"], "ghi lại cả hai model đã thử");
expect("model dự phòng", fallbackResult.payload.attempts, 3, "2 lần cho model chính + 1 lần cho model dự phòng");
expect("model dự phòng", fallbackRun.count(), 3, "số lần gọi mạng khớp số lần thử");
delete process.env.GEMINI_MODEL_FALLBACKS;
delete process.env.GEMINI_MAX_ATTEMPTS;
delete process.env.GEMINI_RETRY_BASE_MS;
expect("model dự phòng", resolveModels().length, 1, "không khai GEMINI_MODEL_FALLBACKS → vẫn chỉ dùng đúng một model");

// Cấu hình tự thử lại phải lộ ra ở /api/health để người dùng biết app sẽ cố mấy lần.
expect("health", buildHealthPayload({ GEMINI_API_KEY: KEY } as unknown as NodeJS.ProcessEnv).retry.maxAttempts, 3, "health báo số lần tự thử lại");
expect(
  "health",
  buildHealthPayload({ GEMINI_API_KEY: KEY, GEMINI_BUDGET_MS: "20000" } as unknown as NodeJS.ProcessEnv).retry.budgetMs,
  20000,
  "health phản ánh GEMINI_BUDGET_MS do người dùng đặt"
);
ok();
if (buildHealthPayload({ GEMINI_API_KEY: KEY } as unknown as NodeJS.ProcessEnv).retry.budgetMs >= 60000) {
  fail("health", "quỹ thời gian thử lại phải nhỏ hơn maxDuration 60s của Vercel Function");
}

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
