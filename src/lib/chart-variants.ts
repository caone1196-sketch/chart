/**
 * Lớp tổng hợp "biến thể bản đồ sao": gom mọi hệ thống luận giải đã cài đặt
 * (hệ nhà, hệ hoàng đạo, điểm ảo, hình mẫu, Hy Lạp cổ, Vệ Đà, Trung Hoa, Maya,
 * Human Design và các bản đồ phái sinh) thành một đối tượng duy nhất để UI,
 * báo cáo gửi AI và bộ trả lời dùng chung.
 */

import type { ChartData } from "@/lib/astro";
import { ZODIAC_SIGNS, displayAngle, normalizeDegree, signedSeparation } from "@/lib/astro";
import { findAspectPatterns, chartShapeOf, hemisphereEmphasis, type AspectPattern, type ChartShape } from "@/lib/patterns";
import { EXTRA_POINTS, ALL_EXTRA_POINTS, computeExtraPoints, type ExtraPointPosition } from "@/lib/points";
import { buildHellenistic, type HellenisticChart } from "@/lib/hellenistic";
import { buildBazi, buildMayan, buildZiwei, type BaziChart, type MayanDate, type ZiweiChart } from "@/lib/chinese";
import { buildHumanDesign, type HDChart } from "@/lib/humandesign";
import {
  NAKSHATRAS,
  RASHIS,
  VARGAS,
  nakshatraOf,
  panchangAt,
  rashiOf,
  vargaSign,
  vimshottariDasha,
  antardashas,
  ayanamsa,
  type ZodiacFrameId,
  type DashaPeriod
} from "@/lib/zodiac";
import {
  HARMONICS,
  compositePoints,
  houseOverlay,
  lunarReturn,
  natalPoints,
  secondaryProgression,
  solarArcDirections,
  solarReturn,
  synastryAspects,
  toDraconic,
  toHarmonic,
  toHeliocentric,
  toZodiacFrame,
  type CrossAspect,
  type DerivedPoint
} from "@/lib/variants";
import { HOUSE_SYSTEMS, computeHouses, houseOfLongitude, type HouseSystemId } from "@/lib/houses";
import { ZODIAC_FRAMES } from "@/lib/zodiac";
import { calcObliquity, localSiderealDegrees } from "@/lib/astro";

export type VariantInput = {
  chart: ChartData;
  /** Giờ địa phương tại nơi sinh (theo múi giờ đã giải). */
  localDate: Date;
  localHour: number;
  gender: "nam" | "nữ";
  houseSystem: HouseSystemId;
  zodiacFrame: ZodiacFrameId;
};

export type VedicPlanetPosition = {
  key: string;
  label: string;
  longitude: number;
  rashi: string;
  rashiVi: string;
  rashiLord: string;
  nakshatra: string;
  nakshatraLord: string;
  pada: number;
  navamsa: string;
  house: number;
  retrograde: boolean;
};

export type VedicResult = {
  ayanamsa: number;
  planets: VedicPlanetPosition[];
  ascendantRashi: string;
  moonNakshatra: string;
  moonPada: number;
  janmaRashi: string;
  dasha: DashaPeriod[];
  antara: DashaPeriod[];
  currentMahadasha: string;
  currentAntardasha: string;
  panchang: ReturnType<typeof panchangAt>;
  vargas: Array<{ id: string; label: string; use: string; signs: Record<string, string> }>;
  yoga: string;
  doshaNotes: string[];
};

