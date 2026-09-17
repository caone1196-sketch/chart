/**
 * Hình học vòng bản đồ sao natal — tách khỏi phần vẽ để **kiểm chứng được bằng test**.
 *
 * Lỗi người dùng báo: "bản đồ bị cắt lẹm" trên điện thoại Android. Nguyên nhân là hình học
 * cũ vẽ sát/ngoài `viewBox` 500×500:
 *   · nhãn AC/DC/MC/IC đặt ở bán kính 232 rồi trừ tiếp 13 ở `y`, mà chữ chỉ cao 12px
 *     → gần như toàn bộ chữ nằm ngoài khung vẽ (SVG mặc định `overflow: hidden`), chỉ còn
 *     một vệt mờ ở mép;
 *   · Hải Vương tinh khi lùi vào vành trong (bán kính tâm 134) có đuôi tới ~134 + 29,3
 *     → vượt ra ngoài `viewBox` 3,3 đơn vị, bị gọt mất một miếng;
 *   · vòng ngoài r = 236 trên nửa khung 250 chỉ còn 14 đơn vị đệm, không đủ cho nét vẽ.
 *
 * Bản này dựng khung 600×600 với **vùng an toàn 16 đơn vị (≈2,7%)** ở mọi mép, và mọi thứ
 * vẽ ra đều đi qua `buildWheelLayout()` — nơi trả về toạ độ **đã tính sẵn** cho từng phần tử
 * kèm hộp bao của chúng, nên `tests/wheel.check.ts` khẳng định được "không gì bị cắt",
 * kể cả khi 10 hành tinh dồn vào một độ hay dữ liệu có NaN.
 */

import { ZODIAC_SIGNS } from "./astro";

export const WHEEL_SIZE = 600;
export const WHEEL_CENTER = WHEEL_SIZE / 2;

/** Vùng đệm bắt buộc ở mọi mép khung: mọi nét vẽ (kể cả nửa nét) phải nằm trong đây. */
export const WHEEL_SAFE_MARGIN = 16;

/** Bán kính lớn nhất mà bất kỳ phần tử nào được phép chạm tới. */
export const WHEEL_MAX_RADIUS = WHEEL_CENTER - WHEEL_SAFE_MARGIN;

/**
 * Các vành đồng tâm (đơn vị của khung 600). Thứ tự bắt buộc từ ngoài vào:
 * đĩa nền → vành hoàng đạo (ký hiệu cung + nhãn góc) → số nhà → hành tinh → vòng góc chiếu.
 */
export const WHEEL_RINGS = {
  /** Đĩa nền phát sáng, không viền. */
  glow: 284,
  /** Vòng ngoài cùng của vành hoàng đạo. */
  zodiacOuter: 280,
  /** Bán kính tâm nhãn cung + nhãn AC/DC/MC/IC (giữa vành). */
  zodiacGlyph: 249,
  /** Vòng trong của vành hoàng đạo. */
  zodiacInner: 218,
  /** Số nhà nằm ngay trong vành hoàng đạo. */
  houseNumber: 204,
  /** Vành ngoài cùng của hành tinh. */
  planetBase: 178,
  /** Mỗi bậc lùi vào thì bán kính giảm đúng bấy nhiêu. */
  planetStep: 22,
  /** Số bậc lùi tối đa (10 hành tinh dồn một chỗ vẫn đủ chỗ). */
  planetStackMax: 4,
  /** Vòng trong cùng, cũng là mốc vẽ đường góc chiếu. */
  aspect: 72
} as const;

/** Nét vẽ. */
export const WHEEL_STROKES = {
  zodiacBand: WHEEL_RINGS.zodiacOuter - WHEEL_RINGS.zodiacInner,
  zodiacOuter: 1.5,
  zodiacInner: 1,
  signDivider: 1,
  houseCusp: 1,
  angleAxis: 2.4,
  aspect: 1.2,
  planet: 1.2,
  planetHighlight: 2.4,
  leader: 1,
  chip: 1
} as const;

/** Cỡ chữ (đơn vị khung). */
/**
 * Cỡ chữ. Ký hiệu hành tinh vẽ trong đĩa là **glyph chiêm tinh** (☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ — trường
 * `glyph` của dữ liệu), rộng ~1em nên ở cỡ 15 luôn nằm gọn trong đĩa bán kính 15,5.
 * (Bản cũ vẽ `symbol` dạng "Sun"/"Moon" nên chữ tràn ra ngoài vòng tròn.)
 */
