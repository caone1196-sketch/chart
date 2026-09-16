/**
 * Kiểm tra tính nhất quán toàn cục — nhóm lỗi "cùng một lá số nhưng hai chỗ hiển thị khác nhau".
 *
 *   npm run test:consistency
 *
 * Các bất biến được kiểm:
 *  1. Nhà của một điểm là chuyện hình học trên trời: đổi hệ hoàng đạo (tropical/sidereal) KHÔNG được đổi nhà.
 *  2. Lá số Vệ Đà luôn là sidereal → rashi/nakshatra/pada/nhà/dasha không phụ thuộc hệ đang chọn.
 *  3. Chữ ký cung của cusp (cuspSigns) phải trùng đúng cung chứa kinh độ cusp đó.
 *  4. Bảng "So sánh 12 hệ chia nhà" của hệ đang chọn phải trùng số nhà ở bảng hành tinh chính.
 *  5. cusp 1 của mọi hệ (trừ 4 hệ cố ý khác) phải trùng Cung Mọc, ở MỌI vĩ độ.
 *  6. Không có NaN/Infinity trong dữ liệu đưa lên giao diện.
 *  7. Hệ nhà không xác định ngoài vòng cực phải tạo ghi chú (chart.houseNote) thay vì im lặng.
 */
import { calculateChart, displayAngle } from "../src/lib/astro.ts";
import { HOUSE_SYSTEMS, computeHouses } from "../src/lib/houses.ts";
import { buildVariantChart, compareHouseSystems, variantReport } from "../src/lib/chart-variants.ts";
import { calcObliquity, localSiderealDegrees } from "../src/lib/astro.ts";
import { ZODIAC_SIGNS } from "../src/lib/astro.ts";
import { ayanamsa, type ZodiacFrameId } from "../src/lib/zodiac.ts";

let checks = 0;
let failures = 0;
const seen = new Set<string>();

const fail = (group: string, message: string) => {
  failures += 1;
  const key = `${group}|${message}`;
  if (!seen.has(key)) {
    seen.add(key);
    console.log(`  ✘ [${group}] ${message}`);
  }
};

const ok = () => {
  checks += 1;
};

const wrap = (value: number) => ((value % 360) + 360) % 360;
const angularDiff = (a: number, b: number) => angularDiffRaw(a, b);
const angularDiffRaw = (a: number, b: number) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};

type Case = { name: string; utc: Date; lat: number; lon: number; localDate: Date; localHour: number; gender: "nam" | "nữ" };

const CASES: Case[] = [
  { name: "Hà Nội 11/11/1996 00:30", utc: new Date(Date.UTC(1996, 10, 10, 17, 30)), lat: 21.0285, lon: 105.8542, localDate: new Date(1996, 10, 11), localHour: 0.5, gender: "nam" },
  { name: "Sydney 03/03/1990 08:15", utc: new Date(Date.UTC(1990, 2, 2, 21, 15)), lat: -33.87, lon: 151.21, localDate: new Date(1990, 2, 3), localHour: 8.25, gender: "nữ" },
  { name: "Tromsø 21/06/1985 12:00", utc: new Date(Date.UTC(1985, 5, 21, 10, 0)), lat: 69.65, lon: 18.96, localDate: new Date(1985, 5, 21), localHour: 12, gender: "nam" },
  { name: "Huế 29/02/2000 23:50", utc: new Date(Date.UTC(2000, 1, 29, 16, 50)), lat: 16.4637, lon: 107.5909, localDate: new Date(2000, 1, 29), localHour: 23.83, gender: "nữ" }
];

const build = (item: Case, frame: ZodiacFrameId, houseSystem: (typeof HOUSE_SYSTEMS)[number]["id"]) =>
  buildVariantChart({
    chart: calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, { houseSystem, zodiacFrame: frame }),
    localDate: item.localDate,
    localHour: item.localHour,
    gender: item.gender,
    houseSystem,
    zodiacFrame: frame
  });

const signsOf = (longitude: number) => ZODIAC_SIGNS[Math.floor(wrap(longitude) / 30)].name;

