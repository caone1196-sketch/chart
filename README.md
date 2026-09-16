# Astral Chart VN

Web app tiếng Việt: **lập bản đồ sao (natal chart) → xem bản đồ bầu trời thực tế → đặt câu hỏi cho AI trả lời**.

## Tính năng

1. **Lập bản đồ sao natal**
   - Nhập ngày - giờ - nơi sinh; tra toạ độ tự động (Nominatim, dự phòng Open-Meteo) hoặc chọn nhanh thành phố, hoặc nhập tay.
   - Xác định offset lịch sử theo timezone IANA (kể cả DST) qua `Intl` + vòng lặp hiệu chỉnh.
   - Tính Mặt Trời, Mặt Trăng, 10 hành tinh (kể cả nghịch hành), AC/DC/MC/IC, góc chiếu (0°, 60°, 90°, 120°, 180°) kèm orb và trạng thái áp sát/tách.
   - **12 hệ thống chia nhà** (Whole Sign, Equal, Equal từ MC, Porphyry, Placidus, Koch, Campanus, Regiomontanus, Alcabitius, Topocentric, Morinus, Sripati) và **7 hệ hoàng đạo / ayanamsa** (nhiệt đới, Lahiri, Fagan-Bradley, Raman, Krishnamurti, De Luce, Ngân Hà) — chọn trực tiếp trong mục "Biến thể bản đồ sao", bản đồ tự lập lại.
   - **Điểm ảo**: Bắc/Nam giao điểm (trung bình và thật), Lilith, Chiron, Ceres, Pallas, Juno, Vesta, Eris, Sedna, 8 hành tinh giả định Hamburg (Cupido…Poseidon), Isis-Transpluto, Selena.
   - Cân bằng nguyên tố - tính chất, pha Mặt Trăng lúc sinh, sao cố định nằm gần các điểm natal (orb 1.5°), transit hiện tại lên bản đồ (orb 4°).

2. **Bản đồ sao thực tế (bầu trời)** — dựng lại theo hướng "trông như bầu trời thật" và "điều khiển dễ"
   - 5.044 ngôi sao Hipparcos (tới cấp sao 6) với màu theo chỉ số B-V, 88 chòm sao có đường nối và **tên tiếng Việt**, 118 thiên thể sâu (Messier, NGC, Magellan, Tua Rua, Tổ Ong…), hoàng đạo 12 cung.
   - **Khí quyển**: màu trời đổi theo độ cao Mặt Trời (đêm → chạng vạng → ngày), ráng chiều quanh phương vị Mặt Trời, khúc xạ khí quyển (Bennett 1982) nâng vật thể gần chân trời, hấp thụ làm mờ sao theo khối khí quyển (Kasten–Young 1989), ban ngày gần như không thấy sao.
   - **Ngân Hà** vẽ bằng ~1.670 đám mây sao và hạt sao phân giải được, có trung tâm sáng (Nhân Mã), nhánh phình Thiên Nga và **rãnh tối (Great Rift)**.
   - **Sao** có quầng sáng và tia nhiễu xạ theo cấp sao; **Mặt Trăng đúng pha** (hình dạng khuyết theo góc ly giác với Mặt Trời, quầng sáng theo độ được chiếu sáng).
   - **Mặt đất & ba dải núi** che phần bầu trời dưới chân trời (đúng phương vị, có phối cảnh khí quyển), vòng chân trời 8 hướng, nhãn tự tránh chồng nhau theo thứ tự ưu tiên.
   - Hai chế độ xem: bầu trời theo **độ cao - phương vị** (tâm là thiên đỉnh) và **toàn cảnh xích kinh - xích vĩ**.
   - **Điều khiển**: lăn chuột/chụm hai ngón **phóng to ngay tại con trỏ mà trang không bị cuộn theo** (listener `wheel` non-passive, chặn cả Ctrl + lăn; tốc độ zoom chuẩn hoá cho chuột rời, bàn rê và Firefox), nháy đúp để phóng to nhanh, kéo để dịch (bản đồ: kéo ngang đổi xích kinh, kéo dọc đổi xích vĩ), thanh trượt mức phóng, nút **Căn lại**, các nút đi nhanh (Bắc/Đông/Nam/Tây/Thiên đỉnh · Dải Ngân Hà và 4 vùng xích kinh), **ô tra cứu** sao - chòm - thiên thể - hành tinh (gõ được cả tên tiếng Việt không dấu như "sao thien lang", "bac cuc", "m42"), **đọc toạ độ ngay dưới con trỏ**, phím ←→↑↓ +/−/0, chế độ **theo giờ thực** và chạy thời gian (±giờ/ngày, 1 giờ → 1 tuần mỗi nhịp).
   - Bấm vào sao/hành tinh/thiên thể để xem toạ độ (cả J2000 và hệ của ngày), độ cao, phương vị, vị trí hoàng đạo, **đưa đối tượng vào giữa khung** và **hỏi AI về riêng đối tượng đó**.
   - Thẻ phụ: hành tinh đang thấy được, giờ mọc/lặn Mặt Trời - Mặt Trăng, hành tinh theo cung.

