/**
 * Kỹ thuật chiêm tinh Hy Lạp cổ (Hellenistic): phái (sect), Lots, phẩm chất hành tinh
 * (domicile, exaltation, triplicity, bounds, decan) và điểm số tương quan.
 */

import { ZODIAC_SIGNS, normalizeDegree } from "@/lib/astro";

export type Sect = "day" | "night";

export type LotDefinition = {
  key: string;
  vi: string;
  formula: string;
  dayFormula: string;
  nightFormula: string;
  meaning: string;
};

export const LOTS: LotDefinition[] = [
  {
    key: "fortune",
    vi: "Lot of Fortune (Phúc)",
    formula: "AC + Mặt Trăng − Mặt Trời (ban ngày)",
    dayFormula: "AC + Moon − Sun",
    nightFormula: "AC + Sun − Moon",
    meaning: "Thân thể, sức khỏe, tài lộc, những gì đến với bạn mà không cần cố gắng."
  },
  {
    key: "spirit",
    vi: "Lot of Spirit (Thần)",
    formula: "AC + Mặt Trời − Mặt Trăng (ban ngày)",
    dayFormula: "AC + Sun − Moon",
    nightFormula: "AC + Moon − Sun",
    meaning: "Ý chí, sự nghiệp, hành động có chủ đích, linh hồn và mục tiêu sống."
  },
  {
    key: "eros",
    vi: "Lot of Eros",
    formula: "AC + Kim Tinh − Lot of Spirit",
    dayFormula: "AC + Venus − Spirit",
    nightFormula: "AC + Spirit − Venus",
    meaning: "Dục vọng, tình yêu, điều bạn khao khát và bị hấp dẫn."
  },
  {
    key: "necessity",
    vi: "Lot of Necessity",
    formula: "AC + Lot of Fortune − Thủy Tinh",
    dayFormula: "AC + Fortune − Mercury",
    nightFormula: "AC + Mercury − Fortune",
    meaning: "Ràng buộc, nghĩa vụ, những điều buộc phải làm."
  },
  {
    key: "courage",
    vi: "Lot of Courage",
    formula: "AC + Hỏa Tinh − Lot of Fortune",
    dayFormula: "AC + Mars − Fortune",
    nightFormula: "AC + Fortune − Mars",
    meaning: "Can đảm, sức chịu đựng, khả năng đối diện xung đột."
  },
  {
    key: "victory",
    vi: "Lot of Victory",
    formula: "AC + Mộc Tinh − Lot of Spirit",
    dayFormula: "AC + Jupiter − Spirit",
    nightFormula: "AC + Spirit − Jupiter",
    meaning: "Thành công, được công nhận, chiến thắng trong cạnh tranh."
  },
  {
    key: "nemesis",
    vi: "Lot of Nemesis",
    formula: "AC + Lot of Fortune − Thổ Tinh",
    dayFormula: "AC + Fortune − Saturn",
    nightFormula: "AC + Saturn − Fortune",
    meaning: "Điểm mù, nguyên nhân thất bại lặp lại, bài học về khiêm nhường."
  }
];

export type Dignity = {
  planet: string;
  domicile: number | null;
  exaltation: number | null;
  triplicity: string | null;
  bound: string | null;
  face: string | null;
  score: number;
  notes: string[];
};

/** Bảng trị vì (domicile) cung của 7 hành tinh truyền thống. */
const DOMICILE: Record<string, number[]> = {
  sun: [4],
  moon: [3],
  mercury: [2, 5],
  venus: [1, 6],
  mars: [0, 7],
  jupiter: [8, 11],
  saturn: [9, 10]
};

const EXALTATION: Record<string, { sign: number; degree: number }> = {
  sun: { sign: 0, degree: 19 },
  moon: { sign: 1, degree: 3 },
  mercury: { sign: 5, degree: 15 },
  venus: { sign: 11, degree: 27 },
  mars: { sign: 9, degree: 28 },
  jupiter: { sign: 3, degree: 15 },
  saturn: { sign: 6, degree: 21 }
};