/* 1–4. Bất biến theo hệ quy chiếu, cho mọi hệ nhà */
console.log("1–4. Bất biến khi đổi hệ hoàng đạo (nhà hành tinh, điểm ảo, lá số Vệ Đà, chữ ký cung cusp)");
for (const item of CASES) {
  const chartTropical = calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, { houseSystem: "placidus", zodiacFrame: "tropical" });
  for (const system of HOUSE_SYSTEMS) {
    const tropical = build(item, "tropical", system.id);
    const chart = calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, { houseSystem: system.id, zodiacFrame: "tropical" });
    const table = compareHouseSystems(chart);
    const row = table.find((entry) => entry.id === system.id)!;

    // 3. cuspSigns
    tropical.cusps.forEach((cusp, index) => {
      ok();
      if (tropical.cuspSigns[index] !== signsOf(cusp)) {
        fail("cuspSigns", `${item.name} · ${system.id}: nhà ${index + 1} hiển thị ${tropical.cuspSigns[index]} nhưng kinh độ ${cusp.toFixed(2)}° thuộc ${signsOf(cusp)}`);
      }
    });

    // 4. bảng so sánh phải trùng bảng hành tinh của hệ đang chọn
    for (const planet of chart.planets) {
      ok();
      if (row.houses[planet.key] !== planet.house) {
        fail("bảng so sánh", `${item.name} · ${system.id}: ${planet.label} bảng hiện ${row.houses[planet.key]} ≠ nhà ${planet.house}`);
      }
    }

    for (const frame of ["lahiri", "faganBradley", "raman", "krishnamurti", "deLuce", "galactic"] as ZodiacFrameId[]) {
      const sidereal = build(item, frame, system.id);

      for (const planet of tropical.extraPoints) {
        ok();
        const other = sidereal.extraPoints.find((entry) => entry.key === planet.key)!;
        if (planet.house !== other.house) {
          fail("nhà điểm ảo", `${item.name} · ${system.id}: ${planet.key} nhà ${planet.house} (nhiệt đới) ≠ ${other.house} (${frame})`);
        }
      }

      // Vệ Đà luôn sidereal: hệ hiển thị nhiệt đới phải cho ĐÚNG cùng lá số với hệ Lahiri.
      // Với các chuẩn ayanamsa khác thì giá trị được phép lệch đúng bằng hiệu ayanamsa — kiểm luôn.
      const ayanShift = wrap(ayanamsa("lahiri", item.utc) - sidereal.vedic.ayanamsa);
      for (const planet of tropical.vedic.planets) {
        const other = sidereal.vedic.planets.find((entry) => entry.key === planet.key)!;
        ok();
        if (frame === "lahiri") {
          if (planet.rashi !== other.rashi || planet.nakshatra !== other.nakshatra || planet.pada !== other.pada || planet.house !== other.house) {
            fail(
              "Vệ Đà (nhiệt đới ≡ Lahiri)",
              `${item.name} · ${system.id}: ${planet.label} ${planet.rashi}/${planet.nakshatra}/${planet.pada}/nhà ${planet.house} ≠ ${other.rashi}/${other.nakshatra}/${other.pada}/nhà ${other.house}`
            );
          }
        } else if (angularDiff(other.longitude, wrap(planet.longitude + ayanShift)) > 1e-6) {
          fail(
            "Vệ Đà (đổi ayanamsa)",
            `${item.name} · ${system.id} · ${frame}: ${planet.label} ${other.longitude.toFixed(6)}° ≠ ${wrap(planet.longitude + ayanShift).toFixed(6)}°`
          );
        }
      }

      ok();
      if (angularDiff(sidereal.vedic.ayanamsa, ayanamsa(frame === "lahiri" ? "lahiri" : frame, item.utc)) > 1e-9) {
        fail("Vệ Đà ayanamsa", `${item.name} · ${system.id} · ${frame}: ayanamsa ${sidereal.vedic.ayanamsa.toFixed(6)}° không khớp chuẩn của hệ`);
      }
      if (frame !== "lahiri" && angularDiff(tropical.vedic.ayanamsa, sidereal.vedic.ayanamsa) < 0.05 && frame !== "galactic") {
        fail("Vệ Đà ayanamsa", `${item.name} · ${system.id} · ${frame}: đổi chuẩn ayanamsa mà giá trị Vệ Đà không đổi`);
      }
    }
  }
  // nhà hành tinh (dùng bảng chính) cũng phải bất biến
  const t0 = calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, { houseSystem: "placidus", zodiacFrame: "tropical" });
  const s0 = calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, { houseSystem: "placidus", zodiacFrame: "lahiri" });
  for (const planet of t0.planets) {
    ok();
    const other = s0.planets.find((entry) => entry.key === planet.key)!;
    if (planet.house !== other.house) {
      fail("nhà hành tinh", `${item.name}: ${planet.label} nhà ${planet.house} (nhiệt đới) ≠ ${other.house} (lahiri)`);
    }
  }
}

