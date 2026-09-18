# Soát lỗi toàn dự án — biên bản

Ngày soát: 16/09/2026 · phạm vi: toàn bộ `src/`, `tests/`, `scripts/` · nhánh `arena/01a0a510-chart`.

## 1. Cách soát

| Nhóm kiểm | Công cụ | Kết quả hiện tại |
| --- | --- | --- |
| 12 hệ chia nhà so với Swiss Ephemeris (ARMC 0–315° × vĩ độ −66…66°) | `npm run test:houses` | 42.952 điểm đo, sai số lớn nhất 4,997e-5° |
| 7 hệ hoàng đạo / ayanamsa | `npm run test:ayanamsa` | lệch < 0,05° (khác mô hình tuế sai) |
| Âm lịch Việt Nam 1900–2100 | `npm run test:lunar` | 32.874 phép so sánh khớp `amlich` (4 ngày sát nửa đêm đã kiểm riêng bằng chứng SE) |
| Điểm ảo (node, Lilith, tiểu hành tinh, hành tinh giả định) | `npm run test:points` | trong ngưỡng riêng từng điểm |
| Ví dụ 11/11/1996 00:30 (nam, Hà Nội) | `npm run test:example` | 216 phép so sánh khớp SE 2.10 |
| Tử Vi Đẩu Số (28 sao, cục, Tứ Hóa, Tứ Trụ) | `npm run test:tuvi` | 11.848 phép so sánh khớp thư viện `iztro`, 0 lệch |
| **Tính nhất quán giữa các màn hình** | `npm run test:consistency` | **18.522 phép kiểm, 0 lỗi** (bộ mới) |
| Soát mã bằng mắt + grep thói quen xấu | `as any`, `@ts-ignore`, TODO, toạ độ cứng, giờ máy vs UTC | 0 phát hiện |

## 2. Lỗi tìm được và đã sửa

### 2.1 Tiêu đề bảng "So sánh 12 hệ chia nhà" không đọc được
`VariantPanel` cắt nhãn hành tinh bằng `Planet.label.split(" ").pop()` nên 10 cột chỉ còn
`Trời · Trăng · Tinh · Tinh · Tinh · Tinh · Tinh · Vương · Vương · Vương` — không thể biết cột nào là hành tinh nào.
**Sửa:** thêm trường `glyph` (☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇) cho `PLANETS`, tiêu đề cột dùng ký hiệu + `title`,
kèm dòng chú giải và giải thích vì sao Whole Sign / Equal-MC / Morinus / Sripati cố ý không đặt cusp 1 ở Cung Mọc.

### 2.2 Chữ ký cung của cusp bị trừ ayanamsa hai lần
`cuspSigns` tính `signIndexOf(cusp − ayanamsa)` trong khi `cusps` **đã** quy về hệ đang chọn.
Ở hệ sidereal (Lahiri, Fagan/Bradley, Raman…) cả 12 nhãn cung sai khoảng một cung (ví dụ nhà 1 hiện "Cự Giải"
trong khi số hiển thị là "Sư Tử 7°00").
**Sửa:** dùng trực tiếp kinh độ cusp đã quy đổi. Kiểm chứng: `test:consistency` mục 3.

### 2.3 Nhà của điểm ảo sai khi chọn hệ hoàng đạo sidereal
`computeExtraPoints()` luôn trả kinh độ **nhiệt đới**, nhưng mã cũ so chúng với cusp **đã trừ ayanamsa**,
nên 18/21 điểm ảo rơi sai nhà (lệch đúng một nhà) khi bật hệ sidereal.
**Sửa:** tính nhà điểm ảo trên bộ cusp nhiệt đới (`houseSetRaw.cusps`). Kiểm chứng: `test:consistency` mục 1 (bất biến theo hệ quy chiếu).

### 2.4 Lá số Vệ Đà hiển thị hệ nhiệt đới khi để mặc định
Tab "Rashi · Nakshatra · Pada" ghi rõ "sidereal" nhưng `sidereal` map lại dùng ayanamsa của hệ **đang hiển thị**;
ở chế độ nhiệt đới (mặc định) ayanamsa = 0 → Mặt Trời hiện `Vrishchika` (Bọ Cạp nhiệt đới) thay vì `Tula` (Thiên Bình sidereal),
nakshatra và panchang cũng sai theo.
**Sửa:** lớp Jyotish luôn dùng ayanamsa sidereal — giữ chuẩn của hệ khi hệ đang chọn là sidereal, dùng Lahiri khi đang ở nhiệt đới —
và hiển thị rõ ayanamsa đang dùng. Kiểm chứng: `test:consistency` mục 2 (nhiệt đới ≡ Lahiri) + mục "đổi chuẩn ayanamsa thì dịch đúng bằng hiệu ayanamsa".

### 2.5 Alcabitius và Topocentric lệch 180° ngoài vòng cực
Với |vĩ độ| > 90° − ε (≈ 66,56°), Cung Mọc thật rơi vào nửa Tây; các hệ Placidus/Koch/Campanus/Regiomontanus
đã xử lý (đổi 180° hoặc chuyển Porphyry) nhưng Alcabitius và Topocentric thì không, nên cusp 1 trả về **Descendant**:
tại vĩ độ −70° app cho cusp 1 = 59,27° trong khi Swiss Ephemeris cho 239,27° (đúng bằng Cung Mọc).
**Sửa:** hai hệ này cũng chuyển sang Porphyry kèm ghi chú khi ra ngoài vòng cực, giống Placidus/Koch.
Kiểm chứng: `test:consistency` mục 5 (cusp 1 = Cung Mọc ở mọi vĩ độ −89,9°…89,9°).

### 2.6 Ghi chú "hệ nhà đã bị thay thế" bị bỏ đi
`computeHouses` tạo `note` khi phải thay hệ (Placidus ngoài vòng cực…), nhưng `calculateChart` không chuyển tiếp
và giao diện không hiển thị → người dùng nhận số liệu Porphyry mà tưởng là Placidus.
**Sửa:** thêm `ChartData.houseNote` / `VariantChart.houseNote`, hiện cảnh báo vàng ở bảng 12 nhà, bảng so sánh hệ nhà,
và trong báo cáo gửi cho AI.

### 2.7 Tiêu đề bảng nhà ghi cứng "Whole Sign"
`ChartPanel` luôn ghi "12 nhà (Whole Sign)" dù người dùng đã chọn hệ khác.
**Sửa:** lấy nhãn từ `HOUSE_SYSTEMS` theo `chart.houseSystem`.

## 3. Bất biến đã được khoá bằng test (`npm run test:consistency`)

