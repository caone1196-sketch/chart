/**
 * Kiểm tra mô-đun 3D (`src/lib/sky3d.ts`) — hình học camera phối cảnh và chuyển động thời gian.
 *
 *   npm run test:sky3d
 *
 * Các bất biến:
 *  1. Vector ↔ (độ cao, phương vị) khứ hồi đúng; vector luôn đơn vị.
 *  2. Camera: đường chân trời (alt = 0) chiếu thành **một đường thẳng** đúng bằng `horizonY`.
 *  3. Nghịch đảo phép chiếu khớp phép chiếu thuận (dưới 1e-6 px) ở mọi điểm trong khung.
 *  4. `zoomCameraAtPoint` giữ nguyên hướng đang nằm dưới điểm zoom (như zoom 2D quanh con trỏ).
 *  5. Quay bầu trời theo ΔLST **khớp với khung dựng lại ở thời điểm mới** (sao: < 1e-6°) —
 *     đây là bằng chứng cho phép "không dựng lại catalogue mà vẫn chuyển động mượt".
 *  6. Mặt Trăng không khớp phép quay thuần (nó tự di chuyển ~0,55°/giờ) → ghi nhận giới hạn.
 *  7. Cung tròn lớn: `slerp3` đi đúng cung, `densifyPath` chia nhỏ đúng số bước.
 *  8. Cắt tia: vòng chân trời cho 1 dải liền nét; vòng tròn sau lưng camera cho 0 dải;
 *     mọi điểm trong dải đã cắt đều nằm trước ống kính.
 *  9. Mặt đất: các vòng khoảng cách hội tụ về đường chân trời, càng gần càng thấp xuống.
 * 10. Nhấp nháy, vệt sao, phần thiên cầu trong khung: đúng khoảng và đơn điệu.
 */
import { createCanvas } from "@napi-rs/canvas";
import { calcObliquity, localSiderealDegrees } from "../src/lib/astro.ts";
import { ASTEROIDS, asteroidHelioJ2000, computeAsteroidsSky, hgMagnitude, solveKepler } from "../src/lib/asteroids.ts";
import { STARS, precessFromJ2000, toHorizontal } from "../src/lib/sky.ts";
import {
  CAMERA_FOV,
  CAMERA_PITCH_LIMIT,
  EYE_HEIGHT_M,
  GROUND_RINGS_M,
  PROJECT_NEAR,
  SIDEREAL_DEG_PER_HOUR,
  altAzOf,
  angularSeparationDeg,
  applyMatrix3,
  centerCameraOn,
  clampCamera,
  clipPolyline,
  densifyPath,
  directionOf,
  dot3,
  groundAltitudeAt,
  groundDistanceFor,
  groundRingPath,
  length3,
  lookByPixels,
  makeCamera3D,
  poleAxis,
  projectPath,
  refractDirection,
  rotateAbout,
  rotateSkyByLst,
  scintillation,
  CAMERA_FOV,
  CAMERA_PITCH_DOWN_LIMIT,
  skyRotationMatrix,
  slerp3,
  splitPath,
  starTrailDegrees,
  visibleCapFraction,
  yawDelta,
  zoomCameraAtPoint,
  type AltAz,
  type Camera3D
} from "../src/lib/sky3d.ts";
import { buildSkyFrame, refractedAltitude, wrap180 } from "../src/lib/sky-visual.ts";
import { createSpriteCache } from "../src/lib/sky-render.ts";
import { SKY_3D_TOGGLES, drawSky3D, magnitudeLimitFor, planetPhase, skyColorAtAltitude, type Sky3DToggles } from "../src/lib/sky3d-render.ts";
import { skyTone } from "../src/lib/sky-visual.ts";

let checks = 0;
let failures = 0;
const seen = new Set<string>();

