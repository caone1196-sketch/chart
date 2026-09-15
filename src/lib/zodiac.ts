import { Body, PairLongitude, SunPosition } from "astronomy-engine";
import { calcObliquity, julianDay, normalizeDegree, signedSeparation } from "@/lib/mathx";

/* --------------------------------------------------------------- toán ma trận */

type Vec3 = [number, number, number];
type Mat3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;
const J2000 = 2451545.0;

export const julianCenturies = (date: Date) => (julianDay(date) - J2000) / 36525;

const multiply = (a: Mat3, b: Mat3): Mat3 => {
  const out = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return out;
};

const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
];

const rotZ = (rad: number): Mat3 => [Math.cos(rad), Math.sin(rad), 0, -Math.sin(rad), Math.cos(rad), 0, 0, 0, 1];

/** Ma trận tiến động IAU 1976 từ J2000 sang hệ xích đạo trung bình của ngày. */
export const precessionMatrix = (date: Date): Mat3 => {
  const T = julianCenturies(date);
  const zeta = ((2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600) * DEG;
  const z = ((2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600) * DEG;
  const theta = ((2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600) * DEG;
  // P = Rz(-z) · Ry(theta) · Rz(-zeta), với Ry(theta) = Rz(-90)·Rx(-theta)·Rz(90)
  const ry: Mat3 = [Math.cos(theta), 0, -Math.sin(theta), 0, 1, 0, Math.sin(theta), 0, Math.cos(theta)];
  return multiply(rotZ(-z), multiply(ry, rotZ(-zeta)));
};

const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Vector đơn vị (xích kinh, xích vĩ theo độ) trong hệ xích đạo. */
const equatorialToVector = (raDeg: number, decDeg: number): Vec3 => [
  Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG),
  Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG),
  Math.sin(decDeg * DEG)
];

const vectorToEquatorial = (v: Vec3) => ({
  ra: normalizeDegree(Math.atan2(v[1], v[0]) / DEG),
  dec: Math.asin(Math.max(-1, Math.min(1, v[2] / Math.hypot(v[0], v[1], v[2])))) / DEG
});

/** Vector đơn vị của một điểm hoàng đạo (kinh độ, vĩ độ) ở hệ xích đạo của ngày. */
const eclipticToEquatorial = (lonDeg: number, latDeg: number, obliquityDeg: number): Vec3 => {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const eps = obliquityDeg * DEG;
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon) * Math.cos(eps) - Math.sin(lat) * Math.sin(eps),
    Math.cos(lat) * Math.sin(lon) * Math.sin(eps) + Math.sin(lat) * Math.cos(eps)
  ];
};

const equatorialToEcliptic = (v: Vec3, obliquityDeg: number) => {
  const eps = obliquityDeg * DEG;
  const lon = Math.atan2(v[1] * Math.cos(eps) + v[2] * Math.sin(eps), v[0]) / DEG;
  const lat = Math.asin(Math.max(-1, Math.min(1, -v[1] * Math.sin(eps) + v[2] * Math.cos(eps)))) / DEG;
  return { lon: normalizeDegree(lon), lat };
};

/** Tiến động ngược: từ hệ xích đạo trung bình của ngày về J2000. */
export const precessToJ2000Vector = (raDeg: number, decDeg: number, date: Date) =>
  apply(transpose(precessionMatrix(date)), equatorialToVector(raDeg, decDeg));

export const precessFromJ2000Vector = (v: Vec3, date: Date) => vectorToEquatorial(apply(precessionMatrix(date), v));

/* ------------------------------------------------------------------- ayanamsa */

export type ZodiacFrameId = "tropical" | "lahiri" | "faganBradley" | "raman" | "krishnamurti" | "deLuce" | "galactic";

export type ZodiacFrameInfo = {
  id: ZodiacFrameId;
  label: string;
  tradition: string;
  idea: string;
  use: string;
  epoch: string;
};

