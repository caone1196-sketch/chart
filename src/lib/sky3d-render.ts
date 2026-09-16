/**
 * Bộ vẽ "Ngắm bầu trời 3D" trên canvas 2D.
 *
 * Tại sao vẫn là canvas 2D mà trông như 3D: mọi thiên thể là một **hướng** trên thiên cầu,
 * và `makeCamera3D` (sky3d.ts) chiếu các hướng đó qua một camera phối cảnh thật (pinhole).
 * Bộ vẽ này chỉ việc tô lên mặt phẳng ảnh theo đúng thứ tự trước–sau:
 *
 *   nền trời theo dải độ cao → Ngân Hà → sao → đường hoàng đạo & chòm sao → thiên thể sâu
 *   → hành tinh / Mặt Trăng / Mặt Trời → mặt đất (nửa dưới đường chân trời) → địa hình 3 lớp
 *   → lưới phối cảnh mặt đất → la bàn chân trời → nhãn (tự tránh đè) → vòng ngắm đối tượng chọn.
 *
 * Những điểm làm bản này "thật" hơn bản 2D:
 *  - chân trời là **đường thẳng**, các vòng độ cao là đường cong hội tụ đúng phối cảnh;
 *  - Mặt Trời/Mặt Trăng có bán kính **góc thật** (0,25°) → phóng to thì to ra đúng như ống nhòm;
 *  - mặt đất có lưới khoảng cách hội tụ về chân trời (mắt cao 1,65 m) cho cảm giác đứng tại chỗ;
 *  - sao nhấp nháy (scintillation) mạnh dần khi xuống thấp, và **vạch cung** khi tua thời gian;
 *  - khí quyển: khúc xạ Bennett, hấp thụ Kasten–Young, màu trời theo độ cao Mặt Trời, ráng chiều.
 *
 * Không dùng DOM/API trình duyệt ngoài CanvasRenderingContext2D nên chạy được cả trong Node
 * (`@napi-rs/canvas` cho `npm run shot:sky3d` và `npm run test:sky3d`).
 */
import { DEEP_SKY, STARS, precessFromJ2000, toHorizontal } from "./sky";
import { ZODIAC_SIGNS } from "./astro";
import {
  clamp,
  clamp01,
  extinctionMag,
  mixColor,
  rgbCss,
  skyTone,
  smoothstep,
  starAppearance,
  starTint,
  starTintIndex,
  terrainHeightDeg,
  moonGeometry,
  type MoonGeometry,
  type Rgb,
  type SkyFrame,
  type SkyTone
} from "./sky-visual";
import {
  COMPASS_8,
  GROUND_RINGS_M,
  angularSeparationDeg,
  PROJECT_NEAR,
  altAzOf,
  applyMatrix3,
  clampCamera,
  directionOf,
  dot3,
  groundAltitudeAt,
  length3,
  groundRingPath,
  makeCamera3D,
  normalize3,
  projectPath,
  refractDirection,
  scintillation,
  skyRotationMatrix,
  slerp3,
  splitPath,
  yawDelta,
  type Camera3D,
  type Camera3DProjector,
  type ScreenPoint,
  type Vec3
} from "./sky3d";
import {
  ensureSprites,
  sunMagnitudePenalty,
  type SkyDrawToggles,
  type SkyHit,
  type SkySelection,
  type SpriteCache,
  type SpriteFactory
} from "./sky-render";

export type Sky3DToggles = SkyDrawToggles & {
  /** Lưới xích đạo trời (xích vĩ / xích kinh) — quay theo sao nên thấy rõ vòm trời quay khi tua. */
  equatorial: boolean;
  /** Nhấp nháy khí quyển. */
  twinkle: boolean;
  /** Vệt sao khi tua thời gian. */
  trails: boolean;
  /** Lưới khoảng cách trên mặt đất. */
  groundGrid: boolean;
  /** Tiểu hành tinh (Ceres, Pallas, Vesta…) — hiện rõ khi phóng to. */
  asteroids: boolean;
};

export const SKY_3D_TOGGLES: Sky3DToggles = {
  lines: true,
  constellationNames: true,
  starNames: true,
  deepSky: true,
  milkyWay: true,
  ecliptic: true,
  planets: true,
  asteroids: true,
  grid: true,
  equatorial: true,
  atmosphere: true,
  ground: true,
  twinkle: true,
  trails: true,
  groundGrid: true
};

export type Sky3DDrawInput = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  camera: Camera3D;
  frame: SkyFrame;
  /** Ma trận quay bầu trời từ thời điểm dựng khung tới thời điểm đang hiển thị (ΔLST). */
  rotation: number[];
  latitude: number;
  toggles: Sky3DToggles;
  selected: SkySelection;
  sprites: SpriteCache;
  spriteFactory: SpriteFactory;
  /** Thời gian (ms) dùng cho nhấp nháy — tất định nên ảnh chụp màn hình vẫn tái lập được. */
  timeMs: number;
  /** Độ dài vệt sao (độ) khi tua thời gian; 0 thì vẽ điểm. */
  trailDegrees: number;
};

export type Sky3DDrawResult = {
  hits: SkyHit[];
  /** Số sao đã vẽ / số sao thấy được trong khung — dùng cho thống kê và kiểm tra. */
  drawnStars: number;
  visibleStars: number;
  camera: Camera3D;
};

const DEG = Math.PI / 180;

type LabelBox = { x0: number; y0: number; x1: number; y1: number };

const labelBox = (x: number, y: number, width: number, height: number): LabelBox => ({
  x0: x - width / 2,
  y0: y - height / 2,
  x1: x + width / 2,
  y1: y + height / 2
});

const boxesOverlap = (a: LabelBox, b: LabelBox) => !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);

