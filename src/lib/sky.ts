import { Body, Equator, GeoVector, HelioVector, MakeTime, Observer, SearchRiseSet } from "astronomy-engine";
import constellationSource from "@/data/constellations.json";
import deepSkySource from "@/data/deepsky.json";
import starSource from "@/data/stars.json";
import { PLANETS, ZODIAC_SIGNS, getOffsetHours, getSignBreakdown, normalizeDegree, signedSeparation } from "@/lib/astro";
import { julianDay } from "@/lib/mathx";

export { julianDay };

/* ------------------------------------------------------------------ catalog */

export type Star = {
  index: number;
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  label: string | null;
  alternatives: string[];
  constellationAbbr: string | null;
  constellationVi: string | null;
};

type DeepSkySource = {
  id: string;
  alt: string;
  vi: string;
  en: string;
  type: string;
  typeVi: string;
  mag: number | null;
  ra: number;
  dec: number;
};

export type DeepSkyObject = DeepSkySource & { label: string };

export type ConstellationMeta = {
  abbr: string;
  latin: string;
  vi: string;
  ra: number;
  dec: number;
  rank: number;
};

export const CONSTELLATION_META = constellationSource.meta as ConstellationMeta[];
export const CONSTELLATION_LINES = constellationSource.lines as Record<string, number[][]>;

const constellationAbbrs = starSource.constellations as string[];
const constellationViByName = new Map(CONSTELLATION_META.map((item) => [item.abbr, item.vi]));
const constellationLatinByName = new Map(CONSTELLATION_META.map((item) => [item.abbr, item.latin]));

export const STARS: Star[] = (starSource.stars as number[][]).map((row, index) => {
  const [ra, dec, mag, bv, labelIdx, constellationIdx] = row;
  const alternatives = labelIdx >= 0 ? (starSource.labels[labelIdx] as string[]) : [];
  const abbr = constellationIdx >= 0 ? constellationAbbrs[constellationIdx] : null;

  return {
    index,
    ra,
    dec,
    mag,
    bv,
    label: alternatives[0] ?? null,
    alternatives,
    constellationAbbr: abbr,
    constellationVi: abbr ? constellationViByName.get(abbr) ?? null : null
  };
});

export const DEEP_SKY: DeepSkyObject[] = (deepSkySource.objects as DeepSkySource[]).map((item) => ({
  ...item,
  label: item.vi || item.en || item.id
}));

export const constellationName = (abbr: string) => constellationViByName.get(abbr) ?? constellationLatinByName.get(abbr) ?? abbr;

/** Sao sáng có tên riêng, dùng cho tra cứu sao cố định trong chiêm tinh. */
export const BRIGHT_NAMED_STARS = STARS.filter((star) => star.mag <= 3.1 && star.alternatives.length > 0);

/* --------------------------------------------------------------------- toán */

const DEG = Math.PI / 180;
const J2000 = 2451545.0;

const precessionAngles = (date: Date) => {
  const T = (julianDay(date) - J2000) / 36525;
  const toRad = (arcsec: number) => (arcsec / 3600) * DEG;

  return {
    zeta: toRad(2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T),
    z: toRad(2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T),
    theta: toRad(2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T)
  };
};

/** Chuyển toạ độ sao từ J2000 sang hệ xích đạo của ngày (precession IAU 1976). */
export const precessFromJ2000 = (raDeg: number, decDeg: number, date: Date) => {
  const { zeta, z, theta } = precessionAngles(date);
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;

  const A = Math.cos(dec) * Math.sin(ra + zeta);
  const B = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const C = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);

  let raOut = (Math.atan2(A, B) + z) / DEG;
  raOut = ((raOut + 180) % 360 + 360) % 360 - 180;
  return { ra: raOut, dec: Math.asin(Math.max(-1, Math.min(1, C))) / DEG };
};

export type Horizontal = { alt: number; az: number };

/** Toạ độ chân trời từ xích kinh/xích vĩ (cả hai theo hệ của ngày). */
export const toHorizontal = (raDeg: number, decDeg: number, lstDeg: number, latDeg: number): Horizontal => {
  const H = normalizeDegree(lstDeg - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
  const az =
    Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H)) / DEG;

  return { alt, az: normalizeDegree(az) };
};

