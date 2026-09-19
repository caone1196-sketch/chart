/**
 * Kiểm chứng lớp "biến thể bản đồ sao": mọi hệ thống chạy được, số liệu nhất quán
 * giữa các hệ (nhà, hoàng đạo), và bộ trả lời nội bộ có nội dung cho câu hỏi biến thể.
 */
import { calculateChart } from "../src/lib/astro.ts";
import { buildVariantChart, compareHouseSystems, compareZodiacFrames, variantReport } from "../src/lib/chart-variants.ts";
import { answerLocally } from "../src/lib/interpret.ts";
import { computeSkySnapshot, findFixedStarHits, riseSetForDay } from "../src/lib/sky.ts";
import { HOUSE_SYSTEMS, computeHouses } from "../src/lib/houses.ts";
import { calcObliquity, localSiderealDegrees } from "../src/lib/astro.ts";
import type { ZodiacFrameId } from "../src/lib/zodiac.ts";

const problems: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) problems.push(message);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const wrap = (value: number) => ((value % 360) + 360) % 360;
const angDiff = (a: number, b: number) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};

/** Mốc kiểm tra: 08/03/1995 14:30 giờ Hà Nội (UTC+7) = 07:30 UTC. */
const utcDate = new Date(Date.UTC(1995, 2, 8, 7, 30));
const latitude = 21.0285;
const longitude = 105.8542;
const localDate = new Date(utcDate.getTime() + 7 * 3600 * 1000);
const localSidereal = (date: Date, longitude: number) => localSiderealDegrees(date, longitude);

