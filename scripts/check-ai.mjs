/**
 * Chẩn đoán cấu hình Gemini bằng dòng lệnh: `npm run check:ai`
 *
 * - Nạp `.env` (nếu có) giống như máy chủ dev.
 * - In ra đã có GEMINI_API_KEY chưa, model sẽ dùng, khoá có bị dính khoảng trắng không,
 *   và máy chủ sẽ tự thử lại mấy lần khi Google lỗi tạm thời.
 * - Nếu có khoá, gọi thử Google (ListModels) để biết khoá **thực sự** dùng được hay không
 *   và model nào đang mở cho project của khoá đó.
 * - Thêm `--ask` (`npm run check:ai -- --ask`) để gọi thử **generateContent** y như trình duyệt:
 *   đây là cách phân biệt "khoá tốt nhưng Google đang quá tải 5xx" với "khoá hỏng".
 *
 * Dùng để phân biệt rõ bốn tình huống rất khác nhau:
 *   1. Máy chủ chưa nhận được biến môi trường  → khoá "không được nhận".
 *   2. Biến đã có nhưng khoá sai/ bị giới hạn  → Google từ chối (400/403).
 *   3. Khoá tốt nhưng GEMINI_MODEL không mở    → 404 model.
 *   4. Khoá tốt, model mở, nhưng Google 5xx    → lỗi tạm thời của máy chủ Google (chờ rồi thử lại).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApiKeyList, buildHealthPayload, generateReply, looksLikePastedWrong, probeKeys, resolveModels } from "../api/_handler.js";

const args = process.argv.slice(2);
const wantsAsk = args.includes("--ask");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
    console.log("✦ Đã nạp .env");
  } catch (error) {
    console.warn(`… Không đọc được .env: ${error instanceof Error ? error.message : error}`);
  }
} else {
  console.log("· Không thấy .env (bỏ qua; trên Vercel biến nằm trong Settings → Environment Variables)");
}

const health = buildHealthPayload();
const keys = buildApiKeyList();

/** Ẩn khoá: chỉ hiện 4 ký tự cuối để đối chiếu giữa các môi trường. */
const maskKey = (value) => `…${value.slice(-4)} (${value.length} ký tự)`;

console.log("\n── Cấu hình ─────────────────────────────────────────────");
console.log(`  Môi trường chạy : ${health.runtime}${health.region ? ` (${health.region})` : ""} · Node ${health.node}`);
console.log(`  Số khoá Gemini  : ${keys.length}${keys.length > 1 ? "  (tự xoay khi khoá lỗi / hết quota)" : ""}`);
console.log(`  Nguồn khai báo  : ${health.keys.sources.length ? health.keys.sources.join(", ") : "—"}`);
keys.forEach((value, index) => {
  // Google có cả khoá không bắt đầu bằng "AIza" (khoá 53 ký tự vẫn hợp lệ) nên chỉ cảnh báo
  // khi chuỗi có dấu hiệu dán sai thật sự; kết luận cuối cùng vẫn là phần gọi thử Google bên dưới.
  const suspicious = looksLikePastedWrong(value) ? "  ⚠ có dấu hiệu dán sai (quá ngắn hoặc còn ký tự lạ)" : "";
  console.log(`    · khoá #${index + 1}      : ${maskKey(value)}${suspicious}`);
});
if (health.key.present) {
  console.log(`  Khoảng trắng lạ : ${health.key.hadWhitespace ? "có (đã tự cắt khi gọi API)" : "không"}`);
}
console.log(`  Model dự phòng  : ${health.modelFallbacks.length ? health.modelFallbacks.join(", ") : "— (chỉ dùng một model)"}`);
console.log(
  `  Tự thử lại      : tối đa ${health.retry.maxAttempts} lần cho mỗi (khoá, model), chờ ${health.retry.baseDelayMs}→${health.retry.maxDelayMs}ms, tổng quỹ ${Math.round(
    health.retry.budgetMs / 1000
  )}s`
);
console.log(`  Lớp trả lời     : ${health.llm === "gemini" ? `Gemini (${health.model})` : "bộ luận giải nội bộ trên trình duyệt"}`);

if (!keys.length) {
  console.log("\n→ Chưa có khoá nên app vẫn chạy bằng bộ luận giải nội bộ.");
  console.log("  Thêm khoá: tạo tại https://aistudio.google.com/apikey rồi đặt GEMINI_API_KEY");
  console.log("  Nhiều khoá: GEMINI_API_KEYS=khoá1,khoá2,khoá3 (hoặc GEMINI_API_KEY_2, _3 …) — tự xoay khi hết quota.");
  console.log("  (Vercel: Settings → Environment Variables, chọn đúng môi trường Production/Preview, sau đó DEPLOY LẠI).");
  process.exit(0);
}