const fail = (group: string, message: string) => {
  failures += 1;
  const key = `${group}|${message}`;
  if (!seen.has(key)) {
    seen.add(key);
    console.log(`  ✘ [${group}] ${message}`);
  }
};
const ok = () => {
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

const WIDTH = 1024;
const HEIGHT = 576;

/* ------------------------------------------------- 1. vector ↔ (độ cao, phương vị) */
{
  for (let alt = -90; alt <= 90; alt += 5) {
    for (let az = 0; az < 360; az += 15) {
      const vector = directionOf(alt, az);
      if (!near(length3(vector), 1, 1e-12)) fail("vector", `(${alt}, ${az}) không phải vector đơn vị`);
      const back = altAzOf(vector);
      if (!near(back.alt, alt, 1e-9)) fail("vector", `khử hồi sai độ cao ở (${alt}, ${az}): ${back.alt}`);
      const expectedAz = alt === 90 || alt === -90 ? back.az : ((az % 360) + 360) % 360;
      if (!near(wrap180(back.az - expectedAz), 0, 1e-9)) fail("vector", `khứ hồi sai phương vị ở (${alt}, ${az}): ${back.az}`);
      ok();
    }
  }
  // Cực Bắc thiên cầu phải nằm ở độ cao = vĩ độ, phương vị Bắc.
  const pole = altAzOf(poleAxis(21.0285));
  if (!near(pole.alt, 21.0285, 1e-9) || !near(pole.az, 0, 1e-9)) fail("vector", "trục cực Bắc sai vị trí");
  ok();
}

/* --------------------------------------------------------- 2–3. phép chiếu camera */
const cameras: Camera3D[] = [
  { yaw: 0, pitch: 0, fov: 64 },
  { yaw: 137.5, pitch: 32, fov: 64 },
  { yaw: 270, pitch: -12, fov: 92 },
  { yaw: 45, pitch: 78, fov: 40 },
  { yaw: 180, pitch: CAMERA_PITCH_LIMIT, fov: CAMERA_FOV.min }
];

for (const camera of cameras) {
  const projector = makeCamera3D(camera, WIDTH, HEIGHT);

  // 2. Chân trời là đường thẳng.
  let horizonChecked = 0;
  for (let az = 0; az < 360; az += 1) {
    const point = projector.project(0, az);
    if (!point.visible) continue;
    if (!near(point.y, projector.horizonY, 1e-6)) {
      fail("chân trời", `${camera.yaw}/${camera.pitch}/${camera.fov}: alt=0 ở az=${az} lệch đường chân trời (${point.y} so với ${projector.horizonY})`);
      break;
    }
    horizonChecked += 1;
  }
  // Camera ngẩng cao (thiên đỉnh) thì đương nhiên không thấy chân trời — chỉ bắt buộc khi mép dưới khung chạm alt ≤ 0.
  const bottomAltitude = projector.inverse(WIDTH / 2, HEIGHT).alt;
  if (horizonChecked < 5 && bottomAltitude <= 0) {
    fail("chân trời", `${camera.yaw}/${camera.pitch}/${camera.fov}: mép dưới khung ở ${bottomAltitude.toFixed(1)}° mà không thấy điểm chân trời nào`);
  }
  ok();

  // Trục nhìn phải chiếu đúng tâm khung.
  const axis = projector.project(camera.pitch, camera.yaw);
  if (!axis.visible || !near(axis.x, WIDTH / 2, 1e-6) || !near(axis.y, HEIGHT / 2, 1e-6)) {
    fail("camera", "trục nhìn không nằm ở tâm khung");
  }
  ok();

  // 3. Nghịch đảo ↔ thuận.
  for (const x of [WIDTH * 0.12, WIDTH * 0.5, WIDTH * 0.88]) {
    for (const y of [HEIGHT * 0.15, HEIGHT * 0.5, HEIGHT * 0.9]) {
      const direction = projector.inverse(x, y);
      const back = projector.project(direction.alt, direction.az);
      if (!back.visible) {
        fail("nghịch đảo", `điểm (${x.toFixed(0)}, ${y.toFixed(0)}) chiếu lại không thấy được`);
        continue;
      }
      if (!near(back.x, x, 1e-6) || !near(back.y, y, 1e-6)) {
        fail("nghịch đảo", `(${x.toFixed(1)}, ${y.toFixed(1)}) → (${back.x.toFixed(4)}, ${back.y.toFixed(4)})`);
      }
      ok();
    }
  }

  // Điểm sau lưng camera không được coi là thấy được.
  const behind = projector.project(-camera.pitch, (camera.yaw + 180) % 360);
  if (behind.visible) fail("camera", "hướng sau lưng camera vẫn báo thấy được");
  ok();

  // 4. Zoom quanh một điểm phải giữ hướng dưới điểm đó.
  for (const point of [{ x: WIDTH * 0.28, y: HEIGHT * 0.35 }, { x: WIDTH * 0.74, y: HEIGHT * 0.66 }]) {
    const before = projector.inverse(point.x, point.y);
    for (const factor of [1.7, 3.4, 0.6, 0.3]) {
      const solved = clampCamera(zoomCameraAtPoint(camera, factor, point, WIDTH, HEIGHT));
      if (solved.fov === camera.fov) continue; // chạm trần/sàn thì bỏ qua tình huống này
      const next = makeCamera3D(solved, WIDTH, HEIGHT);
      const after = next.inverse(point.x, point.y);
      const separation = angularSeparationDeg(directionOf(before.alt, before.az), directionOf(after.alt, after.az));
      // Phóng to luôn có nghiệm kín; thu nhỏ có thể vô nghiệm (hướng quá cao so với độ lệch ngang
      // tối đa của camera không roll) → khi đó phải lùi về zoom quanh trục nhìn chứ không được lệch.
      const keptAxis = near(solved.yaw, camera.yaw, 1e-9) && near(solved.pitch, camera.pitch, 1e-9);
      if (separation > 1e-6 && !keptAxis) {
        fail("zoom quanh con trỏ 3D", `${camera.yaw}/${camera.pitch} × ${factor}: lệch ${separation.toExponential(2)}° mà cũng không giữ trục nhìn`);
      }
      ok();
      if (factor > 1 && separation > 1e-6) {
        fail("zoom quanh con trỏ 3D", `${camera.yaw}/${camera.pitch} × ${factor}: phóng to phải giữ đúng hướng dưới con trỏ (lệch ${separation.toExponential(2)}°)`);
      }
      ok();
    }
  }

  // Zoom ở đúng tâm khung thì không đổi hướng nhìn.
  const centered = zoomCameraAtPoint(camera, 1.5, { x: WIDTH / 2, y: HEIGHT / 2 }, WIDTH, HEIGHT);
  if (!near(centered.yaw, camera.yaw, 1e-9) || !near(centered.pitch, camera.pitch, 1e-9)) {
    fail("zoom quanh con trỏ 3D", "zoom ở tâm khung làm lệch hướng nhìn");
  }
  ok();

  // Giới hạn: pitch/fov không vượt trần, yaw luôn 0–360.
  const wild = clampCamera({ yaw: 725, pitch: 240, fov: 900 });
  if (wild.pitch > CAMERA_PITCH_LIMIT || wild.fov > CAMERA_FOV.max || wild.yaw < 0 || wild.yaw >= 360) {
    fail("giới hạn camera", `kẹp sai: ${JSON.stringify(wild)}`);
  }
  ok();
}

/* ------------------------------------------------------- 5–6. quay theo giờ sao */
const LAT = 21.0285;
const LON = 105.8542;
const base = new Date(Date.UTC(2026, 8, 15, 13, 30, 0));
for (const deltaMinutes of [0.5, 5, 45, 180]) {
  const later = new Date(base.getTime() + deltaMinutes * 60000);
  const frameBefore = buildSkyFrame(base, LAT, LON);
  const frameAfter = buildSkyFrame(later, LAT, LON);
  const deltaLst = wrap180(localSiderealDegrees(later, LON) - frameBefore.lstDeg);
  const expectedLst = (deltaMinutes / 60) * SIDEREAL_DEG_PER_HOUR;
  if (!near(deltaLst, expectedLst, 0.02)) {
    fail("giờ sao", `ΔLST ${deltaMinutes} phút = ${deltaLst.toFixed(4)}°, mong ≈ ${expectedLst.toFixed(4)}°`);
  }
  ok();

  const matrix = skyRotationMatrix(deltaLst, LAT);
  let worstStar = 0;
  for (let i = 0; i < frameBefore.stars.length; i += 7) {
    const before = frameBefore.stars[i];
    const rotated = applyMatrix3(matrix, directionOf(before.alt, before.az));
    const target = frameAfter.stars[i];
    const separation = angularSeparationDeg(rotated, directionOf(target.alt, target.az));
    if (separation > worstStar) worstStar = separation;
  }
  // Phép quay theo ΔLST là chính xác; phần lệch còn lại chỉ là tuế sai IAU1976 của khung dựng sau
  // (≈2,7e-8°/phút) — nhỏ hơn một điểm ảnh (~0,1°) tới hơn ba triệu lần.
  const allowance = 1e-7 + 3.2e-8 * deltaMinutes;
  if (worstStar > allowance) {
    fail("quay bầu trời", `Δ${deltaMinutes} phút: sao lệch ${worstStar.toExponential(2)}°, ngưỡng ${allowance.toExponential(2)}°`);
  }
  // Và phải nhỏ hơn hàng nghìn lần chính góc quay (nếu sai chiều quay, lệch sẽ gấp đôi ΔLST).
  if (worstStar > Math.abs(deltaLst) / 500) {
    fail("quay bầu trời", `Δ${deltaMinutes} phút: lệch ${worstStar.toExponential(2)}° quá lớn so với ΔLST ${deltaLst.toFixed(4)}° (nghi sai chiều quay)`);
  }
  ok();

  // Dạng "đọc được" (rotateSkyByLst) phải trùng dạng ma trận.
  const sample = frameBefore.stars[1234];
  const viaAngles = rotateSkyByLst({ alt: sample.alt, az: sample.az }, deltaLst, LAT);
  const viaMatrix = altAzOf(applyMatrix3(matrix, directionOf(sample.alt, sample.az)));
  if (angularSeparationDeg(directionOf(viaAngles.alt, viaAngles.az), directionOf(viaMatrix.alt, viaMatrix.az)) > 1e-9) {
    fail("quay bầu trời", "hai đường tính quay bầu trời không khớp nhau");
  }
  ok();

  // Mặt Trăng tự di chuyển nên KHÔNG khớp phép quay thuần — nhưng sai số phải nhỏ (≤ 0,55°/giờ).
  const moonBefore = frameBefore.planets.find((planet) => planet.key === "moon");
  const moonAfter = frameAfter.planets.find((planet) => planet.key === "moon");
  if (moonBefore && moonAfter) {
    const rotatedMoon = applyMatrix3(matrix, directionOf(moonBefore.alt, moonBefore.az));
    const separation = angularSeparationDeg(rotatedMoon, directionOf(moonAfter.alt, moonAfter.az));
    const allowance = 0.02 + 0.62 * (deltaMinutes / 60);
    if (separation > allowance) {
      fail("quay bầu trời", `Mặt Trăng lệch ${separation.toFixed(3)}° sau ${deltaMinutes} phút (ngưỡng ${allowance.toFixed(3)}°)`);
    }
    ok();
  }

  // Ma trận quay phải bảo toàn độ dài và góc (là một phép quay thật).
  const probe = directionOf(37, 214);
  const rotatedProbe = applyMatrix3(matrix, probe);
  if (!near(length3(rotatedProbe), 1, 1e-12)) fail("ma trận quay", "không bảo toàn độ dài");
  const probe2 = directionOf(-12, 88);
  const angleBefore = angularSeparationDeg(probe, probe2);
  const angleAfter = angularSeparationDeg(rotatedProbe, applyMatrix3(matrix, probe2));
  if (!near(angleBefore, angleAfter, 1e-9)) fail("ma trận quay", "không bảo toàn góc giữa hai hướng");
  ok();
}

// Cực Bắc thiên cầu phải đứng yên khi bầu trời quay.
{
  const matrix = skyRotationMatrix(37.5, 64.2);
  const pole = poleAxis(64.2);
  if (angularSeparationDeg(applyMatrix3(matrix, pole), pole) > 1e-9) fail("ma trận quay", "trục cực không đứng yên khi quay");
  ok();
  // Và một điểm trên xích đạo thiên cầu phải dịch đúng bằng ΔLST.
  const onEquator = directionOf(25.8, 190);
  const moved = altAzOf(applyMatrix3(matrix, onEquator));
  const direct = rotateSkyByLst({ alt: 25.8, az: 190 }, 37.5, 64.2);
  if (!near(moved.alt, direct.alt, 1e-9) || !near(moved.az, direct.az, 1e-9)) fail("ma trận quay", "hai cách quay cho kết quả khác nhau");
  ok();
}

/* ----------------------------------------------- 7. cung tròn lớn & làm dày đường */
{
  const a = directionOf(20, 30);
  const b = directionOf(45, 110);
  const separation = angularSeparationDeg(a, b);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const point = slerp3(a, b, t);
    if (!near(angularSeparationDeg(a, point), separation * t, 1e-9)) fail("cung tròn lớn", `slerp sai vị trí tại t = ${t}`);
    if (!near(length3(point), 1, 1e-12)) fail("cung tròn lớn", "slerp không cho vector đơn vị");
    ok();
  }
  // Hai hướng trùng nhau không được sinh NaN.
  const same = slerp3(a, a, 0.5);
  if (!Number.isFinite(same.x) || !Number.isFinite(same.z)) fail("cung tròn lớn", "slerp với hai điểm trùng sinh NaN");
  ok();

  const nanSeparated: Array<{ alt: number; az: number }> = [
    { alt: 10, az: 20 },
    { alt: 30, az: 40 },
    { alt: Number.NaN, az: Number.NaN },
    { alt: 50, az: 60 }
  ];
  const segments = splitPath(nanSeparated);
  if (segments.length !== 2 || segments[0].length !== 2 || segments[1].length !== 1) {
    fail("tách đường", `NaN không tách đúng dải: ${segments.length} dải`);
  }
  ok();

  const dense = densifyPath([{ alt: 0, az: 0 }, { alt: 0, az: 30 }], 2);
  if (dense.length !== 16) fail("làm dày đường", `30° với bước 2° phải cho 16 điểm, nhận ${dense.length}`);
  ok();
  for (const vector of dense) {
    if (!near(altAzOf(vector).alt, 0, 1e-9)) fail("làm dày đường", "điểm nội suy rời khỏi vòng tròn lớn");
    ok();
  }
}

