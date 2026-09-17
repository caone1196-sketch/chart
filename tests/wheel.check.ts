/**
 * Kiểm chứng "vòng bản đồ sao natal không bị cắt lẹm" — lỗi người dùng báo trên điện thoại Android.
 *
 *   npm run test:wheel
 *
 * Cách kiểm: **render thật** `ChartWheel` bằng `react-dom/server`, rồi đọc lại SVG sinh ra,
 * tính hộp bao của từng phần tử (kể cả nửa nét vẽ và chữ) và khẳng định mọi hộp bao nằm
 * trong khung `viewBox` với vùng đệm tối thiểu. Ngoài ra còn kiểm:
 *   · thứ tự các vành (không đè lên nhau) và không có ký hiệu nào đè lên chip AC/DC/MC/IC;
 *   · 10 hành tinh dồn vào một độ vẫn nằm gọn trong khung;
 *   · dữ liệu có NaN/Infinity không làm hỏng hình học;
 *   · **hình học cũ** (bán kính 232, nhãn lệch 13px, viewBox 500) phải TRƯỢT đúng phép kiểm này
 *     — tức là bài kiểm thật sự bắt được lỗi đã báo, chứ không phải chỉ "xanh cho có".
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChartWheel from "../src/components/ChartWheel.tsx";
import { calculateChart, type PlanetPosition } from "../src/lib/astro.ts";
import type { ZodiacFrameId } from "../src/lib/zodiac.ts";
import type { HouseSystemId } from "../src/lib/houses.ts";
import { computeExtraPoints } from "../src/lib/points.ts";
import {
  WHEEL_CENTER,
  WHEEL_GLYPH_MAX_OFFSET,
  WHEEL_SAFE_MARGIN,
  WHEEL_SIZE,
  WHEEL_RETRO_OFFSET,
  WHEEL_RINGS,
  WHEEL_TEXT,
  buildWheelLayout,
  planetDiscRadius,
  planetPlacement,
  planetRingRadii,
  wheelPoint,
  pointBox,
  textHalfHeight,
  textHalfWidth,
  type WheelAngleInput,
  type WheelBox,
  type WheelLayout
} from "../src/lib/wheel-geometry.ts";

let checks = 0;
const failures: string[] = [];
const fail = (group: string, message: string) => failures.push(`${group}: ${message}`);
const ok = () => {
  checks += 1;
};
const expect = (group: string, actual: unknown, expected: unknown, label: string) => {
  ok();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(group, `${label} — nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`);
  }
};
const assert = (group: string, condition: boolean, message: string) => {
  ok();
  if (!condition) fail(group, message);
};

/* ── 1. Dữ liệu thật: 4 lá số đại diện (Hà Nội · Nam bán cầu · vòng cực · lá số có tụ tập) ── */

type Case = {
  name: string;
  utc: Date;
  lat: number;
  lon: number;
  houseSystem?: HouseSystemId;
  zodiacFrame?: ZodiacFrameId;
};

const CASES: Case[] = [
  { name: "Hà Nội 11/11/1996 00:30", utc: new Date(Date.UTC(1996, 10, 10, 17, 30)), lat: 21.0285, lon: 105.8542 },
  { name: "Sydney 03/03/1990 08:15", utc: new Date(Date.UTC(1990, 2, 2, 21, 15)), lat: -33.87, lon: 151.21, houseSystem: "placidus" },
  { name: "Tromsø 21/06/1985 12:00", utc: new Date(Date.UTC(1985, 5, 21, 10, 0)), lat: 69.65, lon: 18.96, houseSystem: "koch" },
  { name: "Sài Gòn 05/05/2004 18:45 (Vệ Đà)", utc: new Date(Date.UTC(2004, 4, 5, 11, 45)), lat: 10.7769, lon: 106.7009, zodiacFrame: "lahiri" }
];

type ChartLike = ReturnType<typeof calculateChart>;

const anglesOf = (chart: ChartLike): WheelAngleInput[] => [
  { label: "AC", longitude: chart.ascendant },
  { label: "DC", longitude: chart.descendant },
  { label: "MC", longitude: chart.midheaven },
  { label: "IC", longitude: chart.imumCoeli }
];