3. **Ngắm bầu trời 3D (khung nhìn phối cảnh)** — mục riêng, xem chi tiết trong `docs/ban-do-3d.md`
   - Chiếu thiên cầu qua **ống kính phối cảnh thật** (pinhole trên canvas 2D): chân trời là đường thẳng, vòng độ cao cong đúng thấu kính, kéo để nhìn quanh, lăn chuột phóng to quanh con trỏ, toàn màn hình.
   - **Mặt Trời/Mặt Trăng có bán kính góc thật** (≈0,26°) nên phóng to thì to ra như ống nhòm; Mặt Trăng đúng pha và đúng hướng sáng.
   - **Mặt đất phối cảnh**: lưới khoảng cách 3→900 m hội tụ về chân trời (mắt cao 1,65 m), ba lớp núi mờ dần theo chiều sâu che khuất bầu trời thấp.
   - **Khí quyển & ánh sáng**: màu trời theo độ cao Mặt Trời, ráng chiều, khúc xạ + hấp thụ gần chân trời, sao **nhấp nháy** mạnh dần khi xuống thấp.
   - **Thời gian mượt**: sao quay liên tục bằng ma trận ΔLST (không dựng lại catalogue mỗi khung hình); tua nhanh để thấy **vệt sao** như ảnh phơi sáng; tốc độ từ thời gian thực tới 6 giờ/giây.
   - **Hành tinh sống động**: đĩa có chi tiết (vân Sao Mộc + Vết Đỏ, vành đai Sao Thổ, chóp băng Sao Hỏa, xoáy mây Sao Kim…) kèm quầng màu riêng; tắt khí quyển thì địa hình đổi bảng màu trung tính để không hoá mặt phẳng trống.

4. **Hỏi AI**
   - Hai lớp: gọi mô hình ngôn ngữ lớn qua `/api/ai-chat` nếu máy chủ có `OPENAI_API_KEY`, nếu không thì dùng **bộ luận giải nội bộ** chạy hoàn toàn trên trình duyệt (đọc đúng vị trí hành tinh, nhà, góc chiếu, sao cố định, transit, pha Mặt Trăng, giờ mọc/lặn).
   - Nhận diện ý định câu hỏi (tính cách, sự nghiệp, tình cảm, tài chính, sức khỏe, gia đình, học tập, di chuyển, vận hạn, tương hợp, sao cố định, bầu trời, giải thích khái niệm…), trả lời có dẫn chứng dữ liệu và phần gợi ý hành động kèm khuyến cáo.