export type VariantChart = {
  houseSystem: HouseSystemId;
  houseSystemLabel: string;
  cusps: number[];
  cuspSigns: string[];
  zodiacFrame: ZodiacFrameId;
  ayanamsaValue: number;
  extraPoints: Array<ExtraPointPosition & { house: number }>;
  sidereal: Record<string, number>;
  patterns: AspectPattern[];
  shape: ChartShape;
  hemispheres: ReturnType<typeof hemisphereEmphasis>;
  hellenistic: HellenisticChart;
  vedic: VedicResult;
  chinese: { bazi: BaziChart; ziwei: ZiweiChart; mayan: MayanDate };
  design: HDChart;
  derived: {
    draconic: DerivedPoint[];
    heliocentric: DerivedPoint[];
    harmonics: Array<{ n: number; label: string; meaning: string; points: DerivedPoint[] }>;
    solarReturn: ReturnType<typeof solarReturn>;
    lunarReturn: ReturnType<typeof lunarReturn>;
    progression: ReturnType<typeof secondaryProgression>;
    solarArc: ReturnType<typeof solarArcDirections>;
  };
};

const HOUSE_SYSTEM_LABEL = (id: HouseSystemId) => HOUSE_SYSTEMS.find((system) => system.id === id)?.label ?? id;

const signIndexOf = (longitude: number) => Math.floor(normalizeDegree(longitude) / 30);

/** Bản đồ quy về hệ hoàng đạo nhiệt đới (các engine phái sinh như harmonic/draconic/solar return cần hệ này). */
const toTropicalChart = (chart: ChartData): ChartData => {
  const ayan = chart.ayanamsa;
  if (!ayan) return chart;
  return {
    ...chart,
    ascendant: normalizeDegree(chart.ascendant + ayan),
    descendant: normalizeDegree(chart.descendant + ayan),
    midheaven: normalizeDegree(chart.midheaven + ayan),
    imumCoeli: normalizeDegree(chart.imumCoeli + ayan),
    vertex: normalizeDegree(chart.vertex + ayan),
    eastPoint: normalizeDegree(chart.eastPoint + ayan),
    houses: chart.houses.map((house) => ({ ...house, cusp: normalizeDegree(house.cusp + ayan) })),
    planets: chart.planets.map((planet) => ({ ...planet, longitude: normalizeDegree(planet.longitude + ayan) })),
    ayanamsa: 0
  };
};