1. Nhà của một điểm là hình học trên trời → đổi hệ hoàng đạo (7 hệ × 12 hệ nhà × 4 lá số) không được đổi nhà.
2. Lá số Vệ Đà: ở hệ nhiệt đới phải cho **đúng cùng** rashi/nakshatra/pada/nhà như ở Lahiri; khi đổi sang chuẩn ayanamsa khác,
   kinh độ phải dịch đúng bằng hiệu ayanamsa.
3. `cuspSigns[i]` phải trùng cung chứa `cusps[i]`.
4. Hàng của hệ đang chọn trong bảng so sánh phải trùng số nhà ở bảng hành tinh chính.
4b. Ký hiệu hành tinh dùng làm tiêu đề cột phải có đủ và không trùng nhau.
5. cusp 1 của mọi hệ (trừ Whole Sign / Equal-MC / Morinus / Sripati) phải trùng Cung Mọc ở mọi vĩ độ.
6. Không có `NaN`/`Infinity` trong dữ liệu đưa lên giao diện (kể cả vĩ độ 89,9°).
7. Hệ nhà không xác định ngoài vòng cực phải sinh ghi chú, và ghi chú đó phải xuất hiện trong báo cáo.

## 4. Điều vẫn cần lưu ý (không phải lỗi, nhưng là giới hạn)

- Bảng so sánh hệ nhà **không** đổi theo hệ hoàng đạo: cusp 1 hiển thị ở hệ đang chọn (nhiệt đới hoặc sidereal).
- Nhánh Alcabitius/Topocentric ngoài vòng cực dùng Porphyry thay thế (Swiss Ephemeris có thuật toán riêng cho vùng cực);
  app ghi chú rõ thay vì tự nghĩ ra số.
- Tiểu hành tinh (Ceres…Vesta) và hành tinh giả định dùng mô hình Kepler 2 vật thể: sai số tới ~1° (Juno) so với SE — đã có ngưỡng riêng trong `test:points`.
- Trụ **tháng** của Tứ Trụ (app, theo tiết khí) và của `iztro` (theo tháng âm lịch) khác quy ước nên `test:tuvi` không so trụ tháng.

---

# Soát lỗi phần phóng to – thu nhỏ bản đồ sao — biên bản lần 2

Ngày soát: 15/09/2026 · phạm vi: `src/components/StarMap.tsx`, `src/lib/sky-visual.ts` (nhóm điều khiển khung nhìn),
`tests/sky.check.ts`, `tests/ui-smoke.mjs` · nhánh `arena/01a0a6c4-chart`.
Lỗi người dùng báo: **lăn chuột để phóng to bản đồ thì cả trang bị kéo đi theo**.

## 5. Lỗi tìm được và đã sửa

### 5.1 Lăn chuột vừa zoom vừa cuộn cả trang (lỗi được báo)
`StarMap` gắn zoom qua prop `onWheel` của React. React 19 đăng ký `wheel`/`touchstart`/`touchmove`
ở **gốc ứng dụng với `passive: true`**, nên `preventDefault()` trong handler bị bỏ qua (dev còn in cảnh báo
"Unable to preventDefault inside passive event listener"); ở đây handler thậm chí không gọi `preventDefault()`.
Kết quả: mỗi nấc lăn vừa đổi `view.zoom` vừa để trình duyệt cuộn trang (càng khó chịu vì `html { scroll-behavior: smooth }`
làm trang trượt êm), bản đồ "chạy" khỏi con trỏ.
**Sửa:** bỏ `onWheel`, tự gắn listener native trong `useEffect` với `canvas.addEventListener("wheel", handler, { passive: false })`
và gọi `event.preventDefault()` khi `event.cancelable`. Nhờ vậy cũng chặn luôn **Ctrl + lăn** (cử chỉ chụm hai ngón trên bàn rê)
không cho trình duyệt zoom cả trang. Kiểm chứng: `test:ui` — `event.defaultPrevented` phải `true` cho 5 tình huống lăn.

### 5.2 Tốc độ zoom phụ thuộc trình duyệt và thiết bị
Hệ số cũ cố định `1.14`/`0.88` cho **mỗi sự kiện**, không đọc độ lớn `deltaY`:
chuột rời (1 nấc = 1 sự kiện) thì vừa phải, nhưng bàn rê gửi hàng chục sự kiện nhỏ mỗi lần lướt → zoom nhảy vọt mất kiểm soát;
Firefox gửi `deltaMode = 1` (đơn vị dòng, ±3 mỗi nấc) nên cùng một nấc lăn lại zoom khác Chrome/Safari (`deltaMode = 0`, ±100…±120).
**Sửa:** thêm hàm thuần `wheelZoomFactor()` trong `sky-visual.ts`: chuẩn hoá `deltaMode` (dòng ×32, trang ×800),
ánh xạ hệ số theo hàm mũ `2^(−nấc/5)` → một nấc ≈ 1,15×, năm nấc ≈ 2×, đối xứng phóng/thu,
kẹp mỗi sự kiện trong `[1/2,4 ; 2,4]` để delta cực lớn (chuột gaming, quán tính bàn rê) không nhảy cóc,
`deltaY = 0` thì giữ nguyên, `deltaY` không hữu hạn (môi trường giả lập) coi như một nấc lăn lên.
Kiểm chứng: `test:sky` nhóm 7b (hướng, đối xứng, độ nhạy chuẩn, Firefox ≈ Chrome, kẹp, đơn điệu, Ctrl + lăn).

### 5.3 Zoom sát mép khung làm "trôi" bầu trời ra ngoài màn hình
Khi kéo, `view.x/y` được kẹp trong ±0,85 cạnh khung, nhưng `zoomAroundPoint()` (chế độ chân trời) thì **không kẹp**:
mỗi lần phóng, phần dịch chuyển bị nhân thêm đúng hệ số phóng, nên chỉ vài nấc lăn với con trỏ ở sát góc khung
đã đẩy tâm bầu trời ra xa hàng nghìn điểm ảnh (đo được 913,7px / 524,4px ở khung 900×520, vượt trần 765 / 442);
thu nhỏ lại chỉ thấy nền trống và phải bấm "Căn lại" mới lấy lại được trời.
**Sửa:** thêm `HORIZON_PAN_LIMIT` + `clampPan()` (chặn luôn `NaN`/`Infinity`) và kẹp trong `zoomAroundPoint()`,
`handlePointerMove` dùng lại chính hàm đó để kéo và zoom cùng một giới hạn.
Kiểm chứng: `test:sky` nhóm 7b — 24 nấc zoom liên tiếp sát góc khung không vượt giới hạn, và kịch bản phải thật sự chạm phần kẹp.

