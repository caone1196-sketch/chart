/**
 * Mô hình hiển thị bầu trời "trông thực tế": khí quyển (khúc xạ – hấp thụ – ánh sáng nền),
 * cấp sao → kích thước/quầng sáng, mây sao Ngân Hà, địa hình chân trời, hình dạng Mặt Trăng,
 * cùng các phép chiếu màn hình (độ cao – phương vị / xích kinh – xích vĩ) và nghịch đảo.
 *
 * Toàn bộ hàm ở đây thuần tuý (không DOM) để kiểm chứng được bằng test.
 */
import { PLANETS, calcObliquity, localSiderealDegrees, normalizeDegree } from "@/lib/astro";
import {
  CONSTELLATION_LINES,
  CONSTELLATION_META,
  DEEP_SKY,
  STARS,
  computeSkySnapshot,
  eclipticPath,
  galacticToEquatorial,
  precessFromJ2000,
  toHorizontal,
  type PlanetSky
} from "@/lib/sky";

const DEG = Math.PI / 180;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const clamp01 = (value: number) => clamp(value, 0, 1);
export const wrap180 = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

export const smoothstep = (edge0: number, edge1: number, value: number) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export type Rgb = [number, number, number];
export const rgbCss = (color: Rgb, alpha = 1) =>
  alpha >= 1 ? `rgb(${color[0]}, ${color[1]}, ${color[2]})` : `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;

export const mixColor = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * clamp01(t)),
  Math.round(a[1] + (b[1] - a[1]) * clamp01(t)),
  Math.round(a[2] + (b[2] - a[2]) * clamp01(t))
];

/* ------------------------------------------------- khí quyển: khúc xạ & hấp thụ */

/** Khúc xạ khí quyển (Bennett 1982), đơn vị phút cung. */
export const refractionArcMin = (altDeg: number) => {
  const h = Math.max(altDeg, -1);
  const argument = (h + 10.3 / (h + 5.11)) * DEG;
  const value = 1.02 / Math.tan(argument);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

/** Độ cao biểu kiến = độ cao thật + khúc xạ (độ). */
export const refractionDeg = (altDeg: number) => refractionArcMin(altDeg) / 60;
export const refractedAltitude = (altDeg: number) => altDeg + refractionDeg(altDeg);

/** Nghịch đảo khúc xạ: từ độ cao biểu kiến suy ra độ cao thật (chia đôi liên tiếp). */
export const trueAltitude = (apparentAltDeg: number) => {
  let low = apparentAltDeg - 1.2;
  let high = apparentAltDeg;
  for (let i = 0; i < 26; i += 1) {
    const mid = (low + high) / 2;
    if (refractedAltitude(mid) < apparentAltDeg) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
};

/** Khối lượng không khí theo Kasten & Young (1989). */
export const airmass = (altDeg: number) => {
  const h = Math.max(altDeg, -0.5);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
};

/** Độ suy giảm cấp sao do hấp thụ (k ≈ 0,2 mag/khối khí quyển ở dải nhìn thấy). */
export const extinctionMag = (altDeg: number, coefficient = 0.2) => coefficient * Math.max(0, airmass(altDeg) - 1);

/* ----------------------------------------------------------- ánh sáng nền trời */

export type SkyTone = {
  sunAlt: number;
  /** 0 = đêm, 1 = ban ngày (theo độ cao Mặt Trời). */
  day: number;
  /** Cường độ ráng chiều quanh phương vị Mặt Trời. */
  dusk: number;
  /** Hệ số nhìn thấy sao: 0 khi còn sáng, 1 khi đêm tối hẳn. */
  starFactor: number;
  zenith: Rgb;
  horizon: Rgb;
  ground: Rgb;
  groundFar: Rgb;
  ridge: Rgb;
  glow: Rgb;
  glowStrength: number;
};

const ZENITH_NIGHT: Rgb = [5, 9, 22];
const ZENITH_DAY: Rgb = [28, 84, 168];
const HORIZON_NIGHT: Rgb = [12, 19, 40];
const HORIZON_DAY: Rgb = [166, 200, 232];
const HORIZON_DUSK: Rgb = [196, 106, 62];
const GROUND_NIGHT: Rgb = [6, 8, 14];
const GROUND_DAY: Rgb = [70, 78, 68];

/** Bảng màu bầu trời theo độ cao Mặt Trời (ngày – chạng vạng – đêm). */
export const skyTone = (sunAltDeg: number): SkyTone => {
  const day = smoothstep(-7, 3, sunAltDeg);
  const starFactor = 1 - smoothstep(-15, -3.5, sunAltDeg);
  const dusk = clamp01(Math.exp(-Math.pow((sunAltDeg + 3.5) / 5.6, 2)) * (1 - smoothstep(4, 12, sunAltDeg)));
  const glowGain = clamp01(Math.exp(-Math.pow((sunAltDeg + 5) / 6.5, 2)));

  const zenith = mixColor(mixColor(ZENITH_NIGHT, ZENITH_DAY, day), [26, 44, 86], dusk * 0.35);
  const horizon = mixColor(mixColor(HORIZON_NIGHT, HORIZON_DAY, day), HORIZON_DUSK, dusk * 0.82);
  const ground = mixColor(GROUND_NIGHT, GROUND_DAY, day);
  const groundFar = mixColor(mixColor([9, 12, 20], [96, 108, 96], day), GROUND_NIGHT, starFactor * 0.85);
  const ridge = mixColor(mixColor([4, 5, 9], [38, 44, 40], day), [3, 4, 8], starFactor * 0.8);

  return {
    sunAlt: sunAltDeg,
    day,
    dusk,
    starFactor,
    zenith,
    horizon,
    ground,
    groundFar,
    ridge,
    glow: mixColor([92, 116, 168], HORIZON_DUSK, clamp01(dusk * 1.4)),
    // Đêm tối gần như không còn quầng sáng chân trời; mạnh nhất lúc chạng vạng.
    glowStrength: 0.03 + 0.62 * glowGain
  };
};

/* --------------------------------------------------------------- hình dạng sao */

const STAR_TINTS: Array<[number, Rgb]> = [
  [-0.35, [156, 178, 255]],
  [0.0, [172, 192, 255]],
  [0.3, [204, 216, 255]],
  [0.58, [248, 247, 255]],
  [0.85, [255, 244, 232]],
  [1.1, [255, 222, 180]],
  [1.4, [255, 191, 145]],
  [1.75, [255, 160, 118]],
  [2.4, [255, 132, 100]]
];

export const STAR_TINT_STOPS = STAR_TINTS;

/** Màu sao theo chỉ số màu B-V. */
export const starTint = (bv: number): Rgb => {
  const value = Number.isFinite(bv) ? bv : 0.6;
  let lower = STAR_TINTS[0];
  let upper = STAR_TINTS[STAR_TINTS.length - 1];
  for (let i = 0; i < STAR_TINTS.length - 1; i += 1) {
    if (value >= STAR_TINTS[i][0] && value <= STAR_TINTS[i + 1][0]) {
      lower = STAR_TINTS[i];
      upper = STAR_TINTS[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  return mixColor(lower[1], upper[1], (value - lower[0]) / span);
};

/** Chỉ số bảng màu (dùng cho sprite quầng sáng). */
export const starTintIndex = (bv: number) => {
  const value = Number.isFinite(bv) ? bv : 0.6;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  STAR_TINTS.forEach(([stop], index) => {
    const distance = Math.abs(stop - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
};

export type StarAppearance = {
  radius: number;
  haloRadius: number;
  haloAlpha: number;
  spikeLength: number;
  spikeAlpha: number;
  alpha: number;
};

/**
 * Cấp sao → kích thước nhìn thấy. Lõi sáng tăng theo hàm mũ của cấp sao (như ảnh phơi sáng),
 * sao sáng có thêm quầng (bloom) và tia nhiễu xạ như ảnh thiên văn.
 */
export const starAppearance = (mag: number, zoom: number): StarAppearance => {
  const boost = clamp(Math.pow(Math.max(zoom, 0.05), 0.32), 0.7, 2.8);
  const radius = clamp(0.3 * Math.pow(2.512, Math.max(0, 6.6 - mag) * 0.2), 0.3, 3.4) * boost;
  const bright = clamp01((4.6 - mag) / 4.6);
  const haloRadius = radius * (2.6 + 4.4 * bright);
  const haloAlpha = bright > 0 ? 0.05 + 0.3 * bright * bright : 0;
  const spike = bright > 0.72 ? clamp01((bright - 0.72) / 0.28) : 0;
  return {
    radius,
    haloRadius,
    haloAlpha,
    spikeLength: radius * (5 + 8 * spike),
    spikeAlpha: 0.22 * spike,
    alpha: clamp(0.42 + (6.6 - mag) * 0.16, 0.28, 1)
  };
};

/* --------------------------------------------------------------- dải Ngân Hà */

/** Toạ độ thiên hà (l, b) của một điểm xích đạo — dùng để kiểm tra cấu trúc Ngân Hà. */
export const galacticCoordinatesOf = (point: { ra: number; dec: number }) => {
  const alphaG = 192.85948 * DEG;
  const deltaG = 27.12825 * DEG;
  const lNcp = 122.93192 * DEG;
  const ra = point.ra * DEG;
  const dec = point.dec * DEG;
  const b = Math.asin(
    clamp(Math.sin(deltaG) * Math.sin(dec) + Math.cos(deltaG) * Math.cos(dec) * Math.cos(ra - alphaG), -1, 1)
  ) / DEG;
  const l =
    lNcp +
    Math.atan2(
      Math.cos(dec) * Math.sin(ra - alphaG),
      Math.sin(dec) * Math.cos(deltaG) - Math.cos(dec) * Math.sin(deltaG) * Math.cos(ra - alphaG)
    ) / DEG;
  return { l: wrap180(l), b };
};

export type MilkyPoint = {
  ra: number;
  dec: number;
  /** Trọng số độ sáng tương đối. */
  w: number;
  /** Kích thước sprite (px tại zoom = 1). */
  size: number;
  tint: 0 | 1 | 2;
  /** Hạt sao phân giải được (nhỏ, sắc) hay đám mây mờ. */
  grain: boolean;
};

const makeRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const gaussianFrom = (next: () => number) => {
  const u = Math.max(1e-6, next());
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Ranh giới vùng "rãnh tối" (Great Rift) chạy dọc mặt phẳng thiên hà. */
const riftFactor = (lDeg: number, bDeg: number) => {
  const l = wrap180(lDeg);
  if (Math.abs(bDeg) > 2.6) return 1;
  if (l < -6 || l > 82) return 1;
  const across = 1 - Math.pow(Math.abs(bDeg) / 2.6, 1.5);
  return 1 - 0.72 * clamp01(across);
};

const buildMilkyWayPoints = (): MilkyPoint[] => {
  const next = makeRandom(0x51de17a5);
  const points: MilkyPoint[] = [];

  for (let i = 0; i < 1150; i += 1) {
    const l = next() * 360;
    const wide = next() < 0.28;
    const sigma = wide ? 11.5 : 5.2;
    const b = gaussianFrom(next) * sigma;
    const lWrapped = wrap180(l);
    const bulge = 1 + 1.5 * Math.exp(-Math.pow(lWrapped / 26, 2));
    const disc = Math.exp(-Math.pow(b / (sigma * 1.35), 2) / 2);
    const w = clamp(0.25 + 0.75 * disc, 0, 1) * bulge * riftFactor(l, b);
    const warm = next() < 0.42 + 0.25 * Math.exp(-Math.pow(lWrapped / 30, 2));
    const equatorial = galacticToEquatorial(l, b);
    points.push({
      ...equatorial,
      w,
      size: 22 + next() * 30,
      tint: (warm ? 0 : next() < 0.5 ? 1 : 2) as 0 | 1 | 2,
      grain: false
    });
  }

  for (let i = 0; i < 520; i += 1) {
    const l = next() * 360;
    const b = gaussianFrom(next) * 3.4;
    const lWrapped = wrap180(l);
    const bulge = 1 + 1.6 * Math.exp(-Math.pow(lWrapped / 24, 2));
    const equatorial = galacticToEquatorial(l, b);
    points.push({
      ...equatorial,
      w: clamp(0.3 + 0.7 * Math.exp(-Math.pow(b / 4.6, 2) / 2), 0, 1) * bulge * riftFactor(l, b),
      size: 0.9 + next() * 1.1,
      tint: (next() < 0.5 ? 1 : next() < 0.5 ? 0 : 2) as 0 | 1 | 2,
      grain: true
    });
  }

  return points;
};

/** Đám mây sao Ngân Hà (sinh một lần, tất định). */
export const MILKY_WAY_POINTS = buildMilkyWayPoints();

/* --------------------------------------------------------------- địa hình chân trời */

type TerrainLayer = { base: number; amp: number; phase: [number, number, number, number]; seed: number };

const TERRAIN_LAYERS: TerrainLayer[] = [
  { base: 0.9, amp: 1.6, phase: [0.7, 2.1, 4.3, 1.1], seed: 1 },
  { base: 1.5, amp: 2.4, phase: [2.4, 5.2, 0.9, 3.7], seed: 2 },
  { base: 2.2, amp: 3.6, phase: [4.1, 1.3, 3.1, 5.9], seed: 3 }
];

/** Độ cao đường sống núi (độ) theo phương vị, cho từng lớp địa hình (0 = xa, 2 = gần). */
export const terrainHeightDeg = (azDeg: number, layer: 0 | 1 | 2) => {
  const meta = TERRAIN_LAYERS[layer];
  const a = azDeg * DEG;
  const wave =
    0.5 * Math.sin(3 * a + meta.phase[0]) +
    0.27 * Math.sin(7 * a + meta.phase[1]) +
    0.15 * Math.sin(13 * a + meta.phase[2]) +
    0.08 * Math.sin(29 * a + meta.phase[3]);
  return meta.base + meta.amp * wave;
};

/** Độ cao tối đa của địa hình theo phương vị — dùng để che các vật thể bị núi khuất. */
export const terrainMaxDeg = (azDeg: number) =>
  Math.max(terrainHeightDeg(azDeg, 0), terrainHeightDeg(azDeg, 1), terrainHeightDeg(azDeg, 2));

/* --------------------------------------------------------------- hình dạng Mặt Trăng */

export type MoonGeometry = {
  /** Tỉ lệ phần được chiếu sáng 0..1. */
  illumination: number;
  /** Tỉ lệ bán trục nhỏ/bán kính của đường phân giới sáng–tối. */
  terminatorRatio: number;
};

/** Hình học pha Mặt Trăng theo góc ly giác (0° = trăng mới, 180° = trăng tròn). */
export const moonGeometry = (elongationDeg: number): MoonGeometry => {
  const e = clamp(elongationDeg, 0, 180) * DEG;
  return {
    illumination: (1 - Math.cos(e)) / 2,
    terminatorRatio: Math.abs(Math.cos(e))
  };
};

/** Tên pha Mặt Trăng theo góc ly giác (0° = trăng mới, 180° = trăng tròn). */
export const phaseName = (elongationDeg: number) => {
  const e = Math.abs(elongationDeg);
  if (e < 22.5) return "Trăng mới (non)";
  if (e < 67.5) return "Trăng lưỡi liềm";
  if (e < 112.5) return "Bán nguyệt";
  if (e < 157.5) return "Trăng khuyết";
  return "Trăng tròn";
};

/* ------------------------------------------------------------------ định dạng số */

export const formatRa = (raDeg: number) => {
  const totalMinutes = Math.round((((raDeg % 360) + 360) % 360) / 15 * 60) % 1440;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}h${String(minute).padStart(2, "0")}m`;
};

