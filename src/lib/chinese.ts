/**
 * Chiêm tinh Trung Hoa & Maya:
 *  - Tứ Trụ (BaZi / 八字): 4 trụ năm - tháng - ngày - giờ, Thập Thần, Ngũ Hành, Đại Vận.
 *  - Tử Vi Đẩu Số (紫微斗數): 12 cung, Mệnh/Thân, Ngũ Hành Cục, 14 chính tinh.
 *  - Maya: Tzolk'in, Haab, Long Count (tương quan GMT 584283).
 */

import { SunPosition } from "astronomy-engine";
import { normalizeDegree } from "@/lib/astro";
import { julianDay } from "@/lib/sky";
import { ZI_HOUR_START, lunarForBirth } from "@/lib/lunar";

export const STEMS = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
export const STEMS_HAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const BRANCHES = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
export const BRANCHES_HAN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
export const BRANCH_ANIMALS = ["Chuột", "Trâu", "Hổ", "Mèo", "Rồng", "Rắn", "Ngựa", "Dê", "Khỉ", "Gà", "Chó", "Lợn"];

export const ELEMENTS = ["Mộc", "Hỏa", "Thổ", "Kim", "Thủy"] as const;
export type Element = (typeof ELEMENTS)[number];

/** Ngũ hành của 10 thiên can. */
export const STEM_ELEMENTS: Element[] = ["Mộc", "Mộc", "Hỏa", "Hỏa", "Thổ", "Thổ", "Kim", "Kim", "Thủy", "Thủy"];
export const STEM_YANG = [true, false, true, false, true, false, true, false, true, false];

/** Ngũ hành của 12 địa chi. */
export const BRANCH_ELEMENTS: Element[] = ["Thủy", "Thổ", "Mộc", "Mộc", "Thổ", "Hỏa", "Hỏa", "Thổ", "Kim", "Kim", "Thổ", "Thủy"];

const HIDDEN_STEMS: Array<{ branch: number; stems: number[] }> = [
  { branch: 0, stems: [9] }, // Tý - Quý
  { branch: 1, stems: [5, 9, 7] }, // Sửu - Kỷ, Quý, Tân
  { branch: 2, stems: [0, 2, 4] }, // Dần - Giáp, Bính, Mậu
  { branch: 3, stems: [1] }, // Mão - Ất
  { branch: 4, stems: [4, 1, 9] }, // Thìn - Mậu, Ất, Quý
  { branch: 5, stems: [2, 4, 6] }, // Tỵ - Bính, Mậu, Canh
  { branch: 6, stems: [3, 5] }, // Ngọ - Đinh, Kỷ
  { branch: 7, stems: [5, 3, 1] }, // Mùi - Kỷ, Đinh, Ất
  { branch: 8, stems: [6, 8, 4] }, // Thân - Canh, Nhâm, Mậu
  { branch: 9, stems: [7] }, // Dậu - Tân
  { branch: 10, stems: [4, 7, 3] }, // Tuất - Mậu, Tân, Đinh
  { branch: 11, stems: [8, 0] } // Hợi - Nhâm, Giáp
];

/** Sinh khắc ngũ hành: element sản sinh / khắc chế. */
const PRODUCES: Record<Element, Element> = { Mộc: "Hỏa", Hỏa: "Thổ", Thổ: "Kim", Kim: "Thủy", Thủy: "Mộc" };
const CONTROLS: Record<Element, Element> = { Mộc: "Thổ", Thổ: "Thủy", Thủy: "Hỏa", Hỏa: "Kim", Kim: "Mộc" };

export type TenGod = {
  key: string;
  vi: string;
  han: string;
  relation: string;
  meaning: string;
};