5. **Biến thể bản đồ sao (mục 3b)**
   - **Hệ nhà**: bảng 12 cusp cho từng hệ, so sánh 12 hệ cạnh nhau (ô sáng là nhà đổi so với hệ đang chọn), Vertex/East Point.
   - **Hệ hoàng đạo**: cung Mặt Trời - Mặt Trăng - Cung Mọc theo cả 7 hệ, ayanamsa hiển thị tới 4 chữ số thập phân.
   - **Điểm ảo**: 21 điểm (node, Lilith, tiểu hành tinh, TNO, hành tinh giả định) kèm ý nghĩa và nhà.
   - **Hình mẫu & hình dạng**: Stellium, Grand Trine, T-Square, Grand Cross, Yod, Kite, Mystic Rectangle, Thor's Hammer; 7 hình dạng bản đồ (Bó/Bát/Xô/Đầu máy/Bập bênh/Toả/Nan hoa) và ưu thế bán cầu.
   - **Hy Lạp cổ**: phái bản đồ (ngày/đêm), 8 Lots (Fortune, Spirit, Eros, Necessity, Courage, Victory, Nemesis, Basis), phẩm chất hành tinh (nhà/vượng/tam hợp/giới hạn/decan), nhà "niềm vui", hành tinh góc.
   - **Dự báo**: hồi quy Mặt Trời (tìm lần kế tiếp), hồi quy Mặt Trăng, tiến triển thứ cấp, Solar Arc, bản đồ Rồng (draconic), Nhật tâm, 5 bản đồ Hài hoà (H4/H5/H7/H9/H16).
   - **Vệ Đà (Jyotish)**: Rashi, 27 Nakshatra + pada, Navamsa và 5 varga đầu, Vimshottari Dasha (mahadasha + 9 antardasha), Panchang (tithi, vara, yoga, karana), ghi chú tổ hợp.
   - **Trung Hoa & Maya**: Tứ Trụ (4 trụ can chi, Nhật chủ, ngũ hành, Thập thần, Đại vận), Tử Vi Đẩu Số (12 cung, Ngũ Hành Cục, Mệnh/Thân chủ), lịch Maya (Tzolk'in, Haab, Long Count).
   - **Human Design**: 13 cổng Tính cách + 13 cổng Thiết kế, kênh, 9 trung tâm, kiểu người, thẩm quyền, hồ sơ, bóng tối/phần thưởng.
   - **Kiến thức biến thể**: 47 thẻ tra cứu theo 11 nhóm (Hệ nhà, Hệ hoàng đạo, Điểm & thiên thể, Hình mẫu, Cổ điển Hy Lạp, Dự báo, Quan hệ Synastry/Composite/Overlay, Vệ Đà, Trung Hoa & Maya, Hiện đại, Phái sinh) — mỗi thẻ có nguồn gốc, cách tính, cách đọc, dùng khi nào và lưu ý.

6. **Hỏi đáp về biến thể**
   - Bộ luận giải nội bộ nhận diện thêm nhóm ý định "biến thể bản đồ sao": hỏi theo tên biến thể (Placidus, ayanamsa, nakshatra, dasha, Tứ Trụ, Tử Vi, Human Design, Chiron, Grand Trine, synastry, tiến triển, hồi quy…) sẽ nhận giải thích kèm số liệu **của chính bản đồ bạn**: bảng nhà theo 12 hệ, cung theo 7 hệ hoàng đạo, dasha hiện tại, Tứ Trụ/Tử Vi, hình dạng bản đồ.
   - Báo cáo gửi mô hình ngôn ngữ lớn được mở rộng thêm toàn bộ phần biến thể, nên câu trả lời của LLM cũng dùng đúng dữ liệu này.

## Kiểm chứng số liệu

Các engine được kiểm chứng tự động với **Swiss Ephemeris** (`npm test`, fixture sinh từ mã C tham chiếu trong `tests/gen/`):

| Phần | Phạm vi so sánh | Sai số lớn nhất |
| --- | --- | --- |
| 12 hệ nhà | 728 mốc thời gian - vĩ độ, 42.952 điểm đo | 4,997 × 10⁻⁵ ° |
| 7 hệ hoàng đạo / ayanamsa | 366 mốc 1800-2100 | Lahiri/Fagan-Bradley 0,0002° · Raman/KP 0,0004° · Ngân Hà 0,0059° |
| Điểm ảo | 41 mốc 1900-2100 × 28 thiên thể | node trung bình 0,00015° · Lilith 0,115° · hành tinh giả định ≤ 0,007° · tiểu hành tinh 0,28-0,99° |
| Lớp biến thể | 7 hệ hoàng đạo × 12 hệ nhà, dasha/varga/Tứ Trụ/Tử Vi/Maya/HD | kiểm tra tính nhất quán (cusp ↔ nhà, ayanamsa ↔ cung) |
| Bản đồ sao (hiển thị) | 14.963 phép kiểm: khúc xạ/hấp thụ, phép chiếu & nghịch đảo, phóng to quanh con trỏ, **quy đổi lăn chuột & giới hạn dịch chuyển khung**, dựng khung 4 vĩ độ, Ngân Hà, pha Trăng, tra cứu | 0 lỗi (sai số nghịch đảo < 0,05°) |
| Bầu trời 3D | 1.510 phép kiểm: hình học camera phối cảnh (chân trời thẳng, nghịch đảo < 1e-6 px), zoom quanh con trỏ nghiệm kín, quay ΔLST khớp khung dựng lại ≤ vài phần triệu độ, cắt mặt phẳng gần, lưới mặt đất, vệt sao, pha hành tinh theo tam giác khoảng cách, lưới xích đạo; kèm **vẽ thật trên canvas** và so sánh điểm ảnh (tất định từng byte) | 0 lỗi |
| Giao diện bản đồ sao | 1 lần chạy jsdom: gắn giao diện, vẽ ≈133.000 lời gọi, mô phỏng lăn (khẳng định `preventDefault` để trang không cuộn + zoom đúng hướng)/kéo/bấm sao/đổi chế độ/tra cứu/bàn phím | 0 ngoại lệ, 0 console.error |
| Giao diện ngắm trời 3D | 1 lần chạy jsdom: gắn Sky3D, vòng rAF vẽ thật qua context giả, mô phỏng lăn chuột (không cuộn trang + trường nhìn đổi), kéo đổi hướng, phím cách tua, bấm chọn thiên thể → Hỏi AI → bỏ chọn, bật/tắt lớp, đổi ngày giờ, về giờ thực, toàn màn hình | 0 ngoại lệ, 0 console.error |

## Chạy dự án

```bash
npm install
npm run dev        # máy chủ dev (Vite + /api/ai-chat) — http://localhost:5173
npm run typecheck  # kiểm tra TypeScript
npm run build      # build ra dist/index.html (một tệp duy nhất)
npm run preview    # phục vụ dist/ kèm API route
npm run data       # sinh lại dữ liệu sao vào src/data/ từ gói npm d3-celestial
npm test           # toàn bộ kiểm chứng số liệu + bản đồ sao + giao diện
npm run test:sky   # mô hình hiển thị bầu trời (khúc xạ, phép chiếu, Ngân Hà, pha Trăng, tra cứu)
npm run test:ui    # chạy giao diện bản đồ sao trong jsdom và mô phỏng thao tác
npm run test:ui3d  # chạy giao diện ngắm trời 3D trong jsdom (lăn chuột/kéo/chọn thiên thể/đổi giờ)
npm run shot:sky   # render thử bản đồ ra PNG trong .cache/shots/ (cần @napi-rs/canvas)
npm run test:sky3d # hình học + bộ vẽ của khung ngắm 3D (kèm vẽ thật trên canvas Node)
npm run shot:sky3d # render 16 tình huống 3D ra PNG trong .cache/shots/
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
  lib/astro.ts       engine bản đồ sao: thời gian - múi giờ, hành tinh, nhà (theo hệ đã chọn), góc chiếu, transit, báo cáo gửi AI
  lib/mathx.ts       toán dùng chung (chuẩn hoá góc, chênh lệch góc, obliquity, Julian Day)
  lib/houses.ts      12 hệ thống chia nhà port từ swehouse.c, đã kiểm chứng Swiss Ephemeris
  lib/zodiac.ts      7 hệ hoàng đạo/ayanamsa, 27 nakshatra, 16 varga, Vimshottari dasha, panchang
  lib/points.ts      điểm ảo: node, Lilith, Chiron & tiểu hành tinh, TNO, hành tinh giả định Hamburg
  lib/patterns.ts    hình mẫu góc chiếu, hình dạng bản đồ, ưu thế bán cầu
  lib/hellenistic.ts Lots, phẩm chất hành tinh (dignity), phái bản đồ, nhà niềm vui
  lib/chinese.ts     Tứ Trụ (BaZi), Tử Vi Đẩu Số, lịch Maya
  lib/humandesign.ts Human Design: 64 cổng, 36 kênh, 9 trung tâm
  lib/variants.ts    bản đồ phái sinh: draconic, nhật tâm, harmonic, hồi quy, tiến triển, synastry/composite
  lib/chart-variants.ts  lớp tổng hợp biến thể + bảng so sánh hệ nhà/hệ hoàng đạo + báo cáo biến thể
  lib/variants-knowledge.ts 47 thẻ tri thức biến thể (nguồn gốc, cách tính, cách đọc, lưu ý)
  lib/sky.ts         danh mục sao + toán thiên văn: precession J2000→ngày, alt/az, hoàng đạo, toạ độ thiên hà, sao cố định, mọc/lặn
  lib/sky-visual.ts  mô hình hiển thị: khí quyển (khúc xạ, hấp thụ, màu trời), cấp sao → quầng sáng, mây sao Ngân Hà, địa hình, pha Trăng, hai phép chiếu + nghịch đảo, danh mục tra cứu
  lib/sky-render.ts  bộ vẽ canvas cho cả hai chế độ: nền trời, Ngân Hà, lưới, chòm sao, thiên thể sâu, sao, hành tinh - Trăng - Trời, mặt đất - núi, nhãn chống chồng, danh sách vật thể bấm được
  lib/sky3d.ts       toán 3D: vector ENU, camera pinhole + nghịch đảo, cắt mặt phẳng gần, zoom quanh con trỏ (nghiệm kín), ma trận quay ΔLST, lưới mặt đất, nhấp nháy & vệt sao
  lib/sky3d-render.ts bộ vẽ phối cảnh: dải màu trời theo độ cao, sao/hành tinh kích thước góc thật, mặt đất + lưới khoảng cách + 3 lớp núi, vòng ngắm chọn
  lib/knowledge.ts   bảng tri thức tiếng Việt (hành tinh, cung, nhà, góc chiếu, nguyên tố, pha trăng, từ khoá ý định)
  lib/interpret.ts   bộ luận giải nội bộ (rule-based) theo ý định câu hỏi
  lib/ai.ts          gọi /api/ai-chat và cơ chế dự phòng
  lib/geocode.ts     tra toạ độ (Nominatim → Open-Meteo)
  components/        BirthForm, ChartWheel, ChartPanel, VariantPanel, StarMap (canvas), Sky3D (khung ngắm phối cảnh), ChatPanel
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
- **Hệ nhà & điểm ảo**: công thức port từ [Swiss Ephemeris](https://github.com/aloistr/swisseph) (Dieter Koch, Alois Treindl) và được kiểm chứng lại bằng chính Swiss Ephemeris; phần tử quỹ đạo tiểu hành tinh lấy từ dịch vụ SBDB của JPL.
- **Tra toạ độ**: OpenStreetMap Nominatim và Open-Meteo Geocoding.
- **Mô hình khí quyển**: khúc xạ theo Bennett G. G. (1982, *Journal of Navigation*); khối khí quyển theo Kasten F. & Young A. T. (1989, *Applied Optics*) — cả hai công thức công khai, hằng số đã nêu trong `src/lib/sky-visual.ts`.

## Miễn trừ trách nhiệm

Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế tư vấn y tế, tài chính hoặc pháp lý.
