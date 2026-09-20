# Astral Chart VN

Web app tiếng Việt: **lập bản đồ sao (natal chart) → ngắm bầu trời thật bằng khung nhìn 3D → đặt câu hỏi cho AI (Gemini) trả lời**.

## Tính năng

1. **Lập bản đồ sao natal**
   - Nhập ngày - giờ - nơi sinh; tra toạ độ tự động (Nominatim, dự phòng Open-Meteo) hoặc chọn nhanh thành phố, hoặc nhập tay.
   - Xác định offset lịch sử theo timezone IANA (kể cả DST) qua `Intl` + vòng lặp hiệu chỉnh.
   - Tính Mặt Trời, Mặt Trăng, 10 hành tinh (kể cả nghịch hành), AC/DC/MC/IC, góc chiếu (0°, 60°, 90°, 120°, 180°) kèm orb và trạng thái áp sát/tách.
   - Một chuẩn duy nhất, không biến thể: **hoàng đạo nhiệt đới (tropical, geocentric)** + **nhà Whole Sign** (mỗi cung là một nhà, tính từ cung Mọc).
   - Cân bằng nguyên tố - tính chất, pha Mặt Trăng lúc sinh, sao cố định nằm gần các điểm natal (orb 1.5°), transit hiện tại lên bản đồ (orb 4°).
   - **21 điểm bổ sung**: Chiron, Ceres, Pallas, Juno, Vesta, Eris, Sedna, Bắc/Nam giao điểm, Lilith + 10 điểm quy ước (Uranian/Hamburg, Transpluto, Selena) — tab riêng kèm nhà, màu sắc và ý nghĩa, đồng thời đưa vào báo cáo gửi AI.

2. **Bản đồ sao 3D (bầu trời thật, khung nhìn phối cảnh)** — khung ngắm trời duy nhất của app (bản đồ 2D cũ đã được thay bằng bản 3D), chi tiết trong `docs/ban-do-3d.md`
   - 5.044 sao Hipparcos (tới cấp 6) màu theo chỉ số B-V, 88 chòm sao có đường nối và **tên tiếng Việt**, 118 thiên thể sâu, hoàng đạo 12 cung, Ngân Hà ~1.670 đám mây sao kèm **rãnh tối Great Rift**.
   - **Ống kính phối cảnh thật** (pinhole trên canvas 2D): chân trời thẳng, vòng độ cao cong đúng thấu kính, Mặt Trời/Mặt Trăng có bán kính góc thật nên phóng to thì to ra như ống nhòm; Mặt Trăng đúng pha, đúng hướng sáng.
   - **Hành tinh là khối cầu chiếu sáng**: pha thật giải từ tam giác khoảng cách Trái Đất–Mặt Trời–hành tinh (Sao Thổ tròn đầy + vành đai trước/sau, Sao Kim lưỡi liềm khi cận địa), chi tiết bề mặt tất định, quầng ám màu riêng.
   - **Khí quyển & địa hình**: màu trời theo độ cao Mặt Trời, ráng chiều, khúc xạ Bennett + hấp thụ Kasten–Young, sao nhấp nháy mạnh dần khi xuống thấp; mặt đất lưới khoảng cách 3→900 m và ba lớp núi theo chiều sâu; tắt khí quyển thì địa hình đổi bảng màu trung tính.
   - **Tua giờ thấy vòm trời quay**: lưới xích đạo khoá vào khung sao + vệt sao thành cung tròn dài theo tốc độ (thời gian thực tới 6 giờ/giây); sao quay bằng ma trận ΔLST nên mượt 60 fps.
   - **Điều khiển**: kéo nhìn quanh, lăn chuột/chụm phóng to **quanh con trỏ mà trang không cuộn**, nháy đúp đưa vật thể vào giữa, bấm vật thể → thẻ thông tin + **Hỏi AI về riêng nó**, ô tra cứu gõ được tiếng Việt không dấu, phím ←→↑↓ +/− và phím cách tua giờ, 13 nút bật/tắt lớp, toàn màn hình.
   - Thẻ phụ: hành tinh đang thấy được, giờ mọc/lặn Mặt Trời - Mặt Trăng, hành tinh theo cung.
   - **Giao diện & cảm ứng**: hero mở đầu chuyển màu, overline đánh số mục, thẻ `.card` thống nhất, nền trời đêm hai quầng sáng; kết quả natal gom vào **một thẻ có tab** (Tổng quan · Hành tinh · Điểm thêm · 12 nhà · Góc chiếu · Sao cố định · Transit, kèm số lượng) thay vì sáu thẻ xếp chồng, danh sách dài tự cuộn trong khung cao cố định; nav cuộn ngang trên màn hẹp; ô nhập/select/checkbox/nút đạt cỡ chạm ≥44 px trên thiết bị cảm ứng; `scroll-padding` bù header dính; tôn trọng `prefers-reduced-motion`.