/* ── 2. Đọc lại SVG đã render ──────────────────────────────────────────── */

type SvgElement = { tag: string; attrs: Record<string, string>; text?: string };

const parseSvg = (markup: string): SvgElement[] => {
  const elements: SvgElement[] = [];
  const pattern =
    /<(circle|line|rect|text|path|ellipse|polygon|polyline)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const match of markup.matchAll(pattern)) {
    const tag = match[1];
    const attrs: Record<string, string> = {};
    for (const attribute of match[2].matchAll(/([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g)) attrs[attribute[1]] = attribute[2];
    elements.push({ tag, attrs, text: match[3] ? match[3].replace(/<[^>]*>/g, "").trim() : undefined });
  }
  return elements;
};

const number = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Hộp bao của một phần tử SVG (đã cộng nửa nét vẽ, chữ ước lượng theo cỡ chữ). */
const elementBox = (element: SvgElement): WheelBox | null => {
  const { tag, attrs } = element;
  const stroke = number(attrs["stroke-width"], 0);
  if (tag === "circle") {
    const radius = number(attrs.r) + stroke / 2;
    return pointBox(number(attrs.cx), number(attrs.cy), radius, radius);
  }
  if (tag === "line") {
    const pad = stroke / 2;
    return {
      minX: Math.min(number(attrs.x1), number(attrs.x2)) - pad,
      minY: Math.min(number(attrs.y1), number(attrs.y2)) - pad,
      maxX: Math.max(number(attrs.x1), number(attrs.x2)) + pad,
      maxY: Math.max(number(attrs.y1), number(attrs.y2)) + pad
    };
  }
  if (tag === "rect") {
    const pad = stroke / 2;
    const x = number(attrs.x);
    const y = number(attrs.y);
    return {
      minX: x - pad,
      minY: y - pad,
      maxX: x + number(attrs.width) + pad,
      maxY: y + number(attrs.height) + pad
    };
  }
  if (tag === "text") {
    const fontSize = number(attrs["font-size"], 12);
    const content = element.text ?? "";
    const symbol = /[^\x00-\x7F]/.test(content);
    const halfWidth = textHalfWidth(content, fontSize, symbol);
    const halfHeight = textHalfHeight(fontSize);
    const x = number(attrs.x);
    const y = number(attrs.y);
    const anchor = attrs["text-anchor"];
    return {
      minX: anchor === "middle" ? x - halfWidth : x,
      minY: y - halfHeight,
      maxX: anchor === "middle" ? x + halfWidth : x + halfWidth * 2,
      maxY: y + halfHeight
    };
  }
  return null;
};

const fits = (box: WheelBox, margin = WHEEL_SAFE_MARGIN) =>
  [box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) &&
  box.minX >= margin &&
  box.minY >= margin &&
  box.maxX <= WHEEL_SIZE - margin &&
  box.maxY <= WHEEL_SIZE - margin;

const describe = (element: SvgElement) => {
  if (element.tag === "text") return `text "${element.text}" @ (${element.attrs.x},${element.attrs.y})`;
  if (element.tag === "circle") return `circle r=${element.attrs.r} @ (${element.attrs.cx},${element.attrs.cy})`;
  if (element.tag === "rect") return `rect ${element.attrs.width}×${element.attrs.height} @ (${element.attrs.x},${element.attrs.y})`;
  return `${element.tag} (${element.attrs.x1},${element.attrs.y1})→(${element.attrs.x2},${element.attrs.y2})`;
};

/** Render vòng và kiểm mọi phần tử nằm trong khung. Trả về SVG đã render + layout. */
const renderAndCheck = (group: string, chart: ChartLike, highlightKeys: string[] = []) => {
  const markup = renderToStaticMarkup(
    createElement(ChartWheel, {
      planets: chart.planets,
      aspects: chart.aspects,
      houses: chart.houses,
      ascendant: chart.ascendant,
      descendant: chart.descendant,
      midheaven: chart.midheaven,
      imumCoeli: chart.imumCoeli,
      highlightKeys
    })
  );

  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1];
  expect(group, viewBox, `0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`, "khung vẽ 600×600");

  const elements = parseSvg(markup);
  assert(group, elements.length > 20, `SVG phải có nhiều phần tử (nhận ${elements.length})`);

  let clipped = 0;
  for (const element of elements) {
    const box = elementBox(element);
    if (!box) continue;
    if (!fits(box)) {
      clipped += 1;
      if (clipped <= 3) {
        fail(
          group,
          `${describe(element)} vượt khung: hộp bao [${box.minX.toFixed(1)}, ${box.minY.toFixed(1)}] → [${box.maxX.toFixed(1)}, ${box.maxY.toFixed(1)}] (cho phép ${WHEEL_SAFE_MARGIN}…${WHEEL_SIZE - WHEEL_SAFE_MARGIN})`
        );
      }
    }
    ok();
  }
  assert(group, clipped === 0, `có ${clipped} phần tử bị cắt/vượt khung`);

  // Không được lẫn toạ độ không hữu hạn vào SVG.
  assert(group, !/NaN|Infinity/.test(markup), "SVG không được chứa NaN/Infinity");

  const layout = buildWheelLayout({
    planets: chart.planets.map((planet: PlanetPosition) => ({ key: planet.key, longitude: planet.longitude })),
    houses: chart.houses.map((house) => ({ house: house.house, cusp: house.cusp })),
    angles: anglesOf(chart),
    highlightKeys
  });

  // Layout (nguồn dữ liệu của component) cũng phải nằm gọn trong khung.
  for (const box of layout.boxes) {
    const described = `[${box.minX.toFixed(1)}, ${box.minY.toFixed(1)}]→[${box.maxX.toFixed(1)}, ${box.maxY.toFixed(1)}]`;
    assert(group, fits(box), `hộp bao ${described} vượt khung`);
  }
  assert(group, fits(layout.bounds), "hộp bao chung phải nằm trong khung");
  assert(group, layout.extent <= WHEEL_SIZE / 2 - WHEEL_SAFE_MARGIN + 0.001, `bán kính lớn nhất ${layout.extent.toFixed(2)} vượt trần ${WHEEL_SIZE / 2 - WHEEL_SAFE_MARGIN}`);

  return { markup, elements, layout, chart };
};

