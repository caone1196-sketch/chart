/**
 * Cơ sở tri thức về CÁC BIẾN THỂ BẢN ĐỒ SAO (tiếng Việt).
 *
 * Mục tiêu: giải thích đầy đủ "một bản đồ sao có thể được dựng theo những cách nào",
 * mỗi biến thể gồm: nguồn gốc, cách tính, cách đọc, dùng khi nào và lưu ý.
 * Dữ liệu ở đây được UI (bảng tra biến thể) và bộ trả lời nội bộ dùng chung.
 */

export type VariantCard = {
  id: string;
  group: VariantGroup;
  name: string;
  short: string;
  origin: string;
  method: string;
  reading: string;
  bestFor: string;
  caution: string;
  /** Từ khoá nhận diện khi người dùng hỏi (không dấu). */
  keywords: string[];
};

export type VariantGroup =
  | "Hệ nhà"
  | "Hệ hoàng đạo"
  | "Điểm & thiên thể"
  | "Hình mẫu & hình dạng"
  | "Cổ điển Hy Lạp"
  | "Dự báo & thời điểm"
  | "Quan hệ"
  | "Vệ Đà (Jyotish)"
  | "Trung Hoa & Maya"
  | "Hiện đại"
  | "Phái sinh";

export const VARIANT_CARDS: VariantCard[] = [
  /* ---------------------------------------------------------------- hệ nhà */
  {
    id: "houses-overview",
    group: "Hệ nhà",
    name: "Chia nhà: tổng quan 12 hệ",
    short: "Nhà là 12 khu vực của bản đồ; mỗi hệ chia khác nhau dẫn tới vị trí hành tinh trong nhà khác nhau.",
    origin: "Từ chiêm tinh Babylon - Hy Lạp (Whole Sign) tới các hệ tính toán thời trung cổ và hiện đại.",
    method:
      "Mọi hệ đều dùng chung 4 điểm: AC (cung Mọc), MC (thiên đỉnh), ARMC (góc giờ) và vĩ độ nơi sinh. Khác nhau ở cách chia cung tròn giữa AC và MC (hoặc cắt các vòng chia đều trên xích đạo/hoàng đạo).",
    reading:
      "Hệ nhà quyết định 'sân khấu' của hành tinh: cùng một hành tinh có thể ở nhà 5 trong Whole Sign nhưng nhà 4 trong Placidus — ý nghĩa luận giải đổi theo.",
    bestFor: "Chọn hệ phù hợp với trường phái bạn theo; nên thống nhất một hệ cho cả bản đồ natal và các bản đồ phụ.",
    caution: "Rất nhiều tranh luận về hệ 'đúng'. Ở vĩ độ cao (trên 60°) Placidus/Koch bị phá vỡ và bắt buộc dùng hệ khác.",
    keywords: ["he nha", "chia nha", "house system", "nha so 12", "khac nhau giua cac he nha"]
  },
  {
    id: "houses-whole-sign",
    group: "Hệ nhà",
    name: "Whole Sign (toàn cung)",
    short: "Mỗi nhà đúng bằng một cung hoàng đạo, nhà 1 là cung chứa cung Mọc.",
    origin: "Hệ cổ nhất, dùng phổ biến trong chiêm tinh Hy Lạp cổ (Hellenistic) và Vệ Đà (Bhava).",
    method: "Cung Mọc rơi vào cung nào thì toàn bộ cung đó là nhà 1; các nhà tiếp theo là các cung kế tiếp.",
    reading: "Đơn giản, ổn định, không phụ thuộc vĩ độ; AC luôn nằm ở 0°-30° của nhà 1 nên rất tiện cho kỹ thuật Hy Lạp (profections, lots).",
    bestFor: "Chiêm tinh Hy Lạp cổ, luận giải nguyên tố/pha (zodiacal releasing), người mới học.",
    caution: "Độ chi tiết theo nhà thấp hơn Placidus ở vĩ độ trung bình.",
    keywords: ["whole sign", "toan cung", "he nha co dien"]
  },
  {
    id: "houses-placidus",
    group: "Hệ nhà",
    name: "Placidus",
    short: "Chia khoảng thời gian từ lúc mọc đến lúc lên đỉnh thành 3 phần bằng nhau — hệ phổ biến nhất hiện nay.",
    origin: "Placidus de Titis (thế kỷ 17), dựa trên cách chia thời gian của Ptolemy.",
    method: "Mỗi cung được xác định bằng phân chia thời gian (temporal) của các cung thiên cầu; yêu cầu lặp để giải.",
    reading: "Cung nhà sát nghĩa 'mức độ đời sống' — nhà 10 bao quanh MC, nhà 1 quanh AC; rất nhạy với giờ sinh nên đọc được chi tiết về sự kiện.",
    bestFor: "Chiêm tinh hiện đại phương Tây, phân tích sự nghiệp và dự báo theo tiến triển/transit.",
    caution: "Không xác định được trong vòng cực (|vĩ độ| > 66°); sai giờ sinh 4 phút có thể lệch cả một cung nhà.",
    keywords: ["placidus"]
  },
  {
    id: "houses-koch",
    group: "Hệ nhà",
    name: "Koch (Birthplace)",
    short: "Chia theo vị trí nơi sinh, nhấn mạnh MC và nhà 10.",
    origin: "Walter Koch, thế kỷ 20 (Đức).",
    method: "Dựa trên góc giờ của MC khi lùi lại theo vĩ độ; còn gọi là hệ 'nơi sinh'.",
    reading: "Nhà 10 và 11 rộng hơn Placidus; rất tốt khi muốn nhấn mạnh sứ mệnh nghề nghiệp và vị trí công chúng.",
    bestFor: "Phân tích sự nghiệp, hình ảnh công chúng ở vĩ độ trung bình.",
    caution: "Kém ổn định ở vĩ độ cao; ít phổ biến hơn Placidus nên tài liệu tham chiếu ít hơn.",
    keywords: ["koch", "birthplace", "noi sinh"]
  },
  {
    id: "houses-campanus",
    group: "Hệ nhà",
    name: "Campanus",
    short: "Chia nhà theo đường tròn lớn (mặt phẳng đứng) — hệ 'không gian'.",
    origin: "Campanus of Novara (thế kỷ 13).",
    method: "Chia bầu trời bằng các cung tròn lớn vuông góc với đường chân trời; chiếu lên hoàng đạo.",
    reading: "Nhấn mạnh quan hệ hình học giữa hành tinh với đường chân trời và thiên đỉnh; khác Placidus rõ ở vĩ độ cao.",
    bestFor: "Người theo trường phái hệ không gian; nghiên cứu thiên văn học của bản đồ.",
    caution: "Ít dùng trong tài liệu hiện đại; ở vĩ độ cao có thể đảo cung.",
    keywords: ["campanus"]
  },
  {
    id: "houses-regiomontanus",
    group: "Hệ nhà",
    name: "Regiomontanus",
    short: "Chia xích đạo thành 12 phần bằng nhau rồi chiếu lên hoàng đạo.",
    origin: "Regiomontanus (Johannes Müller, thế kỷ 15).",
    method: "12 cung bằng nhau trên xích đạo, chiếu theo đường tròn lớn qua điểm Bắc-Nam của chân trời.",
    reading: "Trung dung giữa hệ không gian và hệ thời gian; chính xác cho horary và chiêm tinh truyền thống châu Âu.",
    bestFor: "Horary (bói câu hỏi), chiêm tinh truyền thống phương Tây, người thích hệ cổ điển.",
    caution: "Khác Placidus đáng kể với vĩ độ cao và với nhà gần AC/MC.",
    keywords: ["regiomontanus", "regionmontanus"]
  },
  {
    id: "houses-porphyry",
    group: "Hệ nhà",
    name: "Porphyry",
    short: "Chia đều một phần tư vòng tròn giữa AC và MC.",
    origin: "Porphyry of Tyre (thế kỷ 3) — hệ cổ điển đơn giản.",
    method: "Lấy cung phần tư AC→MC chia ba phần bằng nhau; các nhà còn lại lấy đối xứng.",
    reading: "Cân bằng giữa đơn giản và hợp lý; được Swiss Ephemeris dùng làm phương án dự phòng khi Placidus/Koch không giải được.",
    bestFor: "Vĩ độ cao, horary, nghiên cứu hệ nhà cổ.",
    caution: "Nhà không phản ánh đều sự lên thiên đỉnh theo thời gian.",
    keywords: ["porphyry", "porphyrius"]
  },
  {
    id: "houses-equal",
    group: "Hệ nhà",
    name: "Equal House (nhà bằng nhau từ AC)",
    short: "Mỗi nhà 30° bắt đầu từ đúng độ của cung Mọc — MC có thể nằm ở nhà 9, 10 hoặc 11.",
    origin: "Truyền thống Hy Lạp muộn và chiêm tinh Anh hiện đại.",
    method: "Nhà 1 = AC đến AC+30°, các nhà tiếp theo cộng dần 30°.",
    reading: "Giữ nguyên 'vị trí' của AC nhưng cho phép MC lệch khỏi mốc nhà 10 — phản ánh việc sự nghiệp có thể gắn với nhà khác.",
    bestFor: "So sánh với Whole Sign; người muốn nhà đều 30° nhưng tôn trọng AC chính xác.",
    caution: "MC không trùng cusp nhà 10 gây khó chịu cho người quen Placidus.",
    keywords: ["equal house", "nha bang nhau"]
  },
  {
    id: "houses-equal-mc",
    group: "Hệ nhà",
    name: "Equal từ MC (MC làm mốc)",
    short: "MC đúng ở cusp nhà 10, các nhà cách nhau 30°.",
    origin: "Biến thể của Equal House dùng trong một số trường phái hiện đại.",
    method: "Từ MC lùi 90° để có AC hệ này rồi cộng 30° cho mỗi nhà.",
    reading: "Tôn trọng MC — tốt khi sự nghiệp/địa vị là trục chính của câu hỏi.",
    bestFor: "Đọc nghề nghiệp, địa vị xã hội khi giờ sinh còn chút nghi ngờ.",
    caution: "AC thực tế có thể không rơi vào cusp nhà 1.",
    keywords: ["equal mc", "nha bang nhau tu mc"]
  },
  {
    id: "houses-alcabitius",
    group: "Hệ nhà",
    name: "Alcabitius",
    short: "Chia cung phần tư AC-MC theo thời gian lên thiên đỉnh (đơn giản hoá của Placidus).",
    origin: "Alcabitius (thế kỷ 10), dùng rộng rãi trước khi Placidus phổ biến.",
    method: "Chia cung phần tư thành ba khoảng góc giờ bằng nhau.",
    reading: "Rất giống Placidus ở vĩ độ trung bình nhưng tính toán trực tiếp, không cần lặp.",
    bestFor: "Chiêm tinh cổ điển phương Tây, horary, người muốn ổn định số học.",
    caution: "Vẫn gặp vấn đề ở vĩ độ cao như các hệ 'thời gian'.",
    keywords: ["alcabitius", "alchabitius"]
  },
  {
    id: "houses-regiomontanus-vs",
    group: "Hệ nhà",
    name: "Topocentric (Polich-Page)",
    short: "Biến thể hiện đại của Placidus tính từ vị trí quan sát trên bề mặt Trái Đất.",
    origin: "Wendel Polich & Anthony Page (thế kỷ 20).",
    method: "Hiệu chỉnh theo bán kính Trái Đất và khoảng cách thực của hành tinh.",
    reading: "Cho ra cusp nhà hơi khác Placidus, đặc biệt gần đường chân trời.",
    bestFor: "Người thích độ chính xác hình học hiện đại.",
    caution: "Ít tài liệu tham khảo; đừng trộn lẫn với Placidus khi đọc số liệu.",
    keywords: ["topocentric", "polich", "page"]
  },
  {
    id: "houses-morinus",
    group: "Hệ nhà",
    name: "Morinus",
    short: "Chia bằng nhau trên xích đạo rồi chiếu vuông góc lên hoàng đạo.",
    origin: "Jean-Baptiste Morin (thế kỷ 17).",
    method: "12 phần bằng nhau của xích đạo chiếu trực giao lên hoàng đạo (khác Regiomontanus ở cách chiếu).",
    reading: "Nhấn mạnh vị trí xích đạo của hành tinh; dùng nhiều trong chiêm tinh Pháp cổ điển.",
    bestFor: "Nghiên cứu, trường phái Pháp cổ.",
    caution: "Cusp nhà có thể lệch mạnh so với Placidus ở vĩ độ cao.",
    keywords: ["morinus", "morin"]
  },
  {
    id: "houses-sripati",
    group: "Hệ nhà",
    name: "Sripati (Bhava, Ấn Độ)",
    short: "Hệ nhà Vệ Đà: dùng trung điểm giữa cusp và góc nhà.",
    origin: "Sripati (thế kỷ 11), ảnh hưởng tới Jyotish hiện đại.",
    method: "Lấy phần tư AC-MC chia ba (giống Porphyry) nhưng cusp tính từ trung điểm các cung (bhava madhya).",
    reading: "Dùng cùng hệ hoàng đạo sidereal để luận nhà (bhava) trong lá số Vệ Đà.",
    bestFor: "Lá số Jyotish khi muốn dùng bhava thay vì whole sign.",
    caution: "Phải đi kèm hệ hoàng đạo sidereal mới đúng ngữ cảnh Vệ Đà.",
    keywords: ["sripati", "bhava", "nha ve da"]
  },

  /* --------------------------------------------------------- hệ hoàng đạo */
  {
    id: "zodiac-tropical",
    group: "Hệ hoàng đạo",
    name: "Hoàng đạo nhiệt đới (Tropical)",
    short: "0° Bạch Dương là điểm Xuân phân — gốc theo mùa chứ không theo chòm sao.",
    origin: "Truyền thống phương Tây từ Hy Lạp tới nay.",
    method: "Toạ độ đo từ giao điểm hoàng đạo - xích đạo tại thời điểm tính.",
    reading: "Cung phản ánh chất lượng của mùa (khởi đầu, giữa, kết thúc) hơn là vị trí thật so với nền sao.",
    bestFor: "Gần như toàn bộ chiêm tinh phương Tây hiện đại.",
    caution: "Không trùng với các chòm sao thiên văn do hiện tượng tuế sai.",
    keywords: ["tropical", "nhiet doi", "hoang dao nhiet doi"]
  },
  {
    id: "zodiac-sidereal",
    group: "Hệ hoàng đạo",
    name: "Hoàng đạo cố định theo sao (Sidereal) & ayanamsa",
    short: "Trừ đi ayanamsa (~24°) để cung gắn với vị trí sao thật; nền tảng của chiêm tinh Vệ Đà.",
    origin: "Chiêm tinh Ấn Độ (Jyotish) và nhánh sidereal phương Tây (Fagan, Bradley).",
    method: "Kinh độ sidereal = kinh độ nhiệt đới − ayanamsa. Ayanamsa là chênh lệch giữa điểm Xuân phân và gốc sao cố định (Lahiri, Raman, Krishnamurti, Fagan/Bradley...).",
    reading: "Cung và nhà lệch khoảng 24° so với nhiệt đới — nhiều người có 'cung Mặt Trời khác' khi xem theo Vệ Đà.",
    bestFor: "Jyotish, chiêm tinh sao cố định, người quan tâm gắn kết với bầu trời thật.",
    caution: "Có nhiều chuẩn ayanamsa khác nhau lệch nhau vài phút cung; nhớ ghi rõ đang dùng chuẩn nào.",
    keywords: ["sidereal", "ve da", "jyotish", "ayanamsa", "lahiri", "raman", "krishnamurti", "fagan"]
  },
  {
    id: "zodiac-galactic",
    group: "Hệ hoàng đạo",
    name: "Hoàng đạo Ngân Hà (Galactic)",
    short: "Lấy tâm Ngân Hà (0° Nhân Mã) làm một trục quy chiếu thay vì điểm Xuân phân.",
    origin: "Chiêm tinh Ngân Hà hiện đại (thế kỷ 20-21).",
    method: "Kinh độ galactic = kinh độ nhiệt đới − ayanamsa galactic (tâm Ngân Hà ở vị trí quy ước).",
    reading: "Nhấn mạnh liên hệ giữa bản đồ cá nhân với cấu trúc Ngân Hà, thường dùng chung với các điểm như Galactic Center.",
    bestFor: "Chiêm tinh biểu tượng hiện đại, kết hợp với sao cố định.",
    caution: "Là quy ước, không có chuẩn thống nhất giữa các tác giả.",
    keywords: ["galactic", "ngan ha", "galactic center"]
  },

  /* -------------------------------------------------- điểm & thiên thể */
  {
    id: "point-nodes",
    group: "Điểm & thiên thể",
    name: "Giao điểm Mặt Trăng (Bắc/Nam giao)",
    short: "Hai điểm Mặt Trăng cắt đường hoàng đạo — trục 'bài học và vốn cũ'.",
    origin: "Dùng trong cả Vệ Đà (Rahu/Ketu) và phương Tây hiện đại.",
    method: "Giao tuyến mặt phẳng quỹ đạo Mặt Trăng với hoàng đạo; 'thật' (osculating) hay 'trung bình' (mean).",
    reading: "Bắc giao là hướng phát triển, Nam giao là kỹ năng sẵn có hoặc vùng an toàn; nhà và cung chứa chúng rất quan trọng.",
    bestFor: "Đọc định hướng cuộc đời, nghiệp (karma) trong cả hai truyền thống.",
    caution: "Bắc giao trung bình và thật lệch nhau tới 1,5°; Vệ Đà luôn dùng trung bình (Rahu/Ketu).",
    keywords: ["giao diem", "node", "bac giao", "nam giao", "rahu", "ketu"]
  },
  {
    id: "point-lilith",
    group: "Điểm & thiên thể",
    name: "Lilith / Black Moon",
    short: "Điểm viễn địa của quỹ đạo Mặt Trăng — phần hoang dã, bị kìm nén, không thoả hiệp.",
    origin: "Chiêm tinh hiện đại thế kỷ 20, gắn với huyền thoại Lilith.",
    method: "Có ba biến thể: Lilith trung bình (mean apogee), Lilith thật (osculating), và tiểu hành tinh 1181 Lilith.",
    reading: "Bản đồ chỉ ra lĩnh vực ta từ chối khuất phục, nơi dễ có xung đột với khuôn khổ; cũng là năng lượng sáng tạo mãnh liệt.",
    bestFor: "Phân tích bản năng, giới hạn, chủ đề tự do và tính dục.",
    caution: "Các biến thể Lilith lệch nhau đáng kể; luôn ghi rõ đang dùng loại nào.",
    keywords: ["lilith", "black moon", "trang den"]
  },
  {
    id: "point-chiron",
    group: "Điểm & thiên thể",
    name: "Chiron",
    short: "Tiểu hành tinh nửa Sao Thổ nửa Sao Mộc — 'vết thương chữa lành'.",
    origin: "Phát hiện 1977; đưa vào chiêm tinh từ thập niên 1980 (Barbara Hand Clow, Zane Stein).",
    method: "Quỹ đạo Kepler trong vành đai Chiron; chu kỳ ~50 năm.",
    reading: "Chiron là nơi bạn mang vết thương không hẳn lành, nhưng nhờ đó hiểu và giúp người khác — bác sĩ của chính vết thương mình.",
    bestFor: "Chủ đề chữa lành, giáo dục, kéo dài thời gian dài hạn theo tuổi.",
    caution: "Không thuộc 7 hành tinh cổ điển; nhiều trường phái cổ điển không dùng.",
    keywords: ["chiron"]
  },
  {
    id: "point-asteroids",
    group: "Điểm & thiên thể",
    name: "Bốn tiểu hành tinh chính: Ceres, Pallas, Juno, Vesta",
    short: "Bốn nữ thần của vành đai tiểu hành tinh, bổ sung cho các chủ đề mà 10 hành tinh còn thiếu.",
    origin: "Phát hiện 1801-1807, dùng trong chiêm tinh từ thập niên 1970 (Eleanor Bach, Demetra George).",
    method: "Quỹ đạo Kepler quanh Mặt Trời (2,4-2,8 AU), tính địa tâm như các hành tinh khác.",
    reading:
      "Ceres: nuôi dưỡng, mùa vụ, mất mát. Pallas: trí tuệ chiến lược, công bằng, sáng tạo kỹ thuật. Juno: hôn nhân, giao ước. Vesta: sự tận hiến, lửa thiêng, công việc.",
    bestFor: "Chủ đề về chăm sóc, trí tuệ, hôn nhân, sự cống hiến chi tiết hơn so với Mặt Trăng/Kim Tinh/Hỏa Tinh.",
    caution: "Sai số veto: quỹ đạo tiểu hành tinh bị nhiễu; phần mềm khác nhau có thể lệch vài phần trăm độ.",
    keywords: ["ceres", "pallas", "juno", "vesta", "tieu hanh tinh"]
  },
  {
    id: "point-fields",
    group: "Điểm & thiên thể",
    name: "Thiên thể xa: Eris, Sedna và TNO",
    short: "Các thiên thể ngoài Sao Hải Vương — chỉ dùng cho thế hệ và hành trình dài.",
    origin: "Phát hiện 2003-2005; chiêm tinh hiện đại xem như 'hành tinh thế hệ'.",
    method: "Quỹ đạo cực dài (hàng trăm tới hàng nghìn năm), di chuyển rất chậm.",
    reading: "Chỉ đọc theo cung/nhà, gần như không đọc theo góc chiếu cá nhân; đại diện cho chủ đề tập thể của cả một thế hệ.",
    bestFor: "Phân tích xu hướng tập thể, khí hậu tâm lý thời đại.",
    caution: "Với quỹ đạo dài, một dấu hiệu có thể kéo dài hàng chục năm — không dùng để đọc cá nhân.",
    keywords: ["eris", "sedna", "tno", "haumea", "makemake", "thien the xa"]
  },
  {
    id: "point-hypothetical",
    group: "Điểm & thiên thể",
    name: "Hành tinh giả định (Uranian / Hamburg School)",
    short: "8 điểm Cupido, Hades, Zeus, Kronos, Apollon, Admetos, Vulkanus, Poseidon — không tồn tại thật, chỉ là quy ước hình học.",
    origin: "Alfred Witte (1920s) và sau này Ludwig Rudolph/Sieggrün; dùng nhiều trong chiêm tinh Đức.",
    method: "Dùng chung một điểm xuân phân; tính bằng các chu kỳ ước lượng (Cupido ~40 năm ... Poseidon ~83 năm).",
    reading: "Đọc như các 'trục chủ đề': Cupido (hôn nhân, nhóm), Hades (quá khứ, ngầm), Zeus (sáng tạo có mục tiêu), Kronos (quyền uy), Apollon (kinh doanh), Admetos (đứng yên, tập trung), Vulkanus (sức ép khiến thay đổi), Poseidon (tinh thần, lý tưởng).",
    bestFor: "Chiêm tinh Hamburg/URANIAN, kỹ thuật midpoints (điểm giữa).",
    caution: "Không phải thiên thể có thật — dùng để mô tả, không quy kết nguyên nhân.",
    keywords: ["hamburg", "urani", "cupido", "hades", "zeus", "kronos", "apollon", "admetos", "vulkanus", "poseidon", "hanh tinh gia dinh"]
  },
  {
    id: "point-lots",
    group: "Cổ điển Hy Lạp",
    name: "Lots (Fortune, Spirit, Eros...) và phái bản đồ (sect)",
    short: "Các điểm được tính từ AC + các hành tinh, đổi công thức theo ngày/đêm — kỹ thuật cốt lõi của chiêm tinh Hy Lạp.",
    origin: "Chiêm tinh Hy Lạp - La Mã cổ, phục hưng từ thập niên 1990 (Project Hindsight).",
    method:
      "Lot = cung Mọc + (công thức đổi theo ban ngày/ban đêm). Ví dụ Fortune: AC + Mặt Trăng − Mặt Trời (ban ngày); Spirit: AC + Mặt Trời − Mặt Trăng (ban ngày); các Lot khác dùng Kim Tinh, Hỏa Tinh, Mộc Tinh, Thổ Tinh, Thủy Tinh với Fortune/Spirit.",
    reading:
      "Fortune nói về thân thể, tài lộc và những gì đến mà không cần nỗ lực; Spirit nói về ý chí, sự nghiệp, hành động có chủ đích; các Lot khác chỉ từng chủ đề (tình yêu, tranh đấu, nghĩa vụ, thắng lợi, điểm mù).",
    bestFor: "Luận giải truyền thống, kết hợp profection hàng năm và hành tinh chủ (time-lord).",
    caution: "Công thức khác nhau giữa các tác giả và giữa ngày/đêm — cần nhất quán.",
    keywords: ["lot", "fortune", "spirit", "phan", "sect", "bang anh"]
  },

  /* ---------------------------------------------------- hình mẫu & hình dạng */
  {
    id: "pattern-shapes",
    group: "Hình mẫu & hình dạng",
    name: "Hình dạng bản đồ: Bó, Bát, Xô, Đầu máy, Bập bênh, Toả",
    short: "Cách phân bố hành tinh quanh vòng hoàng đạo tạo nên 'kiểu' bản đồ.",
    origin: "Marc Edmund Jones (thập niên 1930).",
    method: "Đo khoảng trống lớn nhất giữa các hành tinh và số cụm mà chúng tạo thành.",
    reading:
      "Bundle (bó): tập trung cực cao, chuyên sâu. Bowl (bát): luôn tìm kiếm phần còn thiếu. Bucket (xô): có một hành tinh dẫn dắt (quai xô). Locomotive (đầu máy): vai trò kéo cả nhóm. Seesaw (bập bênh): sống giữa hai mặt. Splash (toả): sở thích rộng, cần mỏ neo.",
    bestFor: "Đọc tổng thể tính cách và 'nhịp' cuộc đời trước khi đi vào chi tiết.",
    caution: "Chỉ là mô hình gợi mở; ranh giới giữa các hình dạng là quy ước.",
    keywords: ["hinh dang", "bundle", "bowl", "bucket", "locomotive", "seesaw", "splash", "chart shape"]
  },
  {
    id: "pattern-aspects",
    group: "Hình mẫu & hình dạng",
    name: "Hình mẫu góc chiếu: Grand Trine, T-Square, Grand Cross, Yod, Stellium, Kite, Mystic Rectangle, Thor's Hammer",
    short: "Các tổ hợp góc chiếu tạo cấu trúc hình học — đọc nhanh 'cấu trúc xương sống' của bản đồ.",
    origin: "Từ chiêm tinh truyền thống tới tổng hợp hiện đại (Grand Trine: Dane Rudhyar; Yod: Bil Tierney).",
    method:
      "Kết hợp các góc chiếu chuẩn: Grand Trine (3×120°), T-Square (2×90° + 180°), Grand Cross (4 điểm chữ thập), Yod (2×150° + 60°), Stellium (≥3 hành tinh trong ~8°), Kite (Grand Trine + điểm đối), Mystic Rectangle (2 cặp đối + lục hợp/tam hợp), Thor's Hammer (2×150° + 90°).",
    reading:
      "Grand Trine: tài năng tự nhiên, dễ ỳ. T-Square: áp lực thúc hành động, có 'điểm nén'. Grand Cross: căng thẳng bốn phía, cần cân bằng. Yod: sứ mệnh khó tránh, thường lộ ra sau tuổi 30. Stellium: trọng tâm cuộc đời. Kite: tài năng có hướng. Mystic Rectangle: căng thẳng có lối thoát.",
    bestFor: "Nhìn nhanh cấu trúc bản đồ khi giới hạn thời gian; giải thích cho người mới.",
    caution: "Orb khác nhau giữa các tác giả; đừng 'thấy' hình mẫu bằng cách nới orb quá rộng.",
    keywords: ["grand trine", "t-square", "tu vuong", "grand cross", "yod", "stellium", "kite", "mystic rectangle", "hinh mau", "cau truc"]
  },

  /* ------------------------------------------------------------- dự báo */
  {
    id: "predict-transit",
    group: "Dự báo & thời điểm",
    name: "Transit (hành tinh hiện tại chiếu vào bản đồ natal)",
    short: "Kỹ thuật dự báo cơ bản: hành tinh đang ở đâu trên trời chiếu vào điểm nào trong bản đồ của bạn.",
    origin: "Cổ điển, dùng liên tục tới nay.",
    method: "Tính vị trí hiện tại, so với các điểm natal trong orb cho phép.",
    reading: "Transit nhanh (Mặt Trăng, Thủy Tinh) đọc theo ngày; transit chậm (Thổ, Thiên Vương, Hải Vương, Diêm Vương) đọc theo nhiều tháng, đánh dấu giai đoạn chuyển hoá.",
    bestFor: "Mọi câu hỏi 'dạo này/ sắp tới sẽ thế nào'.",
    caution: "Không có nhân quả trực tiếp — transit chỉ là thời điểm thúc đẩy, quyết định vẫn thuộc về bạn.",
    keywords: ["transit", "van han", "hien tai", "thoi diem qua"]
  },
  {
    id: "predict-progression",
    group: "Dự báo & thời điểm",
    name: "Tiến triển thứ cấp (Secondary Progression) & Cung Mặt Trời (Solar Arc)",
    short: "1 ngày sau sinh ứng với 1 năm cuộc đời — bản đồ 'lớn dần' một cách tượng trưng.",
    origin: "Kỹ thuật thế kỷ 17-19 (Alan Leo phổ biến), Solar Arc từ các tác giả Anh thập niên 1930.",
    method: "Lấy toạ độ tại (ngày sinh + số năm tuổi) để làm bản đồ tiến triển; Solar Arc cộng thêm cung chênh của Mặt Trời tiến triển vào mọi điểm natal.",
    reading: "Mặt Trăng tiến triển đổi cung ~2,5 năm một lần (dấu ấn cảm xúc theo giai đoạn); Mặt Trời tiến triển đổi cung ~30 năm (khí chất thời kỳ); Solar Arc đánh dấu sự kiện khi chạm các điểm natal.",
    bestFor: "Đọc 'mùa' cuộc đời theo năm và bước ngoặt.",
    caution: "Cần giờ sinh chính xác hơn transit; các tác giả khác nhau về cách dùng.",
    keywords: ["tien trien", "progression", "solar arc", "cung mat troi"]
  },
  {
    id: "predict-returns",
    group: "Dự báo & thời điểm",
    name: "Hồi quy Mặt Trời (Solar Return) & Hồi quy Mặt Trăng (Lunar Return)",
    short: "Bản đồ dựng tại thời điểm Mặt Trời/Mặt Trăng trở về đúng vị trí natal — chân dung của một năm/một tháng.",
    origin: "Phổ biến rộng trong chiêm tinh hiện đại; Lunar Return dùng nhiều từ thập niên 1970.",
    method: "Tìm thời điểm hành tinh quay lại đúng kinh độ natal (solar: mỗi năm; lunar: mỗi 27,3 ngày).",
    reading: "Solar Return đọc theo chủ đề một năm, đặt ở nhà 1/10/7... của bản đồ hồi quy; Lunar Return đọc nhịp cảm xúc, sự kiện trong tháng.",
    bestFor: "Lập kế hoạch năm/tháng, xem chủ đề sẽ chi phối.",
    caution: "Vị trí địa lý khi 'hồi quy' thay đổi nếu bạn ở nơi khác (relocation) — ghi rõ nơi dùng.",
    keywords: ["solar return", "lunar return", "hoi quy", "sinh nhat chiem tinh"]
  },
  {
    id: "predict-profection-firdaria",
    group: "Cổ điển Hy Lạp",
    name: "Profection & Firdaria (chủ quản theo thời gian)",
    short: "Kỹ thuật cổ điển gán mỗi năm/thời kỳ cho một nhà và một hành tinh chủ.",
    origin: "Profection: Hy Lạp - La Mã; Firdaria: truyền thống Ba Tư - Ả Rập thời trung cổ.",
    method:
      "Profection: mỗi năm tuổi tiến một nhà (tuổi 12 quay lại nhà 1); hành tinh chủ (time-lord) là chủ của cung nhà đó. Firdaria: chia đời thành các chu kỳ (mỗi hành tinh 7/10/11/13 năm) theo thứ tự Ba Tư, có 'tiểu thời kỳ' bên trong.",
    reading: "Cho biết năm nay 'sân khấu' là nhà nào và ai (hành tinh nào) đang nắm quyền — rất hiệu quả khi kết hợp transit.",
    bestFor: "Hỏi 'năm nay của tôi xoay quanh việc gì?'.",
    caution: "Đòi hỏi hệ thống nhất quán (whole sign, hành tinh chủ truyền thống).",
    keywords: ["profection", "firdaria", "time lord", "nam nay"]
  },
  {
    id: "predict-horary",
    group: "Dự báo & thời điểm",
    name: "Horary (bói theo câu hỏi) và Electional (chọn thời điểm)",
    short: "Horary: dựng bản đồ tại thời điểm câu hỏi được đặt để trả lời câu hỏi đó; Electional: chọn thời điểm tốt để bắt đầu.",
    origin: "Ba Tư - Ả Rập (horary), truyền thống La Mã về electional; phục hưng mạnh thập niên 1980.",
    method: "Horary: lấy thời điểm + nơi người hỏi, chọn nhà đại diện câu hỏi, xem hành tinh chủ có vuông góc/chuyển cung không. Electional: quét thời điểm để tìm bản đồ có cấu hình mong muốn.",
    reading: "Đọc theo tính hữu hạn của bản đồ: hành tinh 'từ chối' thì câu trả lời là không/khó; thời điểm 'tập hợp' thì thuận.",
    bestFor: "Câu hỏi cụ thể, có thời hạn; chọn ngày ký kết, khai trương, cưới hỏi.",
    caution: "Đây là trường phái kỹ thuật cao, dễ sai nếu không nắm cổ điển; kết quả mang tính tham khảo.",
    keywords: ["horary", "boi", "electional", "chon ngay", "chon thoi diem"]
  },

  /* ------------------------------------------------------------- quan hệ */
  {
    id: "rel-synastry",
    group: "Quan hệ",
    name: "Synastry (đối chiếu hai bản đồ)",
    short: "So sánh trực tiếp hai bản đồ: hành tinh của người này chiếu vào điểm của người kia.",
    origin: "Cổ điển, phát triển mạnh trong chiêm tinh hiện đại.",
    method: "Lấy góc chiếu chéo giữa hai bản đồ, kèm 'overlay' (nhà của người này khi chồng sang nhà người kia).",
    reading: "Mặt Trăng/Thủy Tinh/Kim Tinh chiếu nhau ⇒ dễ hiểu nhau; Hỏa Tinh/Thổ Tinh chiếu ⇒ lực hút mạnh nhưng nhiều va chạm; trục AC-MC chiếu ⇒ quan hệ định hình bằng sự nghiệp, đời sống công khai.",
    bestFor: "Đọc động lực và bài học giữa hai người.",
    caution: "Đừng dùng để phán quyết 'hợp hay không' — synastry mô tả lực, không phải kết cục.",
    keywords: ["synastry", "doi chieu", "hop nhau", "tuong hop"]
  },
  {
    id: "rel-composite",
    group: "Quan hệ",
    name: "Composite & Davison (bản đồ của 'cái hai người tạo thành')",
    short: "Composite: trung điểm từng cặp điểm của hai bản đồ. Davison: bản đồ dựng tại thời điểm/địa điểm ở giữa hai thời điểm/địa điểm sinh.",
    origin: "Composite (trung điểm) từ thập niên 1970 (John Townley); Davison (thập niên 1970) từ Ronald Davison.",
    method: "Composite: trung điểm cung ngắn hơn của từng cặp hành tinh/điểm. Davison: lấy trung bình cộng thời gian và kinh độ địa lý rồi dựng bản đồ thật.",
    reading: "Composite cho biết 'bản chất của quan hệ'; Davison cho biết quan hệ được 'sinh ra' khi nào và ở đâu — dùng tốt cho dự báo quan hệ.",
    bestFor: "Đọc bản chất và tiến trình của một mối quan hệ.",
    caution: "Composite không phải bản đồ có thể tính transit chính xác như natal; nhiều trường phái khác nhau về cách xử lý trung điểm.",
    keywords: ["composite", "davison", "ban do quan he", "trung diem"]
  },
  {
    id: "rel-overlay",
    group: "Quan hệ",
    name: "Overlay / House Overlay",
    short: "Hành tinh của người A rơi vào nhà nào trong bản đồ người B.",
    origin: "Kỹ thuật hiện đại thế kỷ 20.",
    method: "Chiếu vị trí điểm của A lên hệ cusps nhà của B (và ngược lại).",
    reading: "Nếu Mặt Trời A ở nhà 5 của B, B thấy A là niềm vui; Mặt Trời A ở nhà 7 thì B thấy A là 'nửa kia'; ở nhà 12 dễ mơ hồ, mang linh cảm.",
    bestFor: "Hiểu cảm nhận một chiều của mỗi người, khác với synastry (vốn hai chiều).",
    caution: "Rất nhạy với giờ sinh của người B.",
    keywords: ["overlay", "chong nha", "cam nhan mot chieu"]
  },

  /* ---------------------------------------------------------- Vệ Đà */
  {
    id: "vedic-overview",
    group: "Vệ Đà (Jyotish)",
    name: "Lá số Vệ Đà (Kundli) — hệ thống tổng quan",
    short: "Hệ thống chiêm tinh Ấn Độ: dùng hoàng đạo sidereal, 27 nakshatra, dasha theo chu kỳ thời gian.",
    origin: "Kinh Vệ Đà (Vedanga Jyotisha) → Parashara → Jyotish hiện đại.",
    method: "Dùng ayanamsa (thường Lahiri), chia 12 rashi và 12 bhava, thêm hệ nakshatra/varga/dasha/drishti (góc nhìn đặc biệt).",
    reading: "Ba trụ cột: (1) cung Mặt Trăng & nakshatra — tâm trí; (2) cung Mọc & chủ tinh — thân thể, tính cách; (3) Mặt Trời — ý chí, cha, sự nghiệp.",
    bestFor: "Luận giải chi tiết về duyên, sự nghiệp, thời vận theo chu kỳ (dasha).",
    caution: "Dùng hệ hoàng đạo sidereal và các quy tắc hoàn toàn khác phương Tây; đừng trộn lẫn hai cách đọc.",
    keywords: ["ve da", "jyotish", "kundli", "la so an do", "rashi"]
  },
  {
    id: "vedic-nakshatra",
    group: "Vệ Đà (Jyotish)",
    name: "Nakshatra (27 chòm sao Mặt Trăng) & Pada",
    short: "27 chặng 13°20′ chia bầu trời thành các 'tú' — đơn vị tinh tế nhất của tâm trí.",
    origin: "Vệ Đà, được hệ thống hoá trong các kinh Jyotisha.",
    method: "Nakshatra = khoảng 13°20′ của hoàng đạo (360/27); mỗi nakshatra chia 4 pada 3°20′.",
    reading: "Nakshatra của Mặt Trăng là 'janma nakshatra' — mô tả mẫu nhận thức sâu nhất; nakshatra của hành tinh làm chi tiết hoá biểu hiện; pada tạo nên 108 biến thể.",
    bestFor: "Hiểu tầng cảm xúc bên dưới cung Mặt Trăng; chọn ngày (muhurta).",
    caution: "Luôn phải tính bằng hệ sidereal, nếu dùng nhiệt đới sẽ sai nakshatra.",
    keywords: ["nakshatra", "pada", "27 sao", "tam tri mat trang"]
  },
  {
    id: "vedic-dasha",
    group: "Vệ Đà (Jyotish)",
    name: "Vimshottari Dasha (chu kỳ 120 năm)",
    short: "Thời gian được chia thành các giai đoạn của 9 hành tinh tạm — 'lịch' chính của lá số Vệ Đà.",
    origin: "Jyotish cổ điển (Parashara, Jaimini).",
    method: "Bắt đầu từ hành tinh chủ nakshatra của Mặt Trăng; chu kỳ 120 năm chia cho Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17; phần đã đi của nakshatra quyết định 'dư số' khi sinh.",
    reading: "Mahadasha (giai đoạn lớn) cho biết chủ đề chính của hàng chục năm; antardasha (giai đoạn con) cho biết nhịp từng năm-tháng.",
    bestFor: "Dự báo dài hạn — khi nào là thời của sự nghiệp, hôn nhân, thay đổi.",
    caution: "Độ chính xác phụ thuộc ayanamsa và giờ sinh; nhiều nhánh Jyotish dùng các chu kỳ khác ngoài Vimshottari.",
    keywords: ["dasha", "vimshottari", "chu ky 120 nam", "thoi van"]
  },
  {
    id: "vedic-varga",
    group: "Vệ Đà (Jyotish)",
    name: "Varga (bản đồ chia): D9 Navamsa, D10 Dasamsa...",
    short: "Chia mỗi cung thành n phần để tạo bản đồ phụ — 'kính lúp' cho từng chủ đề.",
    origin: "Parashara, phát triển qua nhiều thế kỷ trong Jyotish.",
    method: "Mỗi cung 30° chia thành n phần bằng nhau; phần chứa hành tinh được quy chiếu sang một cung mới theo bảng quy định cổ điển.",
    reading:
      "D9 (Navamsa) quan trọng thứ hai sau bản đồ gốc — đọc sức mạnh thực của hành tinh và hôn nhân; D10 (Dasamsa) cho sự nghiệp; D7 con cái; D2 tài sản; D4 nhà cửa; D60 là tầng nghiệp tinh tế nhất.",
    bestFor: "Kiểm chứng độ 'chắc' của các dấu hiệu trong bản đồ gốc.",
    caution: "Cần độ chính xác thời gian cao; sai vài phút có thể lệch D60.",
    keywords: ["varga", "navamsa", "dasamsa", "ban do chia"]
  },
  {
    id: "vedic-panchang",
    group: "Vệ Đà (Jyotish)",
    name: "Panchang (lịch 5 yếu tố)",
    short: "Năm yếu tố của một ngày: Tithi (ngày trăng), Vara (thứ), Nakshatra, Yoga, Karana.",
    origin: "Vệ Đà; dùng phổ biến trong sinh hoạt và chọn ngày.",
    method: "Tithi: mỗi 12° góc Mặt Trăng - Mặt Trời. Vara: thứ trong tuần. Nakshatra: vị trí Mặt Trăng. Yoga: tổng kinh độ Mặt Trời + Mặt Trăng chia 27. Karana: nửa tithi.",
    reading: "Panchang cho biết 'chất lượng' của ngày — dùng để chọn ngày khởi sự, ký kết, cưới hỏi (muhurta).",
    bestFor: "Chọn thời điểm, hiểu tác động của ngày hiện tại tới một việc cụ thể.",
    caution: "Panchang tính theo giờ địa phương tại nơi quan sát; khác nhau giữa các vùng.",
    keywords: ["panchang", "tithi", "chon ngay tot", "muhurta"]
  },

  /* -------------------------------------------------- Trung Hoa & Maya */
  {
    id: "chinese-bazi",
    group: "Trung Hoa & Maya",
    name: "Tứ Trụ / Bát Tự (BaZi 八字)",
    short: "Bốn trụ Năm - Tháng - Ngày - Giờ, mỗi trụ một cặp Can Chi — hệ thống mệnh lý Trung Hoa.",
    origin: "Mệnh lý Trung Quốc (Tử Bình, thời Tống).",
    method: "Can = 10 thiên can, Chi = 12 địa chi; năm bắt đầu từ Lập Xuân, tháng theo tiết khí (không theo dương lịch), ngày theo chu kỳ 60 Giáp Tý, giờ theo 12 canh.",
    reading:
      "Nhật chủ (can ngày) là 'bản thân'; Ngũ hành cho biết mạnh/yếu; Thập thần (Tỷ Kiên, Kiếp Tài, Thực Thần, Thương Quan, Chính Tài, Thiên Tài, Chính Quan, Thất Sát, Chính Ấn, Thiên Ấn) mô tả quan hệ với 10 khía cạnh; Đại Vận 10 năm cho biết giai đoạn.",
    bestFor: "Đọc tính cách, dụng thần (hành cần bồi), và chu kỳ 10 năm.",
    caution: "Là hệ thống riêng biệt với chiêm tinh quan sát bầu trời — đừng đối chiếu cung hoàng đạo phương Tây.",
    keywords: ["bazi", "tu tru", "bat tu", "can chi", "nhat chu", "am duong", "menh ly"]
  },
  {
    id: "chinese-ziwei",
    group: "Trung Hoa & Maya",
    name: "Tử Vi Đẩu Số (紫微斗數)",
    short: "12 cung với 14 chính tinh — lá số dựng theo năm-tháng-ngày-giờ âm lịch.",
    origin: "Truyền thống Trung Hoa (thời Tống - Minh), phổ biến ở Việt Nam và Đài Loan.",
    method: "Từ năm âm lịch, tháng âm lịch và giờ sinh xác định Can-Cung Mệnh, Ngũ Hành Cục (Thủy nhị, Mộc tam, Kim tứ, Thổ ngũ, Hỏa lục), rồi xếp 14 chính tinh + phụ tinh.",
    reading: "Cung Mệnh (bản chất), Thân (hành động), Quan Lộc (sự nghiệp), Tài Bạch (tiền tài), Phu Thê (hôn nhân)…; mỗi cung có các sao chiếu vào tạo tính chất.",
    bestFor: "Luận về từng chủ đề của cuộc đời theo 12 cung, và vận hạn theo Đại Hạn/Tiểu Hạn.",
    caution: "Có nhiều phái khác nhau về xử lý tháng nhuận và Tiết khí; kết quả từ công thức ước lượng cần đối chiếu phần mềm chuyên dụng.",
    keywords: ["tu vi", "ziwei", "dau so", "12 cung", "chinh tinh"]
  },
  {
    id: "mayan-tzolkin",
    group: "Trung Hoa & Maya",
    name: "Tzolk'in & Haab (lịch Maya)",
    short: "Chu kỳ 260 ngày (13 số × 20 dấu) và 365 ngày (18 tháng × 20 + 5 ngày) của người Maya.",
    origin: "Văn minh Maya (thiên niên kỷ 1 TCN - 1 CN).",
    method: "Tính ngày JDN, trừ hằng số tương quan (584283 hoặc 584285), lấy modulo 13/20 cho Tzolk'in và 20/365 cho Haab.",
    reading: "Tzolk'in được đọc như 'chữ ký năng lượng' (con dấu + số), Haab như vị trí trong năm mặt trời; Long Count cho vị trí trong chu kỳ dài.",
    bestFor: "Ngày sinh, phân tích tính chất ngày, hiểu chu kỳ thời gian cổ.",
    caution: "Ngày lịch Maya bị ảnh hưởng bởi việc chọn hằng số tương quan; nhớ ghi rõ chuẩn đang dùng.",
    keywords: ["maya", "tzolkin", "haab", "lich maya"]
  },

  /* ------------------------------------------------------------- hiện đại */
  {
    id: "modern-hd",
    group: "Hiện đại",
    name: "Human Design (Thiết kế Nhân loại)",
    short: "Hệ thống tổng hợp dùng 64 cổng, 36 kênh, 9 trung tâm từ hai thời điểm (Tính cách và Thiết kế).",
    origin: "Ra Uru Hu (1987), tổng hợp chiêm tinh, Kinh Dịch, kabbalah, luân xa và vật lý.",
    method:
      "Dùng kinh độ Mặt Trời lúc sinh (Tính cách) và lúc Mặt Trời lùi 88° (Thiết kế) cho 13 thiên thể, quy đổi sang 64 cổng (mỗi cổng 5,625°) và vạch 1-6.",
    reading:
      "Trung tâm được xác định (có kênh) vs không xác định quyết định 'chiến lược' và 'thẩm quyền'; kiểu người: Generator, Manifesting Generator, Manifestor, Projector, Reflector.",
    bestFor: "Hiểu cách ra quyết định, năng lượng và cách tương tác với người khác.",
    caution: "Không phải hệ thống khoa học; độ chính xác phụ thuộc giờ sinh và bảng quy đổi cổng.",
    keywords: ["human design", "thiet ke nhan loai", "cong", "kieu nguoi", "reflector", "generator", "projector"]
  },
  {
    id: "modern-midpoint",
    group: "Hiện đại",
    name: "Midpoint (điểm giữa) & Uranian",
    short: "Điểm giữa hai hành tinh được đọc như một điểm độc lập; nền tảng của chiêm tinh Hamburg.",
    origin: "Alfred Witte (1923), phát triển bởi Ebertin.",
    method: "Midpoint = (A + B)/2 theo cung ngắn hơn; hành tinh thứ ba chiếu vào điểm giữa sẽ 'kích hoạt' nó.",
    reading: "Đọc theo cặp: Mặt Trời/Mặt Trăng (phối hợp bản thân - cảm xúc), Kim Tinh/Hỏa Tinh (ham muốn), Thổ Tinh/Thiên Vương (căng giữa kỷ luật và nổi loạn)...",
    bestFor: "Chi tiết hoá cấu trúc bản đồ; hệ thống 90° dial trong trường phái Hamburg.",
    caution: "Dùng nhiều điểm giả định; không phải hệ thống chuẩn hoá nên cần kỷ luật khi đọc.",
    keywords: ["midpoint", "diem giua", "90 do", "dial", "ebertin"]
  },
  {
    id: "modern-harmonic",
    group: "Phái sinh",
    name: "Bản đồ Hài hoà (Harmonic charts)",
    short: "Nhân kinh độ với một số nguyên n để tạo bản đồ của các mối quan hệ chu kỳ.",
    origin: "John Addey (thập niên 1950-70), phát triển từ ý tưởng của Kepler.",
    method: "Kinh độ mới = (kinh độ gốc × n) mod 360; ví dụ nhân 9 cho ra bản đồ tương tự Navamsa của Vệ Đà.",
    reading: "H5 (sáng tạo), H7 (cảm hứng thiêng), H9 (hôn nhân), H16 (biến cố và đỉnh cao), H4 (nền tảng, an cư).",
    bestFor: "Muốn khai thác quan hệ chu kỳ và chủ đề chuyên sâu.",
    caution: "Có thể tạo bất cứ bản đồ nào nhưng không phải tất cả đều có nghĩa; nên giới hạn ở các số truyền thống.",
    keywords: ["harmonic", "hai hoa", "nhan do", "h5", "h9", "h16"]
  },
  {
    id: "modern-draconic",
    group: "Phái sinh",
    name: "Bản đồ Rồng (Draconic)",
    short: "Lấy Bắc giao điểm Mặt Trăng làm 0° Bạch Dương để tạo bản đồ 'linh hồn'.",
    origin: "Chiêm tinh hiện đại (thập niên 1980-90) từ quan niệm node là trục định mệnh.",
    method: "Kinh độ draconic = kinh độ nhiệt đới − kinh độ Bắc giao điểm.",
    reading: "Đọc như tầng 'nhiệm vụ sâu', bản sắc linh hồn; so sánh với bản đồ nhiệt đới để thấy hai lớp mục đích.",
    bestFor: "Phân tích ý nghĩa cuộc đời, so sánh với bản đồ gốc.",
    caution: "Không phải truyền thống cổ điển; nhiều tác giả khác nhau về cách luận.",
    keywords: ["draconic", "ban do rong", "giao diem bac"]
  },
  {
    id: "modern-heliocentric",
    group: "Phái sinh",
    name: "Bản đồ Nhật tâm (Heliocentric)",
    short: "Nhìn mọi hành tinh từ Mặt Trời thay vì từ Trái Đất — không có Mặt Trăng, không có AC/MC.",
    origin: "Chiêm tinh hiện đại thế kỷ 20 (chịu ảnh hưởng thiên văn học Copernic).",
    method: "Tính toạ độ nhật tâm của các hành tinh; bỏ Mặt Trăng và các góc nhà.",
    reading: "Đọc trục Mặt Trời và Trái Đất như hai mặt đối lập; dùng để xem ý chí 'từ trung tâm hệ'.",
    bestFor: "Xem mục đích tổng thể, đối chiếu với bản đồ địa tâm.",
    caution: "Không có nhà nên không đọc như bản đồ natal; ít tài liệu chuẩn.",
    keywords: ["heliocentric", "nhat tam", "nhin tu mat troi"]
  },

  /* --------------------------------------------------------- cổ điển khác */
  {
    id: "hellenistic-dignity",
    group: "Cổ điển Hy Lạp",
    name: "Phẩm chất hành tinh (dignity), Ngũ hành cung, Giới hạn (bounds), Tam hợp, Decan",
    short: "Hệ thống chấm điểm 'quyền lực' của hành tinh theo vị trí — nền tảng của chiêm tinh truyền thống.",
    origin: "Hy Lạp - La Mã (Ptolemy), Ai Cập, sau đó Ba Tư - Ả Rập.",
    method:
      "Mỗi hành tinh có: nhà (domicile), vượng (exaltation), tam hợp (triplicity theo ngày/đêm), giới hạn Ai Cập (bounds/terms), decan (face). Bị lưu đày (detriment) ở cung đối của nhà, suy nhược (fall) ở cung đối của vượng.",
    reading: "Cộng điểm để biết hành tinh 'nói được' hay 'không nói được'; hành tinh có nhiều phẩm chất thì sức luận giải mạnh và đáng tin hơn.",
    bestFor: "Luận giải cổ điển, chọn hành tinh chủ (almuten) cho một câu hỏi.",
    caution: "Khác hoàn toàn thang điểm hiện đại; đòi hỏi kỹ năng, tránh cơ học hoá điểm số.",
    keywords: ["dignity", "pham chat", "vuong", "nha", "tam hop", "bound", "decan", "almuten"]
  }
];