for (const frame of ["tropical", "lahiri", "faganBradley", "raman", "krishnamurti", "deLuce", "galactic"] as ZodiacFrameId[]) {
  const chart = calculateChart(utcDate, latitude, longitude, "Hà Nội", "Asia/Ho_Chi_Minh", 7, {
    houseSystem: "wholeSign",
    zodiacFrame: frame
  });
  const variant = buildVariantChart({
    chart,
    localDate,
    localHour: 14.5,
    gender: "nữ",
    houseSystem: "placidus",
    zodiacFrame: frame
  });

  // --- hệ nhà
  check(variant.cusps.length === 12, `${frame}: phải có 12 cusp`);
  check(
    variant.cusps.every((cusp) => Number.isFinite(cusp) && cusp >= 0 && cusp < 360),
    `${frame}: cusp phải nằm trong 0..360`
  );
  const sameFrame = (a: number, b: number) => angDiff(a, b) < 1e-6;
  check(
    sameFrame(variant.cusps[0], chart.ascendant),
    `${frame}: cusp 1 của Placidus phải trùng Cung Mọc (${variant.cusps[0].toFixed(6)} vs ${chart.ascendant.toFixed(6)})`
  );
  const pl = compareHouseSystems(chart).find((entry) => entry.id === "placidus");
  check(Boolean(pl) && sameFrame(pl!.cusp1, chart.ascendant), `${frame}: bảng so sánh Placidus sai cusp 1`);

  // --- nhà của hành tinh khớp cusp
  for (const planet of chart.planets) {
    const fromCusps = variant.cusps.length
      ? (() => {
          for (let i = 0; i < 12; i += 1) {
            const start = variant.cusps[i];
            const span = wrap(variant.cusps[(i + 1) % 12] - start);
            if (wrap(variant.sidereal[planet.key] - start) < span) return i + 1;
          }
          return 1;
        })()
      : 1;
    check(variant.vedic.planets.find((item) => item.key === planet.key)!.house === fromCusps, `${frame}: nhà Vệ Đà của ${planet.key} không khớp cusp`);
  }

  // --- hoàng đạo
  if (frame !== "tropical") {
    check(variant.ayanamsaValue > 15 && variant.ayanamsaValue < 30, `${frame}: ayanamsa ngoài khoảng hợp lý (${variant.ayanamsaValue})`);
    check(sameFrame(variant.sidereal.ascendant, chart.ascendant), `${frame}: ascendant sidereal không khớp`);
    check(sameFrame(variant.sidereal.sun, chart.planets[0].longitude), `${frame}: kinh độ Mặt Trời sidereal không khớp giá trị hiển thị`);
    const frames2 = compareZodiacFrames(chart);
    const trop = frames2.find((entry) => entry.id === "tropical")!;
    const sid = frames2.find((entry) => entry.id === frame)!;
    check(trop.ayanamsa === 0, `${frame}: hệ nhiệt đới phải có ayanamsa 0`);
    check(typeof sid.sun === "string" && sid.sun.length > 0, `${frame}: thiếu tên cung trong bảng so sánh`);
  } else {
    check(variant.ayanamsaValue === 0, "tropical: ayanamsa phải bằng 0");
  }

  // --- cung của Mặt Trời theo bảng so sánh hệ hoàng đạo
  const frames = compareZodiacFrames(chart);
  check(frames.length === 7, `${frame}: bảng so sánh phải đủ 7 hệ hoàng đạo`);
  const current = frames.find((entry) => entry.id === frame)!;
  check(current.sun.length > 0 && current.moon.length > 0 && current.ascendant.length > 0, `${frame}: bảng so sánh thiếu tên cung`);
  check(angDiff(current.ayanamsa, variant.ayanamsaValue) < 1e-9, `${frame}: ayanamsa trong bảng khác giá trị tính`);

  // --- Vệ Đà, Trung Hoa, Maya, Human Design
  check(variant.vedic.dasha.length > 0 && variant.vedic.dasha.some((period) => period.isCurrent), `${frame}: dasha thiếu giai đoạn hiện tại`);
  const dashaSpan = variant.vedic.dasha.reduce((sum, period) => sum + (period.end.getTime() - period.start.getTime()), 0) / (365.2425 * 86400000);
  check(near(dashaSpan, 120, 3), `${frame}: tổng Vimshottari phải ~120 năm (${dashaSpan.toFixed(2)})`);
  check(variant.vedic.antara.length === 9, `${frame}: antardasha phải có 9 giai đoạn`);
  check(variant.vedic.vargas.length >= 4, `${frame}: phải có ít nhất 4 varga`);
  check(variant.chinese.bazi.pillars.length === 4, `${frame}: Tứ Trụ phải có 4 trụ`);
  check(variant.chinese.ziwei.palaces.length === 12, `${frame}: Tử Vi phải có 12 cung`);
  check(/^\d+\.\d+\.\d+\.\d+\.\d+$/.test(variant.chinese.mayan.longCount), `${frame}: Long Count sai định dạng (${variant.chinese.mayan.longCount})`);
  check(variant.design.personality.length === 13 && variant.design.design.length === 13, `${frame}: Human Design phải có 13 cổng mỗi bên`);
  check(
    variant.design.personality.every((gate) => gate.gate >= 1 && gate.gate <= 64 && gate.line >= 1 && gate.line <= 6),
    `${frame}: cổng/vạch Human Design ngoài khoảng`
  );
  check(variant.derived.harmonics.length === 5, `${frame}: phải có 5 bản đồ hài hoà`);
  check(variant.derived.heliocentric.length >= 8, `${frame}: bản đồ Nhật tâm thiếu hành tinh`);

  // --- hình mẫu & báo cáo
  check(variant.patterns.length <= 8, `${frame}: hình mẫu không được vượt 8 kết quả`);
  check(variant.shape.coverage > 0 && variant.shape.coverage <= 360, `${frame}: coverage hình dạng ngoài khoảng`);
  check(variant.hemispheres.north + variant.hemispheres.south === chart.planets.length, `${frame}: đếm bán cầu sai`);
  const report = variantReport(variant);
  check(report.includes("BIẾN THỂ BẢN ĐỒ SAO"), `${frame}: báo cáo thiếu tiêu đề`);
  check(report.includes("Human Design") && report.includes("Tứ Trụ"), `${frame}: báo cáo thiếu mục Trung Hoa/Human Design`);

  // --- điểm ảo có nhà
  check(variant.extraPoints.length >= 20, `${frame}: thiếu điểm ảo (${variant.extraPoints.length})`);
  check(
    variant.extraPoints.every((point) => point.house >= 1 && point.house <= 12),
    `${frame}: nhà của điểm ảo ngoài khoảng`
  );
}