/* ------------------------------------------------------------- 8. cắt tia theo camera */
{
  const projector = makeCamera3D({ yaw: 0, pitch: 0, fov: 64 }, WIDTH, HEIGHT);

  // Vòng chân trời: đúng một dải liền, mọi điểm nằm trên đường chân trời.
  const ring: AltAz[] = [];
  for (let step = 0; step <= 180; step += 1) ring.push({ alt: 0, az: 180 + step * 2 }); // 180° → 540° (=180°)
  const horizonPaths = clipPolyline(densifyPath(ring, 2), projector);
  if (horizonPaths.length !== 1) fail("cắt tia", `vòng chân trời cho ${horizonPaths.length} dải, mong 1`);
  else {
    for (const point of horizonPaths[0]) {
      if (!near(point.y, projector.horizonY, 1e-6) || !Number.isFinite(point.x)) {
        fail("cắt tia", `điểm chân trời sau khi cắt sai: (${point.x}, ${point.y})`);
        break;
      }
      ok();
    }
  }

  // Vòng tròn hoàn toàn sau lưng camera → không có dải nào.
  const behindRing: AltAz[] = [];
  for (let az = 120; az <= 240; az += 2) behindRing.push({ alt: 40, az });
  const behindPaths = clipPolyline(densifyPath(behindRing, 2), projector);
  if (behindPaths.length !== 0) fail("cắt tia", `dải sau lưng camera vẫn được vẽ (${behindPaths.length} dải)`);
  ok();

  // Mọi điểm trong dải đã cắt phải tương ứng hướng trước ống kính (depth > NEAR).
  const eclipticLike: AltAz[] = [];
  for (let i = 0; i <= 180; i += 1) eclipticLike.push({ alt: 30 * Math.sin((i / 180) * Math.PI * 2), az: i * 2 });
  const paths = projectPath(eclipticLike, projector, 1.5);
  if (paths.length === 0) fail("cắt tia", "đường hoàng đạo mẫu không cho dải nào");
  else ok();
  for (const path of paths) {
    for (const point of path) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e5 || Math.abs(point.y) > 1e5) {
        fail("cắt tia", `toạ độ sau cắt không hợp lệ: (${point.x}, ${point.y})`);
      }
      // Điểm đó phải ngược được về một hướng trước camera.
      const direction = projector.inverse(point.x, point.y);
      const depth = dot3(directionOf(direction.alt, direction.az), projector.forward);
      if (depth <= PROJECT_NEAR * 0.5) fail("cắt tia", "điểm sau cắt vẫn nằm sau mặt phẳng cắt");
      ok();
    }
  }

  // projectPath phải tự tách NaN (nét chòm sao).
  const constellation: Array<{ alt: number; az: number }> = [
    { alt: 12, az: 350 },
    { alt: 18, az: 8 },
    { alt: Number.NaN, az: Number.NaN },
    { alt: 25, az: 20 },
    { alt: 31, az: 33 }
  ];
  const constellationPaths = projectPath(constellation, projector, 2);
  if (constellationPaths.length < 2) fail("cắt tia", `nét chòm sao có NaN phải tách thành ≥2 dải, nhận ${constellationPaths.length}`);
  ok();
}

/* ------------------------------------------------------------------ 9. mặt đất 3D */
{
  const projector = makeCamera3D({ yaw: 180, pitch: 12, fov: 90 }, WIDTH, HEIGHT);
  let previousY = projector.horizonY;
  for (const distance of [...GROUND_RINGS_M].reverse()) {
    const altitude = groundAltitudeAt(distance);
    if (!(altitude < 0)) fail("mặt đất", `vòng ${distance} m phải có độ cao âm`);
    const roundTrip = groundDistanceFor(altitude);
    if (!near(roundTrip, distance, distance * 1e-9)) fail("mặt đất", `khứ hồi khoảng cách sai ở ${distance} m: ${roundTrip}`);
    ok();

    // Vòng khoảng cách phải chiếu thành dải nằm dưới đường chân trời.
    const ringPaths = projectPath(groundRingPath(distance, 3), projector, 2);
    if (ringPaths.length === 0) fail("mặt đất", `vòng ${distance} m không hiện lên khung`);
    else ok();
    const atSouth = projector.project(altitude, 180);
    if (!atSouth.visible) {
      fail("mặt đất", `hướng Nam của vòng ${distance} m không thấy được`);
      continue;
    }
    if (atSouth.y <= projector.horizonY) fail("mặt đất", `vòng ${distance} m nằm trên đường chân trời`);
    if (atSouth.y < previousY - 1e-9) fail("mặt đất", `vòng ${distance} m cao hơn vòng xa hơn (mất thứ tự phối cảnh)`);
    previousY = atSouth.y;
    ok();
  }
  // Càng xa càng sát đường chân trời.
  const far = projector.project(groundAltitudeAt(1e6), 180);
  if (!far.visible || Math.abs(far.y - projector.horizonY) > 1) {
    fail("mặt đất", "điểm cực xa không hội tụ về đường chân trời");
  }
  ok();
  if (!near(EYE_HEIGHT_M, 1.65, 1e-9)) fail("mặt đất", "chiều cao mắt đổi ngoài ý muốn");
  ok();
}

