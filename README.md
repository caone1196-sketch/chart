# Astral Chart VN

Web app tiếng Việt: **lập bản đồ sao (natal chart) → xem bản đồ bầu trời thực tế → đặt câu hỏi cho AI trả lời**.

## Tính năng

1. **Lập bản đồ sao natal**
   - Nhập ngày - giờ - nơi sinh; tra toạ độ tự động (Nominatim, dự phòng Open-Meteo) hoặc chọn nhanh thành phố, hoặc nhập tay.
   - Xác định offset lịch sử theo timezone IANA (kể cả DST) qua `Intl` + vòng lặp hiệu chỉnh.
   - Tính Mặt Trời, Mặt Trăng, 10 hành tinh (kể cả nghịch hành), AC/DC/MC/IC, 12 nhà **Whole Sign**, góc chiếu (0°, 60°, 90°, 120°, 180°) kèm orb và trạng thái áp sát/tách.
   - Cân bằng nguyên tố - tính chất, pha Mặt Trăng lúc sinh, sao cố định nằm gần các điểm natal (orb 1.5°), transit hiện tại lên bản đồ (orb 4°).

2. **Bản đồ sao thực tế (bầu trời)**
   - 5.044 ngôi sao Hipparcos (tới cấp sao 6) với màu theo chỉ số B-V, 88 chòm sao có đường nối và **tên tiếng Việt**, 118 thiên thể sâu (Messier, NGC, Magellan, Tua Rua, Tổ Ong…), dải Ngân Hà, hoàng đạo 12 cung.
   - Hai chế độ xem: bầu trời theo **độ cao - phương vị** (tâm là thiên đỉnh) và **toàn cảnh xích kinh - xích vĩ**.
   - Kéo để di chuyển, lăn chuột/chụm hai ngón để zoom, chạy thời gian (±giờ/ngày, tốc độ 1 giờ → 1 tuần mỗi nhịp), xem bầu trời ở bất kỳ thời điểm nào.
   - Bấm vào sao/hành tinh/thiên thể để xem toạ độ, độ cao, phương vị, vị trí hoàng đạo và **hỏi AI về riêng đối tượng đó**.
   - Thẻ phụ: hành tinh đang thấy được, giờ mọc/lặn Mặt Trời - Mặt Trăng, hành tinh theo cung.

3. **Hỏi AI**
   - Hai lớp: gọi mô hình ngôn ngữ lớn qua `/api/ai-chat` nếu máy chủ có `OPENAI_API_KEY`, nếu không thì dùng **bộ luận giải nội bộ** chạy hoàn toàn trên trình duyệt (đọc đúng vị trí hành tinh, nhà, góc chiếu, sao cố định, transit, pha Mặt Trăng, giờ mọc/lặn).
   - Nhận diện ý định câu hỏi (tính cách, sự nghiệp, tình cảm, tài chính, sức khỏe, gia đình, học tập, di chuyển, vận hạn, tương hợp, sao cố định, bầu trời, giải thích khái niệm…), trả lời có dẫn chứng dữ liệu và phần gợi ý hành động kèm khuyến cáo.

## Chạy dự án

```bash
npm install
npm run dev        # máy chủ dev (Vite + /api/ai-chat) — http://localhost:5173
npm run typecheck  # kiểm tra TypeScript
npm run build      # build ra dist/index.html (một tệp duy nhất)
npm run preview    # phục vụ dist/ kèm API route
npm run data       # sinh lại dữ liệu sao vào src/data/ từ gói npm d3-celestial
```

### Biến môi trường (tuỳ chọn)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Bật lớp mô hình ngôn ngữ lớn cho phần hỏi đáp |
| `OPENAI_MODEL` | `gpt-4o-mini` | Tên mô hình |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Cho dịch vụ tương thích OpenAI |
| `PORT` | `5173` | Cổng máy chủ dev/preview |

Không có `OPENAI_API_KEY` thì app **vẫn hoạt động đầy đủ**: API trả mã `NO_API_KEY` và giao diện tự chuyển sang bộ luận giải nội bộ.

## Cấu trúc

```
src/
  lib/astro.ts       engine bản đồ sao: thời gian - múi giờ, hành tinh, nhà, góc chiếu, transit, báo cáo gửi AI
  lib/sky.ts         danh mục sao + toán thiên văn: precession J2000→ngày, alt/az, hoàng đạo, Ngân Hà, sao cố định, mọc/lặn
  lib/knowledge.ts   bảng tri thức tiếng Việt (hành tinh, cung, nhà, góc chiếu, nguyên tố, pha trăng, từ khoá ý định)
  lib/interpret.ts   bộ luận giải nội bộ (rule-based) theo ý định câu hỏi
  lib/ai.ts          gọi /api/ai-chat và cơ chế dự phòng
  lib/geocode.ts     tra toạ độ (Nominatim → Open-Meteo)
  components/        BirthForm, ChartWheel, ChartPanel, StarMap (canvas), ChatPanel
  data/              stars.json, constellations.json, deepsky.json (sinh bởi scripts/build-data.mjs)
api/
  _handler.js        xử lý dùng chung (Vercel Serverless + máy chủ dev)
  ai-chat.js         route /api/ai-chat
server/index.mjs     máy chủ dev (Vite middleware) và chế độ --prod
scripts/build-data.mjs  sinh dữ liệu sao từ npm package d3-celestial
```

## Nguồn dữ liệu & giấy phép

- **Sao, chòm sao, thiên thể sâu**: [d3-celestial](https://github.com/ofrohn/d3-celestial) (Olaf Frohn, MIT) — catalogue Hipparcos, đường nối 88 chòm sao, Messier/NGC.
- **Tính toán thiên văn**: [astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross, MIT).
- **Tra toạ độ**: OpenStreetMap Nominatim và Open-Meteo Geocoding.

## Miễn trừ trách nhiệm

Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế tư vấn y tế, tài chính hoặc pháp lý.