export const formatDec = (decDeg: number) => {
  const sign = decDeg < 0 ? "−" : "+";
  const value = Math.abs(decDeg);
  const degree = Math.floor(value);
  const minute = Math.round((value - degree) * 60);
  return minute === 60 ? `${sign}${degree + 1}°00′` : `${sign}${degree}°${String(minute).padStart(2, "0")}′`;
};

export const formatSpan = (degrees: number) => (degrees >= 10 ? `${degrees.toFixed(0)}°` : `${degrees.toFixed(1)}°`);

/* ------------------------------------------------------------------- phép chiếu */

export type SkyMode = "horizon" | "map";

export type SkyView = {
  zoom: number;
  /** Dịch chuyển khung nhìn (chỉ dùng ở chế độ chân trời). */
  x: number;
  y: number;
  centerRa: number;
  centerDec: number;
};

export type ProjectedPoint = { x: number; y: number; visible: boolean };

export const HORIZON_ZOOM = { min: 0.6, max: 22, initial: 1 };
export const MAP_ZOOM = { min: 1, max: 24, initial: 1 };

/** Giới hạn dịch chuyển khung chân trời (tỉ lệ cạnh khung) — dùng chung cho kéo, phím tắt và zoom. */
export const HORIZON_PAN_LIMIT = 0.85;

