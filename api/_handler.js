/**
 * Bộ xử lý cho API route /api/ai-chat.
 * Dùng chung cho Vercel Serverless (api/ai-chat.js) và máy chủ dev (server/index.mjs).
 *
 * Biến môi trường:
 *   OPENAI_API_KEY   - bắt buộc để dùng mô hình ngôn ngữ lớn
 *   OPENAI_MODEL     - tuỳ chọn, mặc định "gpt-4o-mini"
 *   OPENAI_BASE_URL  - tuỳ chọn, cho các dịch vụ tương thích OpenAI
 *
 * Khi chưa có OPENAI_API_KEY, route trả về 501 kèm code "NO_API_KEY" để giao diện
 * tự động chuyển sang bộ luận giải nội bộ (chạy hoàn toàn trong trình duyệt).
 */

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Chỉ hỗ trợ phương thức POST.", code: "METHOD_NOT_ALLOWED" }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.statusCode = 501;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error:
          "Máy chủ chưa cấu hình OPENAI_API_KEY. Giao diện sẽ dùng bộ luận giải nội bộ trên trình duyệt.",
        code: "NO_API_KEY"
      })
    );
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

    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `Dữ liệu bản đồ sao và bầu trời hiện tại:\n${chartReport}` },
          ...cleaned
        ]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || `Yêu cầu tới mô hình thất bại (HTTP ${response.status}).`;
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: message, code: "UPSTREAM_ERROR" }));
      return;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        reply: reply || "Mô hình chưa trả về nội dung.",
        model: data?.model || model
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định ở máy chủ.";
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: message, code: "SERVER_ERROR" }));
  }
}
