/**
 * Render thử "Ngắm bầu trời 3D" ra PNG bằng @napi-rs/canvas để kiểm tra bằng mắt.
 * Chạy: npm run shot:sky3d   (kết quả ở .cache/shots/)
 *
 * Biến môi trường: SHOT_W, SHOT_H (mặc định 1280×720).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { SKY_3D_TOGGLES, drawSky3D } from "@/lib/sky3d-render";
import { createSpriteCache } from "@/lib/sky-render";
import { buildSkyFrame } from "@/lib/sky-visual";
import { centerCameraOn, skyRotationMatrix, type Camera3D } from "@/lib/sky3d";
import type { Sky3DToggles } from "@/lib/sky3d-render";

const WIDTH = Number(process.env.SHOT_W ?? 1280);
const HEIGHT = Number(process.env.SHOT_H ?? 720);
const LAT = 21.0285;
const LON = 105.8542;

type Scenario = {
  name: string;
  iso: string;
  camera: Camera3D;
  /** Tua thời gian: độ dài vệt sao (độ) — mô phỏng đang phát ở tốc độ cao. */
  trailDegrees?: number;
  toggles?: Partial<Sky3DToggles>;
  lat?: number;
  lon?: number;
  /** Nhãn mô tả để in ra console. */
  note?: string;
  /** Hướng camera vào một thiên thể (khoá trong frame.planets) trước khi vẽ. */
  aim?: string;
};

const scenarios: Scenario[] = [
  { name: "3d-01-dem-nhin-nam", iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, note: "đêm, nhìn về Nam" },
  { name: "3d-02-dem-rong", iso: "1996-11-10T17:30:00Z", camera: { yaw: 120, pitch: 24, fov: 100 }, note: "góc rộng 100°" },
  { name: "3d-03-phong-to", iso: "1996-11-10T17:30:00Z", camera: { yaw: 83, pitch: 16, fov: 14 }, note: "phóng to 14° (như ống nhòm)" },
  { name: "3d-04-ngua-len", iso: "1996-11-10T17:30:00Z", camera: { yaw: 60, pitch: 76, fov: 62 }, note: "ngửa gần thiên đỉnh" },
  { name: "3d-05-chang-vang", iso: "1996-11-11T11:05:00Z", camera: { yaw: 250, pitch: 8, fov: 70 }, note: "chạng vạng, Mặt Trời dưới chân trời" },
  { name: "3d-06-ban-ngay", iso: "1996-11-11T05:00:00Z", camera: { yaw: 140, pitch: 18, fov: 70 }, note: "ban ngày, thấy Mặt Trời" },
  { name: "3d-07-mat-dat", iso: "1996-11-10T17:30:00Z", camera: { yaw: 200, pitch: -9, fov: 74 }, note: "cúi xuống: lưới khoảng cách" },
  { name: "3d-08-mat-trang", iso: "2026-09-20T14:00:00Z", camera: { yaw: 90, pitch: 30, fov: 6 }, aim: "moon", note: "soi Mặt Trăng (pha thật, trăng trương huyền thượng huyền)" },
  { name: "3d-13-mat-troi", iso: "1996-11-11T05:00:00Z", camera: { yaw: 140, pitch: 30, fov: 9 }, aim: "sun", note: "soi Mặt Trời ban ngày" },
  { name: "3d-14-sao-moc", iso: "2026-01-15T13:00:00Z", camera: { yaw: 100, pitch: 25, fov: 10 }, aim: "jupiter", note: "đĩa Sao Mộc có vân + Vết Đỏ" },
  { name: "3d-15-sao-tho", iso: "2026-01-15T13:00:00Z", camera: { yaw: 100, pitch: 25, fov: 10 }, aim: "saturn", note: "Sao Thổ tròn đầy + vành đai" },
  { name: "3d-16-sao-kim", iso: "2026-09-28T11:30:00Z", camera: { yaw: 244, pitch: 8, fov: 8 }, aim: "venus", note: "Sao Kim lưỡi liềm thật (góc pha lớn)" },
  {
    name: "3d-09-vet-sao",
    iso: "1996-11-10T17:30:00Z",
    camera: { yaw: 0, pitch: 62, fov: 78 },
    trailDegrees: 26,
    note: "tua thời gian → vệt sao quanh cực"
  },
  {
    name: "3d-10-khong-khi-quyen",
    iso: "1996-11-10T17:30:00Z",
    camera: { yaw: 180, pitch: 14, fov: 64 },
    toggles: { atmosphere: false, ground: false },
    note: "tắt khí quyển + mặt đất"
  },
  { name: "3d-11-nam-ban-cau", iso: "2026-09-16T14:00:00Z", camera: { yaw: 180, pitch: 18, fov: 70 }, lat: -33.87, lon: 151.21, note: "Sydney" },
  { name: "3d-12-tron-mot-vong", iso: "2026-09-16T14:00:00Z", camera: { yaw: 300, pitch: 5, fov: 110 }, note: "fov tối đa 110°" },
  { name: "3d-17-tieu-hanh-tinh", iso: "2026-09-16T12:30:00Z", camera: { yaw: 150, pitch: 40, fov: 10 }, aim: "juno", note: "phóng sâu vào tiểu hành tinh Juno" },
  { name: "3d-18-thien-dinh-ngay", iso: "1996-11-11T05:00:00Z", camera: { yaw: 180, pitch: 89, fov: 20 }, note: "ngẩng hết cỡ ban ngày — thiên đỉnh liền màu, không lỗ hổng" }
];