const TEN_GODS: Record<string, TenGod> = {
  companion: { key: "companion", vi: "Tỷ Kiên", han: "比肩", relation: "cùng hành, cùng âm dương", meaning: "bản ngã, anh em, bạn đồng trang lứa, tính tự lập" },
  robWealth: { key: "robWealth", vi: "Kiếp Tài", han: "劫財", relation: "cùng hành, khác âm dương", meaning: "cạnh tranh, bạn bè tiêu hao, tinh thần liều lĩnh" },
  eatingGod: { key: "eatingGod", vi: "Thực Thần", han: "食神", relation: "hành tôi sinh, cùng âm dương", meaning: "sáng tạo, hưởng thụ, biểu đạt ôn hoà" },
  hurtingOfficer: { key: "hurtingOfficer", vi: "Thương Quan", han: "傷官", relation: "hành tôi sinh, khác âm dương", meaning: "tài năng nổi trội, phá cách, khó chịu với khuôn khổ" },
  indirectWealth: { key: "indirectWealth", vi: "Thiên Tài", han: "偏財", relation: "hành tôi khắc, cùng âm dương", meaning: "tiền đến từ cơ hội, đầu tư, quan hệ rộng" },
  directWealth: { key: "directWealth", vi: "Chính Tài", han: "正財", relation: "hành tôi khắc, khác âm dương", meaning: "thu nhập ổn định, lương, quản lý tài chính" },
  sevenKillings: { key: "sevenKillings", vi: "Thất Sát", han: "七殺", relation: "hành khắc tôi, cùng âm dương", meaning: "áp lực, kỷ luật sắt, cạnh tranh, quyền uy" },
  directOfficer: { key: "directOfficer", vi: "Chính Quan", han: "正官", relation: "hành khắc tôi, khác âm dương", meaning: "danh phận, trách nhiệm, sự nghiệp chính danh" },
  indirectResource: { key: "indirectResource", vi: "Thiên Ấn", han: "偏印", relation: "hành sinh tôi, cùng âm dương", meaning: "trực giác, tư duy lệch chuẩn, học thuật đặc biệt" },
  directResource: { key: "directResource", vi: "Chính Ấn", han: "正印", relation: "hành sinh tôi, khác âm dương", meaning: "che chở, học vấn, mẹ, danh dự" }
};

/** Xác định Thập Thần của một thiên can so với Nhật Chủ. */
export const tenGodOf = (dayStem: number, otherStem: number): TenGod => {
  const me = STEM_ELEMENTS[dayStem];
  const other = STEM_ELEMENTS[otherStem];
  const samePolarity = STEM_YANG[dayStem] === STEM_YANG[otherStem];

  if (me === other) return samePolarity ? TEN_GODS.companion : TEN_GODS.robWealth;
  if (PRODUCES[me] === other) return samePolarity ? TEN_GODS.eatingGod : TEN_GODS.hurtingOfficer;
  if (CONTROLS[me] === other) return samePolarity ? TEN_GODS.indirectWealth : TEN_GODS.directWealth;
  if (CONTROLS[other] === me) return samePolarity ? TEN_GODS.sevenKillings : TEN_GODS.directOfficer;
  return samePolarity ? TEN_GODS.indirectResource : TEN_GODS.directResource;
};

export type Pillar = {
  label: string;
  stem: number;
  branch: number;
  stemVi: string;
  branchVi: string;
  stemHan: string;
  branchHan: string;
  animal: string;
  element: Element;
  tenGod: TenGod;
  hiddenGods: TenGod[];
};

export type BaziChart = {
  pillars: Pillar[];
  dayMaster: { stem: number; element: Element; yang: boolean; vi: string; han: string };
  elementScore: Record<Element, number>;
  dominantElement: Element;
  weakestElement: Element;
  usefulGodHint: string;
  luckPillars: Array<{ ageStart: number; stem: number; branch: number; vi: string; tenGod: TenGod }>;
  luckDirection: "thuận" | "nghịch";
  solarTermNote: string;
  dayMasterStrength: { score: number; label: string; note: string };
};

const twoDigit = (value: number) => String(value).padStart(2, "0");

/** Ngũ hành Nạp Âm của cặp can-chi (theo bảng 60 Giáp Tý). */
const NAYIN_ELEMENTS: Element[] = [
  "Kim", "Hỏa", "Mộc", "Thổ", "Kim", "Hỏa", "Thủy", "Thổ", "Kim", "Mộc",
  "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy", "Kim", "Hỏa", "Mộc", "Thổ", "Kim",
  "Hỏa", "Thủy", "Thổ", "Kim", "Mộc", "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy"
];

/** Chỉ số trong vòng 60 Giáp Tý từ cặp can - chi (CRT). */
export const jiaziIndex = (stem: number, branch: number) => {
  for (let k = 0; k < 60; k += 1) {
    if (k % 10 === ((stem % 10) + 10) % 10 && k % 12 === ((branch % 12) + 12) % 12) return k;
  }
  return -1;
};

const nayinElement = (stem: number, branch: number) => {
  const index = jiaziIndex(stem, branch);
  if (index < 0) return "Thổ" as Element;
  return NAYIN_ELEMENTS[Math.floor(index / 2)];
};

/** Tiết khí (24 tiết) — xác định tháng theo kinh độ Mặt Trời (tropical). */
const SOLAR_TERMS = [
  { longitude: 315, name: "Lập Xuân" },
  { longitude: 345, name: "Kinh Trập" },
  { longitude: 15, name: "Thanh Minh" },
  { longitude: 45, name: "Lập Hạ" },
  { longitude: 75, name: "Mang Chủng" },
  { longitude: 105, name: "Tiểu Thử" },
  { longitude: 135, name: "Lập Thu" },
  { longitude: 165, name: "Bạch Lộ" },
  { longitude: 195, name: "Hàn Lộ" },
  { longitude: 225, name: "Lập Đông" },
  { longitude: 255, name: "Đại Tuyết" },
  { longitude: 285, name: "Tiểu Hàn" }
];

