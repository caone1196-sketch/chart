/**
 * Kiểm tra giao diện "Ngắm bầu trời 3D" chạy thật trong jsdom:
 *  - gắn Sky3D, chạy vòng rAF với context giả ghi lại lời gọi vẽ (toàn bộ drawSky3D chạy thật);
 *  - mô phỏng: lăn chuột (phải preventDefault để trang không cuộn), kéo nhìn quanh, phím cách tua,
 *    bấm chọn thiên thể rồi "Hỏi AI", bỏ chọn, bật/tắt lớp khí quyển, đổi ô ngày giờ, toàn màn hình;
 *  - mục tiêu: không ngoại lệ, không console.error, HUD phản ánh đúng thao tác.
 *
 *   npm run test:ui3d
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const bundle = readFileSync(".cache/ui3d-smoke.js", "utf8");

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: "https://localhost/"
});

const { window } = dom;
const errors = [];
const consoleErrors = [];

window.addEventListener("error", (event) => errors.push(String(event.error ?? event.message)));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

const drawCalls = { total: 0, byMethod: {} };

const makeFakeContext = () => {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: (text) => ({ width: String(text).length * 6 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: () => {},
    save: () => {},
    restore: () => {}
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      const name = String(property);
      if (name === "then") return undefined;
      return (...args) => {
        void args;
        drawCalls.total += 1;
        drawCalls.byMethod[name] = (drawCalls.byMethod[name] ?? 0) + 1;
      };
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    }
  });
};

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const context = makeFakeContext();
  context.canvas = this;
  return context;
};
window.HTMLCanvasElement.prototype.toDataURL = () => "data:,";
window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
window.HTMLCanvasElement.prototype.releasePointerCapture = () => {};

window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// Sky3D dừng vòng vẽ khi khuất màn hình — trong jsdom coi như luôn nhìn thấy.
window.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);
Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
  value() {
    return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 544, width: 900, height: 544, toJSON: () => ({}) };
  }
});

const originalError = console.error;
console.error = (...args) => {
  consoleErrors.push(args.map((value) => String(value)).join(" "));
  originalError(...args);
};

const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.MouseEvent,
  WheelEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  ResizeObserver: window.ResizeObserver,
  IntersectionObserver: window.IntersectionObserver,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  devicePixelRatio: 2,
  performance: window.performance,
  console
};

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  ✘ ${message}`);
};
const ok = () => undefined;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPaint = async (minimumCalls = 800, timeoutMs = 30000) => {
  const started = Date.now();
  while (drawCalls.total < minimumCalls && Date.now() - started < timeoutMs) await wait(50);
};

const run = new Function(...Object.keys(globals), `${bundle}\nreturn null;`);
try {
  run(...Object.values(globals));
} catch (error) {
  fail(`không gắn được giao diện 3D: ${error instanceof Error ? error.message : String(error)}`);
}

await waitForPaint();

const document = window.document;
const canvas = document.querySelector("canvas");
if (!canvas) fail("không tìm thấy canvas của khung 3D");
else ok();
if (!window.__ui3dReady) fail("Sky3D chưa gắn xong");
else ok();
if (drawCalls.total < 800) fail(`bộ vẽ 3D chạy quá ít lời gọi (${drawCalls.total})`);
else ok();
for (const method of ["arc", "fill", "stroke", "fillRect"]) {
  if (!drawCalls.byMethod[method]) fail(`hàm vẽ "${method}" chưa từng được gọi`);
  else ok();
}

/* ---------------------------------------------------------- tiện ích đọc HUD */
const hudText = () => [...document.querySelectorAll("div")].map((node) => node.textContent ?? "").join("\n");
const fovReadout = () => {
  const match = hudText().match(/Trường nhìn (\d+)°/);
  return match ? Number(match[1]) : Number.NaN;
};
const yawReadout = () => {
  const match = hudText().match(/· (\d+)° · ngẩng/);
  return match ? Number(match[1]) : Number.NaN;
};
const buttonByLabel = (label) =>
  [...document.querySelectorAll("button")].find((node) => (node.textContent ?? "").includes(label));

if (!Number.isFinite(fovReadout())) fail("HUD không hiển thị trường nhìn");
else ok();
if (!/sao trong khung/.test(hudText())) fail("HUD không hiển thị số sao trong khung");
else ok();

/* ------------------- đặt giờ đêm trước (jsdom chạy theo đồng hồ máy, có thể là ban ngày) */
const setNativeValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const timeInput = document.querySelector('input[type="datetime-local"]');
if (!timeInput) fail("thiếu ô ngày giờ mô phỏng");
else {
  setNativeValue(timeInput, "2026-01-15T20:00");
  await wait(700);
  if (!/tạm dừng/.test(hudText())) fail("đổi ngày giờ mà không dừng chế độ giờ thực");
  else ok();
  if (!hudText().includes("2026")) fail("HUD không cập nhật năm mô phỏng mới");
  else ok();
}

