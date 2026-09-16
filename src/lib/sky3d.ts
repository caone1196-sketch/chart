/**
 * Mô hình 3D cho mục "Ngắm bầu trời 3D".
 *
 * Ý tưởng: người quan sát đứng tại tâm một thiên cầu bán kính 1; mọi thiên thể là **một hướng**
 * (vector đơn vị) trong hệ toạ độ chân trời địa phương ENU (x = Đông, y = Bắc, z = Thiên đỉnh).
 * Một camera phối cảnh (pinhole) đặt tại gốc, nhìn theo phương vị `yaw` và độ cao `pitch`,
 * trường nhìn dọc `fov` — chiếu các hướng đó lên mặt phẳng ảnh đúng như ống kính máy ảnh:
 *
 *   depth = d · forward        (chỉ thấy khi depth > NEAR, tức nằm trong nửa bán cầu trước camera)
 *   x     = cx + focal · (d · right) / depth
 *   y     = cy − focal · (d · up)    / depth
 *   focal = (height / 2) / tan(fov / 2)
 *
 * Nhờ vậy mà "3D" ở đây là 3D thật về mặt hình học chứ không phải hiệu ứng giả:
 *  - đường chân trời (một vòng tròn lớn đi qua tâm camera) chiếu thành **đường thẳng**;
 *  - các vòng tròn độ cao khác chiếu thành đường cong, càng gần chân trời càng giãn ra;
 *  - mặt đất là các hướng có độ cao âm: điểm cách D mét, mắt cao h mét → độ cao −atan(h/D),
 *    nên lưới mặt đất tự hội tụ về chân trời đúng phối cảnh;
 *  - thu nhỏ `fov` = nhìn như qua ống nhòm/kính thiên văn, vật thể to ra mà không méo.
 *
 * Chuyển động thời gian: bầu trời quay quanh trục cực thiên cầu với tốc độ giờ sao.
 * Thay vì dựng lại catalogue 5.044 sao mỗi khung hình, ta **xoay** các vector đã lưu sẵn bằng một
 * ma trận 3×3 ứng với ΔLST — chính xác về mặt hình học và rẻ hơn hàng trăm lần (xem `skyRotationMatrix`).
 *
 * Toàn bộ tệp này là toán thuần (không DOM) nên kiểm chứng được bằng `npm run test:sky3d`.
 */
import { clamp, clamp01, refractedAltitude, wrap180 } from "./sky-visual";

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ vector & toạ độ */

export type Vec3 = { x: number; y: number; z: number };

export type AltAz = { alt: number; az: number };

export const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

export const length3 = (a: Vec3) => Math.sqrt(dot3(a, a));

export const normalize3 = (a: Vec3): Vec3 => {
  const length = length3(a);
  if (!Number.isFinite(length) || length < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
});

/** Hướng (độ cao, phương vị) → vector đơn vị ENU. */
export const directionOf = (altDeg: number, azDeg: number): Vec3 => {
  const alt = altDeg * DEG;
  const az = azDeg * DEG;
  const cosAlt = Math.cos(alt);
  return { x: cosAlt * Math.sin(az), y: cosAlt * Math.cos(az), z: Math.sin(alt) };
};

/** Vector ENU → (độ cao, phương vị) theo độ; phương vị luôn trong [0, 360). */
export const altAzOf = (vector: Vec3): AltAz => {
  const normalized = normalize3(vector);
  const alt = Math.asin(clamp(normalized.z, -1, 1)) / DEG;
  const az = (Math.atan2(normalized.x, normalized.y) / DEG + 360) % 360;
  return { alt, az };
};

/** Xoay vector quanh một trục đơn vị theo công thức Rodrigues. */
export const rotateAbout = (axis: Vec3, vector: Vec3, angleRad: number): Vec3 => {
  const k = normalize3(axis);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const term = cross3(k, vector);
  const projection = dot3(k, vector);
  return {
    x: vector.x * cos + term.x * sin + k.x * projection * (1 - cos),
    y: vector.y * cos + term.y * sin + k.y * projection * (1 - cos),
    z: vector.z * cos + term.z * sin + k.z * projection * (1 - cos)
  };
};

