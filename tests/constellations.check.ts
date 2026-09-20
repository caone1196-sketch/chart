/**
 * Kiểm tra dữ liệu liên kết của 88 chòm sao trong src/data — chạy lại mỗi khi
 * tái sinh dữ liệu bằng `npm run data` để đảm bảo catalogue không bị hỏng.
 *
 *   npm run test:constellations
 *
 * Các bất biến:
 *  1. Đúng 88 chòm, abbr duy nhất và khớp nhau ở cả ba nơi: meta, khoá đường nối,
 *     danh sách chòm trong catalogue sao.
 *  2. Meta hợp lệ: tên Latin/tiếng Việt không rỗng, toạ độ tâm trong thiên cầu, rank 1–3.
 *  3. Từng sao: toạ độ/cấp sao hợp lệ; chỉ số chòm và chỉ số nhãn nằm trong mảng.
 *  4. Đường nối: mỗi dải ≥2 đỉnh, toạ độ hợp lệ, không đoạn nào dài bất thường (>30°).
 *  5. Mỗi đỉnh đường nối khớp một sao thật trong catalogue; đỉnh đã khớp phải kéo
 *     sao thuộc chính chòm đó (cho phép thiểu số sao "mượn" giữa các chòm lân cận
 *     theo chuẩn IAU, vd Elnath trong nét Ngự Phu).
 *  6. Các sao nổi tiếng được gán đúng chòm.
 */
import constellationSource from "../src/data/constellations.json";
import starSource from "../src/data/stars.json";
import { CONSTELLATION_LINES, CONSTELLATION_META, STARS, constellationName } from "../src/lib/sky.ts";

let checks = 0;
let failures = 0;
const seen = new Set<string>();

const fail = (group: string, message: string) => {
  failures += 1;
  const key = `${group}|${message}`;
  if (!seen.has(key)) {
    seen.add(key);
    console.log(`  ✘ [${group}] ${message}`);
  }
};
const ok = () => {
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

const DEG = Math.PI / 180;
const wrap180 = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

/** Khoảng cách góc (độ) giữa hai điểm thiên cầu. */
const angularSep = (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const p1 = dec1 * DEG;
  const p2 = dec2 * DEG;
  const dRa = wrap180(ra1 - ra2) * DEG;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dRa);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
};

const rawMeta = constellationSource.meta as Array<{ abbr: string; latin: string; vi: string; ra: number; dec: number; rank: number }>;
const rawLines = constellationSource.lines as Record<string, number[][]>;
const rawAbbrs = starSource.constellations as string[];
const rawStars = starSource.stars as number[][];
const rawLabels = starSource.labels as string[][];

/* ------------------------------------------------------------- 1. đủ 88 chòm, khớp abbr */
{
  if (rawMeta.length !== 88) fail("meta", `có ${rawMeta.length} chòm sao, chờ đúng 88`);
  ok();

  const metaAbbrs = new Set(rawMeta.map((meta) => meta.abbr));
  if (metaAbbrs.size !== rawMeta.length) fail("meta", "có abbr trùng trong meta");
  ok();

  // Khoá đường nối phải phủ đúng tập abbr của meta (cả hai chiều).
  const lineKeys = new Set(Object.keys(rawLines));
  for (const abbr of metaAbbrs) {
    if (!lineKeys.has(abbr)) fail("đường nối", `chòm ${abbr} thiếu đường nối`);
    else ok();
  }
  for (const key of lineKeys) {
    if (!metaAbbrs.has(key)) fail("đường nối", `khoá "${key}" không tồn tại trong meta`);
    else ok();
  }

  // Danh sách chòm bên catalogue sao phải là chính tập 88 abbr này.
  const starAbbrs = new Set(rawAbbrs);
  if (starAbbrs.size !== rawAbbrs.length) fail("catalogue", "stars.constellations có abbr trùng");
  ok();
  if (starAbbrs.size !== 88) fail("catalogue", `stars.constellations có ${starAbbrs.size} chòm, chờ 88`);
  ok();
  for (const abbr of starAbbrs) {
    if (!metaAbbrs.has(abbr)) fail("catalogue", `abbr "${abbr}" trong catalogue không có trong meta`);
    else ok();
  }
  for (const abbr of metaAbbrs) {
    if (!starAbbrs.has(abbr)) fail("catalogue", `meta có "${abbr}" nhưng catalogue thiếu`);
    else ok();
  }

  // Chòm nào cũng phải có ít nhất một dải nối ≥2 đỉnh, không chòm "rỗng".
  for (const [abbr, polylines] of Object.entries(rawLines)) {
    const drawable = polylines.filter((flat) => flat.length >= 4);
    if (drawable.length === 0) fail("đường nối", `${abbr} không có dải nào vẽ được (≥2 đỉnh)`);
    else ok();
  }
}