### 5.4 Chụm hai ngón vừa phóng vừa giật khung
Trên màn hình cảm ứng, `pointerdown`/`pointermove` và `touchstart`/`touchmove` cùng bắn: `handleTouchStart` huỷ `dragRef`
khi có 2 ngón nhưng `pointerdown` của ngón thứ hai lại đặt mốc kéo mới → bản đồ vừa pinch-zoom vừa bị kéo giật theo một ngón.
Khi nhấc một ngón, mốc kéo cũ còn sót lại làm khung nhìn "nhảy" một đoạn dài.
**Sửa:** `handlePointerMove` bỏ qua kéo khi `pinchRef.current` đang hoạt động; `touchstart` với < 2 ngón thì xoá pinch;
`touchend`/`touchcancel` xoá cả pinch lẫn mốc kéo.

### 5.5 Bắt giữ con trỏ có thể ném lỗi, làm chết thao tác kéo
`event.currentTarget.setPointerCapture(event.pointerId)` gọi thẳng, không bảo vệ: môi trường không cài API này
(jsdom — `test:ui` phải tự vá prototype) hoặc `pointerId` đã huỷ sẽ ném `TypeError`/`NotFoundError` ngay giữa lần kéo.
**Sửa:** gói vào `capturePointer()` kiểm tra API + `pointerId` hữu hạn + `try/catch`, và **nhả** bắt giữ ở
`pointerup`/`pointercancel` (trước đây chỉ bắt, không nhả).

### 5.6 Hai công thức thang đo cho cùng một phép chiếu
Kéo ở chế độ toàn cảnh tự nhân `previous.zoom * ((size.height || size.width) * 0.96 / 182)` thay vì gọi `mapScale()`
như phép chiếu → chỉ cần đổi một chỗ là kéo lệch zoom (bản đồ dịch sai số độ/điểm ảnh).
**Sửa:** dùng `mapScale(size.width, size.height, previous.zoom)`, kèm chắn `scale > 0`.

### 5.7 `test:ui` chập chờn và không soi đúng lỗi
Bài kiểm tra chờ cứng `await wait(120)` rồi mới đếm lời gọi vẽ, trong khi lần vẽ đầu (5.044 sao + Ngân Hà) trong jsdom
nặng hơn nhiều → chạy ra **6 lỗi giả** ("họa tiết vẽ quá ít lời gọi (0)") dù tổng vẫn ~64.000 lời gọi.
Sự kiện lăn chuột lại được tạo bằng `new MouseEvent("wheel", { deltaY: -120 })` — `MouseEvent` **không có** `deltaY`,
nên thực chất test đang lăn với `deltaY = undefined`, và không hề kiểm tra trang có bị cuộn hay không.
**Sửa:** chờ bằng `waitForPaint()` (poll tới khi canvas vẽ đủ, tối đa 30 s); lăn bằng `new WheelEvent(...)` thật
với `deltaY`/`deltaMode`/`ctrlKey`; khẳng định `defaultPrevented` (trang không cuộn), mức phóng hiển thị **tăng khi lăn lên /
giảm khi lăn xuống**, `deltaMode = 1` và Ctrl + lăn cũng bị chặn, `deltaY = 0` không đổi mức phóng;
trả khung nhìn về mặc định (phím `0`) trước khi bấm chọn sao để toạ độ sao do `__skyTest` tính sẵn còn đúng.

### 5.8 Kéo chậm thì bản đồ đứng im, nhả tay lại bị coi là một cú bấm
`handlePointerMove` xét ngưỡng "đã kéo" trên **độ dời của từng sự kiện** (`|dx| + |dy| > 3`) trong khi `drag.x/y`
được cập nhật ngay sau đó, nên mỗi sự kiện lại "quên" quãng đã đi: kéo chậm (1–2px mỗi sự kiện — chuột tần số cao,
bàn rê, người kéo từ tốn) không bao giờ vượt ngưỡng. Đo trong jsdom: kéo 40 sự kiện × 1px → bản đồ dịch **0px**,
và khi nhả tay bị xử lý như một cú bấm → chọn/bỏ chọn sao ngoài ý muốn.
**Sửa:** ngưỡng đo từ `startX/startY` (điểm bấm xuống, `Math.hypot > 3`); khi vượt ngưỡng thì kéo "bù" luôn phần
dưới ngưỡng (`drag.x = drag.startX`) để bản đồ bám sát con trỏ, không hụt 3px đầu tiên.
Kiểm chứng: `test:ui` — kéo 40×1px phải làm toạ độ dưới con trỏ đổi; chạy lại đúng mã cũ thì test báo
"kéo chậm 40×1px không dịch bản đồ (toạ độ vẫn cao 64,2° · Đông Nam 119,2°)".

### 5.9 Nút phải và nút giữa chuột cũng kéo bản đồ / chọn sao
`handlePointerDown` không đọc `event.button`: bấm phải vẫn bắt đầu kéo trong khi trình duyệt mở menu ngữ cảnh,
bấm giữa bật chế độ "cuộn tự động" (Windows/Chrome) rồi kéo lung tung; `handlePointerUp` cũng chọn sao bằng nút phải.
**Sửa:** chỉ nhận `button === 0` khi `pointerType === "mouse"` (chạm và ngòi bút vẫn nhận bình thường), ở cả down lẫn up.

### 5.10 Canvas điều khiển được bằng bàn phím nhưng "vô danh" với trình đọc màn hình
`<canvas tabIndex={0}>` có hẳn bộ phím tắt (←→↑↓, +/−, 0) nhưng không có tên truy cập → trình đọc màn hình chỉ báo "canvas".
**Sửa:** thêm `role="img"` + `aria-label` mô tả cách kéo, phóng to và phím tắt.

### 5.11 Rà lại mà **không** phải lỗi: cử chỉ chạm không cần `preventDefault`
React cũng gắn `touchstart`/`touchmove` ở chế độ passive, nhưng khung canvas đã có `touch-action: none`
(lần này thêm cho cả thẻ bao ngoài + `overscroll-contain`) nên trình duyệt không giành cử chỉ vuốt/chụm →
không xảy ra lỗi "cuộn trang" như ở phần lăn chuột. Chỉ riêng `wheel` là bắt buộc phải dùng listener non-passive.

## 6. Bất biến mới được khoá bằng test

| Bất biến | Test |
| --- | --- |
| Mọi sự kiện `wheel` trên canvas phải bị `preventDefault` (trang không cuộn, trình duyệt không zoom trang) | `test:ui` (jsdom có tôn trọng `passive`, nên listener passive sẽ bị phát hiện) |
| Lăn lên phóng to / lăn xuống thu nhỏ, mức phóng hiển thị đổi đúng hướng | `test:ui` |
| `wheelZoomFactor` đối xứng, đơn điệu theo `|delta|`, chuẩn hoá `deltaMode`, kẹp hệ số mỗi sự kiện | `test:sky` 7b |
| Dịch chuyển khung chân trời không bao giờ vượt `HORIZON_PAN_LIMIT`, kể cả khi zoom dồn dập sát mép | `test:sky` 7b |
| Zoom quanh con trỏ vẫn giữ nguyên điểm dưới con trỏ ở cả 2 chế độ (bất biến cũ, còn nguyên) | `test:sky` 7 |
| Kéo chậm 1px/sự kiện vẫn phải dịch bản đồ (toạ độ dưới con trỏ đổi) | `test:ui` |
| Kéo ở chế độ Toàn cảnh phải đổi xích kinh/xích vĩ của tâm khung (khoá công thức `mapScale`) | `test:ui` |
| Bấm vào sao phải mở bảng thông tin **đúng tên sao đó** | `test:ui` |
| Đọc DOM trong test phải sau khi React commit (chờ rồi mới đọc), nếu không sẽ so với giá trị cũ | `test:ui` |

