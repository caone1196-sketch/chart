# Dựng lại "Bản đồ sao thực tế" — trông thực tế hơn, điều khiển dễ hơn

> **Lưu ý (16/09/2026):** giao diện bản đồ sao 2D (`StarMap.tsx`) đã được **thay thế bằng khung ngắm 3D**
> (`Sky3D.tsx`, xem `docs/ban-do-3d.md`). Tài liệu này giữ lại làm hồ sơ thiết kế cho lớp mô hình hiển thị
> `sky-visual.ts` (khí quyển, phép chiếu, Ngân Hà, pha Trăng…) vẫn đang được dùng chung.

Phạm vi: `src/components/StarMap.tsx` (viết lại, nay đã gỡ), hai mô-đun mới `src/lib/sky-visual.ts` (mô hình hiển thị)
và `src/lib/sky-render.ts` (bộ vẽ canvas). Danh mục dữ liệu (5.044 sao Hipparcos, 88 chòm sao, 118 thiên thể
sâu) và mọi tính năng cũ (chạy thời gian, chọn đối tượng, hỏi AI) được giữ nguyên.

---

## 1. Yêu cầu

1. "Bản đồ sao thực tế" (chế độ độ cao – phương vị) phải **trông thực tế hơn rõ rệt**.
2. "Toàn cảnh (xích kinh – xích vĩ)" phải **dễ điều khiển hơn**.

## 2. Trước → sau

| Hạng mục | Trước | Sau |
| --- | --- | --- |
| Nền trời | một gradient xanh đêm cố định | màu trời tính theo độ cao Mặt Trời: đêm → chạng vạng → ngày; ráng chiều quanh phương vị Mặt Trời; lớp mù tán xạ ngay trên chân trời |
| Khúc xạ | không có | Bennett (1982): vật thể ở chân trời được nâng ≈ 34′ (Mặt Trời mọc/lặn đúng như mắt thấy) |
| Hấp thụ | không có | khối khí quyển Kasten–Young (1989), suy giảm 0,2 mag/khối; sao gần chân trời mờ và đỏ hơn; ban ngày mất tới 4,6 mag nên gần như không còn sao |
| Ngân Hà | 2 nét vẽ dày, đồng nhất | 1.670 đám mây sao + hạt sao phân giải được, có trung tâm sáng (Nhân Mã), nhánh phình Thiên Nga, rãnh tối (Great Rift), mờ dần về phía chân trời |
| Sao | điểm phẳng | lõi sáng theo hàm cấp sao + **quầng sáng (bloom)** + **tia nhiễu xạ** cho sao sáng, giữ đúng màu B-V |
| Mặt Trăng | đĩa tròn + quầng, không ghi tên | **đúng pha**: hình khuyết theo góc ly giác với Mặt Trời, quầng sáng tỉ lệ phần được chiếu sáng, **có nhãn "Mặt Trăng"/"Mặt Trời"** |
| Mặt đất | vòng chân trời, không có đất | **ba dải núi khuất dần** + nền đất theo phối cảnh khí quyển; vật thể bị núi che không được vẽ; vòng chân trời có 8 hướng (B/ĐB/Đ/…/TB) |
| Nhãn | vẽ theo thứ tự, hay đè nhau | xếp hàng theo ưu tiên (sao sáng → thiên thể sâu → hoàng đạo → chòm sao) và **tự bỏ nhãn nếu đè**; hành tinh/Mặt Trời/Mặt Trăng tự thử 4 vị trí quanh ký hiệu để không đè nhau; chỉ hiện chòm sao lớn khi thu nhỏ |
| Zoom | luôn ở tâm khung, lăn chuột thì **cuộn luôn cả trang** (React `onWheel` là listener passive nên không `preventDefault` được) | **zoom quanh con trỏ**, giới hạn theo chế độ (0,6–22× mặt đất · 1–24× bản đồ); listener `wheel` native `passive: false` nên **trang đứng yên** (kể cả Ctrl + lăn = chụm bàn rê); hệ số zoom chuẩn hoá theo `deltaMode` và độ lớn `deltaY` → chuột rời, bàn rê, Firefox như nhau; phần dịch chuyển khi zoom cũng bị kẹp ±0,85 cạnh khung như khi kéo nên không trôi bầu trời ra ngoài màn hình |
| Kéo bản đồ | đổi tâm khung | kéo ngang = đổi xích kinh, kéo dọc = đổi xích vĩ, có kẹp −89,5°…+89,5° |
| Đi tới đối tượng | không có | ô tra cứu (1.084 mục): sao, chòm sao, thiên thể sâu, hành tinh, tâm Ngân Hà, thiên đỉnh; gõ **không dấu** vẫn ra |
| Đọc toạ độ | không có | hiện toạ độ ngay dưới con trỏ (xích kinh/xích vĩ ở bản đồ, độ cao/phương vị ở bầu trời) + nút 🎯 đưa điểm đó vào giữa khung |
| Phím tắt | không có | ←→↑↓ dịch, `+`/`−` phóng to, `0`/Home căn lại |
| Thời gian | nút "Bây giờ" tĩnh | nút **theo giờ thực** (tự cập nhật mỗi giây) tách khỏi **chạy thời gian**; mọi thao tác thời gian tự tắt chế độ chạy |
| Thanh trượt zoom | không có | thanh trượt mức phóng kèm số 1,00×–24× |
| Đi nhanh | không có | bầu trời: Bắc/Đông/Nam/Tây/Thiên đỉnh · bản đồ: Dải Ngân Hà, vùng 0h/6h/12h/18h |

