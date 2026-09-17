/**
 * Chẩn đoán cấu hình Gemini bằng dòng lệnh: `npm run check:ai`
 *
 * - Nạp `.env` (nếu có) giống như máy chủ dev.
 * - In ra đã có GEMINI_API_KEY chưa, model sẽ dùng, khoá có bị dính khoảng trắng không.
 * - Nếu có khoá, gọi thử Google (ListModels) để biết khoá **thực sự** dùng được hay không
 *   và model nào đang mở cho project của khoá đó.
 *
 * Dùng để phân biệt rõ ba tình huống rất khác nhau:
 *   1. Máy chủ chưa nhận được biến môi trường  → khoá "không được nhận".
 *   2. Biến đã có nhưng khoá sai/ bị giới hạn  → Google từ chối.
 *   3. Khoá tốt nhưng GEMINI_MODEL không mở    → 404 model.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApiKeyList, buildHealthPayload, probeKeys } from "../api/_handler.js";

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
  const suspicious = value.startsWith("AIza") ? "" : "  ⚠ không bắt đầu bằng “AIza”";
  console.log(`    · khoá #${index + 1}      : ${maskKey(value)}${suspicious}`);
});
if (health.key.present) {
  console.log(`  Khoảng trắng lạ : ${health.key.hadWhitespace ? "có (đã tự cắt khi gọi API)" : "không"}`);
}
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

if (probed.summary.allFailed) process.exit(1);

const suggested = probed.results.find((item) => item.suggestedModel && !item.preferredModelAvailable)?.suggestedModel;
if (suggested) console.log(`  → Nên đặt GEMINI_MODEL=${suggested}`);
console.log("  Nếu app báo “chưa có key” mà lệnh này vẫn xanh: khoá nằm ở máy, chưa nằm ở máy chủ.");
console.log("  Trên Vercel hãy kiểm tra /api/health của tên miền đã deploy (thêm ?probe=1) và deploy lại sau khi thêm biến.");