/** Kẹp toạ độ dịch chuyển của khung chân trời vào trong giới hạn cho phép. */
export const clampPan = (x: number, y: number, width: number, height: number) => ({
  x: clamp(Number.isFinite(x) ? x : 0, -width * HORIZON_PAN_LIMIT, width * HORIZON_PAN_LIMIT),
  y: clamp(Number.isFinite(y) ? y : 0, -height * HORIZON_PAN_LIMIT, height * HORIZON_PAN_LIMIT)
});

/* --------------------------------------------------------- quy đổi sự kiện lăn chuột */

/** Một nấc lăn chuột chuẩn của trình duyệt (Chrome/Edge/Safari gửi ±100…±120 cho mỗi nấc). */
const WHEEL_NOTCH = 120;
/** Số nấc chuẩn để mức phóng thay đổi gấp đôi → 5 nấc ≈ 2×, tức mỗi nấc ≈ 1,15×. */
const WHEEL_NOTCHES_PER_DOUBLE = 5;
/** Một sự kiện đơn lẻ không được phóng/thu quá hệ số này (chuột gaming gửi deltaY rất lớn). */
const WHEEL_FACTOR_LIMIT = 2.4;

export type WheelZoomInput = {
  deltaY?: number;
  deltaMode?: number;
  ctrlKey?: boolean;
};

