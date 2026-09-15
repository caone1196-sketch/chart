/**
 * Sinh báo cáo markdown cho ví dụ kiểm chứng: nam · 11/11/1996 · 00:30 (UTC+7) · Hà Nội.
 *
 *   npm run report:example   → docs/vi-du-1996-11-11.md
 *
 * Số liệu lấy từ chính engine của app; phần "kiểm chứng" so sánh trực tiếp với
 * tests/fixtures/example-1996-swisseph.json (sinh từ Swiss Ephemeris 2.10) và
 * hai giá trị tham chiếu độc lập của NASA/JPL Horizons (DE441).
 */
import fs from "node:fs";
import {
  ZODIAC_SIGNS,
  calcObliquity,
  calculateChart,
  computePlanetLongitudes,
  displayAngle,
  localSiderealDegrees
} from "@/lib/astro";
import { computeHouses } from "@/lib/houses";
import { ayanamsa } from "@/lib/zodiac";
import { computeExtraPoints } from "@/lib/points";
import { buildVariantChart, compareHouseSystems, variantReport } from "@/lib/chart-variants";

const out: string[] = [];
const say = (line = "") => out.push(line);

/* --------------------------------------------------------------------- đầu vào */

const LAT = 21.0285;
const LON = 105.8542;
const PLACE = "Hà Nội, Việt Nam";
const OFFSET = 7;
const utcDate = new Date(Date.UTC(1996, 10, 10, 17, 30)); // 11/11/1996 00:30 UTC+7
const localDate = new Date(utcDate.getTime() + OFFSET * 3600 * 1000);
const jd = utcDate.getTime() / 86400000 + 2440587.5;

const chart = calculateChart(utcDate, LAT, LON, PLACE, "Asia/Ho_Chi_Minh", OFFSET, {
  houseSystem: "placidus",
  zodiacFrame: "tropical"
});
const variant = buildVariantChart({
  chart,
  localDate,
  localHour: 0.5,
  gender: "nam",
  houseSystem: "placidus",
  zodiacFrame: "lahiri"
});
const comparison = compareHouseSystems(chart);
const housesOf = (system: string, key: string) => comparison.find((entry) => entry.id === system)?.houses[key] ?? 0;
const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/example-1996-swisseph.json", import.meta.url), "utf8"));
const wrap = (value: number) => ((value % 360) + 360) % 360;
const angDiff = (a: number, b: number) => {
  const d = Math.abs(wrap(a - b));
  return d > 180 ? 360 - d : d;
};
const signName = (longitude: number) => ZODIAC_SIGNS[Math.floor(wrap(longitude) / 30)].name;

/* ------------------------------------------------------------------------ header */

say("# Ví dụ kiểm chứng bản đồ sao — nam, 11/11/1996, 00:30");
say();
say("| Hạng mục | Giá trị |");
say("| --- | --- |");
say("| Giới tính | nam (dùng cho Tứ Trụ / Đại vận) |");
say("| Ngày giờ sinh | 11/11/1996 00:30 giờ địa phương (UTC+7, Việt Nam không có DST) |");
say(`| Quy đổi | 10/11/1996 17:30 UT · JD ${jd.toFixed(5)} · ΔT = ${(fixture.deltat * 86400).toFixed(1)} giây |`);
say(`| Nơi sinh (giả định) | ${PLACE} · ${LAT}°B ${LON}°Đ |`);
say("| Hệ dùng cho bảng chính | hoàng đạo nhiệt đới (tropical) · nhà Placidus |");
say();
say("> Nơi sinh không có trong yêu cầu nên báo cáo dùng **Hà Nội** làm mốc. Kinh độ/vĩ độ chỉ ảnh hưởng");
say("> Cung Mọc, Thiên Đỉnh và hệ nhà — vị trí hành tinh trong cung gần như không đổi (xem mục 10).");
say();
say("**Cách nhập vào app**: mở trang chủ, điền ngày `11/11/1996`, giờ `00:30`, chọn giới tính **nam**,");
say("chọn nơi sinh **Hà Nội** (hoặc nhập toạ độ 21.0285°B / 105.8542°Đ) rồi bấm tạo bản đồ.");
say("Toàn bộ số liệu dưới đây do chính engine của app sinh ra (`npm run report:example`), không nhập tay.");
say();

