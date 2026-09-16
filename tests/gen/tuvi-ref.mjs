/**
 * Sinh bản tham chiếu Tử Vi Đẩu Số cho tests/tuvi.check.ts bằng thư viện độc lập `iztro`.
 *
 * iztro (紫微斗数) là thư viện Tử Vi viết bằng TypeScript, tự tính lá số từ ngày dương lịch:
 * Ngũ Hành Cục, 12 cung + can chi, 14 chính tinh, phụ tinh và Tứ Hóa. Đây là nguồn đối chiếu
 * độc lập với phần an sao tự viết trong src/lib/chinese.ts.
 *
 * fixLeap = false: tháng nhuận giữ nguyên số tháng của nó (quy ước cổ điển mà app đang dùng).
 * iztro còn chế độ fixLeap = true: nửa đầu tháng nhuận tính là tháng trước, nửa sau tính là tháng sau —
 * app ghi chú khác biệt này trong lá số thay vì tự chọn thay người dùng.
 *
 *   npm run gen:tuvi
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { astro } = require("iztro");

const STAR_MAP = {
  紫微: "Tử Vi", 天机: "Thiên Cơ", 太阳: "Thái Dương", 武曲: "Vũ Khúc", 天同: "Thiên Đồng",
  廉贞: "Liêm Trinh", 天府: "Thiên Phủ", 太阴: "Thái Âm", 贪狼: "Tham Lang", 巨门: "Cự Môn",
  天相: "Thiên Tướng", 天梁: "Thiên Lương", 七杀: "Thất Sát", 破军: "Phá Quân",
  左辅: "Tả Phù", 右弼: "Hữu Bật", 文昌: "Văn Xương", 文曲: "Văn Khúc",
  天魁: "Thiên Khôi", 天钺: "Thiên Việt", 禄存: "Lộc Tồn",
  擎羊: "Kình Dương", 陀罗: "Đà La", 火星: "Hỏa Tinh", 铃星: "Linh Tinh",
  地空: "Địa Không", 地劫: "Địa Kiếp", 天马: "Thiên Mã"
};
const BRANCH_MAP = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const MUTAGEN_MAP = { 禄: "Lộc", 权: "Quyền", 科: "Khoa", 忌: "Kỵ" };

/** Sinh số giả ngẫu nhiên tất định để bản tham chiếu tái lập được. */
const lcg = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const CASES = 600;
const rand = lcg(20260916);
const cases = [];

while (cases.length < CASES) {
  const year = 1900 + Math.floor(rand() * 201);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const hourIndex = Math.floor(rand() * 12);
  const gender = rand() < 0.5 ? "nam" : "nữ";
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const chart = astro.bySolar(dateStr, hourIndex, gender === "nam" ? "男" : "女", false, "zh-CN");
  if (!chart?.palaces?.length) continue;

  const stars = {};
  for (const palace of chart.palaces) {
    const branch = BRANCH_MAP.indexOf(palace.earthlyBranch);
    const list = [...palace.majorStars, ...palace.minorStars]
      .filter((star) => STAR_MAP[star.name])
      .map((star) => `${STAR_MAP[star.name]}${star.mutagen ? `(${MUTAGEN_MAP[star.mutagen]})` : ""}`);
    if (list.length) stars[branch] = list;
  }

  const life = chart.palaces.find((palace) => palace.name === "命宫");
  const body = chart.palaces.find((palace) => palace.isBodyPalace);
  const raw = chart.rawDates.lunarDate;
  const stems = "甲乙丙丁戊己庚辛壬癸";
  const pillars = ["yearly", "monthly", "daily", "hourly"].map((key) => {
    const pair = chart.rawDates.chineseDate[key];
    return [stems.indexOf(pair[0]), BRANCH_MAP.indexOf(pair[1])];
  });
  cases.push({
    date: dateStr,
    hour: hourIndex,
    gender,
    lunarDay: raw.lunarDay,
    lunarMonth: raw.lunarMonth,
    lunarYear: raw.lunarYear,
    leap: raw.isLeap ? 1 : 0,
    pillars,
    bureau: Number(
      chart.fiveElementsClass.match(/[二三四五六]/)?.[0]?.replace(/[二三四五六]/, (c) => ({ 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 })[c]) ?? 0
    ),
    lifeBranch: BRANCH_MAP.indexOf(life.earthlyBranch),
    lifeStem: "甲乙丙丁戊己庚辛壬癸".indexOf(life.heavenlyStem),
    bodyBranch: BRANCH_MAP.indexOf(body.earthlyBranch),
    soul: chart.soul,
    bodyMaster: chart.body,
    stars
  });
}

const out = {
  source: "iztro (thư viện Tử Vi Đẩu Số độc lập) — astro.bySolar(date, hourIndex, gender, fixLeap=false)",
  caseCount: cases.length,
  cases
};
fs.writeFileSync(new URL("../fixtures/tuvi-iztro-reference.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`Đã ghi tests/fixtures/tuvi-iztro-reference.json: ${cases.length} ca sinh.`);
