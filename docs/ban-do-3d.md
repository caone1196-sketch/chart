# Ngắm bầu trời 3D — khung nhìn phối cảnh

Mục **"3. Ngắm bầu trời 3D"** trong app (neo `#ban-do-3d`) là một khung nhìn *phối cảnh thật* của
thiên cầu, độc lập với hai chế độ 2D của Bản đồ sao. Cùng một dữ liệu thiên văn (Hipparcos,
astronomy-engine) nhưng thay vì phép chiếu phẳng, mọi thiên thể được coi là một **hướng 3D**
và chiếu qua ống kính pinhole.

## Vì sao trông "thật" hơn

| Yếu tố | Cách làm |
| --- | --- |
| Chân trời thẳng, vòng độ cao cong | Phép chiếu pinhole: hướng `d` → màn hình `(cx + f·d·right / d·forward, cy − f·d·up / d·forward)`. Mặt phẳng `alt = 0` cắt mặt ảnh thành **một đường thẳng** (`horizonY`), còn các vòng độ cao khác chiếu thành đường cong hội tụ đúng thấu kính. |
| Mặt Trời / Mặt Trăng to ra khi phóng to | Bán kính **góc thật** (≈0,26°) nhân `focal / depth` → ở trường nhìn 64° chúng là chấm nhỏ, ở 6° chúng là đĩa thật như nhìn qua ống nhòm. Pha Mặt Trăng vẽ đúng góc ly giác (phần tối → cung sáng → terminator ellipse). |
| Chiều sâu mặt đất | Mắt cao 1,65 m: vòng tròn bán kính `D` mét nằm ở độ cao `−atan(1,65/D)` → lưới 9 vòng (3→900 m) hội tụ về chân trời, kèm nan phương vị và cọc mốc "12 m / 96 m / 900 m". |
| Ba lớp núi che khuất | `terrainHeightDeg(az, lớp)` lấy mẫu 1°/bước, khối núi **đóng xuống đúng đường chân trời** nên không đè lưới mặt đất; lớp xa hoà vào màu trời (phối cảnh khí quyển), lớp gần sẫm nhất. |
| Khí quyển | Khúc xạ Bennett (chỉ hướng < 25°), hấp thụ Kasten–Young theo độ cao, màu trời theo độ cao Mặt Trời, ráng chiều và quầng sáng quanh phương vị Mặt Trời, mù tán xạ sát chân trời. |
| Hành tinh "sống động" | Mỗi hành tinh là một đĩa có chi tiết tất định: Sao Mộc năm dải mây + Vết Đỏ Lớn, Sao Thổ vành đai ba vòng (nửa sau vẽ trước đĩa, nửa trước đè lên sau), Sao Hỏa chóp băng + vùng tối, Sao Kim xoáy mây, Sao Thủy hố va chạm, Thiên Vương/Hải Vương dải mây và đốm tối; kèm quầng sáng ám màu riêng và tối viền (limb darkening) cho cảm giác hình cầu. Mặt Trời có nhật hoa tia mảnh xoay chậm theo thời gian. |
| Tắt khí quyển vẫn có địa hình | Khi tắt lớp khí quyển, mặt đất và ba lớp núi chuyển sang bảng màu trung tính (xám-xanh cố định, sống núi viền sáng) thay vì chìm vào trời đen — khung nhìn thành "trời vũ trụ + đất liền" chứ không hoá mặt phẳng trống; dải mù chân trời cũng tắt theo vì nó là hiệu ứng khí quyển. |
| Nhấp nháy & vệt sao | `scintillation(seed, t, alt)` nhiễu tất định mạnh dần khi sao xuống thấp; khi tua thời gian mỗi sao vẽ **cung tròn lớn** từ vị trí cũ tới vị trí mới (nội suy slerp) như ảnh phơi sáng. |
| Chuyển động mượt | Khung sao chỉ dựng lại mỗi ~4 phút mô phỏng; giữa hai lần dựng, toàn bộ sao quay bằng **ma trận Rodrigues quanh trục thiên cực theo ΔLST** — chính xác tuyệt đối và rẻ (~5.000 phép nhân), nên tua nhanh vẫn mượt 60 fps. Camera được *easing* mũ về đích (kéo/thả không giật). |

