/**
 * "Ngắm bầu trời 3D" — khung nhìn phối cảnh thật của thiên cầu trên canvas 2D.
 *
 * Khác bản 2D (phép chiếu phẳng), ở đây mỗi thiên thể là một hướng 3D được chiếu qua ống kính
 * pinhole (`makeCamera3D`): chân trời là đường thẳng, các vòng độ cao cong đúng phối cảnh,
 * Mặt Trời/Mặt Trăng to ra thật khi phóng to, và mặt đất có lưới khoảng cách hội tụ về chân trời.
 *
 * Chuyển động thời gian mượt: khung sao chỉ dựng lại mỗi ~4 phút mô phỏng, còn giữa hai lần dựng
 * thì toàn bộ sao được **quay bằng ma trận ΔLST** (chính xác tuyệt đối, không giật cục), nên tua
 * thời gian nhanh vẫn mượt 60 fps; vệt sao xuất hiện khi tua nhanh như ảnh phơi sáng.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DEEP_SKY, STARS } from "@/lib/sky";
import { createSpriteCache, type SkyHit, type SkySelection } from "@/lib/sky-render";
import { SKY_3D_TOGGLES, drawSky3D, type Sky3DToggles } from "@/lib/sky3d-render";
import { buildSkyFrame, clamp, phaseName } from "@/lib/sky-visual";
import { localSiderealDegrees } from "@/lib/astro";
import {
  CAMERA_FOV,
  COMPASS_8,
  altAzOf,
  applyMatrix3,
  centerCameraOn,
  clampCamera,
  directionOf,
  lookByPixels,
  makeCamera3D,
  skyRotationMatrix,
  starTrailDegrees,
  yawDelta,
  zoomCameraAtPoint,
  type Camera3D
} from "@/lib/sky3d";

export type Sky3DProps = {
  latitude: number;
  longitude: number;
  placeLabel: string;
  onAskAbout: (question: string) => void;
};

/** Tốc độ tua thời gian (phút mô phỏng mỗi giây thật). 1/60 ≈ thời gian thực. */
const SPEED_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1 / 60, label: "thời gian thực" },
  { value: 5, label: "5 phút/giây" },
  { value: 30, label: "30 phút/giây" },
  { value: 120, label: "2 giờ/giây" },
  { value: 360, label: "6 giờ/giây" }
];

/** Khung sao dựng lại khi lệch quá ngưỡng này (phút mô phỏng) — đủ nhỏ để Mặt Trăng không giật. */
const REBUILD_GAP_MINUTES = 4;

const nearestCompass = (yawDeg: number) => {
  const wrapped = ((yawDeg % 360) + 360) % 360;
  let best = COMPASS_8[0];
  for (const direction of COMPASS_8) {
    if (Math.abs(yawDelta(wrapped, direction.az)) < Math.abs(yawDelta(wrapped, best.az))) best = direction;
  }
  return best.label;
};