/** Nội suy cầu (great-circle) giữa hai hướng: dùng để vẽ đúng cung nối hai ngôi sao. */
export const slerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const na = normalize3(a);
  const nb = normalize3(b);
  const cosOmega = clamp(dot3(na, nb), -1, 1);
  const omega = Math.acos(cosOmega);
  if (omega < 1e-7) return normalize3(lerp3(na, nb, t));
  const sinOmega = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / sinOmega;
  const k2 = Math.sin(t * omega) / sinOmega;
  return normalize3({ x: na.x * k1 + nb.x * k2, y: na.y * k1 + nb.y * k2, z: na.z * k1 + nb.z * k2 });
};

/**
 * Góc giữa hai hướng (độ). Dùng `atan2(|a×b|, a·b)` thay vì `acos(a·b)`:
 * với góc cỡ 1e-7° thì `1 − cos` nhỏ hơn cả độ chính xác số thực nên acos cho ra 0 hoặc rác.
 */
export const angularSeparationDeg = (a: Vec3, b: Vec3) => {
  const na = normalize3(a);
  const nb = normalize3(b);
  return Math.atan2(length3(cross3(na, nb)), dot3(na, nb)) / DEG;
};

/* ------------------------------------------------------- quay bầu trời theo giờ sao */

/**
 * Trục cực Bắc thiên cầu trong hệ ENU: nằm ở phương vị 0°, độ cao = vĩ độ.
 * (Ở bán cầu nam giá trị này âm — cực Bắc nằm dưới chân trời Bắc, cực Nam ở đối diện.)
 */
export const poleAxis = (latitudeDeg: number): Vec3 => directionOf(latitudeDeg, 0);

/**
 * Ma trận 3×3 (hàng đầu tiên là m[0..2]) xoay toàn bộ bầu trời khi giờ sao địa phương
 * tăng thêm `deltaLstDeg`. Chiều quay: bầu trời **dịch về phía Tây** khi thời gian trôi,
 * tương đương xoay vector quanh trục cực một góc −ΔLST (đã kiểm chứng bằng cách so với
 * `buildSkyFrame` dựng lại ở thời điểm mới trong `tests/sky3d.check.ts`).
 */
export const skyRotationMatrix = (deltaLstDeg: number, latitudeDeg: number): number[] => {
  const axis = poleAxis(latitudeDeg);
  const angle = -deltaLstDeg * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { x, y, z } = axis;
  const t = 1 - cos;
  return [
    cos + x * x * t,
    x * y * t - z * sin,
    x * z * t + y * sin,
    y * x * t + z * sin,
    cos + y * y * t,
    y * z * t - x * sin,
    z * x * t - y * sin,
    z * y * t + x * sin,
    cos + z * z * t
  ];
};

/** Nhân ma trận với vector (không chuẩn hoá lại — ma trận quay bảo toàn độ dài). */
export const applyMatrix3 = (matrix: number[], vector: Vec3): Vec3 => ({
  x: matrix[0] * vector.x + matrix[1] * vector.y + matrix[2] * vector.z,
  y: matrix[3] * vector.x + matrix[4] * vector.y + matrix[5] * vector.z,
  z: matrix[6] * vector.x + matrix[7] * vector.y + matrix[8] * vector.z
});

/**
 * Xoay một hướng theo ΔLST — dạng "đọc được" dùng cho nhãn và tra cứu;
 * còn bộ vẽ dùng `skyRotationMatrix` để khỏi phải qua lại giữa độ và vector.
 */
export const rotateSkyByLst = (point: AltAz, deltaLstDeg: number, latitudeDeg: number): AltAz =>
  altAzOf(applyMatrix3(skyRotationMatrix(deltaLstDeg, latitudeDeg), directionOf(point.alt, point.az)));

/**
 * Áp khúc xạ khí quyển cho các hướng thấp (chỉ dưới 25° vì trên đó khúc xạ < 1′,
 * không đáng kể so với một điểm ảnh) — trả về vector đã nâng lên đúng như mắt thấy.
 */