// --- đổi hệ nhà qua 12 hệ: cusp 1 luôn bằng Cung Mọc, cusp đối nhau 180°
{
  const chart = calculateChart(utcDate, latitude, longitude, "Hà Nội", "Asia/Ho_Chi_Minh", 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const ascendantIsCusp1 = new Set(["equal", "placidus", "koch", "campanus", "regiomontanus", "alcabitius", "topocentric"]);

  for (const system of HOUSE_SYSTEMS) {
    const variant = buildVariantChart({ chart, localDate, localHour: 14.5, gender: "nam", houseSystem: system.id, zodiacFrame: "tropical" });
    if (ascendantIsCusp1.has(system.id)) {
      check(near(angDiff(variant.cusps[0], chart.ascendant), 0, 1e-6), `${system.id}: cusp 1 phải là Cung Mọc`);
    }
    if (system.id === "wholeSign") {
      check(variant.cusps.every((cusp) => near(cusp % 30, 0, 1e-9)), "wholeSign: cusp phải là mốc đầu cung 30°");
      check(
        wrap(chart.ascendant - variant.cusps[0]) < 30,
        "wholeSign: Cung Mọc phải nằm trong nhà 1"
      );
    }
    if (system.id === "equalMC") {
      check(near(angDiff(variant.cusps[9], chart.midheaven), 0, 1e-6), "equalMC: cusp 10 phải là Thiên Đỉnh");
    }
    if (system.id === "equal") {
      check(variant.cusps.every((cusp, index) => near(angDiff(cusp, wrap(chart.ascendant + index * 30)), 0, 1e-6)), "equal: mỗi nhà 30° từ Cung Mọc");
    }
    if (system.id !== "equalMC") {
      check(near(angDiff(variant.cusps[0], variant.cusps[6]), 180, 0.6), `${system.id}: cusp 1 và 7 phải đối nhau (~180°)`);
    }
    check(variant.houseSystemLabel.length > 0, `${system.id}: thiếu nhãn hệ nhà`);
    check(variant.cusps.length === 12, `${system.id}: phải có 12 cusp`);
  }
}

// --- MC của calcAngles phải khớp công thức SE (tan MC = tan ARMC / cos ε)
{
  let worst = 0;
  let worstAt = "";
  for (let year = 1900; year <= 2100; year += 25) {
    for (const lat of [-45, -10, 0, 21, 35, 60]) {
      for (const hour of [0, 6, 12, 18]) {
        const date = new Date(Date.UTC(year, 4, 10, hour));
        const chartAt = calculateChart(date, lat, 105, "test", null, 7, { houseSystem: "placidus", zodiacFrame: "tropical" });
        const set = computeHouses("placidus", localSidereal(date, 105), lat, calcObliquity(date));
        const diff = angDiff(chartAt.midheaven, set.midheaven);
        if (diff > worst) {
          worst = diff;
          worstAt = `${year}-05-10T${hour}Z lat ${lat}`;
        }
      }
    }
  }
  check(worst < 1e-6, `MC của calcAngles lệch công thức Swiss Ephemeris ${worst.toFixed(6)}° (${worstAt})`);
}

// --- bộ trả lời nội bộ cho câu hỏi biến thể
{
  const chart = calculateChart(utcDate, latitude, longitude, "Hà Nội", "Asia/Ho_Chi_Minh", 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const variant = buildVariantChart({ chart, localDate, localHour: 14.5, gender: "nam", houseSystem: "placidus", zodiacFrame: "lahiri" });
  const now = new Date(Date.UTC(2026, 8, 16, 6, 0));
  const base = {
    chart,
    senderName: "Tester",
    now,
    sky: computeSkySnapshot(now, latitude, longitude, 0, 23.4392911),
    transits: [],
    fixedStars: findFixedStarHits(chart, now, 4),
    variant,
    riseSet: riseSetForDay(now, latitude, longitude, "Asia/Ho_Chi_Minh")
  };

  const answers: Array<[string, string]> = [
    ["Có những biến thể bản đồ sao nào?", "Toàn bộ biến thể"],
    ["Giải thích hệ nhà Placidus khác Whole Sign thế nào?", "Placidus"],
    ["Ayanamsa là gì và vì sao cung của tôi khác?", "ayanamsa"],
    ["Lá số Vệ Đà của tôi nói gì?", "Vệ Đà"],
    ["Tứ Trụ và Tử Vi của tôi thế nào?", "Tứ Trụ"],
    ["Human Design của tôi là kiểu gì?", "Human Design"],
    ["Chiron và Lilith nghĩa là gì?", "Chiron"]
  ];

  const seen = new Set<string>();
  for (const [question, expected] of answers) {
    const answer = answerLocally({ ...base, question });
    check(answer.length > 200, `trả lời quá ngắn cho: ${question}`);
    check(answer.includes(expected), `trả lời thiếu nội dung "${expected}" cho: ${question}`);
    check(answer.includes("Bản đồ của bạn đang dùng biến thể nào"), `trả lời thiếu phần biến thể của bản đồ cho: ${question}`);
    seen.add(question);
  }
  check(seen.size === answers.length, "bộ câu hỏi kiểm tra bị trùng");
}

// --- kinh độ "điểm ảo" phải quy về ĐÚNG hệ hoàng đạo đang hiển thị
//     (thẻ Điểm ảo của VariantPanel đọc variant.sidereal; computeExtraPoints luôn trả nhiệt đới)
{
  for (const frame of ["tropical", "lahiri", "faganBradley", "krishnamurti", "galactic"] as ZodiacFrameId[]) {
    const chart = calculateChart(utcDate, latitude, longitude, "Hà Nội", "Asia/Ho_Chi_Minh", 7, {
      houseSystem: "placidus",
      zodiacFrame: frame
    });
    const variant = buildVariantChart({
      chart,
      localDate,
      localHour: 14.5,
      gender: "nữ",
      houseSystem: "placidus",
      zodiacFrame: frame
    });
    const ayan = variant.ayanamsaValue;
    check(variant.extraPoints.length > 0, `${frame}: phải có danh sách điểm ảo để kiểm`);
    for (const point of variant.extraPoints) {
      const shown = variant.sidereal[point.key];
      check(typeof shown === "number", `${frame}: thiếu kinh độ đã quy đổi cho ${point.key} (${point.label})`);
      if (typeof shown === "number") {
        check(
          angDiff(shown, wrap(point.longitude - ayan)) < 1e-6,
          `${frame}/${point.key}: kinh độ hiển thị (${shown.toFixed(4)}) phải bằng nhiệt đới (${point.longitude.toFixed(
            4
          )}) trừ ayanamsa ${ayan.toFixed(4)}°`
        );
      }
      // Nhà là hình học: đổi hệ quy chiếu (trừ cùng một hằng số ở cả kinh độ lẫn cusp) không đổi nhà.
      check(point.house >= 1 && point.house <= 12, `${frame}/${point.key}: số nhà phải nằm trong 1..12`);
    }
    if (frame === "tropical") {
      check(ayan === 0, "tropical: ayanamsa phải bằng 0");
    } else {
      check(ayan > 0, `${frame}: hệ sidereal phải có ayanamsa > 0`);
    }
  }
}

if (problems.length) {
  console.error(`✘ ${problems.length} vấn đề về biến thể bản đồ sao:`);
  for (const problem of problems.slice(0, 25)) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("✔ Lớp biến thể bản đồ sao: 7 hệ hoàng đạo × 12 hệ nhà chạy đúng, số liệu nhất quán.");
console.log("✔ Vệ Đà, Tứ Trụ, Tử Vi, Maya, Human Design, điểm ảo, hình mẫu và báo cáo đều tạo được.");
console.log("✔ Bộ trả lời nội bộ trả lời đúng các câu hỏi về biến thể.");
console.log("✔ Kinh độ điểm ảo quy về đúng hệ hoàng đạo đang hiển thị (nhiệt đới/sidereal).");