export const WHEEL_TEXT = {
  signGlyph: 28,
  angleLabel: 17,
  houseNumber: 16,
  planetGlyph: 16,
  retroBadge: 9.5
} as const;

export const WHEEL_PLANET_DISC = 15.5;
/** Đĩa lớn hơn cho hành tinh đang được làm nổi bật. */
export const WHEEL_PLANET_DISC_HIGHLIGHT = 2;
/**

 * Bước dịch ký hiệu hành tinh khi vành đã kín (độ). Ký hiệu có thể bị đẩy sang bên,
 * nhưng **vạch dẫn luôn chỉ về đúng kinh độ thật** — đúng quy ước của vòng bản đồ sao.
 */
export const WHEEL_TANGENTIAL_STEP = 6;
/** Mức dịch tối đa để không ký hiệu nào bị đẩy xa khỏi chỗ thật quá nửa cung (độ). */
export const WHEEL_TANGENTIAL_MAX = 90;
/** Khe hở tối thiểu giữa hai đĩa hành tinh (đơn vị khung). */
export const WHEEL_DISC_GAP = 2;
/**
 * Huy hiệu nghịch hành: đặt lệch xuống góc dưới–phải của đĩa nhưng vẫn nằm gọn trong đĩa
 * (góc xa nhất của chữ cách tâm `hypot(6,5 + 2,9; 8 + 3,7) ≈ 14,9 < bán kính đĩa 15,5`).
 */
export const WHEEL_RETRO_OFFSET = { x: 6.5, y: 8 } as const;

export const WHEEL_ANGLE_LABELS = ["AC", "DC", "MC", "IC"] as const;

/**
 * Khi chip nhãn AC/DC/MC/IC rơi trúng giữa một cung, ký hiệu cung được dịch theo các bước
 * này (độ) — luôn nằm trong lòng cung của chính nó nên không đọc nhầm sang cung bên cạnh.
 */
export const WHEEL_GLYPH_MAX_OFFSET = 13;
export const WHEEL_GLYPH_OFFSETS = [2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12, 13, -13].filter(
  (offset) => Math.abs(offset) <= WHEEL_GLYPH_MAX_OFFSET
);

/** Hộp bao trong toạ độ khung. */
export type WheelBox = { minX: number; minY: number; maxX: number; maxY: number };
export type WheelPoint = { x: number; y: number };

/* ------------------------------------------------------------------ tiện ích số học */

/** Kinh độ an toàn: giá trị không hữu hạn hoặc không phải số → 0 (tránh NaN lan ra SVG). */
export const wheelSafeLongitude = (longitude: number) =>
  typeof longitude === "number" && Number.isFinite(longitude) ? (((longitude % 360) + 360) % 360) : 0;

const safeRadius = (radius: number) => (Number.isFinite(radius) ? Math.max(0, radius) : 0);
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/**
 * Kinh độ hoàng đạo → điểm trên khung. Kinh độ tăng ngược chiều kim đồng hồ,
 * 0° Bạch Dương nằm bên trái (hướng Đông) như bản vẽ cũ.
 */
export const wheelPoint = (longitude: number, radius: number): WheelPoint => {
  const angle = ((wheelSafeLongitude(longitude) + 90) * Math.PI) / 180;
  const distance = safeRadius(radius);
  return {
    x: WHEEL_CENTER + distance * Math.cos(angle),
    y: WHEEL_CENTER - distance * Math.sin(angle)
  };
};

/** Khoảng cách góc nhỏ nhất giữa hai kinh độ (0–180°). */
export const angularSeparation = (a: number, b: number) => {
  const delta = Math.abs((((a - b) % 360) + 360) % 360);
  return delta > 180 ? 360 - delta : delta;
};

/* ------------------------------------------------------------------ hộp bao */

export const pointBox = (x: number, y: number, halfWidth: number, halfHeight: number): WheelBox => ({
  minX: finite(x) - Math.max(0, finite(halfWidth)),
  minY: finite(y) - Math.max(0, finite(halfHeight)),
  maxX: finite(x) + Math.max(0, finite(halfWidth)),
  maxY: finite(y) + Math.max(0, finite(halfHeight))
});

