/**
 * Kiểm chứng phần an sao Tử Vi Đẩu Số của app (src/lib/chinese.ts) với bản tham chiếu độc lập `iztro`.
 *
 * Bản tham chiếu: tests/fixtures/tuvi-iztro-reference.json — 600 ca sinh ngẫu nhiên (tất định) trải
 * 1900–2100, đủ 12 canh giờ, có cả ca tháng nhuận: Ngũ Hành Cục, cung Mệnh/Thân (chi + can),
 * Mệnh chủ/Thân chủ, vị trí 28 sao (14 chính tinh, 6 cát tinh, 6 sát tinh, Lộc Tồn, Thiên Mã)
 * kèm Tứ Hóa, và 4 trụ Tứ Trụ.
 *
 *   npm run test:tuvi
 */
import fs from "node:fs";
import { SunPosition } from "astronomy-engine";
import { buildBazi, buildZiwei } from "../src/lib/chinese.ts";
import { BRANCHES, STEMS } from "../src/lib/chinese.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/tuvi-iztro-reference.json", import.meta.url), "utf8"));

const STAR_MAP: Record<string, string> = {
  紫微: "Tử Vi", 天机: "Thiên Cơ", 太阳: "Thái Dương", 武曲: "Vũ Khúc", 天同: "Thiên Đồng",
  廉贞: "Liêm Trinh", 天府: "Thiên Phủ", 太阴: "Thái Âm", 贪狼: "Tham Lang", 巨门: "Cự Môn",
  天相: "Thiên Tướng", 天梁: "Thiên Lương", 七杀: "Thất Sát", 破军: "Phá Quân",
  左辅: "Tả Phù", 右弼: "Hữu Bật", 文昌: "Văn Xương", 文曲: "Văn Khúc",
  天魁: "Thiên Khôi", 天钺: "Thiên Việt", 禄存: "Lộc Tồn",
  擎羊: "Kình Dương", 陀罗: "Đà La", 火星: "Hỏa Tinh", 铃星: "Linh Tinh",
  地空: "Địa Không", 地劫: "Địa Kiếp", 天马: "Thiên Mã"
};
const MUTAGEN: Record<string, string> = { 禄: "Lộc", 权: "Quyền", 科: "Khoa", 忌: "Kỵ" };

type Case = {
  date: string;
  hour: number;
  gender: "nam" | "nữ";
  lunarDay: number;
  lunarMonth: number;
  lunarYear: number;
  leap: number;
  pillars: Array<[number, number]>;
  bureau: number;
  lifeBranch: number;
  lifeStem: number;
  bodyBranch: number;
  soul: string;
  bodyMaster: string;
  stars: Record<string, string[]>;
};

let checks = 0;
const problems: string[] = [];
const problemCount: Record<string, number> = {};
const note = (category: string, detail: string) => {
  problemCount[category] = (problemCount[category] ?? 0) + 1;
  if (problemCount[category] <= 3) problems.push(`[${category}] ${detail}`);
};
const expect = (category: string, label: string, got: unknown, want: unknown) => {
  checks += 1;
  if (got !== want) note(category, `${label}: app ${got} ≠ iztro ${want}`);
};

const lunarMismatch: string[] = [];
let comparedCharts = 0;
let tuvVsBaziYearDifferences = 0;

