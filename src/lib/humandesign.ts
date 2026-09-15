/**
 * Human Design (Thiết kế Nhân loại): bánh xe 64 cổng, 36 kênh, 9 trung tâm,
 * 26 yếu tố kích hoạt (13 Tính cách + 13 Thiết kế, cách nhau 88° cung Mặt Trời).
 *
 * Lưu ý: Trung tâm/kênh theo bảng chuẩn của hệ thống Human Design; kết quả nên
 * đối chiếu với phần mềm HD chính thức khi cần độ chính xác tuyệt đối.
 */

import { Body, MakeTime, PairLongitude, SearchSunLongitude, SunPosition } from "astronomy-engine";
import { normalizeDegree } from "@/lib/astro";
import { julianCenturies } from "@/lib/zodiac";

/** Thứ tự 64 cổng trên bánh xe, bắt đầu từ cổng 41 tại 2° Bảo Bình (302° hoàng đạo nhiệt đới). */
export const GATE_WHEEL = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60
];

export type HDCenter = "Head" | "Ajna" | "Throat" | "G" | "Heart" | "Sacral" | "SolarPlexus" | "Spleen" | "Root";

export const CENTER_META: Record<HDCenter, { vi: string; theme: string; motor: boolean }> = {
  Head: { vi: "Đầu (Head)", theme: "nguồn cảm hứng, áp lực từ câu hỏi", motor: false },
  Ajna: { vi: "Ấn Đường (Ajna)", theme: "cách suy nghĩ, phân tích, niềm tin", motor: false },
  Throat: { vi: "Cổ (Throat)", theme: "biểu đạt, hành động, ngôn từ", motor: false },
  G: { vi: "Trung tâm Tự ngã (G)", theme: "bản sắc, hướng đi, tình yêu", motor: false },
  Heart: { vi: "Trung tâm Tim/Ý chí (Ego)", theme: "ý chí, giá trị bản thân, vật chất", motor: true },
  Sacral: { vi: "Trung tâm Tùng (Sacral)", theme: "sinh lực, lao động, tình dục", motor: true },
  SolarPlexus: { vi: "Đám rối Mặt Trời (Solar Plexus)", theme: "cảm xúc, nhạy cảm, trực giác cảm xúc", motor: true },
  Spleen: { vi: "Lách (Spleen)", theme: "trực giác, hệ miễn dịch, nỗi sợ", motor: false },
  Root: { vi: "Chân (Root)", theme: "áp lực, động lực, tiến độ", motor: true }
};

export const GATE_CENTERS: Record<number, HDCenter> = (() => {
  const map: Record<number, HDCenter> = {};
  const assign = (center: HDCenter, gates: number[]) => gates.forEach((gate) => (map[gate] = center));
  assign("Head", [64, 61, 63]);
  assign("Ajna", [47, 24, 4, 17, 43, 11]);
  assign("Throat", [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16]);
  assign("G", [1, 13, 25, 46, 2, 15, 10, 7]);
  assign("Heart", [21, 40, 26, 51]);
  assign("Sacral", [34, 5, 14, 29, 59, 9, 3, 42, 27]);
  assign("SolarPlexus", [6, 37, 22, 36, 30, 55, 49]);
  assign("Spleen", [48, 57, 44, 50, 28, 32, 18]);
  assign("Root", [53, 60, 52, 58, 38, 54, 19, 39, 41]);
  return map;
})();