/**
 * Quy đổi sự kiện lăn chuột / lướt bàn rê thành **hệ số phóng to** (>1 phóng to, <1 thu nhỏ).
 *
 * Vì sao cần hàm riêng thay vì đọc thẳng `deltaY`:
 *  - `deltaMode` khác nhau giữa trình duyệt: Chrome/Safari = 0 (điểm ảnh), Firefox = 1 (dòng, ±3 mỗi nấc),
 *    một số trường hợp = 2 (trang). Không chuẩn hoá thì Firefox phóng chậm gấp ~2 lần Chrome.
 *  - Bàn rê gửi hàng chục sự kiện nhỏ (deltaY ≈ 1…10) còn chuột rời gửi một nấc ±100…±120;
 *    ánh xạ theo hàm mũ của delta nên cả hai đều mượt và không bị "nhảy cóc" khi lướt nhanh.
 *  - Cử chỉ chụm hai ngón trên bàn rê được gửi kèm `ctrlKey` (trình duyệt coi là zoom trang) —
 *    ta tự xử lý để phóng bản đồ thay vì phóng cả trang.
 *  - Sự kiện không có `deltaY` hữu hạn (trình giả lập, `MouseEvent` thường) coi như một nấc lăn lên.
 */
export const wheelZoomFactor = (event: WheelZoomInput): number => {
  const raw = Number(event?.deltaY);
  let delta = Number.isFinite(raw) ? raw : -WHEEL_NOTCH;
  if (event?.deltaMode === 1) delta *= 32; // dòng → điểm ảnh (3 dòng ≈ một nấc 100px của Chrome)
  else if (event?.deltaMode === 2) delta *= 800; // trang → điểm ảnh
  if (delta === 0) return 1;
  const notches = delta / WHEEL_NOTCH;
  const factor = Math.pow(2, -notches / WHEEL_NOTCHES_PER_DOUBLE);
  return clamp(factor, 1 / WHEEL_FACTOR_LIMIT, WHEEL_FACTOR_LIMIT);
};