/** Hộp bao của một đoạn thẳng, đã cộng nửa nét vẽ về mọi phía. */
export const lineBox = (x1: number, y1: number, x2: number, y2: number, strokeWidth = 1): WheelBox => {
  const pad = Math.max(0, finite(strokeWidth)) / 2;
  return {
    minX: Math.min(finite(x1), finite(x2)) - pad,
    minY: Math.min(finite(y1), finite(y2)) - pad,
    maxX: Math.max(finite(x1), finite(x2)) + pad,
    maxY: Math.max(finite(y1), finite(y2)) + pad
  };
};

/** Hộp bao của đường tròn đồng tâm với khung, đã cộng nửa nét vẽ. */
export const circleBox = (radius: number, strokeWidth = 0): WheelBox => {
  const half = safeRadius(radius) + Math.max(0, finite(strokeWidth)) / 2;
  return pointBox(WHEEL_CENTER, WHEEL_CENTER, half, half);
};

/**
 * Nửa chiều rộng ước lượng của chuỗi chữ. Ký hiệu chiêm tinh (☉ ♀ ♂…) rộng ~1em,
 * chữ Latinh ~0,62em; ước lượng thiên về an toàn (rộng hơn thực tế).
 */
export const textHalfWidth = (text: string, fontSize: number, symbol = false) => {
  const perChar = symbol ? 1 : 0.62;
  const characters = Math.max(1, [...(text ?? "")].length || 1);
  return (characters * fontSize * perChar) / 2;
};

/** Nửa chiều cao ước lượng: cap-height + dấu tiếng Việt (an toàn hơn số thật). */
export const textHalfHeight = (fontSize: number) => fontSize * 0.75;

export const mergeBox = (a: WheelBox | null, b: WheelBox | null): WheelBox | null => {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
};

export const padBox = (box: WheelBox, padding: number): WheelBox => ({
  minX: box.minX - padding,
  minY: box.minY - padding,
  maxX: box.maxX + padding,
  maxY: box.maxY + padding
});

/** Hộp bao có nằm trọn trong khung, chừa vùng an toàn ở mọi mép? */
export const boxFits = (box: WheelBox, margin = WHEEL_SAFE_MARGIN) =>
  [box.minX, box.minY, box.maxX, box.maxY].every((value) => Number.isFinite(value)) &&
  box.minX >= margin &&
  box.minY >= margin &&
  box.maxX <= WHEEL_SIZE - margin &&
  box.maxY <= WHEEL_SIZE - margin;

export const boxesIntersect = (a: WheelBox, b: WheelBox) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

export const boxCenter = (box: WheelBox): WheelPoint => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });

/* ------------------------------------------------------------------ dựng hình */

export type WheelPlanetInput = { key: string; longitude: number };
export type WheelHouseInput = { house: number; cusp: number };
export type WheelAngleInput = { label: (typeof WHEEL_ANGLE_LABELS)[number]; longitude: number };

export type WheelLayoutInput = {
  planets: WheelPlanetInput[];
  houses: WheelHouseInput[];
  angles: WheelAngleInput[];
  /** Khoá hành tinh cần làm nổi bật (đĩa lớn hơn, nét dày hơn). */
  highlightKeys?: string[];
};

export type WheelPlanetGeometry = {
  key: string;
  /** Kinh độ thật — vạch dẫn luôn chỉ về đây. */
  trueLongitude: number;
  /** Vị trí đặt ký hiệu (có thể lệch khi vành đã kín). */
  displayLongitude: number;
  /** Mức lệch so với kinh độ thật (độ, có dấu). */
  offsetDegrees: number;
  radius: number;
  highlighted: boolean;
  disc: number;
  stroke: number;
  point: WheelPoint;
  leader: { from: WheelPoint; to: WheelPoint };
  box: WheelBox;
};