/* --------------------------------------------------- 10. nhấp nháy, vệt sao, khung */
{
  for (const alt of [-5, 0, 5, 25, 60, 90]) {
    for (const time of [0, 45, 90, 1234.5, 99999]) {
      const factor = scintillation(7, time, alt);
      if (!Number.isFinite(factor) || factor < 0.75 || factor > 1.25) {
        fail("nhấp nháy", `hệ số ngoài khoảng tại alt=${alt}, t=${time}: ${factor}`);
      }
      ok();
    }
  }
  // Tất định: cùng đầu vào cho cùng kết quả.
  if (scintillation(3, 500, 12) !== scintillation(3, 500, 12)) fail("nhấp nháy", "không tất định");
  ok();
  // Sao ở cao nhấp nháy yếu hơn sao sát chân trời.
  const spreadAt = (alt: number) => {
    let min = 2;
    let max = -2;
    for (let t = 0; t < 4000; t += 37) {
      const value = scintillation(11, t, alt);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min;
  };
  if (!(spreadAt(3) > spreadAt(80))) fail("nhấp nháy", "sao cao nhấp nháy mạnh hơn sao thấp — ngược vật lý");
  ok();

  // Vệt sao: tua 1 giờ mỗi khung hình → đúng 15,04°; có trần để không vẽ vòng tròn.
  if (!near(starTrailDegrees(3600), SIDEREAL_DEG_PER_HOUR, 1e-9)) fail("vệt sao", "sai hệ số giờ sao");
  ok();
  if (starTrailDegrees(1e7) > 40) fail("vệt sao", "vệt sao không được kẹp trần");
  ok();
  if (starTrailDegrees(0) !== 0) fail("vệt sao", "không tua thì không được có vệt");
  ok();

  // Phần thiên cầu trong khung: đơn điệu theo fov và nằm trong (0, 1).
  let previousFraction = -1;
  for (const fov of [CAMERA_FOV.min, 20, 45, 64, 90, CAMERA_FOV.max]) {
    const fraction = visibleCapFraction(fov);
    if (!(fraction > previousFraction)) fail("khung nhìn", `phần thiên cầu không đơn điệu tại fov=${fov}`);
    if (fraction <= 0 || fraction >= 1) fail("khung nhìn", `phần thiên cầu ngoài (0,1) tại fov=${fov}: ${fraction}`);
    previousFraction = fraction;
    ok();
  }
}

/* ------------------------------------------------------- 11. kéo chuột & khúc xạ */
{
  const camera: Camera3D = { yaw: 20, pitch: 10, fov: 64 };
  const moved = lookByPixels(camera, HEIGHT * 0.25, 0, HEIGHT); // kéo sang phải 1/4 chiều cao
  if (!near(moved.yaw, camera.yaw - 0.25 * camera.fov, 1e-9)) fail("kéo chuột", "kéo ngang không quay đúng số độ");
  ok();
  const movedVertical = lookByPixels(camera, 0, HEIGHT * 0.1, HEIGHT);
  if (!near(movedVertical.pitch, camera.pitch + 0.1 * camera.fov, 1e-9)) fail("kéo chuột", "kéo dọc không ngẩng đúng số độ");
  ok();
  // Kẹp pitch: không cho lật qua thiên đỉnh hoặc chui sâu dưới đất.
  const extreme = lookByPixels(camera, 0, HEIGHT * 40, HEIGHT);
  if (extreme.pitch > CAMERA_PITCH_LIMIT) fail("kéo chuột", "pitch vượt trần khi kéo lên");
  ok();

  // Đưa một hướng vào giữa khung.
  const centered = centerCameraOn(camera, { alt: 41.5, az: 275.25 });
  if (!near(centered.yaw, 275.25, 1e-9) || !near(centered.pitch, 41.5, 1e-9)) fail("căn giữa", "không đưa đúng hướng vào tâm");
  ok();

  // Khúc xạ: chỉ nâng vật thể thấp, và nâng đúng bằng hàm Bennett đã kiểm ở test:sky.
  const low = directionOf(0.5, 90);
  const bent = altAzOf(refractDirection(low, true));
  if (!near(bent.alt, refractedAltitude(0.5), 1e-9)) fail("khúc xạ 3D", "độ nâng khúc xạ sai");
  ok();
  const high = directionOf(60, 90);
  if (angularSeparationDeg(refractDirection(high, true), high) > 1e-9) fail("khúc xạ 3D", "vật thể cao không được dịch");
  ok();
  if (angularSeparationDeg(refractDirection(low, false), low) > 1e-12) fail("khúc xạ 3D", "tắt khúc xạ vẫn dịch hướng");
  ok();

  // rotateAbout: quay 90° quanh trục z phải đưa Đông → Bắc... (kiểm tra tính nhất quán nội bộ)
  const rotated = rotateAbout({ x: 0, y: 0, z: 1 }, directionOf(0, 90), Math.PI / 2);
  if (!near(altAzOf(rotated).az, 0, 1e-9)) fail("quay vector", "quay 90° quanh trục thiên đỉnh sai hướng");
  ok();

  // yawDelta quấn đúng.
  if (!near(yawDelta(350, 10), 20, 1e-9) || !near(yawDelta(10, 350), -20, 1e-9)) fail("phương vị", "yawDelta quấn sai");
  ok();

  // clamp vẫn hoạt động khi nhập rác.
  const junk = clampCamera({ yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY, fov: -5 });
  if (Number.isNaN(junk.yaw) || junk.fov < CAMERA_FOV.min) fail("giới hạn camera", "không xử lý được đầu vào rác");
  ok();
}

/* ------------------------------------------------------- 12. vẽ thật trên canvas */
{
  const WIDTH = 640;
  const HEIGHT = 360;
  const makeSpriteFactory = () => (width: number, height: number) => createCanvas(width, height);

  const render = (options: {
    iso: string;
    camera: Camera3D;
    trailDegrees?: number;
    timeMs?: number;
    toggles?: Partial<Sky3DToggles>;
    selected?: Parameters<typeof drawSky3D>[0]["selected"];
    lat?: number;
  }) => {
    const latitude = options.lat ?? 21.0285;
    const frame = buildSkyFrame(new Date(options.iso), latitude, 105.8542);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const started = Date.now();
    const result = drawSky3D({
      ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      width: WIDTH,
      height: HEIGHT,
      camera: options.camera,
      frame,
      rotation: skyRotationMatrix(0, latitude),
      latitude,
      toggles: { ...SKY_3D_TOGGLES, ...options.toggles },
      selected: options.selected ?? null,
      sprites: createSpriteCache(),
      spriteFactory: makeSpriteFactory(),
      timeMs: options.timeMs ?? 0,
      trailDegrees: options.trailDegrees ?? 0
    });
    return { canvas, result, ms: Date.now() - started, frame };
  };

  const luminance = (canvas: ReturnType<typeof createCanvas>, x: number, y: number, w: number, h: number) => {
    const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return total / (data.length / 4);
  };

  const night = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 } });
  if (night.result.drawnStars < 80) fail("vẽ 3D", `đêm phải vẽ nhiều sao, nhận ${night.result.drawnStars}`);
  ok();
  if (night.result.hits.length < 20) fail("vẽ 3D", `đêm phải có vật thể bấm được, nhận ${night.result.hits.length}`);
  ok();
  for (const hit of night.result.hits) {
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.radius)) {
      fail("vẽ 3D", `vật thể ${hit.kind}:${hit.key} có toạ độ không hữu hạn`);
    }
  }
  ok();
  const keys = night.result.hits.map((hit) => `${hit.kind}:${hit.key}`);
  if (new Set(keys).size !== keys.length) fail("vẽ 3D", "trùng khoá trong danh sách bắt sự kiện");
  ok();

  // Ban ngày: sao gần như biến mất (giới hạn cấp sao trừ hình phạt Mặt Trời).
  const day = render({ iso: "1996-11-11T05:00:00Z", camera: { yaw: 180, pitch: 12, fov: 64 } });
  if (day.result.drawnStars > 8) fail("vẽ 3D", `ban ngày không được thấy nhiều sao, nhận ${day.result.drawnStars}`);
  ok();
  if (luminance(day.canvas, 0, 40, WIDTH, 60) < luminance(night.canvas, 0, 40, WIDTH, 60)) {
    fail("vẽ 3D", "trời ban ngày phải sáng hơn ban đêm");
  }
  ok();

  // Mặt đất tối hơn trời: so dải trên và dưới đường chân trời.
  const horizonY = Math.round(makeCamera3D({ yaw: 180, pitch: 12, fov: 64 }, WIDTH, HEIGHT).horizonY);
  if (horizonY > 40 && horizonY < HEIGHT - 60) {
    const skyBand = luminance(night.canvas, 0, horizonY - 50, WIDTH, 30);
    const groundBand = luminance(night.canvas, 0, horizonY + 25, WIDTH, 30);
    if (groundBand >= skyBand) fail("vẽ 3D", `mặt đất (${groundBand.toFixed(1)}) phải tối hơn trời (${skyBand.toFixed(1)})`);
    ok();
    // Đường chân trời là một vạch sáng thẳng nằm ngang.
    const lineBand = luminance(night.canvas, 0, horizonY - 1, WIDTH, 3);
    if (lineBand <= groundBand) fail("vẽ 3D", "không thấy vạch chân trời sáng ngang");
    ok();
  } else {
    fail("vẽ 3D", `horizonY=${horizonY} ngoài khoảng mong đợi`);
  }

  // Tất định: hai lần vẽ giống hệt nhau cho cùng đầu vào.
  const again = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 } });
  if (Buffer.compare(night.canvas.toBuffer("image/png"), again.canvas.toBuffer("image/png")) !== 0) {
    fail("vẽ 3D", "cùng đầu vào mà ảnh khác nhau (không tất định)");
  }
  ok();

  // Nhấp nháy: đổi mốc thời gian thì ảnh đổi (hiệu ứng chạy), nhưng không đổi khi tắt.
  const twinkleA = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, timeMs: 0 });
  const twinkleB = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, timeMs: 4321 });
  if (Buffer.compare(twinkleA.canvas.toBuffer("image/png"), twinkleB.canvas.toBuffer("image/png")) === 0) {
    fail("vẽ 3D", "bật nhấp nháy mà ảnh không đổi theo thời gian");
  }
  ok();
  const stillA = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, timeMs: 0, toggles: { twinkle: false } });
  const stillB = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, timeMs: 4321, toggles: { twinkle: false } });
  if (Buffer.compare(stillA.canvas.toBuffer("image/png"), stillB.canvas.toBuffer("image/png")) !== 0) {
    fail("vẽ 3D", "tắt nhấp nháy mà ảnh vẫn đổi theo thời gian");
  }
  ok();

  // Vệt sao khi tua: ảnh khác bản không vệt và không được mất sao.
  const trails = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 0, pitch: 55, fov: 70 }, trailDegrees: 24 });
  const noTrails = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 0, pitch: 55, fov: 70 }, trailDegrees: 0 });
  if (Buffer.compare(trails.canvas.toBuffer("image/png"), noTrails.canvas.toBuffer("image/png")) === 0) {
    fail("vẽ 3D", "vệt sao không làm ảnh thay đổi");
  }
  ok();
  if (trails.result.drawnStars < noTrails.result.drawnStars) fail("vẽ 3D", "vệt sao làm mất sao");
  ok();

  // Các góc nhìn biên: ngẩng sát thiên đỉnh, cúi xuống đất, fov min/max, nam bán cầu.
  for (const camera of [
    { yaw: 30, pitch: CAMERA_PITCH_LIMIT, fov: CAMERA_FOV.min },
    { yaw: 30, pitch: CAMERA_PITCH_LIMIT, fov: CAMERA_FOV.max },
    { yaw: 210, pitch: CAMERA_PITCH_DOWN_LIMIT, fov: CAMERA_FOV.max },
    { yaw: 90, pitch: 0, fov: 24 }
  ]) {
    const shot = render({ iso: "1996-11-10T17:30:00Z", camera });
    for (const hit of shot.result.hits) {
      if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) fail("vẽ 3D", `camera ${camera.yaw}/${camera.pitch}/${camera.fov}: toạ độ rác`);
    }
    ok();
  }
  const south = render({ iso: "2026-09-16T14:00:00Z", camera: { yaw: 0, pitch: 20, fov: 70 }, lat: -33.87 });
  if (south.result.drawnStars < 40) fail("vẽ 3D", `nam bán cầu vẽ quá ít sao: ${south.result.drawnStars}`);
  ok();

  // Tắt khí quyển/mặt đất vẫn vẽ được và sao sáng hơn (không còn hấp thụ).
  const raw = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 }, toggles: { atmosphere: false, ground: false } });
  if (raw.result.drawnStars < night.result.drawnStars) fail("vẽ 3D", "tắt khí quyển phải thấy nhiều sao hơn chứ không ít đi");
  ok();

  // Vòng ngắm vật thể chọn vẽ thêm mà không nổ.
  const starHit = night.result.hits.find((hit) => hit.kind === "star");
  if (starHit) {
    const withSelection = render({
      iso: "1996-11-10T17:30:00Z",
      camera: { yaw: 180, pitch: 12, fov: 64 },
      selected: { kind: "star", key: starHit.key }
    });
    if (Buffer.compare(withSelection.canvas.toBuffer("image/png"), night.canvas.toBuffer("image/png")) === 0) {
      fail("vẽ 3D", "chọn vật thể mà ảnh không đổi (vòng ngắm không vẽ)");
    }
    ok();
  } else {
    fail("vẽ 3D", "không tìm thấy sao nào để thử vòng ngắm");
  }

  // Màu trời đơn điệu theo độ cao và khớp tông màu của bản 2D ở hai đầu.
  const tone = skyTone(-40);
  const low = skyColorAtAltitude(tone, 1);
  const high = skyColorAtAltitude(tone, 60);
  if (low[0] + low[1] + low[2] <= high[0] + high[1] + high[2]) fail("màu trời 3D", "chân trời đêm phải sáng hơn thiên đỉnh");
  ok();
  const dayTone = skyTone(35);
  const dayLow = skyColorAtAltitude(dayTone, 1);
  const dayHigh = skyColorAtAltitude(dayTone, 60);
  if (dayLow[2] <= dayHigh[2]) fail("màu trời 3D", "trời ngày phải xanh đậm dần lên thiên đỉnh");
  ok();

  // Giới hạn cấp sao: đơn điệu theo độ phóng và không vượt đáy danh mục (6,1).
  let previous = Number.NEGATIVE_INFINITY;
  for (const fov of [110, 64, 30, 12, 5]) {
    const limit = magnitudeLimitFor(fov, -40, true);
    if (limit < previous) fail("giới hạn cấp sao", `fov ${fov}: giới hạn giảm khi phóng to`);
    if (limit > 6.1) fail("giới hạn cấp sao", `fov ${fov}: vượt đáy danh mục ${limit}`);
    previous = limit;
    ok();
  }

  // Tắt khí quyển: địa hình vẫn phải đọc được (không hoá "mặt phẳng trống") — sống núi sáng hơn trời phía trên.
  const noAtmo = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 8, fov: 70 }, toggles: { atmosphere: false } });
  const noAtmoHorizon = Math.round(makeCamera3D({ yaw: 180, pitch: 8, fov: 70 }, WIDTH, HEIGHT).horizonY);
  if (noAtmoHorizon > 60 && noAtmoHorizon < HEIGHT - 40) {
    const ridgeBand = luminance(noAtmo.canvas, 0, noAtmoHorizon - 24, WIDTH, 16);
    const skyBand = luminance(noAtmo.canvas, 0, noAtmoHorizon - 90, WIDTH, 20);
    if (ridgeBand <= skyBand + 2) {
      fail("vẽ 3D", `tắt khí quyển mà núi không tách khỏi trời (núi ${ridgeBand.toFixed(1)} vs trời ${skyBand.toFixed(1)})`);
    }
    ok();
    const groundBand = luminance(noAtmo.canvas, 0, noAtmoHorizon + 30, WIDTH, 20);
    if (groundBand <= skyBand) fail("vẽ 3D", "tắt khí quyển mà mặt đất tối hơn cả trời (không đọc được mặt phẳng đất)");
    ok();
  } else {
    fail("vẽ 3D", `horizonY=${noAtmoHorizon} ngoài khoảng mong đợi cho kiểm tra không khí quyển`);
  }

  // Hành tinh "sống động": đĩa có chi tiết chiếm vùng ảnh đáng kể và Sao Mộc ám màu gỉ sắt.
  // Hướng camera vào từng hành tinh (như nháy đúp trong app) rồi mới kiểm tra đĩa và màu.
  const planetsFrame = buildSkyFrame(new Date("2026-01-15T13:00:00Z"), 21.0285, 105.8542);
  const jupiter = planetsFrame.planets.find((planet) => planet.key === "jupiter");
  const saturn = planetsFrame.planets.find((planet) => planet.key === "saturn");
  if (!jupiter || !saturn) fail("hành tinh 3D", "khung thiếu Sao Mộc/Sao Thổ");
  ok();
  const jupCam = centerCameraOn({ yaw: 80, pitch: 30, fov: 16 }, { alt: jupiter.alt, az: jupiter.az });
  const satCam = centerCameraOn({ yaw: 250, pitch: 30, fov: 16 }, { alt: saturn.alt, az: saturn.az });
  const withJupiter = render({ iso: "2026-01-15T13:00:00Z", camera: jupCam });
  const withoutJupiter = render({ iso: "2026-01-15T13:00:00Z", camera: jupCam, toggles: { planets: false } });
  const withSaturn = render({ iso: "2026-01-15T13:00:00Z", camera: satCam });

  const dataWith = withJupiter.canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
  const dataWithout = withoutJupiter.canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
  let changed = 0;
  for (let i = 0; i < dataWith.length; i += 4) {
    if (Math.abs(dataWith[i] - dataWithout[i]) + Math.abs(dataWith[i + 1] - dataWithout[i + 1]) + Math.abs(dataWith[i + 2] - dataWithout[i + 2]) > 24) changed += 1;
  }
  if (changed < 400) fail("hành tinh 3D", `đĩa hành tinh chỉ phủ ${changed} điểm ảnh — quá nhỏ để "sống động"`);
  ok();

  const jupiterHit = withJupiter.result.hits.find((hit) => hit.kind === "planet" && hit.key === "jupiter");
  if (!jupiterHit) fail("hành tinh 3D", "không thấy Sao Mộc trong khung để kiểm tra màu");
  else {
    const px = withJupiter.canvas
      .getContext("2d")
      .getImageData(Math.round(jupiterHit.x) - 7, Math.round(jupiterHit.y) - 7, 15, 15).data;
    let best = -1;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = px[i] + px[i + 1] + px[i + 2];
      if (lum > best) {
        best = lum;
        r = px[i];
        g = px[i + 1];
        b = px[i + 2];
      }
    }
    if (!(r > b + 20 && r > 90)) fail("hành tinh 3D", `đĩa Sao Mộc không ám màu gỉ sắt sáng (rgb=${r},${g},${b})`);
    ok();
  }

  const saturnHit = withSaturn.result.hits.find((hit) => hit.kind === "planet" && hit.key === "saturn");
  if (saturnHit) {
    // Vành đai: điểm cách tâm ~27 px phải sáng hơn nền trời quanh nó.
    const ring = luminance(withSaturn.canvas, Math.round(saturnHit.x) + 24, Math.round(saturnHit.y) - 10, 6, 6);
    const space = luminance(withSaturn.canvas, Math.round(saturnHit.x) + 60, Math.round(saturnHit.y) - 40, 6, 6);
    if (ring <= space + 6) fail("hành tinh 3D", `không thấy vành đai Sao Thổ (vành ${ring.toFixed(1)} vs nền ${space.toFixed(1)})`);
    ok();
  } else {
    fail("hành tinh 3D", "không thấy Sao Thổ trong khung để kiểm tra vành đai");
  }

  // Pha hành tinh: góc pha từ tam giác khoảng cách thật — hành tinh ngoài gần tròn đầy,
  // Sao Kim gần hạ giao điểm phải khuyết rõ (điều mà công thức "pha = ly giác" cũ làm sai).
  const saturnPhase = planetPhase("saturn", 60, { sunToPlanetAu: 9.537, earthToPlanetAu: 10.0, earthToSunAu: 1 });
  if (saturnPhase.illumination < 0.98) fail("pha hành tinh", `Sao Thổ phải gần tròn đầy, nhận ${saturnPhase.illumination.toFixed(3)}`);
  ok();
  const venusCrescent = planetPhase("venus", 40, { sunToPlanetAu: 0.727, earthToPlanetAu: 0.362, earthToSunAu: 1 });
  if (venusCrescent.illumination > 0.3) fail("pha hành tinh", `Sao Kim cận Trái Đất phải khuyết, nhận ${venusCrescent.illumination.toFixed(3)}`);
  ok();
  const venusFull = planetPhase("venus", 10, { sunToPlanetAu: 0.727, earthToPlanetAu: 1.7, earthToSunAu: 1 });
  if (venusFull.illumination < 0.9) fail("pha hành tinh", `Sao Kim phía sau Mặt Trời phải gần đầy, nhận ${venusFull.illumination.toFixed(3)}`);
  ok();
  for (const phase of [saturnPhase, venusCrescent, venusFull]) {
    if (Math.abs(phase.illumination - (1 + phase.cosPhase) / 2) > 1e-12) fail("pha hành tinh", "illumination không khớp cosPhase");
    if (Math.abs(phase.terminatorRatio - Math.abs(phase.cosPhase)) > 1e-12) fail("pha hành tinh", "terminatorRatio không khớp cosPhase");
  }
  ok();

  // Lưới xích đạo: bật/tắt phải đổi ảnh và không sinh toạ độ rác.
  const eqOn = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 30, fov: 70 } });
  const eqOff = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 30, fov: 70 }, toggles: { equatorial: false } });
  if (Buffer.compare(eqOn.canvas.toBuffer("image/png"), eqOff.canvas.toBuffer("image/png")) === 0) {
    fail("lưới xích đạo 3D", "bật/tắt lưới xích đạo mà ảnh không đổi");
  }
  ok();
  for (const hit of eqOn.result.hits) {
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) fail("lưới xích đạo 3D", "toạ độ vật thể không hữu hạn khi bật lưới");
  }
  ok();

  // Hiệu năng: một khung hình trong Node phải dưới 1,5 giây (trình duyệt còn nhanh hơn nhiều).
  const warm = render({ iso: "1996-11-10T17:30:00Z", camera: { yaw: 180, pitch: 12, fov: 64 } });
  if (warm.ms > 1500) fail("hiệu năng 3D", `một khung hình mất ${warm.ms} ms`);
  ok();
  console.log(`   (khung 640×360 trong Node: ${warm.ms} ms · ${warm.result.drawnStars} sao)`);
}