/** Tam hợp (triplicity) theo hệ Dorothean dùng trong truyền thống Hellenistic. */
const TRIPLICITY: Array<{ signs: number[]; day: string; night: string; partner: string }> = [
  { signs: [0, 4, 8], day: "sun", night: "jupiter", partner: "saturn" },
  { signs: [1, 5, 9], day: "venus", night: "moon", partner: "mars" },
  { signs: [2, 6, 10], day: "saturn", night: "mercury", partner: "jupiter" },
  { signs: [3, 7, 11], day: "venus", night: "mars", partner: "moon" }
];

/** Biên giới (bounds/terms) theo hệ Ai Cập — dùng phổ biến nhất trong chiêm tinh Hellenistic. */
const EGYPTIAN_BOUNDS: Array<Array<{ planet: string; span: number }>> = [
  // Bạch Dương
  [
    { planet: "jupiter", span: 6 },
    { planet: "venus", span: 6 },
    { planet: "mercury", span: 8 },
    { planet: "mars", span: 5 },
    { planet: "saturn", span: 5 }
  ],
  // Kim Ngưu
  [
    { planet: "venus", span: 8 },
    { planet: "mercury", span: 6 },
    { planet: "jupiter", span: 5 },
    { planet: "saturn", span: 5 },
    { planet: "mars", span: 6 }
  ],
  // Song Tử
  [
    { planet: "mercury", span: 6 },
    { planet: "jupiter", span: 6 },
    { planet: "venus", span: 5 },
    { planet: "mars", span: 7 },
    { planet: "saturn", span: 6 }
  ],
  // Cự Giải
  [
    { planet: "mars", span: 7 },
    { planet: "venus", span: 6 },
    { planet: "mercury", span: 6 },
    { planet: "jupiter", span: 7 },
    { planet: "saturn", span: 4 }
  ],
  // Sư Tử
  [
    { planet: "jupiter", span: 6 },
    { planet: "venus", span: 5 },
    { planet: "saturn", span: 7 },
    { planet: "mercury", span: 6 },
    { planet: "mars", span: 6 }
  ],
  // Xử Nữ
  [
    { planet: "mercury", span: 7 },
    { planet: "venus", span: 10 },
    { planet: "jupiter", span: 4 },
    { planet: "mars", span: 7 },
    { planet: "saturn", span: 2 }
  ],
  // Thiên Bình
  [
    { planet: "saturn", span: 6 },
    { planet: "mercury", span: 8 },
    { planet: "jupiter", span: 7 },
    { planet: "venus", span: 7 },
    { planet: "mars", span: 2 }
  ],
  // Bọ Cạp
  [
    { planet: "mars", span: 7 },
    { planet: "venus", span: 4 },
    { planet: "mercury", span: 8 },
    { planet: "jupiter", span: 5 },
    { planet: "saturn", span: 6 }
  ],
  // Nhân Mã
  [
    { planet: "jupiter", span: 12 },
    { planet: "venus", span: 5 },
    { planet: "mercury", span: 4 },
    { planet: "saturn", span: 5 },
    { planet: "mars", span: 4 }
  ],
  // Ma Kết
  [
    { planet: "mercury", span: 7 },
    { planet: "jupiter", span: 7 },
    { planet: "venus", span: 8 },
    { planet: "saturn", span: 4 },
    { planet: "mars", span: 4 }
  ],
  // Bảo Bình
  [
    { planet: "mercury", span: 7 },
    { planet: "venus", span: 6 },
    { planet: "jupiter", span: 7 },
    { planet: "mars", span: 5 },
    { planet: "saturn", span: 5 }
  ],
  // Song Ngư
  [
    { planet: "venus", span: 12 },
    { planet: "jupiter", span: 4 },
    { planet: "mercury", span: 3 },
    { planet: "mars", span: 9 },
    { planet: "saturn", span: 2 }
  ]
];

const FACE_RULERS = ["mars", "sun", "venus", "mercury", "moon", "saturn", "jupiter"];