Kết quả sau khi sửa: `npm test` → 12 hệ nhà · ayanamsa · âm lịch · điểm ảo · biến thể · Tử Vi · nhất quán 18.522 ·
**sky 14.963** · **ui ≈133.000 lời gọi vẽ** · ví dụ 1996 — tất cả 0 lỗi; `npm run typecheck` và `npm run build` sạch.

## 7. Giới hạn còn lại (có chủ ý, không phải lỗi)

- Con lăn chuột **luôn** thuộc về bản đồ khi con trỏ nằm trên khung (kể cả khi đã zoom tới trần/sàn):
  đó chính là yêu cầu "không kéo cả trang". Muốn cuộn trang thì đưa con trỏ ra ngoài khung canvas
  hoặc dùng thanh cuộn/bàn phím; khung chỉ cao 26–34 rem nên không "nhốt" được trang.
- `touch-none` trên khung giữ cử chỉ chụm/kéo cho bản đồ (như trước), nghĩa là vuốt trên khung không cuộn trang trên điện thoại.
- Giới hạn dịch chuyển ±0,85 cạnh khung là hằng số theo khung, không đổi theo mức phóng (giữ nguyên hành vi kéo cũ):
  ở zoom nhỏ vẫn có thể kéo vòm trời lệch hẳn sang một bên, nhưng nút **⟲ Căn lại** và phím `0` luôn đưa về khung mặc định.

## 8. Lượt soát 16/09/2026 (chiều) — npm allow-scripts & khoá Gemini trên Vercel

Hai vấn đề người dùng báo: (1) mỗi lần `npm install`/`vercel build` có cảnh báo
`npm warn allow-scripts … esbuild@0.27.7 (postinstall: node install.js)`; (2) thêm `GEMINI_API_KEY` trên
Vercel nhưng app vẫn báo "chưa có key — dùng bộ nội bộ".

### 8.1 Cảnh báo allow-scripts của npm: gói phụ thuộc không chạy được script cài đặt

**Nguyên nhân:** npm ≥ 11.16 (và npm 12, mặc định từ 07/2026) **không chạy** `preinstall`/`install`/
`postinstall` của gói phụ thuộc nếu project chưa cho phép trong `package.json`; `npm install` chỉ in cảnh báo
rồi vẫn thoát 0, nên lỗi im lặng tới lúc chạy mới lộ. esbuild là gói duy nhất trong cây phụ thuộc cần script
(`fsevents` cũng có `node-gyp rebuild` nhưng chỉ dành cho macOS và `os: ["darwin"]`).

**Sửa:** thêm `"allowScripts": { "esbuild": true }` vào `package.json` (để dạng **không ghim phiên bản** để
Vite nâng esbuild không phải duyệt lại; npm mặc định ghim `esbuild@0.27.7`). Đồng thời khai báo thẳng
`esbuild` trong `devDependencies` vì các script `test:*` gọi binary này trực tiếp — trước đây nó chỉ có nhờ
Vite kéo về, tức là phụ thuộc vào cách npm dedupe.

Kiểm chứng: `npx npm@12 approve-scripts --allow-scripts-pending` → không in gì (sạch);
`npm run test:ai`, `npm run build` chạy bình thường với binary esbuild lấy từ gói `@esbuild/linux-x64`.

### 8.2 "Thêm key Gemini trên Vercel không nhận" — ba lỗi chồng nhau

**Nguyên nhân 1 — thiếu route `/api/health`.** `App.tsx` hỏi `/api/health` để biết máy chủ có khoá chưa,
nhưng route này **chỉ tồn tại trong `server/index.mjs`**, không có tệp nào trong `api/`. Trên Vercel, request
rơi vào rewrite SPA và nhận về `index.html` với HTTP 200 → `response.json()` ném lỗi → hàm `.catch` cũ đặt
`serverLlm = "local"` → giao diện luôn hiện "chưa có key — dùng bộ nội bộ" **dù khoá đã có và hợp lệ**.
**Sửa:** thêm `api/health.js` dùng chung `healthHandler` với máy chủ dev; trả về đã có khoá chưa, độ dài khoá,
model đang dùng, và `?probe=1` để gọi thử Google (ListModels) nhằm biết khoá có **thực sự** dùng được.
Không trả về bất kỳ ký tự nào của khoá.

**Nguyên nhân 2 — rewrite SPA nuốt luôn `/api/*`.** `vercel.json` cũ đặt `{"source": "/(.*)",
"destination": "/index.html"}`. Kiểm tra bằng chính thư viện Vercel dùng lúc build
(`@vercel/routing-utils` → `getTransformedRoutes`): route sinh ra là `^/(.*)$` và **khớp cả `/api/ai-chat`
lẫn `/api/health`**. **Sửa:** `{"source": "/((?!api(?:/|$)).*)", "destination": "/index.html"}`; biên dịch lại
cho ra `^/((?!api(?:/|$)).*)$`: `/`, `/api-key`, `/abc/def` → `index.html`;
`/api`, `/api/`, `/api/ai-chat`, `/api/health` → đi thẳng tới function. Kèm `Cache-Control: no-store` cho `/api/*`.

**Nguyên nhân 3 — lỗi thật bị che thành một câu chung chung.** `GEMINI_MODEL` mặc định cũ là
`gemini-2.5-flash` (dòng 2.5, 06/2025) trong khi dòng hiện hành là Gemini 3.x; model bị khai tử/chưa mở
trả về 404 mà mã cũ gộp hết thành "Lỗi khi gọi Gemini." kèm mã `GEMINI_NETWORK`. **Sửa:** mặc định
`gemini-3.8-flash` + chuỗi dự phòng `gemini-flash-latest` → `gemini-3.6-flash` → `gemini-2.5-flash`
(chỉ đổi model khi lỗi thuộc về model), dịch lỗi Google sang tiếng Việt kèm việc cần làm
(`GEMINI_BAD_KEY`, `GEMINI_API_DISABLED`, `GEMINI_KEY_RESTRICTED`, `GEMINI_QUOTA`, `GEMINI_MODEL_NOT_FOUND`,
`GEMINI_EMPTY`, `GEMINI_TIMEOUT`, `GEMINI_NETWORK`), và nâng `maxOutputTokens` 1024 → 4096 vì model dòng 3
tính cả token suy luận vào hạn mức (câu trả lời dễ bị cụt thành rỗng).