export const ZODIAC_FRAMES: ZodiacFrameInfo[] = [
  {
    id: "tropical",
    label: "Hoàng đạo nhiệt đới (Tropical)",
    tradition: "Chiêm tinh phương Tây",
    idea: "0° Bạch Dương là điểm Xuân phân thực tế của năm. Mùa là gốc, không phải chòm sao.",
    use: "Mặc định của hầu hết trường phái phương Tây: tâm lý, sự nghiệp, quan hệ, vận hạn theo nhà.",
    epoch: "Điểm Xuân phân động theo thời gian (tuế sai ~50,3\"/năm)"
  },
  {
    id: "lahiri",
    label: "Vệ Đà - Lahiri (Chitrapaksha)",
    tradition: "Jyotish, chuẩn quốc gia Ấn Độ",
    idea: "Hoàng đạo cố định theo sao: gốc là sao Chitra (Spica) ở 180°, ayanamsa ~23°51′ tại J2000.",
    use: "Chuẩn phổ biến nhất cho là số Vệ Đà (Rashi, Nakshatra, Dasha).",
    epoch: "Chitra (Spica) ở 180°00′"
  },
  {
    id: "faganBradley",
    label: "Sidereal phương Tây - Fagan/Bradley",
    tradition: "Chiêm tinh sao cố định phương Tây (Cyril Fagan, Donald Bradley)",
    idea: "Hoàng đạo cố định theo sao với gốc được định nghĩa năm 1950 (SVP = 335°57′28,64\").",
    use: "Sidereal phương Tây, đọc sao cố định và chòm sao thật; nhấn mạnh quan sát thiên văn.",
    epoch: "SVP tại 1950.0"
  },
  {
    id: "raman",
    label: "Vệ Đà - Raman",
    tradition: "B.V. Raman",
    idea: "Ayanamsa theo truyền thống Raman, lớn hơn Lahiri khoảng 0,006° vào đầu thế kỷ 20 (khác cách lấy gốc).",
    use: "Trường phái Raman ở Nam Ấn Độ.",
    epoch: "JD 2415020 (1900.0), 21°00′52\""
  },
  {
    id: "krishnamurti",
    label: "Vệ Đà - Krishnamurti (KP)",
    tradition: "K.S. Krishnamurti",
    idea: "Ayanamsa KP dùng cho hệ thống KP (Krishnamurti Paddhati) với 249 phân đoạn (sub-lord).",
    use: "Hệ KP: phân tích sub-lord để luận sự việc cụ thể, chọn thời điểm.",
    epoch: "JD 2415020 (1900.0), 22°21′50\""
  },
  {
    id: "deLuce",
    label: "Vệ Đà - De Luce",
    tradition: "Robert De Luce",
    idea: "Ayanamsa bằng 0 vào năm 221 CN (theo tính toán của De Luce).",
    use: "Ít dùng, thường để nghiên cứu lịch sử.",
    epoch: "Năm 221 CN, ayanamsa = 0"
  },
  {
    id: "galactic",
    label: "Hoàng đạo Ngân Hà",
    tradition: "Chiêm tinh Ngân Hà / Galactic",
    idea: "0° Nhân Mã đặt đúng tâm Ngân Hà (như Swiss Ephemeris: tâm Ngân Hà ở 0° Nhân Mã).",
    use: "Đọc các điểm theo tâm Ngân Hà, dùng trong một số trường phái tâm linh.",
    epoch: "Tâm Ngân Hà ở 0° Nhân Mã"
  }
];

const RA_GALACTIC_CENTER = (17 + 45 / 60 + 40.04 / 3600) * 15;
const DEC_GALACTIC_CENTER = -(29 + 28.1 / 3600);

type AyanamsaConfig = {
  t0: number;
  ayanT0: number;
  t0IsUt: boolean;
};

