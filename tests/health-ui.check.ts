/**
 * Kiểm chứng lớp AI phía trình duyệt (`src/lib/ai.ts`) đọc đúng payload nhiều khoá:
 *
 *   npm run test:health-ui
 *
 * Bài kiểm chạy trong Node nhưng vá tối thiểu `window` (chỉ setTimeout/clearTimeout) vì
 * `src/lib/ai.ts` là mã chạy trong trình duyệt. `fetch` được thay bằng hàm giả nên không
 * có lời gọi mạng thật. Trọng tâm: giao diện không được "mù" thông tin nhiều khoá —
 * phải biết máy chủ có bao nhiêu khoá, bao nhiêu khoá dùng được, và khi máy chủ phải xoay
 * khoá thì câu trả lời phải kèm `keyUsed` / `keysConfigured` / `keyNote` để hiển thị.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChatPanel from "../src/components/ChatPanel.tsx";
import { askServerAi, checkServerHealth, isLocalFallback, type ServerHealth } from "../src/lib/ai.ts";

const globalWindow = globalThis as unknown as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } };
globalWindow.window = { setTimeout, clearTimeout };

let checks = 0;
const failures: string[] = [];
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
const assert = (group: string, condition: boolean, message: string) => {
  ok();
  if (!condition) fail(group, message);
};

const mockFetch = (status: number, body: unknown) => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
      headers: new Headers()
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls };
};

/* ── 1. /api/health nhiều khoá: đọc đủ số lượng, nguồn khai báo, kết quả probe ── */

{
  const group = "health nhiều khoá";
  const { calls } = mockFetch(200, {
    ok: true,
    llm: "gemini",
    model: "gemini-3.6-flash",
    modelFallbacks: [],
    runtime: "node",
    environment: "production",
    region: null,
    key: { present: true, usable: true, length: 39, looksLikeGoogleKey: true },
    keys: {
      total: 3,
      usable: 2,
      needsReview: 0,
      sources: ["GEMINI_API_KEYS", "GEMINI_API_KEY_2"],
      lengths: [39, 39, 39],
      rotation: true
    },
    probe: { ok: false, status: 400, code: "GEMINI_BAD_KEY", error: "khoá #1 hỏng" },
    probes: [
      { key: 1, ok: false, status: 400, code: "GEMINI_BAD_KEY", error: "API key not valid" },
      { key: 2, ok: true, status: 200, modelCount: 12, preferredModelAvailable: true }
    ],
    probeSummary: { checked: 2, total: 3, usable: 1, allFailed: false }
  });

  const health = await checkServerHealth(true);
  expect(group, calls, ["/api/health?probe=1"], "gọi đúng route kèm probe");
  expect(group, health.reachable, true, "route gọi được");
  expect(group, health.llm, "gemini", "nhận ra máy chủ có khoá");
  expect(group, health.keysTotal, 3, "đọc tổng số khoá");
  expect(group, health.keysUsable, 2, "ưu tiên số khoá dùng được từ payload keys");
  expect(group, health.keyRotation, true, "biết máy chủ tự xoay khoá");
  expect(group, health.keySources, ["GEMINI_API_KEYS", "GEMINI_API_KEY_2"], "đọc tên biến đang cấp khoá");
  expect(group, health.probeKeys.length, 2, "đọc kết quả probe từng khoá");
  expect(group, health.probeKeys[0].code, "GEMINI_BAD_KEY", "mã lỗi của khoá #1");
  expect(group, health.probeKeys[1].ok, true, "khoá #2 dùng được");
}

/* ── 2. Tương thích ngược: payload cũ (chỉ có `key`) vẫn phải đọc được ── */

{
  const group = "tương thích ngược";
  mockFetch(200, {
    ok: true,
    llm: "gemini",
    model: "gemini-3.6-flash",
    modelFallbacks: [],
    runtime: "vercel",
    environment: "production",
    region: "sin1",
    key: { present: true, usable: true, length: 39, looksLikeGoogleKey: true }
  });

  const health = await checkServerHealth(false);
  expect(group, health.keysTotal, 1, "payload cũ → coi như một khoá");
  expect(group, health.keysUsable, 1, "payload cũ → khoá đó dùng được");
  expect(group, health.keyRotation, false, "payload cũ → không bật xoay khoá");
  expect(group, health.probeKeys, [], "payload cũ → không có danh sách probe");
  expect(group, health.keyRotation === false && health.keysTotal === 1, true, "giao diện không hiện dòng nhiều khoá khi chỉ có một khoá");
}

/* ── 3. Chưa có khoá: giữ nguyên hành vi cũ ── */

{
  const group = "chưa có khoá";
  mockFetch(200, {
    ok: true,
    llm: "local-fallback",
    model: null,
    modelFallbacks: [],
    runtime: "node",
    environment: "development",
    region: null,
    key: { present: false, usable: false, length: 0, looksLikeGoogleKey: false },
    keys: { total: 0, usable: 0, needsReview: 0, sources: [], lengths: [], rotation: false }
  });
  const health = await checkServerHealth(false);
  expect(group, health.llm, "local", "không có khoá → dùng bộ nội bộ");
  expect(group, health.keysTotal, 0, "không có khoá nào");
  expect(group, health.keyPresent, false, "báo chưa có khoá");
}

/* ── 4. Route trả HTML (rewrite SPA) → báo không gọi được thay vì "chưa có key" ── */

{
  const group = "route hỏng";
  mockFetch(200, "<!doctype html><html><body>index</body></html>");
  const health = await checkServerHealth(false);
  expect(group, health.reachable, false, "nhận ra route không trả JSON");
  assert(group, typeof health.error === "string" && health.error.length > 0, "phải có thông báo lỗi rõ ràng");
}

