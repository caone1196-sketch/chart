/**
 * Kiểm chứng ayanamsa của app với Swiss Ephemeris 2.10 (swe_get_ayanamsa_ut).
 *
 *   npm run test:ayanamsa
 */

import fs from "node:fs";
import { ayanamsa, type ZodiacFrameId } from "../src/lib/zodiac.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/ayanamsa-swisseph.json", import.meta.url), "utf8"));

const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);
const wrap = (value) => ((value % 360) + 360) % 360;
const angularDiff = (a, b) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};

const stats = new Map();
const rows = [];

for (const record of fixture.series) {
  const frame = record.m as ZodiacFrameId;
  const mine = ayanamsa(frame, jdToDate(record.jd));
  const error = angularDiff(mine, record.a);
  const current = stats.get(frame) ?? { max: 0, sum: 0, count: 0, worstYear: 0 };
  current.sum += error;
  current.count += 1;
  if (error > current.max) {
    current.max = error;
    current.worstYear = Math.round(2000 + (record.jd - 2451545) / 365.25);
  }
  stats.set(frame, current);
  rows.push({ frame, jd: record.jd, mine, reference: record.a, error });
}

console.log("Ayanamsa: so sánh với Swiss Ephemeris (1800-2100)");
const worstRows = [...stats.entries()].map(([frame, value]) => ({ frame, ...value })).sort((a, b) => b.max - a.max);

for (const row of worstRows) {
  console.log(
    `  ${row.frame.padEnd(15)} lệch TB ${(row.sum / row.count).toFixed(4)}° · lớn nhất ${row.max.toFixed(4)}° (năm ${row.worstYear})`
  );
}

const worst = worstRows[0];
const limit = 0.05;
if (worst.max > limit) {
  console.log(`\n✘ ${worst.frame} lệch ${worst.max.toFixed(4)}° > ngưỡng ${limit}°`);
  process.exitCode = 1;
} else {
  console.log(`\n✔ Tất cả hệ hoàng đạo lệch dưới ${limit}° so với Swiss Ephemeris (chênh lệch do mô hình tuế sai IAU1976 vs Newcomb của từng trường phái).`);
}
