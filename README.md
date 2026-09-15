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

2. **Bản đồ sao thực tế (bầu trời)**
   - 5.044 ngôi sao Hipparcos (tới cấp sao 6) với màu theo chỉ số B-V, 88 chòm sao có đường nối và **tên tiếng Việt**, 118 thiên thể sâu (Messier, NGC, Magellan, Tua Rua, Tổ Ong…), dải Ngân Hà, hoàng đạo 12 cung.
   - Hai chế độ xem: bầu trời theo **độ cao - phương vị** (tâm là thiên đỉnh) và **toàn cảnh xích kinh - xích vĩ**.
   - Kéo để di chuyển, lăn chuột/chụm hai ngón để zoom, chạy thời gian (±giờ/ngày, tốc độ 1 giờ → 1 tuần mỗi nhịp), xem bầu trời ở bất kỳ thời điểm nào.
   - Bấm vào sao/hành tinh/thiên thể để xem toạ độ, độ cao, phương vị, vị trí hoàng đạo và **hỏi AI về riêng đối tượng đó**.
   - Thẻ phụ: hành tinh đang thấy được, giờ mọc/lặn Mặt Trời - Mặt Trăng, hành tinh theo cung.

3. **Hỏi AI**
   - Hai lớp: gọi mô hình ngôn ngữ lớn qua `/api/ai-chat` nếu máy chủ có `OPENAI_API_KEY`, nếu không thì dùng **bộ luận giải nội bộ** chạy hoàn toàn trên trình duyệt (đọc đúng vị trí hành tinh, nhà, góc chiếu, sao cố định, transit, pha Mặt Trăng, giờ mọc/lặn).
   - Nhận diện ý định câu hỏi (tính cách, sự nghiệp, tình cảm, tài chính, sức khỏe, gia đình, học tập, di chuyển, vận hạn, tương hợp, sao cố định, bầu trời, giải thích khái niệm…), trả lời có dẫn chứng dữ liệu và phần gợi ý hành động kèm khuyến cáo.

4. **Biến thể bản đồ sao (mục 3b)**
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

5. **Hỏi đáp về biến thể**
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
  lib/sky.ts         danh mục sao + toán thiên văn: precession J2000→ngày, alt/az, hoàng đạo, Ngân Hà, sao cố định, mọc/lặn
  lib/knowledge.ts   bảng tri thức tiếng Việt (hành tinh, cung, nhà, góc chiếu, nguyên tố, pha trăng, từ khoá ý định)
  lib/interpret.ts   bộ luận giải nội bộ (rule-based) theo ý định câu hỏi
  lib/ai.ts          gọi /api/ai-chat và cơ chế dự phòng
  lib/geocode.ts     tra toạ độ (Nominatim → Open-Meteo)
  components/        BirthForm, ChartWheel, ChartPanel, VariantPanel, StarMap (canvas), ChatPanel
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

## Miễn trừ trách nhiệm

Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế tư vấn y tế, tài chính hoặc pháp lý.