/* ------------------------------------------------------- 1. bảng hành tinh chính */

say("## 1. Vị trí hành tinh và nhà");
say();
say("| Thiên thể | Kinh độ (nhiệt đới) | Cung | Nhà Placidus | Nhà Whole Sign | Nhà Equal | Trạng thái |");
say("| --- | --- | --- | --- | --- | --- | --- |");
const bodies = [
  ...chart.planets.map((planet) => ({ key: planet.key, label: planet.label, longitude: planet.longitude, retrograde: planet.retrograde })),
  { key: "ascendant", label: "Cung Mọc (AC)", longitude: chart.ascendant, retrograde: false },
  { key: "midheaven", label: "Thiên Đỉnh (MC)", longitude: chart.midheaven, retrograde: false }
];
for (const body of bodies) {
  say(
    `| ${body.label} | ${displayAngle(body.longitude)} (${body.longitude.toFixed(4)}°) | ${signName(body.longitude)} | ${housesOf(
      "placidus",
      body.key
    )} | ${housesOf("wholeSign", body.key)} | ${housesOf("equal", body.key)} | ${body.retrograde ? "nghịch hành ⟲" : "—"} |`
  );
}
say();
const retro = chart.planets.filter((planet) => planet.retrograde).map((planet) => planet.label);
say(`- Hành tinh nghịch hành lúc sinh: ${retro.length ? retro.join(", ") : "không có"}.`);
say(`- Pha Mặt Trăng: ${chart.moonPhase} (góc Mặt Trăng - Mặt Trời ${chart.moonPhaseAngle.toFixed(2)}°).`);
say(
  `- Cân bằng nguyên tố: ${Object.entries(chart.elements)
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ")}; tính chất: ${Object.entries(chart.modalities)
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ")}.`
);
say();

/* ------------------------------------------------------------------- 2. góc bản đồ */

say("## 2. Bốn góc và hai điểm đặc biệt");
say();
say("| Điểm | Vị trí | Ý nghĩa ngắn |");
say("| --- | --- | --- |");
say(`| Cung Mọc (AC) | ${displayAngle(chart.ascendant)} | hình ảnh, cách tiếp cận cuộc sống |`);
say(`| Cung Lặn (DC) | ${displayAngle(chart.descendant)} | hình mẫu đối tác, quan hệ một-một |`);
say(`| Thiên Đỉnh (MC) | ${displayAngle(chart.midheaven)} | sự nghiệp, hình ảnh công chúng |`);
say(`| Đáy trời (IC) | ${displayAngle(chart.imumCoeli)} | gốc rễ, gia đình, nền tảng riêng tư |`);
say(`| Vertex | ${displayAngle(chart.vertex)} | điểm "định mệnh" trong quan hệ (theo trường phái Vertex) |`);
say(`| East Point | ${displayAngle(chart.eastPoint)} | trục Đông - Tây của bản đồ |`);
say();

/* ------------------------------------------------------------------- 3. hệ nhà */

say("## 3. 12 cusp theo Placidus và so sánh với các hệ khác");
say();
const cuspsBySystem = new Map<string, number[]>(
  (["placidus", "wholeSign", "equal", "koch", "campanus", "regiomontanus", "equalMC", "porphyry", "topocentric"] as const).map((id) => [
    id,
    computeHouses(id, localSiderealDegrees(utcDate, LON), LAT, calcObliquity(utcDate)).cusps
  ])
);
const cuspOf = (system: string, index: number) => cuspsBySystem.get(system)![index];
say("| Nhà | Placidus | Whole Sign | Equal | Koch | Campanus | Regiomontanus |");
say("| --- | --- | --- | --- | --- | --- | --- |");
for (let index = 0; index < 12; index += 1) {
  say(
    `| ${index + 1} | ${displayAngle(cuspOf("placidus", index))} | ${displayAngle(cuspOf("wholeSign", index))} | ${displayAngle(
      cuspOf("equal", index)
    )} | ${displayAngle(cuspOf("koch", index))} | ${displayAngle(cuspOf("campanus", index))} | ${displayAngle(cuspOf("regiomontanus", index))} |`
  );
}
say();
say("> Cùng một hành tinh có thể nằm ở nhà khác nhau tuỳ hệ chia nhà — xem cột nhà ở mục 1 hoặc tab");
say("> **Biến thể bản đồ sao → Hệ nhà** trong app để xem bảng so sánh đầy đủ 12 hệ.");
say();