/* ── 5. Trả lời có xoay khoá: đọc đúng keyUsed / keysConfigured / keyNote ── */

{
  const group = "trả lời xoay khoá";
  mockFetch(200, {
    reply: "Câu trả lời từ khoá dự phòng.",
    model: "gemini-3.6-flash",
    keyUsed: 2,
    keysConfigured: 3,
    keyRotations: 1,
    keyNote: "Đã xoay sang khoá #2 (…2222) sau khi khoá #1 (…1111) lỗi GEMINI_QUOTA."
  });

  const result = await askServerAi({ messages: [{ role: "user", content: "hỏi" }], chartReport: "dữ liệu", senderName: "Test" });
  assert(group, !isLocalFallback(result), "có câu trả lời thì không rơi về bộ nội bộ");
  if (!isLocalFallback(result)) {
    expect(group, result.engine, "gemini", "đánh dấu trả lời bằng Gemini");
    expect(group, result.keyUsed, 2, "biết đã dùng khoá #2");
    expect(group, result.keysConfigured, 3, "biết máy chủ có 3 khoá");
    expect(group, result.keyRotations, 1, "biết đã xoay 1 lần");
    assert(group, Boolean(result.keyNote?.includes("khoá #1")), "ghi chú xoay khoá được chuyển lên giao diện");
  }
}

/* ── 6. Mọi khoá hỏng: thông báo phải nói đã thử khoá nào, và không lộ khoá ── */

{
  const group = "mọi khoá hỏng";
  const SECRET = "AIzaSySECRET-SHOULD-NOT-APPEAR";
  mockFetch(502, {
    error: "Khoá Gemini không hợp lệ (Google từ chối khoá).",
    code: "GEMINI_BAD_KEY",
    hint: "Dán lại khoá mới.",
    keysConfigured: 2,
    keyAttempts: [
      { key: 1, code: "GEMINI_BAD_KEY" },
      { key: 2, code: "GEMINI_QUOTA" }
    ]
  });

  const result = await askServerAi({ messages: [{ role: "user", content: "hỏi" }], chartReport: "x", senderName: "Test" });
  assert(group, isLocalFallback(result), "lỗi thì phải rơi về bộ luận giải nội bộ");
  if (isLocalFallback(result)) {
    expect(group, result.code, "GEMINI_BAD_KEY", "giữ mã lỗi để giao diện xử lý");
    assert(group, result.error.includes("khoá #1") && result.error.includes("khoá #2"), `thông báo phải nêu các khoá đã thử, nhận: ${result.error}`);
    assert(group, !result.error.includes(SECRET), "thông báo không được chứa nội dung khoá");
  }
}

/* ── 7. Giao diện chat hiển thị đúng thông tin nhiều khoá ── */

{
  const group = "giao diện nhiều khoá";
  const health: ServerHealth = {
    reachable: true,
    llm: "gemini",
    model: "gemini-3.6-flash",
    modelFallbacks: [],
    runtime: "node",
    environment: "production",
    region: null,
    keyPresent: true,
    keyLength: 39,
    keyLooksValid: true,
    keysTotal: 3,
    keysUsable: 2,
    keySources: ["GEMINI_API_KEYS", "GEMINI_API_KEY_2"],
    keyRotation: true,
    probeKeys: [
      { key: 1, ok: false, code: "GEMINI_BAD_KEY", error: "API key not valid" },
      { key: 2, ok: true, modelCount: 12, preferredModelAvailable: true }
    ],
    probe: { ok: true, status: 200 },
    error: null
  };

  const markup = renderToStaticMarkup(
    createElement(ChatPanel, {
      messages: [{ role: "assistant", content: "Chào bạn" }],
      question: "",
      setQuestion: () => {},
      onSend: () => {},
      onClear: () => {},
      isAsking: false,
      status: "Đã tự xoay khoá Gemini: Đã xoay sang khoá #2 sau khi khoá #1 lỗi GEMINI_QUOTA.",
      engine: "gemini",
      engineLabel: "gemini-3.6-flash · khoá 2/3",
      serverLlm: "gemini",
      serverHealth: health,
      isCheckingServer: false,
      onCheckServer: () => {},
      senderName: "Test",
      setSenderName: () => {},
      hasChart: true
    })
  );

  assert(group, markup.includes("2/3 khoá dùng được"), "hiện số khoá dùng được trên tổng số khoá");
  assert(group, markup.includes("tự xoay"), "nói rõ máy chủ tự xoay khoá");
  assert(group, markup.includes("khoá #2: Google chấp nhận"), "liệt kê kết quả kiểm tra từng khoá");
  assert(group, markup.includes("khoá #1"), "nêu khoá gặp lỗi khi kiểm tra");
  assert(group, markup.includes("nguồn: GEMINI_API_KEYS + GEMINI_API_KEY_2"), "hiện tên biến đang cấp khoá");
  assert(group, markup.includes("khoá 2/3"), "nhãn engine nói rõ đang dùng khoá nào");
  assert(group, markup.includes("Đã tự xoay khoá Gemini"), "ghi chú xoay khoá hiện lên khung chat");
  ok();
  if (markup.includes("AIza")) fail(group, "giao diện không được chứa nội dung khoá");
}

console.log(`\n${failures.length ? "✘" : "✔"} Lớp AI phía trình duyệt: ${checks} phép kiểm, ${failures.length} lỗi.`);
for (const failure of failures) console.log(`  · ${failure}`);
if (failures.length) process.exit(1);
