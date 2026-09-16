/**
 * Bộ xử lý cho API route /api/ai-chat — dùng Google Gemini.
 * Dùng chung cho Vercel Serverless (api/ai-chat.js) và máy chủ dev (server/index.mjs).
 *
 * Biến môi trường:
 *   GEMINI_API_KEY - bắt buộc để gọi mô hình Gemini (tạo miễn phí tại Google AI Studio)
 *   GEMINI_MODEL   - tuỳ chọn, mặc định "gemini-2.5-flash"
 *
 * Khi chưa có GEMINI_API_KEY, route trả về 501 kèm code "NO_API_KEY" để giao diện
 * tự động chuyển sang bộ luận giải nội bộ (chạy hoàn toàn trong trình duyệt).
 * Khoá không bao giờ được gửi xuống client: chỉ máy chủ (hoặc Vercel function) đọc nó.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `Bạn là chuyên gia chiêm tinh phương Tây và quan sát bầu trời, đang trả lời bằng tiếng Việt có dấu cho người dùng Việt Nam.

Nguyên tắc:
- Trả lời đúng trọng tâm câu hỏi, mở đầu bằng kết luận ngắn rồi mới phân tích.
- Luôn dẫn chứng bằng dữ liệu cụ thể trong báo cáo bản đồ sao: vị trí hành tinh, nhà, góc chiếu, transit, pha Mặt Trăng.
- Văn phong tự nhiên, dễ hiểu, tránh khẳng định tuyệt đối về tương lai.
- Không đưa lời khuyên y tế, pháp lý hoặc đầu tư cụ thể; chỉ nêu xu hướng và gợi ý hành vi an toàn.
- Nếu câu hỏi cần dữ liệu chưa có (ví dụ ngày sinh của người khác), hãy nói rõ cần thêm gì.
- Độ dài hợp lý: 150-450 từ, có thể dùng gạch đầu dòng và tiêu đề ngắn.
- Có thể trả lời cả câu hỏi thiên văn quan sát (hành tinh nào thấy tối nay, pha Mặt Trăng, chòm sao nào đang mọc) dựa trên dữ liệu được cung cấp.`;

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Chỉ hỗ trợ phương thức POST.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 501, {
      error: "Máy chủ chưa cấu hình GEMINI_API_KEY. Giao diện sẽ dùng bộ luận giải nội bộ trên trình duyệt.",
      code: "NO_API_KEY"
    });
    return;
  }

  try {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const chartReport =
      typeof body.chartReport === "string" && body.chartReport.trim()
        ? body.chartReport
        : "Chưa có dữ liệu bản đồ sao. Hãy nhắc người dùng tạo bản đồ sao trước.";

    const cleaned = messages
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 6000) }));

    // Gemini gọi vai trợ lý là "model"; hệ thống đi qua systemInstruction riêng.
    const contents = [
      { role: "user", parts: [{ text: `Dữ liệu bản đồ sao của người hỏi:\n${chartReport.slice(0, 9000)}` }] },
      ...cleaned.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }))
    ];

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let data = {};
    let ok = false;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        }),
        signal: controller.signal
      });
      ok = response.ok;
      data = await response.json().catch(() => ({}));
    } finally {
      clearTimeout(timeoutId);
    }

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!ok || !reply) {
      const reason =
        data?.error?.message ||
        (data?.promptFeedback?.blockReason ? `Nội dung bị chặn: ${data.promptFeedback.blockReason}` : "") ||
        "Gemini không trả về nội dung.";
      sendJson(res, 502, { error: reason, code: "GEMINI_ERROR" });
      return;
    }

    sendJson(res, 200, { reply, model });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Gemini phản hồi quá chậm." : "Lỗi khi gọi Gemini.";
    sendJson(res, 502, { error: message, code: "GEMINI_NETWORK" });
  }
}
