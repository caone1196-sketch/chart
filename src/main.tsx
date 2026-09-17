import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Chặn thu phóng cả trang web trên trình duyệt điện thoại:
// - Chặn gesture của Safari (pinch-zoom)
// - Chặn double-tap zoom nhanh
// - Chặn pinch-zoom 2 ngón ngoài canvas (canvas tự xử lý riêng)
if (typeof document !== "undefined") {
  // iOS Safari: gesture events
  const preventGesture = (event: Event) => event.preventDefault();
  document.addEventListener("gesturestart", preventGesture, { passive: false } as AddEventListenerOptions);
  document.addEventListener("gesturechange", preventGesture, { passive: false } as AddEventListenerOptions);
  document.addEventListener("gestureend", preventGesture, { passive: false } as AddEventListenerOptions);

  // Chặn double-tap zoom (300ms) trên mobile
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        const target = event.target as HTMLElement | null;
        const isFormField = target?.closest?.("input, textarea, select, [contenteditable=true]") != null;
        if (!isFormField) event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false } as AddEventListenerOptions
  );

  // Chặn pinch-zoom trình duyệt (2 ngón) ngoài vùng sky-canvas
  document.addEventListener(
    "touchmove",
    (event) => {
      const touchEvent = event as TouchEvent;
      if (touchEvent.touches.length > 1) {
        const target = event.target as HTMLElement | null;
        const insideSky = target?.closest?.(".sky-canvas") != null;
        if (!insideSky) event.preventDefault();
      }
    },
    { passive: false } as AddEventListenerOptions
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
