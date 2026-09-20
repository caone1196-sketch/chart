/**
 * Bảng tri thức tiếng Việt dùng cho bộ luận giải nội bộ (không cần API key).
 * Nội dung là kiến thức chiêm tinh phổ thông, viết lại theo cách trung lập - tham khảo.
 */

export type PlanetKeyword = {
  label: string;
  role: string;
  theme: string;
  need: string;
};

export const PLANET_KEYWORDS: Record<string, PlanetKeyword> = {
  sun: {
    label: "Mặt Trời",
    role: "bản ngã, mục tiêu sống",
    theme: "bạn toả sáng ở đâu, điều gì cho bạn cảm giác mình là chính mình",
    need: "được công nhận đúng với giá trị thật"
  },
  moon: {
    label: "Mặt Trăng",
    role: "nhu cầu cảm xúc, thói quen, gia đình",
    theme: "điều làm bạn thấy an toàn, cách bạn phản ứng khi bị tổn thương",
    need: "cảm giác được nuôi dưỡng và thuộc về"
  },
  mercury: {
    label: "Thủy Tinh",
    role: "tư duy, ngôn ngữ, học tập",
    theme: "cách bạn nghĩ, nói, học và thương lượng",
    need: "thông tin rõ ràng và được lắng nghe"
  },
  venus: {
    label: "Kim Tinh",
    role: "tình cảm, giá trị, thẩm mỹ",
    theme: "cách bạn yêu, điều bạn thấy đẹp và đáng giá",
    need: "hài hoà, được trân trọng"
  },
  mars: {
    label: "Hỏa Tinh",
    role: "hành động, ham muốn, động lực",
    theme: "cách bạn tấn công mục tiêu, cách bạn nổi nóng",
    need: "được hành động và cạnh tranh lành mạnh"
  },
  jupiter: {
    label: "Mộc Tinh",
    role: "may mắn, mở rộng, niềm tin",
    theme: "nơi bạn dễ gặp quý nhân và phát triển nhanh",
    need: "lý tưởng lớn hơn bản thân"
  },
  saturn: {
    label: "Thổ Tinh",
    role: "kỷ luật, trách nhiệm, bài học",
    theme: "lĩnh vực bạn phải trả giá bằng thời gian và sự kiên trì",
    need: "cấu trúc, cam kết, thành quả bền"
  },
  uranus: {
    label: "Thiên Vương Tinh",
    role: "đột phá, tự do, công nghệ",
    theme: "nơi bạn cần khác biệt và dễ tạo bước ngoặt",
    need: "không gian để đổi mới"
  },
  neptune: {
    label: "Hải Vương Tinh",
    role: "trực giác, giấc mơ, lòng trắc ẩn",
    theme: "nơi bạn dễ lý tưởng hoá hoặc mơ hồ",
    need: "truyền cảm hứng và được tin tưởng"
  },
  pluto: {
    label: "Diêm Vương Tinh",
    role: "chuyển hoá, quyền lực, chiều sâu",
    theme: "nơi bạn phải chết đi một phần để mạnh hơn",
    need: "quyền tự quyết đối với vận mệnh của mình"
  }
};

