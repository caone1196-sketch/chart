/**
 * Render "vòng bản đồ sao natal" ra PNG để kiểm bằng mắt (không cần trình duyệt).
 * Chạy: npm run shot:wheel   (kết quả ở .cache/shots/)
 *
 * Mục đích: soi lỗi "bản đồ bị cắt lẹm" — ảnh phải thấy trọn vòng tròn, nhãn AC/DC/MC/IC
 * nằm trong vành hoàng đạo, không ký hiệu nào bị gọt ở mép. Ảnh có thêm lưới an toàn
 * (khung 16 đơn vị) để nhìn ra ngay phần tử nào lấn ra ngoài.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import ChartWheel from "@/components/ChartWheel";
import { calculateChart, type ChartData } from "@/lib/astro";
import { WHEEL_SAFE_MARGIN, WHEEL_SIZE } from "@/lib/wheel-geometry";

const PIXELS = Number(process.env.SHOT_WHEEL_PX ?? 900);
const SUFFIX = process.env.SHOT_WHEEL_SUFFIX ?? "";

type Scenario = {
  name: string;
  chart: ChartData;
  highlightKeys?: string[];
  note: string;
};

const build = (utc: Date, lat: number, lon: number, label: string, extra: Partial<Parameters<typeof calculateChart>[6]> = {}) =>
  calculateChart(utc, lat, lon, label, null, 7, { houseSystem: "wholeSign", zodiacFrame: "tropical", ...extra });

/** Vòng tròn dựng từ dữ liệu tự đặt — dùng để thử các ca xấu (10 hành tinh dồn một chỗ). */
const stellium = (): ChartData => {
  const chart = build(new Date(Date.UTC(2000, 0, 1, 12, 0)), 21.0285, 105.8542, "Thử stellium");
  const keys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  return {
    ...chart,
    planets: chart.planets.map((planet, index) => ({
      ...planet,
      key: planet.key,
      longitude: keys.includes(planet.key) ? 118.4 + index * 0.9 : planet.longitude,
      retrograde: index % 3 === 0
    }))
  };
};

const scenarios: Scenario[] = [
  {
    name: "wheel-01-ha-noi-1996",
    chart: build(new Date(Date.UTC(1996, 10, 10, 17, 30)), 21.0285, 105.8542, "Hà Nội"),
    note: "lá số mặc định (Hà Nội 11/11/1996)"
  },
  {
    name: "wheel-02-nhan-goc-tren-dinh",
    chart: {
      ...build(new Date(Date.UTC(1996, 10, 10, 17, 30)), 21.0285, 105.8542, "Hà Nội — AC ở đỉnh"),
      ascendant: 0,
      descendant: 180,
      midheaven: 90,
      imumCoeli: 270
    },
    note: "AC/DC/MC/IC ở đúng đỉnh–đáy: ca mà bản cũ bị cắt nhãn"
  },
  {
    name: "wheel-03-stellium",
    chart: stellium(),
    highlightKeys: ["sun", "moon"],
    note: "10 hành tinh dồn trong ~9°"
  },
  {
    name: "wheel-04-vong-cuc",
    chart: build(new Date(Date.UTC(1985, 5, 21, 10, 0)), 69.65, 18.96, "Tromsø", { houseSystem: "placidus" }),
    note: "vĩ độ 69,65° (ngoài vòng cực) — hệ Placidus tự chuyển Porphyry"
  },
  {
    name: "wheel-05-ve-da-lahiri",
    chart: build(new Date(Date.UTC(2004, 4, 5, 11, 45)), 10.7769, 106.7009, "Sài Gòn", { zodiacFrame: "lahiri" }),
    note: "hệ hoàng đạo sidereal (Lahiri)"
  }
];

mkdirSync(".cache/shots", { recursive: true });

for (const scenario of scenarios) {
  const svg = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(ChartWheel, {
        planets: scenario.chart.planets,
        aspects: scenario.chart.aspects,
        houses: scenario.chart.houses,
        ascendant: scenario.chart.ascendant,
        descendant: scenario.chart.descendant,
        midheaven: scenario.chart.midheaven,
        imumCoeli: scenario.chart.imumCoeli,
        highlightKeys: scenario.highlightKeys ?? []
      })
    )
  ).replace(/^<div>|<\/div>$/g, "");

  // Thêm lưới vùng an toàn để nhìn ra phần tử nào lấn ra mép khung.
  const guide = `<rect x="${WHEEL_SAFE_MARGIN}" y="${WHEEL_SAFE_MARGIN}" width="${WHEEL_SIZE - WHEEL_SAFE_MARGIN * 2}" height="${
    WHEEL_SIZE - WHEEL_SAFE_MARGIN * 2
  }" fill="none" stroke="#f43f5e" stroke-width="1" stroke-dasharray="6 6" />`;
  const withSvgHeader = svg.replace("<svg", '<svg width="' + WHEEL_SIZE + '" height="' + WHEEL_SIZE + '"').replace(">", `>${guide}`);

  const image = await loadImage(Buffer.from(withSvgHeader));
  const canvas = createCanvas(PIXELS, PIXELS);
  const context = canvas.getContext("2d");
  context.fillStyle = "#020617";
  context.fillRect(0, 0, PIXELS, PIXELS);
  context.drawImage(image, 0, 0, PIXELS, PIXELS);

  const file = `.cache/shots/${scenario.name}${SUFFIX}.png`;
  writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(`✦ ${file} — ${scenario.note}`);
}

console.log("\nLưới đỏ nét đứt là vùng an toàn; mọi nét vẽ phải nằm trong đó (không chạm lưới).");