/** Chỉ số tháng theo tiết khí: 0 = tháng Dần (từ Lập Xuân). */
const solarMonthIndex = (sunLongitude: number) => Math.floor(normalizeDegree(sunLongitude - 315) / 30);

/** Tính Tứ Trụ (BaZi) từ thời điểm UTC và giờ địa phương. */
export const buildBazi = (
  utcDate: Date,
  localDate: Date,
  localHour: number,
  longitude: number,
  options: { gender: "nam" | "nữ" }
): BaziChart => {
  const sunLongitude = normalizeDegree(SunPosition(utcDate).elon);
  const monthIndex = solarMonthIndex(sunLongitude); // 0 = Dần

  // Trụ năm: năm can chi đổi tại Lập Xuân (Mặt Trời 315°). Chỉ tháng 1–2 mới có thể còn trước Lập Xuân,
  // nên điều kiện "chưa qua Lập Xuân" = đang ở tháng 1 hoặc 2 và kinh độ Mặt Trời < 315°.
  const beforeLichun =
    (localDate.getMonth() === 0 || localDate.getMonth() === 1) && normalizeDegree(sunLongitude) < 315;
  const baziYear = beforeLichun ? localDate.getFullYear() - 1 : localDate.getFullYear();
  const yearStem = ((baziYear - 4) % 10 + 10) % 10;
  const yearBranch = ((baziYear - 4) % 12 + 12) % 12;

  // Trụ tháng: can tháng theo "Ngũ Hổ Độn" từ can năm
  const monthBranch = (2 + monthIndex) % 12;
  const monthStem = ((yearStem % 5) * 2 + 2 + monthIndex) % 10;

  // Trụ ngày: theo JDN + 49 (kiểm chứng: 1900-01-01 = Giáp Tuất, 2000-01-01 = Mậu Ngọ).
  // Ngày can chi đổi lúc 23 giờ (giờ Tý), nên ca sinh 23:00–23:59 thuộc trụ ngày hôm sau.
  const dayCarry = localHour >= ZI_HOUR_START ? 1 : 0;
  const jdn = Math.floor(julianDay(new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate() + dayCarry, 12))) + 0.5);
  const dayIndex = ((jdn + 49) % 60 + 60) % 60;
  const dayStem = dayIndex % 10;
  const dayBranch = dayIndex % 12;

  // Trụ giờ: chi giờ theo giờ địa phương thực (đã quy đổi theo kinh độ)
  const localSolarHour = localHour + (longitude - 105) / 15;
  const hourBranch = Math.floor((((localSolarHour + 1) % 24) + 24) % 24 / 2) % 12;
  const hourStem = ((dayStem % 5) * 2 + hourBranch) % 10;

  const hiddenGodsFor = (branch: number) =>
    (HIDDEN_STEMS.find((item) => item.branch === branch)?.stems ?? []).map((stem) => tenGodOf(dayStem, stem));

  const makePillar = (label: string, stem: number, branch: number, isDay = false): Pillar => ({
    label,
    stem,
    branch,
    stemVi: STEMS[stem],
    branchVi: BRANCHES[branch],
    stemHan: STEMS_HAN[stem],
    branchHan: BRANCHES_HAN[branch],
    animal: BRANCH_ANIMALS[branch],
    element: STEM_ELEMENTS[stem],
    tenGod: isDay ? TEN_GODS.companion : tenGodOf(dayStem, stem),
    hiddenGods: hiddenGodsFor(branch)
  });

  const pillars: Pillar[] = [
    makePillar("Năm", yearStem, yearBranch),
    makePillar("Tháng", monthStem, monthBranch),
    makePillar("Ngày", dayStem, dayBranch, true),
    makePillar("Giờ", hourStem, hourBranch)
  ];

  // Cân bằng ngũ hành: can (1 điểm), chi (1 điểm), tàng can (0,5 điểm chia theo số tàng)
  const elementScore: Record<Element, number> = { Mộc: 0, Hỏa: 0, Thổ: 0, Kim: 0, Thủy: 0 };
  for (const pillar of pillars) {
    elementScore[STEM_ELEMENTS[pillar.stem]] += 1;
    elementScore[BRANCH_ELEMENTS[pillar.branch]] += 0.8;
    const hidden = HIDDEN_STEMS.find((item) => item.branch === pillar.branch)?.stems ?? [];
    hidden.forEach((stem, index) => {
      elementScore[STEM_ELEMENTS[stem]] += index === 0 ? 0.6 : 0.3;
    });
  }

  const dayElement = STEM_ELEMENTS[dayStem];
  const support = elementScore[dayElement] + elementScore[Object.entries(PRODUCES).find(([, value]) => value === dayElement)![0] as Element];
  const drain =
    elementScore[PRODUCES[dayElement]] + elementScore[CONTROLS[dayElement]] + elementScore[Object.entries(CONTROLS).find(([, v]) => v === dayElement)![0] as Element];
  const strengthScore = support - drain * 0.8;
  const strengthLabel = strengthScore > 1.5 ? "Thân vượng" : strengthScore < -1.5 ? "Thân nhược" : "Trung hoà";

  const sorted = (Object.entries(elementScore) as Array<[Element, number]>).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const weakest = sorted[sorted.length - 1][0];

  const usefulGodHint =
    strengthLabel === "Thân nhược"
      ? `Nhật chủ ${STEMS[dayStem]} (${dayElement}) hơi yếu → nên dùng hành sinh trợ (${Object.entries(PRODUCES).find(([, v]) => v === dayElement)![0]}) và hành cùng loại (${dayElement}); kiêng môi trường quá nhiều ${PRODUCES[dayElement]}.`
      : strengthLabel === "Thân vượng"
        ? `Nhật chủ ${STEMS[dayStem]} (${dayElement}) khá mạnh → nên dùng hành hao tiết (${PRODUCES[dayElement]}), hành tài (${CONTROLS[dayElement]}) hoặc hành quan sát (${Object.entries(CONTROLS).find(([, v]) => v === dayElement)![0]}); hạn chế thêm ${dayElement}.`
        : `Nhật chủ ${STEMS[dayStem]} (${dayElement}) ở thế trung hoà → dùng hành nào cũng luận được, nên ưu tiên cân bằng và đi theo vận thời.`;

  // Đại Vận: thuận/nghịch theo âm dương của can năm và giới tính, khởi từ khoảng cách tới tiết khí
  const yearYang = STEM_YANG[yearStem];
  const forward = options.gender === "nam" ? yearYang : !yearYang;
  const nextTerm = Math.ceil((normalizeDegree(sunLongitude - 315) + 0.0001) / 30) * 30 + 315;
  const degreesToTerm = forward
    ? normalizeDegree(nextTerm - sunLongitude)
    : normalizeDegree(sunLongitude - (nextTerm - 30));
  const daysToTerm = degreesToTerm / 0.9856;
  const ageStart = Math.max(0, daysToTerm / 3);

  const luckPillars = Array.from({ length: 8 }, (_, index) => {
    const step = forward ? index + 1 : -(index + 1);
    const stem = ((monthStem + step) % 10 + 10) % 10;
    const branch = ((monthBranch + step) % 12 + 12) % 12;
    return {
      ageStart: Math.round((ageStart + index * 10) * 10) / 10,
      stem,
      branch,
      vi: `${STEMS[stem]} ${BRANCHES[branch]}`,
      tenGod: tenGodOf(dayStem, stem)
    };
  });

  const currentTermIndex = Math.floor(normalizeDegree(sunLongitude - 315) / 30);
  const solarTermNote = `Tháng tiết khí hiện tại: ${SOLAR_TERMS[currentTermIndex % 12]?.name ?? ""} (kinh độ Mặt Trời ${sunLongitude.toFixed(2)}°)`;

  return {
    pillars,
    dayMaster: { stem: dayStem, element: dayElement, yang: STEM_YANG[dayStem], vi: STEMS[dayStem], han: STEMS_HAN[dayStem] },
    elementScore,
    dominantElement: dominant,
    weakestElement: weakest,
    usefulGodHint,
    luckPillars,
    luckDirection: forward ? "thuận" : "nghịch",
    solarTermNote,
    dayMasterStrength: {
      score: Math.round(strengthScore * 100) / 100,
      label: strengthLabel,
      note: `${strengthLabel}: điểm hỗ trợ ${support.toFixed(1)} so với điểm hao tiết ${drain.toFixed(1)}.`
    }
  };
};

