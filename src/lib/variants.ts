/**
 * Các biến thể bản đồ sao phái sinh:
 *  - Bản đồ Rồng (Draconic), bản đồ Nhật tâm (Heliocentric), bản đồ Hài hoà (Harmonic).
 *  - Bản đồ Hồi quy Mặt Trời / Mặt Trăng (Solar & Lunar return).
 *  - Tiến triển thứ cấp (Secondary progression) và Cung Mặt Trời (Solar arc).
 *  - Đối chiếu quan hệ: Synastry (góc chiếu chéo) và Composite (bản đồ trung điểm).
 */

import { Body, EclipticLongitude, HelioVector, MakeTime, PairLongitude, SearchSunLongitude, SphereFromVector, SunPosition } from "astronomy-engine";
import type { Aspect, ChartData, PlanetPosition } from "@/lib/astro";
import { ASPECTS, PLANETS, displayAngle, normalizeDegree, signedSeparation } from "@/lib/astro";
import { ayanamsa, type ZodiacFrameId } from "@/lib/zodiac";

export type DerivedPoint = {
  key: string;
  label: string;
  longitude: number;
  color: string;
  kind: "planet" | "angle" | "point";
};

const ANGLES = (chart: ChartData): DerivedPoint[] => [
  { key: "ascendant", label: "Cung Mọc (AC)", longitude: chart.ascendant, color: "#22d3ee", kind: "angle" },
  { key: "midheaven", label: "Thiên Đỉnh (MC)", longitude: chart.midheaven, color: "#f59e0b", kind: "angle" },
  { key: "descendant", label: "Cung Lặn (DC)", longitude: chart.descendant, color: "#22d3ee", kind: "angle" },
  { key: "imumCoeli", label: "Đáy trời (IC)", longitude: chart.imumCoeli, color: "#f59e0b", kind: "angle" }
];

export const natalPoints = (chart: ChartData): DerivedPoint[] => [
  ...chart.planets.map((planet) => ({
    key: planet.key,
    label: planet.label,
    longitude: planet.longitude,
    color: planet.color,
    kind: "planet" as const
  })),
  ...ANGLES(chart)
];

/* ------------------------------------------------------------ biến thể cơ bản */

/** Bản đồ Rồng (Draconic): lấy Bắc Giao điểm làm 0° Bạch Dương. */
export const toDraconic = (chart: ChartData, northNodeLongitude: number): DerivedPoint[] =>
  natalPoints(chart).map((point) => ({
    ...point,
    longitude: normalizeDegree(point.longitude - northNodeLongitude)
  }));

/** Bản đồ Nhật tâm: kinh độ hoàng đạo nhìn từ Mặt Trời (không có Mặt Trăng, không có AC/MC). */
export const toHeliocentric = (date: Date): DerivedPoint[] =>
  PLANETS.filter((planet) => planet.key !== "moon").map((planet) => {
    const vector = HelioVector(planet.body, MakeTime(date));
    const spherical = SphereFromVector(vector);
    return {
      key: planet.key,
      label: planet.label,
      longitude: normalizeDegree(spherical.lon),
      color: planet.color,
      kind: "planet" as const
    };
  });

/** Bản đồ Hài hoà bậc n: nhân kinh độ với n. */
export const toHarmonic = (points: DerivedPoint[], harmonic: number): DerivedPoint[] =>
  points.map((point) => ({
    ...point,
    longitude: normalizeDegree(point.longitude * harmonic)
  }));

/** Số hài hoà thường dùng và ý nghĩa. */
export const HARMONICS: Array<{ n: number; label: string; meaning: string }> = [
  { n: 4, label: "H4 - Gốc của cấu trúc", meaning: "nền tảng, gia đình, nhà cửa, sự an toàn" },
  { n: 5, label: "H5 - Sáng tạo", meaning: "tài năng, niềm vui, con cái, thể hiện bản thân" },
  { n: 7, label: "H7 - Cảm hứng", meaning: "điểm chạm giữa tiềm thức và sáng tạo" },
  { n: 9, label: "H9 - Hôn nhân", meaning: "duyên phận, hôn nhân, lý tưởng (nhân với 9 = navamsa của Vệ Đà)" },
  { n: 16, label: "H16 - Căng thẳng & đỉnh cao", meaning: "biến cố, thành tựu, tan vỡ và tái lập" }
];

/* --------------------------------------------------------------- bản đồ trả về */