const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { font: string; color: string; align?: CanvasTextAlign; shadow?: string }
) => {
  ctx.font = options.font;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "alphabetic";
  if (options.shadow) {
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = options.shadow;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = options.color;
  ctx.fillText(text, x, y);
};

/** "#rrggbb" → bộ ba kênh màu (màu hành tinh trong dữ liệu là hex). */
const hexToRgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value)) return [255, 255, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const DSO_SYMBOL: Record<string, "cluster" | "nebula" | "galaxy"> = {
  oc: "cluster",
  gc: "cluster",
  cl: "cluster",
  s: "galaxy",
  sd: "galaxy",
  e: "galaxy",
  i: "galaxy",
  gg: "galaxy",
  gxy: "galaxy",
  en: "nebula",
  rn: "nebula",
  bn: "nebula",
  pn: "nebula",
  snr: "nebula",
  sfr: "nebula",
  neb: "nebula",
  pos: "cluster"
};

const ALWAYS_LABELLED_DSO = ["M31", "M42", "M45", "M8", "M13", "M44", "ω Cen", "LMC", "SMC"];

/** Kích thước đĩa hiển thị (px ở zoom 1) và cường độ quầng cho từng hành tinh. */
const PLANET_BODY: Record<string, { radius: number }> = {
  mercury: { radius: 4.5 },
  venus: { radius: 6.5 },
  mars: { radius: 5.5 },
  jupiter: { radius: 10 },
  saturn: { radius: 8.5 },
  uranus: { radius: 6 },
  neptune: { radius: 6 }
};

/**
 * Vẽ đĩa hành tinh "sống động": vân mây Sao Mộc + Vết Đỏ Lớn, vành đai Sao Thổ, chóp băng Sao Hỏa,
 * xoáy mây Sao Kim, hố va chạm Sao Thủy, đốm tối Sao Hải Vương… Tất cả tất định (không ngẫu nhiên)
 * để ảnh chụp màn hình tái lập được. Bán kính < 4 px thì chỉ tô màu cầu cho gọn.
 *
 * Khi phóng to sâu (bán kính đĩa ≥ ~14–18 px) bộ vẽ bổ sung **tầng chi tiết cao**: Sao Mộc thêm
 * dải mây festoon + vùng xoáy quanh Vết Đỏ Lớn, Sao Hỏa thêm địa hình tối + quầng mù khí quyển,
 * Sao Thủy thêm hố và tia va chạm, Sao Thiên Vương có mũ cực, Sao Hải Vương có mây ti sáng…
 */
const drawPlanetBody = (
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  radius: number,
  tint: Rgb,
  lightAngle = -Math.PI / 3
) => {
  const disc = () => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  };
  // Nguồn sáng lệch về phía Mặt Trời: tâm gradient dịch theo hướng sáng nên đĩa trông như quả cầu.
  const lightX = x + Math.cos(lightAngle) * radius * 0.38;
  const lightY = y + Math.sin(lightAngle) * radius * 0.38;
  const base = ctx.createRadialGradient(lightX, lightY, radius * 0.12, x, y, radius * 1.05);
  base.addColorStop(0, rgbCss(mixColor(tint, [255, 255, 255], 0.42)));
  base.addColorStop(0.65, rgbCss(tint));
  base.addColorStop(1, rgbCss(mixColor(tint, [10, 10, 16], 0.5)));
  disc();
  ctx.fillStyle = base;
  ctx.fill();
  if (radius < 4) return;

  ctx.save();
  disc();
  ctx.clip();
  const band = (offset: number, thickness: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - radius, y + offset * radius - (thickness * radius) / 2, radius * 2, thickness * radius);
  };
  const blob = (ox: number, oy: number, rx: number, ry: number, color: string, rotate = 0) => {
    ctx.beginPath();
    ctx.ellipse(x + ox * radius, y + oy * radius, rx * radius, ry * radius, rotate, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  if (key === "jupiter") {
    band(-0.62, 0.2, "rgba(166,124,82,0.75)");
    band(-0.28, 0.16, "rgba(240,224,196,0.8)");
    band(-0.02, 0.22, "rgba(178,116,74,0.8)");
    band(0.3, 0.15, "rgba(238,220,190,0.75)");
    band(0.6, 0.2, "rgba(150,104,70,0.7)");
    if (radius >= 14) {
      // Phóng to: thêm dải mảnh hai cực + các festoon (vệt tối cắm vào dải sáng) ở vùng xích đạo.
      band(-0.86, 0.14, "rgba(124,92,64,0.5)");
      band(0.86, 0.12, "rgba(116,86,60,0.45)");
      for (let festoon = 0; festoon < 6; festoon += 1) {
        const fx = -0.72 + festoon * 0.3;
        blob(fx, 0.13, 0.05, 0.1, "rgba(150,104,72,0.5)", 0.18);
      }
      // Vùng xoáy sáng bao quanh Vết Đỏ Lớn.
      blob(0.28, 0.34, 0.34, 0.2, "rgba(246,236,214,0.75)");
    }
    blob(0.28, 0.34, 0.24, 0.13, "rgba(196,84,58,0.9)");
    if (radius >= 18) blob(0.28, 0.34, 0.13, 0.065, "rgba(232,120,84,0.95)");
  } else if (key === "saturn") {
    band(-0.35, 0.22, "rgba(214,186,140,0.6)");
    band(0.05, 0.2, "rgba(238,220,178,0.65)");
    band(0.45, 0.2, "rgba(196,166,120,0.55)");
    if (radius >= 14) {
      band(-0.62, 0.14, "rgba(186,158,116,0.5)");
      band(0.68, 0.13, "rgba(178,150,108,0.45)");
      band(-0.1, 0.06, "rgba(246,232,196,0.5)");
    }
  } else if (key === "mars") {
    blob(-0.15, 0.12, 0.5, 0.26, "rgba(96,44,28,0.6)", 0.3);
    blob(0.35, -0.3, 0.3, 0.16, "rgba(88,40,26,0.5)", -0.4);
    blob(0, -0.82, 0.32, 0.16, "rgba(250,248,244,0.92)");
    if (radius >= 14) {
      // Phóng to: thêm cao nguyên tối kiểu Syrtis Major, chóp băng Nam gọn hơn và quầng mù rìa.
      blob(-0.42, -0.18, 0.24, 0.15, "rgba(92,42,26,0.55)", 0.7);
      blob(0.1, 0.55, 0.3, 0.12, "rgba(102,48,30,0.45)", -0.2);
      blob(0, -0.86, 0.18, 0.09, "rgba(255,254,250,0.95)");
      ctx.strokeStyle = "rgba(240,214,180,0.3)";
      ctx.lineWidth = radius * 0.07;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.94, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (key === "venus") {
    ctx.strokeStyle = "rgba(255,250,228,0.4)";
    ctx.lineWidth = radius * 0.16;
    ctx.beginPath();
    ctx.arc(x - radius * 0.2, y - radius * 0.1, radius * 0.75, -0.6, 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + radius * 0.25, y + radius * 0.3, radius * 0.55, 2.4, 4.6);
    ctx.stroke();
    if (radius >= 14) {
      ctx.strokeStyle = "rgba(244,232,196,0.32)";
      ctx.lineWidth = radius * 0.1;
      ctx.beginPath();
      ctx.arc(x - radius * 0.05, y - radius * 0.42, radius * 0.5, 0.4, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + radius * 0.1, y + radius * 0.05, radius * 0.88, 2.8, 4.4);
      ctx.stroke();
    }
  } else if (key === "mercury") {
    blob(-0.25, -0.15, 0.18, 0.16, "rgba(70,66,64,0.55)");
    blob(0.3, 0.25, 0.13, 0.12, "rgba(70,66,64,0.5)");
    blob(0.05, -0.45, 0.1, 0.09, "rgba(70,66,64,0.45)");
    if (radius >= 12) {
      blob(-0.45, 0.35, 0.11, 0.1, "rgba(66,62,60,0.5)");
      blob(0.5, -0.2, 0.09, 0.08, "rgba(66,62,60,0.45)");
      blob(-0.05, 0.6, 0.08, 0.07, "rgba(66,62,60,0.4)");
      // Tia va chạm sáng toả ra từ một hố trẻ (kiểu hố Tycho trên Mặt Trăng).
      ctx.strokeStyle = "rgba(214,208,200,0.35)";
      ctx.lineWidth = radius * 0.03;
      for (let ray = 0; ray < 5; ray += 1) {
        const angle = 0.6 + ray * 1.25;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * radius * 0.32, y + Math.sin(angle) * radius * 0.32);
        ctx.lineTo(x + Math.cos(angle) * radius * 0.85, y + Math.sin(angle) * radius * 0.85);
        ctx.stroke();
      }
    }
  } else if (key === "uranus") {
    band(0.1, 0.3, "rgba(255,255,255,0.14)");
    if (radius >= 16) {
      band(-0.3, 0.18, "rgba(255,255,255,0.1)");
      blob(0, -0.62, 0.55, 0.3, "rgba(186,236,240,0.22)");
    }
  } else if (key === "neptune") {
    band(-0.2, 0.24, "rgba(255,255,255,0.16)");
    blob(-0.18, 0.15, 0.3, 0.17, "rgba(18,28,84,0.65)");
    if (radius >= 16) {
      ctx.strokeStyle = "rgba(236,244,255,0.5)";
      ctx.lineWidth = radius * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.6, y - radius * 0.42);
      ctx.quadraticCurveTo(x, y - radius * 0.55, x + radius * 0.55, y - radius * 0.4);
      ctx.stroke();
      blob(-0.3, 0.42, 0.16, 0.09, "rgba(20,30,92,0.55)");
    }
  }
  // Tối viền (limb darkening) đồng tâm — lưu ý: gradient hai tâm cắt nhau làm skia (napi-rs) panic.
  const limb = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius);
  limb.addColorStop(0, "rgba(0,0,0,0)");
  limb.addColorStop(1, "rgba(4,6,12,0.5)");
  ctx.fillStyle = limb;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  // Phía khuất sáng chìm dần sang tối: gradient tuyến tính dọc trục sáng → cảm giác khối cầu.
  const shade = ctx.createLinearGradient(
    x + Math.cos(lightAngle) * radius,
    y + Math.sin(lightAngle) * radius,
    x - Math.cos(lightAngle) * radius,
    y - Math.sin(lightAngle) * radius
  );
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.55, "rgba(0,0,0,0.08)");
  shade.addColorStop(1, "rgba(3,5,10,0.55)");
  ctx.fillStyle = shade;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
};

/** Nhiễu tất định theo số hiệu thiên thể — dùng sinh hình dạng tiểu hành tinh. */
const asteroidHash = (seed: number, index: number) => {
  const value = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Vẽ tiểu hành tinh như một **tảng đá vũ trụ**: silhouette đa giác lởm chởm tất định theo số hiệu,
 * vài hố va chạm sẫm màu và shading khối cầu theo hướng Mặt Trời. Ở bán kính nhỏ chỉ là chấm đá.
 */
const drawAsteroidBody = (
  ctx: CanvasRenderingContext2D,
  seed: number,
  x: number,
  y: number,
  radius: number,
  tint: Rgb,
  lightAngle: number
) => {
  const vertices = 11;
  const jitter = 0.16 + asteroidHash(seed, 0) * 0.1;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= vertices; i += 1) {
    const index = i % vertices;
    const angle = (index / vertices) * Math.PI * 2 + asteroidHash(seed, 40) * Math.PI;
    const vertexRadius = radius * (1 - jitter * 0.5 + asteroidHash(seed, index + 1) * jitter);
    const vx = x + Math.cos(angle) * vertexRadius;
    const vy = y + Math.sin(angle) * vertexRadius * (0.86 + asteroidHash(seed, 30) * 0.2);
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();

  const lightX = x + Math.cos(lightAngle) * radius * 0.4;
  const lightY = y + Math.sin(lightAngle) * radius * 0.4;
  const base = ctx.createRadialGradient(lightX, lightY, radius * 0.1, x, y, radius * 1.2);
  base.addColorStop(0, rgbCss(mixColor(tint, [255, 255, 255], 0.3)));
  base.addColorStop(0.6, rgbCss(tint));
  base.addColorStop(1, rgbCss(mixColor(tint, [6, 8, 12], 0.6)));
  ctx.fillStyle = base;
  ctx.fill();

  if (radius >= 4) {
    ctx.clip();
    const craters = radius >= 8 ? 5 : 3;
    for (let crater = 0; crater < craters; crater += 1) {
      const angle = asteroidHash(seed, crater + 60) * Math.PI * 2;
      const dist = asteroidHash(seed, crater + 70) * 0.6;
      const size = (0.1 + asteroidHash(seed, crater + 80) * 0.12) * radius;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * dist * radius, y + Math.sin(angle) * dist * radius, size, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(mixColor(tint, [4, 6, 10], 0.5), 0.6);
      ctx.fill();
    }
    const shade = ctx.createLinearGradient(
      x + Math.cos(lightAngle) * radius,
      y + Math.sin(lightAngle) * radius,
      x - Math.cos(lightAngle) * radius,
      y - Math.sin(lightAngle) * radius
    );
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.5, "rgba(0,0,0,0.12)");
    shade.addColorStop(1, "rgba(2,4,8,0.72)");
    ctx.fillStyle = shade;
    ctx.fillRect(x - radius * 1.4, y - radius * 1.4, radius * 2.8, radius * 2.8);
  }
  ctx.restore();
};

/** Bán kính quỹ đạo trung bình (AU) — đủ chính xác để suy ra góc pha hành tinh. */
const ORBIT_RADIUS_AU: Record<string, number> = {
  mercury: 0.387,
  venus: 0.723,
  mars: 1.524,
  jupiter: 5.203,
  saturn: 9.537,
  uranus: 19.19,
  neptune: 30.07
};

/**
 * Pha hành tinh theo góc ly giác Mặt Trời–hành tinh (góc tại Trái Đất).
 *
 * Khác Mặt Trăng (góc pha ≈ góc ly giác), hành tinh ngoài có góc pha RẤT nhỏ nên luôn gần tròn
 * đầy; Sao Kim/Sao Thủy mới khuyết rõ. Giải tam giác Trái Đất–Mặt Trời–hành tinh với quỹ đạo
 * tròn: Δ = cos e + √(r² − sin² e) rồi cos α = (r² + Δ² − 1) / (2 r Δ), α là góc pha tại hành tinh.
 */
