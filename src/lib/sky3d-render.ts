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
  type Rgb,
  type SkyFrame,
  type SkyTone
} from "./sky-visual";
import {
  COMPASS_8,
  GROUND_RINGS_M,
  PROJECT_NEAR,
  altAzOf,
  applyMatrix3,
  clampCamera,
  directionOf,
  dot3,
  groundAltitudeAt,
  groundRingPath,
  makeCamera3D,
  projectPath,
  refractDirection,
  scintillation,
  skyRotationMatrix,
  slerp3,
  splitPath,
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
  /** Nhấp nháy khí quyển. */
  twinkle: boolean;
  /** Vệt sao khi tua thời gian. */
  trails: boolean;
  /** Lưới khoảng cách trên mặt đất. */
  groundGrid: boolean;
};

export const SKY_3D_TOGGLES: Sky3DToggles = {
  lines: true,
  constellationNames: true,
  starNames: true,
  deepSky: true,
  milkyWay: true,
  ecliptic: true,
  planets: true,
  grid: true,
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
      const lower = altitudeCircle(lowerAlt - overlap);
      const upper = altitudeCircle(upperAlt + overlap);

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
    const rankLimit = zoom < 1.3 ? 34 : zoom < 2.4 ? 55 : zoom < 5 ? 74 : 88;
    const nameAlpha = atmosphere ? clamp01(0.15 + 0.85 * tone.starFactor) : 1;
    if (nameAlpha >= 0.2) {
      for (const meta of frame.constellationLabels) {
        if (meta.rank > rankLimit) continue;
        const spun = altAzOf(spin(meta.alt, meta.az));
        if (spun.alt < (toggles.ground ? terrainHeightDeg(spun.az, 2) + 2.5 : -1)) continue;
        const projected = projector.projectVector(directionOf(spun.alt, spun.az));
        if (!projected.visible || projected.x < 52 || projected.x > width - 52 || projected.y < 28 || projected.y > height - 28) continue;
        constellationLabelQueue.push({
          box: labelBox(projected.x, projected.y + 5, Math.max(meta.vi.length, meta.latin.length) * 6.6, 30),
          draw: () => {
            drawText(ctx, meta.vi.toUpperCase(), projected.x, projected.y, {
              font: "600 11px system-ui, sans-serif",
              color: `rgba(125,211,252,${(0.5 * nameAlpha).toFixed(3)})`,
              shadow: "rgba(2,6,23,0.7)"
            });
            drawText(ctx, meta.latin, projected.x, projected.y + 11, {
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

    const radius = Math.max(2.6, angularRadius) * clamp(Math.pow(zoom, 0.12), 1, 2);
    ctx.globalCompositeOperation = "lighter";
    const glowRadius = radius * 3.2 + 5;
    const glow = ctx.createRadialGradient(projected.x, projected.y, 0.4, projected.x, projected.y, glowRadius);
    glow.addColorStop(0, "rgba(255,255,255,0.5)");
    glow.addColorStop(0.35, rgbCss(hexToRgb(planet.color), 0.28));
    glow.addColorStop(1, rgbCss(hexToRgb(planet.color), 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.beginPath();
    ctx.fillStyle = planet.color;
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isSelected ? "#fde68a" : "rgba(15,23,42,0.8)";
    ctx.lineWidth = isSelected ? 2.4 : 1;
    ctx.stroke();

    if (zoom > 1.15 || isSelected) {
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

  /* ----------------------------------------------------------------- mặt đất */
  const groundVisible = toggles.ground;
  const bottomOfFrame = projector.inverse(width / 2, height).alt;
  const groundInFrame = bottomOfFrame < 2 || camera.pitch < 2;

  if (groundVisible && groundInFrame) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Nửa dưới đường chân trời = mặt đất (đường chân trời chiếu thành đường thẳng).
    const horizonY = clamp(projector.horizonY, -height * 2, height * 3);
    const farGround = mixColor(tone.groundFar, [0, 0, 0], 0.08 + 0.34 * tone.starFactor);
    const groundGradient = ctx.createLinearGradient(0, horizonY, 0, Math.max(height, horizonY + 40) + 60);
    groundGradient.addColorStop(0, rgbCss(farGround));
    groundGradient.addColorStop(0.42, rgbCss(mixColor(tone.ground, [0, 0, 0], 0.2 + 0.14 * tone.starFactor)));
    groundGradient.addColorStop(1, rgbCss(mixColor(tone.ground, [0, 0, 0], 0.52 + 0.1 * tone.starFactor)));
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, horizonY, width, Math.max(height, horizonY + 40) - horizonY + 80);

    // Lưới khoảng cách: các vòng đồng tâm hội tụ về chân trời + nan toả theo phương vị.
    if (toggles.groundGrid) {
      ctx.lineWidth = 1;
      GROUND_RINGS_M.forEach((distance, index) => {
        const fade = clamp01(1 - index / (GROUND_RINGS_M.length + 1.5));
        ctx.strokeStyle = `rgba(158,205,238,${(0.1 + 0.22 * fade).toFixed(3)})`;
        for (const path of projectPath(groundRingPath(distance, 3), projector, 2)) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      });
      ctx.strokeStyle = "rgba(158,205,238,0.12)";
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
    // phía chân trời, lớp gần sẫm nhất. Công thức dùng `tone.ridge` nên đúng cho cả ngày và đêm.
    const layerColors = [
      rgbCss(mixColor(farGround, tone.ridge, 0.35)),
      rgbCss(mixColor(farGround, tone.ridge, 0.72)),
      rgbCss(mixColor(tone.ridge, [0, 0, 0], 0.28))
    ];

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
          ctx.strokeStyle = layer === 0 ? rgbCss(tone.horizon, 0.32) : rgbCss(tone.ridge, layer === 2 ? 0.55 : 0.32);
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

    // Mù tán xạ ngay trên đường chân trời, đậm hơn ở phía Mặt Trời.
    const fogAlpha = clamp01(0.03 + 0.26 * tone.glowStrength) * (0.3 + 0.7 * tone.starFactor) + 0.014;
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

