/** Kiểm chứng ý định vận hạn (timing) và lịch transit 12 tháng. */
import {
  buildChartReport,
  calculateChart,
  computeTransitCalendar,
  transitCalendarToLines
} from "../src/lib/astro.ts";
import { detectIntents } from "../src/lib/interpret.ts";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`  ✔ ${name}${detail ? ` (${detail})` : ""}`);
  }
};

console.log("Ý định vận hạn:");
const userQuestion = "trong thời gian này có ảnh hưởng gì tới tôi, có những sao nào đang tác động";
check("câu hỏi của người dùng ra timing", detectIntents(userQuestion).includes("timing"), userQuestion);
check("'tác động' không bị nhận nhầm thành AC", !detectIntents(userQuestion).includes("chart"));
check("'tác động của Thổ tinh' ra timing, không ra chart",
  detectIntents("tác động của Thổ tinh lên tôi thế nào").includes("timing") &&
  !detectIntents("tác động của Thổ tinh lên tôi thế nào").includes("chart"));
check("'AC của tôi ở cung nào' vẫn ra chart", detectIntents("AC của tôi ở cung nào").includes("chart"));
check("'Vận hạn 12 tháng tới theo transit?' ra timing",
  detectIntents("Vận hạn 12 tháng tới theo transit?").includes("timing"));
check("'năm nay tôi thế nào' ra timing", detectIntents("năm nay tôi thế nào").includes("timing"));
check("câu sao cố định vẫn ra fixedstar",
  detectIntents("Sao cố định nào đang chiếu vào Mặt Trời của tôi?").includes("fixedstar"));
check("câu tiểu hành tinh vẫn ra points (không bị timing/chart cướp)",
  detectIntents("Chiron và Lilith trong bản đồ của tôi ở đâu?").includes("points") &&
  !detectIntents("Chiron và Lilith trong bản đồ của tôi ở đâu?").includes("timing"));

console.log("Lịch transit 12 tháng:");
const chart = calculateChart(new Date(Date.UTC(1996, 10, 10, 17, 30)), 21.0278, 105.8342, "Hà Nội", "Asia/Ho_Chi_Minh", 7);
const start = new Date(Date.UTC(2026, 8, 20, 12));
const calendar = computeTransitCalendar(chart, start, 365);
const again = computeTransitCalendar(chart, start, 365);
check("số đợt chạm trong năm hợp lý", calendar.length > 20, `${calendar.length} đợt`);
check("không có transit Mặt Trăng", calendar.every((event) => event.transitKey !== "moon"));
check("ngày đỉnh nằm trong đợt chạm",
  calendar.every((event) => event.fromDate <= event.exactDate && event.exactDate <= event.toDate));
check("orb đỉnh trong ngưỡng 4°", calendar.every((event) => event.minOrb <= 4));
check("sắp xếp theo ngày bắt đầu", calendar.every((event, i) => i === 0 || calendar[i - 1].fromDate <= event.fromDate));
check("tất định (chạy 2 lần giống nhau)",
  calendar.length === again.length &&
  calendar.every((event, i) => event.exactDate.getTime() === again[i].exactDate.getTime() && event.minOrb === again[i].minOrb));
const months = new Set(calendar.map((event) => `${event.exactDate.getFullYear()}-${event.exactDate.getMonth()}`));
check("đỉnh điểm phủ khắp năm", months.size >= 10, `${months.size} tháng`);
const lines = transitCalendarToLines(calendar);
check("dòng báo cáo AI gọn (≤25)", lines.length <= 25, `${lines.length} dòng`);
check("hành tinh chậm được ưu tiên trước",
  lines.findIndex((line) => line.includes("Thổ Tinh")) !== -1);
const report = buildChartReport(chart, "Người dùng", "Vận hạn?", [], [], lines);
check("báo cáo gửi AI có mục lịch transit", report.includes("LỊCH TRANSIT 12 THÁNG TỚI"));

if (failures) {
  console.error(`\n✗ timing: ${failures} kiểm chứng hỏng.`);
  process.exit(1);
}
console.log("\n✔ timing: ý định vận hạn + lịch transit 12 tháng ổn định.");
