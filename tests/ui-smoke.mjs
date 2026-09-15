/**
 * Kiểm tra giao diện bản đồ sao chạy thật trong jsdom (không cần trình duyệt):
 *  - gắn StarMap vào DOM, chạy các hiệu ứng (ResizeObserver giả, requestAnimationFrame giả);
 *  - canvas được giả lập bằng "context ghi lại" nên toàn bộ hàm vẽ thực sự chạy;
 *  - mô phỏng lăn chuột, kéo, bấm chọn sao, đổi chế độ, tra cứu và bàn phím;
 *  - mục tiêu: không có ngoại lệ nào, không có console.error, canvas được vẽ nhiều lần.
 *
 *   npm run test:ui
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const bundle = readFileSync(".cache/ui-smoke.js", "utf8");

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

/** Context 2D giả: ghi nhận lời gọi, trả về đối tượng hợp lệ cho gradient/measureText. */
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

// jsdom không có canvas: cài bản giả để code vẽ chạy hết đường đi.
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const context = makeFakeContext();
  context.canvas = this;
  return context;
};
window.HTMLCanvasElement.prototype.toDataURL = () => "data:,";

window.ResizeObserver = class {
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
window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
window.HTMLCanvasElement.prototype.releasePointerCapture = () => {};

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

const run = new Function(
  ...Object.keys(globals),
  `${bundle}\nreturn function dispose() { return null; };`
);

try {
  run(...Object.values(globals));
} catch (error) {
  fail(`không gắn được giao diện: ${error instanceof Error ? error.message : String(error)}`);
}

await wait(120);

const canvas = window.document.querySelector("canvas");
if (!canvas) fail("không tìm thấy phần tử canvas");
else ok();
if (!window.__uiSmokeReady) fail("ứng dụng chưa gắn xong");
else ok();
if (drawCalls.total < 500) fail(`họa tiết vẽ quá ít lời gọi (${drawCalls.total})`);
else ok();
for (const method of ["drawImage", "arc", "fillText", "stroke", "fill"]) {
  if (!drawCalls.byMethod[method]) fail(`hàm vẽ "${method}" chưa bao giờ được gọi`);
  else ok();
}

const clickCanvas = (type, init) => canvas.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));

const beforeWheel = drawCalls.total;
clickCanvas("wheel", { clientX: 400, clientY: 260, deltaY: -120 });
await wait(60);
if (drawCalls.total <= beforeWheel) fail("lăn chuột không vẽ lại canvas");
else ok();

const beforeDrag = drawCalls.total;
clickCanvas("pointerdown", { clientX: 400, clientY: 260, pointerId: 1 });
clickCanvas("pointermove", { clientX: 470, clientY: 300, pointerId: 1 });
clickCanvas("pointerup", { clientX: 470, clientY: 300, pointerId: 1 });
await wait(60);
if (drawCalls.total <= beforeDrag) fail("kéo bản đồ không vẽ lại canvas");
else ok();

// Bấm chọn một ngôi sao: dùng đúng toạ độ do lần vẽ gần nhất ghi lại.
const starHit = window.__skyTest?.starAt();
if (!starHit) fail("không xác định được ngôi sao nào trên khung nhìn để bấm");
else {
  clickCanvas("pointerdown", { clientX: starHit.x, clientY: starHit.y, pointerId: 1 });
  clickCanvas("pointerup", { clientX: starHit.x, clientY: starHit.y, pointerId: 1 });
  await wait(60);
  const html = window.document.body.innerHTML;
  if (!html.includes("Cấp sao (mag)")) fail("bấm vào sao không mở bảng thông tin");
  else ok();
}

// Nút đổi chế độ + nút lớp hiển thị + ô tra cứu.
const buttons = [...window.document.querySelectorAll("button")];
const mapButton = buttons.find((button) => button.textContent?.includes("Toàn cảnh"));
if (!mapButton) fail("không tìm thấy nút chuyển sang Toàn cảnh");
else {
  const before = drawCalls.total;
  mapButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(80);
  if (drawCalls.total <= before) fail("chuyển chế độ Toàn cảnh không vẽ lại");
  else ok();
}

const groundButton = buttons.find((button) => button.textContent?.includes("Mặt đất"));
if (!groundButton) fail("không tìm thấy nút bật/tắt mặt đất");
else {
  groundButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(60);
  ok();
}

const input = window.document.querySelector('input[placeholder^="Tìm sao"]');
if (!input) fail("không tìm thấy ô tra cứu");
else {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  valueSetter.call(input, "Sao Thiên Lang");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(40);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
  await wait(80);
  const html = window.document.body.innerHTML;
  if (!html.includes("Sirius")) fail("tra cứu tên tiếng Việt (Sao Thiên Lang) không hiện kết quả");
  else ok();
}

canvas.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "+" }));
canvas.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }));
canvas.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "0" }));
await wait(80);
ok();

const unexpected = consoleErrors.filter((message) => !/Warning: |act\(|not wrapped in act/.test(message));
if (unexpected.length) fail(`console.error không mong đợi: ${unexpected.slice(0, 3).join(" | ")}`);
else ok();
if (errors.length) fail(`ngoại lệ khi chạy: ${errors.slice(0, 3).join(" | ")}`);
else ok();

console.log(
  `\n${failures ? "✘" : "✔"} Giao diện bản đồ sao (jsdom): ${drawCalls.total.toLocaleString("vi-VN")} lời gọi vẽ, ${failures} lỗi.`
);
process.exit(failures ? 1 : 0);