/** Tính toàn bộ các biến thể của một bản đồ sao. */
export const buildVariantChart = (input: VariantInput): VariantChart => {
  const { chart, localDate, localHour, gender, houseSystem, zodiacFrame } = input;
  const obliquity = calcObliquity(chart.utcDate);
  const hourAngle = localSiderealDegrees(chart.utcDate, chart.longitude);

  const houseSetRaw = computeHouses(houseSystem, hourAngle, chart.latitude, obliquity);
  // Cusp biểu diễn trong cùng hệ quy chiếu với kinh độ đang hiển thị (trừ ayanamsa nếu dùng hệ sidereal).
  const cusps = houseSetRaw.cusps.map((cusp) => normalizeDegree(cusp - chart.ayanamsa));
  const houses = { ...houseSetRaw, cusps };
  const houseOf = (longitude: number) => houseOfLongitude(longitude, houses.cusps);

  const extraPoints = computeExtraPoints(chart.utcDate).map((point) => ({ ...point, house: houseOf(point.longitude) }));
  const extraPointsRaw = computeExtraPoints(chart.utcDate);
  const points = [
    ...chart.planets.map((planet) => ({ key: planet.key, label: planet.label, longitude: planet.longitude })),
    ...extraPointsRaw
      .filter((point) => ["chiron", "ceres", "pallas", "juno", "vesta", "lilith", "trueNode"].includes(point.key))
      .map((point) => ({ key: point.key, label: point.label, longitude: point.longitude })),
    { key: "ascendant", label: "Cung Mọc (AC)", longitude: chart.ascendant },
    { key: "midheaven", label: "Thiên Đỉnh (MC)", longitude: chart.midheaven }
  ];

  const patterns = findAspectPatterns(points);
  const shape = chartShapeOf(chart.planets);
  const hemispheres = hemisphereEmphasis(chart.planets, chart.ascendant, chart.midheaven);

  const hellenistic = buildHellenistic(
    {
      ascendant: chart.ascendant,
      planets: chart.planets.map((planet) => ({ key: planet.key, longitude: planet.longitude, house: houseOf(planet.longitude) }))
    },
    houseOf
  );

  const ayanamsaValue = ayanamsa(zodiacFrame, chart.utcDate);
  // Bản đồ luôn giữ kinh độ nhiệt đới trong `tropicalChart`, nên hiệu chỉnh ayanamsa chỉ áp dụng một lần.
  const tropicalChart = toTropicalChart(chart);
  const sidereal: Record<string, number> = {};
  for (const planet of tropicalChart.planets) sidereal[planet.key] = normalizeDegree(planet.longitude - ayanamsaValue);
  sidereal.ascendant = normalizeDegree(tropicalChart.ascendant - ayanamsaValue);
  sidereal.midheaven = normalizeDegree(tropicalChart.midheaven - ayanamsaValue);
  for (const point of extraPointsRaw) sidereal[point.key] = normalizeDegree(point.longitude - ayanamsaValue);

  const vedic = { ...buildVedic(chart, sidereal, houseOf, zodiacFrame), ayanamsa: ayanamsaValue };

  const sun = chart.planets.find((planet) => planet.key === "sun")!;
  const moon = chart.planets.find((planet) => planet.key === "moon")!;

  const bazi = buildBazi(chart.utcDate, localDate, localHour, chart.longitude, { gender });
  const chinese = {
    bazi,
    // Tử Vi dùng đúng can chi trụ năm của Tứ Trụ (đã tính theo tiết khí Lập Xuân)
    ziwei: buildZiwei(chart.utcDate, localDate, localHour, sun.longitude, moon.longitude, bazi.pillars[0].stem, bazi.pillars[0].branch),
    mayan: buildMayan(localDate)
  };

  const design = buildHumanDesign(chart.utcDate, sun.longitude);

  const nodes = extraPoints.find((point) => point.key === "trueNode");
  const draconic = toDraconic(tropicalChart, nodes?.longitude ?? 0);
  const heliocentric = toHeliocentric(chart.utcDate);
  const harmonics = HARMONICS.map((harmonic) => ({
    ...harmonic,
    points: toHarmonic(natalPoints(tropicalChart), harmonic.n)
  }));

  return {
    houseSystem,
    houseSystemLabel: HOUSE_SYSTEM_LABEL(houseSystem),
    cusps: houses.cusps,
    cuspSigns: houses.cusps.map((cusp) => ZODIAC_SIGNS[signIndexOf(cusp - ayanamsaValue)].name),
    zodiacFrame,
    ayanamsaValue,
    extraPoints,
    sidereal,
    patterns,
    shape,
    hemispheres,
    hellenistic,
    vedic,
    chinese,
    design,
    derived: {
      draconic,
      heliocentric,
      harmonics,
      solarReturn: solarReturn(normalizeDegree(sun.longitude + ayanamsaValue), new Date()),
      lunarReturn: lunarReturn(normalizeDegree(moon.longitude + ayanamsaValue), new Date()),
      progression: secondaryProgression(tropicalChart, ageInYears(chart.utcDate)),
      solarArc: solarArcDirections(tropicalChart, ageInYears(chart.utcDate))
    }
  };
};

export const ageInYears = (birthUtc: Date, now = new Date()) =>
  (now.getTime() - birthUtc.getTime()) / (365.2425 * 86400000);