/** Tỉ lệ px/đơn-vị cho phép chiếu phương vị – độ cao (vòm trời vừa khung ở zoom 1). */
export const horizonScale = (width: number, height: number, zoom: number) => (Math.min(width, height) * 0.23) * zoom;

/** Tỉ lệ px/độ cho bản đồ xích kinh – xích vĩ (đủ 180° xích vĩ ở zoom 1, tính theo chiều cao). */
export const mapScale = (width: number, height: number, zoom: number) => ((height || width) * 0.96 / 182) * zoom;

export type Projector = {
  mode: SkyMode;
  scale: number;
  width: number;
  height: number;
  /** Chiếu một điểm trên thiên cầu (ra/dec theo hệ của ngày, alt/az đã tính). */
  forward: (point: { ra: number; dec: number; alt: number; az: number }) => ProjectedPoint;
  /** Chiếu theo (alt, az) — dùng cho lưới và địa hình. */
  fromHorizontal: (alt: number, az: number) => ProjectedPoint;
  /** Ngược: từ toạ độ màn hình ra (ra, dec, alt, az). */
  inverse: (x: number, y: number) => { ra: number; dec: number; alt: number; az: number };
};

/**
 * Tạo bộ chiếu cho một trong hai chế độ.
 * - horizon: phép chiếu lập thể quanh thiên đỉnh (r = 2·tan((90° − alt)/2)), tâm khung = thiên đỉnh;
 *   các điểm dưới chân trời vẫn chiếu được để vẽ mặt đất.
 * - map: thang đo đều (xích kinh ngang, xích vĩ dọc), xích kinh tăng dần về phía trái (đông).
 */
export const makeProjector = (
  mode: SkyMode,
  view: SkyView,
  width: number,
  height: number,
  options: { refract?: boolean } = {}
): Projector => {
  const refract = options.refract ?? false;
  const plotAlt = (alt: number) => (refract ? refractedAltitude(alt) : alt);

  if (mode === "horizon") {
    const scale = horizonScale(width, height, view.zoom);
    const centerX = width / 2 + view.x;
    const centerY = height / 2 + view.y;

    const fromHorizontal = (alt: number, az: number): ProjectedPoint => {
      if (!Number.isFinite(alt) || !Number.isFinite(az)) return { x: Number.NaN, y: Number.NaN, visible: false };
      const clamped = Math.max(plotAlt(alt), -85);
      const radius = 2 * Math.tan(((90 - clamped) * Math.PI) / 360) * scale;
      const azRad = az * DEG;
      return {
        x: centerX + radius * Math.sin(azRad),
        y: centerY - radius * Math.cos(azRad),
        visible: true
      };
    };

    return {
      mode,
      scale,
      width,
      height,
      forward: (point) => fromHorizontal(point.alt, point.az),
      fromHorizontal,
      inverse: (x, y) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const radius = Math.hypot(dx, dy) / scale;
        const apparent = 90 - (2 * Math.atan(radius / 2)) / DEG;
        return {
          ra: Number.NaN,
          dec: Number.NaN,
          alt: refract ? trueAltitude(apparent) : apparent,
          az: normalizeDegree(Math.atan2(dx, -dy) / DEG)
        };
      }
    };
  }

  const scale = mapScale(width, height, view.zoom);

  const project = (ra: number, dec: number): ProjectedPoint => ({
    x: width / 2 - wrap180(ra - view.centerRa) * scale,
    y: height / 2 - (dec - view.centerDec) * scale,
    visible: true
  });

  return {
    mode,
    scale,
    width,
    height,
    forward: (point) => project(point.ra, point.dec),
    fromHorizontal: (_alt: number, _az: number) => {
      // Không dùng ở chế độ bản đồ (không có mặt đất), chỉ để đủ kiểu dữ liệu.
      return { x: Number.NaN, y: Number.NaN, visible: false };
    },
    inverse: (x, y) => {
      const ra = wrap180(view.centerRa + (width / 2 - x) / scale);
      const dec = view.centerDec + (height / 2 - y) / scale;
      return { ra, dec, alt: Number.NaN, az: Number.NaN };
    }
  };
};

/** Như `toHorizontal` nhưng an toàn với đầu vào bất thường (dùng cho lớp hiển thị). */
export const toHorizontalSafe = (ra: number, dec: number, lstDeg: number, latDeg: number) => {
  if (![ra, dec, lstDeg, latDeg].every((value) => Number.isFinite(value))) return { alt: Number.NaN, az: Number.NaN };
  return toHorizontal(ra, dec, lstDeg, latDeg);
};

