import { Body, PairLongitude, SiderealTime, SunPosition } from "astronomy-engine";

export type PlanetPosition = {
  key: string;
  label: string;
  symbol: string;
  color: string;
  longitude: number;
  retrograde: boolean;
  /** Nhà (Whole Sign) mà hành tinh nằm trong đó, tính từ cung Mọc. */
  house: number;
  speed: number;
};

export type Aspect = {
  pair: string;
  fromLabel: string;
  toLabel: string;
  type: string;
  targetAngle: number;
  separation: number;
  orb: number;
  orbLimit: number;
  trend: "Applying" | "Separating";
  color: string;
  from: string;
  to: string;
};

export type House = {
  house: number;
  cusp: number;
  signName: string;
};

export type ChartData = {
  utcDate: Date;
  timezoneId: string | null;
  timezoneOffset: number;
  locationLabel: string;
  latitude: number;
  longitude: number;
  moonPhase: string;
  moonPhaseAngle: number;
  ascendant: number;
  descendant: number;
  midheaven: number;
  imumCoeli: number;
  houses: House[];
  planets: PlanetPosition[];
  aspects: Aspect[];
  elements: BalanceMap;
  modalities: ModalityMap;
};

export type BalanceMap = {
  fire: number;
  earth: number;
  air: number;
  water: number;
} & Record<string, number>;

export type ModalityMap = {
  cardinal: number;
  fixed: number;
  mutable: number;
} & Record<string, number>;

export type TimeBuildResult = {
  utcDate: Date;
  resolvedOffset: number;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  label: string;
  timezoneId: string | null;
  provider: "nominatim" | "open-meteo" | "thủ công";
};

export const ZODIAC_SIGNS = [
  { name: "Bạch Dương", symbol: "Ar", latin: "Aries", element: "fire", modality: "cardinal", ruler: "Mars" },
  { name: "Kim Ngưu", symbol: "Ta", latin: "Taurus", element: "earth", modality: "fixed", ruler: "Venus" },
  { name: "Song Tử", symbol: "Ge", latin: "Gemini", element: "air", modality: "mutable", ruler: "Mercury" },
  { name: "Cự Giải", symbol: "Ca", latin: "Cancer", element: "water", modality: "cardinal", ruler: "Moon" },
  { name: "Sư Tử", symbol: "Le", latin: "Leo", element: "fire", modality: "fixed", ruler: "Sun" },
  { name: "Xử Nữ", symbol: "Vi", latin: "Virgo", element: "earth", modality: "mutable", ruler: "Mercury" },
  { name: "Thiên Bình", symbol: "Li", latin: "Libra", element: "air", modality: "cardinal", ruler: "Venus" },
  { name: "Bọ Cạp", symbol: "Sc", latin: "Scorpio", element: "water", modality: "fixed", ruler: "Pluto" },
  { name: "Nhân Mã", symbol: "Sg", latin: "Sagittarius", element: "fire", modality: "mutable", ruler: "Jupiter" },
  { name: "Ma Kết", symbol: "Cp", latin: "Capricorn", element: "earth", modality: "cardinal", ruler: "Saturn" },
  { name: "Bảo Bình", symbol: "Aq", latin: "Aquarius", element: "air", modality: "fixed", ruler: "Uranus" },
  { name: "Song Ngư", symbol: "Pi", latin: "Pisces", element: "water", modality: "mutable", ruler: "Neptune" }
] as const;

export const ELEMENT_VI: Record<string, string> = {
  fire: "Lửa",
  earth: "Đất",
  air: "Khí",
  water: "Nước"
};

export const MODALITY_VI: Record<string, string> = {
  cardinal: "Khởi đầu",
  fixed: "Cố định",
  mutable: "Linh hoạt"
};