const buildVedic = (
  chart: ChartData,
  sidereal: Record<string, number>,
  houseOf: (longitude: number) => number,
  frame: ZodiacFrameId
): VedicResult => {
  const planets: VedicPlanetPosition[] = chart.planets.map((planet) => {
    const longitude = sidereal[planet.key];
    const nakshatra = nakshatraOf(longitude);
    const rashi = rashiOf(longitude);
    const navamsaSign = vargaSign(longitude, 9);

    return {
      key: planet.key,
      label: planet.label,
      longitude,
      rashi: RASHIS[signIndexOf(longitude)].name,
      rashiVi: rashi.vi,
      rashiLord: rashi.lord,
      nakshatra: nakshatra.nakshatra.name,
      nakshatraLord: nakshatra.nakshatra.lord,
      pada: nakshatra.pada,
      navamsa: RASHIS[navamsaSign].name,
      house: houseOf(longitude),
      retrograde: planet.retrograde
    };
  });

  const moonLongitude = sidereal.moon;
  const moonNakshatra = nakshatraOf(moonLongitude);
  const dasha = vimshottariDasha(chart.utcDate, moonLongitude);
  const current = dasha.find((period) => period.isCurrent) ?? dasha[0];
  const antara = antardashas(current, moonLongitude);

  const sun = chart.planets.find((planet) => planet.key === "sun")!;
  const moon = chart.planets.find((planet) => planet.key === "moon")!;
  const panchang = panchangAt(chart.utcDate, sun.longitude, moon.longitude, frame);

  const signNamesOf = (divisions: number) => {
    const signs: Record<string, string> = {};
    for (const planet of chart.planets) {
      signs[planet.label] = `${RASHIS[vargaSign(sidereal[planet.key], divisions)].name} (${RASHIS[vargaSign(sidereal[planet.key], divisions)].vi})`;
    }
    signs["Cung Mọc"] = `${RASHIS[vargaSign(sidereal.ascendant, divisions)].name} (${RASHIS[vargaSign(sidereal.ascendant, divisions)].vi})`;
    return signs;
  };

  const vargas = VARGAS.slice(0, 6).map((varga) => ({
    id: varga.id,
    label: varga.label,
    use: varga.use,
    signs: signNamesOf(varga.divisions)
  }));

  // Các tổ hợp cổ điển đáng chú ý (chỉ nêu tên, không phán định)
  const notes: string[] = [];
  const moonSign = signIndexOf(moonLongitude);
  const mars = planets.find((planet) => planet.key === "mars");
  const jupiter = planets.find((planet) => planet.key === "jupiter");
  const saturn = planets.find((planet) => planet.key === "saturn");
  const sunPlanet = planets.find((planet) => planet.key === "sun");

  if (mars && signIndexOf(mars.longitude) === moonSign) notes.push("Hỏa Tinh cùng cung với Mặt Trăng (Chandra-Mangala): tinh thần hành động mạnh, dễ nóng.");
  if (jupiter && signIndexOf(jupiter.longitude) === signIndexOf(sidereal.ascendant))
    notes.push("Mộc Tinh tại cung Mọc: thiên hướng học vấn, đạo đức và sự bảo trợ (Guru ở Lagna).");
  if (saturn && jupiter && signIndexOf(saturn.longitude) === signIndexOf(jupiter.longitude))
    notes.push("Thổ Tinh và Mộc Tinh đồng cung: bài học về kỷ luật đi cùng cơ hội mở rộng.");
  if (sunPlanet && signIndexOf(sunPlanet.longitude) === signIndexOf(sidereal.ascendant))
    notes.push("Mặt Trời tại cung Mọc: ý chí và sự nghiệp gắn với hình ảnh bản thân.");

  const moonLord = rashiOf(moonLongitude).lord;
  const yoga = `Yoga (nakshatra chủ): ${moonNakshatra.nakshatra.name} — tâm trí vận hành qua ${moonNakshatra.nakshatra.lord}, chủ tinh cung Mặt Trăng là ${moonLord}.`;

  return {
    ayanamsa: 0,
    planets,
    ascendantRashi: RASHIS[signIndexOf(sidereal.ascendant)].name,
    moonNakshatra: moonNakshatra.nakshatra.name,
    moonPada: moonNakshatra.pada,
    janmaRashi: RASHIS[signIndexOf(moonLongitude)].name,
    dasha,
    antara,
    currentMahadasha: current.lord,
    currentAntardasha: antara.find((period) => period.isCurrent)?.lord ?? antara[0].lord,
    panchang,
    vargas,
    yoga,
    doshaNotes: notes
  };
};