/** Hoàng đạo (tropical) của một điểm trên thiên cầu — dùng để so với bản đồ sao natal. */
export const toEcliptic = (raDeg: number, decDeg: number, obliquityDeg: number) => {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const eps = obliquityDeg * DEG;

  const lon = Math.atan2(Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps), Math.cos(ra)) / DEG;
  const latSin = Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra);

  return { lon: normalizeDegree(lon), lat: Math.asin(Math.max(-1, Math.min(1, latSin))) / DEG };
};

/** Chuyển toạ độ thiên hà (l, b) sang xích kinh/xích vĩ J2000. */
export const galacticToEquatorial = (lDeg: number, bDeg: number) => {
  const alphaG = 192.85948 * DEG;
  const deltaG = 27.12825 * DEG;
  const lNcp = 122.93192 * DEG;
  const lRad = lDeg * DEG;
  const bRad = bDeg * DEG;
  const dec = Math.asin(
    Math.sin(deltaG) * Math.sin(bRad) + Math.cos(deltaG) * Math.cos(bRad) * Math.cos(lNcp - lRad)
  );
  const ra =
    alphaG +
    Math.atan2(
      Math.cos(bRad) * Math.sin(lNcp - lRad),
      Math.cos(deltaG) * Math.sin(bRad) - Math.sin(deltaG) * Math.cos(bRad) * Math.cos(lNcp - lRad)
    );

  return { ra: ((((ra / DEG + 180) % 360) + 360) % 360) - 180, dec: dec / DEG };
};

/** Ngân Hà: dải quanh mặt phẳng thiên hà (xích J2000). */
export const galacticBand = (bDeg: number) => {
  const points: Array<{ ra: number; dec: number }> = [];
  for (let l = 0; l <= 360; l += 2) points.push(galacticToEquatorial(l, bDeg));
  return points;
};

export const MILKY_WAY_BANDS = {
  outer: galacticBand(12),
  inner: galacticBand(6)
};

export const eclipticPath = (date: Date) => {
  const points: Array<{ ra: number; dec: number }> = [];
  const T = (julianDay(date) - J2000) / 36525;
  const eps = (23.4392911 - 0.0130042 * T) * DEG;

  for (let lon = 0; lon <= 360; lon += 2) {
    const l = lon * DEG;
    const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l));
    const dec = Math.asin(Math.sin(eps) * Math.sin(l));
    points.push({ ra: ra / DEG, dec: dec / DEG });
  }

  return points;
};

/* ------------------------------------------------------ sao cố định & natal */

export type FixedStarHit = {
  starName: string;
  starMag: number;
  constellation: string;
  longitude: number;
  signName: string;
  degree: number;
  minutes: number;
  natalLabel: string;
  orb: number;
  meaning: string;
};

const NATAL_POINT_LABEL: Record<string, string> = {
  ascendant: "Cung Mọc (AC)",
  midheaven: "Thiên Đỉnh (MC)"
};

/** Tìm các sao cố định nằm gần (theo kinh độ hoàng đạo) các điểm quan trọng của bản đồ sao natal. */
export const findFixedStarHits = (
  chart: { ascendant: number; midheaven: number; planets: Array<{ key: string; label: string; longitude: number }> },
  obliquityDeg: number,
  orbLimit = 1.5
): FixedStarHit[] => {
  const targets: Array<{ key: string; label: string; longitude: number }> = [
    { key: "ascendant", label: NATAL_POINT_LABEL.ascendant, longitude: chart.ascendant },
    { key: "midheaven", label: NATAL_POINT_LABEL.midheaven, longitude: chart.midheaven },
    ...chart.planets.map((planet) => ({ key: planet.key, label: planet.label, longitude: planet.longitude }))
  ];

  const hits: FixedStarHit[] = [];

  for (const star of BRIGHT_NAMED_STARS) {
    const { lon } = toEcliptic(star.ra, star.dec, obliquityDeg);
    const detail = getSignBreakdown(lon);

    for (const target of targets) {
      const orb = Math.abs(signedSeparation(lon, target.longitude));
      if (orb <= orbLimit) {
        hits.push({
          starName: star.alternatives[0] ?? `HIP ${star.index}`,
          starMag: star.mag,
          constellation: star.constellationVi ?? "",
          longitude: lon,
          signName: detail.sign.name,
          degree: detail.degree,
          minutes: detail.minutes,
          natalLabel: target.label,
          orb,
          meaning: starMeaningFor(star.alternatives, star.constellationAbbr)
        });
      }
    }
  }

  return hits.sort((a, b) => a.orb - b.orb);
};

