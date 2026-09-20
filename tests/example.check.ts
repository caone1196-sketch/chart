/**
 * Kiểm chứng ví dụ cụ thể: sinh 11/11/1996 lúc 00:30 (giờ Việt Nam, UTC+7) tại Hà Nội.
 *
 * Mốc quy đổi: 11/11/1996 00:30 UTC+7 = 10/11/1996 17:30 UT = JD 2450398.22917.
 * Bản tham chiếu: tests/fixtures/example-1996-swisseph.json, sinh trực tiếp từ Swiss Ephemeris 2.10
 * bằng tests/gen/example-ref.c (swe_calc_ut + swe_houses).
 *
 * App chỉ còn một chuẩn duy nhất (hoàng đạo nhiệt đới + nhà Whole Sign) nên bài kiểm
 * chỉ so 10 hành tinh, Cung Mọc/Thiên Đỉnh và 12 cusp Whole Sign.
 *
 *   npm run test:example
 */
import fs from "node:fs";
import { calcObliquity, calculateChart, computePlanetLongitudes, localSiderealDegrees, normalizeDegree } from "../src/lib/astro.ts";
import { ZODIAC_SIGNS } from "../src/lib/astro.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/example-1996-swisseph.json", import.meta.url), "utf8"));

/* ---------------------------------------------------------------- thông tin ví dụ */

const LAT = 21.0285; // Hà Nội
const LON = 105.8542;
const OFFSET = 7; // UTC+7 (Việt Nam, không có DST từ 1975)
const LOCAL = { date: "1996-11-11", time: "00:30" };

// 11/11/1996 00:30 UTC+7 → 10/11/1996 17:30 UT
const utcDate = new Date(Date.UTC(1996, 10, 10, 17, 30));
const jd = utcDate.getTime() / 86400000 + 2440587.5;

const wrap = (value: number) => ((value % 360) + 360) % 360;
const angDiff = (a: number, b: number) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};

const rows: Array<{ label: string; mine: number; reference: number; tol: number }> = [];
const problems: string[] = [];

const compare = (label: string, mine: number, reference: number, tol: number) => {
  const error = angDiff(mine, reference);
  rows.push({ label, mine, reference, tol });
  if (error > tol) problems.push(`${label}: app ${mine.toFixed(6)}° vs SE ${reference.toFixed(6)}° — lệch ${error.toFixed(4)}° > ${tol}°`);
};

/* -------------------------------------------------- 1. JD quy đổi & hằng số đầu vào */

if (Math.abs(jd - fixture.jd_ut) > 1e-4) problems.push(`JD quy đổi sai: ${jd} vs fixture ${fixture.jd_ut}`);

/* -------------------------------------------------------------- 2. 10 hành tinh */

// Sai số còn lại là do lý thuyết hành tinh khác nhau: astronomy-engine dùng VSOP87/Moshier rút gọn,
// Swiss Ephemeris dùng DE431 — lệch cỡ vài phần trăm độ với hành tinh ngoài là bình thường.
const TOL_PLANET: Record<string, number> = { moon: 0.03, mercury: 0.03, venus: 0.03, mars: 0.03, jupiter: 0.03, saturn: 0.03, uranus: 0.03, neptune: 0.03, pluto: 0.03 };
const referenceBodies = new Map(fixture.bodies.map((body: { name: string; lon: number }) => [body.name, body.lon]));

const appPlanets = new Map(computePlanetLongitudes(utcDate).map((planet) => [planet.key, planet.longitude]));
for (const [key, longitude] of appPlanets) {
  compare(`hành tinh ${key}`, longitude, referenceBodies.get(key) as number, TOL_PLANET[key] ?? 0.01);
}

/* --------------------------------------------------- 3. Cung Mọc, Thiên Đỉnh, nhà Whole Sign */

const chart = calculateChart(utcDate, LAT, LON, "Hà Nội, Việt Nam", "Asia/Ho_Chi_Minh", OFFSET);
const reference = fixture.houses.find((house: { id: string }) => house.id === "wholeSign") as {
  asc: number;
  mc: number;
  armc: number;
  cusps: number[];
};

const armc = localSiderealDegrees(utcDate, LON);
void calcObliquity(utcDate);
compare("Whole Sign · ARMC", armc, reference.armc as number, 0.01);
compare("Whole Sign · Cung Mọc", chart.ascendant, reference.asc, 0.01);
compare("Whole Sign · Thiên Đỉnh", chart.midheaven, reference.mc, 0.01);
chart.houses.forEach((house, index) => compare(`Whole Sign · nhà ${index + 1}`, house.cusp, reference.cusps[index], 0.01));

