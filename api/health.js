/**
 * Route GET /api/health — chẩn đoán cấu hình AI trên máy chủ.
 *
 * Trả về: đã có GEMINI_API_KEY chưa, model đang dùng, và (khi gọi `?probe=1`)
 * kết quả gọi thử Google để biết khoá có thực sự dùng được hay không.
 * Không bao giờ trả về nội dung khoá API.
 */
export { healthHandler as default } from "./_handler.js";