/* --------------------------------------------------------------- Tử Vi Đẩu Số */

const PALACE_NAMES = [
  "Mệnh",
  "Huynh Đệ",
  "Phu Thê",
  "Tử Tức",
  "Tài Bạch",
  "Tật Ách",
  "Thiên Di",
  "Nô Bộc",
  "Quan Lộc",
  "Điền Trạch",
  "Phúc Đức",
  "Phụ Mẫu"
];

const PALACE_MEANING: Record<string, string> = {
  Mệnh: "bản chất, khí chất, con người thật",
  "Huynh Đệ": "anh chị em, bạn thân, hợp tác ngang hàng",
  "Phu Thê": "vợ/chồng, đối tác thân mật",
  "Tử Tức": "con cái, học trò, sáng tạo",
  "Tài Bạch": "tiền bạc, cách kiếm tiền",
  "Tật Ách": "sức khỏe, nội tâm, bệnh tật",
  "Thiên Di": "ra ngoài, di chuyển, môi trường bên ngoài",
  "Nô Bộc": "cấp dưới, bạn bè, người phục vụ",
  "Quan Lộc": "sự nghiệp, chức vụ",
  "Điền Trạch": "nhà cửa, bất động sản",
  "Phúc Đức": "phúc khí, tâm linh, hưởng thụ",
  "Phụ Mẫu": "cha mẹ, người bề trên"
};