/* ---------------------------------------------------------------------- 2. meta hợp lệ */
{
  for (const meta of rawMeta) {
    if (!meta.latin || !meta.vi) fail("meta", `${meta.abbr}: thiếu tên Latin hoặc tiếng Việt`);
    ok();
    if (!(meta.ra >= -180 && meta.ra <= 180 && meta.dec >= -90 && meta.dec <= 90)) {
      fail("meta", `${meta.abbr}: tâm (${meta.ra}, ${meta.dec}) ngoài thiên cầu`);
    }
    ok();
    if (!(meta.rank >= 1 && meta.rank <= 3)) fail("meta", `${meta.abbr}: rank ${meta.rank} ngoài 1–3`);
    ok();
  }
}

/* ----------------------------------------------------------- 3. từng sao trong catalogue */
{
  let badCoords = 0;
  let badConstellationIdx = 0;
  let badLabelIdx = 0;

  for (const row of rawStars) {
    const [ra, dec, mag, bv, labelIdx, constellationIdx] = row;
    if (!row.every(Number.isFinite) || !(ra >= -180 && ra <= 180 && dec >= -90 && dec <= 90)) badCoords += 1;
    if (!(constellationIdx >= -1 && constellationIdx < rawAbbrs.length)) badConstellationIdx += 1;
    if (!(labelIdx >= -1 && labelIdx < rawLabels.length)) badLabelIdx += 1;
  }

  if (badCoords) fail("sao", `${badCoords} sao có toạ độ/cấp sao không hợp lệ`);
  ok();
  if (badConstellationIdx) fail("sao", `${badConstellationIdx} sao có chỉ số chòm ngoài mảng (${rawAbbrs.length} phần tử)`);
  ok();
  if (badLabelIdx) fail("sao", `${badLabelIdx} sao có chỉ số nhãn ngoài mảng (${rawLabels.length} phần tử)`);
  ok();

  // Qua lớp STARS của app: mọi chòm gán cho sao phải giải được về abbr có trong meta.
  const metaAbbrs = new Set(rawMeta.map((meta) => meta.abbr));
  for (const star of STARS) {
    if (star.constellationAbbr !== null && !metaAbbrs.has(star.constellationAbbr)) {
      fail("sao", `sao #${star.index} gán chòm lạ "${star.constellationAbbr}"`);
    }
    ok();
    if (star.constellationAbbr !== null && star.constellationVi === null) {
      fail("sao", `sao #${star.index} có chòm ${star.constellationAbbr} nhưng thiếu tên tiếng Việt`);
    }
    ok();
  }

  // Catalogue đủ dày để vẽ bầu trời bằng mắt thường (giới hạn cấp 6).
  if (rawStars.length < 4000) fail("sao", `catalogue chỉ có ${rawStars.length} sao (chờ ≥ 4000 tới cấp 6)`);
  ok();
}

/* ---------------------------------------------------------- 4+5. hình học & liên kết đỉnh */
{
  let vertices = 0;
  let segments = 0;
  let longSegments = 0;
  let matchedNear = 0; // đỉnh khớp sao trong 0.5°
  let matchedFar = 0; // đỉnh không tìm được sao nào trong 5°
  let matchedWrongConstellation = 0; // đỉnh khớp sao nhưng sao thuộc chòm khác
  let matchedWithConstellation = 0; // đỉnh khớp gần mà sao gần nhất có gán chòm

  for (const [abbr, polylines] of Object.entries(rawLines)) {
    for (const flat of polylines) {
      if (flat.length < 4 || flat.length % 2 !== 0) {
        fail("đường nối", `${abbr}: dải có ${flat.length} toạ độ (cần chẵn và ≥ 4)`);
        continue;
      }
      ok();

      for (let i = 0; i < flat.length; i += 2) {
        const ra = flat[i];
        const dec = flat[i + 1];
        if (!(ra >= -180 && ra <= 180 && dec >= -90 && dec <= 90)) {
          fail("đường nối", `${abbr}: đỉnh (${ra}, ${dec}) ngoài thiên cầu`);
        }
        ok();
        vertices += 1;

        // Tìm sao gần nhất trong catalogue.
        let bestDistance = Number.POSITIVE_INFINITY;
        let bestStar = -1;
        for (let s = 0; s < rawStars.length; s += 1) {
          const distance = angularSep(ra, dec, rawStars[s][0], rawStars[s][1]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestStar = s;
          }
        }

        if (bestDistance <= 0.5) matchedNear += 1;
        if (bestDistance > 5) matchedFar += 1;
        // Ngưỡng 0.35°: đủ chặt để chắc chắn là cùng một sao, đủ lỏng cho sai số làm tròn.
        if (bestDistance <= 0.35 && bestStar >= 0 && rawStars[bestStar][5] >= 0) {
          matchedWithConstellation += 1;
          if (rawAbbrs[rawStars[bestStar][5]] !== abbr) matchedWrongConstellation += 1;
        }
      }

      for (let i = 2; i < flat.length; i += 2) {
        segments += 1;
        const length = angularSep(flat[i - 2], flat[i - 1], flat[i], flat[i + 1]);
        if (length > 30) {
          fail("đường nối", `${abbr}: đoạn dài bất thường ${length.toFixed(1)}° (khả năng nối nhầm sao)`);
          longSegments += 1;
        }
        ok();
      }
    }
  }

  const nearRatio = matchedNear / vertices;
  if (nearRatio < 0.98) {
    fail("đỉnh", `chỉ ${matchedNear}/${vertices} đỉnh (${(nearRatio * 100).toFixed(1)}%) khớp sao trong 0.5°, chờ ≥ 98%`);
  }
  ok();
  if (matchedFar > 0) fail("đỉnh", `${matchedFar} đỉnh không có sao catalogue nào trong bán kính 5°`);
  ok();

  // Cho phép ≤5% đỉnh "mượn" sao của chòm lân cận theo chuẩn đường nối IAU.
  const wrongRatio = matchedWithConstellation ? matchedWrongConstellation / matchedWithConstellation : 0;
  if (wrongRatio > 0.05) {
    fail("đỉnh", `${matchedWrongConstellation}/${matchedWithConstellation} đỉnh khớp sao thuộc chòm khác (${(wrongRatio * 100).toFixed(1)}% > 5%)`);
  }
  ok();

  if (segments < 700) fail("đường nối", `chỉ có ${segments} đoạn nối (chờ ≥ 700 cho 88 chòm)`);
  ok();
  if (longSegments) ok(); // đã fail ở trên
}