const AYANAMSA_CONFIG: Record<Exclude<ZodiacFrameId, "tropical" | "galactic">, AyanamsaConfig> = {
  // Hằng số lấy từ bảng ayanamsa[] của Swiss Ephemeris (sweph.h) — xem tests/fixtures/ayanamsa-swisseph.json
  faganBradley: { t0: 2433282.42346, ayanT0: 24.042044444, t0IsUt: false },
  // Lahiri: epoch 21/3/1956 với ayanamsa 23°15'00" (chuẩn Chitrapaksha).
  lahiri: { t0: 2435553.5, ayanT0: 23.250182778 - 0.004658035, t0IsUt: false },
  raman: { t0: 2415020.0, ayanT0: 360 - 338.98556, t0IsUt: false },
  krishnamurti: { t0: 2415020.0, ayanT0: 360 - 337.636111, t0IsUt: false },
  deLuce: { t0: 1721057.5, ayanT0: 0, t0IsUt: true }
};

const julianDayToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);

/** ΔT xấp xỉ (giây) cho giai đoạn 1800-2150 — đủ chính xác cho ayanamsa. */
const deltaTSeconds = (year: number) => {
  if (year < 1860) return 12.5;
  if (year < 1900) return 8 + (year - 1860) * 0.08;
  if (year < 1920) return 11 + (year - 1900) * 0.6;
  if (year < 1941) return 23 + (year - 1920) * 0.45;
  if (year < 1970) return 32.5 + (year - 1941) * 0.45;
  if (year < 2005) return 45 + (year - 1970) * 0.75;
  return 60 + (year - 2005) * 0.65;
};

/** Ayanamsa (độ) tại một thời điểm theo cấu hình (t0, ayan_t0) của Swiss Ephemeris. */
const ayanamsaFromConfig = (config: AyanamsaConfig, date: Date) => {
  const obliquityT0 = calcObliquity(julianDayToDate(config.t0));
  const obliquityNow = calcObliquity(date);

  // Điểm hoàng đạo (ayan_t0, 0) tại epoch t0 -> hệ xích đạo của t0 -> J2000 -> của ngày -> hoàng đạo của ngày
  const atT0 = eclipticToEquatorial(config.ayanT0, 0, obliquityT0);
  const toJ2000 = apply(transpose(precessionMatrix(julianDayToDate(config.t0))), atT0);
  const atDate = apply(precessionMatrix(date), toJ2000);

  return equatorialToEcliptic(atDate, obliquityNow).lon;
};

/** Ayanamsa (độ) của hệ hoàng đạo đã chọn tại thời điểm cho trước. */
export const ayanamsa = (frame: ZodiacFrameId, date: Date): number => {
  if (frame === "tropical") return 0;

  if (frame === "galactic") {
    // Tâm Ngân Hà (J2000: RA 17h45m40.04s, Dec -29°00′28.1″) quy ước nằm ở 0° Nhân Mã (240° hoàng đạo nhiệt đới).
    const obliquity = calcObliquity(date);
    const ofDate = precessFromJ2000Equatorial(RA_GALACTIC_CENTER, DEC_GALACTIC_CENTER, date);
    const ecliptic = equatorialToEcliptic(equatorialToVector(ofDate.ra, ofDate.dec), obliquity);
    return normalizeDegree(ecliptic.lon - 240);
  }

  const config = AYANAMSA_CONFIG[frame];
  if (!config) return 0;
  return ayanamsaFromConfig(config, date);
};

// Tiện ích phụ: chuyển J2000 -> ngày cho một điểm xích đạo (dùng cho hệ Ngân Hà).
const precessFromJ2000Equatorial = (raDeg: number, decDeg: number, date: Date) => {
  const v = apply(precessionMatrix(date), equatorialToVector(raDeg, decDeg));
  return vectorToEquatorial(v);
};

/** Kinh độ trong hệ hoàng đạo đã chọn (nhiệt đới là gốc). */
export const toFrameLongitude = (tropicalLongitude: number, frame: ZodiacFrameId, date: Date) =>
  normalizeDegree(tropicalLongitude - ayanamsa(frame, date));