/** Bảng Mệnh Chủ theo cung Mệnh. */
const LIFE_MASTERS: Record<number, string> = {
  0: "Tham Lang",
  1: "Cự Môn",
  11: "Cự Môn",
  2: "Lộc Tồn",
  10: "Lộc Tồn",
  3: "Văn Khúc",
  9: "Văn Khúc",
  4: "Liêm Trinh",
  8: "Liêm Trinh",
  5: "Vũ Khúc",
  7: "Vũ Khúc",
  6: "Phá Quân"
};

/** Bảng Thân Chủ theo chi năm sinh. */
const BODY_MASTERS: Record<number, string> = {
  0: "Hỏa Tinh",
  6: "Hỏa Tinh",
  1: "Thiên Tướng",
  7: "Thiên Tướng",
  2: "Thiên Lương",
  8: "Thiên Lương",
  3: "Thiên Đồng",
  9: "Thiên Đồng",
  4: "Văn Xương",
  10: "Văn Xương",
  5: "Thiên Cơ",
  11: "Thiên Cơ"
};

const BUREAU_BY_ELEMENT: Record<Element, { name: string; number: number; note: string }> = {
  Thủy: { name: "Thủy Nhị Cục", number: 2, note: "nhị cục: khởi vận sớm, nhịp sống nhanh" },
  Mộc: { name: "Mộc Tam Cục", number: 3, note: "tam cục: phát triển theo từng giai đoạn rõ rệt" },
  Kim: { name: "Kim Tứ Cục", number: 4, note: "tứ cục: cần thời gian tôi luyện mới bền" },
  Thổ: { name: "Thổ Ngũ Cục", number: 5, note: "ngũ cục: tích luỹ chậm mà chắc" },
  Hỏa: { name: "Hỏa Lục Cục", number: 6, note: "lục cục: bùng nổ muộn nhưng mạnh" }
};

/**
 * Can của 12 cung theo quy tắc **Ngũ Hổ Độn**: can năm quyết định can của cung Dần,
 * rồi đi thuận (Dần → Mão → …).
 */
const yinPalaceStem = (yearStem: number) => ((yearStem % 5) * 2 + 2) % 10;

/** Can của một cung địa chi bất kỳ (dùng Ngũ Hổ Độn từ can năm). */
const palaceStem = (yearStem: number, branch: number) =>
  (yinPalaceStem(yearStem) + (((branch - 2) % 12) + 12) % 12) % 10;

/** Tứ Hóa theo can năm: [Hóa Lộc, Hóa Quyền, Hóa Khoa, Hóa Kỵ]. */
const FOUR_TRANSFORMATIONS: Record<number, [string, string, string, string]> = {
  0: ["Liêm Trinh", "Phá Quân", "Vũ Khúc", "Thái Dương"],
  1: ["Thiên Cơ", "Thiên Lương", "Tử Vi", "Thái Âm"],
  2: ["Thiên Đồng", "Thiên Cơ", "Văn Xương", "Liêm Trinh"],
  3: ["Thái Âm", "Thiên Đồng", "Thiên Cơ", "Cự Môn"],
  4: ["Tham Lang", "Thái Âm", "Hữu Bật", "Thiên Cơ"],
  5: ["Vũ Khúc", "Tham Lang", "Thiên Lương", "Văn Khúc"],
  6: ["Thái Dương", "Vũ Khúc", "Thái Âm", "Thiên Đồng"],
  7: ["Cự Môn", "Thái Dương", "Văn Khúc", "Văn Xương"],
  8: ["Thiên Lương", "Tử Vi", "Tả Phù", "Vũ Khúc"],
  9: ["Phá Quân", "Cự Môn", "Thái Âm", "Tham Lang"]
};
const TRANSFORM_LABELS = ["Lộc", "Quyền", "Khoa", "Kỵ"] as const;