export type ReturnChart = {
  kind: "solar" | "lunar";
  label: string;
  moment: Date;
  longitudeLabel: string;
};

/** Tìm thời điểm Mặt Trời trở về đúng kinh độ natal (sinh nhật chiêm tinh). */
export const solarReturn = (natalSunLongitude: number, reference: Date): ReturnChart => {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - 10));
  const found = SearchSunLongitude(natalSunLongitude, MakeTime(start), 25);
  const moment = found?.date ?? new Date(Date.UTC(reference.getUTCFullYear(), 0, 1));

  return {
    kind: "solar",
    label: "Bản đồ Hồi quy Mặt Trời (Solar Return)",
    moment,
    longitudeLabel: displayAngle(natalSunLongitude)
  };
};

/** Tìm thời điểm Mặt Trăng trở về đúng kinh độ natal (lunar return). */
export const lunarReturn = (natalMoonLongitude: number, from: Date): ReturnChart => {
  const moonLongitudeAt = (time: Date) => normalizeDegree(SunPosition(time).elon + PairLongitude(Body.Moon, Body.Sun, time));
  const target = normalizeDegree(natalMoonLongitude);

  let low = from.getTime();
  let high = low + 40 * 86400000;
  let previous = signedSeparation(target, moonLongitudeAt(new Date(low)));

  // Tìm khoảng đổi dấu rồi chia đôi để có thời điểm chính xác trong vài giây.
  for (let step = 0; step < 4000; step += 1) {
    const mid = low + ((high - low) * step) / 4000;
    const current = signedSeparation(target, moonLongitudeAt(new Date(mid)));
    if (previous <= 0 && current > 0) {
      let a = low + ((high - low) * Math.max(0, step - 1)) / 4000;
      let b = mid;
      for (let i = 0; i < 40; i += 1) {
        const middle = (a + b) / 2;
        if (signedSeparation(target, moonLongitudeAt(new Date(middle))) > 0) b = middle;
        else a = middle;
      }
      return {
        kind: "lunar",
        label: "Bản đồ Hồi quy Mặt Trăng (Lunar Return)",
        moment: new Date((a + b) / 2),
        longitudeLabel: displayAngle(natalMoonLongitude)
      };
    }
    previous = current;
  }

  return {
    kind: "lunar",
    label: "Bản đồ Hồi quy Mặt Trăng (Lunar Return)",
    moment: new Date(low + 27.3 * 86400000),
    longitudeLabel: displayAngle(natalMoonLongitude)
  };
};

export type ProgressionResult = {
  progressedDate: Date;
  /** Tuổi theo năm (1 ngày = 1 năm). */
  age: number;
  points: DerivedPoint[];
  solarArc: number;
};

/** Tiến triển thứ cấp (1 ngày sau sinh = 1 năm tuổi) và cung Mặt Trời (solar arc). */
export const secondaryProgression = (chart: ChartData, ageYears: number): ProgressionResult => {
  const progressedDate = new Date(chart.utcDate.getTime() + ageYears * 86400000);
  const sun = normalizeDegree(SunPosition(progressedDate).elon);
  const natalSun = chart.planets.find((planet) => planet.key === "sun")?.longitude ?? 0;
  const solarArc = normalizeDegree(sun - natalSun);

  const points: DerivedPoint[] = [
    ...PLANETS.map((planet) => ({
      key: planet.key,
      label: planet.label,
      longitude:
        planet.key === "sun" ? sun : normalizeDegree(sun + PairLongitude(planet.body, Body.Sun, progressedDate)),
      color: planet.color,
      kind: "planet" as const
    })),
    ...ANGLES(chart).map((angle) => ({ ...angle, longitude: normalizeDegree(angle.longitude + solarArc) }))
  ];

  return { progressedDate, age: ageYears, points, solarArc };
};

/** Cung Mặt Trời (solar arc) áp lên chính bản đồ natal. */
export const solarArcDirections = (chart: ChartData, ageYears: number) => {
  const { solarArc, progressedDate } = secondaryProgression(chart, ageYears);
  return {
    arc: solarArc,
    progressedDate,
    points: natalPoints(chart).map((point) => ({
      ...point,
      longitude: normalizeDegree(point.longitude + solarArc)
    }))
  };
};

/* ------------------------------------------------------------------ đối chiếu */

export type CrossAspect = {
  fromLabel: string;
  toLabel: string;
  type: string;
  angle: number;
  orb: number;
  color: string;
};