/* --------------------------------------------- so sánh giữa các hệ nhà / hệ hoàng đạo */

export type HouseSystemComparison = {
  id: HouseSystemId;
  label: string;
  cusp1: number;
  houses: Record<string, number>;
};

/** Bảng so sánh vị trí nhà của hành tinh khi đổi hệ thống chia nhà. */
export const compareHouseSystems = (chart: ChartData): HouseSystemComparison[] => {
  const obliquity = calcObliquity(chart.utcDate);
  const armc = localSiderealDegrees(chart.utcDate, chart.longitude);

  return HOUSE_SYSTEMS.map((system) => {
    const set = computeHouses(system.id, armc, chart.latitude, obliquity);
    const cusps = set.cusps.map((cusp) => normalizeDegree(cusp - chart.ayanamsa));
    const houses: Record<string, number> = {};
    for (const planet of chart.planets) houses[planet.key] = houseOfLongitude(planet.longitude, cusps);
    for (const key of ["ascendant", "midheaven", "chiron", "trueNode"]) {
      const longitude = key === "ascendant" ? chart.ascendant : key === "midheaven" ? chart.midheaven : chart.planets.find((planet) => planet.key === key)?.longitude;
      if (longitude !== undefined) houses[key] = houseOfLongitude(longitude, cusps);
    }

    return { id: system.id, label: system.label, cusp1: normalizeDegree(cusps[0]), houses };
  });
};

export type ZodiacFrameComparison = {
  id: ZodiacFrameId;
  label: string;
  ayanamsa: number;
  sun: string;
  moon: string;
  ascendant: string;
};

/** Bảng so sánh cung của Mặt Trời/Mặt Trăng/Cung Mọc theo từng hệ hoàng đạo. */
export const compareZodiacFrames = (chart: ChartData): ZodiacFrameComparison[] => {
  const tropical = {
    sun: chart.planets.find((planet) => planet.key === "sun")?.longitude ?? 0,
    moon: chart.planets.find((planet) => planet.key === "moon")?.longitude ?? 0,
    ascendant: chart.ascendant
  };
  // Bản đồ đã có thể đang ở hệ sidereal; quy về nhiệt đới trước khi trừ ayanamsa.
  const sun = normalizeDegree(tropical.sun + chart.ayanamsa);
  const moon = normalizeDegree(tropical.moon + chart.ayanamsa);
  const ascendant = normalizeDegree(tropical.ascendant + chart.ayanamsa);

  return ZODIAC_FRAMES.map((frame) => {
    const ayan = ayanamsa(frame.id, chart.utcDate);
    return {
      id: frame.id,
      label: frame.label,
      ayanamsa: ayan,
      sun: ZODIAC_SIGNS[signIndexOf(sun - ayan)].name,
      moon: ZODIAC_SIGNS[signIndexOf(moon - ayan)].name,
      ascendant: ZODIAC_SIGNS[signIndexOf(ascendant - ayan)].name
    };
  });
};

/* --------------------------------------------------------------- đối chiếu quan hệ */

export type RelationshipResult = {
  synastry: CrossAspect[];
  composite: DerivedPoint[];
  overlays: Array<{ direction: string; points: Array<DerivedPoint & { house: number }> }>;
  summary: string;
};