3. **Hỏi AI (Gemini)**

   - Hai lớp: gọi **Google Gemini** qua `/api/ai-chat` (Vercel Serverless hoặc máy chủ dev) nếu máy chủ có khoá, nếu không thì dùng **bộ luận giải nội bộ** chạy hoàn toàn trên trình duyệt (đọc đúng vị trí hành tinh, nhà, góc chiếu, sao cố định, transit, pha Mặt Trăng, giờ mọc/lặn). Khoá API chỉ nằm ở biến môi trường máy chủ, không bao giờ nhúng vào bundle.
   - **Nhiều khoá + tự xoay khoá**: khai `GEMINI_API_KEYS=khoá1,khoá2,…` (hoặc `GEMINI_API_KEY` + `GEMINI_API_KEY_2…9`, tối đa 9 khoá). Gặp lỗi **thuộc về khoá** (khoá sai, khoá bị giới hạn referrer/IP, hết quota, model chưa mở cho project của khoá, Google lỗi 5xx) thì máy chủ tự thử khoá kế tiếp — vẫn chỉ dùng đúng model `gemini-3.6-flash`; lỗi không thuộc về khoá (bộ lọc an toàn, quá thời gian) thì không xoay để khỏi nhân số lần gọi. Câu trả lời ghi rõ đang dùng khoá thứ mấy; mọi phản hồi (kể cả `/api/health`) **không bao giờ chứa nội dung khoá** — chỉ số thứ tự, độ dài và 4 ký tự cuối.
   - Nhận diện ý định câu hỏi (tính cách, sự nghiệp, tình cảm, tài chính, sức khỏe, gia đình, học tập, di chuyển, vận hạn, tương hợp, sao cố định, tiểu hành tinh & điểm bổ sung, bầu trời, giải thích khái niệm…), trả lời có dẫn chứng dữ liệu và phần gợi ý hành động kèm khuyến cáo.

## Kiểm chứng số liệu

Các engine được kiểm chứng tự động với **Swiss Ephemeris** (`npm test`, fixture sinh từ mã C tham chiếu trong `tests/gen/`):

| Phần | Phạm vi so sánh | Sai số lớn nhất |
| --- | --- | --- |
| Ví dụ natal 11/11/1996 | 10 hành tinh + Cung Mọc/Thiên Đỉnh + 12 cusp Whole Sign so với Swiss Ephemeris 2.10 | hành tinh ≤ 0,03° · góc & nhà ≤ 0,01° |
| Điểm bổ sung | 41 mốc 1900–2100 so Swiss Ephemeris (Kepler 2 vật thể cho tiểu hành tinh) | node 0,00015° · Lilith 0,12° · giả định ≤ 0,007° · tiểu hành tinh TB ≤ 0,25° |
| Bản đồ sao (hiển thị) | 14.950 phép kiểm: khúc xạ/hấp thụ, phép chiếu & nghịch đảo, phóng to quanh con trỏ, **quy đổi lăn chuột & giới hạn dịch chuyển khung**, dựng khung 4 vĩ độ, Ngân Hà, pha Trăng, tra cứu | 0 lỗi (sai số nghịch đảo < 0,05°) |
| Bầu trời 3D | 1.510 phép kiểm: hình học camera phối cảnh (chân trời thẳng, nghịch đảo < 1e-6 px), zoom quanh con trỏ nghiệm kín, quay ΔLST khớp khung dựng lại ≤ vài phần triệu độ, cắt mặt phẳng gần, lưới mặt đất, vệt sao, pha hành tinh theo tam giác khoảng cách, lưới xích đạo; kèm **vẽ thật trên canvas** và so sánh điểm ảnh (tất định từng byte) | 0 lỗi |
| Vòng bản đồ sao natal | 1.985 phép kiểm: render thật `ChartWheel` rồi soi lại SVG (hộp bao từng phần tử kể cả nửa nét và chữ), 4 lá số thật, ca AC ở đỉnh vòng, vĩ độ 78°, 10 hành tinh dồn một độ, dữ liệu NaN/Infinity — kèm **đối chứng**: hình học cũ phải trượt đúng phép kiểm | 0 lỗi (mọi nét vẽ nằm trong vùng đệm 16/600 ≈ 2,7%) |
| Lớp AI phía trình duyệt | 38 phép kiểm: đọc `/api/health` (một khoá, nhiều khoá, chưa có khoá, route trả HTML), xoay khoá khi trả lời, thông báo khi mọi khoá hỏng, và render `ChatPanel` để chắc giao diện hiện đúng số khoá / nguồn khai báo / ghi chú xoay khoá | 0 lỗi |
| Giao diện ngắm trời 3D | 1 lần chạy jsdom: gắn Sky3D, vòng rAF vẽ thật qua context giả, mô phỏng lăn chuột (không cuộn trang + trường nhìn đổi), kéo đổi hướng, phím cách tua, bấm chọn thiên thể → Hỏi AI → bỏ chọn, bật/tắt lớp, đổi ngày giờ, về giờ thực, toàn màn hình | 0 ngoại lệ, 0 console.error |