// Đêm rồi thì sao phải hiện: sprite quầng sáng (drawImage) và danh sách vật thể bấm được.
await waitForPaint(drawCalls.total + 1500);
await wait(400);
if (!drawCalls.byMethod.drawImage) fail("ban đêm mà sprite quầng sáng không được vẽ (drawImage)");
else ok();
const starCountMatch = hudText().match(/([\d.,]+) sao trong khung/);
const starCount = starCountMatch ? Number.parseFloat(starCountMatch[1].replace(/\./g, "")) : 0;
if (!(starCount > 50)) fail(`ban đêm mà HUD chỉ báo ${starCount} sao trong khung`);
else ok();

/* ------------------------------------ lăn chuột: phóng to và không cuộn trang */
const fovStart = fovReadout();
const wheel = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 450, clientY: 260, deltaY: -240 });
canvas.dispatchEvent(wheel);
if (!wheel.defaultPrevented) fail("lăn chuột trên khung 3D vẫn cuộn trang (wheel chưa preventDefault)");
else ok();
await wait(500);
const fovAfterWheel = fovReadout();
if (!(fovAfterWheel < fovStart)) fail(`lăn lên không thu hẹp trường nhìn (${fovStart}° → ${fovAfterWheel}°)`);
else ok();

/* --------------------------------------------- kéo chuột: hướng nhìn phải đổi */
const yawStart = yawReadout();
const pointer = (type, x, y) =>
  canvas.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
pointer("pointerdown", 400, 260);
for (let step = 1; step <= 6; step += 1) {
  pointer("pointermove", 400 + step * 14, 260 + step * 4);
  await wait(16);
}
pointer("pointerup", 484, 284);
await wait(600);
const yawAfterDrag = yawReadout();
if (!Number.isFinite(yawAfterDrag) || yawAfterDrag === yawStart) {
  fail(`kéo chuột không đổi hướng nhìn (${yawStart}° → ${yawAfterDrag}°)`);
} else ok();

/* ------------------------------------------- phím cách bật/tắt tua thời gian */
const playButton = () => buttonByLabel("Dừng tua") ?? buttonByLabel("Tua thời gian");
const before = playButton()?.textContent ?? "";
canvas.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }));
await wait(80);
const after = playButton()?.textContent ?? "";
if (before === after) fail(`phím cách không đổi trạng thái tua ("${before}" → "${after}")`);
else ok();
// tắt lại cho các bước sau khỏi tua liên tục
canvas.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }));
await wait(80);

/* --------------------------- bấm chọn thiên thể → thẻ thông tin → Hỏi AI */
let selectedChip = null;
outer: for (let gx = 120; gx <= 780; gx += 110) {
  for (let gy = 90; gy <= 420; gy += 110) {
    pointer("pointerdown", gx, gy);
    pointer("pointerup", gx, gy);
    await wait(60);
    selectedChip = [...document.querySelectorAll("button")].find((node) => (node.textContent ?? "") === "Hỏi AI");
    if (selectedChip) break outer;
  }
}
if (!selectedChip) fail("bấm khắp khung mà không chọn được thiên thể nào");
else ok();
if (selectedChip) {
  selectedChip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(60);
  if (!window.__askedQuestion) fail("nút Hỏi AI không gửi câu hỏi ra ngoài");
  else ok();
  const drop = buttonByLabel("Bỏ chọn");
  if (!drop) fail("thẻ chọn thiếu nút Bỏ chọn");
  else {
    drop.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await wait(60);
    if (buttonByLabel("Bỏ chọn")) fail("bỏ chọn mà thẻ vẫn còn");
    else ok();
  }
}

/* ---------------------------------------------- bật/tắt lớp + đổi ngày giờ */
const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
if (boxes.length < 10) fail(`thiếu nút bật/tắt lớp (${boxes.length})`);
else ok();
const atmosphereBox = boxes.find((box) => (box.closest("label")?.textContent ?? "").includes("Khí quyển"));
if (!atmosphereBox) fail("không thấy nút Khí quyển");
else {
  const wasChecked = atmosphereBox.checked;
  atmosphereBox.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(120);
  if (atmosphereBox.checked === wasChecked) fail("bấm nút Khí quyển không đổi trạng thái");
  else ok();
  atmosphereBox.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(120);
}

const liveButton = buttonByLabel("Về hiện tại");
if (!liveButton) fail("thiếu nút Về hiện tại");
else {
  liveButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(300);
  if (!/theo giờ thực/.test(hudText())) fail("nút Về hiện tại không bật lại giờ thực");
  else ok();
}

/* --------------------------------------------- toàn màn hình (jsdom không có) */
const fullscreenButton = buttonByLabel("Toàn màn hình");
if (!fullscreenButton) fail("thiếu nút toàn màn hình");
else {
  fullscreenButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(60);
  ok();
}

/* -------------------------------------------------------------- tổng kết */
if (errors.length) fail(`ngoại lệ ngoài dự kiến: ${errors.slice(0, 3).join(" | ")}`);
else ok();
if (consoleErrors.length) fail(`console.error: ${consoleErrors.slice(0, 3).join(" | ")}`);
else ok();

console.log(
  `\n${failures ? "✘" : "✔"} Giao diện ngắm trời 3D (jsdom): ${drawCalls.total.toLocaleString("vi-VN")} lời gọi vẽ, ${failures} lỗi.`
);
process.exit(failures ? 1 : 0);