export const frameLabel = (frame: ZodiacFrameId) => ZODIAC_FRAMES.find((item) => item.id === frame)?.label ?? frame;

export { deltaTSeconds };

/* ----------------------------------------------------------------- Vệ Đà (Jyotish) */

export type NakshatraInfo = {
  index: number;
  name: string;
  lord: string;
  deity: string;
  symbol: string;
  gana: string;
  element: string;
  start: number;
};

export const NAKSHATRAS: NakshatraInfo[] = [
  { index: 1, name: "Ashwini", lord: "Ketu", deity: "Ashwini Kumaras", symbol: "đầu ngựa", gana: "Deva", element: "Đất", start: 0 },
  { index: 2, name: "Bharani", lord: "Venus", deity: "Yama", symbol: "yoni", gana: "Manushya", element: "Đất", start: 13.3333 },
  { index: 3, name: "Krittika", lord: "Sun", deity: "Agni", symbol: "dao/lưỡi lam", gana: "Rakshasa", element: "Đất", start: 26.6667 },
  { index: 4, name: "Rohini", lord: "Moon", deity: "Brahma", symbol: "xe bò", gana: "Manushya", element: "Đất", start: 40 },
  { index: 5, name: "Mrigashira", lord: "Mars", deity: "Soma", symbol: "đầu hươu", gana: "Deva", element: "Đất", start: 53.3333 },
  { index: 6, name: "Ardra", lord: "Rahu", deity: "Rudra", symbol: "giọt nước mắt", gana: "Manushya", element: "Nước", start: 66.6667 },
  { index: 7, name: "Punarvasu", lord: "Jupiter", deity: "Aditi", symbol: "cung tên", gana: "Deva", element: "Nước", start: 80 },
  { index: 8, name: "Pushya", lord: "Saturn", deity: "Brihaspati", symbol: "bông hoa", gana: "Deva", element: "Nước", start: 93.3333 },
  { index: 9, name: "Ashlesha", lord: "Mercury", deity: "Nagas", symbol: "rắn cuộn", gana: "Rakshasa", element: "Nước", start: 106.6667 },
  { index: 10, name: "Magha", lord: "Ketu", deity: "Pitris", symbol: "ngai vàng", gana: "Rakshasa", element: "Nước", start: 120 },
  { index: 11, name: "Purva Phalguni", lord: "Venus", deity: "Bhaga", symbol: "giường", gana: "Manushya", element: "Nước", start: 133.3333 },
  { index: 12, name: "Uttara Phalguni", lord: "Sun", deity: "Aryaman", symbol: "cột giường", gana: "Manushya", element: "Nước", start: 146.6667 },
  { index: 13, name: "Hasta", lord: "Moon", deity: "Savitar", symbol: "bàn tay", gana: "Deva", element: "Nước", start: 160 },
  { index: 14, name: "Chitra", lord: "Mars", deity: "Vishwakarma", symbol: "viên ngọc", gana: "Rakshasa", element: "Lửa", start: 173.3333 },
  { index: 15, name: "Swati", lord: "Rahu", deity: "Vayu", symbol: "chồi non", gana: "Deva", element: "Lửa", start: 186.6667 },
  { index: 16, name: "Vishakha", lord: "Jupiter", deity: "Indragni", symbol: "cổng chào", gana: "Rakshasa", element: "Lửa", start: 200 },
  { index: 17, name: "Anuradha", lord: "Saturn", deity: "Mitra", symbol: "hoa sen", gana: "Deva", element: "Lửa", start: 213.3333 },
  { index: 18, name: "Jyeshtha", lord: "Mercury", deity: "Indra", symbol: "bùa hộ mệnh", gana: "Rakshasa", element: "Lửa", start: 226.6667 },
  { index: 19, name: "Mula", lord: "Ketu", deity: "Nirriti", symbol: "bó rễ", gana: "Rakshasa", element: "Lửa", start: 240 },
  { index: 20, name: "Purva Ashadha", lord: "Venus", deity: "Apah", symbol: "quạt", gana: "Manushya", element: "Lửa", start: 253.3333 },
  { index: 21, name: "Uttara Ashadha", lord: "Sun", deity: "Vishwadevas", symbol: "ngà voi", gana: "Manushya", element: "Lửa", start: 266.6667 },
  { index: 22, name: "Shravana", lord: "Moon", deity: "Vishnu", symbol: "tai", gana: "Deva", element: "Khí", start: 280 },
  { index: 23, name: "Dhanishta", lord: "Mars", deity: "Vasus", symbol: "trống", gana: "Rakshasa", element: "Khí", start: 293.3333 },
  { index: 24, name: "Shatabhisha", lord: "Rahu", deity: "Varuna", symbol: "vòng tròn", gana: "Rakshasa", element: "Khí", start: 306.6667 },
  { index: 25, name: "Purva Bhadrapada", lord: "Jupiter", deity: "Aja Ekapada", symbol: "kiếm", gana: "Manushya", element: "Khí", start: 320 },
  { index: 26, name: "Uttara Bhadrapada", lord: "Saturn", deity: "Ahirbudhnya", symbol: "rắn nước", gana: "Manushya", element: "Khí", start: 333.3333 },
  { index: 27, name: "Revati", lord: "Mercury", deity: "Pushan", symbol: "cá", gana: "Deva", element: "Khí", start: 346.6667 }
];