## Điều khiển

- **Kéo chuột / một ngón**: nhìn quanh ("nắm lấy trời" — kéo sang trái thì trời quay sang trái).
- **Lăn chuột / chụm hai ngón**: phóng to **quanh đúng điểm dưới con trỏ** (nghiệm kín, xem dưới);
  listener `wheel` non-passive + `preventDefault` nên trang không bị cuộn (bài học lượt soát lỗi 1).
- **Nháy đúp**: đưa thiên thể (hoặc hướng dưới con trỏ) vào giữa khung.
- **Bấm** vào sao / hành tinh / thiên thể sâu: thẻ thông tin (tên, cấp sao, độ cao, phương vị, pha
  Trăng) + nút **Hỏi AI** riêng cho đối tượng.
- **Bàn phím** (khung đang focus): ← → ↑ ↓ nhìn quanh, `+`/`−` phóng to/thu nhỏ, phím cách tua thời gian.
- **Thanh điều khiển**: Tua thời gian (thời gian thực → 6 giờ/giây), Về hiện tại, ô ngày giờ,
  thanh trượt trường nhìn (5°–110°), 12 nút bật/tắt lớp (chòm sao, Ngân Hà, hoàng đạo, lưới độ cao,
  lưới mặt đất, khí quyển, mặt đất, nhấp nháy, vệt sao…), nút **Toàn màn hình**.
- HUD: hướng la bàn + góc ngẩng + trường nhìn + số sao trong khung; giờ mô phỏng.

## Toán đáng chú ý (`src/lib/sky3d.ts`)

- **Phép chiếu & nghịch đảo**: `makeCamera3D` trả về `project / projectVector / inverse /
  radiusPixels / horizonY / degreesPerPixel`. Nghịch đảo khớp phép chiếu thuận < 1e-6 px
  (kiểm tra tự động).
- **Cắt mặt phẳng gần** (`PROJECT_NEAR = 0,02` ≈ 88,9° lệch trục): đường kẻ được cắt và chèn điểm
  ngay trên mặt phẳng cắt để chạy sát mép khung chứ không đứt đoạn hay vòng ngược.
- **Zoom quanh con trỏ — nghiệm kín**: với camera không roll, toạ độ camera của hướng
  `(alt a, az)` chỉ phụ thuộc `Δaz = az − yaw` và pitch `p`:
  `x_c = cos a·sin Δaz`, `y_c = sin a·cos p − cos a·sin p·cos Δaz`,
  `z_c = cos a·cos Δaz·cos p + sin a·sin p`.
  Đổi fov chỉ đổi `focal`, nên giữ nguyên vị trí màn hình ⇔ `(x_c, y_c, z_c)` đổi theo tỉ lệ focal.
  Phương trình 1 giải `Δaz` bằng arcsin (hai nhánh), hai phương trình sau là hệ tuyến tính theo
  `(cos p, sin p)`. Nhánh nhận phải có `z_c > NEAR` và pitch trong giới hạn; khi **vô nghiệm**
  (hướng quá cao so với độ lệch ngang tối đa `|x_c| ≤ cos a`, thường gặp khi thu nhỏ lúc ngẩng
  gần thiên đỉnh) thì lùi về zoom quanh trục nhìn — dự đoán được, không lật camera.
- **Góc giữa hai hướng** dùng `atan2(|a×b|, a·b)` chứ không dùng `acos(a·b)`: với góc cỡ 1e-7°
  thì `1 − cos` nhỏ hơn epsilon số thực nên acos cho ra 0 (mất hẳn độ phân giải).