export const planetPhase = (
  key: string,
  elongationDeg: number,
  distances?: { sunToPlanetAu?: number; earthToPlanetAu?: number; earthToSunAu?: number }
): MoonGeometry & { cosPhase: number } => {
  const orbit = distances?.sunToPlanetAu ?? ORBIT_RADIUS_AU[key];
  const delta = distances?.earthToPlanetAu;
  const earthSun = distances?.earthToSunAu ?? 1;
  if (orbit && delta && delta > 1e-6) {
    // Nghiệm chính xác từ tam giác Trái Đất–Mặt Trời–hành tinh (cosin định lý tại hành tinh).
    const cosPhase = clamp((orbit * orbit + delta * delta - earthSun * earthSun) / (2 * orbit * delta), -1, 1);
    return { illumination: (1 + cosPhase) / 2, terminatorRatio: Math.abs(cosPhase), cosPhase };
  }
  if (!orbit) {
    const geometry = moonGeometry(elongationDeg);
    return { ...geometry, cosPhase: -Math.cos((clamp(elongationDeg, 0, 180) * Math.PI) / 180) };
  }
  // Dự phòng quỹ đạo tròn khi thiếu khoảng cách thật.
  const e = clamp(elongationDeg, 0, 180) * DEG;
  const sinE = Math.min(Math.sin(e), orbit / earthSun);
  const approxDelta = Math.cos(e) + Math.sqrt(Math.max(0, orbit * orbit - sinE * sinE));
  const cosPhase = approxDelta > 1e-9 ? clamp((orbit * orbit + approxDelta * approxDelta - 1) / (2 * orbit * approxDelta), -1, 1) : -1;
  return { illumination: (1 + cosPhase) / 2, terminatorRatio: Math.abs(cosPhase), cosPhase };
};

/** Vành đai Sao Thổ: nửa sau vẽ trước đĩa, nửa trước vẽ đè lên sau đĩa. */

/**
 * Hướng sáng trên màn hình của một thiên thể: chiếu tiếp tuyến đường tròn lớn từ thiên thể về
 * Mặt Trời lên hai trục màn hình. Không dùng toạ độ chiếu của Mặt Trời vì khi nó nằm SAU camera
 * thì phép chiếu trả về NaN (và NaN truyền vào ctx.ellipse làm skia của napi-rs abort).
 */
const sunLightAngle = (sunVector: Vec3 | null, bodyVector: Vec3, projector: Camera3DProjector): number => {
  if (!sunVector) return -Math.PI / 3;
  const along = dot3(sunVector, bodyVector);
  const tangent = {
    x: sunVector.x - bodyVector.x * along,
    y: sunVector.y - bodyVector.y * along,
    z: sunVector.z - bodyVector.z * along
  };
  if (length3(tangent) <= 1e-9) return -Math.PI / 3;
  const unit = normalize3(tangent);
  return Math.atan2(-dot3(unit, projector.up), dot3(unit, projector.right));
};

const drawSaturnRings = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, from: number, to: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.32);
  const rings: Array<[number, number, string]> = [
    [1.55, 0.16, "rgba(216,196,158,0.75)"],
    [1.85, 0.22, "rgba(196,176,140,0.6)"],
    [2.15, 0.1, "rgba(170,150,120,0.45)"]
  ];
  for (const [ringRadius, lineWidth, color] of rings) {
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRadius * radius, ringRadius * radius * 0.32, 0, from, to);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * radius;
    ctx.stroke();
  }
  ctx.restore();
};

/** Bán kính góc thật (độ) của Mặt Trời, Mặt Trăng và hành tinh — dùng khi phóng to. */
const TRUE_ANGULAR_RADIUS_DEG: Record<string, number> = {
  sun: 0.266,
  moon: 0.259,
  jupiter: 0.0055,
  saturn: 0.0046,
  venus: 0.0031,
  mars: 0.0025,
  mercury: 0.0013,
  uranus: 0.0009,
  neptune: 0.0007
};

/** Các mốc độ cao để tô nền trời: dày gần chân trời (màu đổi nhanh), thưa ở trên cao. */
const SKY_BANDS = [
  -12, -6, -3, -1, 0, 1, 2, 3.5, 5, 7, 9.5, 12, 15, 18.5, 22, 26, 30, 35, 40, 46, 52, 59, 66, 74, 82, 90
];

/** Màu trời tại một độ cao: chân trời sáng/ấm, thiên đỉnh sẫm/xanh, thêm ráng chiều lúc chạng vạng. */
export const skyColorAtAltitude = (tone: SkyTone, altDeg: number): Rgb => {
  if (altDeg <= -6) return mixColor(tone.horizon, tone.ground, 0.72);
  const rise = smoothstep(-4.5, 46, altDeg);
  const base = mixColor(tone.horizon, tone.zenith, rise);
  const duskNear = clamp01(tone.dusk * (1 - rise)) * 0.55;
  return mixColor(base, tone.glow, duskNear);
};

/** Giới hạn cấp sao nhìn được theo trường nhìn: càng phóng to (fov nhỏ) càng thấy sao mờ. */
export const magnitudeLimitFor = (fovDeg: number, sunAltDeg: number, atmosphere: boolean) => {
  const zoom = clamp(64 / clamp(fovDeg, 1, 180), 0.4, 24);
  // Danh mục sao chỉ sâu tới cấp 6,1; giữ giới hạn gần đáy danh mục để khung 3D (vốn chỉ là
  // một cửa sổ hẹp của thiên cầu) có mật độ sao trên màn hình tương đương bản 2D toàn cảnh.
  const base = clamp(5.9 + Math.log2(Math.max(zoom, 0.5)) * 0.4, 5.2, 6.1);
  return base + (atmosphere ? sunMagnitudePenalty(sunAltDeg) : 0);
};

/**
 * Vẽ bầu trời 3D. Trả về danh sách vật thể kèm toạ độ màn hình (để bấm chọn) và thống kê.
 */