export const refractDirection = (vector: Vec3, enabled: boolean): Vec3 => {
  if (!enabled) return vector;
  const normalized = normalize3(vector);
  const alt = Math.asin(clamp(normalized.z, -1, 1)) / DEG;
  if (alt >= 25 || alt <= -3) return normalized;
  const az = Math.atan2(normalized.x, normalized.y) / DEG;
  return directionOf(refractedAltitude(alt), az);
};

/* ------------------------------------------------------------------------ camera 3D */

export type Camera3D = {
  /** Phương vị đang nhìn (độ, 0 = Bắc, 90 = Đông). */
  yaw: number;
  /** Độ cao đang nhìn (độ, 0 = chân trời, +90 = thiên đỉnh). */
  pitch: number;
  /** Trường nhìn theo chiều dọc (độ) — càng nhỏ càng "phóng to". */
  fov: number;
};

export const CAMERA_FOV = { min: 5, max: 110, initial: 64 };
export const CAMERA_PITCH_LIMIT = 89;
/** Giới hạn pitch khi nhìn xuống: không cho lật camera qua đáy (giữ "đứng trên mặt đất"). */
export const CAMERA_PITCH_DOWN_LIMIT = -42;

/** Kẹp camera vào giới hạn; đầu vào không hữu hạn (sự kiện lỗi) thì trả về giá trị mặc định. */
export const clampCamera = (camera: Camera3D): Camera3D => {
  const yaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
  const pitch = Number.isFinite(camera.pitch) ? camera.pitch : 0;
  const fov = Number.isFinite(camera.fov) ? camera.fov : CAMERA_FOV.initial;
  return {
    yaw: ((yaw % 360) + 360) % 360,
    pitch: clamp(pitch, CAMERA_PITCH_DOWN_LIMIT, CAMERA_PITCH_LIMIT),
    fov: clamp(fov, CAMERA_FOV.min, CAMERA_FOV.max)
  };
};

/** Chiều cao mắt người quan sát (mét) — quyết định độ hội tụ của lưới mặt đất. */
export const EYE_HEIGHT_M = 1.65;

export type Projected3D = {
  x: number;
  y: number;
  /** d · forward: 1 = ngay trước ống kính, ≤ NEAR = sau lưng camera. */
  depth: number;
  /** focal / depth — số điểm ảnh cho 1 radian tại hướng này (dùng để định cỡ vật thể). */
  scale: number;
  visible: boolean;
};

export type Camera3DProjector = {
  camera: Camera3D;
  width: number;
  height: number;
  focal: number;
  cx: number;
  cy: number;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** Toạ độ y màn hình của đường chân trời (alt = 0) — luôn là một đường thẳng. */
  horizonY: number;
  /** Số độ trên màn hình cho một điểm ảnh (dùng cho kéo chuột). */
  degreesPerPixel: number;
  /** Trường nhìn ngang suy ra từ tỉ lệ khung. */
  horizontalFov: number;
  project: (altDeg: number, azDeg: number) => Projected3D;
  projectVector: (vector: Vec3) => Projected3D;
  inverse: (x: number, y: number) => AltAz;
  /** Bán kính trên màn hình (px) của một vật thể có bán kính góc `rhoDeg` tại hướng `vector`. */
  radiusPixels: (rhoDeg: number, vector: Vec3) => number;
};

/**
 * Điểm gần nhất còn được coi là "trước camera". depth = cos(góc lệch trục):
 * 0.02 ≈ 88,9° — đủ rộng để không cắt vật thể ở rìa khung, đủ hẹp để toạ độ không nổ ra vô hạn.
 */
export const PROJECT_NEAR = 0.02;

/** Chặn toạ độ để đường kẻ từ điểm sát mặt phẳng camera không sinh số khổng lồ. */
const COORDINATE_LIMIT = 1e5;