export type WheelLayout = {
  /** Bán kính đã dùng cho từng hành tinh (kể cả các bậc lùi vào khi tụ tập). */
  planetRadii: Record<string, number>;
  /** Mức dịch ký hiệu so với kinh độ thật (độ). */
  planetOffsets: Record<string, number>;
  /** Đĩa nền + 3 vòng đồng tâm + vành hoàng đạo. */
  circles: Array<{ radius: number; strokeWidth: number; box: WheelBox }>;
  signDividers: Array<{ longitude: number; from: WheelPoint; to: WheelPoint }>;
  signGlyphs: Array<{ index: number; nominalLongitude: number; longitude: number; point: WheelPoint; box: WheelBox }>;
  houseDividers: Array<{ house: number; cusp: number; from: WheelPoint; to: WheelPoint }>;
  houseNumbers: Array<{ house: number; point: WheelPoint; box: WheelBox }>;
  angleAxes: Array<{ label: string; longitude: number; color: "sky" | "amber"; from: WheelPoint; to: WheelPoint }>;
  angleLabels: Array<{ label: string; longitude: number; point: WheelPoint; halfWidth: number; halfHeight: number; box: WheelBox }>;
  planets: WheelPlanetGeometry[];
  /** Vẽ đường góc chiếu giữa hai hành tinh ở bán kính nào. */
  aspectRadius: number;
  /** Hộp bao của mọi thứ vẽ ra. */
  boxes: WheelBox[];
  /** Hộp bao chung. */
  bounds: WheelBox;
  /** Bán kính lớn nhất tính từ tâm (đã cộng nửa nét). */
  extent: number;
  /** Chẩn đoán nội bộ: hành tinh phải xếp chồng quá sâu… */
  warnings: string[];
};

/**
 * Góc lệch tối thiểu cần có giữa hai ký hiệu nằm ở hai vành khác nhau để hai đĩa
 * (đường kính `2·disc + khe hở`) không chạm nhau. Hai vành càng xa nhau thì càng
 * không cần lệch góc; vành trùng nhau thì quy về `minDistance / radius`.
 */
export const requiredSeparationDegrees = (radiusA: number, radiusB: number, minDistance: number) => {
  const a = safeRadius(radiusA);
  const b = safeRadius(radiusB);
  if (a <= 0 || b <= 0) return 180;
  if (Math.abs(a - b) >= minDistance) return 0; // hai vành đã tách xa nhau theo bán kính
  const cosine = (a * a + b * b - minDistance * minDistance) / (2 * a * b);
  if (!Number.isFinite(cosine)) return 180;
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
};

/** Các mức dịch ký hiệu sẽ thử, theo thứ tự gần vị trí thật nhất. */
const tangentialOffsets = () => {
  const offsets = [0];
  for (let step = WHEEL_TANGENTIAL_STEP; step <= WHEEL_TANGENTIAL_MAX; step += WHEEL_TANGENTIAL_STEP) {
    offsets.push(step, -step);
  }
  return offsets;
};

export type PlanetPlacement = {
  /** Bán kính vành của từng hành tinh. */
  radii: Record<string, number>;
  /** Vị trí hiển thị (có thể lệch khỏi kinh độ thật khi vành đã kín) — 0–360. */
  displayLongitudes: Record<string, number>;
  /** Mức lệch so với kinh độ thật (độ, có dấu). */
  offsets: Record<string, number>;
  warnings: string[];
};

/**
 * Đặt 10 hành tinh vào 5 vành đồng tâm sao cho **không hai đĩa nào chạm nhau**:
 * đi từ vành ngoài vào, mỗi hành tinh thử các mức dịch nhỏ nhất trước; chỉ khi cả 5 vành
 * đều kín mới phải chấp nhận chồng (kèm cảnh báo). Vạch dẫn vẽ riêng vẫn chỉ về kinh độ thật.
 */