## Chạy dự án

```bash
npm install
npm run dev        # máy chủ dev (Vite + /api/ai-chat) — http://localhost:5173
npm run typecheck  # kiểm tra TypeScript
npm run build      # build ra dist/index.html (một tệp duy nhất)
npm run preview    # phục vụ dist/ kèm API route
npm run data       # sinh lại dữ liệu sao vào src/data/ từ gói npm d3-celestial
npm test           # toàn bộ kiểm chứng số liệu + bản đồ sao + giao diện + lớp API Gemini
npm run test:wheel       # vòng bản đồ sao natal không bị cắt lẹm (render SVG rồi soi hộp bao)
npm run shot:wheel       # render vòng bản đồ sao ra PNG trong .cache/shots/ để kiểm bằng mắt
npm run test:health-ui   # lớp AI phía trình duyệt đọc đúng payload nhiều khoá
npm run test:example     # ví dụ natal 11/11/1996 so với Swiss Ephemeris
npm run check:ai         # chẩn đoán từng khoá Gemini bằng dòng lệnh
npm run check:ai   # chẩn đoán cấu hình Gemini (khoá có dùng được không, model nào đang mở)
npm run test:sky   # mô hình hiển thị bầu trời (khúc xạ, phép chiếu, Ngân Hà, pha Trăng, tra cứu)
npm run test:ui3d  # chạy giao diện ngắm trời 3D trong jsdom (lăn chuột/kéo/chọn thiên thể/đổi giờ)
npm run test:sky3d # hình học + bộ vẽ của khung ngắm 3D (kèm vẽ thật trên canvas Node)
npm run shot:sky3d # render 16 tình huống 3D ra PNG trong .cache/shots/
```

### Biến môi trường (tuỳ chọn)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Bật lớp Gemini cho phần hỏi đáp (tạo miễn phí tại Google AI Studio) |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Tên mô hình Gemini — app chỉ dùng đúng một model này (không còn chuỗi model dự phòng) |
| `PORT` | `5173` | Cổng máy chủ dev/preview |

Không có `GEMINI_API_KEY` thì app **vẫn hoạt động đầy đủ**: API trả mã `NO_API_KEY` và giao diện tự chuyển sang bộ luận giải nội bộ.

Máy chủ dev tự nạp `.env` (không cần thư viện ngoài), nên chạy local chỉ cần tạo tệp `.env`:

```bash
echo 'GEMINI_API_KEY=dán_khoá_của_bạn' > .env
npm run check:ai   # chẩn đoán: khoá có dùng được không, model nào đang mở
```

`npm run check:ai` gọi thẳng Google để biết khoá **thực sự** hoạt động, in ra model nên đặt, và
phân biệt rõ ba tình huống rất khác nhau: máy chủ không nhận được biến, khoá bị Google từ chối,
hay tên model không tồn tại.

## Cấu trúc

