/**
 * Kiểm chứng âm lịch Việt Nam (src/lib/lunar.ts) với bản tham chiếu độc lập.
 *
 * Bản tham chiếu: tests/fixtures/lunar-vn-reference.json — sinh từ gói `amlich` 0.0.2
 * (thuật toán Hồ Ngọc Đức, Meeus "Astronomical Algorithms"), múi giờ +7:
 * mọi ngày mùng 1 trong 1900–2100 kèm số tháng, năm âm lịch, cờ tháng nhuận và danh sách ngày Tết.
 *
 *   npm run test:lunar
 */
import fs from "node:fs";
import { lunarForBirth, lunarFromDate, monthLength } from "../src/lib/lunar.ts";

const reference = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/lunar-vn-reference.json", import.meta.url), "utf8"));

type MonthRow = [string, number, number, number]; // [ngày mùng 1, tháng, năm âm lịch, nhuận]
const months: MonthRow[] = reference.months;
const tet: string[] = reference.tet;

/**
 * Ba trường hợp ĐÃ BIẾT là amlich lệch khỏi app, đều nằm sát nửa đêm nên chỉ vài chục giây quyết định:
 *
 *  1. 1938: bảng lịch Trung Quốc ghi 1938 là năm **nhuận tháng 7** (八月 bắt đầu 24/09/1938, 闰七月 bắt đầu 25/08/1938).
 *     Sóc: 25/08 18:17 và 24/09 03:33 giờ VN; Thu phân (Mặt Trời 180°) lúc **23:59:27 ngày 23/09 giờ VN**
 *     (Swiss Ephemeris) — chỉ 33 giây trước nửa đêm, sát ngưỡng quyết định tháng nhuận. amlich cho ra nhuận tháng 8.
 *  2. Sóc 09/12/2072 lúc **23:59:43 giờ VN** (SE) — 17 giây trước nửa đêm, amlich lệch 1 ngày.
 *  3. Sóc 19/10/2085 lúc **00:00:58 giờ VN** (SE) — 58 giây sau nửa đêm, amlich lệch 1 ngày.
 *
 * Cả ba đều được kiểm tra riêng bên dưới bằng giá trị app phải cho ra (kèm bằng chứng Swiss Ephemeris),
 * nên nếu engine đổi hành vi thì test vẫn bắt được.
 */
const KNOWN_DIVERGENCES: Record<string, string> = {
  "1938-08-25": "app: nhuận tháng 7 (đúng như lịch Trung Quốc 1938); amlich: nhuận tháng 8 — Thu phân 23/09 23:59:27 giờ VN",
  "1938-09-24": "app: mùng 1 tháng 8; amlich: mùng 1 tháng 8 nhuận — cùng lý do trên",
  "2072-12-09": "app: mùng 1 tháng 11 (sóc 09/12/2072 23:59:43 giờ VN); amlich: mùng 1 là 10/12",
  "2072-12-10": "app: mùng 2; amlich: mùng 1",
  "2085-10-19": "app: mùng 1 tháng 9 (sóc 19/10/2085 00:00:58 giờ VN); amlich: mùng 1 là 18/10",
  "2085-10-18": "app: ngày 30 tháng 8; amlich: mùng 1 tháng 9"
};
const isKnown = (iso: string) => KNOWN_DIVERGENCES[iso] !== undefined;

const problems: string[] = [];
let checks = 0;
let skipped = 0;
const dateFromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
const shift = (iso: string, days: number) => isoOf(new Date(dateFromIso(iso).getTime() + days * 86400000));
const localDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const expect = (label: string, got: unknown, want: unknown) => {
  checks += 1;
  if (got !== want) problems.push(`${label}: app ${got} ≠ tham chiếu ${want}`);
};

/* ------------------------------------------------- 1. mọi ngày mùng 1, 1900–2100 */

months.forEach((row, index) => {
  const [start, month, year, leap] = row;
  const lunar = lunarFromDate(...(start.split("-").map(Number) as [number, number, number]));
  if (isKnown(start) || isKnown(months[index + 1]?.[0] ?? "")) {
    skipped += 1;
    return;
  }
  expect(`${start} · ngày`, lunar.day, 1);
  expect(`${start} · tháng`, lunar.month, month);
  expect(`${start} · năm`, lunar.year, year);
  expect(`${start} · nhuận`, lunar.leap ? 1 : 0, leap);

  const next = months[index + 1]?.[0];
  if (next) {
    const length = Math.round((dateFromIso(next).getTime() - dateFromIso(start).getTime()) / 86400000);
    expect(`${start} · độ dài tháng`, monthLength(lunar), length);
    for (const offset of [1, 7, 14, length - 1]) {
      const day = offset + 1;
      const sample = lunarFromDate(...(shift(start, offset).split("-").map(Number) as [number, number, number]));
      expect(`mùng 1 ${start} +${offset} ngày · ngày`, sample.day, day);
      expect(`mùng 1 ${start} +${offset} ngày · tháng`, sample.month, month);
    }
  }
});