/* -------------------------------------------------------------- 6. sao nổi tiếng đúng chòm */
{
  const FAMOUS: Array<[string, string]> = [
    ["Sirius", "CMa"], ["Polaris", "UMi"], ["Vega", "Lyr"], ["Betelgeuse", "Ori"], ["Rigel", "Ori"],
    ["Antares", "Sco"], ["Aldebaran", "Tau"], ["Regulus", "Leo"], ["Spica", "Vir"], ["Fomalhaut", "PsA"],
    ["Canopus", "Car"], ["Achernar", "Eri"], ["Procyon", "CMi"], ["Altair", "Aql"], ["Deneb", "Cyg"],
    ["Arcturus", "Boo"], ["Capella", "Aur"], ["Castor", "Gem"], ["Pollux", "Gem"], ["Acrux", "Cru"],
    ["Alpheratz", "And"], ["Hamal", "Ari"], ["Denebola", "Leo"], ["Alphard", "Hya"], ["Rasalhague", "Oph"],
    ["Shaula", "Sco"], ["Nunki", "Sgr"], ["Kaus Australis", "Sgr"], ["Markab", "Peg"], ["Scheat", "Peg"],
    ["Algol", "Per"], ["Mirfak", "Per"], ["Alhena", "Gem"], ["Saiph", "Ori"], ["Bellatrix", "Ori"],
    ["Alnilam", "Ori"], ["Mintaka", "Ori"], ["Alnitak", "Ori"], ["Alioth", "UMa"], ["Dubhe", "UMa"],
    ["Alkaid", "UMa"], ["Mizar", "UMa"], ["Thuban", "Dra"], ["Gacrux", "Cru"], ["Mimosa", "Cru"]
  ];

  for (const [name, expected] of FAMOUS) {
    // Ưu tiên bản sáng nhất nếu tên xuất hiện ở nhiều mục (vd Marfak).
    const candidates = STARS.filter((star) => star.alternatives.includes(name));
    const star = candidates.sort((a, b) => a.mag - b.mag)[0];
    if (!star) {
      fail("sao nổi tiếng", `không tìm thấy "${name}" trong catalogue`);
      continue;
    }
    ok();
    if (star.constellationAbbr !== expected) {
      fail(
        "sao nổi tiếng",
        `${name} phải thuộc ${expected} (${constellationName(expected)}), catalogue ghi ${star.constellationAbbr ?? "(không gán)"}`
      );
    }
    ok();
  }
}

/* ---------------------------------------------------------------------- 7. nhãn hiển thị */
{
  // constellationName phải giải được cả 88 abbr (rơi về tiếng Việt).
  for (const meta of rawMeta) {
    const resolved = constellationName(meta.abbr);
    if (!resolved || resolved !== meta.vi) fail("nhãn", `${meta.abbr}: constellationName trả về "${resolved}", chờ "${meta.vi}"`);
    else ok();
  }
  if (!near(CONSTELLATION_META.length, 88, 0)) fail("nhãn", "CONSTELLATION_META không đủ 88 chòm");
  ok();
  if (Object.keys(CONSTELLATION_LINES).length !== 88) fail("nhãn", "CONSTELLATION_LINES không đủ 88 chòm");
  ok();
}

console.log(`\n${failures ? "✘" : "✔"} Liên kết chòm sao: ${checks.toLocaleString("vi-VN")} phép kiểm, ${failures} lỗi.`);
if (failures) process.exit(1);