export const planetPlacement = (planets: WheelPlanetInput[], highlightKeys: string[] = []): PlanetPlacement => {
  const radii: Record<string, number> = {};
  const displayLongitudes: Record<string, number> = {};
  const offsets: Record<string, number> = {};
  const warnings: string[] = [];
  if (!planets.length) return { radii, displayLongitudes, offsets, warnings };

  // Khoảng cách tối thiểu phải tính cả hành tinh được làm nổi bật (đĩa lớn hơn).
  const discRadius = (key: string) => planetDiscRadius(highlightKeys.includes(key));
  const placed: Array<{ key: string; radius: number; display: number; disc: number }> = [];
  const candidates = tangentialOffsets();

  const sorted = [...planets].sort((a, b) => {
    const la = wheelSafeLongitude(a.longitude);
    const lb = wheelSafeLongitude(b.longitude);
    return la - lb || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  });

  for (const planet of sorted) {
    const trueLongitude = wheelSafeLongitude(planet.longitude);
    let chosen: { radius: number; display: number; offset: number } | null = null;

    // Ưu tiên giữ ĐÚNG kinh độ thật: thử mọi vành ở mức dịch 0 trước, chỉ khi hết chỗ
    // mới nới dần sang hai bên (vạch dẫn vẫn chỉ về kinh độ thật).
    outer: for (const offset of candidates) {
      for (let ring = 0; ring <= WHEEL_RINGS.planetStackMax; ring += 1) {
        const radius = WHEEL_RINGS.planetBase - ring * WHEEL_RINGS.planetStep;
        const display = wheelSafeLongitude(trueLongitude + offset);
        const disc = discRadius(planet.key);
        const clear = placed.every((other) => {
          const needed = disc + other.disc + WHEEL_DISC_GAP;
          return angularSeparation(display, other.display) >= requiredSeparationDegrees(radius, other.radius, needed) - 1e-9;
        });
        if (clear) {
          chosen = { radius, display, offset };
          break outer;
        }
      }
    }

    if (!chosen) {
      // Không còn chỗ nào: đặt ở vành ngoài, đúng kinh độ thật, và ghi cảnh báo.
      const radius = WHEEL_RINGS.planetBase;
      chosen = { radius, display: trueLongitude, offset: 0 };
      warnings.push(`${planet.key}: mọi vành đều kín — ký hiệu phải chồng lên ký hiệu khác.`);
    } else if (chosen.offset !== 0) {
      warnings.push(
        `${planet.key}: ký hiệu dịch ${chosen.offset > 0 ? "+" : ""}${chosen.offset}° cho khỏi đè lên hành tinh khác (vạch dẫn vẫn chỉ đúng kinh độ thật).`
      );
    }

    radii[planet.key] = chosen.radius;
    displayLongitudes[planet.key] = chosen.display;
    offsets[planet.key] = chosen.offset;
    placed.push({ key: planet.key, radius: chosen.radius, display: chosen.display, disc: discRadius(planet.key) });
  }

  return { radii, displayLongitudes, offsets, warnings };
};

/** Bán kính vành của từng hành tinh (tiện dụng cho test và cho phần vẽ). */
export const planetRingRadii = (planets: WheelPlanetInput[], highlightKeys: string[] = []) => {
  const placement = planetPlacement(planets, highlightKeys);
  return { radii: placement.radii, warnings: placement.warnings };
};

/** Bán kính đĩa hành tinh, có tính trạng thái làm nổi bật. */
export const planetDiscRadius = (highlighted: boolean) => WHEEL_PLANET_DISC + (highlighted ? WHEEL_PLANET_DISC_HIGHLIGHT : 0);

/** Bán kính đĩa/hộp bao của nhãn AC/DC/MC/IC (chip nền có viền). */
export const angleLabelMetrics = (label: string) => ({
  halfWidth: Math.max(textHalfWidth(label, WHEEL_TEXT.angleLabel) + 6, 15),
  halfHeight: textHalfHeight(WHEEL_TEXT.angleLabel) + 4.5
});