/* 4b. Nhãn cột của bảng so sánh phải phân biệt được từng hành tinh */
console.log("4b. Nhãn cột bảng so sánh (ký hiệu hành tinh)");
{
  const reference = calculateChart(CASES[0].utc, CASES[0].lat, CASES[0].lon, CASES[0].name, null, 7, {
    houseSystem: "placidus",
    zodiacFrame: "tropical"
  });
  const glyphs = reference.planets.map((planet) => planet.glyph);
  const labels = reference.planets.map((planet) => planet.label);
  ok();
  if (glyphs.some((glyph) => !glyph) || new Set(glyphs).size !== glyphs.length) {
    fail("nhãn cột", `ký hiệu hành tinh trùng hoặc rỗng: ${glyphs.join(" ")}`);
  }
  ok();
  const lastWord = labels.map((label) => label.split(" ").pop());
  if (new Set(lastWord).size === lastWord.length) fail("nhãn cột", "phép kiểm này không còn cần thiết — nhãn cắt có thể dùng lại được");
}

/* 5. cusp 1 phải trùng Cung Mọc ở mọi vĩ độ (trừ các hệ cố ý khác) */
console.log("5. Cusp 1 so với Cung Mọc ở mọi vĩ độ");
const EXCEPT_CUSP1 = new Set(["wholeSign", "equalMC", "morinus", "sripati"]);
const utc = new Date(Date.UTC(1996, 10, 10, 17, 30));
const eps = calcObliquity(utc);
for (const lon of [0, 15, 90]) {
  const armc = localSiderealDegrees(utc, lon);
  for (let lat = -89.9; lat <= 89.9; lat += 7.13) {
    for (const system of HOUSE_SYSTEMS) {
      if (EXCEPT_CUSP1.has(system.id)) continue;
      const set = computeHouses(system.id, armc, lat, eps);
      ok();
      if (angularDiff(set.cusps[0], set.ascendant) > 0.01) {
        fail("cusp 1", `${system.id} ở vĩ độ ${lat.toFixed(2)}°: cusp 1 ${displayAngle(set.cusps[0])} ≠ Cung Mọc ${displayAngle(set.ascendant)}`);
      }
      for (const cusp of set.cusps) {
        ok();
        if (!Number.isFinite(cusp)) fail("giá trị", `${system.id} ở vĩ độ ${lat.toFixed(2)}°: cusp không hữu hạn`);
      }
    }
  }
}

/* 6–7. Không có NaN, và hệ nhà ngoài vòng cực phải có ghi chú */
console.log("6–7. Giá trị hữu hạn và ghi chú ngoài vòng cực");
const walkNumbers = (value: unknown, path: string, onProblem: (path: string, found: unknown) => void) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) onProblem(path, value);
    return;
  }
  if (value instanceof Date || typeof value === "string" || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkNumbers(child, `${path}[${index}]`, onProblem));
    return;
  }
  if (typeof value === "object") for (const [key, child] of Object.entries(value)) walkNumbers(child, `${path}.${key}`, onProblem);
};

const POLAR: Array<[string, number]> = [
  ["vòng cực bắc", 67.5],
  ["cực bắc", 89.9],
  ["vòng cực nam", -67.5],
  ["cực nam", -89.9]
];
for (const [label, lat] of POLAR) {
  for (const system of HOUSE_SYSTEMS) {
    const chart = calculateChart(utc, lat, 18.96, label, null, 1, { houseSystem: system.id, zodiacFrame: "tropical" });
    walkNumbers(chart, `chart(${label})`, (path, found) => fail("giá trị lạ", `${system.id} · ${path} = ${found}`));
    ok();
    const fallbackSystems = ["placidus", "koch", "alcabitius", "topocentric"];
    if (fallbackSystems.includes(system.id)) {
      if (!chart.houseNote) fail("ghi chú vòng cực", `${system.id} ở ${label} phải có houseNote nhưng không có`);
    } else if (chart.houseNote && system.id !== "campanus" && system.id !== "regiomontanus") {
      fail("ghi chú vòng cực", `${system.id} ở ${label} có houseNote bất ngờ: ${chart.houseNote}`);
    }
    const variant = buildVariantChart({
      chart,
      localDate: new Date(utc.getTime() + 3600 * 1000),
      localHour: 13,
      gender: "nam",
      houseSystem: system.id,
      zodiacFrame: "tropical"
    });
    walkNumbers(variant, `variant(${label})`, (path, found) => fail("giá trị lạ", `${system.id} · ${path} = ${found}`));
    ok();
    if (chart.houseNote && !variantReport(variant).includes(chart.houseNote)) {
      fail("ghi chú trong báo cáo", `${system.id} ở ${label}: báo cáo không nhắc ghi chú hệ nhà`);
    }
  }
}

console.log(
  `\n${failures ? "✘" : "✔"} Nhất quán: ${checks.toLocaleString("vi-VN")} phép kiểm, ${failures} lỗi.`
);
if (failures) process.exit(1);