export const CHANNELS: Array<{ gates: [number, number]; name: string; theme: string }> = [
  { gates: [1, 8], name: "Kênh Cảm hứng", theme: "sáng tạo cá nhân trở thành hình mẫu" },
  { gates: [2, 14], name: "Kênh Nhịp điệu", theme: "giữ nhịp và tài nguyên để đi đúng hướng" },
  { gates: [3, 60], name: "Kênh Đột biến", theme: "đổi mới trong giới hạn, chấp nhận chậm" },
  { gates: [4, 63], name: "Kênh Logic", theme: "đặt câu hỏi để hoàn thiện lý luận" },
  { gates: [5, 15], name: "Kênh Nhịp", theme: "nhịp điệu cá nhân và sự đa dạng" },
  { gates: [6, 59], name: "Kênh Sinh sản", theme: "mở/đóng kết nối, tạo dựng gia đình" },
  { gates: [7, 31], name: "Kênh Alpha", theme: "lãnh đạo bằng tầm nhìn được nói ra" },
  { gates: [9, 52], name: "Kênh Tập trung", theme: "tập trung chi tiết để tạo kết quả" },
  { gates: [10, 20], name: "Kênh Thức tỉnh", theme: "sống đúng mình và hành động ngay" },
  { gates: [10, 34], name: "Kênh Khám phá", theme: "làm theo bản chất, không theo khuôn" },
  { gates: [10, 57], name: "Kênh Hoàn hảo", theme: "trực giác tinh tế về hình thức đúng" },
  { gates: [11, 56], name: "Kênh Tò mò", theme: "chia sẻ ý tưởng, kể chuyện" },
  { gates: [12, 22], name: "Kênh Cởi mở", theme: "cảm xúc xã hội, cần đúng tâm trạng" },
  { gates: [13, 33], name: "Kênh Người kể chuyện", theme: "ghi nhớ và truyền lại kinh nghiệm" },
  { gates: [16, 48], name: "Kênh Tài năng", theme: "luyện tập để đạt tay nghề" },
  { gates: [17, 62], name: "Kênh Chấp nhận", theme: "lập luận chi tiết, kiểm chứng" },
  { gates: [18, 58], name: "Kênh Phán xét", theme: "phê bình để cải thiện chất lượng sống" },
  { gates: [19, 49], name: "Kênh Tổng hợp", theme: "nhạy với nhu cầu cơ bản, nguyên tắc" },
  { gates: [20, 34], name: "Kênh Charisma", theme: "hành động và biểu đạt cùng lúc" },
  { gates: [20, 57], name: "Kênh Trí tuệ", theme: "trực giác thể hiện tức thì" },
  { gates: [21, 45], name: "Kênh Tiền tệ", theme: "quản trị nguồn lực và uy quyền" },
  { gates: [23, 43], name: "Kênh Cấu trúc", theme: "phá vỡ để tái cấu trúc tri thức" },
  { gates: [24, 61], name: "Kênh Nhận thức", theme: "suy ngẫm nội tâm, khoảnh khắc ngộ ra" },
  { gates: [25, 51], name: "Kênh Khởi xướng", theme: "tinh thần tiên phong và dấn thân" },
  { gates: [26, 44], name: "Kênh Dâng hiến", theme: "truyền thông, bán hàng, giữ truyền thống" },
  { gates: [27, 50], name: "Kênh Nuôi dưỡng", theme: "chăm sóc, giữ luật lệ cho nhóm" },
  { gates: [28, 38], name: "Kênh Đấu tranh", theme: "chiến đấu cho điều có ý nghĩa" },
  { gates: [29, 46], name: "Kênh Bền bỉ", theme: "cam kết và trải nghiệm ý nghĩa" },
  { gates: [30, 41], name: "Kênh Nhận biết", theme: "khao khát trải nghiệm, mở chu kỳ mới" },
  { gates: [32, 54], name: "Kênh Chuyển hoá", theme: "tham vọng và bản năng đi lên" },
  { gates: [34, 57], name: "Kênh Sức mạnh", theme: "sức mạnh bản năng, sống trọn từng khoảnh khắc" },
  { gates: [35, 36], name: "Kênh Tạm thời", theme: "trải nghiệm đa dạng, nhiều khởi đầu" },
  { gates: [37, 40], name: "Kênh Cộng đồng", theme: "giao ước, gia đình, hiếu khách" },
  { gates: [39, 55], name: "Kênh Cảm xúc sâu", theme: "tinh thần lãng mạn, tâm trạng thất thường" },
  { gates: [42, 53], name: "Kênh Trưởng thành", theme: "hoàn tất chu kỳ, phát triển theo bước" },
  { gates: [47, 64], name: "Kênh Trừu tượng", theme: "nhớ lại và lý giải quá khứ" }
];