- **Quay bầu trời**: Rodrigues quanh `poleAxis = directionOf(lat, 0)` góc `−ΔLST`; kiểm chứng bằng
  cách so với khung dựng lại ở thời điểm mới: lệch ≤ vài phần triệu độ (phần dư chính là tuế sai
  IAU1976 mà phép quay thuần cố ý không mô hình hoá).

## Thứ tự vẽ (`src/lib/sky3d-render.ts`)

nền trời theo dải độ cao (mỗi dải một đa giác ghép hai vòng độ cao cùng chỉ số phương vị, màu
gradient dọc) → quầng sáng Mặt Trời → Ngân Hà → lưới độ cao/phương vị → nét chòm sao (cắt phần
khuất sau núi) → hoàng đạo + nhãn 12 cung → tên chòm sao → thiên thể sâu → **sao** (vệt → quầng →
lõi → tia nhiễu xạ) → hành tinh / Mặt Trăng / Mặt Trời → mặt đất (nửa dưới `horizonY`) → lưới
khoảng cách → ba lớp núi → mù chân trời → vạch chân trời + la bàn 8 hướng → nhãn chống chồng
(theo thứ tự ưu tiên sao → DSO → hoàng đạo → chòm) → vòng ngắm đối tượng chọn.

## Hiệu năng

- Khung sao dựng lại thưa (mỗi 4 phút mô phỏng hoặc khi đổi nơi/giờ); phần chuyển động giữa hai
  lần dựng chỉ là một ma trận 3×3 nhân cho ~5.000 vector.
- Dải màu trời bỏ qua các dải không thể thấy (ước lượng khoảng độ cao của khung từ 8 điểm viền).
- Nhãn vẽ hoãn lại + hộp chặn đè; sprite quầng sáng tạo một lần rồi dùng lại.
- Một khung 640×360 trong Node (`@napi-rs/canvas`) đo ≈ 20–25 ms; trình duyệt nhanh hơn nhờ tăng
  tốc canvas. `requestAnimationFrame` tự dừng khi khung ra khỏi màn hình (IntersectionObserver).

## Kiểm chứng & ảnh chụp

```bash
npm run test:sky3d   # 1.498 phép kiểm: hình học camera, cắt tia, quay ΔLST, mặt đất, vẽ thật trên canvas
npm run shot:sky3d   # 13 tình huống PNG trong .cache/shots/ (đêm, rạng, ngày, ngẩng cao, cúi, vệt sao, Nam bán cầu…)
```

Nhóm "vẽ thật" trong `tests/sky3d.check.ts` khẳng định bằng điểm ảnh: trời ngày sáng hơn trời
đêm, mặt đất tối hơn trời, vạch chân trời sáng nằm ngang, ảnh **tất định** (hai lần vẽ trùng
từng byte), nhấp nháy đổi ảnh theo thời gian còn tắt thì không, vệt sao không làm mất sao,
tắt khí quyển thì sống núi vẫn tách khỏi trời và mặt đất vẫn đọc được, đĩa hành tinh phủ đủ
điểm ảnh với Sao Mộc ám màu gỉ sắt / Sao Thổ lộ vành đai, và các góc nhìn biên
(fov 5°/110°, ngẩng 89°, cúi −42°, Nam bán cầu) không sinh toạ độ rác.

## Giới hạn đã biết

- Canvas 2D: chưa có occlusion theo chiều sâu thật cho vật thể giữa trời (thứ tự vẽ cố định),
  chưa có bloom HDR. Nâng cấp WebGL/three.js là bước tuỳ chọn tiếp theo nếu muốn (kiến trúc
  `sky3d.ts` tách riêng toán chiếu để thay bộ vẽ dễ dàng).
- Danh mục sao dừng ở cấp 6,1 nên phóng to sâu (> 10×) sẽ thưa sao — đúng dữ liệu, không phải lỗi.
- Khi tua rất nhanh (6 giờ/giây), Mặt Trăng nhích theo từng bước dựng lại khung (4 phút mô phỏng)
  thay vì mượt tuyệt đối như sao; ngưỡng này chọn để đổi lấy chi phí CPU thấp.