/* ------------------------------------------------------------------ 2. ngày Tết */

for (const date of tet) {
  const lunar = lunarFromDate(...(date.split("-").map(Number) as [number, number, number]));
  expect(`Tết ${date} · ngày`, lunar.day, 1);
  expect(`Tết ${date} · tháng`, lunar.month, 1);
  expect(`Tết ${date} · nhuận`, lunar.leap ? 1 : 0, 0);
}

/* --------------------------------------- 2b. các trường hợp đã biết amlich lệch */

const divergenceChecks: Array<[string, Partial<{ day: number; month: number; year: number; leap: boolean }>]> = [
  ["1938-08-25", { day: 1, month: 7, year: 1938, leap: true }],
  ["1938-09-24", { day: 1, month: 8, leap: false }],
  ["2072-12-09", { day: 1, month: 11, leap: false }],
  ["2072-12-10", { day: 2 }],
  ["2085-10-19", { day: 1, month: 9, leap: false }],
  ["2085-10-18", { day: 30, month: 8 }]
];
for (const [date, want] of divergenceChecks) {
  const lunar = lunarFromDate(...(date.split("-").map(Number) as [number, number, number]));
  for (const [field, value] of Object.entries(want)) {
    expect(`${date} (đã biết lệch amlich) · ${field}`, (lunar as never)[field as never], value);
  }
}

/* ------------------------------------------- 3. mốc công khai & ví dụ 11/11/1996 */

const knownTet: Array<[string, number]> = [
  ["1996-02-19", 1996],
  ["1997-02-07", 1997],
  ["1998-01-28", 1998],
  ["2024-02-10", 2024],
  ["2025-01-29", 2025]
];
for (const [date, year] of knownTet) {
  const lunar = lunarFromDate(...(date.split("-").map(Number) as [number, number, number]));
  expect(`Tết ${date} (đã biết) · ngày`, lunar.day, 1);
  expect(`Tết ${date} (đã biết) · tháng`, lunar.month, 1);
  expect(`Tết ${date} (đã biết) · năm`, lunar.year, year);
}

const birth = lunarFromDate(1996, 11, 11);
expect("11/11/1996 · ngày", birth.day, 1);
expect("11/11/1996 · tháng", birth.month, 10);
expect("11/11/1996 · năm", birth.year, 1996);
expect("10/11/1996 · ngày", lunarFromDate(1996, 11, 10).day, 30);

// Ca sinh từ 23 giờ tính sang ngày hôm sau (giờ Tý bắt đầu từ 23 giờ).
const lateZi = lunarForBirth(localDate("1996-11-10"), 23);
expect("23:30 ngày 10/11/1996 · ngày", lateZi.day, 1);
expect("23:30 ngày 10/11/1996 · tháng", lateZi.month, 10);
expect("23:30 ngày 10/11/1996 · đánh dấu dịch ngày", lateZi.shiftedToNextDay, true);
const earlyZi = lunarForBirth(localDate("1996-11-11"), 0);
expect("00:30 ngày 11/11/1996 · ngày", earlyZi.day, 1);
expect("00:30 ngày 11/11/1996 · không dịch ngày", earlyZi.shiftedToNextDay, false);

/* ------------------------------------------------------------------- 4. báo cáo */

console.log(`Kiểm chứng âm lịch Việt Nam so với amlich 0.0.2 (Hồ Ngọc Đức, Meeus)`);
console.log(`Phạm vi: ${reference.range[0]} → ${reference.range[1]} · ${months.length} tháng âm lịch · ${tet.length} ngày Tết`);
console.log(`Số phép so sánh: ${checks}`);
console.log(`Bỏ qua (đã kiểm tra riêng bên dưới): ${skipped} tháng quanh 4 ngày lệch amlich:`);
for (const [date, note] of Object.entries(KNOWN_DIVERGENCES)) console.log(`  · ${date}: ${note}`);

if (problems.length) {
  console.log(`\n✘ ${problems.length} điểm lệch:`);
  for (const problem of problems.slice(0, 20)) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    "\n✔ Mọi ngày mùng 1, độ dài tháng, tháng nhuận và ngày Tết 1900–2100 đều khớp bản tham chiếu amlich," +
      " trừ 4 ngày đã biết là lệch (đều sát nửa đêm) đã kiểm tra riêng bằng bằng chứng Swiss Ephemeris."
  );
}