mkdirSync(".cache/shots", { recursive: true });

for (const scenario of scenarios) {
  const date = new Date(scenario.iso);
  const latitude = scenario.lat ?? LAT;
  const longitude = scenario.lon ?? LON;
  const frame = buildSkyFrame(date, latitude, longitude);
  const aimed = scenario.aim
    ? frame.planets.find((planet) => planet.key === scenario.aim) ??
      frame.asteroids.find((asteroid) => asteroid.key === scenario.aim)
    : undefined;
  const camera: Camera3D = aimed
    ? centerCameraOn(scenario.camera, { alt: aimed.alt, az: aimed.az })
    : scenario.camera;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  const started = Date.now();

  const result = drawSky3D({
    ctx: context as unknown as CanvasRenderingContext2D,
    width: WIDTH,
    height: HEIGHT,
    camera,
    frame,
    rotation: skyRotationMatrix(0, latitude),
    latitude,
    toggles: { ...SKY_3D_TOGGLES, ...scenario.toggles },
    selected: null,
    sprites: createSpriteCache(),
    spriteFactory: (width, height) => createCanvas(width, height),
    timeMs: 0,
    trailDegrees: scenario.trailDegrees ?? 0
  });

  const file = `.cache/shots/${scenario.name}-${WIDTH}x${HEIGHT}.png`;
  writeFileSync(file, canvas.toBuffer("image/png"));

  // Bản "tăng sáng" để soi cấu trúc mờ trên màn hình (không dùng trong ứng dụng).
  const review = createCanvas(WIDTH, HEIGHT);
  const reviewContext = review.getContext("2d");
  reviewContext.filter = "brightness(2.4) saturate(1.2)";
  reviewContext.drawImage(canvas, 0, 0);
  writeFileSync(`.cache/shots/${scenario.name}-${WIDTH}x${HEIGHT}-bright.png`, review.toBuffer("image/png"));

  console.log(
    `${scenario.name}: ${Date.now() - started} ms · ${scenario.note ?? ""} · sao ${result.drawnStars}/${result.visibleStars}` +
      ` · vật thể bấm được ${result.hits.length} · Mặt Trời ${frame.sunAlt.toFixed(1)}°`
  );
}