> **Cập nhật 16/09/2026:** bỏ model `gemini-3.8-flash` và toàn bộ chuỗi dự phòng — app chỉ dùng
> đúng một model `gemini-3.6-flash` (`DEFAULT_MODEL`, `MODEL_FALLBACKS = []`). Model 404 → trả
> `GEMINI_MODEL_NOT_FOUND` kèm hướng dẫn kiểm tra `/api/health?probe=1`, không thử model khác.

**Phụ:** khoá dán kèm dấu ngoặc, kèm tiền tố `GEMINI_API_KEY=` hoặc lẫn khoảng trắng/xuống dòng nay được
chuẩn hoá (`normalizeApiKey`) và `/api/health` báo cờ `hadWhitespace`; giao diện phân biệt ba trạng thái
"chưa có key" · "Gemini đã sẵn sàng" · "không gọi được /api/health" thay vì gộp hai trạng thái cuối làm một.

### 8.3 Bất biến mới được khoá bằng test

| Bất biến | Test |
| --- | --- |
| Chuẩn hoá khoá: cắt khoảng trắng, bỏ `"…"`/`'…'`, bỏ tiền tố `GEMINI_API_KEY=`, gỡ xuống dòng | `npm run test:ai` |
| `/api/health` không bao giờ chứa nội dung khoá (chỉ boolean + độ dài) | `npm run test:ai` |
| Lỗi Google được dịch đúng mã: khoá sai, chưa bật API, khoá bị giới hạn referrer, quota, model không tồn tại, 5xx, lỗi mạng | `npm run test:ai` |
| Chỉ một model duy nhất (`gemini-3.6-flash`): 404 → `GEMINI_MODEL_NOT_FOUND`, `modelsTried` chỉ có một model | `npm run test:ai` |
| Khoá sai **không** thử thêm model (tránh nhân số lần gọi lỗi) | `npm run test:ai` |
| Thiếu khoá thì không gọi mạng (0 request) và trả `NO_API_KEY` | `npm run test:ai` |
| `?probe=1` trả lời được "khoá dùng được chưa" + gợi ý model thay thế | `npm run test:ai` |
| Rewrite SPA không khớp `/api/*` (kiểm bằng `@vercel/routing-utils`) | thủ công, xem 8.2 |

Kết quả sau khi sửa: `npm test` → tất cả bộ cũ giữ nguyên 0 lỗi, thêm **test:ai 60 phép kiểm, 0 lỗi** (model duy nhất `gemini-3.6-flash`);
`npm run typecheck` và `npm run build` sạch.

## 9. Cách tự kiểm tra sau khi deploy

1. `npm run check:ai` ở máy: khoá đúng/sai, model nào đang mở cho project của khoá.
2. `https://<tên-miền>/api/health` → `{"llm":"gemini",…}` là function đã thấy biến môi trường.
3. `https://<tên-miền>/api/health?probe=1` → `probe.ok = true` là Google chấp nhận khoá.
4. Nếu (2) trả về **HTML**: biến hoặc rewrite chưa đúng — kiểm tra `vercel.json` có trong commit đã deploy,
   biến đã tick đúng môi trường **Production**, và đã **Redeploy** sau khi thêm biến (deploy cũ không tự nhận biến mới).

## 10. Lượt soát 17/09/2026 — vòng bản đồ sao bị cắt lẹm trên Android & nhiều khoá Gemini

Hai việc người dùng yêu cầu: (1) "lỗi bản đồ bị cắt lẹm" trên điện thoại Android — người dùng
xác nhận là **vòng bản đồ sao natal ở mục 3**, không phải bản đồ bầu trời 3D; (2) thêm khoá
Gemini 3.6 ở dạng **nhiều khoá trong biến môi trường máy chủ** (không dán khoá trong giao diện).

### 10.1 Vòng bản đồ sao bị cắt — bốn lỗi hình học chồng nhau

Bản cũ vẽ trong `viewBox 0 0 500 500` với tâm (250, 250) và **không có khái niệm vùng đệm**:
phần tử nào vượt quá `0…500` đều bị SVG gọt (mặc định `overflow: hidden`), mà trên khung hẹp
thì mép bị gọt lại rơi đúng vào chỗ mắt hay nhìn (đỉnh vòng, hai bên hông).

| # | Lỗi | Bằng chứng đo được | Sửa |
| --- | --- | --- | --- |
| 10.1.1 | Nhãn AC/DC/MC/IC gần như **biến mất**: đặt ở bán kính 232 rồi trừ tiếp 13 ở `y`, trong khi chữ 12px | Ca AC = 0° (đỉnh vòng): mép trên chữ ở `y = 250 − 232 − 13 − 9 = −4` → nằm ngoài khung | Nhãn nằm giữa vành hoàng đạo (bán kính 249), có **chip nền** và được tính bằng `pointBox()` |
| 10.1.2 | Đĩa hành tinh bị gọt khi lùi vào vành trong | Hải Vương tinh: tâm r = 134, đĩa 13 + huy hiệu R + nửa nét 1,2 → mép ~150,2 > giới hạn khung nhìn thấy được, vượt `viewBox` **3,3 đơn vị** | Vành trong cùng (r = 90) + bán kính đĩa 15,5 + vùng đệm 16 ở mọi mép |
| 10.1.3 | Vòng ngoài sát mép | r = 236 + nửa nét 0,75 = 236,75 trên nửa khung 250 → chỉ chừa **13,25 đơn vị** (5,3% → nhìn như bị "lẹm" khi khung bị bóp) | Vòng ngoài r = 280 trên nửa khung 300, chừa **20 đơn vị**, vùng an toàn bắt buộc 16 |
| 10.1.4 | Ký hiệu hành tinh là **chữ** ("Sun", "Moon"), rộng ~4em | Chữ "Moon" ở cỡ 13 tràn khỏi đĩa bán kính 13, chồng lên các hành tinh bên cạnh | Vẽ **glyph chiêm tinh** (☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ — trường `glyph` vốn đã có trong dữ liệu), rộng ~1em nên luôn nằm gọn trong đĩa |

### 10.2 Sửa gốc: hình học là dữ liệu, không phải toạ độ viết tay trong JSX

Toàn bộ hình học được tách ra `src/lib/wheel-geometry.ts` (khung 600×600):