/** Dựng toàn bộ hình học của vòng: toạ độ từng phần tử + hộp bao để test kiểm chứng. */
export const buildWheelLayout = ({ planets, houses, angles, highlightKeys = [] }: WheelLayoutInput): WheelLayout => {
  const { radii, displayLongitudes, offsets, warnings } = planetPlacement(planets, highlightKeys);
  const boxes: WheelBox[] = [];

  const circles = [
    { radius: WHEEL_RINGS.glow, strokeWidth: 0 },
    // Vành hoàng đạo vẽ bằng một nét dày: mép ngoài = max(zodiacOuter, band + nửa nét).
    { radius: (WHEEL_RINGS.zodiacOuter + WHEEL_RINGS.zodiacInner) / 2, strokeWidth: WHEEL_STROKES.zodiacBand },
    { radius: WHEEL_RINGS.zodiacOuter, strokeWidth: WHEEL_STROKES.zodiacOuter },
    { radius: WHEEL_RINGS.zodiacInner, strokeWidth: WHEEL_STROKES.zodiacInner },
    { radius: WHEEL_RINGS.aspect, strokeWidth: WHEEL_STROKES.aspect }
  ].map((circle) => ({ ...circle, box: circleBox(circle.radius, circle.strokeWidth) }));
  for (const circle of circles) boxes.push(circle.box);

  const signDividers = Array.from({ length: 12 }, (_, index) => {
    const longitude = index * 30;
    const from = wheelPoint(longitude, WHEEL_RINGS.zodiacInner);
    const to = wheelPoint(longitude, WHEEL_RINGS.zodiacOuter);
    boxes.push(lineBox(from.x, from.y, to.x, to.y, WHEEL_STROKES.signDivider));
    return { longitude, from, to };
  });

  const angleAxes: WheelLayout["angleAxes"] = [];
  const angleLabels: WheelLayout["angleLabels"] = [];
  for (const angle of angles) {
    const longitude = wheelSafeLongitude(angle.longitude);
    const from = wheelPoint(longitude, WHEEL_RINGS.zodiacInner);
    const to = wheelPoint(longitude, WHEEL_RINGS.zodiacOuter - 4);
    boxes.push(lineBox(from.x, from.y, to.x, to.y, WHEEL_STROKES.angleAxis));
    angleAxes.push({ label: angle.label, longitude, color: angle.label === "MC" || angle.label === "IC" ? "amber" : "sky", from, to });

    const point = wheelPoint(longitude, WHEEL_RINGS.zodiacGlyph);
    const { halfWidth, halfHeight } = angleLabelMetrics(angle.label);
    const box = pointBox(point.x, point.y, halfWidth, halfHeight);
    boxes.push(padBox(box, WHEEL_STROKES.chip / 2));
    angleLabels.push({ label: angle.label, longitude, point, halfWidth, halfHeight, box });
  }

  // Bốn nhãn AC/DC/MC/IC có thể rơi đúng vào giữa một cung (AC nào cũng có thể gần mốc 15°),
  // mà ký hiệu cung cũng nằm giữa cung → phải đẩy ký hiệu sang bên cho khỏi bị chip nhãn che.
  // Ký hiệu chỉ dịch trong lòng cung của nó (±`WHEEL_GLYPH_MAX_OFFSET` độ) nên vẫn đọc đúng cung.
  const chipBoxes = angleLabels.length
    ? angleLabels.map((label) => padBox(label.box, WHEEL_STROKES.chip / 2))
    : [];

  const signGlyphs = Array.from({ length: 12 }, (_, index) => {
    const nominal = index * 30 + 15;
    // Nhãn cung là chữ viết tắt 2 ký tự ("Ar", "Ta"…) nên đo theo bề rộng chữ thật.
    const halfWidth = textHalfWidth(ZODIAC_SIGNS[index]?.symbol ?? "A", WHEEL_TEXT.signGlyph);
    const halfHeight = textHalfHeight(WHEEL_TEXT.signGlyph);
    const boxAt = (longitude: number) => {
      const point = wheelPoint(longitude, WHEEL_RINGS.zodiacGlyph);
      return { point, box: pointBox(point.x, point.y, halfWidth, halfHeight) };
    };
    const clearance = (box: WheelBox) =>
      chipBoxes.reduce((smallest, chip) => {
        const gapX = Math.max(chip.minX - box.maxX, box.minX - chip.maxX);
        const gapY = Math.max(chip.minY - box.maxY, box.minY - chip.maxY);
        const distance = Math.max(gapX, gapY); // > 0 nghĩa là tách rời theo ít nhất một trục
        return Math.min(smallest, distance);
      }, Number.POSITIVE_INFINITY);

    let chosen = { longitude: nominal, ...boxAt(nominal) };
    if (chipBoxes.length) {
      let best = { ...chosen, clearance: clearance(chosen.box) };
      if (best.clearance <= 0) {
        for (const offset of WHEEL_GLYPH_OFFSETS) {
          const candidate = { longitude: nominal + offset, ...boxAt(nominal + offset) };
          const gap = clearance(candidate.box);
          if (gap > best.clearance) best = { ...candidate, clearance: gap };
          if (gap > 0) break; // đã tách khỏi mọi chip nhãn → dừng ở mức dịch nhỏ nhất
        }
        if (best.clearance <= 0) {
          warnings.push(`cung ${index + 1}: 4 nhãn góc phủ kín cung — ký hiệu cung buộc phải nằm dưới chip nhãn.`);
        }
        chosen = { longitude: best.longitude, point: best.point, box: best.box };
      }
    }

    boxes.push(chosen.box);
    return { index, nominalLongitude: nominal, longitude: chosen.longitude, point: chosen.point, box: chosen.box };
  });

  const houseDividers: WheelLayout["houseDividers"] = [];
  const houseNumbers: WheelLayout["houseNumbers"] = [];
  for (const house of houses) {
    const cusp = wheelSafeLongitude(house.cusp);
    const from = wheelPoint(cusp, WHEEL_RINGS.aspect);
    const to = wheelPoint(cusp, WHEEL_RINGS.zodiacInner);
    boxes.push(lineBox(from.x, from.y, to.x, to.y, WHEEL_STROKES.houseCusp));
    houseDividers.push({ house: house.house, cusp, from, to });

    const point = wheelPoint(cusp + 15, WHEEL_RINGS.houseNumber);
    const box = pointBox(point.x, point.y, textHalfWidth(String(house.house), WHEEL_TEXT.houseNumber), textHalfHeight(WHEEL_TEXT.houseNumber));
    boxes.push(box);
    houseNumbers.push({ house: house.house, point, box });
  }

  const planetGeometry: WheelPlanetGeometry[] = planets.map((planet) => {
    const trueLongitude = wheelSafeLongitude(planet.longitude);
    const displayLongitude = displayLongitudes[planet.key] ?? trueLongitude;
    const offsetDegrees = offsets[planet.key] ?? 0;
    const radius = radii[planet.key] ?? WHEEL_RINGS.planetBase;
    const highlighted = highlightKeys.includes(planet.key);
    const disc = planetDiscRadius(highlighted);
    const stroke = highlighted ? WHEEL_STROKES.planetHighlight : WHEEL_STROKES.planet;
    const point = wheelPoint(displayLongitude, radius);

    // Vạch dẫn: từ mép đĩa ký hiệu chạy tới đúng kinh độ thật ở vành trong hoàng đạo,
    // nên kể cả khi ký hiệu bị dịch, người đọc vẫn biết hành tinh nằm ở độ nào.
    const anchor = wheelPoint(trueLongitude, WHEEL_RINGS.zodiacInner - 1);
    const deltaX = anchor.x - point.x;
    const deltaY = anchor.y - point.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const leaderStart = {
      x: point.x + (deltaX / distance) * (disc + 2),
      y: point.y + (deltaY / distance) * (disc + 2)
    };

    boxes.push(lineBox(leaderStart.x, leaderStart.y, anchor.x, anchor.y, WHEEL_STROKES.leader));
    const box = pointBox(point.x, point.y, disc + stroke / 2, disc + stroke / 2);
    boxes.push(box);
    return {
      key: planet.key,
      trueLongitude,
      displayLongitude,
      offsetDegrees,
      radius,
      highlighted,
      disc,
      stroke,
      point,
      leader: { from: leaderStart, to: { x: anchor.x, y: anchor.y } },
      box
    };
  });

  const bounds =
    boxes.reduce<WheelBox | null>((accumulator, box) => mergeBox(accumulator, box), null) ??
    pointBox(WHEEL_CENTER, WHEEL_CENTER, 0, 0);
  const extent = Math.max(
    ...[bounds.maxX - WHEEL_CENTER, WHEEL_CENTER - bounds.minX, bounds.maxY - WHEEL_CENTER, WHEEL_CENTER - bounds.minY].map(finite)
  );

  return {
    planetRadii: radii,
    planetOffsets: offsets,
    circles,
    signDividers,
    signGlyphs,
    houseDividers,
    houseNumbers,
    angleAxes,
    angleLabels,
    planets: planetGeometry,
    aspectRadius: WHEEL_RINGS.aspect,
    boxes,
    bounds,
    extent,
    warnings
  };
};