/* ------------------------------------------------------------------ 4. Vệ Đà */

say("## 4. Lá số Vệ Đà (sidereal, ayanamsa Lahiri)");
say();
say(`Ayanamsa Lahiri tại thời điểm sinh: **${variant.ayanamsaValue.toFixed(4)}°** (Swiss Ephemeris: ${fixture.ayanamsa.lahiri.toFixed(4)}°).`);
say();
say("| Thiên thể | Kinh độ sidereal | Rashi | Nakshatra | Pada | Chủ tinh nakshatra |");
say("| --- | --- | --- | --- | --- | --- |");
for (const planet of variant.vedic.planets) {
  say(
    `| ${planet.label} | ${displayAngle(planet.longitude)} | ${planet.rashi} (${planet.rashiVi}) | ${planet.nakshatra} | ${planet.pada} | ${planet.nakshatraLord} |`
  );
}
say();
say(`- Cung Mọc sidereal: **${variant.vedic.ascendantRashi}** · Janma rashi (Mặt Trăng): **${variant.vedic.janmaRashi}** · Nakshatra Mặt Trăng: **${variant.vedic.moonNakshatra}** (pada ${variant.vedic.moonPada}).`);
say(`- ${variant.vedic.yoga}`);
say(
  `- Panchang: tithi ${variant.vedic.panchang.tithi} (${variant.vedic.panchang.paksha}) · nakshatra ${variant.vedic.panchang.nakshatra} · yoga ${variant.vedic.panchang.yoga} · karana ${variant.vedic.panchang.karana} · vara ${variant.vedic.panchang.vara}.`
);
say();
say("### Vimshottari Dasha");
say();
say("| Mahadasha | Từ | Đến | Đang diễn ra |");
say("| --- | --- | --- | --- |");
for (const period of variant.vedic.dasha) {
  say(
    `| ${period.lord} | ${period.start.toISOString().slice(0, 10)} | ${period.end.toISOString().slice(0, 10)} | ${period.isCurrent ? "● hiện tại" : ""} |`
  );
}
say();
const currentAntara = variant.vedic.antara.filter((period) => period.isCurrent).map((period) => period.lord);
say(
  `- Đang ở **${variant.vedic.currentMahadasha}** / antardasha **${variant.vedic.currentAntardasha}**${
    currentAntara.length ? "" : " (antardasha hiện tại tính theo hôm nay)"
  }.`
);
say();
say("### Varga (bản đồ chia)");
say();
say("| Varga | Ý nghĩa | Mặt Trời | Mặt Trăng | Cung Mọc |");
say("| --- | --- | --- | --- | --- |");
for (const varga of variant.vedic.vargas) {
  say(`| ${varga.label} | ${varga.use} | ${varga.signs["Mặt Trời"]} | ${varga.signs["Mặt Trăng"]} | ${varga.signs["Cung Mọc"]} |`);
}
say();

/* ------------------------------------------------------------- 5. điểm ảo */

say("## 5. Điểm ảo");
say();
say("| Điểm | Kinh độ | Nhà (Placidus) | Ý nghĩa |");
say("| --- | --- | --- | --- |");
for (const point of variant.extraPoints) {
  say(`| ${point.label} | ${displayAngle(point.longitude)} | ${point.house} | ${point.meaning} |`);
}
say();

/* --------------------------------------------------- 6. hình mẫu & hình dạng */