/* ------------------------------------------- 4. Dữ liệu bản đồ hoàn chỉnh của app */

const sun = chart.planets.find((planet) => planet.key === "sun")!;
const moon = chart.planets.find((planet) => planet.key === "moon")!;
const signOf = (longitude: number) => ZODIAC_SIGNS[Math.floor(normalizeDegree(longitude) / 30)];
const dms = (longitude: number) => {
  const within = normalizeDegree(longitude) % 30;
  const degrees = Math.floor(within);
  const minutes = Math.round((within - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
};

// Chốt lại vài dữ kiện của ví dụ để chống hồi quy
const EXPECTED = {
  sunSign: "Bọ Cạp",
  sunDegree: "18°36'",
  moonSign: "Bọ Cạp",
  ascendantSign: "Xử Nữ",
  midheavenSign: "Song Tử"
};
if (signOf(sun.longitude).name !== EXPECTED.sunSign) problems.push(`Mặt Trời phải ở ${EXPECTED.sunSign}, app tính ${signOf(sun.longitude).name}`);
if (signOf(moon.longitude).name !== EXPECTED.moonSign) problems.push(`Mặt Trăng phải ở ${EXPECTED.moonSign}, app tính ${signOf(moon.longitude).name}`);
if (signOf(chart.ascendant).name !== EXPECTED.ascendantSign) problems.push(`Cung Mọc phải ở ${EXPECTED.ascendantSign}, app tính ${signOf(chart.ascendant).name}`);
if (signOf(chart.midheaven).name !== EXPECTED.midheavenSign) problems.push(`Thiên Đỉnh phải ở ${EXPECTED.midheavenSign}, app tính ${signOf(chart.midheaven).name}`);
if (dms(sun.longitude) !== EXPECTED.sunDegree) problems.push(`Mặt Trời phải ở ${EXPECTED.sunDegree}, app tính ${dms(sun.longitude)}`);
if (chart.planets.filter((planet) => planet.retrograde).length === 0) problems.push("Bản đồ này phải có hành tinh nghịch hành");
if (sun.house !== 3 || moon.house !== 3) problems.push(`Mặt Trời/Mặt Trăng Whole Sign phải ở nhà 3, app tính ${sun.house}/${moon.house}`);

/* ------------------------------------------------------------------- 5. Báo cáo */

const worstOf = (filter: (label: string) => boolean) =>
  rows.filter((row) => filter(row.label)).reduce((max, row) => Math.max(max, angDiff(row.mine, row.reference)), 0);

console.log(`Kiểm chứng ví dụ: 11/11/1996 00:30 (UTC+7) — Hà Nội (21,0285°B 105,8542°Đ)`);
console.log(`Quy đổi: ${LOCAL.date} ${LOCAL.time} UTC+7 = 10/11/1996 17:30 UT = JD ${jd.toFixed(5)} (khớp fixture ${fixture.jd_ut})`);
console.log(`Sai số lớn nhất — hành tinh: ${worstOf((l) => l.startsWith("hành tinh")).toFixed(5)}° · nhà Whole Sign: ${worstOf((l) => l.startsWith("Whole Sign")).toFixed(5)}°`);
console.log(`Tổng số phép so sánh: ${rows.length}`);
console.log("Tám mục lệch nhiều nhất so với Swiss Ephemeris:");
for (const row of rows
  .map((row) => ({ ...row, error: angDiff(row.mine, row.reference) }))
  .sort((a, b) => b.error - a.error)
  .slice(0, 8)) {
  console.log(`  ${row.label.padEnd(26)} app ${row.mine.toFixed(5)}° · SE ${row.reference.toFixed(5)}° · lệch ${row.error.toFixed(5)}°`);
}
console.log(
  `Bản đồ: Mặt Trời ${EXPECTED.sunDegree} ${signOf(sun.longitude).name} (nhà ${sun.house}) · Mặt Trăng ${dms(moon.longitude)} ${signOf(moon.longitude).name} (nhà ${moon.house}) · Cung Mọc ${dms(chart.ascendant)} ${signOf(chart.ascendant).name} · Thiên Đỉnh ${dms(chart.midheaven)} ${signOf(chart.midheaven).name}`
);

if (problems.length) {
  console.log(`\n✘ ${problems.length} vấn đề:`);
  for (const problem of problems.slice(0, 20)) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    "\n✔ Ví dụ 11/11/1996 khớp Swiss Ephemeris trong mọi ngưỡng đã đặt: hành tinh ≤ 0,03° (khác lý thuyết quỹ đạo), " +
      "Cung Mọc/Thiên Đỉnh/nhà Whole Sign ≤ 0,01°."
  );
}