export const VARIANT_GROUPS: VariantGroup[] = [
  "Hệ nhà",
  "Hệ hoàng đạo",
  "Điểm & thiên thể",
  "Hình mẫu & hình dạng",
  "Cổ điển Hy Lạp",
  "Dự báo & thời điểm",
  "Quan hệ",
  "Vệ Đà (Jyotish)",
  "Trung Hoa & Maya",
  "Hiện đại",
  "Phái sinh"
];

export const variantById = (id: string) => VARIANT_CARDS.find((card) => card.id === id);

/** Tìm biến thể theo câu hỏi (không dấu). */
export const findVariants = (normalizedQuestion: string, limit = 3): VariantCard[] =>
  VARIANT_CARDS.filter((card) => card.keywords.some((keyword) => normalizedQuestion.includes(keyword))).slice(0, limit);

/** Số biến thể theo từng nhóm — dùng cho phần tổng quan trong chat. */
export const variantGroupSummary = () =>
  VARIANT_GROUPS.map((group) => ({
    group,
    count: VARIANT_CARDS.filter((card) => card.group === group).length,
    items: VARIANT_CARDS.filter((card) => card.group === group).map((card) => card.name)
  }));

/** Trả lời dạng văn bản cho một biến thể (dùng cho chat nội bộ). */
export const variantAnswer = (card: VariantCard) =>
  [
    `**${card.name}** (nhóm: ${card.group})`,
    card.short,
    `• Nguồn gốc: ${card.origin}`,
    `• Cách tính: ${card.method}`,
    `• Cách đọc: ${card.reading}`,
    `• Dùng tốt nhất cho: ${card.bestFor}`,
    `• Lưu ý: ${card.caution}`
  ].join("\n");