## 3. Mô hình khí quyển (cơ sở của "trông thực tế")

| Đại lượng | Công thức | Nguồn |
| --- | --- | --- |
| Khúc xạ khí quyển | `R = 1,02 / tan(h + 10,3/(h + 5,11))` (phút cung, h theo độ) | Bennett G. G., *Journal of Navigation* 35 (1982) 255 |
| Khối khí quyển | `X = 1 / (sin h + 0,50572·(h + 6,07995)^−1,6364)` | Kasten F., Young A. T., *Applied Optics* 28 (1989) 4735 |
| Hấp thụ | `Δm = 0,20 · (X − 1)` mag | hệ số điển hình ở dải nhìn thấy, mức nước biển |
| Màu trời | trộn đêm ↔ ngày theo `smoothstep(−7°, +3°, alt☉)`, chạng vạng dạng Gauss quanh −3,5°, quầng sáng quanh −5° | bảng màu hiệu chỉnh theo mắt nhìn |

Ánh sáng nền Trái Đất làm mất sao mờ theo `Δm_sáng = −clamp(0,28·(alt☉ + 18°), 0 … 4,6)` mag:
Mặt Trời dưới −18° trở đi mới thấy tới cấp 6, chạng vạng dân sự (−6°) còn ≈ 2,2 mag, ban ngày còn rất ít sao sáng.

## 4. Phép chiếu & điều khiển

- **Bầu trời**: chiếu lập thể quanh thiên đỉnh `r = 2·tan((90° − alt)/2)·scale` với `scale = 0,23·min(w,h)·zoom`
  → toàn bộ vòm trời vừa khung ở zoom 1 (chân trời là vòng tròn bán kính `2·scale`), zoom 1–22×.
- **Toàn cảnh**: thang đo đều `scale = 0,96·h/182·zoom` → 180° xích vĩ vừa đúng chiều cao khung ở zoom 1;
  xích kinh tăng về bên trái (đông ở phải), chân trời hiện tại là một đường nét đứt.
- **Zoom quanh con trỏ** giữ nguyên vật thể dưới điểm trỏ (đã kiểm chứng ngược lại bằng phép chiếu nghịch đảo).
- **Lăn chuột**: `wheelZoomFactor()` đổi `deltaY`/`deltaMode`/`ctrlKey` thành hệ số `2^(−nấc/5)` (một nấc ≈ 1,15×, năm nấc ≈ 2×),
  kẹp mỗi sự kiện trong `[1/2,4 ; 2,4]`; listener gắn trực tiếp lên canvas với `{ passive: false }` và `preventDefault()`
  để **trang không cuộn theo** — xem biên bản `docs/soat-loi.md` mục 5.
