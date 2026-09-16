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
import { buildHealthPayload, normalizeApiKey, probeKey } from "../api/_handler.js";

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
console.log("\n── Cấu hình ─────────────────────────────────────────────");
console.log(`  Môi trường chạy : ${health.runtime}${health.region ? ` (${health.region})` : ""} · Node ${health.node}`);
console.log(`  GEMINI_API_KEY  : ${health.key.present ? "có" : "KHÔNG có"}`);
if (health.key.present) {
  console.log(`  Độ dài khoá     : ${health.key.length} ký tự${health.key.looksLikeGoogleKey ? "" : "  ⚠ không bắt đầu bằng “AIza”"}`);
  console.log(`  Khoảng trắng lạ : ${health.key.hadWhitespace ? "có (đã tự cắt khi gọi API)" : "không"}`);
}
console.log(`  Lớp trả lời     : ${health.llm === "gemini" ? `Gemini (${health.model})` : "bộ luận giải nội bộ trên trình duyệt"}`);

if (!health.key.present) {
  console.log("\n→ Chưa có khoá nên app vẫn chạy bằng bộ luận giải nội bộ.");
  console.log("  Thêm khoá: tạo tại https://aistudio.google.com/apikey rồi đặt GEMINI_API_KEY");
  console.log("  (Vercel: Settings → Environment Variables, chọn đúng môi trường Production/Preview, sau đó DEPLOY LẠI).");
  process.exit(0);
}

console.log("\n── Gọi thử Google ───────────────────────────────────────");
const probe = await probeKey(normalizeApiKey(process.env.GEMINI_API_KEY), health.model);

if (!probe.ok) {
  console.log(`  ✘ ${probe.error}`);
  if (probe.detail) console.log(`    Google trả lời: ${probe.detail}`);
  if (probe.hint) console.log(`    Cần làm: ${probe.hint}`);
  process.exit(1);
}

console.log(`  ✔ Google chấp nhận khoá — ${probe.modelCount} model gọi được generateContent.`);
console.log(`  Model đang cấu hình (${health.model}): ${probe.preferredModelAvailable ? "có trong danh sách" : "KHÔNG có trong danh sách"}`);
if (!probe.preferredModelAvailable && probe.suggestedModel) {
  console.log(`  → Nên đặt GEMINI_MODEL=${probe.suggestedModel}`);
}
console.log("  Nếu app báo “chưa có key” mà lệnh này vẫn xanh: khoá nằm ở máy, chưa nằm ở máy chủ.");
console.log("  Trên Vercel hãy kiểm tra /api/health của tên miền đã deploy (thêm ?probe=1) và deploy lại sau khi thêm biến.");
