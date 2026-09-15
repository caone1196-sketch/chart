import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ChartData } from "@/lib/astro";
import { displayAngle, signedSeparation } from "@/lib/astro";
import { DEEP_SKY, STARS, compass, signPositionOf, toHorizontal } from "@/lib/sky";
import {
  createSpriteCache,
  drawSky,
  type SkyDrawToggles,
  type SkyHit,
  type SkySelection
} from "@/lib/sky-render";
import {
  HORIZON_ZOOM,
  MAP_ZOOM,
  buildSkyFrame,
  buildSkyTargets,
  clamp,
  eclipticLongitudeOf,
  findSkyTarget,
  formatDec,
  formatRa,
  horizonScale,
  makeProjector,
  phaseName,
  skyTone,
  specialTargetEquatorial,
  wrap180,
  zoomAroundPoint,
  type SkyMode,
  type SkyTarget,
  type SkyView
} from "@/lib/sky-visual";

const MODE_LABEL: Record<SkyMode, string> = {
  horizon: "Bầu trời (độ cao – phương vị)",
  map: "Toàn cảnh (xích kinh – xích vĩ)"
};

const MAP_PRESETS: Array<{ label: string; ra: number; dec: number }> = [
  { label: "Dải Ngân Hà", ra: 266, dec: -28 },
  { label: "Vùng 0h (Thu)", ra: 0, dec: 0 },
  { label: "Vùng 6h (Đông)", ra: 90, dec: 0 },
  { label: "Vùng 12h (Hạ)", ra: 180, dec: -10 },
  { label: "Vùng 18h (Xuân)", ra: 270, dec: 5 }
];

