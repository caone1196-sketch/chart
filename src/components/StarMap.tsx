import { type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartData } from "@/lib/astro";
import { calcObliquity, displayAngle, localSiderealDegrees, normalizeDegree, signedSeparation } from "@/lib/astro";
import {
  CONSTELLATION_LINES,
  CONSTELLATION_META,
  DEEP_SKY,
  MILKY_WAY_BANDS,
  STARS,
  compass,
  computeSkySnapshot,
  eclipticPath,
  precessFromJ2000,
  signPositionOf,
  toHorizontal,
  type PlanetSky
} from "@/lib/sky";

type Mode = "horizon" | "map";

type SkyFrame = {
  lstDeg: number;
  obliquity: number;
  planets: PlanetSky[];
  stars: Array<{ index: number; ra: number; dec: number; alt: number; az: number; mag: number; bv: number; label: number | null }>;
  lines: Array<{ abbr: string; points: Array<{ ra: number; dec: number; alt: number; az: number }> }>;
  milkyWay: Array<Array<{ ra: number; dec: number; alt: number; az: number }>>;
  ecliptic: Array<{ ra: number; dec: number; alt: number; az: number }>;
  horizon: Array<{ ra: number; dec: number; alt: number; az: number }>;
  deepSky: Array<{ ra: number; dec: number; alt: number; az: number }>;
  constellationLabels: Array<{ vi: string; latin: string; ra: number; dec: number; alt: number; az: number }>;
};

type Selected =
  | { kind: "star"; index: number }
  | { kind: "deepsky"; index: number }
  | { kind: "planet"; key: string }
  | null;

const STAR_COLORS: Array<[number, [number, number, number]]> = [
  [-0.35, [155, 176, 255]],
  [0, [170, 191, 255]],
  [0.3, [202, 215, 255]],
  [0.58, [248, 247, 255]],
  [0.85, [255, 244, 232]],
  [1.1, [255, 222, 180]],
  [1.4, [255, 191, 145]],
  [1.75, [255, 160, 118]],
  [2.4, [255, 130, 100]]
];