/** Thiên Khôi / Thiên Việt theo can năm. */
const KUI_YUE: Array<[number, number]> = [
  [1, 7], // Giáp: Khôi Sửu, Việt Mùi
  [0, 8], // Ất: Khôi Tý, Việt Thân
  [11, 9], // Bính: Khôi Hợi, Việt Dậu
  [11, 9], // Đinh
  [1, 7], // Mậu
  [0, 8], // Kỷ
  [1, 7], // Canh
  [6, 2], // Tân: Khôi Ngọ, Việt Dần
  [3, 5], // Nhâm: Khôi Mão, Việt Tỵ
  [3, 5] // Quý
];

/** Lộc Tồn theo can năm. */
const LU_CUN = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];

/** Nhóm tam hợp của chi năm → [chi khởi Hỏa Tinh, chi khởi Linh Tinh, chi Thiên Mã]. */
const YEAR_GROUP = (branch: number): [number, number, number] => {
  if ([2, 6, 10].includes(branch)) return [1, 3, 8]; // Dần Ngọ Tuất
  if ([8, 0, 4].includes(branch)) return [2, 10, 2]; // Thân Tý Thìn
  if ([5, 9, 1].includes(branch)) return [3, 10, 11]; // Tỵ Dậu Sửu
  return [9, 10, 5]; // Hợi Mão Mùi
};

const ZIWEI_SYSTEM: Array<{ name: string; offset: number }> = [
  { name: "Tử Vi", offset: 0 },
  { name: "Thiên Cơ", offset: -1 },
  { name: "Thái Dương", offset: -3 },
  { name: "Vũ Khúc", offset: -4 },
  { name: "Thiên Đồng", offset: -5 },
  { name: "Liêm Trinh", offset: -8 }
];

const TIANFU_SYSTEM: Array<{ name: string; offset: number }> = [
  { name: "Thiên Phủ", offset: 0 },
  { name: "Thái Âm", offset: 1 },
  { name: "Tham Lang", offset: 2 },
  { name: "Cự Môn", offset: 3 },
  { name: "Thiên Tướng", offset: 4 },
  { name: "Thiên Lương", offset: 5 },
  { name: "Thất Sát", offset: 6 },
  { name: "Phá Quân", offset: 10 }
];

export type ZiweiStarKind = "major" | "lucky" | "malefic" | "helper";

export type ZiweiStar = {
  name: string;
  kind: ZiweiStarKind;
  /** Tứ Hóa: Lộc / Quyền / Khoa / Kỵ (nếu sao này được hóa trong năm sinh). */
  mutagen?: string;
};

export type ZiweiPalace = {
  index: number;
  branch: number;
  branchVi: string;
  /** Can của cung (Ngũ Hổ Độn từ can năm). */
  stem: number;
  stemVi: string;
  name: string;
  meaning: string;
  isLife: boolean;
  isBody: boolean;
  stars: ZiweiStar[];
};

export type ZiweiChart = {
  lunarMonth: number;
  lunarDay: number;
  lunarYear: number;
  leapMonth: boolean;
  lifeBranch: number;
  bodyBranch: number;
  lifeMaster: string;
  bodyMaster: string;
  bureau: { name: string; number: number; note: string };
  /** Tứ Hóa của năm sinh: sao nào hóa gì, nằm ở cung nào. */
  transformations: Array<{ star: string; label: string; branch: number }>;
  palaces: ZiweiPalace[];
  note: string;
};

/**
 * Tử Vi Đẩu Số — an sao theo công thức cổ điển:
 *  · Cung Mệnh từ tháng âm lịch và giờ sinh; cung Thân cộng thay vì trừ giờ.
 *  · Ngũ Hành Cục = nạp âm của **can cung Mệnh** (Ngũ Hổ Độn từ can năm) với chi cung Mệnh.
 *  · Tử Vi tinh theo cục số và ngày âm lịch; Thiên Phủ đối xứng qua trục Dần-Thân.
 *  · 14 chính tinh, 6 cát tinh, 6 sát tinh, Lộc Tồn, Thiên Mã và Tứ Hóa.
 */