export const PLANETS: Array<Omit<PlanetPosition, "longitude" | "retrograde" | "house" | "speed"> & { body: Body }> = [
  { key: "sun", label: "Mặt Trời", symbol: "Sun", body: Body.Sun, color: "#f59e0b" },
  { key: "moon", label: "Mặt Trăng", symbol: "Moon", body: Body.Moon, color: "#cbd5e1" },
  { key: "mercury", label: "Thủy Tinh", symbol: "Me", body: Body.Mercury, color: "#93c5fd" },
  { key: "venus", label: "Kim Tinh", symbol: "Ve", body: Body.Venus, color: "#f9a8d4" },
  { key: "mars", label: "Hỏa Tinh", symbol: "Ma", body: Body.Mars, color: "#f87171" },
  { key: "jupiter", label: "Mộc Tinh", symbol: "Ju", body: Body.Jupiter, color: "#fb923c" },
  { key: "saturn", label: "Thổ Tinh", symbol: "Sa", body: Body.Saturn, color: "#fde68a" },
  { key: "uranus", label: "Thiên Vương", symbol: "Ur", body: Body.Uranus, color: "#67e8f9" },
  { key: "neptune", label: "Hải Vương", symbol: "Ne", body: Body.Neptune, color: "#a5b4fc" },
  { key: "pluto", label: "Diêm Vương", symbol: "Pl", body: Body.Pluto, color: "#d8b4fe" }
];

export const ASPECTS = [
  { type: "Conjunction", label: "Trùng tụ (0°)", angle: 0, orb: 8, color: "#f8fafc" },
  { type: "Sextile", label: "Lục hợp (60°)", angle: 60, orb: 4, color: "#22d3ee" },
  { type: "Square", label: "Vuông góc (90°)", angle: 90, orb: 6, color: "#fb7185" },
  { type: "Trine", label: "Tam hợp (120°)", angle: 120, orb: 6, color: "#4ade80" },
  { type: "Opposition", label: "Đối đỉnh (180°)", angle: 180, orb: 8, color: "#f97316" }
];

export const normalizeDegree = (value: number) => {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const signedSeparation = (a: number, b: number) => ((b - a + 540) % 360) - 180;

export const formatLocalDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const formatLocalTime = (date: Date) => {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

export const getOffsetHours = (date: Date, timeZoneId: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZoneId,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const part = formatter.formatToParts(date).find((item) => item.type === "timeZoneName")?.value ?? "UTC+0";
  const match = part.match(/(?:GMT|UTC)([+-]\d{1,2})(?::?(\d{2}))?/i);

  if (!match) return 0;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const sign = hour >= 0 ? 1 : -1;
  return hour + (sign * minute) / 60;
};

export const formatOffset = (offset: number) => {
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute);
  const minutes = Math.round((absolute - hours) * 60);
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const parseDateTimeInput = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timePattern.test(timeValue)) {
    throw new Error("Giờ sinh phải theo định dạng 24h HH:mm (00:00 - 23:59).");
  }

  const [hour, minute] = timeValue.split(":").map(Number);

  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
    throw new Error("Ngày giờ không hợp lệ.");
  }

  return { year, month, day, hour, minute };
};

export const buildUtcDate = (
  dateValue: string,
  timeValue: string,
  manualOffset: number,
  timeZoneId: string | null
): TimeBuildResult => {
  const { year, month, day, hour, minute } = parseDateTimeInput(dateValue, timeValue);
  const localMillis = Date.UTC(year, month - 1, day, hour, minute);

  if (!timeZoneId) {
    return {
      utcDate: new Date(localMillis - manualOffset * 60 * 60 * 1000),
      resolvedOffset: manualOffset
    };
  }

  // Lặp vài vòng vì offset lịch sử (DST) có thể đổi quanh thời điểm mục tiêu.
  let candidateUtc = localMillis - manualOffset * 60 * 60 * 1000;
  for (let i = 0; i < 4; i += 1) {
    const offset = getOffsetHours(new Date(candidateUtc), timeZoneId);
    const refined = localMillis - offset * 60 * 60 * 1000;
    if (Math.abs(refined - candidateUtc) < 1000) {
      candidateUtc = refined;
      break;
    }
    candidateUtc = refined;
  }

  return {
    utcDate: new Date(candidateUtc),
    resolvedOffset: getOffsetHours(new Date(candidateUtc), timeZoneId)
  };
};

export const getSignBreakdown = (longitude: number) => {
  const safeLongitude = normalizeDegree(longitude);
  const signIndex = Math.floor(safeLongitude / 30);
  const inSign = safeLongitude - signIndex * 30;
  const degree = Math.floor(inSign);
  const minutes = Math.floor((inSign - degree) * 60);

  return { signIndex, sign: ZODIAC_SIGNS[signIndex], degree, minutes };
};

export const displayAngle = (longitude: number) => {
  const detail = getSignBreakdown(longitude);
  return `${detail.sign.name} ${detail.degree}°${String(detail.minutes).padStart(2, "0")}`;
};