export const RASHIS = [
  { name: "Mesha", vi: "Bạch Dương", lord: "Mars", element: "Lửa" },
  { name: "Vrishabha", vi: "Kim Ngưu", lord: "Venus", element: "Đất" },
  { name: "Mithuna", vi: "Song Tử", lord: "Mercury", element: "Khí" },
  { name: "Karka", vi: "Cự Giải", lord: "Moon", element: "Nước" },
  { name: "Simha", vi: "Sư Tử", lord: "Sun", element: "Lửa" },
  { name: "Kanya", vi: "Xử Nữ", lord: "Mercury", element: "Đất" },
  { name: "Tula", vi: "Thiên Bình", lord: "Venus", element: "Khí" },
  { name: "Vrishchika", vi: "Bọ Cạp", lord: "Mars", element: "Nước" },
  { name: "Dhanu", vi: "Nhân Mã", lord: "Jupiter", element: "Lửa" },
  { name: "Makara", vi: "Ma Kết", lord: "Saturn", element: "Đất" },
  { name: "Kumbha", vi: "Bảo Bình", lord: "Saturn", element: "Khí" },
  { name: "Meena", vi: "Song Ngư", lord: "Jupiter", element: "Nước" }
];

export type NakshatraPosition = {
  nakshatra: NakshatraInfo;
  pada: number;
  /** Phần trăm đã đi qua của nakshatra (dùng để tính dasha). */
  fraction: number;
};

/** Xác định nakshatra + pada từ kinh độ hoàng đạo (đã quy về hệ sidereal). */
export const nakshatraOf = (siderealLongitude: number): NakshatraPosition => {
  const lon = normalizeDegree(siderealLongitude);
  const size = 360 / 27;
  const index = Math.floor(lon / size);
  const within = lon - index * size;
  const pada = Math.floor(within / (size / 4)) + 1;

  return {
    nakshatra: NAKSHATRAS[index],
    pada,
    fraction: within / size
  };
};

export const rashiOf = (siderealLongitude: number) => RASHIS[Math.floor(normalizeDegree(siderealLongitude) / 30)];

/* --------------------------------------------------------- Varga (D1..D60) */

export type VargaInfo = {
  id: string;
  label: string;
  divisions: number;
  use: string;
};