- **Vành có tên và thứ tự cố định**: đĩa nền (284) → vành hoàng đạo [218…280] → số nhà (204) →
  hành tinh (178, mỗi bậc lùi 22, tối đa 5 vành) → vòng góc chiếu (72). Nét dày của vành được
  tính để **khớp khít** hai đường kẻ, không tràn ra ngoài.
- **Mọi thứ vẽ ra đều sinh ra hộp bao** (`boxes`), nên bài kiểm khẳng định được "không gì bị cắt"
  thay vì phải tin vào mắt người viết.
- **Đặt hành tinh không chồng** (`planetPlacement`): đi từ vành ngoài vào, ưu tiên giữ **đúng
  kinh độ thật**; khi vành đã kín thì nới dần sang hai bên theo bước 6° (tối đa ±90°), và
  khoảng cách góc tối thiểu giữa hai vành được giải bằng **định luật cosin** theo khoảng cách
  Euclid thật — nhờ vậy 10 hành tinh dồn trong 0° vẫn không đĩa nào chạm đĩa nào.
- **Vạch dẫn luôn chỉ đúng kinh độ thật**: ký hiệu có thể dịch để dễ đọc, nhưng vạch nối từ mép
  đĩa tới vành hoàng đạo vẽ theo kinh độ thật, và mỗi lần dịch đều sinh cảnh báo giải thích.
- **Chip nhãn góc không đè ký hiệu cung**: khi AC/DC/MC/IC rơi trúng giữa một cung, ký hiệu cung
  được dịch trong lòng cung của nó (±13°) — vẫn đọc đúng cung, không bị chip che.
- **Dữ liệu bẩn không phá hình vẽ**: `NaN`/`Infinity` quy về 0° thay vì lan ra toạ độ SVG.

### 10.3 Nhiều khoá Gemini: tự xoay khi khoá lỗi / hết quota

Trước đây chỉ có một khoá (`GEMINI_API_KEY`); hết quota là app rơi về bộ luận giải nội bộ dù còn
khoá khác trong tay.

- **Khai báo**: `GEMINI_API_KEYS=khoá1,khoá2,…` (ngăn cách bằng dấu phẩy / chấm phẩy / xuống dòng)
  hoặc `GEMINI_API_KEY` + `GEMINI_API_KEY_2…9` (cách cũ vẫn chạy y như trước). Khoá trùng bị gỡ.
  Thứ tự ưu tiên: `GEMINI_API_KEYS` → `GEMINI_API_KEY` → `GEMINI_API_KEY_2…9`.
- **Xoay khoá** (`isKeyRotationFailure`): chỉ xoay với lỗi **thuộc về khoá** — `GEMINI_BAD_KEY`,
  `GEMINI_KEY_RESTRICTED`, `GEMINI_QUOTA`, `GEMINI_MODEL_NOT_FOUND` (khoá có thể thuộc project
  khác) và `GEMINI_UPSTREAM` (Google lỗi tạm thời). Lỗi bộ lọc an toàn (`GEMINI_EMPTY`), quá thời
  gian hay mất mạng thì **không** xoay: xoay cũng vô ích mà chỉ nhân số lần gọi lỗi.
- **Model không đổi**: dù có bao nhiêu khoá, app vẫn chỉ gọi `gemini-3.6-flash`.
- **Không lộ khoá**: phản hồi chỉ có số thứ tự (`keyUsed`, `keyAttempts: [{key, code}]`, độ dài,
  4 ký tự cuối trong ghi chú), tuyệt đối không trả lại nội dung khoá — kể cả trong thông báo lỗi.
- **Chẩn đoán**: `/api/health` báo `keys.total/usable/sources/rotation`; `?probe=1` gọi thử
  **từng khoá song song** (tối đa 5 khoá, mỗi khoá 9 giây) và trả `probes` + `probeSummary`;
  `npm run check:ai` in trạng thái từng khoá ở dòng lệnh. Giao diện chat hiện
  "2/3 khoá dùng được (tự xoay)", danh sách kết quả từng khoá, và ghi chú khi máy chủ phải xoay khoá.

### 10.4 Bất biến mới được khoá bằng test

| Bất biến | Test |
| --- | --- |
| Mọi phần tử của vòng (kể cả nửa nét vẽ và hộp chữ) nằm trong khung, chừa ≥ 16/600 vùng đệm | `npm run test:wheel` |
| Không có `NaN`/`Infinity` trong SVG; dữ liệu bẩn quy về 0° | `test:wheel` |
| 10 hành tinh dồn trong 0° vẫn không đĩa nào chạm đĩa nào; vạch dẫn chỉ đúng kinh độ thật | `test:wheel` |
| Ký hiệu cung không chồng lên chip nhãn AC/DC/MC/IC; chip đủ lớn để đọc | `test:wheel` |
| Huy hiệu nghịch hành R nằm gọn trong đĩa | `test:wheel` |
| **Hình học cũ phải trượt đúng phép kiểm** (nhãn AC ở đỉnh vòng bị cắt) | `test:wheel` (khối đối chứng) |
| Gộp nhiều khoá: đúng thứ tự ưu tiên, khử trùng, chuẩn hoá, chỉ nhận `_2…_9` | `npm run test:ai` |
| Xoay khoá đúng lúc: khoá #1 sai/hết quota → gọi khoá #2 và trả lời; lỗi rỗng/mạng thì **không** xoay | `test:ai` |
| Mọi khoá hỏng → `keyAttempts` liệt kê từng khoá kèm mã lỗi, không kèm nội dung khoá | `test:ai` |
| `?probe=1` kiểm từng khoá song song, đếm đúng số khoá dùng được, tối đa 5 khoá | `test:ai` |
| `/api/health` không bao giờ chứa nội dung khoá (chỉ số lượng, độ dài, tên biến) | `test:ai` |
| Lớp AI phía trình duyệt đọc đúng payload nhiều khoá và tương thích payload một khoá cũ | `npm run test:health-ui` |
| `ChatPanel` hiện đúng "x/y khoá dùng được", nguồn khai báo, kết quả từng khoá và ghi chú xoay khoá | `test:health-ui` |

Kết quả sau khi sửa: `npm test` 13 bộ + `test:wheel` 2.066 phép kiểm + `test:health-ui` 38 phép kiểm —
tất cả 0 lỗi; `npm run typecheck` và `npm run build` sạch; ảnh kiểm bằng mắt ở
`.cache/shots/wheel-*.png` (900px và 360px) cho thấy vòng tròn trọn vẹn, không phần tử nào chạm
lưới vùng an toàn.

---

## 11. Lượt soát 18/09/2026 — “Máy chủ Google tạm thời lỗi (GEMINI_UPSTREAM)” làm mất câu trả lời của mô hình lớn

Ngày soát: 18/09/2026 · phạm vi: `api/_handler.js`, `src/lib/ai.ts`, `src/App.tsx`,
`src/components/ChatPanel.tsx`, `scripts/check-ai.mjs`, `.env.example` · nhánh `arena/01a0b487-chart`.