const toLocalInput = (value: Date) => {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

export default function Sky3D({ latitude, longitude, placeLabel, onAskAbout }: Sky3DProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesRef = useRef(createSpriteCache());
  const rafRef = useRef<number | null>(null);
  const hitsRef = useRef<SkyHit[]>([]);
  const dragRef = useRef<{ x: number; y: number; moved: boolean; pointers: Map<number, { x: number; y: number }> } | null>(null);
  const pinchRef = useRef<{ distance: number } | null>(null);

  /** Camera đang vẽ (đã làm mượt) và camera đích (do người dùng điều khiển). */
  const cameraRef = useRef<Camera3D>({ yaw: 180, pitch: 14, fov: 64 });
  const targetRef = useRef<Camera3D>({ yaw: 180, pitch: 14, fov: 64 });
  const simRef = useRef<number>(Date.now());
  const frameRef = useRef<{ frame: ReturnType<typeof buildSkyFrame>; time: number } | null>(null);
  const dirtyRef = useRef(true);

  const [cameraHud, setCameraHud] = useState({ yaw: 180, pitch: 14, fov: 64 });
  const [simDate, setSimDate] = useState(() => new Date());
  const [live, setLive] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [toggles, setToggles] = useState<Sky3DToggles>(SKY_3D_TOGGLES);
  const [selected, setSelected] = useState<SkySelection>(null);
  const [stats, setStats] = useState({ drawn: 0, visible: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  const position = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);

  /* ------------------------------------------------------------- vòng vẽ rAF */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(wrap);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, wrap.clientWidth);
      const height = Math.max(240, wrap.clientHeight);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        dirtyRef.current = true;
      }
      return { width, height, dpr };
    };
    const sizeObserver = new ResizeObserver(() => resize());
    sizeObserver.observe(wrap);

    let last = performance.now();
    let hudAt = 0;

    const tick = (now: number) => {
      rafRef.current = window.requestAnimationFrame(tick);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (!visible) return;

      const { width, height, dpr } = resize();

      // Thời gian mô phỏng: trực tiếp, tua, hoặc đứng yên.
      if (live) simRef.current = Date.now();
      else if (playing) simRef.current += dt * speed * 60000;

      // Làm mượt camera: tiến dần về đích theo hàm mũ (không phụ thuộc fps).
      const ease = 1 - Math.exp(-dt * 14);
      const current = cameraRef.current;
      const target = targetRef.current;
      const dYaw = yawDelta(current.yaw, target.yaw);
      const dPitch = target.pitch - current.pitch;
      const dFov = Math.log(target.fov / current.fov);
      const settled = Math.abs(dYaw) < 0.002 && Math.abs(dPitch) < 0.002 && Math.abs(dFov) < 0.002;
      if (!settled) {
        cameraRef.current = clampCamera({
          yaw: current.yaw + dYaw * ease,
          pitch: current.pitch + dPitch * ease,
          fov: current.fov * Math.exp(dFov * ease)
        });
      } else if (current !== target) {
        cameraRef.current = clampCamera(target);
      }

      // Khung sao: dựng lại khi lệch quá ngưỡng; giữa hai lần dựng thì quay bằng ma trận ΔLST.
      const simTime = simRef.current;
      const cached = frameRef.current;
      const gapMinutes = cached ? Math.abs(simTime - cached.time) / 60000 : Number.POSITIVE_INFINITY;
      if (!cached || dirtyRef.current || gapMinutes > REBUILD_GAP_MINUTES) {
        frameRef.current = { frame: buildSkyFrame(new Date(simTime), position.latitude, position.longitude), time: simTime };
        dirtyRef.current = false;
      }
      const stored = frameRef.current;
      if (!stored) return;
      const { frame, time } = stored;
      const deltaLst = localSiderealDegrees(new Date(simTime), position.longitude) - localSiderealDegrees(new Date(time), position.longitude);
      const rotation = skyRotationMatrix(deltaLst, position.latitude);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const result = drawSky3D({
        ctx: context,
        width,
        height,
        camera: cameraRef.current,
        frame,
        rotation,
        latitude: position.latitude,
        toggles,
        selected,
        sprites: spritesRef.current,
        spriteFactory: (spriteWidth, spriteHeight) => {
          const offscreen = document.createElement("canvas");
          offscreen.width = spriteWidth;
          offscreen.height = spriteHeight;
          return offscreen;
        },
        timeMs: now,
        trailDegrees: playing ? starTrailDegrees(clamp(speed * 2, 0.5, 160) * 60) : 0
      });
      hitsRef.current = result.hits;

      if (now - hudAt > 250) {
        hudAt = now;
        setCameraHud({ ...cameraRef.current });
        setSimDate(new Date(simTime));
        setStats({ drawn: result.drawnStars, visible: result.visibleStars });
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      sizeObserver.disconnect();
    };
  }, [live, playing, speed, toggles, selected, position]);

  /* ------------------------------------------------------------ thời gian */
  useEffect(() => {
    dirtyRef.current = true;
  }, [latitude, longitude]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.requestFullscreen?.();
  }, []);

  /* ------------------------------------------------------- con trỏ & bàn phím */
  const screenPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = screenPoint(event);
    const drag = dragRef.current ?? { x: point.x, y: point.y, moved: false, pointers: new Map() };
    drag.pointers.set(event.pointerId, point);
    if (drag.pointers.size === 1) {
      drag.x = point.x;
      drag.y = point.y;
      drag.moved = false;
    }
    dragRef.current = drag;
    if (drag.pointers.size === 2) {
      const [a, b] = [...drag.pointers.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* jsdom/ trình duyệt cũ không hỗ trợ — bỏ qua */
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.pointers.has(event.pointerId)) return;
    const point = screenPoint(event);
    const previous = drag.pointers.get(event.pointerId);
    drag.pointers.set(event.pointerId, point);
    if (!previous) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (drag.pointers.size === 2 && pinchRef.current) {
      const [a, b] = [...drag.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = distance / Math.max(24, pinchRef.current.distance);
      pinchRef.current = { distance };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let next = zoomCameraAtPoint(targetRef.current, factor, mid, width, height);
      // Vuốt dọc bằng 2 ngón để ngẩng/hạ tầm nhìn — vì vuốt dọc 1 ngón đã
      // dành cho cuộn trang (touch-pan-y) nên mobile cần lối này để đổi pitch.
      // Chỉ áp dụng khi khoảng cách 2 ngón gần như không đổi (không phải chụm).
      const dy = point.y - previous.y;
      if (Math.abs(factor - 1) < 0.04 && Math.abs(dy) > 0.5) {
        next = lookByPixels(next, 0, dy, height);
      }
      targetRef.current = next;
      return;
    }

    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (!drag.moved && Math.hypot(point.x - drag.x, point.y - drag.y) > 4) drag.moved = true;
    if (drag.moved) targetRef.current = lookByPixels(targetRef.current, dx, dy, height);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pointers.delete(event.pointerId);
    if (drag.pointers.size < 2) pinchRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* bỏ qua */
    }
    if (drag.pointers.size === 0) {
      if (!drag.moved) {
        const point = screenPoint(event);
        const hit = hitsRef.current.find((item) => Math.hypot(item.x - point.x, item.y - point.y) <= item.radius);
        setSelected(hit ? { kind: hit.kind, key: hit.key } : null);
      }
      dragRef.current = null;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      // Không passive + preventDefault: bánh xe chỉ phóng bầu trời, không cuộn trang (bài học lượt 1).
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(-event.deltaY * 0.0016);
      targetRef.current = zoomCameraAtPoint(targetRef.current, factor, point, rect.width, rect.height);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const point = screenPoint(event);
    const hit = hitsRef.current.find((item) => Math.hypot(item.x - point.x, item.y - point.y) <= item.radius);
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (hit) {
      setSelected({ kind: hit.kind, key: hit.key });
      targetRef.current = centerCameraOn(targetRef.current, selectionAltAz(hit) ?? { alt: cameraHud.pitch, az: cameraHud.yaw });
    } else {
      const projector = makeCamera3D(cameraRef.current, canvas.clientWidth, canvas.clientHeight);
      targetRef.current = centerCameraOn(targetRef.current, projector.inverse(point.x, point.y));
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const height = canvas.clientHeight;
    const step = 48;
    const key = event.key;
    if (key === "ArrowLeft") targetRef.current = lookByPixels(targetRef.current, step, 0, height);
    else if (key === "ArrowRight") targetRef.current = lookByPixels(targetRef.current, -step, 0, height);
    else if (key === "ArrowUp") targetRef.current = lookByPixels(targetRef.current, 0, step, height);
    else if (key === "ArrowDown") targetRef.current = lookByPixels(targetRef.current, 0, -step, height);
    else if (key === "+" || key === "=") targetRef.current = clampCamera({ ...targetRef.current, fov: targetRef.current.fov / 1.25 });
    else if (key === "-" || key === "_") targetRef.current = clampCamera({ ...targetRef.current, fov: targetRef.current.fov * 1.25 });
    else if (key === " ") setPlaying((value) => !value);
    else return;
    event.preventDefault();
  };

  /* --------------------------------------------------- thông tin vật thể chọn */
  const selectionAltAz = (hit: SkyHit) => {
    const cached = frameRef.current;
    if (!cached) return null;
    const { frame, time } = cached;
    const rotation = skyRotationMatrix(
      localSiderealDegrees(new Date(simRef.current), position.longitude) - localSiderealDegrees(new Date(time), position.longitude),
      position.latitude
    );
    if (hit.kind === "star") {
      const star = frame.stars[Number(hit.key)];
      if (!star) return null;
      return altAzOf(applyMatrix3(rotation, directionOf(star.alt, star.az)));
    }
    if (hit.kind === "deepsky") {
      const object = frame.deepSky[Number(hit.key)];
      if (!object) return null;
      return altAzOf(applyMatrix3(rotation, directionOf(object.alt, object.az)));
    }
    const planet = frame.planets.find((item) => item.key === hit.key);
    if (!planet) return null;
    return altAzOf(applyMatrix3(rotation, directionOf(planet.alt, planet.az)));
  };

  const selectionInfo = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "star") {
      const star = STARS[Number(selected.key)];
      if (!star) return null;
      const name = star.alternatives[0] ?? `Sao ${selected.key}`;
      return { name, detail: `cấp sao ${star.mag.toFixed(2)}`, question: `Ý nghĩa sao ${name} trong chiêm tinh?` };
    }
    if (selected.kind === "deepsky") {
      const object = DEEP_SKY[Number(selected.key)];
      if (!object) return null;
      return { name: object.label || object.id, detail: `thiên thể sâu ${object.id}`, question: `Giới thiệu thiên thể ${object.id}.` };
    }
    const cached = frameRef.current?.frame;
    const planet = cached?.planets.find((item) => item.key === selected.key);
    if (!planet) return null;
    const extra =
      selected.key === "moon" && cached ? ` · pha ${phaseName(cached.moonElongation)}` : "";
    return { name: planet.label, detail: `hành tinh${extra}`, question: `Vị trí ${planet.label} hiện tại nói lên điều gì?` };
  }, [selected]);

  const altAz = selected ? selectionAltAz({ kind: selected.kind, key: selected.key, x: 0, y: 0, radius: 0 }) : null;

  const toggle = (key: keyof Sky3DToggles, label: string) => (
    <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 transition hover:border-sky-400/70 has-[:checked]:border-sky-300/70 has-[:checked]:bg-sky-400/10 has-[:checked]:text-sky-100">
      <input
        type="checkbox"
        checked={toggles[key]}
        onChange={(event) => setToggles((previous) => ({ ...previous, [key]: event.target.checked }))}
        className="h-4 w-4 accent-sky-400"
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Khung ngắm bầu trời ba chiều: kéo để nhìn quanh, lăn chuột để phóng to thu nhỏ, phím mũi tên để xoay, phím cách để chạy thời gian"
        className={
          fullscreen
            ? "relative h-screen w-screen select-none overflow-hidden border-0 bg-black outline-none"
            : "sky-frame relative aspect-[3/4] min-h-[320px] w-full select-none overflow-hidden rounded-2xl border border-slate-800 bg-black outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:aspect-auto sm:h-[62vh] sm:min-h-[420px]"
        }
      >
        <canvas
          ref={canvasRef}
          className="sky-canvas block h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={(event) => event.preventDefault()}
          onTouchStart={(event) => {
            // Chặn trình duyệt thu phóng cả trang khi chụm 2 ngón trên canvas
            if (event.touches.length > 1) event.preventDefault();
          }}
          onTouchMove={(event) => {
            if (event.touches.length > 1) event.preventDefault();
          }}
        />

        {/* HUD góc trái: hướng nhìn + trường nhìn */}
        <div className="pointer-events-none absolute left-1.5 top-1.5 max-w-[48%] rounded-lg bg-slate-950/70 px-2 py-1 text-[9px] leading-3 text-slate-300 backdrop-blur sm:left-3 sm:top-3 sm:max-w-none sm:px-3 sm:py-2 sm:text-[11px] sm:leading-5">
          <div>
            Hướng <span className="font-semibold text-sky-300">{nearestCompass(cameraHud.yaw)}</span> · {Math.round(((cameraHud.yaw % 360) + 360) % 360)}°
            · ngẩng {cameraHud.pitch.toFixed(0)}°
          </div>
          <div>
            Trường nhìn {cameraHud.fov.toFixed(0)}°
            <span className="hidden sm:inline"> · {stats.drawn.toLocaleString("vi-VN")} sao trong khung</span>
          </div>
          <div className="hidden text-slate-400 sm:block">{placeLabel}</div>
        </div>

        {/* HUD góc phải: thời gian mô phỏng */}
        <div className="pointer-events-none absolute right-1.5 top-1.5 max-w-[42%] rounded-lg bg-slate-950/70 px-2 py-1 text-right text-[9px] leading-3 text-slate-300 backdrop-blur sm:right-3 sm:top-3 sm:max-w-none sm:px-3 sm:py-2 sm:text-[11px] sm:leading-5">
          <div className="font-semibold text-slate-100">{simDate.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" })}</div>
          <div className="text-slate-400">{live ? "theo giờ thực" : playing ? `tua ${speed >= 1 ? `${speed} phút/giây` : "thời gian thực"}` : "tạm dừng"}</div>
        </div>

        {/* Thẻ vật thể đang chọn */}
        {selected && selectionInfo ? (
          <div className="absolute inset-x-1.5 bottom-12 flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/85 px-2.5 py-1.5 text-[11px] text-slate-200 backdrop-blur sm:inset-x-auto sm:bottom-3 sm:left-3 sm:right-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs">
            <span className="font-semibold text-amber-200">{selectionInfo.name}</span>
            <span className="text-slate-400">
              {selectionInfo.detail}
              {altAz ? ` · cao ${altAz.alt.toFixed(1)}° · hướng ${Math.round(altAz.az)}°` : ""}
            </span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                onAskAbout(selectionInfo.question);
              }}
            >
              Hỏi AI
            </button>
            <button type="button" className="chip" onClick={() => setSelected(null)}>
              Bỏ chọn
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="chip absolute bottom-2 right-2 bg-slate-950/80 sm:bottom-3 sm:right-3"
          onClick={toggleFullscreen}
          title={fullscreen ? "Thoát toàn màn hình" : "Xem toàn màn hình"}
        >
          {fullscreen ? "⤡ Thu nhỏ" : "⤢ Toàn màn hình"}
        </button>
      </div>

      {/* --------------------------------------------------------- điều khiển */}
      <div className="card flex w-full max-w-full flex-wrap items-center gap-2 p-2.5 text-xs min-[428px]:p-3 min-[428px]:text-[13px] text-slate-300 sm:gap-x-3 sm:p-3 overflow-hidden">
        <span className="overline w-full sm:w-auto">Thời gian</span>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setLive(false);
            setPlaying((value) => !value);
          }}
        >
          {playing ? "⏸ Dừng tua" : "▶ Tua thời gian"}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setLive(true);
            setPlaying(false);
            simRef.current = Date.now();
            dirtyRef.current = true;
          }}
        >
          ● Về hiện tại
        </button>
        <label className="flex items-center gap-2">
          Tốc độ
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70"
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="datetime-local"
          value={toLocalInput(simDate)}
          onChange={(event) => {
            const parsed = new Date(event.target.value);
            if (Number.isNaN(parsed.getTime())) return;
            setLive(false);
            setPlaying(false);
            simRef.current = parsed.getTime();
            dirtyRef.current = true;
          }}
          className="h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 [color-scheme:dark] sm:h-9 sm:w-auto"
        />
        <label className="flex w-full items-center gap-2 sm:w-auto">
          Phóng to
          <input
            type="range"
            min={CAMERA_FOV.min}
            max={CAMERA_FOV.max}
            step={1}
            value={Math.round(cameraHud.fov)}
            onChange={(event) => {
              const fov = Number(event.target.value);
              targetRef.current = clampCamera({ ...targetRef.current, fov });
            }}
            className="w-full min-w-24 flex-1 accent-sky-400 sm:w-28 sm:flex-none md:w-36"
          />
        </label>
      </div>

      <div className="card w-full max-w-full p-3 overflow-hidden">
        <p className="overline mb-2">Lớp hiển thị</p>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-300 sm:gap-2 sm:text-xs">
        {toggle("lines", "Chòm sao")}
        {toggle("constellationNames", "Tên chòm sao")}
        {toggle("starNames", "Tên sao")}
        {toggle("milkyWay", "Ngân Hà")}
        {toggle("deepSky", "Thiên thể sâu")}
        {toggle("ecliptic", "Hoàng đạo")}
        {toggle("grid", "Lưới độ cao")}
        {toggle("equatorial", "Lưới xích đạo")}
        {toggle("groundGrid", "Lưới mặt đất")}
        {toggle("atmosphere", "Khí quyển")}
        {toggle("ground", "Mặt đất")}
        {toggle("twinkle", "Nhấp nháy")}
        {toggle("trails", "Vệt sao")}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        <span className="sm:hidden">
          Mẹo: vuốt ngang để xoay trời, vuốt dọc để cuộn trang, chụm 2 ngón để phóng to, vuốt dọc bằng 2 ngón để ngẩng/hạ tầm
          nhìn. Chạm vào thiên thể để xem chi tiết.
        </span>
        <span className="hidden sm:inline">
          Mẹo: kéo chuột để nhìn quanh, lăn chuột để phóng to quanh con trỏ, nháy đúp vào thiên thể để đưa vào giữa khung,
          phím cách để tua thời gian. Khi tua nhanh, sao để lại vệt cung như ảnh phơi sáng thật.
        </span>
      </p>
    </div>
  );
}