export const makeCamera3D = (camera: Camera3D, width: number, height: number): Camera3DProjector => {
  const safe = clampCamera(camera);
  const focal = height / 2 / Math.tan((safe.fov / 2) * DEG);
  const cx = width / 2;
  const cy = height / 2;
  const forward = directionOf(safe.pitch, safe.yaw);
  // right = forward × up_thế_giới (chuẩn hoá): nhìn về Bắc thì tay phải chỉ về Đông.
  const right = normalize3(cross3(forward, { x: 0, y: 0, z: 1 }));
  const up = normalize3(cross3(right, forward));

  const projectVector = (vector: Vec3): Projected3D => {
    const normalized = normalize3(vector);
    const depth = dot3(normalized, forward);
    if (!Number.isFinite(depth) || depth <= PROJECT_NEAR) {
      return { x: Number.NaN, y: Number.NaN, depth, scale: 0, visible: false };
    }
    const scale = focal / depth;
    const x = cx + scale * dot3(normalized, right);
    const y = cy - scale * dot3(normalized, up);
    return {
      x: clamp(Number.isFinite(x) ? x : 0, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      y: clamp(Number.isFinite(y) ? y : 0, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      depth,
      scale,
      visible: true
    };
  };

  return {
    camera: safe,
    width,
    height,
    focal,
    cx,
    cy,
    right,
    up,
    forward,
    horizonY: cy + focal * Math.tan(safe.pitch * DEG),
    degreesPerPixel: safe.fov / height,
    horizontalFov: 2 * Math.atan(width / 2 / focal) / DEG,
    project: (altDeg: number, azDeg: number) => projectVector(directionOf(altDeg, azDeg)),
    projectVector,
    inverse: (x: number, y: number) => {
      const ray = normalize3({
        x: forward.x + ((x - cx) / focal) * right.x + ((cy - y) / focal) * up.x,
        y: forward.y + ((x - cx) / focal) * right.y + ((cy - y) / focal) * up.y,
        z: forward.z + ((x - cx) / focal) * right.z + ((cy - y) / focal) * up.z
      });
      return altAzOf(ray);
    },
    radiusPixels: (rhoDeg: number, vector: Vec3) => {
      const depth = dot3(normalize3(vector), forward);
      if (depth <= PROJECT_NEAR) return 0;
      return clamp((focal * Math.tan(Math.max(rhoDeg, 0) * DEG)) / depth, 0, COORDINATE_LIMIT);
    }
  };
};

/** Kéo chuột: "cầm lấy bầu trời" — kéo sang phải thì trời sang phải (camera quay trái). */
export const lookByPixels = (camera: Camera3D, dxPixels: number, dyPixels: number, height: number): Camera3D => {
  const degreesPerPixel = clampCamera(camera).fov / Math.max(1, height);
  return clampCamera({
    yaw: camera.yaw - dxPixels * degreesPerPixel,
    pitch: camera.pitch + dyPixels * degreesPerPixel,
    fov: camera.fov
  });
};

/**
 * Đổi trường nhìn sao cho hướng đang nằm dưới điểm `point` vẫn ở đúng chỗ đó
 * (bản 3D của "zoom quanh con trỏ"). Trả về camera mới đã kẹp giới hạn.
 *
 * Cách giải (nghiệm kín, không lặp): với camera không có góc nghiêng (roll = 0),
 * toạ độ camera của một hướng d = (độ cao a, phương vị az) chỉ phụ thuộc Δaz = az − yaw và pitch p:
 *
 *   x_c = cos a · sin Δaz
 *   y_c = sin a · cos p − cos a · sin p · cos Δaz
 *   z_c = cos a · cos Δaz · cos p + sin a · sin p
 *
 * Đổi `fov` chỉ đổi `focal`, nên muốn giữ nguyên vị trí màn hình thì (x_c, y_c, z_c) phải đổi
 * theo đúng tỉ lệ focal. Biết bộ ba mong muốn: phương trình đầu giải ra Δaz (arcsin, hai nhánh),
 * hai phương trình sau là hệ tuyến tính theo (cos p, sin p) → giải ra p, suy ra yaw = az − Δaz.
 */
export const zoomCameraAtPoint = (
  camera: Camera3D,
  factor: number,
  point: { x: number; y: number },
  width: number,
  height: number
): Camera3D => {
  const current = clampCamera(camera);
  const fov = clamp(current.fov / factor, CAMERA_FOV.min, CAMERA_FOV.max);
  if (fov === current.fov) return current;

  const before = makeCamera3D(current, width, height);
  const target = before.inverse(point.x, point.y);
  const cosAlt = Math.cos(target.alt * DEG);
  const sinAlt = Math.sin(target.alt * DEG);

  // Hướng ngay dưới điểm zoom sát thiên đỉnh/đáy thì phương vị vô nghĩa → chỉ đổi fov.
  if (Math.abs(cosAlt) < 1e-9) return clampCamera({ ...current, fov });

  const targetVector = directionOf(target.alt, target.az);
  const focalAfter = height / 2 / Math.tan((fov / 2) * DEG);
  const ratio = before.focal / focalAfter; // < 1 khi phóng to: góc lệch phải co lại
  const wanted = normalize3({
    x: dot3(targetVector, before.right) * ratio,
    y: dot3(targetVector, before.up) * ratio,
    z: dot3(targetVector, before.forward)
  });

  // |sin Δaz| > 1 nghĩa là **vô nghiệm**: hướng đích nằm quá cao nên không thể đặt ở độ lệch ngang
  // lớn đến thế với camera không roll (giới hạn hình học là |x_c| ≤ cos(độ cao)). Thường gặp khi
  // THU NHỎ lúc đang ngẩng gần thiên đỉnh và con trỏ ở mép khung. Khi đó thu nhỏ quanh trục nhìn
  // (giữ nguyên yaw/pitch) — dự đoán được và không làm camera lật hay văng sang hướng khác.
  const sinDeltaAz = wanted.x / cosAlt;
  if (!Number.isFinite(sinDeltaAz) || Math.abs(sinDeltaAz) > 1) return clampCamera({ ...current, fov });
  const branches = [Math.asin(sinDeltaAz), Math.PI - Math.asin(sinDeltaAz)];
  let best: Camera3D | null = null;
  let bestDrift = Number.POSITIVE_INFINITY;

  for (const deltaAz of branches) {
    const cosDeltaAz = Math.cos(deltaAz);
    const determinant = sinAlt * sinAlt + cosAlt * cosAlt * cosDeltaAz * cosDeltaAz;
    if (determinant < 1e-12) continue;
    const cosPitch = (sinAlt * wanted.y + cosAlt * cosDeltaAz * wanted.z) / determinant;
    const sinPitch = (-cosAlt * cosDeltaAz * wanted.y + sinAlt * wanted.z) / determinant;
    const pitch = Math.atan2(sinPitch, cosPitch) / DEG;
    // Nghiệm đòi pitch ngoài giới hạn (ví dụ nhìn thẳng thiên đỉnh) thì coi như vô nghiệm,
    // không kẹp rồi chịu lệch — thà thu nhỏ quanh trục nhìn còn hơn để khung hình giật.
    if (pitch > CAMERA_PITCH_LIMIT || pitch < CAMERA_PITCH_DOWN_LIMIT) continue;
    // Hướng phải nằm trước ống kính (z_c > 0), nếu không thì là nhánh nghiệm kia.
    const depth = cosAlt * cosDeltaAz * Math.cos(pitch * DEG) + sinAlt * Math.sin(pitch * DEG);
    if (depth <= PROJECT_NEAR) continue;
    const candidate = clampCamera({ yaw: target.az - deltaAz / DEG, pitch, fov });
    const drift = angularSeparationDeg(directionOf(candidate.pitch, candidate.yaw), before.forward);
    if (drift < bestDrift) {
      bestDrift = drift;
      best = candidate;
    }
  }

  return best ?? clampCamera({ ...current, fov });
};

/** Đưa một hướng vào giữa khung nhìn, giữ nguyên mức phóng. */
export const centerCameraOn = (camera: Camera3D, target: AltAz): Camera3D =>
  clampCamera({ yaw: target.az, pitch: clamp(target.alt, CAMERA_PITCH_DOWN_LIMIT, CAMERA_PITCH_LIMIT), fov: camera.fov });

/* ------------------------------------------------------------------- đường & cắt tia */

export type ScreenPoint = { x: number; y: number };

/** Tách một dải điểm theo mốc NaN (các nét chòm sao được ngăn nhau bằng điểm NaN). */
export const splitPath = (points: Array<{ alt: number; az: number }>): AltAz[][] => {
  const segments: AltAz[][] = [];
  let current: AltAz[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.alt) || !Number.isFinite(point.az)) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push({ alt: point.alt, az: point.az });
  }
  if (current.length) segments.push(current);
  return segments;
};

