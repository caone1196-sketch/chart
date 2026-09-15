/**
 * Bộ vẽ bầu trời trên canvas: khí quyển thực tế (màu trời, chạng vạng, hấp thụ, khúc xạ),
 * Ngân Hà dạng mây sao, địa hình chân trời, sao có quầng sáng – tia nhiễu xạ, Mặt Trăng đúng pha,
 * lưới toạ độ và chống chồng nhãn.
 *
 * Hàm `drawSky` chỉ dùng API canvas 2D nên chạy được cả trong trình duyệt lẫn khi render thử bằng node.
 */
import { ZODIAC_SIGNS } from "@/lib/astro";
import { DEEP_SKY, STARS, precessFromJ2000, toHorizontal } from "@/lib/sky";
import {
  clamp,
  clamp01,
  extinctionMag,
  makeProjector,
  mixColor,
  moonGeometry,
  rgbCss,
  skyTone,
  starAppearance,
  starTint,
  starTintIndex,
  terrainHeightDeg,
  terrainMaxDeg,
  type Projector,
  type SkyFrame,
  type SkyMode,
  type SkyPoint,
  type SkyView
} from "@/lib/sky-visual";

export type SkyDrawToggles = {
  lines: boolean;
  constellationNames: boolean;
  starNames: boolean;
  deepSky: boolean;
  milkyWay: boolean;
  ecliptic: boolean;
  planets: boolean;
  grid: boolean;
  atmosphere: boolean;
  ground: boolean;
};

export type SkySelection = { kind: "star" | "deepsky" | "planet"; key: string } | null;

export type SpriteCanvas = {
  width: number;
  height: number;
  getContext: (id: "2d") => CanvasRenderingContext2D | null;
};

export type SpriteFactory = (width: number, height: number) => SpriteCanvas;

export type SpriteCache = {
  halos: Array<SpriteCanvas | null>;
  milky: Array<SpriteCanvas | null>;
};

export const createSpriteCache = (): SpriteCache => ({
  halos: Array.from({ length: 9 }, () => null),
  milky: Array.from({ length: 3 }, () => null)
});

const SPRITE_SIZE = 96;

const makeGlowSprite = (factory: SpriteFactory, color: [number, number, number]): SpriteCanvas => {
  const sprite = factory(SPRITE_SIZE, SPRITE_SIZE);
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const half = SPRITE_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.14, rgbCss(color, 0.42));
  gradient.addColorStop(0.46, rgbCss(color, 0.09));
  gradient.addColorStop(1, rgbCss(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return sprite;
};

/** Tạo trước sprite quầng sáng (một lần cho mỗi khung màu) để vẽ nhanh. */
export const ensureSprites = (cache: SpriteCache, factory: SpriteFactory): SpriteCache => {
  if (cache.halos[0]) return cache;
  const stops = [-0.35, 0, 0.3, 0.58, 0.85, 1.1, 1.4, 1.75, 2.4];
  cache.halos = stops.map((stop) => makeGlowSprite(factory, starTint(stop)));
  cache.milky = [
    makeGlowSprite(factory, [255, 230, 196]),
    makeGlowSprite(factory, [232, 238, 255]),
    makeGlowSprite(factory, [190, 208, 255])
  ];
  return cache;
};

export type SkyHit = { kind: "star" | "deepsky" | "planet"; key: string; x: number; y: number; radius: number };

export type SkyDrawInput = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  mode: SkyMode;
  view: SkyView;
  frame: SkyFrame;
  toggles: SkyDrawToggles;
  selected: SkySelection;
  sprites: SpriteCache;
  spriteFactory: SpriteFactory;
};

export type SkyDrawResult = { hits: SkyHit[] };

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

/** Thiên thể sâu luôn được ghi tên (sáng, quen thuộc). */
const ALWAYS_LABELLED_DSO = ["M31", "M42", "M45", "M8", "M13", "M44", "ω Cen", "LMC", "SMC"];

const groundHeightAt = (az: number, useTerrain: boolean) => (useTerrain ? terrainMaxDeg(az) : 0);

/**
 * Ánh sáng nền bầu trời làm mất sao mờ: số cấp sao bị "trừ" theo độ cao Mặt Trời.
 * Đêm tối hoàn toàn (Mặt Trời dưới −18°) → 0; chạng vạng dân sự → mất gần hết sao.
 */
export const sunMagnitudePenalty = (sunAlt: number) => -clamp(0.28 * (sunAlt + 18), 0, 4.6);