/* ------------------------------------------------ 13. tiểu hành tinh: quỹ đạo & ephemeris */
{
  // Phương trình Kepler: E − e·sin E = M phải đúng với mọi tiểu hành tinh và mọi pha quỹ đạo.
  for (const elements of ASTEROIDS) {
    for (const M of [0.7, 47, 123.4, 179.2, 269, 359.3]) {
      const E = solveKepler(M, elements.e);
      const residual = Math.abs(wrap180(M - ((E / Math.PI) * 180 - elements.e * Math.sin(E) * (180 / Math.PI))));
      if (residual > 1e-9) fail("kepler", `${elements.name}: sai số phương trình Kepler ${residual.toExponential(2)}° tại M=${M}`);
      ok();
    }
    // Bán kính nhật tâm luôn nằm trong [a(1−e), a(1+e)] trên quãng ±30 năm quanh epoch.
    for (let days = -11000; days <= 11000; days += 811) {
      const vector = asteroidHelioJ2000(elements, elements.epochJd + days);
      const r = Math.hypot(vector.x, vector.y, vector.z);
      if (r < elements.a * (1 - elements.e) - 1e-9 || r > elements.a * (1 + elements.e) + 1e-9) {
        fail("kepler", `${elements.name}: bán kính ${r.toFixed(4)} AU ngoài giới hạn quỹ đạo tại +${days} ngày`);
      }
      ok();
    }
  }

  // Cấp sao H/G: ở đúng định nghĩa (r = Δ = 1 AU, pha 0°) phải trả về H.
  for (const elements of ASTEROIDS) {
    if (!near(hgMagnitude(elements.H, elements.G, 1, 1, 0), elements.H, 1e-9)) {
      fail("cấp sao H/G", `${elements.name}: V(1,1,0°) ≠ H`);
    }
    ok();
    // Xa hơn thì phải mờ đi.
    if (!(hgMagnitude(elements.H, elements.G, 2, 2, 0) > elements.H)) fail("cấp sao H/G", `${elements.name}: xa hơn mà không mờ đi`);
    ok();
  }

  // Đối chiếu ephemeris công bố (theskylive.com & ephemeris hoàng đạo, truy vấn 2026-09-16):
  const date = new Date("2026-09-16T12:00:00Z");
  const lstDeg = localSiderealDegrees(date, 105.8542);
  const obliquity = calcObliquity(date);
  const sky = computeAsteroidsSky(date, lstDeg, 21.0285, obliquity);
  if (sky.length !== ASTEROIDS.length) fail("tiểu hành tinh", `khung thiếu tiểu hành tinh (${sky.length}/${ASTEROIDS.length})`);
  ok();
  for (const asteroid of sky) {
    if (![asteroid.alt, asteroid.az, asteroid.ra, asteroid.dec, asteroid.magnitude, asteroid.distanceAu].every(Number.isFinite)) {
      fail("tiểu hành tinh", `${asteroid.name}: toạ độ không hữu hạn`);
    }
    ok();
  }

  const ceres = sky.find((item) => item.key === "ceres");
  const vesta = sky.find((item) => item.key === "vesta");
  const pallas = sky.find((item) => item.key === "pallas");
  if (!ceres || !vesta || !pallas) fail("tiểu hành tinh", "thiếu Ceres/Vesta/Pallas trong khung");
  ok();

  // Ceres ở cung Cự Giải (kinh độ hoàng đạo 90–120°) suốt 2026-08-12 → 2027-05 theo lịch thiên văn.
  if (!(ceres.lon > 90 && ceres.lon < 120)) {
    fail("tiểu hành tinh", `Ceres phải đang ở Cự Giải (90–120°), nhận ${ceres.lon.toFixed(2)}°`);
  }
  ok();
  // Vesta (so với công bố 2026-09-11: RA 01h55m, Dec −00°, Δ 1,58 AU, mag 6,8 — Vesta trôi ~0,15°/ngày).
  if (!(vesta.ra > 27.2 && vesta.ra < 29.4)) fail("tiểu hành tinh", `Vesta RA ngoài khoảng ephemeris: ${vesta.ra.toFixed(2)}°`);
  if (!(vesta.dec > -1.2 && vesta.dec < 0.4)) fail("tiểu hành tinh", `Vesta Dec ngoài khoảng ephemeris: ${vesta.dec.toFixed(2)}°`);
  if (!(vesta.distanceAu > 1.45 && vesta.distanceAu < 1.65)) fail("tiểu hành tinh", `Vesta Δ ngoài khoảng ephemeris: ${vesta.distanceAu.toFixed(3)} AU`);
  if (!(vesta.magnitude > 6.2 && vesta.magnitude < 7.3)) fail("tiểu hành tinh", `Vesta mag ngoài khoảng ephemeris: ${vesta.magnitude.toFixed(2)}`);
  ok();
  // Pallas (so với công bố 2026-09-03: RA 01h40m, Dec −4°58′, Δ 2,054 AU, mag 8,8).
  if (!(pallas.ra > 23 && pallas.ra < 25.4)) fail("tiểu hành tinh", `Pallas RA ngoài khoảng ephemeris: ${pallas.ra.toFixed(2)}°`);
  if (!(pallas.dec > -9.6 && pallas.dec < -4)) fail("tiểu hành tinh", `Pallas Dec ngoài khoảng ephemeris: ${pallas.dec.toFixed(2)}°`);
  if (!(pallas.distanceAu > 1.85 && pallas.distanceAu < 2.1)) fail("tiểu hành tinh", `Pallas Δ ngoài khoảng ephemeris: ${pallas.distanceAu.toFixed(3)} AU`);
  if (!(pallas.magnitude > 8.2 && pallas.magnitude < 9.2)) fail("tiểu hành tinh", `Pallas mag ngoài khoảng ephemeris: ${pallas.magnitude.toFixed(2)}`);
  ok();

  // Bán kính góc thật: Ceres ~0,2–0,9″ tuỳ khoảng cách — luôn là một góc dương rất nhỏ.
  if (!(ceres.angularRadiusDeg > 0 && ceres.angularRadiusDeg < 0.001)) {
    fail("tiểu hành tinh", `bán kính góc Ceres bất thường: ${ceres.angularRadiusDeg}`);
  }
  ok();
}