```
src/
  lib/astro.ts       engine bản đồ sao: thời gian - múi giờ, 10 hành tinh, nhà Whole Sign, góc chiếu, transit, báo cáo gửi AI
  lib/mathx.ts       toán dùng chung (chuẩn hoá góc, chênh lệch góc, obliquity, Julian Day)
  lib/points.ts      21 điểm bổ sung: node, Lilith, Chiron & tiểu hành tinh, TNO, điểm giả định Hamburg
  lib/sky.ts         danh mục sao + toán thiên văn: precession J2000→ngày, alt/az, hoàng đạo, toạ độ thiên hà, sao cố định, mọc/lặn
  lib/sky-visual.ts  mô hình hiển thị: khí quyển (khúc xạ, hấp thụ, màu trời), cấp sao → quầng sáng, mây sao Ngân Hà, địa hình, pha Trăng, hai phép chiếu + nghịch đảo, danh mục tra cứu
  lib/sky-render.ts  trợ thủ vẽ canvas dùng chung cho bộ vẽ 3D: sprite sao, dải màu, nhãn chống chồng, danh sách vật thể bấm được
  lib/sky3d.ts       toán 3D: vector ENU, camera pinhole + nghịch đảo, cắt mặt phẳng gần, zoom quanh con trỏ (nghiệm kín), ma trận quay ΔLST, lưới mặt đất, nhấp nháy & vệt sao
  lib/sky3d-render.ts bộ vẽ phối cảnh: dải màu trời theo độ cao, sao/hành tinh kích thước góc thật, mặt đất + lưới khoảng cách + 3 lớp núi, vòng ngắm chọn
  lib/knowledge.ts   bảng tri thức tiếng Việt (hành tinh, cung, nhà, góc chiếu, nguyên tố, pha trăng, từ khoá ý định)
  lib/interpret.ts   bộ luận giải nội bộ (rule-based) theo ý định câu hỏi
  lib/ai.ts          gọi /api/ai-chat và cơ chế dự phòng
  lib/geocode.ts     tra toạ độ (Nominatim → Open-Meteo)
  components/        BirthForm, ChartWheel, ChartPanel, Sky3D (bản đồ sao 3D), ChatPanel
  data/              stars.json, constellations.json, deepsky.json (sinh bởi scripts/build-data.mjs)
api/
  _handler.js        xử lý Gemini + chẩn đoán dùng chung (Vercel Serverless + máy chủ dev)
  ai-chat.js         route POST /api/ai-chat
  health.js          route GET /api/health (đã có khoá chưa, model nào, ?probe=1 để gọi thử Google)
vercel.json          cấu hình Vercel: framework Vite, dist/, rewrite SPA, function ai-chat
server/index.mjs     máy chủ dev (Vite middleware) và chế độ --prod
scripts/build-data.mjs  sinh dữ liệu sao từ npm package d3-celestial
scripts/check-ai.mjs    chẩn đoán GEMINI_API_KEY / GEMINI_MODEL (`npm run check:ai`)
tests/ai-api.check.ts   kiểm chứng lớp API: chuẩn hoá khoá, mã lỗi, đổi model dự phòng, /api/health
```

## Deploy lên Vercel

Repo đã sẵn sàng cho Vercel (tĩnh + một serverless function):