export const SIGN_TRAITS: Record<string, { core: string; strength: string; shadow: string; need: string }> = {
  "Bạch Dương": {
    core: "khởi động nhanh, thích là làm, cần chiến tuyến rõ",
    strength: "dũng khí, khả năng mở đường, không ngại rủi ro",
    shadow: "bốc đồng, dễ chán, thiếu kiên nhẫn với quy trình",
    need: "mục tiêu mới và quyền chủ động"
  },
  "Kim Ngưu": {
    core: "chậm mà chắc, coi trọng an toàn và cảm giác dễ chịu",
    strength: "kiên định, xây dựng tài sản, khả năng chịu đựng",
    shadow: "cứng nhắc, sợ thay đổi, dễ bám vào thói quen",
    need: "ổn định vật chất và nhịp sống đều"
  },
  "Song Tử": {
    core: "nhanh trí, nhiều mối quan tâm, thích kết nối thông tin",
    strength: "giao tiếp, học nhanh, linh hoạt đa nhiệm",
    shadow: "phân tán, nói nhiều hơn làm, cả thèm chóng chán",
    need: "đa dạng và đối thoại"
  },
  "Cự Giải": {
    core: "cảm xúc sâu, gắn với gia đình và ký ức",
    strength: "đồng cảm, chăm sóc, trực giác về nhu cầu người khác",
    shadow: "nhạy cảm quá mức, phòng thủ, khó buông",
    need: "mái ấm tinh thần và sự an toàn"
  },
  "Sư Tử": {
    core: "muốn toả sáng, hào phóng, cần được nhìn nhận",
    strength: "sức hút, khả năng truyền cảm hứng, sáng tạo sân khấu",
    shadow: "tự ái cao, cần chú ý, dễ tổn thương khi bị phớt lờ",
    need: "sân khấu để thể hiện và được tán thưởng thật lòng"
  },
  "Xử Nữ": {
    core: "phân tích, cầu toàn, thích cải thiện từng chi tiết",
    strength: "tỉ mỉ, kỷ luật, năng lực tối ưu và sửa lỗi",
    shadow: "hay phán xét, lo lắng, tự đòi hỏi quá cao",
    need: "tiêu chuẩn rõ ràng và công việc hữu ích"
  },
  "Thiên Bình": {
    core: "hướng quan hệ, tìm cân bằng và cái đẹp",
    strength: "ngoại giao, thẩm mỹ, nhìn được nhiều phía",
    shadow: "do dự, ngại xung đột, dễ phụ thuộc người khác",
    need: "mối quan hệ công bằng và môi trường hài hoà"
  },
  "Bọ Cạp": {
    core: "đi sâu, mãnh liệt, thích kiểm soát cốt lõi vấn đề",
    strength: "bản lĩnh, sức chịu đựng, khả năng tái sinh sau biến cố",
    shadow: "đa nghi, cực đoan, khó tha thứ",
    need: "sự thật và kết nối đủ sâu để tin"
  },
  "Nhân Mã": {
    core: "mở rộng, học hỏi, hướng tới chân lý và tự do",
    strength: "lạc quan, tầm nhìn, dám đi xa và truyền niềm tin",
    shadow: "thiếu kiên định, nói thẳng quá mức, hứa nhiều",
    need: "không gian rộng và ý nghĩa lớn"
  },
  "Ma Kết": {
    core: "mục tiêu dài hạn, trách nhiệm, leo từng bậc",
    strength: "bền bỉ, tổ chức, uy tín xây bằng thực lực",
    shadow: "khô khan, tự gánh, đánh giá thấp cảm xúc",
    need: "thành quả có thể đo đếm và vị thế vững"
  },
  "Bảo Bình": {
    core: "tư duy hệ thống, khác biệt, hướng cộng đồng",
    strength: "đổi mới, độc lập, nhìn xa hơn số đông",
    shadow: "lý trí hoá cảm xúc, tách rời, bướng",
    need: "tự do tư duy và nhóm đồng điệu"
  },
  "Song Ngư": {
    core: "hoà tan, trực giác, nhạy với cảm xúc tập thể",
    strength: "tưởng tượng, đồng cảm, thiên hướng nghệ thuật - tâm linh",
    shadow: "mơ hồ, dễ bị ảnh hưởng, trốn tránh ranh giới",
    need: "không gian sáng tạo và ranh giới lành mạnh"
  }
};

export const HOUSE_THEMES: Record<number, { name: string; topics: string; advice: string }> = {
  1: { name: "Nhà 1 - Bản thân", topics: "ngoại hình, phong thái, cách bạn bắt đầu mọi việc", advice: "đầu tư vào sự hiện diện và sức khỏe nền tảng" },
  2: { name: "Nhà 2 - Tài sản", topics: "tiền do bạn tự kiếm, giá trị bản thân, kỹ năng sinh lời", advice: "xây kỹ năng hiếm để tăng giá trị bản thân" },
  3: { name: "Nhà 3 - Giao tiếp", topics: "học tập, viết, anh chị em, di chuyển ngắn", advice: "đầu tư vào ngôn ngữ và mạng lưới gần" },
  4: { name: "Nhà 4 - Gia đình", topics: "nhà cửa, gốc rễ, nền tảng cảm xúc", advice: "chăm sóc tổ ấm và gốc rễ tinh thần" },
  5: { name: "Nhà 5 - Sáng tạo", topics: "tình cảm lãng mạn, con cái, vui chơi, đầu cơ", advice: "dành thời gian cho thứ khiến bạn thích thú thật sự" },
  6: { name: "Nhà 6 - Công việc thường ngày", topics: "công việc, sức khỏe, thói quen, dịch vụ", advice: "thiết kế thói quen nhỏ nhưng đều" },
  7: { name: "Nhà 7 - Quan hệ 1-1", topics: "hôn nhân, đối tác, hợp đồng, người phản chiếu bạn", advice: "chọn đối tác theo giá trị chung, không chỉ theo cảm xúc" },
  8: { name: "Nhà 8 - Chia sẻ nguồn lực", topics: "tiền chung, đầu tư, chuyển hoá, nội tâm sâu", advice: "minh bạch tài chính và học cách buông kiểm soát" },
  9: { name: "Nhà 9 - Mở rộng", topics: "học cao, du lịch xa, triết lý, xuất ngoại", advice: "đầu tư vào trải nghiệm và kiến thức nền" },
  10: { name: "Nhà 10 - Sự nghiệp", topics: "địa vị, uy tín, mục tiêu nghề nghiệp dài hạn", advice: "xây thương hiệu cá nhân và chọn đúng hình mẫu" },
  11: { name: "Nhà 11 - Cộng đồng", topics: "bạn bè, tổ chức, cộng đồng, mục tiêu tập thể", advice: "tham gia nhóm đúng tầm để mở cơ hội" },
  12: { name: "Nhà 12 - Vô thức", topics: "ẩn giấu, tâm linh, giấc mơ, việc âm thầm", advice: "giữ thời gian tĩnh lặng để nạp lại năng lượng" }
};