/* ------------------------------------ 14. tiểu hành tinh trong khung 3D khi phóng to */
{
  const WIDTH = 640;
  const HEIGHT = 360;
  const latitude = 21.0285;
  const renderRocks = (options: { iso: string; camera: Camera3D; toggles?: Partial<Sky3DToggles> }) => {
    const frame = buildSkyFrame(new Date(options.iso), latitude, 105.8542);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const result = drawSky3D({
      ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      width: WIDTH,
      height: HEIGHT,
      camera: options.camera,
      frame,
      rotation: skyRotationMatrix(0, latitude),
      latitude,
      toggles: { ...SKY_3D_TOGGLES, ...options.toggles },
      selected: null,
      sprites: createSpriteCache(),
      spriteFactory: (spriteWidth, spriteHeight) => createCanvas(spriteWidth, spriteHeight),
      timeMs: 0,
      trailDegrees: 0
    });
    return { canvas, result, frame };
  };

  // Đêm 16/09/2026 (12:30 UTC ≈ 19:30 giờ Hà Nội): Juno cao ~50°, trời đã tối.
  const iso = "2026-09-16T12:30:00Z";
  const frame = buildSkyFrame(new Date(iso), latitude, 105.8542);
  const juno = frame.asteroids.find((asteroid) => asteroid.key === "juno");
  if (!juno || juno.alt < 20) fail("tiểu hành tinh 3D", `Juno không đủ cao để kiểm tra (alt=${juno?.alt.toFixed(1)}°)`);
  ok();

  const zoomedIn = renderRocks({ iso, camera: centerCameraOn({ yaw: 0, pitch: 20, fov: 12 }, { alt: juno.alt, az: juno.az }) });
  const junoHit = zoomedIn.result.hits.find((hit) => hit.kind === "asteroid" && hit.key === "juno");
  if (!junoHit) fail("tiểu hành tinh 3D", "phóng to mà không thấy Juno để bấm chọn");
  ok();
  if (junoHit && (!Number.isFinite(junoHit.x) || !Number.isFinite(junoHit.y))) fail("tiểu hành tinh 3D", "toạ độ Juno không hữu hạn");
  ok();

  // Nhãn & đĩa tiểu hành tinh chỉ vẽ khi bật lớp: tắt đi phải đổi ảnh.
  const withoutRocks = renderRocks({
    iso,
    camera: centerCameraOn({ yaw: 0, pitch: 20, fov: 12 }, { alt: juno.alt, az: juno.az }),
    toggles: { asteroids: false }
  });
  if (Buffer.compare(zoomedIn.canvas.toBuffer("image/png"), withoutRocks.canvas.toBuffer("image/png")) === 0) {
    fail("tiểu hành tinh 3D", "bật/tắt lớp tiểu hành tinh mà ảnh không đổi");
  }
  ok();

  // Đĩa Juno ở độ phóng sâu phải phủ một vùng điểm ảnh đáng kể (không còn là chấm vô danh).
  const withData = zoomedIn.canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
  const withoutData = withoutRocks.canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
  let changed = 0;
  for (let i = 0; i < withData.length; i += 4) {
    if (Math.abs(withData[i] - withoutData[i]) + Math.abs(withData[i + 1] - withoutData[i + 1]) + Math.abs(withData[i + 2] - withoutData[i + 2]) > 24) changed += 1;
  }
  if (changed < 60) fail("tiểu hành tinh 3D", `tiểu hành tinh phóng to chỉ phủ ${changed} điểm ảnh`);
  ok();

  // Toàn cảnh (fov 64) không được vỡ: vẫn vẽ được và mọi hit hữu hạn.
  const wide = renderRocks({ iso, camera: { yaw: juno.az, pitch: 30, fov: 64 } });
  for (const hit of wide.result.hits) {
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) fail("tiểu hành tinh 3D", "toàn cảnh có hit rác");
  }
  ok();
}