const starColor = (bv: number) => {
  const value = Number.isFinite(bv) ? bv : 0.6;
  let lower = STAR_COLORS[0];
  let upper = STAR_COLORS[STAR_COLORS.length - 1];

  for (let i = 0; i < STAR_COLORS.length - 1; i += 1) {
    if (value >= STAR_COLORS[i][0] && value <= STAR_COLORS[i + 1][0]) {
      lower = STAR_COLORS[i];
      upper = STAR_COLORS[i + 1];
      break;
    }
  }

  const span = upper[0] - lower[0] || 1;
  const t = Math.max(0, Math.min(1, (value - lower[0]) / span));
  const mix = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

const wrap180 = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

/** Kinh độ hoàng đạo (tropical) của một điểm xích đạo. */
const toEclipticLon = (ra: number, dec: number, obliquity: number) => {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  const eps = (obliquity * Math.PI) / 180;
  return normalizeDegree(
    (Math.atan2(Math.sin(raRad) * Math.cos(eps) + Math.tan(decRad) * Math.sin(eps), Math.cos(raRad)) * 180) / Math.PI
  );
};

const buildFrame = (date: Date, latitude: number, longitude: number): SkyFrame => {
  const lstDeg = localSiderealDegrees(date, longitude);
  const obliquity = calcObliquity(date);

  const project = (ra: number, dec: number) => ({ ra, dec, ...toHorizontal(ra, dec, lstDeg, latitude) });

  const ecliptic = eclipticPath(date).map((point) => {
    const ofDate = precessFromJ2000(point.ra, point.dec, date);
    return project(ofDate.ra, ofDate.dec);
  });

  const stars = STARS.map((star) => {
    const ofDate = precessFromJ2000(star.ra, star.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    return {
      index: star.index,
      ra: ofDate.ra,
      dec: ofDate.dec,
      alt: horizontal.alt,
      az: horizontal.az,
      mag: star.mag,
      bv: star.bv,
      label: star.alternatives.length ? star.index : null
    };
  });

  const lines = Object.entries(CONSTELLATION_LINES).map(([abbr, polylines]) => ({
    abbr,
    points: polylines.flatMap((flat) => {
      const points: Array<{ ra: number; dec: number; alt: number; az: number }> = [];
      for (let i = 0; i < flat.length; i += 2) {
        const ofDate = precessFromJ2000(flat[i], flat[i + 1], date);
        points.push(project(ofDate.ra, ofDate.dec));
        if (i > 0) points.push({ ra: Number.NaN, dec: Number.NaN, alt: Number.NaN, az: Number.NaN });
      }
      return points;
    })
  }));

  const milkyWay = [MILKY_WAY_BANDS.outer, MILKY_WAY_BANDS.inner].map((band) =>
    band.map((point) => {
      const ofDate = precessFromJ2000(point.ra, point.dec, date);
      return project(ofDate.ra, ofDate.dec);
    })
  );

  const horizon: Array<{ ra: number; dec: number; alt: number; az: number }> = [];
  const lat = (latitude * Math.PI) / 180;
  for (let az = 0; az <= 360; az += 4) {
    const azRad = (az * Math.PI) / 180;
    const dec = (Math.asin(Math.max(-1, Math.min(1, Math.cos(lat) * Math.cos(azRad)))) * 180) / Math.PI;
    const H = (Math.atan2(-Math.sin(azRad), -Math.sin(lat) * Math.cos(azRad)) * 180) / Math.PI;
    horizon.push({ ra: wrap180(lstDeg - H), dec, alt: 0, az });
  }

  const deepSky = DEEP_SKY.map((object) => {
    const ofDate = precessFromJ2000(object.ra, object.dec, date);
    return project(ofDate.ra, ofDate.dec);
  });

  const constellationLabels = CONSTELLATION_META.map((meta) => {
    const ofDate = precessFromJ2000(meta.ra, meta.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    return { vi: meta.vi, latin: meta.latin, ra: ofDate.ra, dec: ofDate.dec, ...horizontal };
  });

  const snapshot = computeSkySnapshot(date, latitude, longitude, lstDeg, obliquity);

  return { lstDeg, obliquity, planets: snapshot.planets, stars, lines, milkyWay, ecliptic, horizon, deepSky, constellationLabels };
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

export type StarMapProps = {
  latitude: number;
  longitude: number;
  placeLabel: string;
  chart: ChartData | null;
  onAskAbout: (question: string) => void;
};

export default function StarMap({ latitude, longitude, placeLabel, chart, onAskAbout }: StarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const starScreenRef = useRef<Array<{ x: number; y: number; index: number }>>([]);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("horizon");
  const [date, setDate] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [speedHours, setSpeedHours] = useState(1);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0, centerRa: 0, centerDec: 20 });
  const [selected, setSelected] = useState<Selected>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [toggles, setToggles] = useState({
    lines: true,
    constellationNames: true,
    starNames: true,
    deepSky: true,
    milkyWay: true,
    ecliptic: true,
    planets: true,
    grid: true
  });

  const timeBucket = Math.round(date.getTime() / 2000);
  const frame = useMemo(
    () => buildFrame(date, latitude, longitude),
    // Tính lại theo từng mốc 2 giây để việc kéo/zoom không phải dựng lại toàn bộ catalogue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeBucket, latitude, longitude]
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDate((previous) => new Date(previous.getTime() + speedHours * 60 * 60000 * 0.25));
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, speedHours]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(320, rect.width), height: Math.max(320, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const project = useCallback(
    (point: { ra: number; dec: number; alt: number; az: number }, width: number, height: number) => {
      if (mode === "horizon") {
        if (!Number.isFinite(point.alt)) return { x: Number.NaN, y: Number.NaN, scale: 1 };
        const clamped = Math.max(point.alt, -80);
        const radius = 2 * Math.tan(((90 - clamped) * Math.PI) / 360);
        const scale = ((Math.min(width, height) / 2) * 0.92) * view.zoom;
        const azRad = (point.az * Math.PI) / 180;
        return {
          x: width / 2 + radius * Math.sin(azRad) * scale + view.x,
          y: height / 2 - radius * Math.cos(azRad) * scale + view.y,
          scale
        };
      }

      if (!Number.isFinite(point.ra)) return { x: Number.NaN, y: Number.NaN, scale: 1 };
      const scale = ((Math.min(width, height) / 180) * Math.PI) * 0.55 * view.zoom;
      return {
        x: width / 2 - wrap180(point.ra - view.centerRa) * scale,
        y: height / 2 - (point.dec - view.centerDec) * scale,
        scale
      };
    },
    [mode, view]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = size;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const background = context.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, Math.max(width, height) * 0.75);
    background.addColorStop(0, "#070d21");
    background.addColorStop(0.55, "#03060f");
    background.addColorStop(1, "#01030a");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const magLimit = Math.min(6.2, 4.1 + Math.log2(view.zoom) * 0.9 + (mode === "map" ? 0.4 : 0));
    const labelLimit = view.zoom > 2.4 ? 5.2 : view.zoom > 1.4 ? 3.4 : 2.4;
    const base = ((Math.min(width, height) / 2) * 0.92) * view.zoom;

    if (toggles.milkyWay) {
      const [outer, inner] = frame.milkyWay;
      const drawBand = (band: typeof outer, alpha: number, color: string) => {
        context.beginPath();
        let started = false;
        for (const point of band) {
          if (point.alt < -3) {
            started = false;
            continue;
          }
          const { x, y } = project(point, width, height);
          if (!Number.isFinite(x)) continue;
          if (!started) {
            context.moveTo(x, y);
            started = true;
          } else {
            context.lineTo(x, y);
          }
        }
        context.strokeStyle = color;
        context.globalAlpha = alpha;
        context.lineWidth = mode === "horizon" ? 26 * Math.sqrt(view.zoom) : 34 * view.zoom;
        context.lineCap = "round";
        context.stroke();
        context.globalAlpha = 1;
      };
      drawBand(outer, 0.14, "#8b9cf7");
      drawBand(inner, 0.1, "#c7d2fe");
    }

    if (toggles.grid) {
      context.strokeStyle = "rgba(148, 163, 184, 0.18)";
      context.lineWidth = 1;

      if (mode === "horizon") {
        for (const altitude of [0, 30, 60]) {
          const radius = 2 * Math.tan(((90 - altitude) * Math.PI) / 360) * base;
          context.beginPath();
          context.arc(width / 2 + view.x, height / 2 + view.y, radius, 0, Math.PI * 2);
          context.stroke();
        }
        for (let az = 0; az < 360; az += 45) {
          const azRad = (az * Math.PI) / 180;
          context.beginPath();
          context.moveTo(width / 2 + view.x, height / 2 + view.y);
          context.lineTo(width / 2 + view.x + Math.sin(azRad) * 2 * base, height / 2 + view.y - Math.cos(azRad) * 2 * base);
          context.stroke();
        }
      } else {
        for (let dec = -80; dec <= 80; dec += 20) {
          const { y } = project({ ra: 0, dec, alt: 0, az: 0 }, width, height);
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width, y);
          context.stroke();
        }
        for (let hour = 0; hour < 24; hour += 2) {
          const { x } = project({ ra: wrap180(hour * 15), dec: 0, alt: 0, az: 0 }, width, height);
          for (const line of [x, x + 360 * project({ ra: 0, dec: 0, alt: 0, az: 0 }, width, height).scale]) {
            if (line < -20 || line > width + 20) continue;
            context.beginPath();
            context.moveTo(line, 0);
            context.lineTo(line, height);
            context.stroke();
          }
        }
      }
    }

    if (toggles.lines) {
      context.strokeStyle = "rgba(125, 211, 252, 0.42)";
      context.lineWidth = 1.1;
      for (const line of frame.lines) {
        context.beginPath();
        let started = false;
        let previousX = Number.NaN;
        for (const point of line.points) {
          if (!Number.isFinite(point.alt) || point.alt < -6) {
            started = false;
            continue;
          }
          const { x, y } = project(point, width, height);
          if (!Number.isFinite(x)) {
            started = false;
            continue;
          }
          if (Number.isFinite(previousX) && Math.abs(x - previousX) > width * 0.5) started = false;
          if (!started) {
            context.moveTo(x, y);
            started = true;
          } else {
            context.lineTo(x, y);
          }
          previousX = x;
        }
        context.stroke();
      }
    }

    if (toggles.constellationNames && view.zoom > 1.05) {
      context.textAlign = "center";
      for (const meta of frame.constellationLabels) {
        if (meta.alt < 5) continue;
        const { x, y } = project(meta, width, height);
        if (!Number.isFinite(x) || x < 40 || x > width - 40 || y < 24 || y > height - 24) continue;
        context.font = "600 12px system-ui, sans-serif";
        context.fillStyle = "rgba(125, 211, 252, 0.58)";
        context.fillText(meta.vi.toUpperCase(), x, y);
        context.font = "10px system-ui, sans-serif";
        context.fillStyle = "rgba(148, 163, 184, 0.5)";
        context.fillText(meta.latin, x, y + 12);
      }
    }

    if (toggles.ecliptic) {
      context.strokeStyle = "rgba(251, 191, 36, 0.6)";
      context.lineWidth = 1.4;
      context.setLineDash([6, 5]);
      context.beginPath();
      let started = false;
      for (const point of frame.ecliptic) {
        if (point.alt < -6) {
          started = false;
          continue;
        }
        const { x, y } = project(point, width, height);
        if (!Number.isFinite(x)) {
          started = false;
          continue;
        }
        if (!started) {
          context.moveTo(x, y);
          started = true;
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
      context.setLineDash([]);

      const obliquity = (frame.obliquity * Math.PI) / 180;
      const names = ["Bạch Dương", "Kim Ngưu", "Song Tử", "Cự Giải", "Sư Tử", "Xử Nữ", "Thiên Bình", "Bọ Cạp", "Nhân Mã", "Ma Kết", "Bảo Bình", "Song Ngư"];
      context.font = "700 11px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillStyle = "rgba(251, 191, 36, 0.85)";
      names.forEach((label, index) => {
        const lon = (index * 30 * Math.PI) / 180;
        const ra = (Math.atan2(Math.sin(lon) * Math.cos(obliquity), Math.cos(lon)) * 180) / Math.PI;
        const dec = (Math.asin(Math.sin(obliquity) * Math.sin(lon)) * 180) / Math.PI;
        const ofDate = precessFromJ2000(ra, dec, date);
        const horizontal = toHorizontal(ofDate.ra, ofDate.dec, frame.lstDeg, latitude);
        if (horizontal.alt < 3) return;
        const { x, y } = project({ ra: ofDate.ra, dec: ofDate.dec, ...horizontal }, width, height);
        if (!Number.isFinite(x) || x < 30 || x > width - 30 || y < 18 || y > height - 18) return;
        context.fillText(label, x, y - 8);
      });
    }

    if (toggles.deepSky && view.zoom > 1.1) {
      frame.deepSky.forEach((object, index) => {
        if (object.alt < 0) return;
        const { x, y } = project(object, width, height);
        if (!Number.isFinite(x) || x < 0 || x > width || y < 0 || y > height) return;
        const meta = DEEP_SKY[index];
        const symbol = DSO_SYMBOL[meta.type] ?? "nebula";
        const isSelected = selected?.kind === "deepsky" && selected.index === index;
        context.strokeStyle = isSelected ? "#facc15" : "rgba(129, 230, 217, 0.8)";
        context.lineWidth = isSelected ? 2 : 1.2;
        context.beginPath();
        if (symbol === "cluster") {
          context.setLineDash([2, 2]);
          context.arc(x, y, 5, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        } else if (symbol === "galaxy") {
          context.ellipse(x, y, 6, 3.2, 0.5, 0, Math.PI * 2);
          context.stroke();
        } else {
          context.rect(x - 4, y - 4, 8, 8);
          context.stroke();
        }
        if (view.zoom > 2.2 || ["M31", "M42", "M45", "M8", "M13", "M44", "ω Cen"].includes(meta.id)) {
          context.font = "10px system-ui, sans-serif";
          context.fillStyle = "rgba(129, 230, 217, 0.9)";
          context.textAlign = "left";
          context.fillText(meta.id, x + 8, y + 3);
        }
      });
    }

    const starScreen: Array<{ x: number; y: number; index: number }> = [];
    for (const star of frame.stars) {
      if (star.mag > magLimit || star.alt < -1.5) continue;
      const { x, y } = project(star, width, height);
      if (!Number.isFinite(x) || x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      const radius = Math.max(0.5, (6.4 - star.mag) * 0.42 * Math.min(1.7, Math.max(0.75, view.zoom * 0.85)));
      const isSelected = selected?.kind === "star" && selected.index === star.index;
      context.beginPath();
      context.fillStyle = isSelected ? "#fde68a" : starColor(star.bv);
      context.globalAlpha = Math.min(1, 0.5 + (6.2 - star.mag) / 6);
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      starScreen.push({ x, y, index: star.index });

      if (toggles.starNames && star.label !== null && star.mag <= labelLimit) {
        const name = STARS[star.index].alternatives[0];
        if (name) {
          context.font = "11px system-ui, sans-serif";
          context.fillStyle = isSelected ? "rgba(253, 230, 138, 0.95)" : "rgba(226, 232, 240, 0.72)";
          context.textAlign = "left";
          context.fillText(name, x + radius + 3, y - radius - 1);
        }
      }
    }
    starScreenRef.current = starScreen;

    if (toggles.planets) {
      for (const planet of frame.planets) {
        if (planet.alt < -3) continue;
        const { x, y } = project(planet, width, height);
        if (!Number.isFinite(x) || x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
        const isSelected = selected?.kind === "planet" && selected.key === planet.key;
        const radius = planet.key === "sun" ? 7 : planet.key === "moon" ? 6.5 : 4.6;

        if (planet.key === "sun" || planet.key === "moon") {
          const glow = context.createRadialGradient(x, y, 1, x, y, radius * 3.4);
          glow.addColorStop(0, planet.key === "sun" ? "rgba(251, 191, 36, 0.6)" : "rgba(226, 232, 240, 0.45)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          context.fillStyle = glow;
          context.beginPath();
          context.arc(x, y, radius * 3.4, 0, Math.PI * 2);
          context.fill();
        }

        context.beginPath();
        context.fillStyle = planet.color;
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = isSelected ? "#fde68a" : "rgba(15, 23, 42, 0.85)";
        context.lineWidth = isSelected ? 2.4 : 1;
        context.stroke();

        context.font = "600 11px system-ui, sans-serif";
        context.fillStyle = "rgba(241, 245, 249, 0.95)";
        context.textAlign = "left";
        context.fillText(planet.label, x + radius + 4, y + 3.5);
      }
    }

    if (mode === "horizon") {
      context.strokeStyle = "rgba(56, 189, 248, 0.75)";
      context.lineWidth = 1.6;
      context.beginPath();
      context.arc(width / 2 + view.x, height / 2 + view.y, base, 0, Math.PI * 2);
      context.stroke();

      context.font = "700 13px system-ui, sans-serif";
      context.fillStyle = "rgba(125, 211, 252, 0.95)";
      context.textAlign = "center";
      for (const direction of [
        { label: "B", az: 0 },
        { label: "Đ", az: 90 },
        { label: "N", az: 180 },
        { label: "T", az: 270 }
      ]) {
        const azRad = (direction.az * Math.PI) / 180;
        context.fillText(direction.label, width / 2 + view.x + Math.sin(azRad) * base, height / 2 + view.y - Math.cos(azRad) * base - 8);
      }
    } else {
      context.strokeStyle = "rgba(56, 189, 248, 0.6)";
      context.lineWidth = 1.4;
      context.setLineDash([5, 5]);
      context.beginPath();
      frame.horizon.forEach((point, index) => {
        const { x, y } = project(point, width, height);
        if (!Number.isFinite(x)) return;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.setLineDash([]);
      context.font = "11px system-ui, sans-serif";
      context.fillStyle = "rgba(56, 189, 248, 0.8)";
      context.textAlign = "left";
      const legend = frame.horizon[10];
      if (legend) context.fillText("đường chân trời hiện tại", project(legend, width, height).x + 6, project(legend, width, height).y);
    }
  }, [frame, mode, project, selected, size, toggles, view, latitude, date]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventScroll = (event: WheelEvent) => event.preventDefault();
    canvas.addEventListener("wheel", preventScroll, { passive: false });
    return () => canvas.removeEventListener("wheel", preventScroll);
  }, []);

  const toLocalInput = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;

    setView((previous) => {
      if (mode === "horizon") return { ...previous, x: previous.x + dx, y: previous.y + dy };
      const scale = ((Math.min(size.width, size.height) / 180) * Math.PI) * 0.55 * previous.zoom;
      const degreesPerPixel = 180 / (Math.PI * scale);
      return {
        ...previous,
        centerRa: wrap180(previous.centerRa + dx * degreesPerPixel),
        centerDec: Math.max(-89.5, Math.min(89.5, previous.centerDec + dy * degreesPerPixel))
      };
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { width, height } = size;

    let best: Selected = null;
    let bestDistance = 14;

    for (const star of starScreenRef.current) {
      const distance = Math.hypot(star.x - px, star.y - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind: "star", index: star.index };
      }
    }

    frame.deepSky.forEach((object, index) => {
      if (object.alt < 0) return;
      const { x, y } = project(object, width, height);
      const distance = Math.hypot(x - px, y - py);
      if (distance < bestDistance && distance < 12) {
        bestDistance = distance;
        best = { kind: "deepsky", index };
      }
    });

    frame.planets.forEach((planet) => {
      const { x, y } = project(planet, width, height);
      const distance = Math.hypot(x - px, y - py);
      if (distance < bestDistance && distance < 16) {
        bestDistance = distance;
        best = { kind: "planet", key: planet.key };
      }
    });

    setSelected(best);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    setView((previous) => ({ ...previous, zoom: Math.max(0.6, Math.min(16, previous.zoom * factor)) }));
  };

  const resetView = () =>
    setView({ zoom: 1, x: 0, y: 0, centerRa: wrap180(frame.lstDeg), centerDec: latitude >= 0 ? 25 : -25 });

  const changeMode = (next: Mode) => {
    setMode(next);
    setView((previous) => ({
      ...previous,
      zoom: next === "map" ? Math.max(previous.zoom, 1.3) : 1,
      x: 0,
      y: 0,
      centerRa: wrap180(frame.lstDeg)
    }));
  };

  const selectedInfo = useMemo(() => {
    if (!selected) return null;

    if (selected.kind === "star") {
      const meta = STARS[selected.index];
      const position = frame.stars[selected.index];
      const name = meta.alternatives[0] ?? `HIP ${selected.index}`;
      const designation = meta.alternatives.slice(1).filter((item) => !item.startsWith("HIP")).join(" · ");
      return {
        title: name,
        subtitle: [designation, meta.constellationVi ? `Chòm ${meta.constellationVi}` : ""].filter(Boolean).join(" · "),
        rows: [
          ["Cấp sao (mag)", meta.mag.toFixed(2)],
          ["Xích kinh / xích vĩ (J2000)", `${(((meta.ra + 360) % 360) / 15).toFixed(3)}h · ${meta.dec.toFixed(2)}°`],
          ["Độ cao / phương vị", `${position.alt.toFixed(1)}° · ${compass(position.az)} (${position.az.toFixed(0)}°)`],
          ["Kinh độ hoàng đạo", signPositionOf(toEclipticLon(position.ra, position.dec, frame.obliquity))],
          ["Chỉ số màu B-V", meta.bv.toFixed(2)]
        ] as Array<[string, string]>,
        askQuestion: `${name} (${meta.constellationVi ?? ""}) nằm ở ${signPositionOf(
          toEclipticLon(position.ra, position.dec, frame.obliquity)
        )} — sao này có ý nghĩa gì với bản đồ sao của tôi?`
      };
    }

    if (selected.kind === "deepsky") {
      const meta = DEEP_SKY[selected.index];
      const position = frame.deepSky[selected.index];
      return {
        title: meta.vi || meta.id,
        subtitle: [`${meta.id}${meta.alt ? ` · ${meta.alt}` : ""}`, meta.en, meta.typeVi].filter(Boolean).join(" · "),
        rows: [
          ["Cấp sao", meta.mag !== null ? meta.mag.toFixed(1) : "—"],
          ["Xích kinh / xích vĩ (J2000)", `${(((meta.ra + 360) % 360) / 15).toFixed(3)}h · ${meta.dec.toFixed(2)}°`],
          ["Độ cao / phương vị", `${position.alt.toFixed(1)}° · ${compass(position.az)} (${position.az.toFixed(0)}°)`],
          ["Kinh độ hoàng đạo", signPositionOf(toEclipticLon(position.ra, position.dec, frame.obliquity))]
        ] as Array<[string, string]>,
        askQuestion: `${meta.vi || meta.id} (${meta.typeVi}) có gì đáng quan sát và mang ý nghĩa gì trong chiêm tinh?`
      };
    }

    const planet = frame.planets.find((item) => item.key === selected.key);
    if (!planet) return null;
    const natal = chart?.planets.find((item) => item.key === planet.key);

    return {
      title: `${planet.label} trên bầu trời`,
      subtitle: `${signPositionOf(planet.lon)}${planet.retrograde ? " · đang nghịch hành" : ""}`,
      rows: [
        ["Độ cao / phương vị", `${planet.alt.toFixed(1)}° · ${compass(planet.az)} (${planet.az.toFixed(0)}°)`],
        ["Kinh độ hoàng đạo", displayAngle(planet.lon)],
        ...(natal
          ? ([
              ["Vị trí natal", displayAngle(natal.longitude)],
              ["Lệch so với natal", `${Math.abs(signedSeparation(planet.lon, natal.longitude)).toFixed(2)}°`]
            ] as Array<[string, string]>)
          : [])
      ] as Array<[string, string]>,
      askQuestion: `${planet.label} đang ở ${signPositionOf(planet.lon)} và lệch ${
        natal ? Math.abs(signedSeparation(planet.lon, natal.longitude)).toFixed(2) : "?"
      }° so với vị trí natal của tôi — điều này ảnh hưởng gì trong giai đoạn này?`
    };
  }, [selected, frame, chart]);

  const handleTouchStart = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 2) {
      pinchRef.current = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    const factor = distance / pinchRef.current;
    pinchRef.current = distance;
    setView((previous) => ({ ...previous, zoom: Math.max(0.6, Math.min(16, previous.zoom * factor)) }));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Bản đồ sao thực tế</h3>
          <p className="mt-1 text-sm text-slate-400">
            {placeLabel} · {latitude.toFixed(3)}°, {longitude.toFixed(3)}° · giờ sao địa phương {(frame.lstDeg / 15).toFixed(2)}h ·{" "}
            {date.toLocaleString("vi-VN", { hour12: false })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => changeMode("horizon")} className={mode === "horizon" ? "chip chip-active" : "chip"}>
            Bầu trời (độ cao – phương vị)
          </button>
          <button type="button" onClick={() => changeMode("map")} className={mode === "map" ? "chip chip-active" : "chip"}>
            Toàn cảnh (xích kinh – xích vĩ)
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <button type="button" className="chip" onClick={() => setDate(new Date())}>
          Bây giờ
        </button>
        <button type="button" className="chip" onClick={() => setDate((value) => new Date(value.getTime() - 3600000))}>
          −1 giờ
        </button>
        <button type="button" className="chip" onClick={() => setDate((value) => new Date(value.getTime() + 3600000))}>
          +1 giờ
        </button>
        <button type="button" className="chip" onClick={() => setDate((value) => new Date(value.getTime() - 86400000))}>
          −1 ngày
        </button>
        <button type="button" className="chip" onClick={() => setDate((value) => new Date(value.getTime() + 86400000))}>
          +1 ngày
        </button>
        <button type="button" className={playing ? "chip chip-active" : "chip"} onClick={() => setPlaying((value) => !value)}>
          {playing ? "⏸ Dừng" : "▶ Chạy thời gian"}
        </button>
        <label className="flex items-center gap-2">
          Tốc độ
          <select
            value={speedHours}
            onChange={(event) => setSpeedHours(Number(event.target.value))}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1"
          >
            <option value={1}>1 giờ / nhịp</option>
            <option value={6}>6 giờ / nhịp</option>
            <option value={24}>1 ngày / nhịp</option>
            <option value={168}>1 tuần / nhịp</option>
          </select>
        </label>
        <input
          type="datetime-local"
          value={toLocalInput(date)}
          onChange={(event) => {
            const parsed = new Date(event.target.value);
            if (!Number.isNaN(parsed.getTime())) setDate(parsed);
          }}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
        />
        <button type="button" className="chip" onClick={resetView}>
          Căn lại khung nhìn
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {(
          [
            ["lines", "Chòm sao"],
            ["constellationNames", "Tên chòm sao"],
            ["starNames", "Tên sao"],
            ["deepSky", "Thiên thể sâu"],
            ["milkyWay", "Ngân Hà"],
            ["ecliptic", "Hoàng đạo 12 cung"],
            ["planets", "Hành tinh"],
            ["grid", "Lưới toạ độ"]
          ] as Array<[keyof typeof toggles, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setToggles((previous) => ({ ...previous, [key]: !previous[key] }))}
            className={toggles[key] ? "chip chip-active" : "chip"}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={wrapperRef} className="relative mt-4 h-[26rem] w-full overflow-hidden rounded-xl border border-slate-800 md:h-[34rem]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinchRef.current = null;
          }}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        />
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[18rem] rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          Kéo để di chuyển · lăn chuột hoặc chụm hai ngón để phóng to · bấm vào sao để xem chi tiết.
          <span className="block text-slate-400">
            {mode === "horizon" ? "Vòng xanh là đường chân trời, tâm là thiên đỉnh." : "Đường nét đứt xanh là chân trời hiện tại."}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Danh mục: 5.044 sao (Hipparcos tới cấp 6) · 88 chòm sao (tên Việt) · 118 thiên thể sâu · dữ liệu d3-celestial (MIT), tính toán
        bằng astronomy-engine.
      </p>

      {selectedInfo ? (
        <div className="mt-4 rounded-xl border border-sky-300/30 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-sky-100">{selectedInfo.title}</p>
              {selectedInfo.subtitle ? <p className="text-xs text-slate-400">{selectedInfo.subtitle}</p> : null}
            </div>
            <button type="button" className="chip" onClick={() => onAskAbout(selectedInfo.askQuestion)}>
              Hỏi AI về đối tượng này
            </button>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {selectedInfo.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-slate-800 pb-1">
                <dt className="text-slate-400">{label}</dt>
                <dd className="text-right text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">
          Bấm vào một ngôi sao, thiên thể sâu hoặc hành tinh trên bản đồ để xem toạ độ, độ cao, vị trí hoàng đạo và hỏi AI về đối tượng
          đó.
        </p>
      )}
    </div>
  );
}