export const VARGAS: VargaInfo[] = [
  { id: "D1", label: "D1 - Rashi (bản đồ gốc)", divisions: 1, use: "Toàn cảnh cuộc đời, tính cách, mọi chủ đề" },
  { id: "D2", label: "D2 - Hora (tài sản)", divisions: 2, use: "Tiền bạc, tài sản, giá trị vật chất" },
  { id: "D3", label: "D3 - Drekkana (anh chị em)", divisions: 3, use: "Anh chị em, can đảm, sáng tạo" },
  { id: "D4", label: "D4 - Chaturthamsa (nhà cửa)", divisions: 4, use: "Bất động sản, tài sản thừa kế" },
  { id: "D7", label: "D7 - Saptamsa (con cái)", divisions: 7, use: "Con cái, dòng dõi" },
  { id: "D9", label: "D9 - Navamsa (hôn nhân & sức mạnh)", divisions: 9, use: "Hôn nhân, năng lực thật của hành tinh (quan trọng thứ hai sau D1)" },
  { id: "D10", label: "D10 - Dasamsa (sự nghiệp)", divisions: 10, use: "Nghề nghiệp, địa vị, thành tựu" },
  { id: "D12", label: "D12 - Dwadasamsa (cha mẹ)", divisions: 12, use: "Cha mẹ, tổ tiên" },
  { id: "D16", label: "D16 - Shodasamsa (xe cộ, tiện nghi)", divisions: 16, use: "Phương tiện, tiện nghi, vui vẻ" },
  { id: "D20", label: "D20 - Vimsamsa (tu tập)", divisions: 20, use: "Tâm linh, tu tập, đạo" },
  { id: "D24", label: "D24 - Chaturvimsamsa (học vấn)", divisions: 24, use: "Giáo dục, học vấn" },
  { id: "D27", label: "D27 - Bhamsa (sức mạnh nội tâm)", divisions: 27, use: "Nhịp sinh học, sức chịu đựng, nền tảng tinh thần" },
  { id: "D30", label: "D30 - Trimsamsa (tai hoạ)", divisions: 30, use: "Điểm yếu, tai hoạ, sức khỏe" },
  { id: "D40", label: "D40 - Khavedamsa (phước đức)", divisions: 40, use: "Phước từ mẹ, may mắn" },
  { id: "D45", label: "D45 - Akshavedamsa (đạo đức)", divisions: 45, use: "Đạo đức, phẩm hạnh, phước từ cha" },
  { id: "D60", label: "D60 - Shashtiamsa (nghiệp)", divisions: 60, use: "Nghiệp quả chi tiết, khác biệt giữa người cùng lá số" }
];