Lỗi người dùng báo (nguyên văn dòng trạng thái của giao diện), kèm kết luận của người dùng là “lỗi key api”:

> Mô hình lớn chưa sẵn sàng (Máy chủ Google tạm thời lỗi. Đã thử 1 khoá: khoá #1 (GEMINI_UPSTREAM).
> Thử lại sau ít phút.) — đã trả lời bằng bộ luận giải nội bộ chạy trong trình duyệt.

### 11.1 Chẩn đoán: đây KHÔNG phải lỗi khoá API

`GEMINI_UPSTREAM` chỉ sinh ra ở đúng một nhánh của `explainGeminiError()`: `status >= 500`. Lỗi thuộc về
khoá có mã riêng, không thể lẫn sang 5xx:

| Mã lỗi | HTTP | Ý nghĩa | Có phải lỗi khoá? |
| --- | --- | --- | --- |
| `GEMINI_BAD_KEY` | 400 | Google từ chối khoá (dán sai, thiếu ký tự) | có |
| `GEMINI_API_DISABLED` | 403 | Project chưa bật Generative Language API | có |
| `GEMINI_KEY_RESTRICTED` | 403 | Khoá bị giới hạn referrer/IP nên server không dùng được | có |
| `GEMINI_QUOTA` | 429 | Hết hạn mức theo phút/ngày của khoá (khoá vẫn hợp lệ) | một phần |
| `GEMINI_MODEL_NOT_FOUND` | 404 | Model không tồn tại / chưa mở cho project của khoá | có |
| **`GEMINI_UPSTREAM`** | **5xx** | **Máy chủ Google lỗi (hay gặp: `503 UNAVAILABLE — The model is overloaded`)** | **không** |
| `GEMINI_NETWORK` | 0 | Máy chủ không kết nối được tới Google | không |

Nghĩa là Google **đã nhận khoá**, đã bắt đầu sinh nội dung, rồi chính máy chủ của họ lỗi — tình huống rất
thường gặp với khoá free-tier vào giờ cao điểm và chỉ kéo dài vài giây.

### 11.2 Bốn khuyết điểm thật sự của mã cũ

1. **Một cú 5xx thoáng qua làm mất luôn câu trả lời của mô hình lớn.** `generateReply()` gọi Google đúng
   MỘT lần cho mỗi (khoá, model); không có bất kỳ cơ chế thử lại nào. `GEMINI_UPSTREAM` nằm trong
   `isKeyRotationFailure()` nên *có* xoay khoá — nhưng người dùng chỉ khai 1 khoá thì không còn khoá nào
   để xoay → thất bại ngay lập tức, rơi về bộ luận giải nội bộ.
2. **Thông báo đổ oan cho khoá.** `src/lib/ai.ts` ghép cụm “Đã thử N khoá: khoá #1 (MÃ)” cho MỌI mã lỗi,
   kể cả lỗi của máy chủ Google. Người đọc thấy chữ “khoá” + “GEMINI_…” thì kết luận “lỗi key api” và đi
   tạo khoá mới — việc hoàn toàn vô ích với 503.
3. **Không có cách thử lại.** Giao diện chỉ có nút “Gửi câu hỏi”: muốn hỏi lại phải gõ lại cả câu, trong
   khi câu trả lời nội bộ đã nằm trong hội thoại (và đã lưu vào `localStorage`).
4. **Không chẩn đoán được từ xa.** Thông báo không kèm mã HTTP lẫn số lần đã gọi; `npm run check:ai` chỉ
   gọi `ListModels` (không tốn quota sinh nội dung) nên vẫn xanh rờn trong lúc `generateContent` đang 503 —
   đúng tình huống khiến người dùng không biết tin vào đâu.

### 11.3 Đã sửa

**`api/_handler.js` (máy chủ)**
- Thêm `callGeminiWithRetry()`: tự gọi lại khi gặp lỗi **tạm thời** (`GEMINI_UPSTREAM` 5xx, `GEMINI_NETWORK`),
  chờ tăng dần `GEMINI_RETRY_BASE_MS × 2ⁿ` cộng jitter ≤ 250 ms, trần `GEMINI_RETRY_MAX_MS`, tối đa
  `GEMINI_MAX_ATTEMPTS` lần (mặc định 3) cho **mỗi** cặp (khoá, model).
- Trần thời gian cứng: `deadline = now + GEMINI_BUDGET_MS` (mặc định 45 s, nhỏ hơn `maxDuration: 60` trong
  `vercel.json`); mỗi lượt gọi chỉ được dùng phần quỹ còn lại (`min(TIMEOUT_MS, remaining)`), và không bắt
  đầu lượt mới nếu còn dưới `MIN_ATTEMPT_MS` = 4 s → function luôn kịp trả lời, không bị Vercel giết giữa chừng.
- `parseRetryDelayMs()` đọc đúng yêu cầu chờ của Google: header `Retry-After` (giây hoặc HTTP-date) và
  `error.details[].retryDelay` dạng `"12.5s"` (RetryInfo của `google.rpc`).
- 429 xử lý riêng: **còn** khoá khác thì xoay ngay (nhanh hơn ngồi chờ), **hết** khoá rồi mới chờ — và chỉ
  chờ khi Google báo chờ không lâu hơn `GEMINI_QUOTA_WAIT_MS` (mặc định 10 s; `0` = không bao giờ chờ).
- `explainGeminiError()` trả thêm `retryable`, `httpStatus`, `upstreamStatus`, `attempts`; thông báo 5xx nói
  thẳng “không phải lỗi khoá của bạn”, nêu `HTTP 503 · UNAVAILABLE`, và gợi ý bấm “Thử lại với Gemini”.
- `generateReply()` trả thêm `attempts` / `retries` / `retryNote`; `/api/ai-chat` chuyển lên client
  (502 kèm `retryable` + `httpStatus` + `attempts`, 200 kèm `retryNote` khi phải thử lại mới thành công).
- Thêm `GEMINI_MODEL_FALLBACKS` (**opt-in**, mặc định rỗng nên app vẫn chỉ dùng đúng một model như thiết kế
  cũ): khi model chính 5xx dai dẳng hoặc 404 thì thử model kế tiếp trước khi kết luận.
- `/api/health` in thêm khối `retry` (maxAttempts / các mốc chờ / budgetMs) để người dùng thấy app sẽ cố mấy lần.