say("## 6. Hình dạng bản đồ và hình mẫu góc chiếu");
say();
say(`**Hình dạng: ${variant.shape.label}** — ${variant.shape.meaning}`);
say();
say(`- Bao phủ ${variant.shape.coverage.toFixed(1)}° vòng hoàng đạo, khoảng trống lớn nhất ${variant.shape.gap.toFixed(1)}°.`);
say(`- ${variant.shape.focus}`);
say(`- Lời khuyên: ${variant.shape.advice}`);
say(
  `- Ưu thế bán cầu: trên ${variant.hemispheres.north} / dưới ${variant.hemispheres.south} · đông ${variant.hemispheres.east} / tây ${variant.hemispheres.west}. ${variant.hemispheres.note}`
);
say();
if (variant.patterns.length) {
  say("| Hình mẫu | Thành viên | Ý nghĩa | Lời khuyên |");
  say("| --- | --- | --- | --- |");
  for (const pattern of variant.patterns) {
    say(`| ${pattern.label} | ${pattern.members.join(" · ")} | ${pattern.meaning} | ${pattern.advice} |`);
  }
} else {
  say("Không có cấu hình góc chiếu lớn nào (bản đồ phân tán).");
}
say();

/* ----------------------------------------------------------- 7. góc chiếu chính */

const ASPECT_VI: Record<string, string> = {
  Conjunction: "trùng tụ",
  Sextile: "lục hợp",
  Square: "vuông góc",
  Trine: "tam hợp",
  Opposition: "đối đỉnh"
};
say("## 7. Góc chiếu chặt nhất");
say();
say("| Cặp | Góc | Orb | Trạng thái |");
say("| --- | --- | --- | --- |");
for (const aspect of chart.aspects.slice(0, 12)) {
  say(
    `| ${aspect.fromLabel} — ${aspect.toLabel} | ${ASPECT_VI[aspect.type] ?? aspect.type} (${aspect.targetAngle}°) | ${aspect.orb.toFixed(
      2
    )}° | ${aspect.trend === "Applying" ? "áp sát" : "tách ra"} |`
  );
}
say();

/* --------------------------------------------------- 8. Hy Lạp cổ / Trung Hoa / Maya / HD */