- **Chạm**: chụm hai ngón chỉ phóng (không kéo song song), nhấc ngón thì xoá mốc kéo để khung không nhảy;
  bắt giữ con trỏ (`setPointerCapture`) có kiểm tra API và nhả ở `pointerup`/`pointercancel`.
- **Tra cứu** dùng danh mục 1.084 mục, bỏ dấu tiếng Việt + bí danh tên Việt ("Sao Bắc Cực" → Polaris,
  "Sao Thiên Lang" → Sirius, "Sao Hỏa" → Hỏa Tinh, "Tinh vân Lạp Hộ" → M42…).

## 5. Kiểm chứng

| Lệnh | Nội dung | Kết quả |
| --- | --- | --- |
| `npm run test:sky` | 14 nhóm: khúc xạ (đơn điệu, nghịch đảo), khối khí quyển (so số tra cứu), hấp thụ, bảng màu trời đơn điệu, phép chiếu chân trời (thiên đỉnh ở tâm, bán kính, phương vị), phép chiếu bản đồ, **phóng to quanh con trỏ ở cả 2 chế độ**, dựng khung 4 vĩ độ (Hà Nội/Sydney/Tromsø/xích đạo), Ngân Hà (rãnh tối tối hơn nhánh sáng ≥ 25 %, Sgr A\* ở 266,42° / −28,94°), pha Trăng, tra cứu, định dạng toạ độ, **quy đổi lăn chuột & giới hạn dịch chuyển (7b)**, dựng giao diện | **14.963 phép kiểm · 0 lỗi** |
| `npm run test:ui` | chạy thật giao diện trong jsdom với canvas giả có ghi lại lời gọi: gắn giao diện, vẽ, **lăn chuột thật bằng `WheelEvent` và khẳng định `defaultPrevented` (trang không cuộn) + mức phóng tăng/giảm đúng hướng (kể cả `deltaMode = 1` của Firefox và Ctrl + lăn)**, kéo, bấm chọn sao, đổi chế độ, tắt/bật lớp, tra cứu "Sao Thiên Lang", phím tắt; chờ lần vẽ đầu bằng poll thay vì hẹn giờ cứng | **≈133.000 lời gọi vẽ · 0 lỗi · 0 console.error** |
| `npm test` | toàn bộ chuỗi hiện tại (bản đồ sao · bầu trời 3D · giao diện 3D · vòng natal · AI · ví dụ 11/11/1996) — các nhóm biến thể cũ (hệ nhà, ayanamsa, âm lịch, điểm ảo, Tử Vi) đã được gỡ cùng tính năng | **EXIT 0** |
| `npm run shot:sky` | render 12 cảnh ra PNG (đêm/chạng vạng/ban ngày, zoom, bán cầu nam, khung điện thoại) để soi bằng mắt; có bản "tăng sáng" để kiểm tra cấu trúc | dùng khi cần rà lại hình |

Kiểm tra bằng mắt các cảnh tiêu biểu (rút ra từ bản render):
đêm Hà Nội 11/11/1996 00:30 — dải Ngân Hà chạy qua Thiên Nga → Nhân Mã, M31 cạnh chòm Tiên Nữ, sao sáng có tia;
chạng vạng — trời tím, mất dần sao yếu, hành tinh vẫn còn; ban ngày — trời xanh có quầng Mặt Trời, hầu như không sao;
Sydney (bán cầu nam) — thấy rõ LMC/SMC, Thập Tự Phương Nam, chòm Nam Cực.

## 6. Ghi chú kỹ thuật

- Bộ vẽ dùng chung cho trình duyệt và Node: canvas 2D thuần, `@napi-rs/canvas` chỉ là devDependency cho `shot:sky`
  và `test:sky` (không lọt vào gói build — `npm run build` vẫn ra một tệp `dist/index.html`).
- `buildSkyFrame` tính vị trí biểu kiến theo mốc 2 giây (như trước) nên kéo/zoom không dựng lại catalogue.
- Vẽ theo `requestAnimationFrame`, tự vẽ trước khi ảnh chụp màn hình cuối mỗi lần kéo (không bị trắng khung khi chụp).
- Nhãn, ký hiệu thiên thể sâu và vòng ngắm đối tượng đang chọn được gom vào "hàng đợi nhãn" để vẽ ở lớp trên cùng.