/* ------------------------------------------------ 15. lỗ hổng thiên đỉnh ban ngày */
{
  const WIDTH = 640;
  const HEIGHT = 360;
  const latitude = 21.0285;
  // Trời trưa (Mặt Trời ~51° cao, cách thiên đỉnh ~39°): vùng thiên đỉnh chỉ thuần dải màu trời.
  const iso = "1996-11-11T05:00:00Z";
  const frame = buildSkyFrame(new Date(iso), latitude, 105.8542);

  const zenithPixel = (fov: number) => {
    const camera: Camera3D = { yaw: 180, pitch: CAMERA_PITCH_LIMIT, fov };
    const canvas = createCanvas(WIDTH, HEIGHT);
    drawSky3D({
      ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      width: WIDTH,
      height: HEIGHT,
      camera,
      frame,
      rotation: skyRotationMatrix(0, latitude),
      latitude,
      toggles: { ...SKY_3D_TOGGLES, grid: false, equatorial: false, milkyWay: false, lines: false, constellationNames: false },
      selected: null,
      sprites: createSpriteCache(),
      spriteFactory: (spriteWidth, spriteHeight) => createCanvas(spriteWidth, spriteHeight),
      timeMs: 0,
      trailDegrees: 0
    });
    const projector = makeCamera3D(camera, WIDTH, HEIGHT);
    const zenith = projector.projectVector(directionOf(90, 0));
    const data = canvas.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * WIDTH + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    return { zenithPx: at(zenith.x, zenith.y), neighbourPx: at(zenith.x, zenith.y + 12) };
  };

  // Thiên đỉnh phải cùng màu với bầu trời ngay cạnh nó — nếu có "lỗ hổng" màu nền (xám-xanh)
  // thì pixel thiên đỉnh sẽ lệch hàng chục đơn vị so với lân cận.
  for (const fov of [64, 20, 8]) {
    const { zenithPx, neighbourPx } = zenithPixel(fov);
    for (let channel = 0; channel < 3; channel += 1) {
      if (Math.abs(zenithPx[channel] - neighbourPx[channel]) > 20) {
        fail("lỗ hổng thiên đỉnh", `fov ${fov}°: pixel thiên đỉnh rgb(${zenithPx}) lệch nền trời rgb(${neighbourPx})`);
        break;
      }
    }
    ok();
  }
}

