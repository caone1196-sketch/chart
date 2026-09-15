/**
 * Sinh bản tham chiếu âm lịch Việt Nam cho tests/lunar.check.ts.
 *
 * Nguồn: gói `amlich` 0.0.2 — bản cài đặt thuật toán của Hồ Ngọc Đức (Meeus, "Astronomical Algorithms"),
 * là bản được nhiều phần mềm lịch Việt Nam dùng. Múi giờ +7.
 *
 *   npm run gen:lunar
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { convertSolar2Lunar } = require("amlich");

const pad = (n) => String(n).padStart(2, "0");
const iso = (d, m, y) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (m, y) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const months = [];
const tet = [];
for (let year = 1900; year <= 2100; year += 1) {
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= daysInMonth(month, year); day += 1) {
      const [ld, lm, ly, leap] = convertSolar2Lunar(day, month, year, 7);
      if (ld === 1) {
        months.push([iso(day, month, year), lm, ly, leap]);
        if (lm === 1 && !leap) tet.push(iso(day, month, year));
      }
    }
  }
}
const out = {
  source: "amlich 0.0.2 (thuật toán Hồ Ngọc Đức, Meeus 1998) — convertSolar2Lunar(dd, mm, yyyy, 7)",
  range: ["1900-01-01", "2100-12-31"],
  months,
  tet
};
fs.writeFileSync(new URL("../fixtures/lunar-vn-reference.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`Đã ghi tests/fixtures/lunar-vn-reference.json: ${months.length} tháng âm lịch, ${tet.length} ngày Tết.`);