const PLANET_VI: Record<string, string> = {
  sun: "Mặt Trời",
  moon: "Mặt Trăng",
  mercury: "Thủy Tinh",
  venus: "Kim Tinh",
  mars: "Hỏa Tinh",
  jupiter: "Mộc Tinh",
  saturn: "Thổ Tinh"
};

export const planetVi = (key: string) => PLANET_VI[key] ?? key;

/**
 * Xác định phái của bản đồ: ban ngày nếu Mặt Trời nằm trên đường chân trời
 * (nhà 7 - 12 theo Whole Sign/Placidus truyền thống).
 */
export const sectOf = (sunHouse: number): Sect => (sunHouse >= 7 && sunHouse <= 12 ? "day" : "night");

export const boundOf = (longitude: number) => {
  const lon = normalizeDegree(longitude);
  const sign = Math.floor(lon / 30);
  let within = lon - sign * 30;
  const bounds = EGYPTIAN_BOUNDS[sign];

  for (const bound of bounds) {
    if (within < bound.span) return { planet: bound.planet, sign, start: within, span: bound.span };
    within -= bound.span;
  }

  const last = bounds[bounds.length - 1];
  return { planet: last.planet, sign, start: 0, span: last.span };
};

export const faceOf = (longitude: number) => {
  const lon = normalizeDegree(longitude);
  const sign = Math.floor(lon / 30);
  const decan = Math.floor((lon - sign * 30) / 10);
  const ruler = FACE_RULERS[(sign * 3 + decan) % 7];
  return { ruler, decan: decan + 1 };
};

export const triplicityOf = (signIndex: number, sect: Sect) => {
  const group = TRIPLICITY.find((item) => item.signs.includes(signIndex));
  if (!group) return null;
  return {
    ruler: sect === "day" ? group.day : group.night,
    participating: group.partner
  };
};

/** Phẩm chất thiết yếu của một hành tinh tại một kinh độ (chỉ 7 hành tinh cổ điển). */
export const essentialDignity = (planet: string, longitude: number, sect: Sect): Dignity => {
  const lon = normalizeDegree(longitude);
  const sign = Math.floor(lon / 30);
  const notes: string[] = [];
  let score = 0;

  const isDomicile = DOMICILE[planet]?.includes(sign) ?? false;
  const exalt = EXALTATION[planet];
  const isExaltation = exalt?.sign === sign;

  if (isDomicile) {
    score += 5;
    notes.push("Trị vì (domicile): hành tinh ở nhà của chính mình — mạnh nhất, hành xử đúng bản chất.");
  }
  if (isExaltation) {
    score += 4;
    notes.push(`Vượng (exaltation): được tôn lên, phát huy theo hướng tích cực (đỉnh ${exalt.degree}°).`);
  }

  const triplicity = triplicityOf(sign, sect);
  if (triplicity?.ruler === planet) {
    score += 3;
    notes.push("Tam hợp chủ (triplicity lord): được nguyên tố của cung hỗ trợ.");
  } else if (triplicity?.participating === planet) {
    score += 1;
    notes.push("Tam hợp tham dự: hỗ trợ nhẹ.");
  }

  const bound = boundOf(lon);
  if (bound.planet === planet) {
    score += 2;
    notes.push(`Biên giới (bound/term) do chính hành tinh cai quản — chi tiết nhỏ nhưng có tiếng nói.`);
  }

  const face = faceOf(lon);
  if (face.ruler === planet) {
    score += 1;
    notes.push(`Decan (face) thứ ${face.decan} do hành tinh cai quản.`);
  }

  // Suy yếu: đối cung của domicile hoặc exaltation
  const oppositeSign = (sign + 6) % 12;
  if (DOMICILE[planet]?.some((item) => (item + 6) % 12 === sign) || (DOMICILE[planet] ?? []).includes(oppositeSign)) {
    score -= 5;
    notes.push("Lưu đày (detriment): hành tinh ở cung đối lập nhà của mình — biểu hiện nghịch hướng.");
  }
  if (exalt && (exalt.sign + 6) % 12 === sign) {
    score -= 4;
    notes.push("Suy nhược (fall): hành tinh đối lập cung vượng — dễ hụt hơi.");
  }

  return {
    planet,
    domicile: isDomicile ? sign : null,
    exaltation: isExaltation ? sign : null,
    triplicity: triplicity?.ruler ?? null,
    bound: bound.planet,
    face: face.ruler,
    score,
    notes
  };
};