export const HD_PLANETS: Array<{ key: string; body: Body | null; vi: string }> = [
  { key: "sun", body: Body.Sun, vi: "Mặt Trời" },
  { key: "earth", body: null, vi: "Trái Đất" },
  { key: "moon", body: Body.Moon, vi: "Mặt Trăng" },
  { key: "northNode", body: null, vi: "Bắc Giao điểm" },
  { key: "southNode", body: null, vi: "Nam Giao điểm" },
  { key: "mercury", body: Body.Mercury, vi: "Thủy Tinh" },
  { key: "venus", body: Body.Venus, vi: "Kim Tinh" },
  { key: "mars", body: Body.Mars, vi: "Hỏa Tinh" },
  { key: "jupiter", body: Body.Jupiter, vi: "Mộc Tinh" },
  { key: "saturn", body: Body.Saturn, vi: "Thổ Tinh" },
  { key: "uranus", body: Body.Uranus, vi: "Thiên Vương Tinh" },
  { key: "neptune", body: Body.Neptune, vi: "Hải Vương Tinh" },
  { key: "pluto", body: Body.Pluto, vi: "Diêm Vương Tinh" }
];

const GATE_SPAN = 360 / 64; // 5.625°
const LINE_SPAN = GATE_SPAN / 6; // 0.9375°

export type GateActivation = {
  key: string;
  label: string;
  longitude: number;
  gate: number;
  line: number;
  color: number;
  tone: number;
  base: number;
  center: HDCenter;
};

/** Cổng + vạch + màu/âm sắc từ kinh độ hoàng đạo nhiệt đới. */
export const activationOf = (key: string, label: string, longitude: number): GateActivation => {
  const shifted = normalizeDegree(longitude - 302);
  const gateIndex = Math.floor(shifted / GATE_SPAN) % 64;
  const gate = GATE_WHEEL[gateIndex];
  const withinGate = shifted - Math.floor(shifted / GATE_SPAN) * GATE_SPAN;
  const line = Math.floor(withinGate / LINE_SPAN) % 6 + 1;
  const withinLine = withinGate - (line - 1) * LINE_SPAN;
  const color = Math.floor(withinLine / (LINE_SPAN / 6)) % 6 + 1;
  const tone = Math.floor((withinLine % (LINE_SPAN / 6)) / (LINE_SPAN / 36)) % 6 + 1;

  return {
    key,
    label,
    longitude: normalizeDegree(longitude),
    gate,
    line,
    color,
    tone,
    base: ((gate - 1) % 6) + 1,
    center: GATE_CENTERS[gate] ?? "Throat"
  };
};

/** Kinh độ trung bình của giao điểm Mặt Trăng (mean node). */
export const meanNodeLongitude = (date: Date) => {
  const T = julianCenturies(date);
  const omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
  return normalizeDegree(omega);
};

const planetLongitude = (body: Body, date: Date) =>
  normalizeDegree(SunPosition(date).elon + PairLongitude(body, Body.Sun, date));

export type HDChart = {
  personality: GateActivation[];
  design: GateActivation[];
  designDate: Date;
  definedCenters: HDCenter[];
  undefinedCenters: HDCenter[];
  channels: Array<{ gates: [number, number]; name: string; theme: string; centers: [HDCenter, HDCenter] }>;
  type: string;
  typeVi: string;
  strategy: string;
  notSelf: string;
  signature: string;
  authority: string;
  authorityVi: string;
  profile: string;
  profileName: string;
  definition: string;
  definitionNote: string;
  incarnationCross: string;
};

const TYPE_META: Record<string, { vi: string; strategy: string; notSelf: string; signature: string }> = {
  Generator: {
    vi: "Người Kiến tạo (Generator)",
    strategy: "Chờ đợi để đáp lại (respond) — chỉ hành động khi có tín hiệu từ bên ngoài chạm vào Tùng.",
    notSelf: "Thất vọng",
    signature: "Hài lòng, mãn nguyện"
  },
  ManifestingGenerator: {
    vi: "Người Kiến tạo - Biểu lộ (Manifesting Generator)",
    strategy: "Đáp lại trước, rồi hành động nhanh và linh hoạt; được phép bỏ qua bước cho phép.",
    notSelf: "Thất vọng và giận",
    signature: "Hài lòng, nhanh nhẹn"
  },
  Manifestor: {
    vi: "Người Biểu lộ (Manifestor)",
    strategy: "Thông báo trước khi hành động để giảm lực cản.",
    notSelf: "Giận",
    signature: "Bình an"
  },
  Projector: {
    vi: "Người Dẫn dắt (Projector)",
    strategy: "Chờ được mời: cần sự công nhận trước khi chia sẻ hiểu biết.",
    notSelf: "Cay đắng",
    signature: "Thành công"
  },
  Reflector: {
    vi: "Người Phản chiếu (Reflector)",
    strategy: "Chờ trọn một chu kỳ Mặt Trăng (28 ngày) trước quyết định lớn.",
    notSelf: "Thất vọng",
    signature: "Bất ngờ, ngỡ ngàng tích cực"
  }
};