export const buildZiwei = (localDate: Date | null, localHour: number): ZiweiChart => {
  // Ngày âm lịch thật (sóc + trung khí), không ước lượng theo pha Mặt Trăng.
  const birthDate = localDate ?? new Date();
  const lunar = lunarForBirth(birthDate, localHour);
  const lunarDay = lunar.day;
  const lunarMonth = lunar.month;
  // Tử Vi Đẩu Số dùng **năm âm lịch** (đổi tại Tết), khác Bát Tự dùng năm tiết khí (đổi tại Lập Xuân).
  const yearStem = (((lunar.year - 4) % 10) + 10) % 10;
  const yearBranch = (((lunar.year - 4) % 12) + 12) % 12;

  // Giờ sinh theo 12 canh (Tý = 23h-1h)
  const hourBranch = Math.floor((((localHour + 1) % 24) + 24) % 24 / 2) % 12;

  // Mệnh cung: từ Dần (2) tiến (tháng - 1), rồi lùi theo giờ; Thân cung: tiến theo giờ
  const lifeBranch = ((2 + (lunarMonth - 1) - hourBranch) % 12 + 12) % 12;
  const bodyBranch = ((2 + (lunarMonth - 1) + hourBranch) % 12 + 12) % 12;

  // Ngũ Hành Cục theo Nạp Âm của (can cung Mệnh, chi cung Mệnh)
  const lifeStem = palaceStem(yearStem, lifeBranch);
  const bureau = BUREAU_BY_ELEMENT[nayinElement(lifeStem, lifeBranch)];

  // Vị trí Tử Vi theo công thức cổ điển (紫微斗數全書)
  const q = Math.ceil(lunarDay / bureau.number);
  const diff = q * bureau.number - lunarDay;
  const base = (2 + q - 1) % 12;
  const ziweiBranch = (((diff % 2 === 0 ? base + diff : base - diff) % 12) + 12) % 12;
  const tianfuBranch = ((4 - ziweiBranch) % 12 + 12) % 12;

  // Tứ Hóa của năm sinh
  const transformByStar = new Map<string, string>();
  const transformations = (FOUR_TRANSFORMATIONS[yearStem] ?? []).map((star, index) => {
    const label = TRANSFORM_LABELS[index];
    transformByStar.set(star, label);
    return { star, label, branch: -1 };
  });
  const mutate = (star: ZiweiStar): ZiweiStar =>
    transformByStar.has(star.name) ? { ...star, mutagen: transformByStar.get(star.name) } : star;

  const starByBranch = new Map<number, ZiweiStar[]>();
  const place = (branch: number, star: ZiweiStar) => {
    const key = ((branch % 12) + 12) % 12;
    const list = starByBranch.get(key) ?? [];
    list.push(mutate(star));
    starByBranch.set(key, list);
  };

  // 14 chính tinh
  ZIWEI_SYSTEM.forEach((star) => place(ziweiBranch + star.offset, { name: star.name, kind: "major" }));
  TIANFU_SYSTEM.forEach((star) => place(tianfuBranch + star.offset, { name: star.name, kind: "major" }));

  // Lục cát tinh: Tả Phù / Hữu Bật theo tháng, Văn Xương / Văn Khúc theo giờ, Thiên Khôi / Thiên Việt theo can năm
  place(4 + (lunarMonth - 1), { name: "Tả Phù", kind: "lucky" });
  place(10 - (lunarMonth - 1), { name: "Hữu Bật", kind: "lucky" });
  place(10 - hourBranch, { name: "Văn Xương", kind: "lucky" });
  place(4 + hourBranch, { name: "Văn Khúc", kind: "lucky" });
  const [kui, yue] = KUI_YUE[yearStem] ?? [1, 7];
  place(kui, { name: "Thiên Khôi", kind: "lucky" });
  place(yue, { name: "Thiên Việt", kind: "lucky" });

  // Lục sát tinh: Kình Dương / Đà La từ Lộc Tồn, Hỏa Tinh / Linh Tinh theo chi năm + giờ, Địa Không / Địa Kiếp theo giờ
  const luCunBranch = LU_CUN[yearStem] ?? 2;
  place(luCunBranch, { name: "Lộc Tồn", kind: "helper" });
  place(luCunBranch + 1, { name: "Kình Dương", kind: "malefic" });
  place(luCunBranch - 1, { name: "Đà La", kind: "malefic" });
  const [huoStart, lingStart, maBranch] = YEAR_GROUP(yearBranch);
  place(huoStart + hourBranch, { name: "Hỏa Tinh", kind: "malefic" });
  place(lingStart + hourBranch, { name: "Linh Tinh", kind: "malefic" });
  place(11 - hourBranch, { name: "Địa Không", kind: "malefic" });
  place(11 + hourBranch, { name: "Địa Kiếp", kind: "malefic" });
  place(maBranch, { name: "Thiên Mã", kind: "helper" });

  const palaces: ZiweiPalace[] = PALACE_NAMES.map((name, index) => {
    // Cung Mệnh tại lifeBranch, các cung tiếp theo đi ngược chiều kim đồng hồ (giảm chi)
    const branch = ((lifeBranch - index) % 12 + 12) % 12;
    const stem = palaceStem(yearStem, branch);
    return {
      index,
      branch,
      branchVi: BRANCHES[branch],
      stem,
      stemVi: STEMS[stem],
      name,
      meaning: PALACE_MEANING[name] ?? "",
      isLife: index === 0,
      isBody: branch === bodyBranch,
      stars: (starByBranch.get(branch) ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "major" ? -1 : b.kind === "major" ? 1 : 0))
    };
  });

  // Điền chi của các sao được hóa để tiện tra cứu
  for (const entry of transformations) {
    const palace = palaces.find((item) => item.stars.some((star) => star.name === entry.star));
    entry.branch = palace?.branch ?? -1;
  }

  const lunarLabel = `${twoDigit(lunarDay)} tháng ${twoDigit(lunarMonth)}${lunar.leap ? " nhuận" : ""} âm lịch năm ${STEMS[yearStem]} ${BRANCHES[yearBranch]}`;
  const transformText = transformations.map((entry) => `${entry.star} hóa ${entry.label}`).join(", ");
  return {
    lunarMonth,
    lunarDay,
    lunarYear: lunar.year,
    leapMonth: lunar.leap,
    lifeBranch,
    bodyBranch,
    lifeMaster: LIFE_MASTERS[lifeBranch] ?? "—",
    bodyMaster: BODY_MASTERS[yearBranch] ?? "—",
    bureau,
    transformations,
    palaces,
    note: `Ngày ${lunarLabel}, giờ ${BRANCHES[hourBranch]}. Cung Mệnh ${STEMS[lifeStem]}${BRANCHES[lifeBranch]} → nạp âm ${bureau.name}. Ngày âm lịch tính từ sóc và trung khí (mùng 1 = ngày chứa trăng mới, tháng 11 = tháng chứa Đông chí).${
      lunar.shiftedToNextDay ? " Ca sinh từ 23 giờ được tính sang ngày hôm sau (giờ Tý bắt đầu từ 23 giờ)." : ""
    } Tứ Hóa năm sinh: ${transformText}. Vị trí sao theo công thức cổ điển — các phái khác nhau ở cách đặt tháng nhuận nên vẫn nên đối chiếu phần mềm chuyên dụng.`
  };
};