/** Ý nghĩa chiêm tinh của sao cố định (bảng ngắn, dùng cho luận giải nội bộ). */
export const FIXED_STAR_MEANING: Record<string, string> = {
  Aldebaran: "sức mạnh bền bỉ, gan dạ, thành tựu nhờ nỗ lực nhưng dễ va chạm với người có quyền",
  Regulus: "khát vọng lãnh đạo, danh vọng, thành công khi giữ chính trực",
  Antares: "cường độ mãnh liệt, quyết liệt, cảnh báo về sự cực đoan",
  Fomalhaut: "trực giác nhạy, lý tưởng đẹp, may mắn trong nghệ thuật và tâm linh",
  Sirius: "danh tiếng, nhiệt huyết, được bảo hộ khi hành động vì điều lớn lao",
  Vega: "khiếu thẩm mỹ, sức hút, may mắn trong giao tiếp và nghệ thuật",
  Arcturus: "tinh thần tiên phong, trí tuệ thực tiễn, thịnh vượng nhờ kiên trì",
  Spica: "tài năng, may mắn trong học thuật và sự nghiệp, được quý nhân nâng đỡ",
  Procyon: "sự nghiệp đi lên nhanh, hơi bốc đồng, phải chọn đúng thời điểm",
  Betelgeuse: "tham vọng lớn, sức bền thể chất, dễ quá tải nếu ôm đồm",
  Rigel: "sự giáo dục, kỹ thuật, năng lực tổ chức và danh tiếng nghề nghiệp",
  Capella: "tính tò mò, ham học, khả năng tự lập và đi lại nhiều",
  Altair: "phản ứng nhanh, dám nghĩ dám làm, hay gặp biến cố đường xa",
  Deneb: "lý tưởng lớn, tầm nhìn nghệ thuật, đi lên nhờ sự kiên định",
  Pollux: "tranh luận sắc bén, may mắn trong hôn nhân và thể thao",
  Castor: "nhạy cảm, song song hai mặt, tài ngoại giao và học thuật",
  Algol: "thử thách, biến động mạnh, sức chịu đựng lớn",
  Alcyone: "nghiêm túc, kỷ luật, trọng danh dự (nhóm Tua Rua)",
  Bellatrix: "hành động quyết đoán, thắng lợi nhờ tốc độ",
  Alnilam: "thành công vượt khó, dễ thành tâm điểm chú ý ở đám đông",
  Canopus: "trí tuệ cổ điển, bảo hộ của người đi xa, hành trình dài",
  Achernar: "đổi mới, thành tựu tôn giáo/triết học, cá tính rõ rệt",
  "Alpha Centauri": "tình bạn, ngoại giao, cơ hội đến từ người khác",
  Polaris: "định hướng, bổn phận, khả năng dẫn đường cho tập thể",
  Denebola: "bất đồng chính kiến, cần học cách thương lượng",
  Alphecca: "vinh dự, duyên nghệ thuật, được yêu mến",
  Antliae: "tính thực dụng, thích máy móc và kỹ thuật",
  "Zubenelgenubi": "cân bằng, công lý, may mắn trong đàm phán",
  "Zubeneschamali": "triển vọng tươi sáng, tham vọng chính trị",
  Acrux: "niềm tin mạnh, sự nghiệp tôn giáo/học thuật",
  Nunki: "hy vọng, thành công trong hội nhóm, may mắn từ tri thức",
  Rasalhague: "khả năng chữa lành, hành động vì cộng đồng",
  Markab: "danh tiếng nhanh đến nhanh đi, cần bằng chứng bằng thực lực",
  Scheat: "tính khí bất định, sáng tạo nhưng cần kỷ luật",
  Alpheratz: "tự do, độc lập, tư duy nhảy vọt",
  Mirach: "tình cảm đẹp, hôn nhân thuận lợi, thiên về nghệ thuật",
  Sadalmelik: "may mắn từ nước/du lịch, trí tưởng tượng phong phú",
  Menkar: "thử thách tài chính, khả năng đứng lên sau thất bại",
  Zosma: "tư duy phân tích, cảnh báo về việc tự làm mình tổn thương",
  Alkaid: "bổn phận với gia đình, kỷ luật nghiêm",
  Mizar: "tính trật tự, chi tiết, phù hợp kỹ thuật và quân sự",
  Thuban: "giữ vị trí trung tâm, trách nhiệm bao quát",
  Vindemiatrix: "sự chia ly, trưởng thành qua mất mát",
  Hamal: "sức mạnh thể chất, hành động độc lập",
  Menkalinan: "khả năng lãnh đạo nhóm, học nhanh",
  Gienah: "sự nghiệp liên quan tri thức và chuyển động",
  Alphard: "thử thách cảm xúc, trí tuệ uyên bác",
  Algenib: "thanh thế, nói năng có sức nặng",
  Schedar: "bản lĩnh hoàng gia, sự kiên nhẫn chiến lược",
  Mirfak: "hào phóng, can đảm, bảo hộ người trẻ",
  Minkar: "trí tuệ lạnh, sự thật khó nói",
  Unukalhai: "cảnh báo về sự ngộ nhận, sức khỏe cần chú ý"
};