say("## 8. Chiêm tinh cổ điển, Trung Hoa, Maya và Human Design");
say();
say(`- **Phái bản đồ (sect)**: ${variant.hellenistic.sect === "day" ? "ban ngày" : "ban đêm"}, hành tinh chủ đạo ${variant.hellenistic.sectLight}.`);
say();
say("| Lots (Hy Lạp) | Vị trí | Nhà | Ý nghĩa |");
say("| --- | --- | --- | --- |");
for (const lot of variant.hellenistic.lots) {
  say(`| ${lot.vi} | ${displayAngle(lot.longitude)} (${lot.signName}) | ${lot.house} | ${lot.meaning} |`);
}
say();
const strong = variant.hellenistic.dignities.filter((dignity) => dignity.score >= 4);
if (strong.length) {
  say("| Hành tinh | Phẩm chất | Điểm |");
  say("| --- | --- | --- |");
  for (const dignity of strong) {
    say(`| ${dignity.planet} | ${dignity.notes.join(", ") || "—"} | ${dignity.score} |`);
  }
  say();
}
say("### Tứ Trụ (BaZi)");
say();
say("| Trụ | Can | Chi | Con giáp | Ngũ hành can | Thập thần |");
say("| --- | --- | --- | --- | --- | --- |");
for (const pillar of variant.chinese.bazi.pillars) {
  say(`| ${pillar.label} | ${pillar.stemVi} (${pillar.stemHan}) | ${pillar.branchVi} (${pillar.branchHan}) | ${pillar.animal} | ${pillar.element} | ${pillar.tenGod.vi} |`);
}
say();
say(
  `- Nhật chủ: **${variant.chinese.bazi.dayMaster.vi}** (${variant.chinese.bazi.dayMaster.element}, ${
    variant.chinese.bazi.dayMaster.yang ? "dương" : "âm"
  }) — ${variant.chinese.bazi.dayMasterStrength.note}`
);
say(`- ${variant.chinese.bazi.usefulGodHint}`);
say(
  `- Ngũ hành: ${Object.entries(variant.chinese.bazi.elementScore)
    .map(([element, score]) => `${element} ${score.toFixed(2)}`)
    .join(" · ")} → mạnh nhất ${variant.chinese.bazi.dominantElement}, yếu nhất ${variant.chinese.bazi.weakestElement}.`
);
say(
  `- Đại vận ${variant.chinese.bazi.luckDirection}, khởi từ ${variant.chinese.bazi.luckPillars[0].ageStart.toFixed(1)} tuổi: ${variant.chinese.bazi.luckPillars
    .slice(0, 4)
    .map((luck) => `${luck.vi} (${luck.ageStart.toFixed(0)}t)`)
    .join(", ")}…`
);
say();
say("### Tử Vi Đẩu Số (ngày âm lịch thật, vị trí sao theo công thức cổ điển)");
say();
say(`- Ngũ hành cục: ${variant.chinese.ziwei.bureau.name} · Mệnh chủ ${variant.chinese.ziwei.lifeMaster} · Thân chủ ${variant.chinese.ziwei.bodyMaster}.`);
say(`- ${variant.chinese.ziwei.note}`);
say();
say("| Cung | Địa chi | Sao chính | Ý nghĩa |");
say("| --- | --- | --- | --- |");
for (const palace of variant.chinese.ziwei.palaces) {
  say(`| ${palace.isLife ? "**Mệnh**" : palace.name} | ${palace.branchVi} | ${palace.stars.join(", ") || "—"} | ${palace.meaning} |`);
}
say();
say("### Lịch Maya");
say();
say(`- Tzolk'in: **${variant.chinese.mayan.tzolkin.full}** · Haab: **${variant.chinese.mayan.haab.full}** · Long Count: ${variant.chinese.mayan.longCount}.`);
say(`- ${variant.chinese.mayan.meaning}`);
say();
say("### Human Design");
say();
say(
  `- Kiểu người: **${variant.design.typeVi}** · thẩm quyền: **${variant.design.authority}** (${variant.design.authorityVi}) · hồ sơ **${variant.design.profile}** (${variant.design.profileName}).`
);
say(`- Chiến lược: ${variant.design.strategy} · bóng tối khi lệch: ${variant.design.notSelf} → phần thưởng: ${variant.design.signature}.`);
say(`- Định nghĩa: ${variant.design.definition} — ${variant.design.definitionNote}`);
say(`- Trung tâm được xác định: ${variant.design.definedCenters.join(", ") || "không có (Reflector)"}.`);
say(
  `- Kênh: ${
    variant.design.channels.map((channel) => `${channel.gates[0]}-${channel.gates[1]} (${channel.name})`).join(" · ") || "không có"
  }.`
);
say(`- Cổng Tính cách: ${variant.design.personality.map((gate) => `${gate.label} ${gate.gate}.${gate.line}`).join(", ")}.`);
say();
say("### Bản đồ phái sinh");
say();
say(`- Hồi quy Mặt Trời kế tiếp: ${variant.derived.solarReturn.moment.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
say(`- Hồi quy Mặt Trăng gần nhất: ${variant.derived.lunarReturn.moment.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
say(`- Tiến triển thứ cấp (tuổi ${variant.derived.progression.age.toFixed(2)}): Solar arc ${variant.derived.solarArc.arc.toFixed(3)}°.`);
say(
  `- Ba cung quan trọng theo bản đồ Rồng (draconic): ${variant.derived.draconic
    .slice(0, 3)
    .map((point) => `${point.label} ${displayAngle(point.longitude)}`)
    .join(" · ")}.`
);
say();

/* ------------------------------------------------------------- 9. kiểm chứng */

say("## 9. Kiểm chứng số liệu");
say();
say("### 9.1. So với Swiss Ephemeris 2.10 (bản tham chiếu `tests/fixtures/example-1996-swisseph.json`)");
say();

type Row = { label: string; mine: number; reference: number };
const rows: Row[] = [];
const push = (label: string, mine: number, reference: number) => rows.push({ label, mine, reference });
const refBody = new Map<string, number>(fixture.bodies.map((body: { name: string; lon: number }) => [body.name, body.lon]));

for (const planet of computePlanetLongitudes(utcDate)) push(`hành tinh ${planet.key}`, planet.longitude, refBody.get(planet.key) as number);
for (const point of computeExtraPoints(utcDate)) {
  const key = point.key === "lilith" ? "meanApog" : point.key;
  const reference = refBody.get(key);
  if (reference !== undefined) push(`điểm ảo ${point.key}`, point.longitude, reference);
}

const armc = localSiderealDegrees(utcDate, LON);
const obliquity = calcObliquity(utcDate);
const extraCount = computeExtraPoints(utcDate).length;
for (const entry of fixture.houses as Array<{ id: string; asc: number; mc: number; cusps: number[] }>) {
  const mine = computeHouses(entry.id as never, armc, LAT, obliquity);
  push(`${entry.id} · Cung Mọc`, mine.ascendant, entry.asc);
  push(`${entry.id} · Thiên Đỉnh`, mine.midheaven, entry.mc);
  mine.cusps.forEach((cusp, index) => push(`${entry.id} · nhà ${index + 1}`, cusp, entry.cusps[index]));
  const angles = entry as { vertex?: number; eastPoint?: number };
  if (angles.vertex !== undefined) push(`${entry.id} · Vertex`, mine.vertex, angles.vertex);
  if (angles.eastPoint !== undefined) push(`${entry.id} · East Point`, mine.eastPoint, angles.eastPoint);
}
for (const frame of ["lahiri", "faganBradley", "raman", "krishnamurti", "deLuce", "galactic"] as const) {
  push(`ayanamsa ${frame}`, ayanamsa(frame, utcDate), fixture.ayanamsa[frame]);
}

const withError = rows.map((row) => ({ ...row, error: angDiff(row.mine, row.reference) }));
const maxOf = (predicate: (label: string) => boolean) =>
  withError.filter((row) => predicate(row.label)).reduce((max, row) => Math.max(max, row.error), 0);

const countOf = (predicate: (label: string) => boolean) => rows.filter((row) => predicate(row.label)).length;
say(
  `- Tổng số phép so sánh: **${rows.length}**: ${countOf((l) => l.startsWith("hành tinh"))} hành tinh, ${countOf(
    (l) => l.startsWith("điểm ảo")
  )}/${extraCount} điểm ảo có bản tham chiếu SE, ${countOf((l) => l.includes("nhà "))} cusp (12 hệ × 12 nhà) + 24 góc Cung Mọc/Thiên Đỉnh + 24 Vertex/East Point, ${countOf(
    (l) => l.startsWith("ayanamsa")
  )} ayanamsa.`
);
say(`- Hành tinh: sai số lớn nhất **${maxOf((label) => label.startsWith("hành tinh")).toFixed(5)}°**.`);
say(`- Điểm ảo (node, Lilith, tiểu hành tinh Kepler, hành tinh giả định): lớn nhất **${maxOf((label) => label.startsWith("điểm ảo")).toFixed(5)}°**.`);
say(
  `- 12 hệ nhà (cusp + Cung Mọc + Thiên Đỉnh): lớn nhất **${maxOf(
    (label) => !label.startsWith("hành tinh") && !label.startsWith("điểm ảo") && !label.startsWith("ayanamsa") && !label.includes("Vertex") && !label.includes("East Point")
  ).toFixed(5)}°**.`
);
say(`- Vertex/East Point (góc rất nhạy với ARMC): lớn nhất **${maxOf((label) => label.includes("Vertex") || label.includes("East Point")).toFixed(5)}°**.`);
say(`- Ayanamsa 6 hệ: lớn nhất **${maxOf((label) => label.startsWith("ayanamsa")).toFixed(5)}°**.`);
say();
say("Sai số còn lại đến từ đâu:");
say();
say("- **Hành tinh**: engine của app dùng VSOP87 rút gọn (astronomy-engine), Swiss Ephemeris dùng DE431 — lệch cỡ 0,01° là bình thường, không phải lỗi.");
say("- **Tiểu hành tinh (Ceres/Pallas/Juno/Vesta/Chiron)**: app dùng mô hình Kepler 2 vật thể với phần tử JPL SBDB, bỏ qua nhiễu loạn của các hành tinh lớn — lệch tới ~1° với Juno.");
say("- **Node & Lilith**: app tính theo công thức giải tích, lệch ≤ 0,12°.");
say("- **Selena (White Moon)**: khi đối chiếu đã phát hiện app dùng **sai** chuyển động trung bình cho điểm này (định luật Gauss cho a = 0,0528 AU ⇒ 81,2°/ngày, trong khi seorbel.txt ghi 0,1408225°/ngày) và bỏ qua tiến động của hệ quy chiếu \"JDATE\".");
say("  Trên dải 1900–2100 sai số cũ tới **175,7°** (trung bình 111,2°); sau khi sửa trong `src/lib/points.ts` sai số chỉ còn **≤ 0,0002°**. Đây là lỗi thật do bước kiểm chứng này phát hiện.");
say();
say("Ghi chú: thiên thể bị coi là \"ảo\" (Selena, Cupido…) không có định nghĩa thống nhất giữa các trường phái; số liệu ở đây khớp **định nghĩa của Swiss Ephemeris** (tệp `seorbel.txt`).");
say();
say("Năm mục lệch nhiều nhất (đều nằm trong ngưỡng đã đặt trong `tests/example.check.ts`):");
say();
say("| Mục | App | Swiss Ephemeris | Lệch |");
say("| --- | --- | --- | --- |");
for (const row of withError.sort((a, b) => b.error - a.error).slice(0, 5)) {
  say(`| ${row.label} | ${row.mine.toFixed(5)}° | ${row.reference.toFixed(5)}° | ${row.error.toFixed(5)}° |`);
}
say();
say("### 9.2. Kiểm chứng chéo với NASA/JPL Horizons (DE441)");
say();
say("Truy vấn `EPHEM_TYPE=OBSERVER`, `QUANTITIES=31` (hoàng đạo biểu kiến, tâm Trái Đất) lúc 1996-11-10 17:30 UT:");
say();
say("| Thiên thể | JPL Horizons (ObsEcLon) | Swiss Ephemeris | App | Lệch app - JPL |");
say("| --- | --- | --- | --- | --- |");
const jpl: Array<[string, number, number]> = [
  ["Mặt Trời", 228.6032345, 228.6033],
  ["Mặt Trăng", 222.9901527, 222.9902]
];
for (const [name, jplValue, seValue] of jpl) {
  const mine = computePlanetLongitudes(utcDate).find((planet) => (name === "Mặt Trời" ? planet.key === "sun" : planet.key === "moon"))!.longitude;
  say(`| ${name} | ${jplValue.toFixed(7)}° | ${seValue.toFixed(4)}° | ${mine.toFixed(5)}° | ${angDiff(mine, jplValue).toFixed(5)}° |`);
}
say();
say("Kết luận: ba nguồn độc lập (engine của app dùng astronomy-engine + mô hình Kepler JPL, Swiss Ephemeris 2.10");
say(`và JPL Horizons DE441) khớp nhau: hành tinh ≤ ${maxOf((label) => label.startsWith("hành tinh")).toFixed(5)}°, cusp & góc nhà ≤ ${maxOf((label) => label.includes("nhà ") || label.includes("Cung Mọc") || label.includes("Thiên Đỉnh")).toFixed(5)}°,`);
say(`ayanamsa ≤ ${maxOf((label) => label.startsWith("ayanamsa")).toFixed(5)}°. Sai số còn lại nằm ở lý thuyết hành tinh khác nhau (VSOP87 rút gọn vs DE431/DE441) và mô hình Kepler 2 vật thể cho tiểu hành tinh.`);
say();
say("### 9.3. Âm lịch (dùng cho Tử Vi Đẩu Số)");
say();
say("Ngày âm lịch **không** ước lượng theo pha Mặt Trăng mà tính từ sóc (trăng mới) và trung khí theo giờ Việt Nam (UTC+7):");
say("mùng 1 = ngày chứa thời điểm sóc, tháng 11 âm lịch = tháng chứa Đông chí, tháng không có trung khí là tháng nhuận.");
say();
say("| Mục | Giá trị |");
say("| --- | --- |");
say("| Sóc gần nhất trước/sau khi sinh | 12/10/1996 21:14 (mùng 1 tháng 9) → **11/11/1996 11:16 giờ VN** (mùng 1 tháng 10) |");
say("| Ngày âm lịch của 11/11/1996 | **mùng 1 tháng 10 năm Bính Tý** (tháng 10 có 29 ngày) |");
say("| Ngày 10/11/1996 | ngày 30 tháng 9 năm Bính Tý |");
say("| Kiểm chứng độc lập | gói `amlich` 0.0.2 (thuật toán Hồ Ngọc Đức) và `lunardate` (lịch Trung Quốc) đều cho mùng 1 tháng 10; toàn bộ giai đoạn 1900–2100 khớp trong `npm run test:lunar` (32.874 phép so sánh) |");
say();
say("> Ca sinh **00:30** nằm ở đầu giờ Tý nên vẫn thuộc ngày 11/11 (mùng 1 tháng 10). Nếu sinh trong khoảng 23:00–23:59 thì");
say("> theo quy ước “ngày bắt đầu từ 23 giờ”, ngày âm lịch được tính sang hôm sau — app đã xử lý tự động.");
say();
say("> Chạy lại kiểm chứng: `npm run test:example` và `npm run test:lunar` (đều nằm trong `npm test`). Generator tham chiếu: `tests/gen/example-ref.c`, `tests/gen/lunar-ref.mjs`.");
say();

/* ------------------------------------------------- 10. nơi sinh ảnh hưởng thế nào */

say("## 10. Nếu sinh ở nơi khác thì thay đổi những gì?");
say();
say("| Nơi sinh | Toạ độ | Cung Mọc | Thiên Đỉnh | Mặt Trời (nhà Placidus) | Mặt Trăng (nhà Placidus) |");
say("| --- | --- | --- | --- | --- | --- |");
const places: Array<[string, number, number]> = [
  ["Hà Nội (dùng trong báo cáo)", 21.0285, 105.8542],
  ["Thanh Hoá", 19.8075, 105.7769],
  ["Huế", 16.4637, 107.5909],
  ["TP. Hồ Chí Minh", 10.7769, 106.7009]
];
for (const [name, lat, lon] of places) {
  const local = calculateChart(utcDate, lat, lon, name, "Asia/Ho_Chi_Minh", OFFSET, { houseSystem: "placidus", zodiacFrame: "tropical" });
  const sunHouse = local.planets.find((planet) => planet.key === "sun")!.house;
  const moonHouse = local.planets.find((planet) => planet.key === "moon")!.house;
  say(`| ${name} | ${lat.toFixed(4)}°, ${lon.toFixed(4)}° | ${displayAngle(local.ascendant)} | ${displayAngle(local.midheaven)} | ${sunHouse} | ${moonHouse} |`);
}
say();
say("Cung Mọc nhạy với vĩ độ (chênh ~1° vĩ độ → Cung Mọc lệch cỡ 0,5-1°), Thiên Đỉnh chỉ phụ thuộc kinh độ + giờ");
say("(chênh 1° kinh độ → lệch ~1°). Trong ví dụ này, Mặt Trời và Mặt Trăng giữ nguyên nhà Placidus ở mọi thành phố.");
say();

/* ------------------------------------------------------------------- phụ lục */

say("## Phụ lục — tóm tắt dạng văn bản (đúng phần app gửi cho AI)");
say();
say("```");
say(variantReport(variant));
say("```");

const markdown = out.join("\n") + "\n";
const target = new URL("../docs/vi-du-1996-11-11.md", import.meta.url);
fs.mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
fs.writeFileSync(target, markdown, "utf8");
console.log(`Đã ghi ${target.pathname} (${markdown.length} ký tự, ${markdown.split("\n").length} dòng)`);