/** Đối chiếu hai bản đồ: góc chiếu chéo, bản đồ trung điểm và lớp phủ nhà. */
export const buildRelationship = (a: ChartData, b: ChartData, cuspsA: number[], cuspsB: number[]): RelationshipResult => {
  const pointsA = natalPoints(a);
  const pointsB = natalPoints(b);
  const synastry = synastryAspects(pointsA, pointsB, 6);
  const composite = compositePoints(pointsA, pointsB);
  const overlays = [
    { direction: `${a.locationLabel} → nhà của ${b.locationLabel}`, points: houseOverlay(pointsA, cuspsB, houseOfLongitude) },
    { direction: `${b.locationLabel} → nhà của ${a.locationLabel}`, points: houseOverlay(pointsB, cuspsA, houseOfLongitude) }
  ];

  const strongest = synastry.slice(0, 5);
  const summary = strongest.length
    ? `Các góc chiếu mạnh nhất: ${strongest
        .map((aspect) => `${aspect.fromLabel} ${aspect.type} ${aspect.toLabel} (orb ${aspect.orb.toFixed(1)}°)`)
        .join("; ")}`
    : "Hai bản đồ ít góc chiếu chéo trong orb 6° — quan hệ nhẹ nhàng, ít va chạm cưỡng bức.";

  return { synastry, composite, overlays, summary };
};

/* ----------------------------------------------------------------- báo cáo ngắn */

