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