/** Quy tắc chia varga truyền thống (Parashara) cho một kinh độ sidereal. */
export const vargaSign = (siderealLongitude: number, divisions: number): number => {
  const lon = normalizeDegree(siderealLongitude);
  const sign = Math.floor(lon / 30);
  const within = lon - sign * 30;
  const part = Math.floor((within / 30) * divisions); // 0..divisions-1
  const odd = sign % 2 === 0; // Bạch Dương = 0 là cung lẻ

  switch (divisions) {
    case 1:
      return sign;
    case 2:
      // Hora: cung lẻ chia 2 phần đầu = Sư Tử (4), phần sau = Cự Giải (3); cung chẵn đảo lại
      return odd ? (part === 0 ? 4 : 3) : part === 0 ? 3 : 4;
    case 3:
      // Drekkana: 1/3 đầu = chính cung, 1/3 hai = cung +4, 1/3 ba = cung +8
      return (sign + part * 4) % 12;
    case 4:
      return (sign + part * 3) % 12;
    case 7:
      return odd ? (sign + part) % 12 : (sign + 6 + part) % 12;
    case 9:
      // Navamsa: bắt đầu từ cung khởi theo nguyên tố (lửa: Bạch Dương, đất: Ma Kết, khí: Thiên Bình, nước: Cự Giải)
      return (sign * 9 + part) % 12;
    case 10:
      return odd ? (sign + part) % 12 : (sign + 8 + part) % 12;
    case 12:
      return (sign + part) % 12;
    case 16:
      // Shodasamsa: cung động đếm từ Bạch Dương, cung cố định từ Sư Tử, cung linh hoạt từ Nhân Mã.
      return (((sign * 4) % 12) + part) % 12;
    case 20:
      // Vimsamsa: cung động từ Bạch Dương, cung cố định từ Nhân Mã, cung linh hoạt từ Sư Tử.
      return (((sign * 8) % 12) + part) % 12;
    case 24:
      // Chaturvimsamsa: cung lẻ đếm từ Sư Tử, cung chẵn đếm từ Cự Giải.
      return ((odd ? 4 : 3) + part) % 12;
    case 27:
      return (sign * 27 + part) % 12;
    case 30:
      // Trimsamsa: quy tắc khác nhau cho cung lẻ và chẵn
      return odd
        ? part < 5
          ? 0
          : part < 10
            ? 10
            : part < 18
              ? 8
              : part < 25
                ? 2
                : 6
        : part < 5
          ? 1
          : part < 12
            ? 5
            : part < 20
              ? 11
              : part < 25
                ? 9
                : 7;
    case 40:
      // Khavedamsa: cung lẻ đếm từ Bạch Dương, cung chẵn đếm từ Thiên Bình.
      return ((odd ? 0 : 6) + part) % 12;
    case 45:
      // Akshavedamsa: cung động từ Bạch Dương, cung cố định từ Sư Tử, cung linh hoạt từ Nhân Mã.
      return (((sign * 4) % 12) + part) % 12;
    case 60:
      return (sign * 60 + part) % 12;
    default:
      return sign;
  }
};

/* ------------------------------------------------------- Vimshottari Dasha */

export const DASHA_SEQUENCE = [
  { lord: "Ketu", years: 7 },
  { lord: "Venus", years: 20 },
  { lord: "Sun", years: 6 },
  { lord: "Moon", years: 10 },
  { lord: "Mars", years: 7 },
  { lord: "Rahu", years: 18 },
  { lord: "Jupiter", years: 16 },
  { lord: "Saturn", years: 19 },
  { lord: "Mercury", years: 17 }
];

export type DashaPeriod = {
  lord: string;
  start: Date;
  end: Date;
  isCurrent: boolean;
};

const YEAR_DAYS = 365.2425;

/** Chu kỳ Vimshottari 120 năm (mahadasha) tính từ vị trí Mặt Trăng lúc sinh. */
export const vimshottariDasha = (birthDate: Date, siderealMoonLongitude: number): DashaPeriod[] => {
  const { nakshatra, fraction } = nakshatraOf(siderealMoonLongitude);
  const startIndex = Math.max(0, DASHA_SEQUENCE.findIndex((item) => item.lord === nakshatra.lord));
  const now = Date.now();
  const periods: DashaPeriod[] = [];

  let cursor = birthDate.getTime() - fraction * DASHA_SEQUENCE[startIndex].years * YEAR_DAYS * 86400000;

  for (let i = 0; i < 9; i += 1) {
    const entry = DASHA_SEQUENCE[(startIndex + i) % 9];
    const span = entry.years * YEAR_DAYS * 86400000;
    const start = new Date(cursor);
    const end = new Date(cursor + span);
    periods.push({ lord: entry.lord, start, end, isCurrent: now >= start.getTime() && now < end.getTime() });
    cursor += span;
  }

  return periods;
};

/** Antardasha (dasha bậc 2) bên trong một mahadasha đã cho. */
export const antardashas = (period: DashaPeriod, birthMoonLongitude: number): DashaPeriod[] => {
  const total = period.end.getTime() - period.start.getTime();
  const startIndex = Math.max(0, DASHA_SEQUENCE.findIndex((item) => item.lord === period.lord));
  const now = Date.now();
  const result: DashaPeriod[] = [];

  void birthMoonLongitude;

  let cursor = period.start.getTime();
  for (let i = 0; i < 9; i += 1) {
    const entry = DASHA_SEQUENCE[(startIndex + i) % 9];
    const span = total * (entry.years / 120);
    const start = new Date(cursor);
    const end = new Date(cursor + span);
    result.push({ lord: entry.lord, start, end, isCurrent: now >= start.getTime() && now < end.getTime() });
    cursor += span;
  }

  return result;
};