export type LotPosition = {
  key: string;
  vi: string;
  longitude: number;
  signName: string;
  house: number;
  ruler: string;
  meaning: string;
};

export type HellenisticChart = {
  sect: Sect;
  sectLight: string;
  lots: LotPosition[];
  dignities: Dignity[];
  joys: Array<{ house: number; planet: string; vi: string }>;
  angularPlanets: string[];
};

const PLANETARY_JOYS = [
  { house: 1, planet: "mercury", vi: "Thủy Tinh" },
  { house: 3, planet: "moon", vi: "Mặt Trăng" },
  { house: 5, planet: "venus", vi: "Kim Tinh" },
  { house: 6, planet: "mars", vi: "Hỏa Tinh" },
  { house: 9, planet: "sun", vi: "Mặt Trời" },
  { house: 11, planet: "jupiter", vi: "Mộc Tinh" },
  { house: 12, planet: "saturn", vi: "Thổ Tinh" }
];

export type HellenisticInput = {
  ascendant: number;
  planets: Array<{ key: string; longitude: number; house: number }>;
};

/** Tính Lots + phẩm chất hành tinh + nhà "niềm vui" (planetary joys). */
export const buildHellenistic = (input: HellenisticInput, houseOf: (longitude: number) => number): HellenisticChart => {
  const byKey = new Map(input.planets.map((planet) => [planet.key, planet]));
  const sun = byKey.get("sun");
  const asc = input.ascendant;

  const sunHouse = sun?.house ?? 1;
  const sect = sectOf(sunHouse);

  const value = (key: string) => byKey.get(key)?.longitude ?? 0;

  const fortune = normalizeDegree(sect === "day" ? asc + value("moon") - value("sun") : asc + value("sun") - value("moon"));
  const spirit = normalizeDegree(sect === "day" ? asc + value("sun") - value("moon") : asc + value("moon") - value("sun"));

  const computed: Record<string, number> = {
    fortune,
    spirit,
    eros: normalizeDegree(sect === "day" ? asc + value("venus") - spirit : asc + spirit - value("venus")),
    necessity: normalizeDegree(sect === "day" ? asc + fortune - value("mercury") : asc + value("mercury") - fortune),
    courage: normalizeDegree(sect === "day" ? asc + value("mars") - fortune : asc + fortune - value("mars")),
    victory: normalizeDegree(sect === "day" ? asc + value("jupiter") - spirit : asc + spirit - value("jupiter")),
    nemesis: normalizeDegree(sect === "day" ? asc + fortune - value("saturn") : asc + value("saturn") - fortune)
  };

  const lots: LotPosition[] = LOTS.map((definition) => {
    const longitude = computed[definition.key];
    const signIndex = Math.floor(longitude / 30);
    return {
      key: definition.key,
      vi: definition.vi,
      longitude,
      signName: ZODIAC_SIGNS[signIndex].name,
      house: houseOf(longitude),
      ruler: planetVi(
        Object.entries(DOMICILE).find(([, signs]) => signs.includes(signIndex))?.[0] ?? "sun"
      ),
      meaning: definition.meaning
    };
  });

  const dignities = input.planets
    .filter((planet) => PLANET_VI[planet.key])
    .map((planet) => essentialDignity(planet.key, planet.longitude, sect));

  const angularPlanets = input.planets
    .filter((planet) => [1, 4, 7, 10].includes(planet.house))
    .map((planet) => planetVi(planet.key));

  return {
    sect,
    sectLight: sect === "day" ? "Mặt Trời (ban ngày)" : "Mặt Trăng (ban đêm)",
    lots,
    dignities,
    joys: PLANETARY_JOYS.map((joy) => ({ ...joy, planet: joy.vi })),
    angularPlanets
  };
};

export const ZODIAC_SIGN_NAMES = ZODIAC_SIGNS.map((sign) => sign.name);