export const ASPECT_TONES: Record<string, { nature: string; opportunity: string; challenge: string }> = {
  Conjunction: {
    nature: "hai năng lượng hoà lẫn, khuếch đại nhau",
    opportunity: "tập trung sức mạnh vào một mục tiêu duy nhất",
    challenge: "khó nhìn ra điểm mù vì không có khoảng cách"
  },
  Sextile: {
    nature: "hỗ trợ nhẹ, mở ra cơ hội nếu chủ động",
    opportunity: "chủ động đề nghị, kết nối, thử nghiệm",
    challenge: "cơ hội dễ trôi qua nếu bạn chờ đợi"
  },
  Square: {
    nature: "căng thẳng thúc ép hành động",
    opportunity: "tạo đột phá khi chịu khó giải quyết xung đột gốc",
    challenge: "dễ đối đầu, mệt mỏi, lặp lại vòng luẩn quẩn"
  },
  Trine: {
    nature: "thuận lợi tự nhiên, tài năng sẵn có",
    opportunity: "dùng thế mạnh này làm nền tảng, không ỷ lại",
    challenge: "dễ ngủ quên trên sự dễ dàng"
  },
  Opposition: {
    nature: "hai cực kéo bạn về hai hướng",
    opportunity: "trưởng thành nhờ nhìn cả hai phía và chọn điểm giữa",
    challenge: "dễ phản ứng cực đoan hoặc đổ lỗi cho người khác"
  }
};

export const ELEMENT_TRAITS: Record<string, { trait: string; excess: string; lacking: string }> = {
  fire: { trait: "Lửa: hành động, tự tin, truyền cảm hứng", excess: "dễ nóng vội, hứa nhiều hơn sức", lacking: "cuộc sống thường thiếu động lực khởi phát" },
  earth: { trait: "Đất: thực tế, bền bỉ, xây được thứ hữu hình", excess: "dễ bảo thủ, bám vào kế hoạch cũ", lacking: "khó biến ý tưởng thành kết quả cụ thể" },
  air: { trait: "Khí: lý trí, giao tiếp, mạng lưới", excess: "dễ sống trên bình diện lý thuyết, xa rời cảm xúc", lacking: "khó diễn đạt và thương lượng" },
  water: { trait: "Nước: cảm xúc, trực giác, kết nối sâu", excess: "dễ thấm đẫm cảm xúc, khó dứt", lacking: "khó nhận diện và gọi tên cảm xúc của mình" }
};

export const MOON_PHASE_TRAITS: Record<string, string> = {
  "Trăng mới": "khởi đầu mới, mở vòng lặp 28 ngày cho dự định mới",
  "Trăng lưỡi liềm đầu tháng": "tăng tốc cho ý tưởng vừa nhen, cần thêm nuôi dưỡng",
  "Thượng huyền": "mốc vượt lực cản đầu tiên, dễ dao động giữa chọn và không chọn",
  "Trăng khuyết đầu": "mài dũa chi tiết, khắt khe hơn với chính mình",
  "Trăng tròn": "đỉnh cảm xúc, điều gì đã gieo sẽ hiện rõ",
  "Trăng khuyết cuối": "nhìn lại, giải phóng thứ không còn phù hợp",
  "Hạ huyền": "điều chỉnh, sửa sai, buộc phải chọn một hướng",
  "Trăng lưỡi liềm cuối tháng": "tĩnh lặng, dọn dẹp, chuẩn bị cho chu kỳ mới"
};

