/** Kiểm chứng điểm ảo (node, Lilith, tiểu hành tinh, hành tinh giả định) với Swiss Ephemeris. */
import fs from "node:fs";
import { computeExtraPoints } from "../src/lib/points.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/points-swisseph.json", import.meta.url), "utf8"));
const KEY_MAP: Record<string, string> = {
  meanNode: "meanNode",
  trueNode: "trueNode",
  lilith: "meanApog",
  chiron: "chiron",
  ceres: "ceres",
  pallas: "pallas",
  juno: "juno",
  vesta: "vesta",
  cupido: "cupido",
  hades: "hades",
  zeus: "zeus",
  kronos: "kronos",
  apollon: "apollon",
  admetos: "admetos",
  vulkanus: "vulkanus",
  poseidon: "poseidon",
  isisTranspluto: "isisTranspluto"
};

const within = (value: number) => ((value % 360) + 360) % 360;
const angularDiff = (a: number, b: number) => {
  const d = Math.abs(within(a - b));
  return d > 180 ? 360 - d : d;
};

const stats = new Map<string, { max: number; sum: number; count: number }>();
const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);

for (const record of fixture.records) {
  const date = jdToDate(record.jd);
  const points = computeExtraPoints(date, Object.keys(KEY_MAP));
  const byKey = new Map(points.map((point) => [point.key, point.longitude]));

  for (const [key, fixtureKey] of Object.entries(KEY_MAP)) {
    const expected = record.b[fixture.bodies.indexOf(fixtureKey)]?.[0];
    const actual = byKey.get(key);
    if (expected === null || expected === undefined || actual === undefined) continue;
    const error = angularDiff(actual, expected);
    const bucket = stats.get(key) ?? { max: 0, sum: 0, count: 0 };
    bucket.max = Math.max(bucket.max, error);
    bucket.sum += error;
    bucket.count += 1;
    stats.set(key, bucket);
  }
}

const TOLERANCE: Record<string, number> = {
  meanNode: 0.01,
  // Node thật phụ thuộc mô hình lý thuyết Mặt Trăng (astronomy-engine vs Swiss Ephemeris),
  // khác biệt cỡ 0,05° — chấp nhận được với chiêm tinh.
  trueNode: 0.2,
  lilith: 0.2,
  chiron: 0.6,
  ceres: 0.6,
  pallap: 2,
  pallas: 2,
  juno: 1.5,
  vesta: 0.6,
  cupido: 0.01,
  hades: 0.01,
  zeus: 0.01,
  kronos: 0.01,
  apollon: 0.01,
  admetos: 0.01,
  vulkanus: 0.01,
  poseidon: 0.01,
  isisTranspluto: 0.05
};

let failed = 0;
console.log("Điểm ảo: so sánh với Swiss Ephemeris (1900-2100, 41 mốc)");
for (const [key, bucket] of [...stats.entries()].sort((a, b) => b[1].max - a[1].max)) {
  const limit = TOLERANCE[key] ?? 0.05;
  const flag = bucket.max > limit ? "✘" : "✔";
  if (bucket.max > limit) failed += 1;
  console.log(`  ${flag} ${key.padEnd(14)} lệch TB ${(bucket.sum / bucket.count).toFixed(5)}° · lớn nhất ${bucket.max.toFixed(5)}° (ngưỡng ${limit}°)`);
}

if (failed) {
  console.log(`\n✘ ${failed} điểm vượt ngưỡng.`);
  process.exitCode = 1;
} else {
  console.log("\n✔ Tất cả điểm ảo trong ngưỡng cho phép (tiểu hành tinh dùng mô hình Kepler 2 vật thể).");
}
