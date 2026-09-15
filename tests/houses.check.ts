/**
 * Kiểm chứng bảng nhà của app với bản tham chiếu sinh từ Swiss Ephemeris 2.10.
 *
 *   npm run test:houses
 *
 * Bản tham chiếu: tests/fixtures/houses-swisseph.json (sinh bằng C: swe_houses_armc() với
 * obliquity 23.4393, ARMC 0..315 bước 45°, vĩ độ -66..66). Xem tests/gen/houses-ref.c.
 */

import fs from "node:fs";
import { computeHouses, type HouseSystemId } from "../src/lib/houses.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/houses-swisseph.json", import.meta.url), "utf8"));

const SYSTEM_MAP = {
  A: "equal",
  D: "equalMC",
  B: "alcabitius",
  C: "campanus",
  K: "koch",
  M: "morinus",
  N: null, // whole sign tính từ 0° Bạch Dương - không dùng làm mặc định
  O: "porphyry",
  P: "placidus",
  R: "regiomontanus",
  S: "sripati",
  T: "topocentric",
  W: "wholeSign"
};

const eps = fixture.obliquity;
const stats = new Map();
const failures = [];

const wrap = (value) => ((value % 360) + 360) % 360;
const angularDiff = (a, b) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};

for (const record of fixture.records) {
  const system = SYSTEM_MAP[record.s];
  if (!system) continue;

  const result = computeHouses(system, record.a, record.l, eps);
  const checks = [
    ["asc", result.ascendant, record.asc],
    ["mc", result.midheaven, record.mc],
    ["vertex", result.vertex, record.vx],
    ["eastPoint", result.eastPoint, record.eq]
  ];
  result.cusps.forEach((cusp, index) => checks.push([`cusp${index + 1}`, cusp, record.c[index]]));

  for (const [label, mine, reference] of checks) {
    const error = angularDiff(mine, reference);
    const key = `${system}.${label.replace(/\d+$/, "")}`;
    const current = stats.get(key) ?? { max: 0, where: "" };
    if (error > current.max) {
      stats.set(key, { max: error, where: `ARMC ${record.a}, lat ${record.l}, house ${label}` });
    }
    if (error > 0.01) {
      failures.push({ system, label, armc: record.a, lat: record.l, mine: Number(mine.toFixed(4)), reference, error: Number(error.toFixed(4)) });
    }
  }
}

const rows = [...stats.entries()]
  .map(([key, value]) => ({ key, max: value.max, where: value.where }))
  .sort((a, b) => b.max - a.max);

console.log("Sai số lớn nhất so với Swiss Ephemeris (độ):");
for (const row of rows) {
  console.log(`  ${row.key.padEnd(22)} ${row.max.toExponential(2)}  ${row.max > 0.001 ? `← ${row.where}` : ""}`);
}

const worst = rows[0]?.max ?? 0;
console.log(`\nTổng số phép so sánh: ${stats.size * 728} điểm đo; sai số lớn nhất ${worst.toExponential(3)}°`);

if (failures.length) {
  console.log(`\n✘ ${failures.length} điểm lệch > 0.01°:`);
  for (const failure of failures.slice(0, 20)) {
    console.log(
      `  ${failure.system} ${failure.label} @ ARMC ${failure.armc}°, lat ${failure.lat}°: app ${failure.mine}° vs SE ${failure.reference}° (lệch ${failure.error}°)`
    );
  }
  process.exitCode = 1;
} else {
  console.log("✔ Tất cả 12 hệ nhà khớp Swiss Ephemeris trong sai số 0.01°.");
}
