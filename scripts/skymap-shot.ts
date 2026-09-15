/**
 * Render thử bản đồ sao ra PNG bằng @napi-rs/canvas để kiểm tra bằng mắt.
 * Chạy: npm run shot:sky   (kết quả ở .cache/shots/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { createSpriteCache, drawSky } from "@/lib/sky-render";
import { buildSkyFrame, type SkyMode, type SkyView } from "@/lib/sky-visual";
import type { SkyDrawToggles } from "@/lib/sky-render";

const WIDTH = Number(process.env.SHOT_W ?? 1000);
const HEIGHT = Number(process.env.SHOT_H ?? 620);
const LAT = 21.0285;
const LON = 105.8542;

const baseToggles: SkyDrawToggles = {
  lines: true,
  constellationNames: true,
  starNames: true,
  deepSky: true,
  milkyWay: true,
  ecliptic: true,
  planets: true,
  grid: true,
  atmosphere: true,
  ground: true
};

type Scenario = {
  name: string;
  iso: string;
  mode: SkyMode;
  zoom: number;
  centerRa?: number;
  centerDec?: number;
  toggles?: Partial<SkyDrawToggles>;
  lat?: number;
  lon?: number;
};

const scenarios: Scenario[] = [
  { name: "01-horizon-night", iso: "1996-11-10T17:30:00Z", mode: "horizon", zoom: 1 },
  { name: "02-horizon-night-zoom", iso: "1996-11-10T17:30:00Z", mode: "horizon", zoom: 3.2 },
  { name: "03-horizon-twilight", iso: "1996-11-11T11:05:00Z", mode: "horizon", zoom: 1.15 },
  { name: "04-horizon-day", iso: "1996-11-11T05:00:00Z", mode: "horizon", zoom: 1.15 },
  { name: "05-map-night", iso: "1996-11-10T17:30:00Z", mode: "map", zoom: 1 },
  { name: "06-map-night-zoom", iso: "1996-11-10T17:30:00Z", mode: "map", zoom: 3.5, centerRa: 84, centerDec: -1.5 },
  { name: "07-horizon-no-atmosphere", iso: "1996-11-10T17:30:00Z", mode: "horizon", zoom: 1, toggles: { atmosphere: false, ground: false } },
  { name: "08-horizon-south", iso: "2026-09-16T14:00:00Z", mode: "horizon", zoom: 1.6, lat: -33.87, lon: 151.21 },
  { name: "09-wide-horizon", iso: "2026-09-16T14:00:00Z", mode: "horizon", zoom: 1 },
  { name: "10-wide-map", iso: "2026-09-16T14:00:00Z", mode: "map", zoom: 1 },
  { name: "11-phone-horizon", iso: "2026-09-16T14:00:00Z", mode: "horizon", zoom: 1 },
  { name: "12-phone-map", iso: "2026-09-16T14:00:00Z", mode: "map", zoom: 1.6, centerRa: 266, centerDec: -28 }
];

mkdirSync(".cache/shots", { recursive: true });

for (const scenario of scenarios) {
  const date = new Date(scenario.iso);
  const latitude = scenario.lat ?? LAT;
  const longitude = scenario.lon ?? LON;
  const frame = buildSkyFrame(date, latitude, longitude);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  const view: SkyView = {
    zoom: scenario.zoom,
    x: 0,
    y: 0,
    centerRa: scenario.centerRa ?? frame.lstDeg,
    centerDec: scenario.centerDec ?? (latitude >= 0 ? 20 : -20)
  };

  const started = Date.now();
  drawSky({
    ctx: context as unknown as CanvasRenderingContext2D,
    width: WIDTH,
    height: HEIGHT,
    mode: scenario.mode,
    view,
    frame,
    toggles: { ...baseToggles, ...scenario.toggles },
    selected: null,
    sprites: createSpriteCache(),
    spriteFactory: (width, height) => createCanvas(width, height)
  });

  const suffix = `${WIDTH}x${HEIGHT}`;
  const file = `.cache/shots/${scenario.name}-${suffix}.png`;
  writeFileSync(file, canvas.toBuffer("image/png"));

  // Bản "tăng sáng" để soi cấu trúc trên màn hình (không dùng trong ứng dụng).
  const review = createCanvas(WIDTH, HEIGHT);
  const reviewContext = review.getContext("2d");
  reviewContext.filter = "brightness(2.6) saturate(1.15)";
  reviewContext.drawImage(canvas, 0, 0);
  writeFileSync(`.cache/shots/${scenario.name}-${suffix}-bright.png`, review.toBuffer("image/png"));
  console.log(
    `${scenario.name}: ${Date.now() - started} ms · Mặt Trời ${frame.sunAlt.toFixed(1)}° · LST ${(frame.lstDeg / 15).toFixed(2)}h`
  );
}