const HORIZON_PRESETS: Array<{ label: string; az: number; alt: number }> = [
  { label: "Bắc", az: 0, alt: 35 },
  { label: "Đông", az: 90, alt: 35 },
  { label: "Nam", az: 180, alt: 35 },
  { label: "Tây", az: 270, alt: 35 },
  { label: "Thiên đỉnh", az: 0, alt: 80 }
];

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
  const hitsRef = useRef<SkyHit[]>([]);
  const dragRef = useRef<{ x: number; y: number; moved: boolean; time: number } | null>(null);
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null);
  const spritesRef = useRef(createSpriteCache());
  const rafRef = useRef<number | null>(null);

  const [mode, setMode] = useState<SkyMode>("horizon");
  const [date, setDate] = useState(() => new Date());
  const [live, setLive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speedHours, setSpeedHours] = useState(1);
  const [view, setView] = useState<SkyView>({ zoom: HORIZON_ZOOM.initial, x: 0, y: 0, centerRa: 0, centerDec: 20 });
  const [selected, setSelected] = useState<SkySelection>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pointerReadout, setPointerReadout] = useState<string | null>(null);
  const pointerPointRef = useRef<{ x: number; y: number } | null>(null);
  const [toggles, setToggles] = useState<SkyDrawToggles>({
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
  });

  const timeBucket = Math.round(date.getTime() / 2000);
  const frame = useMemo(
    () => buildSkyFrame(date, latitude, longitude),
    // Tính lại theo mốc 2 giây để thao tác kéo/zoom không phải dựng lại toàn bộ catalogue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeBucket, latitude, longitude]
  );
  const targets = useMemo(() => buildSkyTargets(), []);
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const matches = targets.filter((target) => target.search.includes(needle) || target.label.toLowerCase().includes(needle));
    return matches.slice(0, 8);
  }, [query, targets]);

  /* ------------------------------------------------------------------ thời gian */

  useEffect(() => {
    if (!live) return;
    setDate(new Date());
    const timer = window.setInterval(() => setDate(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDate((previous) => new Date(previous.getTime() + speedHours * 60 * 60000 * 0.25));
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, speedHours]);

  const stopTimeMotion = () => {
    setLive(false);
    setPlaying(false);
  };

  /* -------------------------------------------------------------------- kích thước */

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

  const toLocalInput = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  /* ------------------------------------------------------------------------ vẽ */

  const drawParams = { frame, mode, size, toggles, selected, view };
  const drawParamsRef = useRef(drawParams);
  drawParamsRef.current = drawParams;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { frame: currentFrame, mode: currentMode, size: currentSize, toggles: currentToggles, selected: currentSelected, view: currentView } =
      drawParamsRef.current;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = currentSize;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const result = drawSky({
      ctx: context,
      width,
      height,
      mode: currentMode,
      view: currentView,
      frame: currentFrame,
      toggles: currentToggles,
      selected: currentSelected,
      sprites: spritesRef.current,
      spriteFactory: (spriteWidth, spriteHeight) => {
        const sprite = document.createElement("canvas");
        sprite.width = spriteWidth;
        sprite.height = spriteHeight;
        return sprite;
      }
    });
    hitsRef.current = result.hits;
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  useEffect(() => {
    scheduleDraw();
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scheduleDraw, frame, mode, size, toggles, selected, view]);

  /* ---------------------------------------------------------------- khung nhìn */

  const centerScreen = useMemo(() => ({ x: size.width / 2, y: size.height / 2 }), [size.height, size.width]);

  const resetView = useCallback(() => {
    setView({
      zoom: mode === "map" ? MAP_ZOOM.initial : HORIZON_ZOOM.initial,
      x: 0,
      y: 0,
      centerRa: wrap180(frame.lstDeg),
      centerDec: latitude >= 0 ? 25 : -25
    });
  }, [frame.lstDeg, latitude, mode]);

  const applyZoom = useCallback(
    (factor: number, point: { x: number; y: number }) => {
      setView((previous) => zoomAroundPoint(mode, previous, point, factor, size.width, size.height));
    },
    [mode, size.height, size.width]
  );

  const zoomTo = useCallback(
    (zoom: number, point?: { x: number; y: number }) => {
      const target = point ?? centerScreen;
      setView((previous) => {
        const range = mode === "map" ? MAP_ZOOM : HORIZON_ZOOM;
        const wanted = clamp(zoom, range.min, range.max);
        const factor = wanted / previous.zoom;
        return zoomAroundPoint(mode, previous, target, factor, size.width, size.height);
      });
    },
    [centerScreen, mode, size.height, size.width]
  );

  const changeMode = (next: SkyMode) => {
    setMode(next);
    setView((previous) => ({
      zoom: next === "map" ? Math.max(previous.zoom, MAP_ZOOM.initial) : HORIZON_ZOOM.initial,
      x: 0,
      y: 0,
      centerRa: wrap180(frame.lstDeg),
      centerDec: next === "map" ? previous.centerDec || (latitude >= 0 ? 25 : -25) : previous.centerDec
    }));
  };

  /** Đưa một toạ độ (xích đạo, hệ của ngày) vào giữa khung nhìn. */
  const centerOnEquatorial = useCallback(
    (ra: number, dec: number, zoomBoost = 2.4) => {
      const horizontal = toHorizontal(ra, dec, frame.lstDeg, latitude);
      if (mode === "map") {
        setView((previous) => ({
          ...previous,
          zoom: clamp(Math.max(previous.zoom, zoomBoost), MAP_ZOOM.min, MAP_ZOOM.max),
          centerRa: wrap180(ra),
          centerDec: clamp(dec, -89.5, 89.5)
        }));
        return;
      }
      const altitude = clamp(horizontal.alt, -60, 89.5);
      const azRad = (horizontal.az * Math.PI) / 180;
      setView((previous) => {
        const zoom = clamp(Math.max(previous.zoom, zoomBoost), HORIZON_ZOOM.min, HORIZON_ZOOM.max);
        const scale = horizonScale(size.width, size.height, zoom);
        const radius = 2 * Math.tan(((90 - altitude) * Math.PI) / 360) * scale;
        return { ...previous, zoom, x: -radius * Math.sin(azRad), y: radius * Math.cos(azRad) };
      });
    },
    [frame.lstDeg, latitude, mode, size.height, size.width]
  );

  const goToTarget = useCallback(
    (target: SkyTarget) => {
      const equatorial = specialTargetEquatorial(target, frame);
      if (!equatorial) return;
      centerOnEquatorial(equatorial.ra, equatorial.dec);
      if (target.kind === "star" || target.kind === "deepsky" || target.kind === "planet") {
        setSelected({ kind: target.kind, key: String(target.key) });
      }
      setQuery("");
      setShowSuggestions(false);
    },
    [centerOnEquatorial, frame]
  );

  const submitQuery = () => {
    const target = findSkyTarget(targets, query);
    if (target) goToTarget(target);
  };

  /** Bộ chiếu hiện hành: dùng cho đọc toạ độ con trỏ và nút "đưa vào giữa khung". */
  const projector = useMemo(
    () => makeProjector(mode, view, size.width, size.height, { refract: mode === "horizon" && toggles.atmosphere }),
    [mode, size.height, size.width, toggles.atmosphere, view]
  );

  /* --------------------------------------------------------------- chuột & cảm ứng */

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus();
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false, time: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updatePointerReadout = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = projector.inverse(event.clientX - rect.left, event.clientY - rect.top);
    pointerPointRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const text =
      mode === "map"
        ? `${formatRa(point.ra)} · ${formatDec(point.dec)}`
        : `cao ${point.alt.toFixed(1)}° · ${compass(point.az)} ${point.az.toFixed(1)}°`;
    setPointerReadout((previous) => (previous === text ? previous : text));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      updatePointerReadout(event);
      return;
    }

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved) return;

    setView((previous) => {
      if (mode === "horizon") {
        return {
          ...previous,
          x: clamp(previous.x + dx, -size.width * 0.85, size.width * 0.85),
          y: clamp(previous.y + dy, -size.height * 0.85, size.height * 0.85)
        };
      }
      const scale = previous.zoom * ((size.height || size.width) * 0.96 / 182);
      const degreesPerPixel = 1 / scale;
      return {
        ...previous,
        centerRa: wrap180(previous.centerRa + dx * degreesPerPixel),
        centerDec: clamp(previous.centerDec + dy * degreesPerPixel, -89.5, 89.5)
      };
    });
    updatePointerReadout(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const tolerance: Record<SkyHit["kind"], number> = { star: 12, deepsky: 13, planet: 17 };

    let best: SkySelection = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const hit of hitsRef.current) {
      const distance = Math.hypot(hit.x - px, hit.y - py);
      const limit = Math.max(tolerance[hit.kind], hit.radius);
      if (distance < bestDistance && distance <= limit) {
        bestDistance = distance;
        best = { kind: hit.kind, key: hit.key };
      }
    }
    setSelected(best);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    applyZoom(event.deltaY < 0 ? 1.14 : 0.88, point);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    applyZoom(1.9, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 2) {
      dragRef.current = null;
      pinchRef.current = {
        distance: Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        ),
        midX: (event.touches[0].clientX + event.touches[1].clientX) / 2,
        midY: (event.touches[0].clientY + event.touches[1].clientY) / 2
      };
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    const pinch = pinchRef.current;
    if (event.touches.length !== 2 || !pinch) return;
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    const rect = event.currentTarget.getBoundingClientRect();
    if (pinch.distance > 0) applyZoom(distance / pinch.distance, { x: midX - rect.left, y: midY - rect.top });
    pinchRef.current = { distance, midX, midY };
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const step = mode === "map" ? 8 / view.zoom : 40;
    const zoomKeys: Record<string, number> = { "+": 1.25, "=": 1.25, "-": 0.8, _: 0.8 };
    if (event.key === "0" || event.key === "Home") {
      resetView();
    } else if (event.key in zoomKeys) {
      applyZoom(zoomKeys[event.key], centerScreen);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      setView((previous) => {
        if (mode === "horizon") {
          return {
            ...previous,
            x: clamp(previous.x + (horizontal ? direction * step : 0), -size.width * 0.85, size.width * 0.85),
            y: clamp(previous.y + (horizontal ? 0 : direction * step), -size.height * 0.85, size.height * 0.85)
          };
        }
        return {
          ...previous,
          centerRa: wrap180(previous.centerRa + (horizontal ? direction * step : 0)),
          centerDec: clamp(previous.centerDec + (horizontal ? 0 : direction * step), -89.5, 89.5)
        };
      });
    } else {
      return;
    }
    event.preventDefault();
  };

  /* ------------------------------------------------------------------- thông tin */

  const selectedInfo = useMemo(() => {
    if (!selected) return null;

    if (selected.kind === "star") {
      const meta = STARS[Number(selected.key)];
      const position = frame.stars[meta.index];
      const name = meta.alternatives[0] ?? `HIP ${meta.index}`;
      const designation = meta.alternatives.slice(1).filter((item) => !item.startsWith("HIP")).join(" · ");
      const eclipticLon = eclipticLongitudeOf(position.ra, position.dec, frame.obliquity);
      return {
        title: name,
        subtitle: [designation, meta.constellationVi ? `Chòm ${meta.constellationVi}` : ""].filter(Boolean).join(" · "),
        rows: [
          ["Cấp sao (mag)", meta.mag.toFixed(2)],
          ["Xích kinh / xích vĩ (J2000)", `${(((meta.ra + 360) % 360) / 15).toFixed(3)}h · ${meta.dec.toFixed(2)}°`],
          ["Xích kinh / xích vĩ (của ngày)", `${formatRa(position.ra)} · ${formatDec(position.dec)}`],
          ["Độ cao / phương vị", `${position.alt.toFixed(1)}° · ${compass(position.az)} (${position.az.toFixed(0)}°)`],
          ["Kinh độ hoàng đạo", signPositionOf(eclipticLon)],
          ["Chỉ số màu B-V", meta.bv.toFixed(2)]
        ] as Array<[string, string]>,
        askQuestion: `${name} (${meta.constellationVi ?? ""}) nằm ở ${signPositionOf(
          eclipticLon
        )} — sao này có ý nghĩa gì với bản đồ sao của tôi?`
      };
    }

    if (selected.kind === "deepsky") {
      const index = Number(selected.key);
      const meta = DEEP_SKY[index];
      const position = frame.deepSky[index];
      const eclipticLon = eclipticLongitudeOf(position.ra, position.dec, frame.obliquity);
      return {
        title: meta.vi || meta.id,
        subtitle: [`${meta.id}${meta.alt ? ` · ${meta.alt}` : ""}`, meta.en, meta.typeVi].filter(Boolean).join(" · "),
        rows: [
          ["Cấp sao", meta.mag !== null ? meta.mag.toFixed(1) : "—"],
          ["Xích kinh / xích vĩ (J2000)", `${(((meta.ra + 360) % 360) / 15).toFixed(3)}h · ${meta.dec.toFixed(2)}°`],
          ["Độ cao / phương vị", `${position.alt.toFixed(1)}° · ${compass(position.az)} (${position.az.toFixed(0)}°)`],
          ["Kinh độ hoàng đạo", signPositionOf(eclipticLon)]
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
        ["Xích kinh / xích vĩ", `${formatRa(planet.ra)} · ${formatDec(planet.dec)}`],
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

  const tone = skyTone(frame.sunAlt);
  const phase = useMemo(() => phaseName(frame.moonElongation), [frame.moonElongation]);
  const centerReadout = useMemo(
    () => `${formatRa(view.centerRa)} · ${formatDec(view.centerDec)}`,
    [view.centerDec, view.centerRa]
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Bản đồ sao thực tế</h3>
          <p className="mt-1 text-sm text-slate-400">
            {placeLabel} · {latitude.toFixed(3)}°, {longitude.toFixed(3)}° · giờ sao địa phương {(frame.lstDeg / 15).toFixed(2)}h ·{" "}
            {date.toLocaleString("vi-VN", { hour12: false })}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "horizon"
              ? `Mặt Trời ${frame.sunAlt.toFixed(1)}° · ${tone.day > 0.5 ? "ban ngày" : tone.starFactor < 0.35 ? "chạng vạng" : "đêm tối"} · Trăng ${phase}`
              : `Tâm khung: ${centerReadout} · mức phóng ${view.zoom.toFixed(2)}×`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["horizon", "map"] as SkyMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => changeMode(item)}
              className={mode === item ? "chip chip-active" : "chip"}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------ thanh thời gian */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <button
          type="button"
          className={live ? "chip chip-active" : "chip"}
          onClick={() => {
            if (live) {
              setLive(false);
              return;
            }
            setDate(new Date());
            setPlaying(false);
            setLive(true);
          }}
          title="Bám theo giờ thực, tự cập nhật mỗi giây"
        >
          {live ? "● Đang theo giờ thực" : "Bây giờ (theo giờ thực)"}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            stopTimeMotion();
            setDate((value) => new Date(value.getTime() - 3600000));
          }}
        >
          −1 giờ
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            stopTimeMotion();
            setDate((value) => new Date(value.getTime() + 3600000));
          }}
        >
          +1 giờ
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            stopTimeMotion();
            setDate((value) => new Date(value.getTime() - 86400000));
          }}
        >
          −1 ngày
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            stopTimeMotion();
            setDate((value) => new Date(value.getTime() + 86400000));
          }}
        >
          +1 ngày
        </button>
        <button
          type="button"
          className={playing ? "chip chip-active" : "chip"}
          onClick={() => {
            setLive(false);
            setPlaying((value) => !value);
          }}
        >
          {playing ? "⏸ Dừng thời gian" : "▶ Chạy thời gian"}
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
            if (!Number.isNaN(parsed.getTime())) {
              stopTimeMotion();
              setDate(parsed);
            }
          }}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
        />
      </div>

      {/* ------------------------------ điều khiển khung nhìn + tra cứu */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/70 px-2 py-1">
          <button type="button" className="chip border-none bg-transparent px-2" onClick={() => applyZoom(0.8, centerScreen)} title="Thu nhỏ (−)">
            −
          </button>
          <input
            type="range"
            min={mode === "map" ? MAP_ZOOM.min : HORIZON_ZOOM.min}
            max={mode === "map" ? MAP_ZOOM.max : HORIZON_ZOOM.max}
            step={0.1}
            value={view.zoom}
            onChange={(event) => zoomTo(Number(event.target.value))}
            className="h-1 w-28 cursor-pointer accent-sky-400"
            aria-label="Mức phóng"
          />
          <button type="button" className="chip border-none bg-transparent px-2" onClick={() => applyZoom(1.25, centerScreen)} title="Phóng to (+)">
            +
          </button>
          <span className="w-12 text-right tabular-nums text-slate-400">{view.zoom.toFixed(2)}×</span>
        </div>

        <button type="button" className="chip" onClick={resetView} title="Về khung nhìn mặc định (phím 0)">
          ⟲ Căn lại
        </button>

        {(mode === "map" ? MAP_PRESETS : HORIZON_PRESETS).map((preset) =>
          mode === "map" ? (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() => {
                const item = preset as { label: string; ra: number; dec: number };
                setView((previous) => ({ ...previous, centerRa: wrap180(item.ra), centerDec: item.dec, zoom: Math.max(previous.zoom, 1.2) }));
              }}
            >
              {preset.label}
            </button>
          ) : (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() => {
                const item = preset as { label: string; az: number; alt: number };
                const zoom = Math.max(view.zoom, 1.4);
                const scale = horizonScale(size.width, size.height, zoom);
                const radius = 2 * Math.tan(((90 - item.alt) * Math.PI) / 360) * scale;
                const azRad = (item.az * Math.PI) / 180;
                setView((previous) => ({ ...previous, zoom, x: -radius * Math.sin(azRad), y: radius * Math.cos(azRad) }));
              }}
            >
              {preset.label}
            </button>
          )
        )}

        <div className="relative">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitQuery();
              if (event.key === "Escape") setShowSuggestions(false);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Tìm sao, chòm sao, thiên thể…"
            className="w-56 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200 placeholder:text-slate-500"
          />
          <button type="button" className="chip ml-1" onClick={submitQuery}>
            Đi tới
          </button>
          {showSuggestions && suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-72 overflow-auto rounded-lg border border-slate-700 bg-slate-950/97 py-1 shadow-xl">
              {suggestions.map((target) => (
                <li key={`${target.kind}-${target.key}`}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-sky-400/10 hover:text-sky-100"
                    onClick={() => goToTarget(target)}
                  >
                    {target.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <span className="ml-auto flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-400">
          {pointerReadout ?? (mode === "map" ? `Tâm: ${centerReadout}` : "Đưa chuột lên bản đồ để đọc toạ độ")}
          <button
            type="button"
            className="text-sky-300 hover:text-sky-100"
            title="Đưa điểm đang trỏ vào giữa khung"
            onClick={() => {
              const point = pointerPointRef.current;
              if (!point) return;
              const coordinates = projector.inverse(point.x, point.y);
              if (mode === "map") centerOnEquatorial(coordinates.ra, coordinates.dec, view.zoom);
              else {
                const scale = horizonScale(size.width, size.height, view.zoom);
                const radius = 2 * Math.tan(((90 - clamp(coordinates.alt, -60, 89.5)) * Math.PI) / 360) * scale;
                const azRad = (coordinates.az * Math.PI) / 180;
                setView((previous) => ({ ...previous, x: -radius * Math.sin(azRad), y: radius * Math.cos(azRad) }));
              }
            }}
          >
            🎯
          </button>
        </span>
      </div>

      {/* ------------------------------ lớp hiển thị */}
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
            ["grid", "Lưới toạ độ"],
            ["atmosphere", "Khí quyển & ánh sáng nền"],
            ["ground", "Mặt đất & núi"]
          ] as Array<[keyof SkyDrawToggles, string]>
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
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            dragRef.current = null;
            setPointerReadout(null);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinchRef.current = null;
          }}
          onKeyDown={handleKeyDown}
          className="h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:cursor-grabbing"
        />
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[19rem] rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          {mode === "horizon"
            ? "Kéo để dịch chuyển · lăn chuột hoặc chụm hai ngón để phóng to quanh con trỏ · nháy đúp để phóng to nhanh · bấm vào sao để xem chi tiết."
            : "Kéo ngang để xoay theo xích kinh, kéo dọc để đổi xích vĩ · lăn chuột để phóng to quanh con trỏ · nháy đúp để phóng to nhanh · phím ←→↑↓ để dịch, +/− để phóng to."}
          <span className="mt-1 block text-slate-400">
            {mode === "horizon"
              ? "Màu trời, hấp thụ và khúc xạ tính theo độ cao Mặt Trời; núi và mặt đất che phần bầu trời bên dưới chân trời."
              : "Đường nét đứt xanh là chân trời hiện tại; mọi điểm cách nhau một khoảng bằng nhau trên bản đồ."}
          </span>
        </div>
        {live || playing ? (
          <span className="absolute right-3 top-3 rounded-full border border-sky-400/40 bg-slate-950/80 px-2 py-1 text-[10px] text-sky-200">
            {live ? "theo giờ thực" : `chạy ${speedHours} giờ/nhịp`}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Danh mục: 5.044 sao (Hipparcos tới cấp 6) · 88 chòm sao (tên Việt) · 118 thiên thể sâu · dữ liệu d3-celestial (MIT), tính toán bằng
        astronomy-engine · khí quyển theo Bennett (khúc xạ) và Kasten–Young (khối khí quyển).
      </p>

      {selectedInfo ? (
        <div className="mt-4 rounded-xl border border-sky-300/30 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-sky-100">{selectedInfo.title}</p>
              {selectedInfo.subtitle ? <p className="text-xs text-slate-400">{selectedInfo.subtitle}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="chip"
                onClick={() => {
                  const target = selected
                    ? targets.find((item) => item.kind === selected.kind && String(item.key) === selected.key)
                    : null;
                  if (target) goToTarget(target);
                }}
              >
                🎯 Đưa vào giữa khung
              </button>
              <button type="button" className="chip" onClick={() => onAskAbout(selectedInfo.askQuestion)}>
                Hỏi AI về đối tượng này
              </button>
            </div>
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
          Bấm vào một ngôi sao, thiên thể sâu hoặc hành tinh trên bản đồ để xem toạ độ, độ cao, vị trí hoàng đạo và hỏi AI về đối tượng đó.
          Ô tra cứu phía trên giúp tìm nhanh (ví dụ “Sao Bắc Cực”, “M42”, “Nhân Mã”).
        </p>
      )}
    </div>
  );
}
