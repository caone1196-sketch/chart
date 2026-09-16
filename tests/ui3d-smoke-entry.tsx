/**
 * Điểm vào cho bài kiểm tra giao diện 3D (tests/ui3d-smoke.mjs): gắn Sky3D vào #root
 * để chạy thật vòng rAF, bộ vẽ phối cảnh (trên context giả ghi lại lời gọi) và các
 * handler con trỏ / bàn phím / điều khiển trong jsdom.
 */
import { createRoot } from "react-dom/client";
import Sky3D from "@/components/Sky3D";

declare global {
  interface Window {
    __ui3dReady?: boolean;
    __askedQuestion?: string;
  }
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <Sky3D
    latitude={21.0285}
    longitude={105.8542}
    placeLabel="Hà Nội, Việt Nam"
    onAskAbout={(question) => {
      window.__askedQuestion = question;
    }}
  />
);
window.__ui3dReady = true;