/**
 * Phóng to quanh một điểm màn hình: giữ nguyên vật thể đang nằm dưới con trỏ.
 * Trả về khung nhìn mới (kèm zoom đã kẹp trong khoảng cho phép của chế độ);
 * ở chế độ chân trời phần dịch chuyển cũng được kẹp trong `HORIZON_PAN_LIMIT`.
 */
export const zoomAroundPoint = (
  mode: SkyMode,
  view: SkyView,
  point: { x: number; y: number },
  factor: number,
  width: number,
  height: number
): SkyView => {
  const range = mode === "horizon" ? HORIZON_ZOOM : MAP_ZOOM;
  const zoom = clamp(view.zoom * factor, range.min, range.max);
  if (zoom === view.zoom) return view;

  if (mode === "horizon") {
    const before = horizonScale(width, height, view.zoom);
    const after = horizonScale(width, height, zoom);
    const centerX = width / 2 + view.x;
    const centerY = height / 2 + view.y;
    const ratio = after / before;
    // Kẹp lại như khi kéo: nếu không, zoom liên tục quanh một điểm ở rìa khung sẽ đẩy bầu trời
    // ra ngoài màn hình và không có cách nào lấy lại ngoài nút "Căn lại".
    const pan = clampPan(point.x - (point.x - centerX) * ratio - width / 2, point.y - (point.y - centerY) * ratio - height / 2, width, height);
    return { ...view, zoom, x: pan.x, y: pan.y };
  }

  const before = mapScale(width, height, view.zoom);
  const after = mapScale(width, height, zoom);
  const deltaX = (width / 2 - point.x) * (1 / before - 1 / after);
  const deltaY = (height / 2 - point.y) * (1 / before - 1 / after);
  return {
    ...view,
    zoom,
    centerRa: wrap180(view.centerRa + deltaX),
    centerDec: clamp(view.centerDec + deltaY, -89.5, 89.5)
  };
};

/* -------------------------------------------------------------- dựng khung bầu trời */

export type SkyPoint = { ra: number; dec: number; alt: number; az: number };

export type SkyStar = SkyPoint & {
  index: number;
  mag: number;
  bv: number;
  labelIndex: number | null;
};

export type SkyPolyline = { abbr: string; points: SkyPoint[] };

export type SkyMilkyPoint = SkyPoint & Pick<MilkyPoint, "w" | "size" | "tint" | "grain">;

export type SkyFrame = {
  date: Date;
  latitude: number;
  longitude: number;
  lstDeg: number;
  obliquity: number;
  planets: PlanetSky[];
  stars: SkyStar[];
  lines: SkyPolyline[];
  milkyWay: SkyMilkyPoint[];
  ecliptic: SkyPoint[];
  horizonRing: SkyPoint[];
  deepSky: SkyPoint[];
  constellationLabels: Array<{ vi: string; latin: string; rank: number; ra: number; dec: number; alt: number; az: number }>;
  sunAlt: number;
  moonElongation: number;
};