/* ---------------------------------------------------------------------- Maya */

const TZOLKIN_SIGNS = [
  "Imix",
  "Ik",
  "Akbal",
  "Kan",
  "Chikchan",
  "Kimi",
  "Manik",
  "Lamat",
  "Muluk",
  "Ok",
  "Chuwen",
  "Eb",
  "Ben",
  "Ix",
  "Men",
  "Kib",
  "Kaban",
  "Etznab",
  "Kawak",
  "Ajaw"
];

const HAAB_MONTHS = [
  "Pop",
  "Wo",
  "Sip",
  "Sotz'",
  "Sek",
  "Xul",
  "Yaxk'in",
  "Mol",
  "Ch'en",
  "Yax",
  "Sak",
  "Keh",
  "Mak",
  "K'ank'in",
  "Muwan",
  "Pax",
  "K'ayab",
  "Kumk'u",
  "Wayeb"
];

export type MayanDate = {
  tzolkin: { number: number; sign: string; full: string };
  haab: { day: number; month: string; full: string };
  longCount: string;
  lordOfNight: number;
  meaning: string;
  galacticNote: string;
};

/** Ngày theo lịch Maya (tương quan GMT 584283) + ghi chú liên hệ Tzolk'in - chiêm tinh hiện đại. */
export const buildMayan = (localDate: Date): MayanDate => {
  const jdn = Math.floor(julianDay(new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 12))) + 0.5);
  const since = jdn - 584283;

  const number = ((since + 3) % 13 + 13) % 13 + 1;
  const signIndex = ((since + 19) % 20 + 20) % 20;
  const sign = TZOLKIN_SIGNS[signIndex];

  const haabPos = ((since + 348) % 365 + 365) % 365;
  const haabDay = haabPos % 20;
  const haabMonthIndex = Math.floor(haabPos / 20);

  const baktun = Math.floor(since / 144000);
  const katun = Math.floor((since % 144000) / 7200);
  const tun = Math.floor((since % 7200) / 360);
  const uinal = Math.floor((since % 360) / 20);
  const kin = since % 20;

  const lordOfNight = ((since % 9) + 9) % 9 + 1;

  return {
    tzolkin: { number, sign, full: `${number} ${sign}` },
    haab: { day: haabDay, month: HAAB_MONTHS[haabMonthIndex], full: `${haabDay} ${HAAB_MONTHS[haabMonthIndex]}` },
    longCount: `${baktun}.${katun}.${tun}.${uinal}.${kin}`,
    lordOfNight,
    meaning:
      "Tzolk'in là chu kỳ 260 ngày (13 số × 20 dấu) — dùng để đọc năng lượng ngày và chữ ký cá nhân trong chiêm tinh Maya hiện đại.",
    galacticNote:
      "Trong chiêm tinh Maya - Galactic (José Argüelles, Dreamspell), ngày sinh được đọc thành 'chữ ký Galactic'; hệ này dùng tương quan khác (584283 hoặc 584285) nên chữ ký có thể lệch 1-2 ngày so với lịch cổ điển."
  };
};