export type Intent =
  | "overview"
  | "personality"
  | "career"
  | "love"
  | "money"
  | "health"
  | "family"
  | "study"
  | "travel"
  | "timing"
  | "compatibility"
  | "sky"
  | "fixedstar"
  | "points"
  | "chart"
  | "lucky";

/** Từ khoá nhận diện ý định, viết ở dạng không dấu (người dùng hay gõ không dấu). */
export const INTENT_KEYWORDS: Array<{ intent: Intent; keys: string[]; label: string }> = [
  { intent: "career", label: "Sự nghiệp", keys: ["su nghiep", "nghe nghiep", "cong viec", "viec lam", "nghe ", "thang tien", "kinh doanh", "startup", "khoi nghiep", "sep ", "dong nghiep", "vi tri ", "vai tro ", "cong danh"] },
  { intent: "love", label: "Tình cảm", keys: ["tinh cam", "tinh yeu", "yeu ", "hon nhan", "vo ", "chong", "ban doi", "nguoi yeu", "duyen", "hen ho", "ket hon", "chia tay", "crush", "nhan tinh"] },
  { intent: "money", label: "Tài chính", keys: ["tien", "tai chinh", "thu nhap", "luong", "dau tu", "co phieu", "tiet kiem", "giau", "no ", "vay", "tai san", "kinh te"] },
  { intent: "health", label: "Sức khỏe", keys: ["suc khoe", "benh", "the luc", "met", "ngu ", "stress", "cang thang", "an uong", "chua lanh", "tap luyen"] },
  { intent: "family", label: "Gia đình", keys: ["gia dinh", "bo ", "me ", "cha ", "nha ", "to tien", "con cai", "anh em", "goc re"] },
  { intent: "study", label: "Học tập", keys: ["hoc", "thi ", "truong", "du hoc", "nghien cuu", "bang cap", "chuyen nganh", "luyen thi"] },
  { intent: "travel", label: "Di chuyển & nơi ở", keys: ["di lai", "du lich", "nuoc ngoai", "xuat ngoai", "dinh cu", "chuyen nha", "di xa", "chuyen di"] },
  { intent: "timing", label: "Vận hạn & thời điểm", keys: ["khi nao", "thoi diem", "thoi gian nay", "giai doan nay", "giai doan hien tai", "luc nay", "hien nay", "nam nay", "nam toi", "thang ", "thang nay", "thang toi", "tuan ", "tuan nay", "tuan toi", "tuong lai", "sap toi", "van ", "van han", "han ", "202", "thoi gian toi", "bao lau", "transit", "anh huong", "tac dong", "dang chieu", "sao nao dang"] },
  { intent: "compatibility", label: "Tương hợp", keys: ["tuong hop", "hop voi", "cung nao", "nguoi ay", "doi phuong", "hop nhau", "synastry"] },
  { intent: "fixedstar", label: "Sao cố định", keys: ["sao co dinh", "fixed star", "ngoi sao nao", "regulus", "sirius", "aldebaran", "antares", "vega", "sao chieu", "chom sao nao"] },
  { intent: "points", label: "Điểm bổ sung", keys: ["diem bo sung", "diem them", "tieu hanh tinh", "chiron", "lilith", "black moon", "ceres", "pallas", "juno", "vesta", "eris", "sedna", "giao diem", "true node", "mean node", "south node", "rahu", "ketu", "selena", "white moon", "hamburg", "uranian", "cupido", "hades", "zeus", "kronos", "apollon", "admetos", "vulkanus", "poseidon", "transpluto"] },
  { intent: "sky", label: "Bầu trời", keys: ["bau troi", "toi nay", "hom nay", "bay gio", "hien tai", "mat trang o", "hanh tinh nao", "moc ", "lan ", "quan sat", "ngam sao", "ngan ha"] },
  { intent: "personality", label: "Tính cách", keys: ["tinh cach", "diem manh", "diem yeu", "toi la nguoi", "ban than", "su manh", "su yeu", "mẫu nguoi", "mau nguoi", "noi tam"] },
  { intent: "lucky", label: "Màu sắc & may mắn", keys: ["mau ", "con so", "may man", "ngay tot", "vật phẩm", "phong thuy", "biet danh"] },
  { intent: "chart", label: "Giải thích bản đồ sao", keys: ["ban do sao", "chart", "giai thich", "la gi", "nghia la", "cung moc", "ac ", "mc ", "nha 1", "nha 2", "nha 3", "nha 4", "nha 5", "nha 6", "nha 7", "nha 8", "nha 9", "nha 10", "nha 11", "nha 12"] }
];

export const HOUSE_NUMBER_PATTERN = /nh[àa]\s*(\d{1,2})/i;

export const normalizeVietnamese = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