console.log("\n── Gọi thử Google ───────────────────────────────────────");
const probed = await probeKeys(keys, health.model);

for (const item of probed.results) {
  if (item.ok) {
    console.log(`  ✔ khoá #${item.key}: Google chấp nhận — ${item.modelCount} model gọi được generateContent.`);
    console.log(`      model ${health.model}: ${item.preferredModelAvailable ? "có trong danh sách" : "KHÔNG có trong danh sách"}`);
  } else {
    console.log(`  ✘ khoá #${item.key}: ${item.error}`);
    if (item.detail) console.log(`      Google trả lời: ${item.detail}`);
    if (item.hint) console.log(`      Cần làm: ${item.hint}`);
  }
}

console.log(
  `  Tổng kết: ${probed.summary.usable}/${probed.summary.total} khoá dùng được${
    probed.summary.total > probed.summary.checked ? ` (chỉ kiểm ${probed.summary.checked} khoá đầu)` : ""
  }.`
);

// Không thoát ngay: vẫn in hết gợi ý và (nếu có --ask) vẫn gọi thử generateContent,
// vì ListModels hỏng do mạng/5xx không có nghĩa là khoá sai.
if (probed.summary.allFailed) process.exitCode = 1;

const suggested = probed.results.find((item) => item.suggestedModel && !item.preferredModelAvailable)?.suggestedModel;
if (suggested) console.log(`  → Nên đặt GEMINI_MODEL=${suggested}`);
console.log("  Nếu app báo “chưa có key” mà lệnh này vẫn xanh: khoá nằm ở máy, chưa nằm ở máy chủ.");
console.log("  Trên Vercel hãy kiểm tra /api/health của tên miền đã deploy (thêm ?probe=1) và deploy lại sau khi thêm biến.");

/* ── Gọi thử generateContent (chỉ khi có --ask, vì tốn một phần quota) ─────────────
 * ListModels xanh nhưng app vẫn báo "Máy chủ Google tạm thời lỗi" là chuyện có thật:
 * khoá hoàn toàn hợp lệ, chỉ là Google đang quá tải (503) hoặc lỗi nội bộ (500) đúng lúc
 * sinh nội dung. Lệnh này tái hiện đúng đường đi của trình duyệt (kể cả tự thử lại). */
if (wantsAsk) {
  console.log("\n── Gọi thử generateContent (--ask) ──────────────────────");
  const models = resolveModels();
  const startedAt = Date.now();
  const result = await generateReply({
    apiKeys: keys,
    models,
    contents: [{ role: "user", parts: [{ text: "Trả lời đúng một từ: sẵn sàng" }] }]
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`  ✔ ${result.model} trả lời sau ${seconds}s: “${result.reply.slice(0, 120)}”`);
    console.log(
      `      đã gọi Google ${result.attempts} lần (tự thử lại ${result.retries} lần)${
        result.keyRotations ? `, xoay sang khoá #${result.keyIndex + 1}` : ""
      }.`
    );
    console.log("  → Khoá, model và đường sinh nội dung đều tốt. Nếu web vẫn lỗi thì đó là lỗi thoáng qua của Google.");
  } else {
    const failure = result.failure || {};
    console.log(`  ✘ ${failure.code || "GEMINI_ERROR"}: ${failure.error || "không gọi được Gemini"}`);
    if (failure.detail) console.log(`      Google trả lời: ${failure.detail}`);
    if (failure.hint) console.log(`      Cần làm: ${failure.hint}`);
    console.log(
      `      đã gọi Google ${result.attempts} lần trong ${seconds}s (tự thử lại ${result.retries} lần), model đã thử: ${result.tried.join(", ") || "—"}.`
    );
    if (result.keyAttempts?.length) {
      console.log(`      khoá đã thử: ${result.keyAttempts.map((item) => `#${item.index + 1} (${item.code})`).join(", ")}.`);
    }
    console.log(
      failure.retryable
        ? "  → Lỗi TẠM THỜI phía Google (không phải lỗi khoá): chờ 1–2 phút rồi chạy lại đúng lệnh này để xác nhận."
        : "  → Lỗi KHÔNG thuộc nhóm tạm thời: làm theo gợi ý ở trên (khoá/project/model), chờ cũng không hết."
    );
    process.exitCode = 1;
  }
} else {
  console.log("\n  Mẹo: chạy `npm run check:ai -- --ask` để gọi thử generateContent như trình duyệt");
  console.log("  (phân biệt “khoá hỏng” với “Google đang quá tải 5xx — chờ rồi thử lại”).");
}