const NORMALIZED_STAR_KEY = (keys: string[]) =>
  keys
    .filter((key) => /^[A-Za-z][A-Za-z\s-]+$/.test(key))
    .map((key) => key.replace(/\s+/g, " ").trim());

const starMeaningFor = (alternatives: string[], constellationAbbr: string | null): string => {
  for (const key of NORMALIZED_STAR_KEY(alternatives)) {
    if (FIXED_STAR_MEANING[key]) return FIXED_STAR_MEANING[key];
  }
  return constellationAbbr ? `gắn với chòm ${constellationName(constellationAbbr)} và chủ đề của chòm này` : "";
};

/* ------------------------------------------------------- bầu trời hiện tại */

export type PlanetSky = {
  key: string;
  label: string;
  symbol: string;
  color: string;
  ra: number;
  dec: number;
  lon: number;
  alt: number;
  az: number;
  retrograde: boolean;
  magnitude?: number;
  /** Khoảng cách địa tâm (AU) — dùng tính góc pha thật của hành tinh. */
  distanceAu: number;
  /** Khoảng cách nhật tâm (AU). */
  sunDistanceAu: number;
};

export type SkySnapshot = {
  date: Date;
  latitude: number;
  longitude: number;
  lstDeg: number;
  obliquityDeg: number;
  hemi: "Bắc" | "Nam";
  planets: PlanetSky[];
  sunAltitude: number;
  moonPhase: string;
  moonIllumination: number;
  visibleNow: Array<{ label: string; alt: number; az: number; constellation: string }>;
};

const compassName = (az: number) => {
  const names = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  return names[Math.round(normalizeDegree(az) / 45) % 8];
};

export const compass = compassName;

/** Ảnh chụp bầu trời: vị trí hành tinh, Mặt Trời, Mặt Trăng ở một thời điểm/địa điểm. */
export const computeSkySnapshot = (date: Date, latitude: number, longitude: number, lstDeg: number, obliquityDeg: number): SkySnapshot => {
  const observer = new Observer(latitude, longitude, 0);
  const time = MakeTime(date);
  const sunAltitude = toHorizontalForBody(Body.Sun, time, observer, lstDeg, latitude);

  const planets: PlanetSky[] = PLANETS.map((planet) => {
    const equator = Equator(planet.body, time, observer, true, true);
    const nextTime = MakeTime(new Date(date.getTime() + 86400000));
    const nextEquator = Equator(planet.body, nextTime, observer, true, true);
    const { alt, az } = toHorizontal(equator.ra * 15, equator.dec, lstDeg, latitude);
    const lon = toEcliptic(equator.ra * 15, equator.dec, obliquityDeg).lon;
    const nextLon = toEcliptic(nextEquator.ra * 15, nextEquator.dec, obliquityDeg).lon;
    // Khoảng cách thật (AU) để suy ra góc pha: hành tinh ngoài luôn gần tròn đầy,
    // Sao Kim/Sao Thủy khuyết rõ khi nằm giữa Trái Đất và Mặt Trời.
    const geoVector = GeoVector(planet.body, time, true);
    const helioVector = HelioVector(planet.body, time);

    return {
      key: planet.key,
      label: planet.label,
      symbol: planet.symbol,
      color: planet.color,
      ra: equator.ra * 15,
      dec: equator.dec,
      lon,
      alt,
      az,
      retrograde: signedSeparation(lon, nextLon) < 0,
      distanceAu: geoVector.Length(),
      sunDistanceAu: helioVector.Length()
    };
  });

  const moon = planets.find((planet) => planet.key === "moon");
  const sun = planets.find((planet) => planet.key === "sun");
  const phaseAngle = normalizeDegree((moon?.lon ?? 0) - (sun?.lon ?? 0));
  const moonIllumination = (1 - Math.cos(phaseAngle * DEG)) / 2;

  const visibleNow = planets
    .filter((planet) => planet.alt > 5)
    .sort((a, b) => b.alt - a.alt)
    .map((planet) => ({
      label: planet.label,
      alt: planet.alt,
      az: planet.az,
      constellation: constellationOfEquatorial(planet.ra, planet.dec)
    }));

  return {
    date,
    latitude,
    longitude,
    lstDeg,
    obliquityDeg,
    hemi: latitude >= 0 ? "Bắc" : "Nam",
    planets,
    sunAltitude,
    moonPhase: phaseNameFromAngle(phaseAngle),
    moonIllumination,
    visibleNow
  };
};