const PROFILE_NAMES: Record<string, string> = {
  "1/3": "Nhà điều tra / Kẻ tử vì đạo — học bằng trải nghiệm, cần nền tảng vững",
  "1/4": "Nhà điều tra / Người cơ hội — kiến thức nền cộng mạng lưới thân thiết",
  "2/4": "Ẩn sĩ / Người cơ hội — tài năng tự nhiên, thành công qua quan hệ gần",
  "2/5": "Ẩn sĩ / Kẻ dị giáo — tài năng tự nhiên bị người khác kỳ vọng giải pháp",
  "3/5": "Kẻ tử vì đạo / Kẻ dị giáo — học qua va chạm, được gọi khi có sự cố",
  "3/6": "Kẻ tử vì đạo / Hình mẫu — trưởng thành qua thử thách rồi thành tấm gương",
  "4/6": "Người cơ hội / Hình mẫu — ảnh hưởng qua cộng đồng rồi trở thành biểu tượng",
  "4/1": "Người cơ hội / Nhà điều tra — cần nghiên cứu kỹ trước khi mở rộng quan hệ",
  "5/1": "Kẻ dị giáo / Nhà điều tra — giải pháp thực tế dựa trên nền tảng nghiên cứu",
  "5/2": "Kẻ dị giáo / Ẩn sĩ — người khác tìm đến, cần không gian riêng để nạp lại",
  "6/2": "Hình mẫu / Ẩn sĩ — hành trình ba giai đoạn, giữ khoảng cách để quan sát",
  "6/3": "Hình mẫu / Kẻ tử vì đạo — trải nghiệm nhiều rồi mới đạt vai trò mẫu mực"
};

const AUTHORITY_ORDER: Array<{ center: HDCenter; vi: string; rule: string }> = [
  { center: "SolarPlexus", vi: "Thẩm quyền Cảm xúc (Emotional)", rule: "cần thời gian qua sóng cảm xúc, không quyết định tức thì" },
  { center: "Sacral", vi: "Thẩm quyền Tùng (Sacral)", rule: "quyết định bằng phản hồi cơ thể ngay lúc này: 'ừ' hay 'không'" },
  { center: "Spleen", vi: "Thẩm quyền Trực giác (Splenic)", rule: "tin vào linh cảm tức thời, lần đầu là đúng nhất" },
  { center: "Heart", vi: "Thẩm quyền Ý chí (Ego)", rule: "cần ý chí và nguồn lực; chỉ nói khi thực sự muốn" },
  { center: "G", vi: "Thẩm quyền Tự ngã (Self-projected)", rule: "nói ra để nghe chính mình, tìm hướng đi qua đối thoại" },
  { center: "Ajna", vi: "Thẩm quyền Tâm trí (Mental Projector)", rule: "suy nghĩ rõ ràng rồi chờ môi trường đúng" },
  { center: "Throat", vi: "Thẩm quyền Môi trường (Environmental)", rule: "quyết định phụ thuộc không gian và người xung quanh" }
];