/** Vẽ toàn bộ bầu trời; trả về danh sách vật thể kèm toạ độ màn hình để bắt sự kiện bấm. */
export const drawSky = (input: SkyDrawInput): SkyDrawResult => {
  const { ctx, width, height, mode, view, frame, toggles, selected } = input;
  const atmosphere = toggles.atmosphere && mode === "horizon";
  const useGround = toggles.ground && mode === "horizon";
  const useTerrain = useGround;
  const sprites = ensureSprites(input.sprites, input.spriteFactory);

  const tone = skyTone(frame.sunAlt);
  const projector: Projector = makeProjector(mode, view, width, height, { refract: atmosphere });
  const horizonRadius = 2 * projector.scale;
  const zenithPoint = projector.fromHorizontal(90, 0);
  const hits: SkyHit[] = [];
  const labelBoxes: LabelBox[] = [];
  const minAltitudeOf = (point: SkyPoint) => (mode === "horizon" ? groundHeightAt(point.az, useTerrain) : -90);

  // Nhãn được xếp hàng theo thứ tự ưu tiên (sao sáng → thiên thể sâu → hoàng đạo → chòm sao)
  // và chỉ vẽ khi không đè lên nhãn đã đặt trước đó.
  type DeferredLabel = { box: LabelBox; draw: () => void };
  const starLabelQueue: DeferredLabel[] = [];
  const dsoLabelQueue: DeferredLabel[] = [];
  const zodiacLabelQueue: DeferredLabel[] = [];
  const constellationLabelQueue: DeferredLabel[] = [];
  /** Đặt nhãn quanh một điểm, thử lần lượt vài vị trí để không đè lên nhãn đã có. */
  const placeLabel = (
    text: string,
    x: number,
    y: number,
    radius: number,
    style: { font: string; color: string; shadow?: string }
  ) => {
    ctx.font = style.font;
    const width = ctx.measureText(text).width;
    const candidates: Array<{ dx: number; dy: number; align: CanvasTextAlign }> = [
      { dx: radius + 4, dy: 3.5, align: "left" },
      { dx: -(radius + 4), dy: 3.5, align: "right" },
      { dx: 0, dy: radius + 13, align: "center" },
      { dx: 0, dy: -(radius + 7), align: "center" }
    ];
    for (const candidate of candidates) {
      const centerX =
        candidate.align === "left"
          ? x + candidate.dx + width / 2
          : candidate.align === "right"
            ? x + candidate.dx - width / 2
            : x + candidate.dx;
      const box = labelBox(centerX, y + candidate.dy - 4, width + 10, 15);
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

  /* ---------------------------------------------------------------- nền trời */
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  if (atmosphere) {
    const mid: [number, number, number] = [
      (tone.zenith[0] + tone.horizon[0]) / 2,
      (tone.zenith[1] + tone.horizon[1]) / 2,
      (tone.zenith[2] + tone.horizon[2]) / 2
    ];
    const gradient = ctx.createRadialGradient(zenithPoint.x, zenithPoint.y, 0, zenithPoint.x, zenithPoint.y, Math.max(horizonRadius, 1));
    gradient.addColorStop(0, rgbCss(tone.zenith));
    gradient.addColorStop(0.55, rgbCss(mid));
    gradient.addColorStop(1, rgbCss(tone.horizon));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const sun = frame.planets.find((planet) => planet.key === "sun");
    const glowPoint = projector.fromHorizontal(0, sun ? sun.az : 270);
    const glowRadius = Math.max(horizonRadius * 1.3, 70);
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(glowPoint.x, glowPoint.y, 0, glowPoint.x, glowPoint.y, glowRadius);
    glow.addColorStop(0, rgbCss(tone.glow, clamp01(tone.glowStrength * 0.7)));
    glow.addColorStop(0.42, rgbCss(tone.glow, clamp01(tone.glowStrength * 0.24)));
    glow.addColorStop(1, rgbCss(tone.glow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(glowPoint.x, glowPoint.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Lớp mù khí quyển mỏng ngay trên chân trời (tán xạ + ô nhiễm ánh sáng).
    ctx.globalAlpha = 0.03 + 0.07 * clamp01(tone.glowStrength);
    ctx.strokeStyle = rgbCss(tone.glow);
    ctx.lineWidth = Math.max(8, horizonRadius * 0.2);
    ctx.beginPath();
    ctx.arc(zenithPoint.x, zenithPoint.y, horizonRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  } else {
    const background = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, Math.max(width, height) * 0.75);
    background.addColorStop(0, mode === "map" ? "#070c1c" : "#070d21");
    background.addColorStop(0.55, "#03060f");
    background.addColorStop(1, "#01030a");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  /* ----------------------------------------------------------------- Ngân Hà */
  const skyVisible = (point: SkyPoint) => {
    if (!Number.isFinite(point.alt)) return false;
    if (mode === "map") return true;
    return point.alt > minAltitudeOf(point) - 0.05 && point.alt > -2;
  };

  if (toggles.milkyWay) {
    const milkyAlpha = mode === "map" ? 1 : 0.04 + 0.96 * Math.pow(tone.starFactor, 1.3);
    const sizeFactor = clamp(Math.pow(view.zoom, mode === "map" ? 0.6 : 0.42), 0.85, 3.4);
    ctx.globalCompositeOperation = "lighter";

    for (const point of frame.milkyWay) {
      if (point.grain || point.w * milkyAlpha < 0.05) continue;
      if (!skyVisible(point)) continue;
      const { x, y, visible } = projector.forward(point);
      if (!visible) continue;
      const size = point.size * sizeFactor;
      if (x < -size || x > width + size || y < -size || y > height + size) continue;
      const horizonFade = mode === "horizon" ? 0.2 + 0.8 * clamp01(point.alt / 28) : 1;
      ctx.globalAlpha = clamp01(point.w * milkyAlpha * horizonFade * 0.085);
      ctx.drawImage(sprites.milky[point.tint] as unknown as CanvasImageSource, x - size / 2, y - size / 2, size, size);
    }

    for (const point of frame.milkyWay) {
      if (!point.grain || !skyVisible(point)) continue;
      const horizonFade = mode === "horizon" ? 0.25 + 0.75 * clamp01(point.alt / 22) : 1;
      const alpha = clamp01(point.w * milkyAlpha * horizonFade * 0.34);
      if (alpha < 0.05) continue;
      const { x, y, visible } = projector.forward(point);
      if (!visible || x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgbCss(starTint(point.tint === 0 ? 1.15 : point.tint === 1 ? 0.55 : 0.1));
      ctx.beginPath();
      ctx.arc(x, y, point.size * 0.55 * clamp(sizeFactor, 0.9, 2.2), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* -------------------------------------------------------------------- lưới */
  if (toggles.grid) {
    ctx.lineWidth = 1;
    if (mode === "horizon") {
      for (let altitude = 15; altitude <= 75; altitude += 15) {
        const ring = projector.fromHorizontal(altitude, 0);
        const radius = Math.hypot(ring.x - zenithPoint.x, ring.y - zenithPoint.y);
        ctx.strokeStyle = altitude % 30 === 0 ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.13)";
        ctx.beginPath();
        ctx.arc(zenithPoint.x, zenithPoint.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (altitude % 30 === 0) {
          const label = projector.fromHorizontal(altitude, 90);
          drawText(ctx, `${altitude}°`, label.x + 6, label.y + 3, {
            font: "9px system-ui, sans-serif",
            color: "rgba(148, 163, 184, 0.6)",
            align: "left",
            shadow: "rgba(2, 6, 23, 0.7)"
          });
        }
      }
      ctx.strokeStyle = "rgba(148, 163, 184, 0.13)";
      for (let az = 0; az < 360; az += 30) {
        const edge = projector.fromHorizontal(0, az);
        ctx.beginPath();
        ctx.moveTo(zenithPoint.x, zenithPoint.y);
        ctx.lineTo(edge.x, edge.y);
        ctx.stroke();
      }
    } else {
      for (let dec = -80; dec <= 80; dec += 20) {
        const y = height / 2 - (dec - view.centerDec) * projector.scale;
        if (y < -40 || y > height + 40) continue;
        ctx.strokeStyle = dec === 0 ? "rgba(148, 163, 184, 0.32)" : "rgba(148, 163, 184, 0.16)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        drawText(ctx, `${dec > 0 ? "+" : ""}${dec}°`, 6, y - 4, {
          font: "9px system-ui, sans-serif",
          color: "rgba(148, 163, 184, 0.6)",
          align: "left",
          shadow: "rgba(2, 6, 23, 0.7)"
        });
      }
      const stepHours = projector.scale > 8 ? 1 : 2;
      for (let hour = 0; hour < 24; hour += stepHours) {
        const x = width / 2 - ((((hour * 15 - view.centerRa + 180) % 360) + 360) % 360 - 180) * projector.scale;
        for (const line of [x, x + 360 * projector.scale, x - 360 * projector.scale]) {
          if (line < -20 || line > width + 20) continue;
          ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
          ctx.beginPath();
          ctx.moveTo(line, 0);
          ctx.lineTo(line, height);
          ctx.stroke();
          drawText(ctx, `${hour}h`, line, 12, {
            font: "9px system-ui, sans-serif",
            color: "rgba(148, 163, 184, 0.6)",
            shadow: "rgba(2, 6, 23, 0.7)"
          });
        }
      }
    }
  }

  /* ------------------------------------------- đường chân trời hiện tại (bản đồ) */
  if (mode === "map" && toggles.grid) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    frame.horizonRing.forEach((point, index) => {
      const { x, y } = projector.forward(point);
      if (!Number.isFinite(x)) return;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const legend = frame.horizonRing[10];
    if (legend) {
      const { x, y } = projector.forward(legend);
      if (x > -40 && x < width + 40 && y > -40 && y < height + 40) {
        drawText(ctx, "chân trời hiện tại", x + 8, y - 5, {
          font: "11px system-ui, sans-serif",
          color: "rgba(56, 189, 248, 0.85)",
          align: "left",
          shadow: "rgba(2, 6, 23, 0.75)"
        });
      }
    }
  }

  /* ---------------------------------------------------------- chòm sao, hoàng đạo */
  const lineAlpha = atmosphere ? clamp01(0.1 + 0.9 * tone.starFactor) : 1;
  if (toggles.lines && lineAlpha > 0.12) {
    ctx.strokeStyle = `rgba(125, 211, 252, ${(0.34 * lineAlpha).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    for (const line of frame.lines) {
      ctx.beginPath();
      let started = false;
      let previousX = Number.NaN;
      for (const point of line.points) {
        if (!Number.isFinite(point.alt) || point.alt < minAltitudeOf(point)) {
          started = false;
          continue;
        }
        const { x, y, visible } = projector.forward(point);
        if (!visible) {
          started = false;
          continue;
        }
        if (Number.isFinite(previousX) && Math.abs(x - previousX) > width * 0.5) started = false;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        previousX = x;
      }
      ctx.stroke();
    }
  }

  if (toggles.ecliptic) {
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    let started = false;
    for (const point of frame.ecliptic) {
      if (point.alt < minAltitudeOf(point)) {
        started = false;
        continue;
      }
      const { x, y, visible } = projector.forward(point);
      if (!visible) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const obliquity = (frame.obliquity * Math.PI) / 180;
    ZODIAC_SIGNS.forEach((sign, index) => {
      const lon = (index * 30 + 15) * (Math.PI / 180);
      const ra = (Math.atan2(Math.sin(lon) * Math.cos(obliquity), Math.cos(lon)) * 180) / Math.PI;
      const dec = (Math.asin(Math.sin(obliquity) * Math.sin(lon)) * 180) / Math.PI;
      const ofDate = precessFromJ2000(ra, dec, frame.date);
      const horizontal = toHorizontal(ofDate.ra, ofDate.dec, frame.lstDeg, frame.latitude);
      const position = { ...ofDate, ...horizontal };
      if (horizontal.alt < minAltitudeOf(position) + (mode === "horizon" ? 2.5 : 0)) return;
      const { x, y, visible } = projector.forward(position);
      if (!visible || x < 26 || x > width - 26 || y < 22 || y > height - 22) return;
      ctx.font = "700 11px system-ui, sans-serif";
      const text = sign.name;
      zodiacLabelQueue.push({
        box: labelBox(x, y - 8, ctx.measureText(text).width + 10, 15),
        draw: () =>
          drawText(ctx, text, x, y - 8, {
            font: "700 11px system-ui, sans-serif",
            color: "rgba(251, 191, 36, 0.9)",
            shadow: "rgba(2, 6, 23, 0.8)"
          })
      });
    });
  }

  /* ------------------------------------------------------------ tên chòm sao */
  if (toggles.constellationNames) {
    // Ở mức thu nhỏ chỉ ghi tên các chòm lớn; phóng to thì hiện dần tất cả.
    const rankLimit = view.zoom < 1.2 ? 34 : view.zoom < 1.8 ? 55 : view.zoom < 3 ? 74 : 88;
    // Tên chòm mờ dần khi trời còn sáng.
    const nameAlpha = atmosphere ? clamp01(0.15 + 0.85 * tone.starFactor) : 1;
    for (const meta of frame.constellationLabels) {
      if (nameAlpha < 0.2) break;
      if (meta.rank > rankLimit) continue;
      if (meta.alt < minAltitudeOf(meta) + 2.5) continue;
      const { x, y, visible } = projector.forward(meta);
      if (!visible || x < 48 || x > width - 48 || y < 28 || y > height - 28) continue;
      constellationLabelQueue.push({
        box: labelBox(x, y + 5, Math.max(meta.vi.length, meta.latin.length) * 6.6, 30),
        draw: () => {
          drawText(ctx, meta.vi.toUpperCase(), x, y, {
            font: "600 11px system-ui, sans-serif",
            color: `rgba(125, 211, 252, ${(0.5 * nameAlpha).toFixed(3)})`,
            shadow: "rgba(2, 6, 23, 0.7)"
          });
          drawText(ctx, meta.latin, x, y + 11, {
            font: "10px system-ui, sans-serif",
            color: `rgba(148, 163, 184, ${(0.42 * nameAlpha).toFixed(3)})`,
            shadow: "rgba(2, 6, 23, 0.7)"
          });
        }
      });
    }
  }

  /* ------------------------------------------------------------ thiên thể sâu */
  if (toggles.deepSky && (!atmosphere || tone.starFactor > 0.22)) {
    const deepSkyAlpha = atmosphere ? clamp01(0.35 + 0.65 * tone.starFactor) : 1;
    ctx.globalAlpha = deepSkyAlpha;
    frame.deepSky.forEach((object, index) => {
      if (!skyVisible(object)) return;
      const { x, y, visible } = projector.forward(object);
      if (!visible || x < 0 || x > width || y < 0 || y > height) return;
      const meta = DEEP_SKY[index];
      const symbol = DSO_SYMBOL[meta.type] ?? "nebula";
      const isSelected = selected?.kind === "deepsky" && selected.key === String(index);
      ctx.strokeStyle = isSelected ? "#facc15" : "rgba(129, 230, 217, 0.68)";
      ctx.lineWidth = isSelected ? 2 : 1.1;
      ctx.beginPath();
      if (symbol === "cluster") {
        ctx.setLineDash([2, 2]);
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (symbol === "galaxy") {
        ctx.ellipse(x, y, 6, 3.2, 0.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.rect(x - 4, y - 4, 8, 8);
        ctx.stroke();
      }
      hits.push({ kind: "deepsky", key: String(index), x, y, radius: 12 });

      if (view.zoom > 2.4 || ALWAYS_LABELLED_DSO.includes(meta.id) || isSelected) {
        ctx.font = "10px system-ui, sans-serif";
        const text = meta.id;
        const textWidth = ctx.measureText(text).width;
        dsoLabelQueue.push({
          box: labelBox(x + 8 + textWidth / 2, y + 3, textWidth + 10, 15),
          draw: () =>
            drawText(ctx, text, x + 8, y + 3, {
              font: "10px system-ui, sans-serif",
              color: "rgba(129, 230, 217, 0.9)",
              align: "left",
              shadow: "rgba(2, 6, 23, 0.75)"
            })
        });
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------- các sao */
  const baseLimit =
    mode === "map" ? clamp(5.5 + Math.log2(view.zoom) * 0.9, 5.0, 6.1) : clamp(4.9 + Math.log2(view.zoom) * 0.95, 4.4, 6.1);
  const magnitudeLimit = baseLimit + (atmosphere ? sunMagnitudePenalty(frame.sunAlt) : 0);
  const nameLimit =
    mode === "map" ? clamp(3.5 + Math.log2(view.zoom) * 0.6, 3.0, 5.4) : clamp(2.0 + Math.log2(view.zoom) * 0.75, 1.5, 5.0);
  const starLabels: Array<{ x: number; y: number; index: number; mag: number; selected: boolean }> = [];
  const starAlphaGlobal = atmosphere ? 0.05 + 0.95 * tone.starFactor : 1;

  ctx.globalCompositeOperation = "lighter";
  for (const star of frame.stars) {
    if (!Number.isFinite(star.alt)) continue;
    if (mode === "horizon" && star.alt < groundHeightAt(star.az, useTerrain) - 0.15) continue;
    if (star.alt < -2) continue;
    const extinction = atmosphere ? extinctionMag(star.alt) : 0;
    const apparent = star.mag + extinction;
    if (apparent > magnitudeLimit) continue;
    const { x, y, visible } = projector.forward(star);
    if (!visible || x < -24 || x > width + 24 || y < -24 || y > height + 24) continue;

    const appearance = starAppearance(apparent, view.zoom);
    const horizonFade = mode === "horizon" ? clamp01((star.alt + 1.2) / 4) : 1;
    const alpha = clamp01(
      appearance.alpha * starAlphaGlobal * (0.4 + 0.6 * horizonFade) * Math.pow(2.512, -extinction * 0.35)
    );
    if (alpha < 0.03) continue;
    const tintIndex = starTintIndex(star.bv);
    const isSelected = selected?.kind === "star" && selected.key === String(star.index);

    if (appearance.haloAlpha > 0.02) {
      const halo = appearance.haloRadius;
      ctx.globalAlpha = clamp01(appearance.haloAlpha * starAlphaGlobal);
      ctx.drawImage(sprites.halos[tintIndex] as unknown as CanvasImageSource, x - halo, y - halo, halo * 2, halo * 2);
    }

    ctx.globalAlpha = isSelected ? 1 : alpha;
    ctx.fillStyle = isSelected ? "#fde68a" : rgbCss(starTint(star.bv));
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.32, appearance.radius), 0, Math.PI * 2);
    ctx.fill();

    if (appearance.spikeAlpha > 0.02) {
      ctx.globalAlpha = clamp01(appearance.spikeAlpha * starAlphaGlobal);
      ctx.strokeStyle = rgbCss(starTint(star.bv));
      ctx.lineWidth = 0.8;
      const length = appearance.spikeLength;
      ctx.beginPath();
      ctx.moveTo(x - length, y);
      ctx.lineTo(x + length, y);
      ctx.moveTo(x, y - length);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    }

    hits.push({ kind: "star", key: String(star.index), x, y, radius: 11 });
    if (toggles.starNames && star.labelIndex !== null && star.mag <= nameLimit) {
      starLabels.push({ x, y, index: star.index, mag: star.mag, selected: isSelected });
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
      const text = name.length > 14 ? `${name.slice(0, 13)}…` : name;
      ctx.font = "11px system-ui, sans-serif";
      const textWidth = ctx.measureText(text).width;
      starLabelQueue.push({
        box: labelBox(label.x + 5 + textWidth / 2, label.y - 4, textWidth + 8, 15),
        draw: () =>
          drawText(ctx, text, label.x + 5, label.y - 4, {
            font: "11px system-ui, sans-serif",
            color: label.selected ? "rgba(253, 230, 138, 0.98)" : "rgba(226, 232, 240, 0.74)",
            align: "left",
            shadow: "rgba(2, 6, 23, 0.85)"
          })
      });
    }
  }

  /* ------------------------------------------------- hành tinh, Mặt Trăng, Mặt Trời */
  const planetRadius = (key: string) => {
    const zoomFactor = clamp(Math.pow(view.zoom, 0.24), 0.9, 2.3);
    if (key === "sun") return 8.4 * zoomFactor;
    if (key === "moon") return 7.2 * zoomFactor;
    if (key === "venus" || key === "jupiter") return 5 * zoomFactor;
    return 4.2 * zoomFactor;
  };

  if (toggles.planets) {
    for (const planet of frame.planets) {
      if (planet.key === "sun" || planet.key === "moon") continue;
      if (planet.alt < minAltitudeOf(planet) - 0.6) continue;
      const { x, y, visible } = projector.forward(planet);
      if (!visible || x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;
      if (atmosphere && tone.starFactor < 0.3 && planet.key !== "venus" && planet.key !== "jupiter") continue;
      const radius = planetRadius(planet.key);
      const isSelected = selected?.kind === "planet" && selected.key === planet.key;

      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y, 1, x, y, radius * 4);
      glow.addColorStop(0, "rgba(255,255,255,0.3)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      ctx.beginPath();
      ctx.fillStyle = planet.color;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#fde68a" : "rgba(15, 23, 42, 0.8)";
      ctx.lineWidth = isSelected ? 2.4 : 1;
      ctx.stroke();

      placeLabel(planet.label, x, y, radius, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(241, 245, 249, 0.95)",
        shadow: "rgba(2, 6, 23, 0.8)"
      });
      hits.push({ kind: "planet", key: planet.key, x, y, radius: 15 });
    }
  }

  const sun = frame.planets.find((planet) => planet.key === "sun");
  if (sun && sun.alt >= minAltitudeOf(sun) - 0.8) {
    const { x, y, visible } = projector.forward(sun);
    if (visible && x > -400 && x < width + 400 && y > -400 && y < height + 400) {
      const radius = planetRadius("sun");
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * 18);
      halo.addColorStop(0, "rgba(255, 246, 220, 0.55)");
      halo.addColorStop(0.16, "rgba(255, 214, 150, 0.2)");
      halo.addColorStop(1, "rgba(255, 190, 120, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.fillStyle = "#fffbe8";
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      placeLabel("Mặt Trời", x, y, radius, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(255, 247, 214, 0.95)",
        shadow: "rgba(2, 6, 23, 0.85)"
      });
      hits.push({ kind: "planet", key: "sun", x, y, radius: 18 });
    }
  }

  const moon = frame.planets.find((planet) => planet.key === "moon");
  if (moon && moon.alt >= minAltitudeOf(moon) - 0.8) {
    const { x, y, visible } = projector.forward(moon);
    if (visible && x > -160 && x < width + 160 && y > -160 && y < height + 160) {
      const geometry = moonGeometry(frame.moonElongation);
      const radius = planetRadius("moon");
      const sunPoint = sun ? projector.forward(sun) : null;
      const theta = sunPoint && Number.isFinite(sunPoint.x) ? Math.atan2(sunPoint.y - y, sunPoint.x - x) : -Math.PI / 2;
      const cosElongation = Math.cos((clamp(frame.moonElongation, 0, 180) * Math.PI) / 180);

      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, radius, x, y, radius * 8);
      halo.addColorStop(0, `rgba(226, 236, 255, ${0.08 + 0.32 * geometry.illumination})`);
      halo.addColorStop(1, "rgba(190, 214, 255, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Phần tối (ánh đất), rồi phần được chiếu sáng đúng theo pha.
      ctx.beginPath();
      ctx.fillStyle = "rgba(58, 72, 104, 0.45)";
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (geometry.illumination > 0.012) {
        ctx.beginPath();
        ctx.arc(x, y, radius, theta - Math.PI / 2, theta + Math.PI / 2, false);
        ctx.ellipse(x, y, geometry.terminatorRatio * radius, radius, theta, Math.PI / 2, -Math.PI / 2, cosElongation >= 0);
        ctx.closePath();
        const surface = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
        surface.addColorStop(0, "#fdfdf6");
        surface.addColorStop(1, "#dfe2ee");
        ctx.fillStyle = surface;
        ctx.fill();
      }
      placeLabel("Mặt Trăng", x, y, radius, {
        font: "600 11px system-ui, sans-serif",
        color: "rgba(235, 240, 255, 0.95)",
        shadow: "rgba(2, 6, 23, 0.85)"
      });
      hits.push({ kind: "planet", key: "moon", x, y, radius: 16 });
    }
  }

  /* --------------------------------------------------------------- mặt đất */
  if (mode === "horizon") {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Nền dưới chân trời (xa nhất, sáng nhất nhờ tán xạ).
    const outerGround = mixColor(tone.groundFar, [0, 0, 0], 0.08 + 0.34 * tone.starFactor);
    if (useGround) {
    const groundGradient = ctx.createLinearGradient(0, zenithPoint.y + horizonRadius * 0.5, 0, height + horizonRadius * 0.5);
    groundGradient.addColorStop(0, rgbCss(outerGround));
    groundGradient.addColorStop(1, rgbCss(mixColor(tone.ground, [0, 0, 0], 0.55)));
    ctx.fillStyle = groundGradient;
    ctx.beginPath();
    ctx.moveTo(-40, -40);
    ctx.lineTo(width + 40, -40);
    ctx.lineTo(width + 40, height + 40);
    ctx.lineTo(-40, height + 40);
    ctx.closePath();
    ctx.moveTo(zenithPoint.x + horizonRadius, zenithPoint.y);
    ctx.arc(zenithPoint.x, zenithPoint.y, horizonRadius, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    }

    // Vệt tán xạ ngay dưới đường chân trời: nhìn xuyên lớp không khí dày nên sáng hơn phần đất xa.
    // Vẽ bằng nét cung có gradient để chỉ ảnh hưởng vành khuyên quanh chân trời, không phủ cả bầu trời.
    if (useGround) {
      const hazeInner = horizonRadius * 0.97;
      const hazeOuter = horizonRadius * 1.1;
      const haze = ctx.createRadialGradient(
        zenithPoint.x,
        zenithPoint.y,
        hazeInner,
        zenithPoint.x,
        zenithPoint.y,
        hazeOuter
      );
      haze.addColorStop(0, rgbCss(tone.glow, 0));
      haze.addColorStop(0.45, rgbCss(tone.glow, clamp01(0.045 + 0.44 * tone.glowStrength)));
      haze.addColorStop(1, rgbCss(tone.glow, 0));
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = haze;
      ctx.lineWidth = hazeOuter - hazeInner;
      ctx.beginPath();
      ctx.arc(zenithPoint.x, zenithPoint.y, (hazeInner + hazeOuter) / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    if (useTerrain) {
      const steps = 360;
      // Sống núi từng lớp: vẽ lớp xa trước, lớp gần sau nên lớp gần che đúng phần bị khuất.
      const ridge: number[][] = [];
      for (let i = 0; i <= steps; i += 1) {
        const az = (i / steps) * 360;
        ridge.push([terrainHeightDeg(az, 0), terrainHeightDeg(az, 1), terrainHeightDeg(az, 2)]);
      }

      const groundBase = mixColor(tone.groundFar, tone.ground, 0.45);
      const layerColors = [
        rgbCss(mixColor(outerGround, [0, 0, 0], 0.18 + 0.2 * tone.starFactor)),
        rgbCss(mixColor(groundBase, [0, 0, 0], 0.6 + 0.14 * tone.starFactor)),
        rgbCss(mixColor(tone.ground, [0, 0, 0], 0.84 + 0.1 * tone.starFactor))
      ];

      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const az = (i / steps) * 360;
          const point = projector.fromHorizontal(ridge[i][layer], az);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        // Khép vòng ra tận rìa hình (bán cầu dưới chân trời).
        for (let i = steps; i >= 0; i -= 1) {
          const az = (i / steps) * 360;
          const point = projector.fromHorizontal(-85, az);
          ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.fillStyle = layerColors[layer];
        ctx.fill();

        // Viền tán xạ mờ dọc sống núi (không khí phía sau núi).
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const az = (i / steps) * 360;
          const point = projector.fromHorizontal(ridge[i][layer], az);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = layer === 0 ? rgbCss(tone.horizon, 0.3) : rgbCss(tone.ridge, layer === 2 ? 0.5 : 0.3);
        ctx.lineWidth = layer === 2 ? 2.2 : 1;
        ctx.stroke();
      }
    }

    // Sương mù / tán xạ ngay trên đường chân trời: sáng hơn ở hướng Mặt Trời.
    const sunPlanet = frame.planets.find((planet) => planet.key === "sun");
    const fogAlpha = mode === "horizon" ? clamp01(0.03 + 0.24 * tone.glowStrength) * (0.3 + 0.7 * tone.starFactor) + 0.012 : 0;
    if (useGround && fogAlpha > 0.03) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgbCss(tone.glow, fogAlpha * 0.5);
      ctx.lineWidth = Math.max(10, horizonRadius * 0.11);
      ctx.beginPath();
      ctx.arc(zenithPoint.x, zenithPoint.y, horizonRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (sunPlanet) {
        const sunEdge = projector.fromHorizontal(0, sunPlanet.az);
        const sunAngle = Math.atan2(sunEdge.y - zenithPoint.y, sunEdge.x - zenithPoint.x);
        ctx.strokeStyle = rgbCss(tone.glow, fogAlpha);
        ctx.lineWidth = Math.max(14, horizonRadius * 0.17);
        ctx.beginPath();
        ctx.arc(zenithPoint.x, zenithPoint.y, horizonRadius, sunAngle - 0.85, sunAngle + 0.85);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Vòng chân trời + 8 hướng.
    ctx.strokeStyle = atmosphere ? "rgba(132, 178, 214, 0.6)" : "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(zenithPoint.x, zenithPoint.y, horizonRadius, 0, Math.PI * 2);
    ctx.stroke();

    const directions = [
      { label: "B", az: 0 },
      { label: "ĐB", az: 45 },
      { label: "Đ", az: 90 },
      { label: "ĐN", az: 135 },
      { label: "N", az: 180 },
      { label: "TN", az: 225 },
      { label: "T", az: 270 },
      { label: "TB", az: 315 }
    ];
    for (const direction of directions) {
      const point = projector.fromHorizontal(0, direction.az);
      const dx = point.x - zenithPoint.x;
      const dy = point.y - zenithPoint.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = direction.label.length === 1 ? 12 : 10;
      const outer = { x: point.x + (dx / length) * offset, y: point.y + (dy / length) * offset };
      ctx.strokeStyle = "rgba(148, 197, 229, 0.5)";
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      drawText(ctx, direction.label, outer.x + (dx / length) * 7, outer.y + (dy / length) * 7 + 4, {
        font: direction.label.length === 1 ? "700 12px system-ui, sans-serif" : "11px system-ui, sans-serif",
        color: direction.label.length === 1 ? "rgba(186, 226, 252, 0.95)" : "rgba(148, 197, 229, 0.72)",
        shadow: "rgba(2, 6, 23, 0.85)"
      });
    }
  } else {
    // Vòng ngắm tâm khung ở chế độ bản đồ.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 9, height / 2);
    ctx.lineTo(width / 2 - 3, height / 2);
    ctx.moveTo(width / 2 + 3, height / 2);
    ctx.lineTo(width / 2 + 9, height / 2);
    ctx.moveTo(width / 2, height / 2 - 9);
    ctx.lineTo(width / 2, height / 2 - 3);
    ctx.moveTo(width / 2, height / 2 + 3);
    ctx.lineTo(width / 2, height / 2 + 9);
    ctx.stroke();
  }

  /* ------------------------------------------------- nhãn: sao → thiên thể sâu → hoàng đạo → chòm sao */
  flushLabels(starLabelQueue);
  flushLabels(dsoLabelQueue);
  flushLabels(zodiacLabelQueue);
  flushLabels(constellationLabelQueue);

  /* ------------------------------------------------------------- vòng ngắm chọn */
  if (selected) {
    const target = hits.find((hit) => hit.kind === selected.kind && hit.key === selected.key);
    if (target) {
      ctx.strokeStyle = "rgba(253, 230, 138, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(11, target.radius * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(target.x - 16, target.y);
      ctx.lineTo(target.x - 11, target.y);
      ctx.moveTo(target.x + 11, target.y);
      ctx.lineTo(target.x + 16, target.y);
      ctx.moveTo(target.x, target.y - 16);
      ctx.lineTo(target.x, target.y - 11);
      ctx.moveTo(target.x, target.y + 11);
      ctx.lineTo(target.x, target.y + 16);
      ctx.stroke();
    }
  }

  return { hits };
};