const toHorizontalForBody = (body: Body, time: ReturnType<typeof MakeTime>, observer: Observer, lstDeg: number, latitude: number) => {
  const equator = Equator(body, time, observer, true, true);
  return toHorizontal(equator.ra * 15, equator.dec, lstDeg, latitude).alt;
};

export const phaseNameFromAngle = (angle: number) => {
  const phase = normalizeDegree(angle);
  if (phase < 22.5 || phase >= 337.5) return "Trăng mới";
  if (phase < 67.5) return "Trăng lưỡi liềm đầu tháng";
  if (phase < 112.5) return "Thượng huyền";
  if (phase < 157.5) return "Trăng khuyết đầu";
  if (phase < 202.5) return "Trăng tròn";
  if (phase < 247.5) return "Trăng khuyết cuối";
  if (phase < 292.5) return "Hạ huyền";
  return "Trăng lưỡi liềm cuối tháng";
};

/** Ước lượng chòm sao chứa một điểm (dựa trên tên chòm gần nhất trong danh mục 88 chòm). */
export const constellationOfEquatorial = (ra: number, dec: number) => {
  let best: ConstellationMeta | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const meta of CONSTELLATION_META) {
    const dRa = Math.abs(signedSeparation(meta.ra, ra));
    const dDec = Math.abs(meta.dec - dec);
    const distance = Math.hypot(dRa * Math.cos((dec * DEG) || 0.0001), dDec);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = meta;
    }
  }

  return best ? `${best.vi} (${best.latin})` : "không xác định";
};

export const signPositionOf = (longitude: number) => {
  const detail = getSignBreakdown(longitude);
  return `${detail.sign.name} ${detail.degree}°${String(detail.minutes).padStart(2, "0")}'`;
};

export const ZODIAC_NAMES = ZODIAC_SIGNS.map((sign) => sign.name);

/** Giờ mọc/lặn của Mặt Trời và Mặt Trăng trong ngày (theo múi giờ của nơi quan sát). */
export const riseSetForDay = (date: Date, latitude: number, longitude: number, timeZoneId?: string | null) => {
  const observer = new Observer(latitude, longitude, 0);
  const formatter = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZoneId ? { timeZone: timeZoneId } : {})
  });

  let start: Date;
  try {
    const offset = timeZoneId ? getOffsetHours(date, timeZoneId) : -date.getTimezoneOffset() / 60;
    const localMidnight = new Date(date.getTime() + offset * 3600000);
    start = new Date(
      Date.UTC(localMidnight.getUTCFullYear(), localMidnight.getUTCMonth(), localMidnight.getUTCDate()) - offset * 3600000
    );
  } catch {
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  const format = (value: { date: Date } | null) => (value ? formatter.format(value.date) : "—");

  return {
    sunRise: format(SearchRiseSet(Body.Sun, observer, 1, start, 1)),
    sunSet: format(SearchRiseSet(Body.Sun, observer, -1, start, 1)),
    moonRise: format(SearchRiseSet(Body.Moon, observer, 1, start, 1)),
    moonSet: format(SearchRiseSet(Body.Moon, observer, -1, start, 1)),
    timeZoneLabel: timeZoneId ?? "giờ máy của bạn"
  };
};