export const displayAngleShort = (longitude: number) => {
  const detail = getSignBreakdown(longitude);
  return `${detail.sign.latin.slice(0, 3)} ${detail.degree}°${String(detail.minutes).padStart(2, "0")}'`;
};

export const moonPhaseFromPair = (moonRelativeSun: number) => {
  const phase = normalizeDegree(moonRelativeSun);
  if (phase < 22.5 || phase >= 337.5) return "Trăng mới";
  if (phase < 67.5) return "Trăng lưỡi liềm đầu tháng";
  if (phase < 112.5) return "Thượng huyền";
  if (phase < 157.5) return "Trăng khuyết đầu";
  if (phase < 202.5) return "Trăng tròn";
  if (phase < 247.5) return "Trăng khuyết cuối";
  if (phase < 292.5) return "Hạ huyền";
  return "Trăng lưỡi liềm cuối tháng";
};

export const calcObliquity = (date: Date) => {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const T = (julianDay - 2451545) / 36525;
  return 23 + 26 / 60 + 21.448 / 3600 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
};

export const localSiderealDegrees = (date: Date, longitude: number) =>
  normalizeDegree(SiderealTime(date) * 15 + longitude);

export const calcAngles = (utcDate: Date, latitude: number, longitude: number) => {
  const epsilon = (calcObliquity(utcDate) * Math.PI) / 180;
  const lstDegrees = localSiderealDegrees(utcDate, longitude);
  const lst = (lstDegrees * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;

  const ascendant = normalizeDegree(
    (Math.atan2(Math.cos(lst), -(Math.sin(lst) * Math.cos(epsilon) + Math.tan(lat) * Math.sin(epsilon))) * 180) / Math.PI
  );

  const midheaven = normalizeDegree((Math.atan2(Math.sin(lst) * Math.cos(epsilon), Math.cos(lst)) * 180) / Math.PI);

  return {
    ascendant,
    descendant: normalizeDegree(ascendant + 180),
    midheaven,
    imumCoeli: normalizeDegree(midheaven + 180),
    localSiderealDegrees: lstDegrees
  };
};

export const buildWholeSignHouses = (ascendant: number): House[] => {
  const ascSign = Math.floor(normalizeDegree(ascendant) / 30);
  const houses: House[] = [];

  for (let i = 0; i < 12; i += 1) {
    const cusp = normalizeDegree((ascSign + i) * 30);
    houses.push({
      house: i + 1,
      cusp,
      signName: ZODIAC_SIGNS[Math.floor(cusp / 30)].name
    });
  }

  return houses;
};

/** Vị trí hoàng đạo (tropical, geocentric) của 10 hành tinh tại một thời điểm. */
export const computePlanetLongitudes = (utcDate: Date) => {
  const sunLongitude = normalizeDegree(SunPosition(utcDate).elon);

  return PLANETS.map((planet) => {
    const longitude =
      planet.body === Body.Sun ? sunLongitude : normalizeDegree(sunLongitude + PairLongitude(planet.body, Body.Sun, utcDate));

    return { key: planet.key, longitude, body: planet.body };
  });
};

const elementBalanceOf = (longitudes: number[], ascendant: number): { elements: BalanceMap; modalities: ModalityMap } => {
  const elements: BalanceMap = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: ModalityMap = { cardinal: 0, fixed: 0, mutable: 0 };

  [...longitudes, ascendant].forEach((longitude) => {
    const sign = ZODIAC_SIGNS[getSignBreakdown(longitude).signIndex];
    elements[sign.element] = (elements[sign.element] ?? 0) + 1;
    modalities[sign.modality] = (modalities[sign.modality] ?? 0) + 1;
  });

  return { elements, modalities };
};

export const calculateChart = (
  utcDate: Date,
  latitude: number,
  longitude: number,
  locationLabel: string,
  timezoneId: string | null,
  timezoneOffset: number
): ChartData => {
  const angles = calcAngles(utcDate, latitude, longitude);
  const nextDate = new Date(utcDate.getTime() + 24 * 60 * 60 * 1000);
  const current = new Map(computePlanetLongitudes(utcDate).map((item) => [item.key, item.longitude]));
  const next = new Map(computePlanetLongitudes(nextDate).map((item) => [item.key, item.longitude]));

  const planets: PlanetPosition[] = PLANETS.map((planet) => {
    const longitudeNow = current.get(planet.key) ?? 0;
    const longitudeNext = next.get(planet.key) ?? longitudeNow;
    const step = signedSeparation(longitudeNow, longitudeNext);
    const signIndex = getSignBreakdown(longitudeNow).signIndex;
    const ascSignIndex = getSignBreakdown(angles.ascendant).signIndex;

    return {
      ...planet,
      longitude: longitudeNow,
      retrograde: step < 0,
      speed: step,
      house: ((signIndex - ascSignIndex + 12) % 12) + 1
    };
  });

  const aspects: Aspect[] = [];
  for (let i = 0; i < planets.length; i += 1) {
    for (let j = i + 1; j < planets.length; j += 1) {
      const separation = Math.abs(signedSeparation(planets[i].longitude, planets[j].longitude));
      for (const aspect of ASPECTS) {
        const orb = Math.abs(separation - aspect.angle);
        if (orb <= aspect.orb) {
          const nextSeparation = Math.abs(
            signedSeparation(
              next.get(planets[i].key) ?? planets[i].longitude,
              next.get(planets[j].key) ?? planets[j].longitude
            )
          );

          aspects.push({
            pair: `${planets[i].label} - ${planets[j].label}`,
            fromLabel: planets[i].label,
            toLabel: planets[j].label,
            type: aspect.type,
            targetAngle: aspect.angle,
            separation,
            orb,
            orbLimit: aspect.orb,
            trend: Math.abs(nextSeparation - aspect.angle) < Math.abs(separation - aspect.angle) ? "Applying" : "Separating",
            color: aspect.color,
            from: planets[i].key,
            to: planets[j].key
          });
          break;
        }
      }
    }
  }

  const moonPhaseAngle = normalizeDegree(PairLongitude(Body.Moon, Body.Sun, utcDate));
  const { elements, modalities } = elementBalanceOf(
    planets.map((planet) => planet.longitude),
    angles.ascendant
  );

  return {
    utcDate,
    timezoneId,
    timezoneOffset,
    locationLabel,
    latitude,
    longitude,
    moonPhase: moonPhaseFromPair(moonPhaseAngle),
    moonPhaseAngle,
    ascendant: angles.ascendant,
    descendant: angles.descendant,
    midheaven: angles.midheaven,
    imumCoeli: angles.imumCoeli,
    houses: buildWholeSignHouses(angles.ascendant),
    planets,
    aspects: aspects.sort((a, b) => a.orb - b.orb),
    elements,
    modalities
  };
};

/* ------------------------------------------------------------------ transit */

export type TransitHit = {
  transitKey: string;
  transitLabel: string;
  natalKey: string;
  natalLabel: string;
  aspect: string;
  aspectLabel: string;
  orb: number;
  applying: boolean;
  transitLongitude: number;
  transitRetrograde: boolean;
  natalHouse: number;
};

/** Góc chiếu của các hành tinh hiện tại lên bản đồ sao natal (transit). */
export const computeTransits = (chart: ChartData, date: Date, maxOrb = 4): TransitHit[] => {
  const now = computePlanetLongitudes(date);
  const soon = computePlanetLongitudes(new Date(date.getTime() + 24 * 60 * 60 * 1000));
  const soonMap = new Map(soon.map((item) => [item.key, item.longitude]));
  const natalKeys = ["ascendant", "midheaven", ...chart.planets.map((planet) => planet.key)];
  const natalLabel = (key: string) => {
    if (key === "ascendant") return "Cung Mọc (AC)";
    if (key === "midheaven") return "Thiên Đỉnh (MC)";
    return chart.planets.find((planet) => planet.key === key)?.label ?? key;
  };
  const natalValue = (key: string) => {
    if (key === "ascendant") return chart.ascendant;
    if (key === "midheaven") return chart.midheaven;
    return chart.planets.find((planet) => planet.key === key)?.longitude ?? 0;
  };

  const hits: TransitHit[] = [];

  for (const transit of now) {
    const meta = PLANETS.find((planet) => planet.key === transit.key);
    if (!meta) continue;
    const nextLongitude = soonMap.get(transit.key) ?? transit.longitude;
    const retrograde = signedSeparation(transit.longitude, nextLongitude) < 0;

    for (const natalKey of natalKeys) {
      const target = natalValue(natalKey);
      const separation = Math.abs(signedSeparation(transit.longitude, target));

      for (const aspect of ASPECTS) {
        const orb = Math.abs(separation - aspect.angle);
        if (orb <= maxOrb) {
          const nextSeparation = Math.abs(signedSeparation(nextLongitude, target));
          hits.push({
            transitKey: transit.key,
            transitLabel: meta.label,
            natalKey,
            natalLabel: natalLabel(natalKey),
            aspect: aspect.type,
            aspectLabel: aspect.label,
            orb,
            applying: Math.abs(nextSeparation - aspect.angle) < orb,
            transitLongitude: transit.longitude,
            transitRetrograde: retrograde,
            natalHouse: chart.planets.find((planet) => planet.key === natalKey)?.house ?? 1
          });
          break;
        }
      }
    }
  }

  return hits.sort((a, b) => a.orb - b.orb);
};

export const formatReportTimestamp = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(date);

/** Bản mô tả chart dạng văn bản để gửi kèm câu hỏi cho mô hình ngôn ngữ. */
export const buildChartReport = (chart: ChartData, senderName: string, question: string, transitLines: string[] = []) => {
  const planetLines = chart.planets
    .map(
      (planet) =>
        `- ${planet.label}: ${displayAngle(planet.longitude)} | Nhà ${planet.house}${planet.retrograde ? " | Nghịch hành" : ""}`
    )
    .join("\n");

  const aspectLines = chart.aspects
    .map(
      (aspect) =>
        `- ${aspect.fromLabel} - ${aspect.toLabel}: ${aspect.type} | góc thực ${aspect.separation.toFixed(2)}° | orb ${aspect.orb.toFixed(2)}° | ${aspect.trend}`
    )
    .join("\n");

  const elementLine = (Object.keys(chart.elements) as string[])
    .map((key) => `${ELEMENT_VI[key] ?? key} ${chart.elements[key]}`)
    .join(", ");
  const modalityLine = (Object.keys(chart.modalities) as string[])
    .map((key) => `${MODALITY_VI[key] ?? key} ${chart.modalities[key]}`)
    .join(", ");

  return [
    "BÁO CÁO BẢN ĐỒ SAO GỬI AI LUẬN GIẢI",
    "",
    `Người yêu cầu: ${senderName}`,
    `Nơi sinh: ${chart.locationLabel}`,
    `Toạ độ: ${chart.latitude.toFixed(4)}, ${chart.longitude.toFixed(4)}`,
    `Mốc thời gian UTC: ${formatReportTimestamp(chart.utcDate)} UTC`,
    `Múi giờ: ${chart.timezoneId ?? "thủ công"} (${formatOffset(chart.timezoneOffset)})`,
    `Pha Mặt Trăng: ${chart.moonPhase} (góc ${chart.moonPhaseAngle.toFixed(1)}°)`,
    `Cung Mọc (AC): ${displayAngle(chart.ascendant)} | Thiên Đỉnh (MC): ${displayAngle(chart.midheaven)}`,
    `IC: ${displayAngle(chart.imumCoeli)} | DC: ${displayAngle(chart.descendant)}`,
    `Cân bằng nguyên tố: ${elementLine}`,
    `Cân bằng tính chất: ${modalityLine}`,
    `Hệ thống nhà: Whole Sign (toàn cung)`,
    "",
    "VỊ TRÍ HÀNH TINH (tropical, geocentric)",
    planetLines,
    "",
    "GÓC CHIẾU TRONG BẢN ĐỒ",
    aspectLines || "- Không có góc chiếu trong ngưỡng orb.",
    "",
    "TRANSIT HIỆN TẠI LÊN BẢN ĐỒ (orb <= 4°)",
    transitLines.length ? transitLines.join("\n") : "- Không có transit nổi bật trong ngưỡng orb.",
    "",
    "CÂU HỎI CẦN LUẬN GIẢI",
    question
  ].join("\n");
};

export const transitToLines = (hits: TransitHit[]) =>
  hits
    .slice(0, 18)
    .map(
      (hit) =>
        `- ${hit.transitLabel} ${hit.aspect} ${hit.natalLabel} (orb ${hit.orb.toFixed(2)}°, ${
          hit.applying ? "đang áp sát" : "đang tách"
        }${hit.transitRetrograde ? ", nghịch hành" : ""})`
    );