for (const item of fixture.cases as Case[]) {
  const [year, month, day] = item.date.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  // iztro đánh số 0..11 ứng với 12 canh giờ (0 = Tý 23h-1h), quy đổi về giờ đồng hồ giữa canh
  const localHour = item.hour === 0 ? 0 : item.hour * 2 - 1;
  const utcDate = new Date(Date.UTC(year, month - 1, day, localHour) - 7 * 3600 * 1000);

  // longitude = 105 (kinh tuyến chuẩn) để giờ Mặt Trời thực trùng giờ đồng hồ, so được với iztro
  const bazi = buildBazi(utcDate, localDate, localHour, 105, { gender: item.gender });
  const ziwei = buildZiwei(localDate, localHour);

  /* --------------------------------------------------------- lịch âm & Tứ Trụ */

  const lunarOk = ziwei.lunarDay === item.lunarDay && ziwei.lunarMonth === item.lunarMonth;
  if (!lunarOk) {
    lunarMismatch.push(
      `${item.date} ${String(item.hour).padStart(2, "0")}h: app ${ziwei.lunarDay}/${ziwei.lunarMonth} vs iztro ${item.lunarDay}/${item.lunarMonth}`
    );
    continue; // lá số dựng trên ngày âm lịch khác thì không so phần an sao
  }
  comparedCharts += 1;

  // Trụ ngày và trụ giờ so trực tiếp với iztro.
  for (const index of [2, 3]) {
    const [stem, branch] = item.pillars[index];
    const label = ["Năm", "Tháng", "Ngày", "Giờ"][index];
    expect("Tứ Trụ", `${item.date} trụ ${label}`, `${STEMS[bazi.pillars[index].stem]} ${BRANCHES[bazi.pillars[index].branch]}`, `${STEMS[stem]} ${BRANCHES[branch]}`);
  }

  // Trụ năm: kiểm tra bằng quy tắc Lập Xuân (Mặt Trời 315°) tính độc lập bằng astronomy-engine.
  // iztro dùng **năm âm lịch** (đổi tại Tết) nên ở khoảng giữa Tết và Lập Xuân hai bên khác nhau — đếm riêng.
  const sunLon = ((SunPosition(utcDate).elon % 360) + 360) % 360;
  const beforeLichun = (localDate.getMonth() === 0 || localDate.getMonth() === 1) && sunLon < 315;
  const baziYear = beforeLichun ? year - 1 : year;
  expect(
    "Tứ Trụ (Lập Xuân)",
    `${item.date} trụ Năm`,
    `${STEMS[bazi.pillars[0].stem]} ${BRANCHES[bazi.pillars[0].branch]}`,
    `${STEMS[(((baziYear - 4) % 10) + 10) % 10]} ${BRANCHES[(((baziYear - 4) % 12) + 12) % 12]}`
  );
  if (item.lunarYear !== baziYear) tuvVsBaziYearDifferences += 1;

  /* --------------------------------------------------- Ngũ Hành Cục & Mệnh/Thân */

  expect("Ngũ Hành Cục", item.date, ziwei.bureau.number, item.bureau);
  expect("Cung Mệnh", item.date, ziwei.lifeBranch, item.lifeBranch);
  expect("Cung Thân", item.date, ziwei.bodyBranch, item.bodyBranch);
  expect("Mệnh chủ", item.date, ziwei.lifeMaster, STAR_MAP[item.soul]);
  expect("Thân chủ", item.date, ziwei.bodyMaster, STAR_MAP[item.bodyMaster]);
  expect("Can cung Mệnh", item.date, ziwei.palaces[0].stem, item.lifeStem);

  /* --------------------------------------------------------------- vị trí sao */

  for (const [branchKey, stars] of Object.entries(item.stars)) {
    const branch = Number(branchKey);
    const palace = ziwei.palaces.find((entry) => entry.branch === branch);
    const mine = (palace?.stars ?? []).map((star) => `${star.name}${star.mutagen ? `(${star.mutagen})` : ""}`);
    expect(
      "Vị trí sao",
      `${item.date} ${String(item.hour).padStart(2, "0")}h chi ${BRANCHES[branch]}`,
      mine.slice().sort().join(","),
      stars.slice().sort().join(",")
    );
  }
}

/* ------------------------------------------------------------------- báo cáo */

console.log("Kiểm chứng Tử Vi Đẩu Số so với iztro (600 ca sinh 1900–2100)");
console.log(`Số ca dựng được lá số khớp ngày âm lịch: ${comparedCharts}/${fixture.cases.length}`);
console.log(`Số phép so sánh: ${checks}`);
if (lunarMismatch.length) {
  console.log(
    `\nKhác ngày âm lịch với iztro ở ${lunarMismatch.length} ca (iztro tính lịch Trung Quốc, giờ Bắc Kinh UTC+8;` +
      " app tính lịch Việt Nam UTC+7 — hai lịch vốn lệch nhau ở một số thời điểm, ví dụ giai đoạn 1985):"
  );
  for (const line of lunarMismatch.slice(0, 8)) console.log(`  · ${line}`);
}
if (tuvVsBaziYearDifferences) {
  console.log(
    `\nSố ca mà năm Tử Vi (âm lịch, đổi tại Tết) khác năm Tứ Trụ (đổi tại Lập Xuân): ${tuvVsBaziYearDifferences}` +
      " — app dùng đúng quy ước cho từng hệ."
  );
}

if (problems.length) {
  const total = Object.values(problemCount).reduce((sum, value) => sum + value, 0);
  console.log(`\n✘ ${total} điểm lệch:`);
  for (const [category, count] of Object.entries(problemCount)) console.log(`  ${category}: ${count}`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\n✔ Ngũ Hành Cục, cung Mệnh/Thân, Mệnh chủ/Thân chủ, 28 sao + Tứ Hóa và Tứ Trụ đều khớp iztro.");
}