/**
 * Làm dày một dải điểm: nối hai điểm liên tiếp bằng cung tròn lớn thay vì dây cung,
 * để đường hoàng đạo / nét chòm sao cong đúng như trên thiên cầu khi chiếu phối cảnh.
 */
export const densifyPath = (segment: AltAz[], maxStepDeg = 2): Vec3[] => {
  if (segment.length === 0) return [];
  const vectors = [directionOf(segment[0].alt, segment[0].az)];
  for (let i = 1; i < segment.length; i += 1) {
    const previous = vectors[vectors.length - 1];
    const next = directionOf(segment[i].alt, segment[i].az);
    const separation = angularSeparationDeg(previous, next);
    const steps = Math.min(64, Math.max(1, Math.ceil(separation / Math.max(0.05, maxStepDeg))));
    for (let step = 1; step <= steps; step += 1) vectors.push(slerp3(previous, next, step / steps));
  }
  return vectors;
};

/**
 * Cắt một dải vector theo camera: chỉ giữ phần nằm trước ống kính, chèn thêm điểm ngay trên
 * mặt phẳng cắt để đường kẻ chạy sát mép khung thay vì đứt đoạn hoặc vòng ngược vô lý.
 * Trả về nhiều dải con (một dải có thể vào rồi ra khỏi khung nhiều lần).
 */
