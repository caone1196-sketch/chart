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