/* ------------------------------------------------------------- Panchang */

export type Panchang = {
  tithi: string;
  tithiNumber: number;
  paksha: "Trăng sáng" | "Trăng tối";
  nakshatra: string;
  yoga: string;
  karana: string;
  vara: string;
};

const TITHI_NAMES = [
  "Pratipada",
  "Dwitiya",
  "Tritiya",
  "Chaturthi",
  "Panchami",
  "Shashthi",
  "Saptami",
  "Ashtami",
  "Navami",
  "Dashami",
  "Ekadashi",
  "Dwadashi",
  "Trayodashi",
  "Chaturdashi",
  "Purnima/Amavasya"
];

const YOGA_NAMES = [
  "Vishkambha",
  "Priti",
  "Ayushman",
  "Saubhagya",
  "Shobhana",
  "Atiganda",
  "Sukarma",
  "Dhriti",
  "Shula",
  "Ganda",
  "Vriddhi",
  "Dhruva",
  "Vyaghata",
  "Harshana",
  "Vajra",
  "Siddhi",
  "Vyatipata",
  "Variyana",
  "Parigha",
  "Shiva",
  "Siddha",
  "Sadhya",
  "Shubha",
  "Shukla",
  "Brahma",
  "Indra",
  "Vaidhriti"
];

const KARANA_NAMES = [
  "Bava",
  "Balava",
  "Kaulava",
  "Taitila",
  "Gara",
  "Vanija",
  "Vishti",
  "Shakuni",
  "Chatushpada",
  "Naga",
  "Kimstughna"
];

/** Panchang cơ bản: tithi, nakshatra, yoga, karana, vara (ngày trong tuần). */
export const panchangAt = (
  date: Date,
  tropicalSun: number,
  tropicalMoon: number,
  frame: ZodiacFrameId,
  /** Ngày theo giờ địa phương nơi sinh — dùng cho "vara" (thứ trong tuần). */
  localDate?: Date
): Panchang => {
  const ayan = ayanamsa(frame, date);
  const sun = normalizeDegree(tropicalSun - ayan);
  const moon = normalizeDegree(tropicalMoon - ayan);
  const elongation = signedSeparation(sun, moon) < 0 ? normalizeDegree(moon - sun) : normalizeDegree(moon - sun);

  const tithiIndex = Math.floor(elongation / 12); // 0..29
  const paksha: Panchang["paksha"] = tithiIndex < 15 ? "Trăng sáng" : "Trăng tối";
  const within = tithiIndex % 15;
  const tithiName = within === 14 ? (paksha === "Trăng sáng" ? "Purnima" : "Amavasya") : TITHI_NAMES[within];

  const nakshatra = nakshatraOf(moon).nakshatra.name;
  const yogaIndex = Math.floor(normalizeDegree(sun + moon) / (360 / 27));
  const karanaIndex = Math.floor(elongation / 6);

  const varaNames = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

  return {
    tithi: tithiName,
    tithiNumber: tithiIndex + 1,
    paksha,
    nakshatra,
    yoga: YOGA_NAMES[yogaIndex % 27],
    karana: KARANA_NAMES[karanaIndex % 11],
    vara: varaNames[(localDate ?? date).getUTCDay()]
  };
};

/* ----------------------------------------------------------- Moon (dùng chung) */

/** Kinh độ hoàng đạo nhiệt đới của Mặt Trăng, cùng quy ước với computePlanetLongitudes. */
export const tropicalMoonLongitude = (date: Date) =>
  normalizeDegree(SunPosition(date).elon + PairLongitude(Body.Moon, Body.Sun, date));