for (const item of CASES) {
  const group = item.name;
  const chart = calculateChart(item.utc, item.lat, item.lon, item.name, null, 7, {
    houseSystem: item.houseSystem ?? "wholeSign",
    zodiacFrame: item.zodiacFrame ?? "tropical"
  });
  const { elements, layout } = renderAndCheck(group, chart);

  // Số lượng phần tử đúng như dữ liệu: 12 vạch cung, 12 ký hiệu cung, 12 vạch nhà, 12 số nhà,
  // 2 trục góc, 4 nhãn góc, 4 vòng tròn + đĩa nền, mỗi hành tinh 1 vạch dẫn + 1 đĩa + 1 ký hiệu.
  const counts = elements.reduce<Record<string, number>>((accumulator, element) => {
    const key = `${element.tag}:${element.text ? "text" : "shape"}`;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  assert(group, (counts["line:shape"] ?? 0) >= 26, `phải có ≥26 đường (12 cung + 12 nhà + 2 trục + vạch dẫn)`);
  assert(group, (counts["text:text"] ?? 0) >= 12 + 12 + 4 + chart.planets.length, `phải có đủ ký hiệu cung, số nhà, nhãn góc và hành tinh`);
  const overlapWarnings = layout.warnings.filter((warning) => warning.includes("chồng"));
  assert(group, overlapWarnings.length === 0, `không được có cảnh báo chồng ký hiệu: ${overlapWarnings.join(" · ")}`);
  // Ký hiệu nào bị dịch thì phải có cảnh báo giải thích, và vạch dẫn vẫn chỉ đúng kinh độ thật.
  for (const planet of layout.planets) {
    if (planet.offsetDegrees !== 0) {
      assert(group, layout.warnings.some((warning) => warning.startsWith(`${planet.key}:`)), `${planet.key} bị dịch nhưng không có cảnh báo`);
    }
    const anchor = wheelPoint(planet.trueLongitude, WHEEL_RINGS.zodiacInner - 1);
    assert(group, Math.abs(planet.leader.to.x - anchor.x) < 1e-9 && Math.abs(planet.leader.to.y - anchor.y) < 1e-9, `${planet.key}: vạch dẫn phải chỉ đúng kinh độ thật`);
  }
}

/* ── 3. Nhãn AC/DC/MC/IC phải vẽ trong vành cho phép, không đè lên ký hiệu cung ── */

{
  const chart = calculateChart(CASES[0].utc, CASES[0].lat, CASES[0].lon, CASES[0].name, null, 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const { elements } = renderAndCheck("nhãn góc", chart, ["sun"]);

  const labels = elements.filter((element) => element.tag === "text" && ["AC", "DC", "MC", "IC"].includes(element.text ?? ""));
  expect("nhãn góc", labels.length, 4, "đủ 4 nhãn AC/DC/MC/IC");

  const chips = elements.filter((element) => element.tag === "rect");
  expect("nhãn góc", chips.length, 4, "mỗi nhãn có một chip nền");

  // Chip nền phải nằm trong vành hoàng đạo và có bề rộng đủ chứa chữ.
  const chipBoxes = chips.map((chip) => elementBox(chip)).filter((box): box is WheelBox => Boolean(box));
  for (const chip of chipBoxes) {
    assert("nhãn góc", fits(chip), "chip nhãn góc phải nằm trong khung");
    const size = Math.min(chip.maxX - chip.minX, chip.maxY - chip.minY);
    assert("nhãn góc", size >= 27, `chip nhãn quá nhỏ để đọc (${size.toFixed(1)})`);
  }

  // Ký hiệu cung (☉☽…) phải là chữ, không phải số/cung — và không chồng lên chip nhãn góc.
  const signGlyphs = elements.filter(
    (element) => element.tag === "text" && number(element.attrs["font-size"], 0) === WHEEL_TEXT.signGlyph
  );
  expect("nhãn góc", signGlyphs.length, 12, "đủ 12 nhãn cung ở vành hoàng đạo");

  for (const glyph of signGlyphs) {
    const box = elementBox(glyph);
    if (!box) continue;
    for (const chip of chipBoxes) {
      const overlap = box.minX < chip.maxX && chip.minX < box.maxX && box.minY < chip.maxY && chip.minY < box.maxY;
      assert("nhãn góc", !overlap, `ký hiệu cung "${glyph.text}" chồng lên chip nhãn góc`);
    }
  }
}

/* ── 4. 10 hành tinh dồn vào một độ (stellium) vẫn nằm gọn trong khung ── */

{
  const group = "stellium 10 hành tinh";
  const keys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  for (const spread of [0, 0.4, 3, 7.5]) {
    const planets = keys.map((key, index) => ({ key, longitude: 123.4 + index * spread }));
    const { boxes, warnings } = buildWheelLayout({
      planets,
      houses: Array.from({ length: 12 }, (_, index) => ({ house: index + 1, cusp: index * 30 })),
      angles: [
        { label: "AC", longitude: 0 },
        { label: "DC", longitude: 180 },
        { label: "MC", longitude: 90 },
        { label: "IC", longitude: 270 }
      ]
    });
    for (const box of boxes) assert(group, fits(box), `hộp bao vượt khung khi khoảng cách ${spread}°`);

    const innerHouses = Array.from({ length: 12 }, (_, index) => ({ house: index + 1, cusp: index * 30 }));
    const innerAngles = [
      { label: "AC" as const, longitude: 0 },
      { label: "DC" as const, longitude: 180 },
      { label: "MC" as const, longitude: 90 },
      { label: "IC" as const, longitude: 270 }
    ];
    const highlights = ["sun", "moon"];
    const placement = planetPlacement(planets, highlights);
    const geometry = buildWheelLayout({ planets, houses: innerHouses, angles: innerAngles, highlightKeys: highlights }).planets;

    const ringCount = new Set(Object.values(placement.radii)).size;
    assert(group, ringCount >= 1 && ringCount <= 5, `số vành dùng phải trong 1…5 (nhận ${ringCount})`);
    const innerRing = WHEEL_RINGS.planetBase - WHEEL_RINGS.planetStackMax * WHEEL_RINGS.planetStep;
    for (const radius of Object.values(placement.radii)) {
      assert(group, radius >= innerRing && radius <= WHEEL_RINGS.planetBase, `bán kính vành ${radius} phải nằm trong dải vành hành tinh`);
      assert(group, radius - planetDiscRadius(false) > WHEEL_RINGS.aspect + 1, `vành ${radius} phải cách vòng góc chiếu ít nhất 1 đơn vị`);
    }

    // Không hai đĩa nào được chạm nhau, kể cả khi mọi hành tinh dồn trong 0°.
    for (let i = 0; i < geometry.length; i += 1) {
      for (let j = i + 1; j < geometry.length; j += 1) {
        const a = geometry[i];
        const b = geometry[j];
        const distance = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
        assert(group, distance >= a.disc + b.disc - 0.001, `đĩa ${a.key}/${b.key} chồng nhau khi khoảng cách thật ${spread}° (${distance.toFixed(1)} < ${(a.disc + b.disc).toFixed(1)})`);
      }
    }

    // Vạch dẫn luôn chỉ về đúng kinh độ thật của hành tinh.
    for (const item of geometry) {
      const expected = wheelPoint(item.trueLongitude, WHEEL_RINGS.zodiacInner - 1);
      assert(group, Math.abs(item.leader.to.x - expected.x) < 1e-9 && Math.abs(item.leader.to.y - expected.y) < 1e-9, `vạch dẫn của ${item.key} phải chỉ đúng kinh độ thật`);
      if (item.offsetDegrees !== 0) {
        assert(group, warnings.length > 0, `ký hiệu ${item.key} bị dịch thì phải có cảnh báo giải thích`);
      }
    }
  }
}

/* ── 5. Thứ tự vành: đĩa nền ⊃ vành hoàng đạo ⊃ số nhà ⊃ hành tinh ⊃ vòng góc chiếu ── */

{
  const group = "thứ tự vành";
  const chart = calculateChart(CASES[0].utc, CASES[0].lat, CASES[0].lon, CASES[0].name, null, 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const layout: WheelLayout = buildWheelLayout({
    planets: chart.planets.map((planet) => ({ key: planet.key, longitude: planet.longitude })),
    houses: chart.houses.map((house) => ({ house: house.house, cusp: house.cusp })),
    angles: anglesOf(chart)
  });

  const radiiOuterEdge = layout.circles.map((circle) => circle.radius + circle.strokeWidth / 2);
  const radiiInnerEdge = layout.circles.map((circle) => circle.radius - circle.strokeWidth / 2);
  assert(group, radiiOuterEdge[0] >= radiiOuterEdge[1], "vành hoàng đạo phải nằm trong đĩa nền");
  // Vành hoàng đạo (nét dày) phải trùng khít khoảng giữa hai vòng kẻ của nó.
  assert(group, Math.abs(radiiOuterEdge[1] - layout.circles[2].radius) < 1e-9, "mép ngoài vành phải khớp đường kẻ ngoài");
  assert(group, Math.abs(radiiInnerEdge[1] - layout.circles[3].radius) < 1e-9, "mép trong vành phải khớp đường kẻ trong");
  assert(group, radiiOuterEdge[2] > radiiOuterEdge[3], "vòng trong của vành phải nhỏ hơn vòng ngoài");
  assert(group, Math.max(...radiiOuterEdge) <= WHEEL_SIZE / 2 - WHEEL_SAFE_MARGIN, "mép ngoài cùng phải nằm trong vùng an toàn");

  const signGlyphRadius = Math.hypot(layout.signGlyphs[0].point.x - WHEEL_SIZE / 2, layout.signGlyphs[0].point.y - WHEEL_SIZE / 2);
  const houseNumberRadius = Math.hypot(layout.houseNumbers[0].point.x - WHEEL_SIZE / 2, layout.houseNumbers[0].point.y - WHEEL_SIZE / 2);
  const planetRadiusMax = Math.max(...layout.planets.map((planet) => planet.radius));
  assert(group, signGlyphRadius > houseNumberRadius, "ký hiệu cung phải ở ngoài số nhà");
  assert(group, houseNumberRadius > planetRadiusMax, "số nhà phải ở ngoài hành tinh");
  assert(group, planetRadiusMax > layout.aspectRadius, "hành tinh phải ở ngoài vòng góc chiếu");

  // Mỗi đĩa hành tinh phải chứa ký hiệu của chính nó và không chồng lên ký hiệu hành tinh khác.
  for (const planet of layout.planets) {
    const radius = Math.hypot(planet.point.x - WHEEL_CENTER, planet.point.y - WHEEL_CENTER);
    assert(group, Math.abs(radius - planet.radius) < 0.001, `đĩa ${planet.key} phải nằm đúng vành của nó`);
    assert(group, planet.disc >= 15, `đĩa ${planet.key} phải đủ lớn để đọc ký hiệu (${planet.disc})`);
    for (const other of layout.planets) {
      if (other.key === planet.key) continue;
      const distance = Math.hypot(other.point.x - planet.point.x, other.point.y - planet.point.y);
      assert(group, distance >= planet.disc + other.disc - 0.001, `hai đĩa ${planet.key}/${other.key} chồng lên nhau (${distance.toFixed(1)} < ${(planet.disc + other.disc).toFixed(1)})`);
    }
  }
}

/* ── 5b. Huy hiệu nghịch hành không được tràn khỏi đĩa hành tinh ── */

{
  const group = "huy hiệu R";
  const retroPlanets = ["sun", "moon", "mercury"].map((key, index) => ({ key, longitude: 40 + index * 60 }));
  const layout = buildWheelLayout({ planets: retroPlanets, houses: [], angles: [] });
  for (const planet of layout.planets) {
    // Góc xa tâm nhất của huy hiệu phải nằm trong đĩa. "R" là chữ in hoa nên chiều cao thật
    // chỉ bằng cap-height (~0,72em) — dùng đúng số đó thay vì ước lượng có cả dấu/đuôi chữ.
    const cornerX = WHEEL_RETRO_OFFSET.x + textHalfWidth("R", WHEEL_TEXT.retroBadge);
    const cornerY = WHEEL_RETRO_OFFSET.y + WHEEL_TEXT.retroBadge * 0.36;
    const distance = Math.hypot(cornerX, cornerY);
    assert(
      group,
      distance <= planet.disc,
      `huy hiệu R của ${planet.key} phải nằm gọn trong đĩa (${distance.toFixed(1)} + cỡ chữ > ${planet.disc})`
    );
  }
}

/* ── 6. Dữ liệu bẩn (NaN/Infinity) không làm hỏng hình học ── */

{
  const group = "dữ liệu bẩn";
  const broken = buildWheelLayout({
    planets: [
      { key: "sun", longitude: Number.NaN },
      { key: "moon", longitude: Number.POSITIVE_INFINITY },
      { key: "mars", longitude: -720 }
    ],
    houses: [
      { house: 1, cusp: Number.NaN },
      { house: 2, cusp: 30 }
    ],
    angles: [{ label: "AC", longitude: Number.NaN }]
  });
  for (const box of broken.boxes) assert(group, fits(box), "dữ liệu NaN vẫn phải cho hộp bao hợp lệ");
  assert(group, fits(broken.bounds), "hộp bao chung hợp lệ với dữ liệu NaN");
  const sun = broken.planets.find((planet) => planet.key === "sun");
  assert(group, Boolean(sun) && Number.isFinite(sun!.point.x) && Number.isFinite(sun!.point.y), "kinh độ NaN phải quy về 0° chứ không lan NaN ra toạ độ");
}

/* ── 7. Hình học CŨ phải trượt đúng phép kiểm này (chứng minh test bắt được lỗi) ── */

{
  const group = "đối chứng hình học cũ";
  const OLD_SIZE = 500;
  const OLD_CENTER = 250;
  const oldPoint = (longitude: number, radius: number) => {
    const angle = ((longitude + 90) * Math.PI) / 180;
    return { x: OLD_CENTER + radius * Math.cos(angle), y: OLD_CENTER - radius * Math.sin(angle) };
  };
  const oldFits = (box: WheelBox) => box.minX >= 0 && box.minY >= 0 && box.maxX <= OLD_SIZE && box.maxY <= OLD_SIZE;

  // Bản cũ: nhãn AC/DC/MC/IC ở bán kính 232 rồi trừ tiếp 13 ở y, chữ 12px.
  // Kinh độ 0° nằm ở ĐỈNH vòng (góc = kinh độ + 90°), nên mép trên của chữ rơi vào
  // y = 250 − 232 − 13 − 9 = −4 → bị cắt mất phần trên.
  const labelAtTop = oldPoint(0, 232);
  const oldTopLabel = pointBox(labelAtTop.x, labelAtTop.y - 13, textHalfWidth("AC", 12), textHalfHeight(12));
  assert(group, !oldFits(oldTopLabel), "nhãn AC ở đỉnh vòng kiểu cũ phải bị coi là tràn khung (đây chính là lỗi đã báo)");

  // …trong khi bản mới đặt nhãn ở cùng góc đó vẫn nằm gọn trong vùng an toàn.
  const newTopLabel = buildWheelLayout({
    planets: [],
    houses: [],
    angles: [{ label: "AC", longitude: 0 }]
  }).angleLabels[0];
  assert(group, fits(newTopLabel.box), "nhãn AC ở đỉnh vòng của bản mới phải nằm trong khung");

  // Bản cũ chỉ chừa 13,25 đơn vị ở mép (nhỏ hơn vùng an toàn 16 mà bản mới bắt buộc).
  assert(group, OLD_CENTER - (236 + 0.75) < WHEEL_SAFE_MARGIN, "vòng ngoài kiểu cũ không đủ vùng đệm tối thiểu");
}

/* ── 8. Bất biến hình học của bản mới ── */

{
  const group = "vùng đệm";
  assert(group, WHEEL_SAFE_MARGIN >= 12, "vùng an toàn tối thiểu 12 đơn vị (≈2% cạnh khung)");
  const chart = calculateChart(CASES[0].utc, CASES[0].lat, CASES[0].lon, CASES[0].name, null, 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const layout = buildWheelLayout({
    planets: chart.planets.map((planet) => ({ key: planet.key, longitude: planet.longitude })),
    houses: chart.houses.map((house) => ({ house: house.house, cusp: house.cusp })),
    angles: anglesOf(chart)
  });
  const gap = WHEEL_SIZE / 2 - layout.extent;
  assert(group, gap >= WHEEL_SAFE_MARGIN - 0.001, `phải chừa ≥ ${WHEEL_SAFE_MARGIN} đơn vị ở mọi mép (đang chừa ${gap.toFixed(2)})`);

  // Vòng cực: Cung Mọc/Cung Lặn có thể trùng nhau, nhãn không được kéo hình học ra ngoài.
  const polar = calculateChart(new Date(Date.UTC(1985, 5, 21, 10, 0)), 78.2, 15.6, "Svalbard", null, 2, {
    houseSystem: "placidus",
    zodiacFrame: "tropical"
  });
  const polarLayout = buildWheelLayout({
    planets: polar.planets.map((planet) => ({ key: planet.key, longitude: planet.longitude })),
    houses: polar.houses.map((house) => ({ house: house.house, cusp: house.cusp })),
    angles: anglesOf(polar)
  });
  for (const box of polarLayout.boxes) assert(group, fits(box), "vĩ độ 78° vẫn phải nằm trong khung");
}

/* ── 9. Điểm ảo (21 điểm) không phá hình học khi nằm cùng vành ── */

{
  const group = "điểm ảo";
  const chart = calculateChart(CASES[0].utc, CASES[0].lat, CASES[0].lon, CASES[0].name, null, 7, {
    houseSystem: "wholeSign",
    zodiacFrame: "tropical"
  });
  const extras = computeExtraPoints(chart.utcDate);
  const { boxes } = buildWheelLayout({
    planets: extras.slice(0, 10).map((point) => ({ key: point.key, longitude: point.longitude })),
    houses: chart.houses.map((house) => ({ house: house.house, cusp: house.cusp })),
    angles: anglesOf(chart)
  });
  for (const box of boxes) assert(group, fits(box), "điểm ảo dùng thay hành tinh vẫn phải nằm trong khung");
}

console.log(`\n${failures.length ? "✘" : "✔"} Vòng bản đồ sao: ${checks} phép kiểm, ${failures.length} lỗi.`);
for (const failure of failures.slice(0, 25)) console.log(`  · ${failure}`);
if (failures.length) process.exit(1);