/** Khung bầu trời đầy đủ (vị trí biểu kiến của ngày + dữ liệu nền cho phần hiển thị). */
export const buildSkyFrame = (date: Date, latitude: number, longitude: number): SkyFrame => {
  const lstDeg = localSiderealDegrees(date, longitude);
  const obliquity = calcObliquity(date);
  const project = (ra: number, dec: number): SkyPoint => ({ ra, dec, ...toHorizontal(ra, dec, lstDeg, latitude) });

  const ecliptic = eclipticPath(date).map((point) => {
    const ofDate = precessFromJ2000(point.ra, point.dec, date);
    return project(ofDate.ra, ofDate.dec);
  });

  const stars: SkyStar[] = STARS.map((star) => {
    const ofDate = precessFromJ2000(star.ra, star.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    return {
      index: star.index,
      ra: ofDate.ra,
      dec: ofDate.dec,
      alt: horizontal.alt,
      az: horizontal.az,
      mag: star.mag,
      bv: star.bv,
      labelIndex: star.alternatives.length ? star.index : null
    };
  });

  const lines: SkyPolyline[] = Object.entries(CONSTELLATION_LINES).map(([abbr, polylines]) => ({
    abbr,
    points: polylines.flatMap((flat) => {
      const points: SkyPoint[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        const ofDate = precessFromJ2000(flat[i], flat[i + 1], date);
        points.push(project(ofDate.ra, ofDate.dec));
        if (i > 0) points.push({ ra: Number.NaN, dec: Number.NaN, alt: Number.NaN, az: Number.NaN });
      }
      return points;
    })
  }));

  const milkyWay: SkyMilkyPoint[] = MILKY_WAY_POINTS.map((point) => {
    const ofDate = precessFromJ2000(point.ra, point.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    return { ...point, ra: ofDate.ra, dec: ofDate.dec, alt: horizontal.alt, az: horizontal.az };
  });

  const horizonRing: SkyPoint[] = [];
  const lat = latitude * DEG;
  for (let az = 0; az <= 360; az += 3) {
    const azRad = az * DEG;
    const dec = Math.asin(clamp(Math.cos(lat) * Math.cos(azRad), -1, 1)) / DEG;
    const hourAngle = Math.atan2(-Math.sin(azRad), -Math.sin(lat) * Math.cos(azRad)) / DEG;
    horizonRing.push({ ra: wrap180(lstDeg - hourAngle), dec, alt: 0, az });
  }

  const deepSky: SkyPoint[] = DEEP_SKY.map((object) => {
    const ofDate = precessFromJ2000(object.ra, object.dec, date);
    return project(ofDate.ra, ofDate.dec);
  });

  const constellationLabels = CONSTELLATION_META.map((meta) => {
    const ofDate = precessFromJ2000(meta.ra, meta.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    return { vi: meta.vi, latin: meta.latin, rank: meta.rank, ra: ofDate.ra, dec: ofDate.dec, ...horizontal };
  });

  const snapshot = computeSkySnapshot(date, latitude, longitude, lstDeg, obliquity);
  const sun = snapshot.planets.find((planet) => planet.key === "sun");
  const moon = snapshot.planets.find((planet) => planet.key === "moon");
  const moonElongation =
    sun && moon
      ? Math.acos(
          clamp(
            Math.sin(sun.dec * DEG) * Math.sin(moon.dec * DEG) +
              Math.cos(sun.dec * DEG) * Math.cos(moon.dec * DEG) * Math.cos((sun.ra - moon.ra) * DEG),
            -1,
            1
          )
        ) / DEG
      : 180;

  return {
    date,
    latitude,
    longitude,
    lstDeg,
    obliquity,
    planets: snapshot.planets,
    stars,
    lines,
    milkyWay,
    ecliptic,
    horizonRing,
    deepSky,
    constellationLabels,
    sunAlt: snapshot.sunAltitude,
    moonElongation
  };
};

/* -------------------------------------------------------------- đối tượng tra cứu */

export type SkyTargetKind = "star" | "deepsky" | "planet" | "constellation" | "galacticCenter" | "zenith";

export type SkyTarget = {
  kind: SkyTargetKind;
  /** Khoá tra cứu: chỉ số sao / thiên thể sâu / hành tinh / tên chòm. */
  key: string | number;
  label: string;
  search: string;
};

/** Tên tiếng Việt quen thuộc của một số sao sáng (dùng cho ô tra cứu). */
const STAR_VI_ALIASES: Record<string, string> = {
  Polaris: "Sao Bắc Cực",
  Sirius: "Sao Thiên Lang",
  Vega: "Sao Chức Nữ",
  Altair: "Sao Ngưu Lang",
  Antares: "Sao Tâm Tú",
  Aldebaran: "Sao Tất Tú",
  Rigel: "Sao Sâm Tú Thất",
  Betelgeuse: "Sao Sâm Tú Tứ",
  Bellatrix: "Sao Sâm Tú Ngũ",
  Alnilam: "Sao Sâm Tú Tam",
  Alnitak: "Sao Sâm Tú Nhất",
  Mintaka: "Sao Sâm Tú Nhị",
  Capella: "Sao Ngũ Xa Nhị",
  Procyon: "Sao Nam Hà Tam",
  Arcturus: "Sao Đại Giác",
  Spica: "Sao Giác Tú Nhất",
  Regulus: "Sao Tinh Tú Nhất",
  Canopus: "Sao Lão Nhân",
  Fomalhaut: "Sao Bắc Lạc Sư Môn",
  Achernar: "Sao Thủy Ủy Nhất",
  Mizar: "Sao Khai Dương",
  Alioth: "Sao Ngọc Hành",
  Dubhe: "Sao Thiên Xu",
  Pollux: "Sao Bắc Hà Tam",
  Castor: "Sao Bắc Hà Nhị",
  Alphard: "Sao Tinh Khiết",
  Mirfak: "Sao Thiên Thuyền Tam",
  Alhena: "Sao Tỉnh Tú Tam",
  Wezen: "Sao Hồ Thỉ Tam",
  Menkalinan: "Sao Ngũ Xa Tam",
  Alkaid: "Sao Dao Quang",
  Alpheratz: "Sao Bích Tú Nhị",
  Almach: "Sao Thiên Đại Tướng Quân Nhất",
  Denebola: "Sao Ngũ Đế Tọa Nhất",
  Algieba: "Sao Hiên Viên Thập Nhị",
  Sadalsuud: "Sao Hư Tú Nhất"
};

const PLANET_ALIASES: Record<string, string> = {
  sun: "Mặt Trời Thái Dương",
  moon: "Mặt Trăng Nguyệt",
  mercury: "Sao Thủy Thủy Tinh",
  venus: "Sao Kim Kim Tinh",
  mars: "Sao Hỏa Hỏa Tinh",
  jupiter: "Sao Mộc Mộc Tinh",
  saturn: "Sao Thổ Thổ Tinh",
  uranus: "Sao Thiên Vương",
  neptune: "Sao Hải Vương",
  pluto: "Sao Diêm Vương"
};

const stripDiacritics = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

/** Danh mục tra cứu: sao sáng có tên, thiên thể sâu, chòm sao, hành tinh và vài vị trí đặc biệt. */
export const buildSkyTargets = (): SkyTarget[] => {
  const targets: SkyTarget[] = [];

  STARS.forEach((star, index) => {
    const name = star.alternatives[0];
    if (!name || star.mag > 4.5) return;
    const extra = star.alternatives.slice(1).filter((item) => !item.startsWith("HIP")).join(" ");
    const vietnamese = star.alternatives
      .map((alternative) => STAR_VI_ALIASES[alternative])
      .filter(Boolean)
      .join(" ");
    targets.push({
      kind: "star",
      key: index,
      label: `${name}${star.constellationVi ? ` · ${star.constellationVi}` : ""} (mag ${star.mag.toFixed(2)})`,
      search: stripDiacritics(`${name} ${extra} ${vietnamese} ${star.constellationVi ?? ""} ${star.constellationAbbr ?? ""}`)
    });
  });

  DEEP_SKY.forEach((object, index) => {
    targets.push({
      kind: "deepsky",
      key: index,
      label: `${object.id} · ${object.vi || object.en}`,
      search: stripDiacritics(`${object.id} ${object.vi} ${object.en} ${object.typeVi}`)
    });
  });

  PLANETS.forEach((planet) => {
    targets.push({
      kind: "planet",
      key: planet.key,
      label: `${planet.label} (hành tinh)`,
      search: stripDiacritics(`${planet.label} ${PLANET_ALIASES[planet.key] ?? ""} ${planet.glyph}`)
    });
  });

  CONSTELLATION_META.forEach((meta) => {
    targets.push({
      kind: "constellation",
      key: meta.abbr,
      label: `Chòm ${meta.vi} · ${meta.latin}`,
      search: stripDiacritics(`${meta.vi} ${meta.latin} ${meta.abbr}`)
    });
  });

  targets.push(
    { kind: "galacticCenter", key: "galactic", label: "Trung tâm Ngân Hà (Nhân Mã A*)", search: "trung tam ngan ha nhan ma sagittarius a* galactic center" },
    { kind: "zenith", key: "zenith", label: "Thiên đỉnh (điểm thẳng trên đầu)", search: "thien dinh zenith" },
    { kind: "constellation", key: "Sgr", label: "Vùng trời Nhân Mã – Bọ Cạp (Ngân Hà)", search: "nhan ma bo cap sagittarius scorpius milky way" }
  );

  return targets;
};

/** Tìm đối tượng gần đúng theo chuỗi người dùng gõ (bỏ dấu, không phân biệt hoa thường). */
export const findSkyTarget = (targets: SkyTarget[], query: string): SkyTarget | null => {
  const needle = stripDiacritics(query);
  if (!needle) return null;
  const exact = targets.find((target) => target.search === needle || target.label.toLowerCase() === query.trim().toLowerCase());
  if (exact) return exact;

  let best: SkyTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const index = target.search.indexOf(needle);
    if (index < 0) continue;
    const score = index * 100 + target.search.length;
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
};

/* ----------------------------------------------------------- vị trí phụ trợ khác */

/** Toạ độ xích đạo (hệ của ngày) của một điểm đặc biệt. */
export const specialTargetEquatorial = (
  target: SkyTarget,
  frame: SkyFrame
): { ra: number; dec: number } | null => {
  if (target.kind === "zenith") return { ra: frame.lstDeg, dec: frame.latitude };
  if (target.kind === "galacticCenter") {
    const point = galacticToEquatorial(0, 0);
    return precessFromJ2000(point.ra, point.dec, frame.date);
  }
  if (target.kind === "constellation") {
    const meta = CONSTELLATION_META.find((item) => item.abbr === target.key);
    if (!meta) return null;
    return precessFromJ2000(meta.ra, meta.dec, frame.date);
  }
  if (target.kind === "star") {
    const meta = STARS[Number(target.key)];
    return precessFromJ2000(meta.ra, meta.dec, frame.date);
  }
  if (target.kind === "deepsky") {
    const meta = DEEP_SKY[Number(target.key)];
    return precessFromJ2000(meta.ra, meta.dec, frame.date);
  }
  const planet = frame.planets.find((item) => item.key === target.key);
  return planet ? { ra: planet.ra, dec: planet.dec } : null;
};

/** Kinh độ hoàng đạo (tropical) của một điểm xích đạo. */
export const eclipticLongitudeOf = (ra: number, dec: number, obliquity: number) => {
  const raRad = ra * DEG;
  const decRad = dec * DEG;
  const eps = obliquity * DEG;
  return normalizeDegree(Math.atan2(Math.sin(raRad) * Math.cos(eps) + Math.tan(decRad) * Math.sin(eps), Math.cos(raRad)) / DEG);
};

/** Góc giữa hai điểm trên thiên cầu (độ). */
export const angularSeparation = (a: { ra: number; dec: number }, b: { ra: number; dec: number }) =>
  Math.acos(
    clamp(
      Math.sin(a.dec * DEG) * Math.sin(b.dec * DEG) +
        Math.cos(a.dec * DEG) * Math.cos(b.dec * DEG) * Math.cos((a.ra - b.ra) * DEG),
      -1,
      1
    )
  ) / DEG;