export const drawSky3D = (input: Sky3DDrawInput): Sky3DDrawResult => {
  const { ctx, width, height, frame, rotation, latitude, toggles, selected, timeMs, trailDegrees } = input;
  const camera = clampCamera(input.camera);
  const projector: Camera3DProjector = makeCamera3D(camera, width, height);
  const sprites = ensureSprites(input.sprites, input.spriteFactory);
  const atmosphere = toggles.atmosphere;
  const tone = skyTone(frame.sunAlt);
  const zoom = clamp(64 / camera.fov, 0.4, 24);

  const hits: SkyHit[] = [];
  const labelBoxes: LabelBox[] = [];
  type DeferredLabel = { box: LabelBox; draw: () => void };
  const starLabelQueue: DeferredLabel[] = [];
  const dsoLabelQueue: DeferredLabel[] = [];
  const zodiacLabelQueue: DeferredLabel[] = [];
  const constellationLabelQueue: DeferredLabel[] = [];

  /** Xoay một hướng của khung (đã dựng ở thời điểm gốc) sang thời điểm đang hiển thị. */
  const spin = (alt: number, az: number): Vec3 => applyMatrix3(rotation, directionOf(alt, az));
  const placeLabel = (text: string, x: number, y: number, radius: number, style: { font: string; color: string; shadow?: string }) => {
    ctx.font = style.font;
    const textWidth = ctx.measureText(text).width;
    const candidates: Array<{ dx: number; dy: number; align: CanvasTextAlign }> = [
      { dx: radius + 5, dy: 3.5, align: "left" },
      { dx: -(radius + 5), dy: 3.5, align: "right" },
      { dx: 0, dy: radius + 14, align: "center" },
      { dx: 0, dy: -(radius + 8), align: "center" }
    ];
    for (const candidate of candidates) {
      const centerX =
        candidate.align === "left" ? x + candidate.dx + textWidth / 2 : candidate.align === "right" ? x + candidate.dx - textWidth / 2 : x + candidate.dx;
      const box = labelBox(centerX, y + candidate.dy - 4, textWidth + 10, 15);
      if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || box.y1 > height) continue;
      if (labelBoxes.some((placed) => boxesOverlap(placed, box))) continue;
      labelBoxes.push(box);
      drawText(ctx, text, x + candidate.dx, y + candidate.dy, { ...style, align: candidate.align });
      return;
    }
  };

  const flushLabels = (queue: DeferredLabel[]) => {
    for (const entry of queue) {
      if (entry.box.x0 < 0 || entry.box.x1 > width || entry.box.y0 < 0 || entry.box.y1 > height) continue;
      if (labelBoxes.some((placed) => boxesOverlap(placed, entry.box))) continue;
      labelBoxes.push(entry.box);
      entry.draw();
    }
  };

  /** Chênh phương vị so với hướng nhìn đã quấn về [-180, 180] — dùng chọn chỗ đặt nhãn. */
  const yawTowards = (azDeg: number) => yawDelta(camera.yaw, azDeg);

  /** Vẽ một dải (alt, az) đã cắt theo camera. */
  const strokePath = (points: Array<{ alt: number; az: number }>, style: string, lineWidth: number, dash?: number[], stepDeg = 2) => {
    const paths = projectPath(points, projector, stepDeg);
    if (paths.length === 0) return 0;
    ctx.strokeStyle = style;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash);
    for (const path of paths) {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
    if (dash) ctx.setLineDash([]);
    return paths.length;
  };

  /* ------------------------------------------------------------------ nền trời */
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  // Bước lấy mẫu theo phương vị: đủ dày để hai điểm kề nhau cách nhau ≤ ~10 px trên màn hình
  // (nếu không, cạnh dải màu sẽ thấy rõ là đa giác khi phóng to).
  const stepAz = clamp(10 * projector.degreesPerPixel, 0.06, 3);
  const altitudeCircle = (altDeg: number) => {
    const points: Array<{ alt: number; az: number }> = [];
    for (let az = 0; az < 360; az += stepAz) points.push({ alt: altDeg, az });
    points.push({ alt: altDeg, az: 360 });
    return points;
  };

  /** Khoảng độ cao mà khung hình thực sự chứa — để bỏ qua các dải màu không thể thấy. */
  const frameAltitudeRange = () => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const probes: Array<[number, number]> = [
      [0, 0], [width, 0], [0, height], [width, height],
      [width / 2, 0], [width / 2, height], [0, height / 2], [width, height / 2]
    ];
    for (const [x, y] of probes) {
      const { alt } = projector.inverse(x, y);
      if (!Number.isFinite(alt)) continue;
      if (alt < min) min = alt;
      if (alt > max) max = alt;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -90, max: 90 };
    return { min, max };
  };

  if (atmosphere) {
    // Tô từng dải theo độ cao: màu trời chỉ phụ thuộc độ cao nên cách này chính xác tuyệt đối,
    // còn gradient màn hình thì sai vì vòng độ cao chiếu phối cảnh thành đường cong.
    ctx.fillStyle = rgbCss(skyColorAtAltitude(tone, SKY_BANDS[0]));
    ctx.fillRect(0, 0, width, height);

    // Gradient dọc cho mỗi dải: hướng "dọc" lấy theo cột giữa khung (nơi dải gần nằm ngang nhất).
    // Nhờ vậy màu chuyển liên tục giữa các dải thay vì lộ bậc; với khung ngẩng cao (dải cong tròn
    // quanh thiên đỉnh) các bậc vốn đã rất nhỏ vì màu hội tụ về màu thiên đỉnh.
    const bandFill = (lowerAlt: number, upperAlt: number) => {
      const topPoint = projector.project(upperAlt, camera.yaw);
      const bottomPoint = projector.project(lowerAlt, camera.yaw);
      if (!topPoint.visible || !bottomPoint.visible || Math.abs(topPoint.y - bottomPoint.y) < 0.75) {
        return rgbCss(skyColorAtAltitude(tone, (lowerAlt + upperAlt) / 2));
      }
      const gradient = ctx.createLinearGradient(0, topPoint.y, 0, bottomPoint.y);
      gradient.addColorStop(0, rgbCss(skyColorAtAltitude(tone, upperAlt)));
      gradient.addColorStop(1, rgbCss(skyColorAtAltitude(tone, lowerAlt)));
      return gradient;
    };
    const range = frameAltitudeRange();
    for (let band = 0; band < SKY_BANDS.length - 1; band += 1) {
      const lowerAlt = SKY_BANDS[band];
      const upperAlt = SKY_BANDS[band + 1];
      if (upperAlt < range.min - 3 || lowerAlt > range.max + 3) continue; // không thể thấy
      // Chồng mí một chút để không lộ đường ghép giữa hai dải (làm tròn màu + khử răng cưa).
      const overlap = Math.min(0.35, (upperAlt - lowerAlt) * 0.12 + 0.05);
      // KHÔNG lấy mẫu ngoài ±90°: vượt thiên đỉnh một chút là phương vị bị lật 180°, vòng trên biến
      // thành một vòng tròn nhỏ quanh thiên đỉnh và dải màu trở thành **hình vành khăn để thủng
      // đúng tâm** — phóng to sát thiên đỉnh ban ngày sẽ thấy một "lỗ hổng" màu của dải nền.
      // Kẹp mép trên về đúng 90°: mọi điểm vòng trên chập về thiên đỉnh nên dải khép kín thành hình
      // quạt phủ trọn tâm khung; mép dưới chỉ kẹp khi dải chạm sàn −90° (thực tế không xảy ra).
      const lower = altitudeCircle(Math.max(lowerAlt - overlap, -90));
      const upper = altitudeCircle(Math.min(upperAlt + overlap, 90));

      // Ghép hai vòng độ cao cùng chỉ số phương vị thành dải. Lưu ý KHÔNG dùng densifyPath ở đây:
      // nó chèn số bước khác nhau cho hai vòng (cung dài ngắn khác nhau) nên chỉ số sẽ lệch nhau.
      let bottom: ScreenPoint[] = [];
      let top: ScreenPoint[] = [];
      const fill = () => {
        if (bottom.length < 2) {
          bottom = [];
          top = [];
          return;
        }
        ctx.beginPath();
        ctx.moveTo(bottom[0].x, bottom[0].y);
        for (const point of bottom) ctx.lineTo(point.x, point.y);
        for (let i = top.length - 1; i >= 0; i -= 1) ctx.lineTo(top[i].x, top[i].y);
        ctx.closePath();
        ctx.fillStyle = bandFill(lowerAlt - overlap, upperAlt + overlap);
        ctx.fill();
        bottom = [];
        top = [];
      };

      for (let i = 0; i < lower.length; i += 1) {
        const bottomPoint = projector.projectVector(directionOf(lower[i].alt, lower[i].az));
        const topPoint = projector.projectVector(directionOf(upper[i].alt, upper[i].az));
        if (bottomPoint.visible && topPoint.visible) {
          bottom.push({ x: bottomPoint.x, y: bottomPoint.y });
          top.push({ x: topPoint.x, y: topPoint.y });
        } else {
          fill();
        }
      }
      fill();
    }

    // Ráng chiều / quầng sáng quanh Mặt Trời: hiệu ứng màn hình (tán xạ trong khí quyển).
    const sun = frame.planets.find((planet) => planet.key === "sun");
    if (sun) {
      const sunVector = refractDirection(spin(sun.alt, sun.az), atmosphere);
      const sunPoint = projector.projectVector(sunVector);
      if (sunPoint.visible && tone.glowStrength > 0.02) {
        const glowRadius = Math.max(width, height) * (0.42 + 0.5 * clamp01(tone.glowStrength));
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(sunPoint.x, sunPoint.y, 0, sunPoint.x, sunPoint.y, glowRadius);
        glow.addColorStop(0, rgbCss(tone.glow, clamp01(tone.glowStrength * 0.62)));
        glow.addColorStop(0.3, rgbCss(tone.glow, clamp01(tone.glowStrength * 0.26)));
        glow.addColorStop(1, rgbCss(tone.glow, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
    }
  } else {
    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#050915");
    background.addColorStop(1, "#01030a");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  /* ------------------------------------------------------------------ Ngân Hà */
  const starAlphaGlobal = atmosphere ? 0.05 + 0.95 * tone.starFactor : 1;
  if (toggles.milkyWay && starAlphaGlobal > 0.05) {
    const milkyAlpha = atmosphere ? 0.04 + 0.96 * Math.pow(tone.starFactor, 1.3) : 1;
    const sizeFactor = clamp(Math.pow(zoom, 0.5), 0.85, 3.6);
    ctx.globalCompositeOperation = "lighter";

    for (const point of frame.milkyWay) {
      if (point.grain || point.w * milkyAlpha < 0.05) continue;
      const spun = spin(point.alt, point.az);
      if (dot3(spun, projector.forward) <= PROJECT_NEAR) continue;
      const { alt } = altAzOf(spun);
      if (alt < -1.5) continue;
      const projected = projector.projectVector(refractDirection(spun, atmosphere && alt < 25));
      if (!projected.visible) continue;
      const size = point.size * sizeFactor;
      if (projected.x < -size || projected.x > width + size || projected.y < -size || projected.y > height + size) continue;
      const horizonFade = 0.2 + 0.8 * clamp01(alt / 28);
      ctx.globalAlpha = clamp01(point.w * milkyAlpha * horizonFade * 0.12 * starAlphaGlobal);
      const milkySprite = sprites.milky[point.tint];
      if (!milkySprite) continue;
      ctx.drawImage(milkySprite as unknown as CanvasImageSource, projected.x - size / 2, projected.y - size / 2, size, size);
    }

    for (const point of frame.milkyWay) {
      if (!point.grain) continue;
      const spun = spin(point.alt, point.az);
      if (dot3(spun, projector.forward) <= PROJECT_NEAR) continue;
      const { alt } = altAzOf(spun);
      if (alt < -1.5) continue;
      const horizonFade = 0.25 + 0.75 * clamp01(alt / 22);
      const alpha = clamp01(point.w * milkyAlpha * horizonFade * 0.42 * starAlphaGlobal);
      if (alpha < 0.05) continue;
      const projected = projector.projectVector(refractDirection(spun, atmosphere && alt < 25));
      if (!projected.visible || projected.x < -4 || projected.x > width + 4 || projected.y < -4 || projected.y > height + 4) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgbCss(starTint(point.tint === 0 ? 1.15 : point.tint === 1 ? 0.55 : 0.1));
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, point.size * 0.55 * clamp(sizeFactor, 0.9, 2.2), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* --------------------------------------------------------------------- lưới */
  if (toggles.grid) {
    for (const altitude of [15, 30, 45, 60, 75]) {
      strokePath(altitudeCircle(altitude), altitude % 30 === 0 ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.13)", 1);
      // Nhãn độ cao đặt ở phương vị gần hướng nhìn nhất.
      const labelAz = camera.yaw + 26;
      const labelPoint = projector.projectVector(spin(altitude, labelAz));
      if (labelPoint.visible && labelPoint.x > 20 && labelPoint.x < width - 20 && labelPoint.y > 12 && labelPoint.y < height - 12) {
        drawText(ctx, `${altitude}°`, labelPoint.x + 7, labelPoint.y - 4, {
          font: "9px system-ui, sans-serif",
          color: "rgba(148,163,184,0.66)",
          align: "left",
          shadow: "rgba(2,6,23,0.75)"
        });
      }
    }
    for (let az = 0; az < 360; az += 15) {
      strokePath(
        [
          { alt: 0, az },
          { alt: 78, az }
        ],
        "rgba(148,163,184,0.11)",
        1,
        undefined,
        3
      );
    }
  }

  /* ------------------------------------------ lưới xích đạo (quay theo vòm trời) */
  if (toggles.equatorial) {
    // Lưới này gắn hệ toạ độ xích đạo (của ngày) nên quay cùng sao: khi tua thời gian người xem
    // thấy cả "vòm" xoay quanh thiên cực chứ không chỉ vài ngôi sao trượt ngang.
    const eqAlpha = (atmosphere ? clamp01(0.3 + 0.7 * tone.starFactor) : 0.95) * 0.9;
    const equatorialPoint = (raDeg: number, decDeg: number) => {
      const horizontal = toHorizontal(raDeg, decDeg, frame.lstDeg, latitude);
      return altAzOf(applyMatrix3(rotation, directionOf(horizontal.alt, horizontal.az)));
    };
    let equatorLabel: ScreenPoint | null = null;
    for (const dec of [-60, -30, 0, 30, 60]) {
      const points: Array<{ alt: number; az: number }> = [];
      for (let ra = 0; ra <= 360; ra += 4) {
        const point = equatorialPoint(ra, dec);
        points.push(point);
        if (dec === 0 && !equatorLabel) {
          const delta = Math.abs(yawTowards(point.az));
          if (delta < 2) equatorLabel = projector.projectVector(directionOf(point.alt, point.az));
        }
      }
      strokePath(
        points,
        dec === 0 ? `rgba(250,204,21,${(0.4 * eqAlpha).toFixed(3)})` : `rgba(167,139,250,${(0.24 * eqAlpha).toFixed(3)})`,
        dec === 0 ? 1.3 : 1,
        dec === 0 ? [9, 6] : undefined,
        2
      );
    }
    for (let ra = 0; ra < 360; ra += 30) {
      const points: Array<{ alt: number; az: number }> = [];
      for (let dec = -75; dec <= 75; dec += 3) points.push(equatorialPoint(ra, dec));
      strokePath(points, `rgba(167,139,250,${(0.17 * eqAlpha).toFixed(3)})`, 1, undefined, 3);
    }
    if (equatorLabel && equatorLabel.x > 40 && equatorLabel.x < width - 40 && equatorLabel.y > 16 && equatorLabel.y < height - 16) {
      drawText(ctx, "xích đạo trời", equatorLabel.x + 8, equatorLabel.y - 5, {
        font: "9px system-ui, sans-serif",
        color: `rgba(250,204,21,${(0.75 * eqAlpha).toFixed(3)})`,
        align: "left",
        shadow: "rgba(2,6,23,0.75)"
      });
    }
  }

  /* ------------------------------------------------------- chòm sao & hoàng đạo */
  const lineAlpha = atmosphere ? clamp01(0.1 + 0.9 * tone.starFactor) : 1;
  if (toggles.lines && lineAlpha > 0.12) {
    ctx.strokeStyle = `rgba(125,211,252,${(0.36 * lineAlpha).toFixed(3)})`;
    ctx.lineWidth = 1.15;
    for (const line of frame.lines) {
      for (const segment of splitPath(line.points)) {
        const spun = segment.map((point) => altAzOf(spin(point.alt, point.az)));
        // Cắt bỏ phần dưới địa hình để nét không xuyên qua núi.
        const above = spun.filter((point) => point.alt >= (toggles.ground ? terrainHeightDeg(point.az, 2) - 0.2 : -1.5));
        for (const path of projectPath(above, projector, 1.6)) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      }
    }
  }

  if (toggles.ecliptic) {
    const eclipticSpun = frame.ecliptic.map((point) => altAzOf(spin(point.alt, point.az)));
    strokePath(eclipticSpun, "rgba(251,191,36,0.6)", 1.5, [6, 5], 1.2);

    const obliquity = (frame.obliquity * Math.PI) / 180;
    ZODIAC_SIGNS.forEach((sign, index) => {
      const longitude = (index * 30 + 15) * (Math.PI / 180);
      const ra = (Math.atan2(Math.sin(longitude) * Math.cos(obliquity), Math.cos(longitude)) * 180) / Math.PI;
      const dec = (Math.asin(Math.sin(obliquity) * Math.sin(longitude)) * 180) / Math.PI;
      const ofDate = precessFromJ2000(ra, dec, frame.date);
      const horizontal = toHorizontal(ofDate.ra, ofDate.dec, frame.lstDeg, latitude);
      const spun = altAzOf(applyMatrix3(rotation, directionOf(horizontal.alt, horizontal.az)));
      if (spun.alt < (toggles.ground ? terrainHeightDeg(spun.az, 2) + 2 : -1)) return;
      const projected = projector.projectVector(refractDirection(directionOf(spun.alt, spun.az), atmosphere && spun.alt < 25));
      if (!projected.visible || projected.x < 30 || projected.x > width - 30 || projected.y < 24 || projected.y > height - 24) return;
      const text = sign.name;
      ctx.font = "700 11px system-ui, sans-serif";
      zodiacLabelQueue.push({
        box: labelBox(projected.x, projected.y - 9, ctx.measureText(text).width + 10, 15),
        draw: () =>
          drawText(ctx, text, projected.x, projected.y - 9, {
            font: "700 11px system-ui, sans-serif",
            color: "rgba(251,191,36,0.92)",
            shadow: "rgba(2,6,23,0.8)"
          })
      });
    });
  }

  /* ------------------------------------------------------------- tên chòm sao */
  if (toggles.constellationNames) {
    // Ngưỡng số chòm được gọi tên nới rộng theo độ phóng: toàn cảnh vẫn gọi tên nhiều chòm hơn,
    // và từ zoom ~4× trở lên cả 88 chòm đều có thể hiển thị đủ tên (Việt + Latin).
    const rankLimit = zoom < 1.3 ? 44 : zoom < 2.4 ? 66 : zoom < 4 ? 80 : 88;
    const nameAlpha = atmosphere ? clamp01(0.15 + 0.85 * tone.starFactor) : 1;
    if (nameAlpha >= 0.2) {
      ctx.font = "600 11px system-ui, sans-serif";
      for (const meta of frame.constellationLabels) {
        if (meta.rank > rankLimit) continue;
        const spun = altAzOf(spin(meta.alt, meta.az));
        if (spun.alt < (toggles.ground ? terrainHeightDeg(spun.az, 2) + 2.5 : -1)) continue;
        const projected = projector.projectVector(directionOf(spun.alt, spun.az));
        if (!projected.visible) continue;

        // Đo thật hai dòng chữ (có dấu tiếng Việt rộng hơn ước lượng theo số ký tự) rồi **kẹp vị trí
        // nhãn vào trong khung** thay vì bỏ rơi nhãn sát mép — nhờ vậy tên chòm luôn hiển đủ chữ.
        const viText = meta.vi.toUpperCase();
        const widthVi = ctx.measureText(viText).width;
        ctx.font = "10px system-ui, sans-serif";
        const widthLatin = ctx.measureText(meta.latin).width;
        ctx.font = "600 11px system-ui, sans-serif";
        const halfWidth = Math.max(widthVi, widthLatin) / 2 + 6;
        if (halfWidth * 2 > width - 8) continue; // nhãn rộng hơn cả khung — không còn chỗ đặt
        const anchorX = clamp(projected.x, halfWidth + 2, width - halfWidth - 2);
        const anchorY = clamp(projected.y, 30, height - 30);

        constellationLabelQueue.push({
          box: labelBox(anchorX, anchorY + 5, halfWidth * 2, 28),
          draw: () => {
            drawText(ctx, viText, anchorX, anchorY, {
              font: "600 11px system-ui, sans-serif",
              color: `rgba(125,211,252,${(0.5 * nameAlpha).toFixed(3)})`,
              shadow: "rgba(2,6,23,0.7)"
            });
            drawText(ctx, meta.latin, anchorX, anchorY + 11, {
              font: "10px system-ui, sans-serif",
              color: `rgba(148,163,184,${(0.44 * nameAlpha).toFixed(3)})`,
              shadow: "rgba(2,6,23,0.7)"
            });
          }
        });
      }
    }
  }

  /* ------------------------------------------------------------ thiên thể sâu */
  if (toggles.deepSky && (!atmosphere || tone.starFactor > 0.22)) {
    const deepSkyAlpha = atmosphere ? clamp01(0.35 + 0.65 * tone.starFactor) : 1;
    ctx.globalAlpha = deepSkyAlpha;
    frame.deepSky.forEach((object, index) => {
      const spun = altAzOf(spin(object.alt, object.az));
      const floor = toggles.ground ? terrainHeightDeg(spun.az, 2) : -1.5;
      if (spun.alt < floor) return;
      const projected = projector.projectVector(refractDirection(directionOf(spun.alt, spun.az), atmosphere && spun.alt < 25));
      if (!projected.visible || projected.x < 0 || projected.x > width || projected.y < 0 || projected.y > height) return;
      const meta = DEEP_SKY[index];
      const symbol = DSO_SYMBOL[meta.type] ?? "nebula";
      const isSelected = selected?.kind === "deepsky" && selected.key === String(index);
      const symbolScale = clamp(Math.pow(zoom, 0.35), 1, 2.6);
      ctx.strokeStyle = isSelected ? "#facc15" : "rgba(129,230,217,0.7)";
      ctx.lineWidth = isSelected ? 2 : 1.1;
      ctx.beginPath();
      if (symbol === "cluster") {
        ctx.setLineDash([2, 2]);
        ctx.arc(projected.x, projected.y, 5 * symbolScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (symbol === "galaxy") {
        ctx.ellipse(projected.x, projected.y, 6 * symbolScale, 3.2 * symbolScale, 0.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.rect(projected.x - 4 * symbolScale, projected.y - 4 * symbolScale, 8 * symbolScale, 8 * symbolScale);
        ctx.stroke();
      }
      hits.push({ kind: "deepsky", key: String(index), x: projected.x, y: projected.y, radius: 12 * symbolScale });

      if (zoom > 2.4 || ALWAYS_LABELLED_DSO.includes(meta.id) || isSelected) {
        ctx.font = "10px system-ui, sans-serif";
        const text = meta.id;
        const textWidth = ctx.measureText(text).width;
        dsoLabelQueue.push({
          box: labelBox(projected.x + 9 + textWidth / 2, projected.y + 3, textWidth + 10, 15),
          draw: () =>
            drawText(ctx, text, projected.x + 9, projected.y + 3, {
              font: "10px system-ui, sans-serif",
              color: "rgba(129,230,217,0.92)",
              align: "left",
              shadow: "rgba(2,6,23,0.75)"
            })
        });
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------- các sao */
  const magnitudeLimit = magnitudeLimitFor(camera.fov, frame.sunAlt, atmosphere);
  const nameLimit = clamp(2.1 + Math.log2(Math.max(zoom, 0.5)) * 0.8, 1.4, 5.2);
  const starLabels: Array<{ x: number; y: number; index: number; mag: number; selected: boolean }> = [];
  const useTrails = toggles.trails && trailDegrees > 0.35;
  // Vệt sao = cung từ vị trí "trước đó" tới vị trí hiện tại. Bầu trời quay quanh trục cực nên
  // vị trí cũ chính là vector hiện tại quay ngược lại −trailDegrees (cùng trục, chỉ khác góc).
  const trailRotation = useTrails ? skyRotationMatrix(-trailDegrees, latitude) : null;
  const trailSteps = clamp(Math.ceil(trailDegrees / 1.2), 2, 28);
  let drawnStars = 0;
  let visibleStars = 0;

  ctx.globalCompositeOperation = "lighter";
  for (const star of frame.stars) {
    if (!Number.isFinite(star.alt)) continue;
    const spun = spin(star.alt, star.az);
    if (dot3(spun, projector.forward) <= PROJECT_NEAR) continue;
    visibleStars += 1;
    const spunAltAz = altAzOf(spun);
    const floor = toggles.ground ? terrainHeightDeg(spunAltAz.az, 2) - 0.15 : -1.5;
    if (spunAltAz.alt < floor || spunAltAz.alt < -2) continue;

    const extinction = atmosphere ? extinctionMag(spunAltAz.alt) : 0;
    const magnitude = star.mag + extinction;
    if (magnitude > magnitudeLimit) continue;

    const vector = refractDirection(spun, atmosphere && spunAltAz.alt < 25);
    const projected = projector.projectVector(vector);
    if (!projected.visible || projected.x < -24 || projected.x > width + 24 || projected.y < -24 || projected.y > height + 24) continue;

    const appearance = starAppearance(magnitude, zoom);
    const horizonFade = clamp01((spunAltAz.alt + 1.2) / 4);
    const twinkle = toggles.twinkle && atmosphere ? scintillation(star.index, timeMs, spunAltAz.alt) : 1;
    const alpha = clamp01(
      appearance.alpha * 1.22 * starAlphaGlobal * (0.4 + 0.6 * horizonFade) * Math.pow(2.512, -extinction * 0.35) * twinkle
    );
    if (alpha < 0.03) continue;
    drawnStars += 1;

    const tint = starTint(star.bv);
    const tintIndex = starTintIndex(star.bv);
    const isSelected = selected?.kind === "star" && selected.key === String(star.index);

    // Vệt sao khi tua thời gian: nội suy cung tròn lớn từ vị trí cũ tới vị trí hiện tại
    // (slerp) để vệt cong đúng theo đường tròn xích vĩ thay vì là một dây cung thẳng.
    if (trailRotation && appearance.radius > 0.42) {
      const fromVector = applyMatrix3(trailRotation, spun);
      const fromPoint = projector.projectVector(refractDirection(fromVector, atmosphere));
      if (fromPoint.visible) {
        ctx.globalAlpha = clamp01(alpha * 0.72);
        ctx.strokeStyle = rgbCss(tint);
        ctx.lineWidth = Math.max(0.55, appearance.radius * 1.45);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(fromPoint.x, fromPoint.y);
        for (let step = 1; step < trailSteps; step += 1) {
          const partialPoint = projector.projectVector(slerp3(fromVector, spun, step / trailSteps));
          if (!partialPoint.visible) break;
          ctx.lineTo(partialPoint.x, partialPoint.y);
        }
        ctx.lineTo(projected.x, projected.y);
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }

    if (appearance.haloAlpha > 0.02) {
      const haloSprite = sprites.halos[tintIndex];
      if (haloSprite) {
        const halo = appearance.haloRadius * clamp(Math.pow(zoom, 0.18), 0.9, 2.2);
        ctx.globalAlpha = clamp01(appearance.haloAlpha * starAlphaGlobal * twinkle);
        ctx.drawImage(haloSprite as unknown as CanvasImageSource, projected.x - halo, projected.y - halo, halo * 2, halo * 2);
      }
    }

    ctx.globalAlpha = isSelected ? 1 : alpha;
    ctx.fillStyle = isSelected ? "#fde68a" : rgbCss(tint);
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, Math.max(0.62, appearance.radius * 1.12), 0, Math.PI * 2);
    ctx.fill();

    if (appearance.spikeAlpha > 0.02) {
      ctx.globalAlpha = clamp01(appearance.spikeAlpha * starAlphaGlobal);
      ctx.strokeStyle = rgbCss(tint);
      ctx.lineWidth = 0.85;
      const length = appearance.spikeLength * clamp(Math.pow(zoom, 0.15), 0.9, 2);
      ctx.beginPath();
      ctx.moveTo(projected.x - length, projected.y);
      ctx.lineTo(projected.x + length, projected.y);
      ctx.moveTo(projected.x, projected.y - length);
      ctx.lineTo(projected.x, projected.y + length);
      ctx.stroke();
    }

    if (projected.x >= 0 && projected.x <= width && projected.y >= 0 && projected.y <= height) {
      hits.push({ kind: "star", key: String(star.index), x: projected.x, y: projected.y, radius: 11 });
    }
    if (toggles.starNames && alpha > 0.22 && star.labelIndex !== null && star.mag <= nameLimit) {
      starLabels.push({ x: projected.x, y: projected.y, index: star.index, mag: star.mag, selected: isSelected });
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  /* ---------------------------------------------------------------- tên sao */
  if (toggles.starNames) {
    starLabels.sort((a, b) => a.mag - b.mag);
    for (const label of starLabels) {
      const name = STARS[label.index].alternatives[0];
      if (!name) continue;
      const text = name.length > 16 ? `${name.slice(0, 15)}…` : name;
      ctx.font = "11px system-ui, sans-serif";
      const textWidth = ctx.measureText(text).width;
      starLabelQueue.push({
        box: labelBox(label.x + 6 + textWidth / 2, label.y - 4, textWidth + 8, 15),
        draw: () =>
          drawText(ctx, text, label.x + 6, label.y - 4, {
            font: "11px system-ui, sans-serif",
            color: label.selected ? "rgba(253,230,138,0.98)" : "rgba(226,232,240,0.78)",
            align: "left",
            shadow: "rgba(2,6,23,0.85)"
          })
      });
    }
  }

  /* ------------------------------------------------- hành tinh, Mặt Trăng, Mặt Trời */
  const bodies = frame.planets.filter((planet) => toggles.planets || planet.key === "sun" || planet.key === "moon");
  for (const planet of bodies) {
    const spun = altAzOf(spin(planet.alt, planet.az));
    const floor = toggles.ground ? terrainHeightDeg(spun.az, 2) - 0.8 : -2;
    if (spun.alt < floor) continue;
    const vector = refractDirection(directionOf(spun.alt, spun.az), atmosphere && spun.alt < 25);
    const projected = projector.projectVector(vector);
    if (!projected.visible) continue;
    if (projected.x < -width || projected.x > width * 2 || projected.y < -height || projected.y > height * 2) continue;
    if (atmosphere && tone.starFactor < 0.3 && planet.key !== "venus" && planet.key !== "jupiter" && planet.key !== "sun" && planet.key !== "moon") continue;

    const trueRadius = TRUE_ANGULAR_RADIUS_DEG[planet.key] ?? 0.002;
    const angularRadius = projector.radiusPixels(trueRadius, vector);
    const isSelected = selected?.kind === "planet" && selected.key === planet.key;

    if (planet.key === "sun") {
      const radius = Math.max(7, angularRadius);
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(projected.x, projected.y, radius * 0.5, projected.x, projected.y, radius * 22 + 90);
      halo.addColorStop(0, "rgba(255,246,220,0.6)");
      halo.addColorStop(0.14, "rgba(255,214,150,0.22)");
      halo.addColorStop(1, "rgba(255,190,120,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius * 22 + 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.fillStyle = "#fffbe8";
      ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      ctx.fill();
      // Nhật hoa: các tia mảnh xoay rất chậm theo thời gian cho cảm giác Mặt Trời "sống".
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,224,168,0.16)";
      ctx.lineWidth = Math.max(1, radius * 0.07);
      for (let ray = 0; ray < 12; ray += 1) {
        const angle = (ray / 12) * Math.PI * 2 + timeMs * 0.00002;
        const outer = radius * (1.4 + 0.32 * Math.abs(Math.sin(ray * 2.399)));
        ctx.beginPath();
        ctx.moveTo(projected.x + Math.cos(angle) * radius * 1.05, projected.y + Math.sin(angle) * radius * 1.05);
        ctx.lineTo(projected.x + Math.cos(angle) * outer, projected.y + Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      placeLabel("Mặt Trời", projected.x, projected.y, radius, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(255,247,214,0.95)",
        shadow: "rgba(2,6,23,0.85)"
      });
      if (projected.x >= -radius && projected.x <= width + radius && projected.y >= -radius && projected.y <= height + radius) {
        hits.push({ kind: "planet", key: "sun", x: projected.x, y: projected.y, radius: Math.max(18, radius) });
      }
      continue;
    }

    if (planet.key === "moon") {
      const radius = Math.max(6, angularRadius);
      const geometry = moonGeometry(frame.moonElongation);
      const sun = frame.planets.find((item) => item.key === "sun");
      const sunVector = sun ? spin(sun.alt, sun.az) : null;
      const sunPoint = sunVector ? projector.projectVector(sunVector) : null;
      const theta = sunPoint && sunPoint.visible ? Math.atan2(sunPoint.y - projected.y, sunPoint.x - projected.x) : -Math.PI / 2;
      const cosElongation = Math.cos((clamp(frame.moonElongation, 0, 180) * Math.PI) / 180);

      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(projected.x, projected.y, radius, projected.x, projected.y, radius * 7 + 26);
      halo.addColorStop(0, `rgba(226,236,255,${(0.08 + 0.32 * geometry.illumination).toFixed(3)})`);
      halo.addColorStop(1, "rgba(190,214,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius * 7 + 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Phần tối (ánh đất) rồi phần được chiếu sáng đúng theo pha và đúng hướng Mặt Trời.
      ctx.beginPath();
      ctx.fillStyle = "rgba(58,72,104,0.5)";
      ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (geometry.illumination > 0.012) {
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius, theta - Math.PI / 2, theta + Math.PI / 2, false);
        ctx.ellipse(
          projected.x,
          projected.y,
          geometry.terminatorRatio * radius,
          radius,
          theta,
          Math.PI / 2,
          -Math.PI / 2,
          cosElongation >= 0
        );
        ctx.closePath();
        const surface = ctx.createRadialGradient(projected.x, projected.y, radius * 0.2, projected.x, projected.y, radius);
        surface.addColorStop(0, "#fdfdf6");
        surface.addColorStop(1, "#dfe2ee");
        ctx.fillStyle = surface;
        ctx.fill();
      }
      placeLabel("Mặt Trăng", projected.x, projected.y, radius, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(235,240,255,0.95)",
        shadow: "rgba(2,6,23,0.85)"
      });
      if (projected.x >= -radius && projected.x <= width + radius && projected.y >= -radius && projected.y <= height + radius) {
        hits.push({ kind: "planet", key: "moon", x: projected.x, y: projected.y, radius: Math.max(16, radius) });
      }
      continue;
    }

    // Đĩa hành tinh: lấy max(bán kính góc thật, kích thước hiển thị tối thiểu) rồi nhân theo độ phóng
    // để phóng to thì hành tinh vừa to ra vừa lộ chi tiết vân mây / vành đai. Trần nới rộng hơn ở
    // độ phóng sâu (fov 5°) để tầng chi tiết cao của `drawPlanetBody` có đất diễn.
    const tint = hexToRgb(planet.color);
    const radius = Math.max(angularRadius, PLANET_BODY[planet.key]?.radius ?? 5) * clamp(Math.pow(zoom, 0.34), 0.85, 3.4);
    ctx.globalCompositeOperation = "lighter";
    const glowRadius = radius * 3.1 + 6;
    const glow = ctx.createRadialGradient(projected.x, projected.y, 0.4, projected.x, projected.y, glowRadius);
    glow.addColorStop(0, rgbCss(tint, 0.5));
    glow.addColorStop(0.4, rgbCss(tint, 0.2));
    glow.addColorStop(1, rgbCss(tint, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    if (planet.key === "saturn") drawSaturnRings(ctx, projected.x, projected.y, radius, Math.PI, Math.PI * 2);

    // Hành tinh là quả cầu được Mặt Trời chiếu: tính góc ly giác Mặt Trời–hành tinh để suy ra
    // phần được chiếu sáng và terminator (giống pha Mặt Trăng) — Sao Kim sẽ khuyết thật khi nằm gần Trời.
    const sunBody = frame.planets.find((item) => item.key === "sun");
    const sunVector = sunBody ? spin(sunBody.alt, sunBody.az) : null;
    const planetVector = directionOf(spun.alt, spun.az);
    const elongation = sunVector ? clamp(angularSeparationDeg(sunVector, planetVector), 0, 180) : 180;
    const phase = planetPhase(planet.key, elongation, {
      sunToPlanetAu: planet.sunDistanceAu,
      earthToPlanetAu: planet.distanceAu,
      earthToSunAu: sunBody?.distanceAu
    });
    // Hướng sáng trên màn hình suy từ tiếp tuyến 3D về phía Mặt Trời (xem `sunLightAngle`).
    const lightAngle = sunLightAngle(sunVector, planetVector, projector);
    const cosPhase = phase.cosPhase;

    // Mặt khuất: đĩa tối màu hành tinh pha đen.
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(mixColor(tint, [8, 10, 16], 0.85));
    ctx.fill();

    if (phase.illumination > 0.012) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius, lightAngle - Math.PI / 2, lightAngle + Math.PI / 2, false);
      ctx.ellipse(
        projected.x,
        projected.y,
        phase.terminatorRatio * radius,
        radius,
        lightAngle,
        Math.PI / 2,
        -Math.PI / 2,
        cosPhase < 0
      );
      ctx.closePath();
      ctx.clip();
      drawPlanetBody(ctx, planet.key, projected.x, projected.y, radius, tint, lightAngle);
      ctx.restore();
    }

    if (planet.key === "saturn") drawSaturnRings(ctx, projected.x, projected.y, radius, 0, Math.PI);
    ctx.strokeStyle = isSelected ? "#fde68a" : "rgba(8,12,24,0.85)";
    ctx.lineWidth = isSelected ? 2.4 : 1;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (zoom > 0.9 || isSelected) {
      placeLabel(planet.label, projected.x, projected.y, radius + 2, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(241,245,249,0.95)",
        shadow: "rgba(2,6,23,0.8)"
      });
    }
    if (projected.x >= -radius && projected.x <= width + radius && projected.y >= -radius && projected.y <= height + radius) {
      hits.push({ kind: "planet", key: planet.key, x: projected.x, y: projected.y, radius: Math.max(15, radius * 2) });
    }
  }

  /* --------------------------------------- tiểu hành tinh (Ceres, Pallas, Vesta…) */
  if (toggles.asteroids) {
    const sunBodyForRocks = frame.planets.find((planet) => planet.key === "sun");
    const sunVectorForRocks = sunBodyForRocks ? spin(sunBodyForRocks.alt, sunBodyForRocks.az) : null;

    for (const asteroid of frame.asteroids) {
      const spun = altAzOf(spin(asteroid.alt, asteroid.az));
      const floor = toggles.ground ? terrainHeightDeg(spun.az, 2) - 0.8 : -2;
      if (spun.alt < floor) continue;
      const vector = refractDirection(directionOf(spun.alt, spun.az), atmosphere && spun.alt < 25);
      const projected = projector.projectVector(vector);
      if (!projected.visible) continue;
      if (projected.x < -width || projected.x > width * 2 || projected.y < -height || projected.y > height * 2) continue;
      // Ban ngày tiểu hành tinh mờ hơn cả Sao Kim/Sao Mộc nên khuất hẳn trong ánh trời.
      if (atmosphere && tone.starFactor < 0.3) continue;

      const isSelected = selected?.kind === "asteroid" && selected.key === asteroid.key;
      const tint = hexToRgb(asteroid.color);
      // Bán kính góc **thật** suy từ đường kính và khoảng cách địa tâm (chỉ lộ ở độ phóng rất sâu);
      // dưới ngưỡng đó vẽ chấm đá đủ lớn để nhìn thấy và lớn dần theo độ phóng như hành tinh.
      const trueRadius = projector.radiusPixels(asteroid.angularRadiusDeg, vector);
      const dotRadius = clamp(1.15 * Math.pow(zoom, 0.32), 1, 3);
      const radius = Math.max(trueRadius, dotRadius);

      // Quầng mờ tách chấm đá khỏi nền sao khi còn nhỏ; khi được chọn thì quầng sáng hơn.
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(projected.x, projected.y, 0.3, projected.x, projected.y, radius * 2.6 + 3);
      glow.addColorStop(0, rgbCss(tint, isSelected ? 0.52 : 0.34));
      glow.addColorStop(1, rgbCss(tint, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius * 2.6 + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      if (radius >= 3) {
        // Đủ lớn để lộ hình "tảng đá vũ trụ" — shading theo hướng Mặt Trời như hành tinh.
        const lightAngle = sunLightAngle(sunVectorForRocks, vector, projector);
        drawAsteroidBody(ctx, asteroid.number, projected.x, projected.y, radius, tint, lightAngle);
      } else {
        ctx.fillStyle = rgbCss(mixColor(tint, [255, 255, 255], 0.25));
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isSelected) {
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Nhãn chỉ hiện khi đã phóng to (fov ≲ 21°) hoặc đang chọn — tránh rối khung toàn cảnh.
      if (zoom >= 3 || isSelected) {
        placeLabel(asteroid.label, projected.x, projected.y, radius + 2, {
          font: "600 10px system-ui, sans-serif",
          color: isSelected ? "rgba(253,230,138,0.95)" : `rgba(226,232,240,${clamp(0.4 + zoom * 0.06, 0.5, 0.9).toFixed(2)})`,
          shadow: "rgba(2,6,23,0.8)"
        });
      }
      if (projected.x >= -radius && projected.x <= width + radius && projected.y >= -radius && projected.y <= height + radius) {
        hits.push({ kind: "asteroid", key: asteroid.key, x: projected.x, y: projected.y, radius: Math.max(12, radius * 2.2) });
      }
    }
  }

  /* ----------------------------------------------------------------- mặt đất */
  const groundVisible = toggles.ground;
  const bottomOfFrame = projector.inverse(width / 2, height).alt;
  const groundInFrame = bottomOfFrame < 2 || camera.pitch < 2;

  if (groundVisible && groundInFrame) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Nửa dưới đường chân trời = mặt đất (đường chân trời chiếu thành đường thẳng).
    const horizonY = clamp(projector.horizonY, -height * 2, height * 3);
    // Không khí quyển thì không còn mù che phủ: chuyển sang bảng màu trung tính đủ tương phản
    // để địa hình và lưới vẫn đọc được trên nền trời đen kiểu vũ trụ (không hoá "mặt phẳng trống").
    const farGround = atmosphere
      ? mixColor(tone.groundFar, [0, 0, 0], 0.08 + 0.34 * tone.starFactor)
      : ([24, 30, 40] as Rgb);
    const midGround = atmosphere
      ? mixColor(tone.ground, [0, 0, 0], 0.2 + 0.14 * tone.starFactor)
      : ([13, 17, 24] as Rgb);
    const nearGround = atmosphere
      ? mixColor(tone.ground, [0, 0, 0], 0.52 + 0.1 * tone.starFactor)
      : ([6, 8, 12] as Rgb);
    const groundGradient = ctx.createLinearGradient(0, horizonY, 0, Math.max(height, horizonY + 40) + 60);
    groundGradient.addColorStop(0, rgbCss(farGround));
    groundGradient.addColorStop(0.42, rgbCss(midGround));
    groundGradient.addColorStop(1, rgbCss(nearGround));
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, horizonY, width, Math.max(height, horizonY + 40) - horizonY + 80);

    // Lưới khoảng cách: các vòng đồng tâm hội tụ về chân trời + nan toả theo phương vị.
    if (toggles.groundGrid) {
      ctx.lineWidth = 1;
      GROUND_RINGS_M.forEach((distance, index) => {
        const fade = clamp01(1 - index / (GROUND_RINGS_M.length + 1.5));
        ctx.strokeStyle = `rgba(158,205,238,${((atmosphere ? 0.1 : 0.16) + (atmosphere ? 0.22 : 0.26) * fade).toFixed(3)})`;
        for (const path of projectPath(groundRingPath(distance, 3), projector, 2)) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      });
      ctx.strokeStyle = atmosphere ? "rgba(158,205,238,0.12)" : "rgba(158,205,238,0.2)";
      for (let az = 0; az < 360; az += 15) {
        for (const path of projectPath(
          [
            { alt: groundAltitudeAt(GROUND_RINGS_M[0]), az },
            { alt: groundAltitudeAt(GROUND_RINGS_M[GROUND_RINGS_M.length - 1]), az }
          ],
          projector,
          1.5
        )) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      }
      // Cọc mốc khoảng cách để đọc được chiều sâu.
      for (const distance of [12, 96, 900]) {
        const markAz = camera.yaw + 34;
        const markAlt = groundAltitudeAt(distance);
        const mark = projector.project(markAlt, markAz);
        if (!mark.visible || mark.x < 24 || mark.x > width - 24 || mark.y < 10 || mark.y > height - 6) continue;
        drawText(ctx, `${distance} m`, mark.x, mark.y - 4, {
          font: "9px system-ui, sans-serif",
          color: "rgba(148,197,229,0.5)",
          shadow: "rgba(2,6,23,0.7)"
        });
      }
    }

    // Ba dải núi: lớp xa vẽ trước, lớp gần vẽ sau nên che đúng phần khuất.
    const terrainStep = clamp(stepAz * 1.5, 0.4, 2);
    const steps = Math.ceil(360 / terrainStep);
    const ridge: number[][] = [];
    for (let i = 0; i <= steps; i += 1) {
      const az = (i / steps) * 360;
      ridge.push([terrainHeightDeg(az, 0), terrainHeightDeg(az, 1), terrainHeightDeg(az, 2)]);
    }
    // Ba lớp núi mờ dần theo khoảng cách (phối cảnh khí quyển): lớp xa hoà vào màu trời đất
    // phía chân trời, lớp gần sẫm nhất. Công thức dùng `tone.ridge` nên đúng cho cả ngày và đêm;
    // khi tắt khí quyển thì dùng thang xám-xanh cố định để sống núi vẫn tách rõ khỏi trời đen.
    const layerColors = atmosphere
      ? [
          rgbCss(mixColor(farGround, tone.ridge, 0.35)),
          rgbCss(mixColor(farGround, tone.ridge, 0.72)),
          rgbCss(mixColor(tone.ridge, [0, 0, 0], 0.28))
        ]
      : [rgbCss([44, 52, 64]), rgbCss([26, 31, 40]), rgbCss([13, 16, 22])];

    for (let layer = 0; layer < 3; layer += 1) {
      // Khối núi được đóng xuống **đúng đường chân trời** (alt = 0): núi xa chỉ là dải ôm chân trời,
      // còn mặt đất phối cảnh + lưới khoảng cách phía dưới vẫn nhìn thấy → đúng thứ tự trước sau.
      let ridgePoints: ScreenPoint[] = [];
      let basePoints: ScreenPoint[] = [];
      const fillRidge = () => {
        if (ridgePoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(ridgePoints[0].x, ridgePoints[0].y);
          for (const point of ridgePoints) ctx.lineTo(point.x, point.y);
          for (let i = basePoints.length - 1; i >= 0; i -= 1) ctx.lineTo(basePoints[i].x, basePoints[i].y);
          ctx.closePath();
          ctx.fillStyle = layerColors[layer];
          ctx.fill();

          // Viền tán xạ dọc sống núi (lớp không khí sáng phía sau núi).
          ctx.beginPath();
          ctx.moveTo(ridgePoints[0].x, ridgePoints[0].y);
          for (const point of ridgePoints) ctx.lineTo(point.x, point.y);
          ctx.strokeStyle = atmosphere
            ? layer === 0
              ? rgbCss(tone.horizon, 0.32)
              : rgbCss(tone.ridge, layer === 2 ? 0.55 : 0.32)
            : `rgba(176,196,228,${layer === 2 ? 0.4 : 0.26})`;
          ctx.lineWidth = layer === 2 ? 2.2 : 1;
          ctx.stroke();
        }
        ridgePoints = [];
        basePoints = [];
      };
      for (let i = 0; i <= steps; i += 1) {
        const az = (i / steps) * 360;
        const top = projector.project(ridge[i][layer], az);
        const base = projector.project(0, az);
        if (top.visible && base.visible) {
          ridgePoints.push({ x: top.x, y: top.y });
          basePoints.push({ x: base.x, y: base.y });
        } else {
          fillRidge();
        }
      }
      fillRidge();
    }

    // Mù tán xạ ngay trên đường chân trời, đậm hơn ở phía Mặt Trời (chỉ khi có khí quyển).
    const fogAlpha = atmosphere ? clamp01(0.03 + 0.26 * tone.glowStrength) * (0.3 + 0.7 * tone.starFactor) + 0.014 : 0;
    if (fogAlpha > 0.03) {
      const bandHeight = clamp(height * 0.075, 16, 90);
      ctx.globalCompositeOperation = "lighter";
      const haze = ctx.createLinearGradient(0, horizonY - bandHeight, 0, horizonY + bandHeight * 0.7);
      haze.addColorStop(0, rgbCss(tone.glow, 0));
      haze.addColorStop(0.55, rgbCss(tone.glow, fogAlpha * 0.75));
      haze.addColorStop(1, rgbCss(tone.glow, 0));
      ctx.fillStyle = haze;
      ctx.fillRect(0, horizonY - bandHeight, width, bandHeight * 1.7);

      const sunPlanet = frame.planets.find((planet) => planet.key === "sun");
      if (sunPlanet) {
        const sunSpun = altAzOf(spin(sunPlanet.alt, sunPlanet.az));
        const sunEdge = projector.project(0, sunSpun.az);
        if (sunEdge.visible && sunEdge.x > -200 && sunEdge.x < width + 200) {
          const warm = ctx.createRadialGradient(sunEdge.x, horizonY, 0, sunEdge.x, horizonY, Math.max(width * 0.32, 140));
          warm.addColorStop(0, rgbCss(tone.glow, fogAlpha * 0.9));
          warm.addColorStop(1, rgbCss(tone.glow, 0));
          ctx.fillStyle = warm;
          ctx.fillRect(0, horizonY - bandHeight * 2, width, bandHeight * 4);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* ------------------------------------------------------- đường chân trời & la bàn */
  if (groundVisible || toggles.grid) {
    strokePath(altitudeCircle(0), atmosphere ? "rgba(132,178,214,0.62)" : "rgba(56,189,248,0.78)", 1.5, undefined, stepAz);
  }
  for (const direction of COMPASS_8) {
    const tickBottom = projector.project(-0.6, direction.az);
    const tickTop = projector.project(3.2, direction.az);
    if (tickBottom.visible && tickTop.visible) {
      ctx.strokeStyle = "rgba(148,197,229,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tickBottom.x, tickBottom.y);
      ctx.lineTo(tickTop.x, tickTop.y);
      ctx.stroke();
    }
    const labelPoint = projector.project(5.2, direction.az);
    if (!labelPoint.visible || labelPoint.x < 12 || labelPoint.x > width - 12 || labelPoint.y < 10 || labelPoint.y > height - 6) continue;
    drawText(ctx, direction.label, labelPoint.x, labelPoint.y, {
      font: direction.label.length === 1 ? "700 13px system-ui, sans-serif" : "11px system-ui, sans-serif",
      color: direction.label.length === 1 ? "rgba(186,226,252,0.96)" : "rgba(148,197,229,0.74)",
      shadow: "rgba(2,6,23,0.85)"
    });
  }

  /* -------------------------------------------------- nhãn: sao → DSO → hoàng đạo → chòm */
  flushLabels(starLabelQueue);
  flushLabels(dsoLabelQueue);
  flushLabels(zodiacLabelQueue);
  flushLabels(constellationLabelQueue);

  /* ------------------------------------------------------------- vòng ngắm chọn */
  if (selected) {
    const target = hits.find((hit) => hit.kind === selected.kind && hit.key === selected.key);
    if (target) {
      ctx.strokeStyle = "rgba(253,230,138,0.95)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(12, target.radius * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(target.x - 17, target.y);
      ctx.lineTo(target.x - 12, target.y);
      ctx.moveTo(target.x + 12, target.y);
      ctx.lineTo(target.x + 17, target.y);
      ctx.moveTo(target.x, target.y - 17);
      ctx.lineTo(target.x, target.y - 12);
      ctx.moveTo(target.x, target.y + 12);
      ctx.lineTo(target.x, target.y + 17);
      ctx.stroke();
    }
  }

  return { hits, drawnStars, visibleStars, camera };
};