export const clipPolyline = (vectors: Vec3[], projector: Camera3DProjector): ScreenPoint[][] => {
  const paths: ScreenPoint[][] = [];
  let current: ScreenPoint[] = [];

  const depthOf = (vector: Vec3) => dot3(normalize3(vector), projector.forward);
  const boundaryPoint = (from: Vec3, to: Vec3): ScreenPoint | null => {
    const depthFrom = depthOf(from);
    const depthTo = depthOf(to);
    if (depthTo === depthFrom) return null;
    const t = (PROJECT_NEAR - depthFrom) / (depthTo - depthFrom);
    if (!Number.isFinite(t) || t < 0 || t > 1) return null;
    const point = projector.projectVector(lerp3(from, to, clamp(t, 0, 1)));
    if (!point.visible) return null;
    return { x: point.x, y: point.y };
  };

  for (let i = 0; i < vectors.length; i += 1) {
    const vector = vectors[i];
    const depth = depthOf(vector);
    if (depth > PROJECT_NEAR) {
      if (current.length === 0 && i > 0) {
        const boundary = boundaryPoint(vectors[i - 1], vector);
        if (boundary) current.push(boundary);
      }
      const point = projector.projectVector(vector);
      if (point.visible) current.push({ x: point.x, y: point.y });
    } else if (current.length > 0) {
      const boundary = boundaryPoint(vectors[i - 1], vector);
      if (boundary) current.push(boundary);
      if (current.length > 1) paths.push(current);
      current = [];
    }
  }
  if (current.length > 1) paths.push(current);
  return paths;
};

/** Dự án hoàn chỉnh một dải (alt, az) — tách NaN, làm dày theo cung tròn lớn, cắt theo camera. */
export const projectPath = (
  points: Array<{ alt: number; az: number }>,
  projector: Camera3DProjector,
  maxStepDeg = 2
): ScreenPoint[][] => splitPath(points).flatMap((segment) => clipPolyline(densifyPath(segment, maxStepDeg), projector));

/* ------------------------------------------------------------------- mặt đất phối cảnh */

/** Độ cao (âm) của một điểm trên mặt đất phẳng cách người quan sát `distanceM` mét. */
export const groundAltitudeAt = (distanceM: number) => -Math.atan(EYE_HEIGHT_M / Math.max(0.35, distanceM)) / DEG;