1. Đẩy repo lên GitHub (nhánh hiện tại đã có `vercel.json`).
2. Trên [vercel.com](https://vercel.com): **Add New… → Project** → chọn repo → Vercel tự nhận framework Vite
   (build `npm run build`, output `dist/`, rewrite SPA và function `api/ai-chat.js` theo `vercel.json`).
3. Trong **Settings → Environment Variables** thêm `GEMINI_API_KEY` (lấy ở Google AI Studio),
   tuỳ chọn `GEMINI_MODEL`. Không thêm thì phần Hỏi AI tự dùng bộ luận giải nội bộ.
4. **Deploy** — trang tĩnh phục vụ từ `dist/`, còn `/api/ai-chat` chạy dưới dạng Vercel Function
   (khoá API chỉ tồn tại phía server, không lộ xuống client).

Cách khác bằng CLI: `npx vercel login` rồi `npx vercel --prod` tại thư mục repo (chọn framework Vite,
thêm biến môi trường bằng `npx vercel env add GEMINI_API_KEY`).

### Đã thêm key Gemini mà app vẫn báo “chưa có key — dùng bộ nội bộ”

Trang web gọi `GET /api/health` để biết máy chủ có khoá hay chưa. Nếu route này không tới được
(ví dụ rewrite SPA nuốt mất `/api/*`) thì giao diện sẽ báo “không gọi được /api/health” thay vì
đoán bừa là chưa có key. Kiểm tra theo thứ tự:

1. **Mở thẳng** `https://<tên-miền>/api/health` (thêm `?probe=1` để gọi thử Google).
   - Trả về `{"llm":"gemini",...}` → máy chủ đã nhận khoá, xem tiếp bước 3.
   - Trả về **HTML** (trang chủ) → request `/api/*` bị rewrite SPA nuốt; `vercel.json` trong repo
     đã chừa `/api/` bằng `"source": "/((?!api(?:/|$)).*)"`, hãy chắc chắn tệp này có trong commit đã deploy.
   - Trả về `"llm":"local-fallback"` → function không thấy biến `GEMINI_API_KEY`.
2. **Đúng môi trường + deploy lại**: biến khai trong *Settings → Environment Variables* phải tick
   đúng **Production** (và **Preview** nếu dùng preview), sau đó **Redeploy** — deploy cũ không tự nhận biến mới.
   Vercel → *Functions* → chọn function `api/health` → tab *Environment Variables* để xem biến đã vào function chưa.
3. **Khoá dùng được không**: `?probe=1` trả về `probe.ok=false` kèm mã lỗi rõ ràng
   (`GEMINI_BAD_KEY`, `GEMINI_API_DISABLED`, `GEMINI_KEY_RESTRICTED`, `GEMINI_QUOTA`,
   `GEMINI_MODEL_NOT_FOUND`…). Khoá dán kèm dấu ngoặc/khoảng trắng/xuống dòng đã được máy chủ tự
   chuẩn hoá, nhưng khoá bị **giới hạn HTTP referrer** thì không dùng được từ server — hãy tạo khoá
   không giới hạn referrer cho ứng dụng chạy phía máy chủ.
4. Chạy `npm run check:ai` ở máy local: khoá đúng hay sai sẽ lộ ra ngay trước khi deploy.

Khi Gemini trả lỗi, giao diện hiện nguyên văn lý do kèm gợi ý khắc phục, ví dụ:
`Mô hình lớn chưa sẵn sàng (GEMINI_API_KEY không hợp lệ (Google từ chối khoá). Dán lại khoá mới từ … )`.

### `npm warn allow-scripts … esbuild`

npm ≥ 11.16 (và npm 12, mặc định từ 07/2026) **không chạy script cài đặt của gói phụ thuộc** nếu
project chưa cho phép. esbuild cần `postinstall` để đặt binary vào `node_modules/esbuild/bin`, nên npm
in cảnh báo này ở mỗi lần `npm install`/`vercel build`. Dự án đã khai báo sẵn trong `package.json`:

```json
"allowScripts": { "esbuild": true }
```

Để dạng không ghim phiên bản nên khi Vite nâng esbuild không phải duyệt lại. Muốn kiểm tra còn gói
nào chưa duyệt: `npx npm@12 approve-scripts --allow-scripts-pending` (không in gì = đã sạch).
Cảnh báo này không làm hỏng build (esbuild vẫn lấy binary từ gói `@esbuild/<nền tảng>`), nhưng để
lại allowlist trong repo thì npm 12 chạy đúng như npm cũ.

## Nguồn dữ liệu & giấy phép

- **Sao, chòm sao, thiên thể sâu**: [d3-celestial](https://github.com/ofrohn/d3-celestial) (Olaf Frohn, MIT) — catalogue Hipparcos, đường nối 88 chòm sao, Messier/NGC.
- **Tính toán thiên văn**: [astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross, MIT).
- **Kiểm chứng natal**: 10 hành tinh, Cung Mọc, Thiên Đỉnh và nhà Whole Sign được kiểm chứng lại bằng chính [Swiss Ephemeris](https://github.com/aloistr/swisseph) (Dieter Koch, Alois Treindl).
- **Tra toạ độ**: OpenStreetMap Nominatim và Open-Meteo Geocoding.
- **Mô hình khí quyển**: khúc xạ theo Bennett G. G. (1982, *Journal of Navigation*); khối khí quyển theo Kasten F. & Young A. T. (1989, *Applied Optics*) — cả hai công thức công khai, hằng số đã nêu trong `src/lib/sky-visual.ts`.

## Miễn trừ trách nhiệm

Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế tư vấn y tế, tài chính hoặc pháp lý.