/* -------------------------------------- 16. vị trí chòm sao khi đi qua bầu trời */
{
  const latitude = 21.0285;
  const date = new Date("2026-09-16T12:00:00Z");

  // Đi qua kinh tuyến: đặt giờ sao = xích kinh của sao thì sao phải đứng đúng Nam/Bắc
  // với độ cao 90 − |vĩ độ − xích vĩ| — tính chất hình học độc lập để kiểm chứng chuỗi
  // tiến động J2000 → "của ngày" → toạ độ chân trời.
  for (const name of ["Sirius", "Vega", "Betelgeuse", "Rigel", "Antares", "Altair", "Spica", "Fomalhaut"]) {
    const star = STARS.find((item) => item.alternatives[0] === name);
    if (!star) {
      fail("vị trí chòm sao", `thiếu sao ${name} trong danh mục để kiểm chứng`);
      continue;
    }
    const ofDate = precessFromJ2000(star.ra, star.dec, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, ofDate.ra, latitude);
    const expectedAlt = 90 - Math.abs(latitude - ofDate.dec);
    const expectedAz = ofDate.dec > latitude ? 0 : 180;
    if (!near(horizontal.alt, expectedAlt, 1e-6)) {
      fail("vị trí chòm sao", `${name} qua kinh tuyến ở độ cao ${horizontal.alt.toFixed(3)}° thay vì ${expectedAlt.toFixed(3)}°`);
    }
    if (!near(wrap180(horizontal.az - expectedAz), 0, 1e-6)) {
      fail("vị trí chòm sao", `${name} qua kinh tuyến ở phương vị ${horizontal.az.toFixed(3)}° thay vì ${expectedAz}°`);
    }
    ok();
  }

  // Sao Bắc Cực luôn cách thiên cực đúng ~1°: độ cao phải bám vĩ độ trong ±1,5° suốt ngày đêm.
  const polaris = STARS.find((item) => item.alternatives[0] === "Polaris");
  if (!polaris) fail("vị trí chòm sao", "thiếu Polaris trong danh mục");
  else {
    for (const hour of [0, 6, 12, 18]) {
      const frame = buildSkyFrame(new Date(Date.UTC(2026, 8, 16, hour)), latitude, 105.8542);
      const spun = frame.stars.find((star) => star.index === polaris.index);
      if (!spun || Math.abs(spun.alt - latitude) > 1.5) {
        fail("vị trí chòm sao", `Polaris lúc ${hour}h có độ cao ${spun?.alt.toFixed(2)}° — không bám vĩ độ ${latitude}°`);
      }
      if (spun && !(spun.az < 12 || spun.az > 348)) {
        fail("vị trí chòm sao", `Polaris lúc ${hour}h lệch khỏi phương Bắc (az=${spun.az.toFixed(1)}°)`);
      }
      ok();
    }
  }

  // Đủ 88 chòm: mỗi chòm có cả đường nối lẫn nhãn, và đường nối có ít nhất 2 điểm hữu hạn.
  const frame = buildSkyFrame(date, latitude, 105.8542);
  if (frame.lines.length !== 88) fail("chòm sao", `thiếu đường nối chòm sao: ${frame.lines.length}/88`);
  if (frame.constellationLabels.length !== 88) fail("chòm sao", `thiếu nhãn chòm sao: ${frame.constellationLabels.length}/88`);
  ok();
  for (const line of frame.lines) {
    const finite = line.points.filter((point) => Number.isFinite(point.alt));
    if (finite.length < 2) fail("chòm sao", `chòm ${line.abbr} không đủ điểm vẽ đường nối`);
    ok();
  }

  // Tua thời gian 6 giờ: cả đường nối chòm sao phải quay đúng như sao (cùng ma trận ΔLST).
  const later = new Date(date.getTime() + 6 * 3600000);
  const frameLater = buildSkyFrame(later, latitude, 105.8542);
  const deltaLst = wrap180(frameLater.lstDeg - frame.lstDeg);
  const matrix = skyRotationMatrix(deltaLst, latitude);
  let worstLine = 0;
  for (const line of frame.lines) {
    const matching = frameLater.lines.find((item) => item.abbr === line.abbr);
    if (!matching) continue;
    for (let i = 0; i < line.points.length; i += 3) {
      const point = line.points[i];
      if (!Number.isFinite(point.alt)) continue;
      const rotated = altAzOf(applyMatrix3(matrix, directionOf(point.alt, point.az)));
      const target = matching.points[i];
      const separation = angularSeparationDeg(directionOf(rotated.alt, rotated.az), directionOf(target.alt, target.az));
      if (separation > worstLine) worstLine = separation;
    }
  }
  if (worstLine > 1e-4) fail("chòm sao", `đường nối chòm sao lệch ${worstLine.toExponential(2)}° sau 6 giờ tua`);
  ok();
}

console.log(`\n${failures ? "✘" : "✔"} Bầu trời 3D: ${checks.toLocaleString("vi-VN")} phép kiểm, ${failures} lỗi.`);
if (failures) process.exit(1);