const ASPECT_VI: Record<string, string> = {
  Conjunction: "trùng tụ",
  Sextile: "lục hợp",
  Square: "vuông góc",
  Trine: "tam hợp",
  Opposition: "đối đỉnh"
};

export const aspectName = (type: string) => ASPECT_VI[type] ?? type;

/** Góc chiếu chéo giữa hai bản đồ (synastry), orb 6° (8° cho trùng tụ và đối đỉnh). */
export const synastryAspects = (a: DerivedPoint[], b: DerivedPoint[], maxOrb = 6): CrossAspect[] => {
  const results: CrossAspect[] = [];

  for (const left of a) {
    for (const right of b) {
      const separation = Math.abs(signedSeparation(left.longitude, right.longitude));
      for (const aspect of ASPECTS) {
        const orb = Math.abs(separation - aspect.angle);
        const limit = aspect.angle === 0 || aspect.angle === 180 ? maxOrb + 2 : maxOrb;
        if (orb <= limit) {
          results.push({
            fromLabel: left.label,
            toLabel: right.label,
            type: aspect.type,
            angle: aspect.angle,
            orb,
            color: aspect.color
          });
          break;
        }
      }
    }
  }

  return results.sort((x, y) => x.orb - y.orb);
};

/** Bản đồ Composite: trung điểm của từng cặp hành tinh (chọn cung ngắn hơn). */
export const compositePoints = (a: DerivedPoint[], b: DerivedPoint[]): DerivedPoint[] => {
  const byKey = new Map(b.map((point) => [point.key, point]));

  return a
    .filter((point) => byKey.has(point.key))
    .map((point) => {
      const other = byKey.get(point.key)!;
      const diff = signedSeparation(point.longitude, other.longitude);
      const longitude = normalizeDegree(point.longitude + diff / 2);
      return { ...point, longitude };
    });
};

/** Nhà của người A khi chiếu vào bản đồ người B (để đọc "overlay"). */
export const houseOverlay = (
  points: DerivedPoint[],
  cusps: number[],
  houseOf: (longitude: number, cusps: number[]) => number
) => points.map((point) => ({ ...point, house: houseOf(point.longitude, cusps) }));

/* ------------------------------------------------------ đổi hệ hoàng đạo */

/** Áp một hệ hoàng đạo (sidereal) lên các điểm đã tính (trừ ayanamsa). */
export const toZodiacFrame = (points: DerivedPoint[], frame: ZodiacFrameId, date: Date): DerivedPoint[] => {
  const ayan = ayanamsa(frame, date);
  if (!ayan) return points;
  return points.map((point) => ({ ...point, longitude: normalizeDegree(point.longitude - ayan) }));
};

export const planetSummary = (points: DerivedPoint[]) =>
  points
    .filter((point) => point.kind === "planet")
    .map((point) => `${point.label}: ${displayAngle(point.longitude)}`)
    .join(" | ");

export const findPlanet = (points: DerivedPoint[], key: string) => points.find((point) => point.key === key) as PlanetPosition | undefined;

export const aspectsForPoints = (points: DerivedPoint[], maxOrb = 6): Aspect[] => {
  const results: Aspect[] = [];

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const separation = Math.abs(signedSeparation(points[i].longitude, points[j].longitude));
      for (const aspect of ASPECTS) {
        const orb = Math.abs(separation - aspect.angle);
        const limit = aspect.angle === 0 || aspect.angle === 180 ? Math.max(maxOrb, 8) : maxOrb;
        if (orb <= limit) {
          results.push({
            pair: `${points[i].label} - ${points[j].label}`,
            fromLabel: points[i].label,
            toLabel: points[j].label,
            type: aspect.type,
            targetAngle: aspect.angle,
            separation,
            orb,
            orbLimit: limit,
            trend: "Separating",
            color: aspect.color,
            from: points[i].key,
            to: points[j].key
          });
          break;
        }
      }
    }
  }

  return results.sort((a, b) => a.orb - b.orb);
};

/** Kinh độ hoàng đạo nhật tâm của một hành tinh (dùng cho báo cáo). */
export const heliocentricLongitude = (body: Body, date: Date) => normalizeDegree(SphereFromVector(HelioVector(body, MakeTime(date))).lon);

/** Kinh độ hoàng đạo địa tâm tổng quát cho báo cáo. */
export const geocentricLongitude = (body: Body, date: Date) => normalizeDegree(EclipticLongitude(body, date));