/** Tính bản đồ Human Design đầy đủ từ ngày giờ sinh (UTC) và kinh độ Mặt Trời natal. */
export const buildHumanDesign = (birthDate: Date, natalSunLongitude: number): HDChart => {
  // 88° trước đó theo cung Mặt Trời: tìm thời điểm Mặt Trời ở (kinh độ sinh − 88°)
  const designTarget = normalizeDegree(natalSunLongitude - 88);
  const searchStart = new Date(birthDate.getTime() - 100 * 86400000);
  const found = SearchSunLongitude(designTarget, MakeTime(searchStart), 110);
  const designDate = found ? found.date : new Date(birthDate.getTime() - 88 * 86400000);

  const activationsAt = (date: Date, prefix: string): GateActivation[] => {
    const sun = normalizeDegree(SunPosition(date).elon);
    const node = meanNodeLongitude(date);

    return HD_PLANETS.map((entry) => {
      const longitude =
        entry.key === "sun"
          ? sun
          : entry.key === "earth"
            ? normalizeDegree(sun + 180)
            : entry.key === "northNode"
              ? node
              : entry.key === "southNode"
                ? normalizeDegree(node + 180)
                : planetLongitude(entry.body as Body, date);

      return activationOf(`${prefix}-${entry.key}`, entry.vi, longitude);
    });
  };

  const personality = activationsAt(birthDate, "p");
  const design = activationsAt(designDate, "d");
  const all = [...personality, ...design];

  // Kênh hoàn chỉnh: cả hai cổng đều được kích hoạt
  const activeGates = new Set(all.map((item) => item.gate));
  const activeChannels = CHANNELS.filter((channel) => channel.gates.every((gate) => activeGates.has(gate))).map((channel) => ({
    ...channel,
    centers: [GATE_CENTERS[channel.gates[0]], GATE_CENTERS[channel.gates[1]]] as [HDCenter, HDCenter]
  }));

  const definedCenters = [...new Set(activeChannels.flatMap((channel) => channel.centers))];
  const allCenters = Object.keys(CENTER_META) as HDCenter[];
  const undefinedCenters = allCenters.filter((center) => !definedCenters.includes(center));

  const throatToMotor = activeChannels.some(
    (channel) =>
      channel.centers.includes("Throat") &&
      channel.centers.some((center) => center !== "Throat" && CENTER_META[center].motor)
  );

  const sacralDefined = definedCenters.includes("Sacral");
  let type = "Projector";
  if (!definedCenters.length) type = "Reflector";
  else if (sacralDefined) type = throatToMotor ? "ManifestingGenerator" : "Generator";
  else if (throatToMotor) type = "Manifestor";

  const authority = AUTHORITY_ORDER.find((entry) => definedCenters.includes(entry.center));
  const authorityVi = type === "Reflector" ? "Thẩm quyền Mặt Trăng (Lunar)" : authority?.vi ?? "Thẩm quyền Môi trường (Environmental)";

  const profile = `${personality[0].line}/${design[0].line}`;

  // Định nghĩa: số cụm trung tâm được nối với nhau
  const adjacency = new Map<HDCenter, Set<HDCenter>>();
  for (const channel of activeChannels) {
    const [a, b] = channel.centers;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  const seen = new Set<HDCenter>();
  let components = 0;
  for (const center of definedCenters) {
    if (seen.has(center)) continue;
    components += 1;
    const stack = [center];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      adjacency.get(current)?.forEach((next) => {
        if (!seen.has(next)) stack.push(next);
      });
    }
  }

  const definition = components <= 1 ? "Định nghĩa đơn (Single Definition)" : components === 2 ? "Định nghĩa kép (Split Definition)" : `Định nghĩa ${components} phần (${components} Definitions)`;
  const definitionNote =
    components <= 1
      ? "Các trung tâm nối liền thành một khối: bạn xử lý thông tin một mạch, khá tự chủ."
      : components === 2
        ? "Hai khối tách rời: bạn dễ bị hút về người có cổng/kênh nối hai khối này lại."
        : `${components} khối tách rời: bạn học nhanh qua nhiều kiểu người khác nhau, và dễ 'mượn' năng lượng của người khác.`;

  const incarnationCross = `${personality[0].gate}/${personality[0].line} | ${personality[2].gate}/${personality[2].line} — Mặt Trời Tính cách ${personality[0].gate} và Mặt Trăng Tính cách ${personality[2].gate}`;

  return {
    personality,
    design,
    designDate,
    definedCenters,
    undefinedCenters,
    channels: activeChannels,
    type,
    typeVi: TYPE_META[type].vi,
    strategy: TYPE_META[type].strategy,
    notSelf: TYPE_META[type].notSelf,
    signature: TYPE_META[type].signature,
    authority: authorityVi,
    authorityVi: authority?.rule ?? "Quan sát qua chu kỳ Mặt Trăng 28 ngày trước quyết định lớn.",
    profile,
    profileName: PROFILE_NAMES[profile] ?? "Tổ hợp vạch — xem thêm tài liệu HD",
    definition,
    definitionNote,
    incarnationCross
  };
};