/** Ngược lại: hướng có độ cao `altDeg` (âm) là điểm cách bao xa trên mặt đất phẳng. */
export const groundDistanceFor = (altDeg: number) => (altDeg >= -0.001 ? Number.POSITIVE_INFINITY : EYE_HEIGHT_M / Math.tan(-altDeg * DEG));

/** Các vòng khoảng cách dùng vẽ lưới mặt đất (mét) — dày ở gần, thưa ở xa. */
export const GROUND_RINGS_M = [3, 6, 12, 24, 48, 96, 200, 420, 900];

/**
 * Vòng tròn khoảng cách trên mặt đất: một dải hướng có cùng độ cao âm, lấy mẫu theo phương vị.
 * Khi chiếu phối cảnh các vòng này hội tụ về đường chân trời → cho cảm giác chiều sâu thật.
 */
export const groundRingPath = (distanceM: number, stepDeg = 2): AltAz[] => {
  const alt = groundAltitudeAt(distanceM);
  const points: AltAz[] = [];
  for (let az = 0; az <= 360; az += stepDeg) points.push({ alt, az });
  return points;
};

/* ------------------------------------------------------------------------ hiệu ứng */

/**
 * Nhấp nháy khí quyển (scintillation): nhiễu tất định theo thời gian, mạnh dần khi sao xuống thấp
 * (ánh sáng đi qua lớp khí quyển dày và nhiễu loạn hơn). Trả về hệ số nhân cường độ ≈ [0.82, 1.18].
 */
export const scintillation = (seed: number, timeMs: number, altDeg: number): number => {
  const low = clamp01(1 - Math.max(altDeg, 0) / 45);
  const strength = 0.05 + 0.13 * low;
  if (strength < 0.005) return 1;
  // Hai mốc thời gian kề nhau để nhấp nháy mượt thay vì giật cục.
  const bucket = timeMs / 90;
  const index = Math.floor(bucket);
  const t = bucket - index;
  const hash = (value: number) => {
    const s = Math.sin((value + seed * 127.1) * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = hash(index);
  const b = hash(index + 1);
  const mixed = a + (b - a) * (t * t * (3 - 2 * t));
  return 1 + (mixed * 2 - 1) * strength;
};

/**
 * Độ dài vệt sao (độ) khi tua thời gian: bầu trời quay 15,041°/giờ nên tua nhanh
 * sẽ thấy sao vạch thành cung — đúng như phơi sáng dài ngoài đời.
 */
export const SIDEREAL_DEG_PER_HOUR = 15.0410686;

export const starTrailDegrees = (simulatedSecondsPerFrame: number) =>
  clamp(Math.abs(simulatedSecondsPerFrame) * (SIDEREAL_DEG_PER_HOUR / 3600), 0, 40);

/** Tỉ lệ thiên cầu lọt vào khung nhìn theo trường nhìn dọc (dùng cho thống kê/kiểm tra). */
export const visibleCapFraction = (fovDeg: number, aspectRatio = 16 / 9) => {
  const verticalHalf = (clamp(fovDeg, CAMERA_FOV.min, CAMERA_FOV.max) / 2) * DEG;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspectRatio);
  // Xấp xỉ bằng phần khối góc của chóp chữ nhật chia cho 4π.
  const solid = 4 * Math.asin(clamp(Math.sin(verticalHalf) * Math.sin(horizontalHalf), -1, 1));
  return clamp01(solid / (4 * Math.PI));
};

/** Phương vị "gọn" 0–360 dùng cho nhãn la bàn. */
export const normalizeAzimuth = (azDeg: number) => ((azDeg % 360) + 360) % 360;

/** Đổi yaw thành tên hướng la bàn ngắn (B, ĐB, Đ…). */
export const COMPASS_8: Array<{ label: string; az: number }> = [
  { label: "B", az: 0 },
  { label: "ĐB", az: 45 },
  { label: "Đ", az: 90 },
  { label: "ĐN", az: 135 },
  { label: "N", az: 180 },
  { label: "TN", az: 225 },
  { label: "T", az: 270 },
  { label: "TB", az: 315 }
];

/** Chênh lệch phương vị đã quấn về [−180, 180]. */
export const yawDelta = (fromDeg: number, toDeg: number) => wrap180(toDeg - fromDeg);