**`src/lib/ai.ts` (trình duyệt)**
- Thêm kiểu `AskFailure` (kèm `retryable`, `httpStatus`, `attempts`) và `isRetryableCode()`.
- Chỉ nói “Đã thử N khoá: …” khi trong `keyAttempts` **thật sự** có mã thuộc về khoá
  (`GEMINI_BAD_KEY` / `GEMINI_API_DISABLED` / `GEMINI_KEY_RESTRICTED` / `GEMINI_QUOTA` / `GEMINI_MODEL_NOT_FOUND`);
  với 5xx thì nói “Đã gọi Google N lần bằng khoá #1 — lỗi thuộc về máy chủ Google, không phải lỗi khoá.”
- Đọc khối `retry` từ `/api/health` (payload máy chủ bản cũ không có → `null`, giao diện không vỡ).

**`src/App.tsx`**
- `ask(text, { retry })`: bấm thử lại thì **không** thêm lại câu hỏi vào hội thoại, và khi Gemini trả lời được
  thì **thay** câu trả lời nội bộ ở cuối hội thoại bằng câu trả lời Gemini (không nhân đôi, không phải gõ lại).
- Tiêu đề trạng thái phân biệt rõ “Gemini tạm thời gián đoạn (không phải lỗi khoá API)” / “Máy chủ chưa có
  khoá Gemini” / “Gemini đang bị giới hạn số yêu cầu”; chỉ lỗi `retryable` mới đặt `pendingRetry`.

**`src/components/ChatPanel.tsx`**
- Nút **“⟳ Thử lại với Gemini”** (chỉ hiện khi `canRetry`; đổi nhãn “Đang gọi lại Gemini…” khi đang chờ).
- Dòng trạng thái có tông màu (`warn` / `ok` / `info`) thay vì luôn vàng.
- Hộp thông tin bên trái nói rõ máy chủ tự thử lại tối đa mấy lần, trong bao nhiêu giây, và nhấn mạnh lỗi
  kiểu này “không phải lỗi khoá API”. Các prop mới đều **tuỳ chọn** nên nơi gọi cũ không phải đổi.

**`scripts/check-ai.mjs`**
- Thêm cờ `--ask` (`npm run check:ai -- --ask`): gọi thật `generateContent` qua chính `generateReply()` mà
  trình duyệt dùng, in số lần gọi / số lần thử lại / thời gian, rồi kết luận “lỗi TẠM THỜI phía Google
  (không phải lỗi khoá)” hay “lỗi KHÔNG thuộc nhóm tạm thời”. Đây là cách 30 giây để trả lời câu hỏi
  “lỗi này do khoá của mình hay do Google?”.
- In thêm cấu hình tự thử lại và model dự phòng ở khối “Cấu hình”.
- Probe hỏng không còn `process.exit(1)` ngay: vẫn in hết gợi ý và vẫn chạy `--ask`
  (ListModels hỏng vì mạng/5xx không có nghĩa là khoá sai).

### 11.4 Lỗi mới phát hiện nhờ viết test (đã sửa luôn trong lượt này)

Nhánh **lỗi mạng** (fetch ném exception) của `callGeminiWithRetry()` lúc mới viết chỉ kiểm quỹ thời gian mà
quên kiểm trần `GEMINI_MAX_ATTEMPTS`. Test giả lập “mất mạng hoàn toàn” đo được **1025 lời gọi** trong ~1,4 s
thay vì 3: trên Vercel, một đợt rớt mạng sẽ khiến function bắn hàng nghìn yêu cầu tới Google suốt 45 giây
rồi mới chịu trả lỗi. Đã thêm `attempts >= settings.maxAttempts` vào **cả hai** nhánh (5xx và lỗi mạng),
và giữ phép kiểm `networkDead.count() === 3` trong `tests/ai-api.check.ts` để lỗi này không quay lại.

### 11.5 Bất biến mới được khoá bằng test

| Bất biến | Test |
| --- | --- |
| 503 thoáng qua → vẫn có câu trả lời Gemini, không đổi khoá, không rơi về bộ nội bộ | `npm run test:ai` |
| 503 dai dẳng → gọi đúng `GEMINI_MAX_ATTEMPTS` lần, trả `retryable` + `httpStatus: 503` + `upstreamStatus` | `test:ai` |
| `GEMINI_MAX_ATTEMPTS=1` → hành vi giống hệt mã cũ (gọi đúng một lần) | `test:ai` |
| Rớt mạng → thử lại; mất mạng hoàn toàn → **đúng 3** lời gọi, không gọi vô hạn | `test:ai` |
| 429 + `Retry-After` ngắn + hết khoá → chờ rồi gọi lại; `Retry-After` dài → không ngồi chờ, nói rõ phải chờ bao lâu | `test:ai` |
| 429 khi **còn** khoá khác → xoay khoá ngay, không chờ (test cũ vẫn xanh) | `test:ai` |
| Backoff tăng dần, có trần, tôn trọng `Retry-After`, không vượt quỹ thời gian còn lại | `test:ai` |
| `GEMINI_BUDGET_MS` mặc định 45 s < `maxDuration` 60 s của Vercel Function | `test:ai` |
| `GEMINI_MODEL_FALLBACKS`: model chính 5xx dai dẳng → thử model dự phòng; không khai → vẫn đúng 1 model | `test:ai` |
| Payload (thành công lẫn lỗi) sau khi thử lại không bao giờ chứa nội dung khoá | `test:ai` |
| Lỗi 5xx lên giao diện: có `retryable`, nói “không phải lỗi khoá”, **không** nói “Đã thử 1 khoá” | `npm run test:health-ui` |
| Lỗi thuộc về khoá vẫn liệt kê từng khoá đã thử (hành vi cũ giữ nguyên) | `test:health-ui` |
| `ChatPanel` hiện nút “Thử lại với Gemini” khi `canRetry`, không hiện khi lỗi khoá; prop mới là tuỳ chọn | `test:health-ui` |

Kết quả sau khi sửa: `npm run test:ai` **190** phép kiểm (từ 113), `npm run test:health-ui` **61** phép kiểm
(từ 38), toàn bộ `npm test` 13 bộ 0 lỗi, `npm run typecheck` sạch.

### 11.6 Người dùng cần làm gì sau khi nhận bản sửa này

1. **Deploy lại** (Vercel không tự lấy mã mới): `git push` rồi redeploy, hoặc `npx vercel --prod`.
2. Không cần đổi khoá API — `GEMINI_UPSTREAM` không phải lỗi khoá. Muốn chắc: `npm run check:ai -- --ask`.
3. Muốn gần như không bao giờ bị rơi về bộ nội bộ: khai 2–3 khoá
   (`GEMINI_API_KEYS=khoá1,khoá2,khoá3`) và/hoặc `GEMINI_MODEL_FALLBACKS=gemini-3.5-flash`, rồi deploy lại.
4. Muốn app trả lời nhanh hơn bằng bộ nội bộ thay vì chờ Google: đặt `GEMINI_MAX_ATTEMPTS=1`
   (hành vi cũ) hoặc hạ `GEMINI_BUDGET_MS`.
