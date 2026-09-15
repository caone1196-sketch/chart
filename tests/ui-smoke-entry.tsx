/**
 * Điểm vào cho bài kiểm tra giao diện (tests/ui-smoke.mjs): gắn StarMap vào #root
 * để chạy thật các hiệu ứng, vẽ canvas và xử lý sự kiện trong jsdom.
 */
import { createRoot } from "react-dom/client";
import StarMap from "@/components/StarMap";
import { STARS } from "@/lib/sky";
import { buildSkyFrame, makeProjector, terrainMaxDeg, wrap180 } from "@/lib/sky-visual";

declare global {
  interface Window {
    __uiSmokeReady?: boolean;
    __skyTest?: {
      frame: ReturnType<typeof buildSkyFrame>;
      projector: ReturnType<typeof makeProjector>;
      starAt: () => { index: number; name: string; x: number; y: number } | null;
    };
  }
}

const LATITUDE = 21.0285;
const LONGITUDE = 105.8542;
const CANVAS = { width: 900, height: 544 };

// Công cụ cho bài kiểm tra: tự tính toạ độ màn hình của một ngôi sao đang ở trên cao
// (đúng bằng khung nhìn mặc định của giao diện) để bấm trúng sao đó.
const frame = buildSkyFrame(new Date(), LATITUDE, LONGITUDE);
const projector = makeProjector(
  "horizon",
  { zoom: 1, x: 0, y: 0, centerRa: wrap180(frame.lstDeg), centerDec: 25 },
  CANVAS.width,
  CANVAS.height,
  { refract: true }
);

window.__skyTest = {
  frame,
  projector,
  starAt: () => {
    // Ngôi sao sáng nhất đang nằm trên độ cao địa hình và trong khung nhìn.
    let best: { index: number; x: number; y: number; mag: number } | null = null;
    frame.stars.forEach((star, index) => {
      if (star.mag > 3.5) return;
      if (star.alt < terrainMaxDeg(star.az) + 3) return;
      const point = projector.fromHorizontal(star.alt, star.az);
      if (point.x < 40 || point.x > CANVAS.width - 40 || point.y < 40 || point.y > CANVAS.height - 40) return;
      if (!best || star.mag < best.mag) best = { index: STARS[index].index, x: point.x, y: point.y, mag: star.mag };
    });
    return best
      ? { index: best.index, name: STARS[best.index].alternatives[0] ?? `HIP ${best.index}`, x: best.x, y: best.y }
      : null;
  }
};

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StarMap latitude={LATITUDE} longitude={LONGITUDE} placeLabel="Hà Nội, Việt Nam" chart={null} onAskAbout={() => {}} />
);
window.__uiSmokeReady = true;