/** Tóm tắt bằng chữ để nhét vào báo cáo gửi AI và hiển thị trong chat. */
export const variantReport = (variant: VariantChart): string => {
  const lines: string[] = [];
  const { vedic, chinese, design, derived, hellenistic } = variant;

  lines.push("BIẾN THỂ BẢN ĐỒ SAO (dùng trong luận giải)");
  lines.push(`- Hệ thống nhà: ${variant.houseSystemLabel} — cung 1 bắt đầu ${displayAngle(variant.cusps[0])}, cung 10 ${displayAngle(variant.cusps[9])}`);
  lines.push(
    variant.zodiacFrame === "tropical"
      ? "- Hệ hoàng đạo: nhiệt đới (tropical) — 0° Bạch Dương là điểm Xuân phân."
      : `- Hệ hoàng đạo: ${variant.zodiacFrame} — ayanamsa ${variant.ayanamsaValue.toFixed(4)}°; cung Mọc sidereal ${displayAngle(variant.sidereal.ascendant)}.`
  );

  lines.push(
    `- Hình dạng bản đồ: ${variant.shape.label} (${variant.shape.coverage.toFixed(0)}° có hành tinh, khoảng trống ${variant.shape.gap.toFixed(0)}°) — ${variant.shape.meaning} ${variant.shape.focus}`
  );
  lines.push(`- Ưu thế bán cầu: trên ${variant.hemispheres.north} / dưới ${variant.hemispheres.south} · đông ${variant.hemispheres.east} / tây ${variant.hemispheres.west}. ${variant.hemispheres.note}`);

  if (variant.patterns.length) {
    lines.push("- Hình mẫu góc chiếu:");
    for (const pattern of variant.patterns) {
      lines.push(`  · ${pattern.label}: ${pattern.members.join(" — ")}. ${pattern.meaning} Lời khuyên: ${pattern.advice}`);
    }
  } else {
    lines.push("- Hình mẫu góc chiếu: không có cấu hình lớn (bản đồ phân tán, tự do hơn về cấu trúc).");
  }

  lines.push(
    `- Phái (sect) của bản đồ: ${hellenistic.sect === "day" ? "ban ngày" : "ban đêm"} · hành tinh chủ đạo ${hellenistic.sectLight}.`
  );
  const topLots = hellenistic.lots.slice(0, 2);
  for (const lot of topLots) {
    lines.push(`  · ${lot.vi}: ${displayAngle(lot.longitude)} (${lot.signName}, nhà ${lot.house}) — ${lot.meaning}`);
  }
  const strongDignity = hellenistic.dignities.filter((dignity) => dignity.score >= 5).map((dignity) => dignity.planet);
  if (strongDignity.length) lines.push(`  · Hành tinh có phẩm chất mạnh: ${strongDignity.join(", ")}`);

  lines.push(
    `- Vệ Đà (${variant.zodiacFrame === "tropical" ? "nên bật hệ sidereal để chuẩn Jyotish" : `ayanamsa ${variant.ayanamsaValue.toFixed(3)}°`}): ` +
      `Mặt Trăng ở ${vedic.janmaRashi}, nakshatra ${vedic.moonNakshatra} (pada ${vedic.moonPada}); dasha hiện tại ${vedic.currentMahadasha}/${vedic.currentAntardasha}.`
  );
  lines.push(`  · Panchang: tithi ${vedic.panchang.tithi} (${vedic.panchang.paksha}), yoga ${vedic.panchang.yoga}, vara ${vedic.panchang.vara}.`);
  lines.push(`  · ${vedic.yoga}`);
  if (vedic.doshaNotes.length) lines.push(`  · Tổ hợp đáng chú ý: ${vedic.doshaNotes.join(" ")}`);

  const bazi = chinese.bazi;
  lines.push(
    `- Tứ Trụ (BaZi): ${bazi.pillars.map((pillar) => `${pillar.label} ${pillar.stemVi} ${pillar.branchVi}`).join(" · ")} | Nhật chủ ${bazi.dayMaster.vi} (${bazi.dayMaster.element}).`
  );
  lines.push(`  · ${bazi.dayMasterStrength.note} ${bazi.usefulGodHint}`);
  lines.push(
    `  · Dụng thần gợi ý theo ngũ hành: mạnh ${bazi.dominantElement}, yếu ${bazi.weakestElement}. Đại vận ${bazi.luckDirection}, khởi ${bazi.luckPillars[0].ageStart.toFixed(1)} tuổi.`
  );

  const ziwei = chinese.ziwei;
  lines.push(`- Tử Vi Đẩu Số (ước lượng): ${ziwei.bureau.name} · Mệnh chủ ${ziwei.lifeMaster}, Thân chủ ${ziwei.bodyMaster}.`);
  lines.push(`  · ${ziwei.note}`);

  lines.push(`- Maya: ${chinese.mayan.tzolkin.full} · Haab ${chinese.mayan.haab.full} · Long Count ${chinese.mayan.longCount}.`);

  lines.push(
    `- Human Design: ${design.typeVi}; thẩm quyền ${design.authority.split(" (")[0]}; hồ sơ ${design.profile} (${design.profileName.split("—")[0].trim()}).`
  );
  lines.push(`  · ${design.definition}: ${design.definitionNote}`);
  lines.push(
    `  · Trung tâm được xác định: ${design.definedCenters.join(", ") || "không có (Reflector)"}. Kênh: ${
      design.channels.map((channel) => `${channel.gates[0]}-${channel.gates[1]}`).join(", ") || "không có"
    }.`
  );
  lines.push(`  · Chiến lược: ${design.strategy} Bóng tối khi lệch: ${design.notSelf} → phần thưởng: ${design.signature}.`);

  lines.push(
    `- Bản đồ phái sinh: Rồng (draconic, gốc Bắc giao) · Nhật tâm (${derived.heliocentric.length} hành tinh) · Hài hoà ${derived.harmonics.map((harmonic) => `H${harmonic.n}`).join("/")}.`
  );
  lines.push(
    `  · Hồi quy Mặt Trời năm nay: ${derived.solarReturn.moment.toISOString().slice(0, 16).replace("T", " ")} UTC · Hồi quy Mặt Trăng gần nhất: ${derived.lunarReturn.moment.toISOString().slice(0, 16).replace("T", " ")} UTC.`
  );
  lines.push(
    `  · Tiến triển thứ cấp ở tuổi ${derived.progression.age.toFixed(1)}: Mặt Trời tiến triển ${displayAngle(derived.progression.points[0].longitude)}; cung Mặt Trời (solar arc) ${derived.solarArc.arc.toFixed(2)}°.`
  );

  return lines.join("\n");
};

export { EXTRA_POINTS, ALL_EXTRA_POINTS, HARMONICS, NAKSHATRAS, VARGAS, toZodiacFrame, signedSeparation };
export type { ExtraPointPosition, AspectPattern, ChartShape, HellenisticChart, BaziChart, ZiweiChart, MayanDate, HDChart, CrossAspect, DerivedPoint };
