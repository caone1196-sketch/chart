/**
 * Tiểu hành tinh (asteroids) cho mục "Bầu trời hôm nay" và "Ngắm bầu trời 3D".
 *
 * astronomy-engine không có sẵn quỹ đạo tiểu hành tinh, nên ở đây ta dùng **các phần tử quỹ đạo
 * Kepler tức thời (osculating elements)** do NASA/JPL Small-Body Database (SBDB) công bố
 * (truy vấn 2026-09-16, tất cả cùng epoch JD 2461200,5 = 2026-07-09 TDB, mặt phẳng hoàng đạo J2000)
 * và truyền quỹ đạo hai vật thể (giải phương trình Kepler theo chuyển động trung bình `n`).
 *
 * Vì epoch rất gần hiện tại, sai số quanh "hôm nay" chỉ cỡ vài phút cung — quá đủ cho bản đồ
 * bầu trời trực quan; càng xa epoch (tua thời gian nhiều năm) sai số tăng dần do bỏ qua nhiễu
 * loạn hành tinh. Toạ độ thu được được xử lý giống hệt hành tinh của astronomy-engine:
 * hiệu chỉnh thời gian ánh sáng → tiến động J2000 → "của ngày" → toạ độ chân trời, và cấp sao
 * biểu kiến tính theo mô hình H/G chuẩn (Bowell et al.).
 */
import { Body, HelioVector, MakeTime } from "astronomy-engine";
import { julianDay } from "./mathx";
import { normalizeDegree } from "./astro";
import { precessFromJ2000, toEcliptic, toHorizontal } from "./sky";

const DEG = Math.PI / 180;

/** Nghiêng trục của mặt phẳng hoàng đạo J2000 so với xích đạo J2000. */
const OBLIQUITY_J2000 = 23.4392911 * DEG;

/** Thời gian ánh sáng đi hết 1 AU (ngày) — dùng cho hiệu chỉnh thời gian ánh sáng. */
const LIGHT_DAYS_PER_AU = 499.004783836 / 86400;

/** 1 AU tính bằng km — dùng suy ra bán kính góc thật từ đường kính và khoảng cách. */
const KM_PER_AU = 149597870.7;

export type AsteroidKind = "dwarf" | "asteroid";

export type AsteroidElements = {
  /** Khoá nội bộ, dùng cho hit/selection. */
  key: string;
  /** Số hiệu MPC. */
  number: number;
  /** Tên quốc tế. */
  name: string;
  /** Nhãn hiển thị tiếng Việt. */
  labelVi: string;
  /** Ghi chú loại thiên thể (hành tinh lùn / tiểu hành tinh). */
  kindVi: string;
  kind: AsteroidKind;
  /** Màu hiển thị (theo quang phổ / suất phản chiếu). */
  color: string;
  /** Epoch của bộ phần tử (JD, TDB). */
  epochJd: number;
  /** Bán trục lớn (AU). */
  a: number;
  /** Tâm sai. */
  e: number;
  /** Nghiêng quỹ đạo (độ). */
  iDeg: number;
  /** Kinh độ nút lên Ω (độ, hoàng đạo J2000). */
  nodeDeg: number;
  /** Acgumen cận điểm ω (độ). */
  periDeg: number;
  /** Dị thường trung bình tại epoch (độ). */
  m0Deg: number;
  /** Chuyển động trung bình (độ/ngày). */
  nDegPerDay: number;
  /** Cấp sao tuyệt đối H và hệ số dốc G (mô hình H/G). */
  H: number;
  G: number;
  /** Đường kính hiệu dụng (km) — dùng tính bán kính góc thật khi phóng to. */
  diameterKm: number;
};

/**
 * 8 tiểu hành tinh sáng nhất vành đai chính — nguồn phần tử: NASA/JPL SBDB API
 * (`ssd-api.jpl.nasa.gov/sbdb.api`, truy vấn 2026-09-16, `full-prec=1`), epoch chung 2461200,5.
 */
export const ASTEROIDS: AsteroidElements[] = [
  {
    key: "ceres",
    number: 1,
    name: "Ceres",
    labelVi: "Ceres",
    kindVi: "hành tinh lùn",
    kind: "dwarf",
    color: "#cbbfa6",
    epochJd: 2461200.5,
    a: 2.765552595034094,
    e: 0.07969229514816586,
    iDeg: 10.58802780183462,
    nodeDeg: 80.24862682043221,
    periDeg: 73.29421453021587,
    m0Deg: 274.4193463761342,
    nDegPerDay: 0.21430445064843,
    H: 3.34,
    G: 0.12,
    diameterKm: 939.4
  },
  {
    key: "pallas",
    number: 2,
    name: "Pallas",
    labelVi: "Pallas",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#9fb4c7",
    epochJd: 2461200.5,
    a: 2.769559010737709,
    e: 0.2307000995648547,
    iDeg: 34.93279321851542,
    nodeDeg: 172.8866193357694,
    periDeg: 310.9699161652136,
    m0Deg: 254.2496521742734,
    nDegPerDay: 0.2138396029251949,
    H: 4.12,
    G: 0.11,
    diameterKm: 513
  },
  {
    key: "juno",
    number: 3,
    name: "Juno",
    labelVi: "Juno",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#cfc0a8",
    epochJd: 2461200.5,
    a: 2.670989527103278,
    e: 0.2556999836681878,
    iDeg: 12.98659236598085,
    nodeDeg: 169.8115953492418,
    periDeg: 247.8950743075613,
    m0Deg: 262.7322944883855,
    nDegPerDay: 0.2257853690721904,
    H: 5.19,
    G: 0.32,
    diameterKm: 246.6
  },
  {
    key: "vesta",
    number: 4,
    name: "Vesta",
    labelVi: "Vesta",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#e0d2b8",
    epochJd: 2461200.5,
    a: 2.361365965127599,
    e: 0.09020374382834395,
    iDeg: 7.143925545058711,
    nodeDeg: 103.701293265032,
    periDeg: 151.4686478221564,
    m0Deg: 81.19015607686903,
    nDegPerDay: 0.2716183613599909,
    H: 3.25,
    G: 0.32,
    diameterKm: 522.77
  },
  {
    key: "iris",
    number: 7,
    name: "Iris",
    labelVi: "Iris",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#d8c9b2",
    epochJd: 2461200.5,
    a: 2.385746302646938,
    e: 0.2302746853668762,
    iDeg: 5.518567726455019,
    nodeDeg: 259.4851402183693,
    periDeg: 145.4071283819921,
    m0Deg: 115.2916674478007,
    nDegPerDay: 0.2674654469109276,
    H: 5.7,
    G: 0.15,
    diameterKm: 199.83
  },
  {
    key: "flora",
    number: 8,
    name: "Flora",
    labelVi: "Flora",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#ddd0ba",
    epochJd: 2461200.5,
    a: 2.201560614294881,
    e: 0.1561964033906808,
    iDeg: 5.890315098602565,
    nodeDeg: 110.8433074868032,
    periDeg: 285.408347619081,
    m0Deg: 259.2621317520155,
    nDegPerDay: 0.30172278183574,
    H: 6.62,
    G: 0.28,
    diameterKm: 147.49
  },
  {
    key: "hygiea",
    number: 10,
    name: "Hygiea",
    labelVi: "Hygiea",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#8e9094",
    epochJd: 2461200.5,
    a: 3.150974033963701,
    e: 0.1067092741240963,
    iDeg: 3.829529946447122,
    nodeDeg: 283.1198927508594,
    periDeg: 312.4242387344704,
    m0Deg: 252.0344242359649,
    nDegPerDay: 0.1762125505792448,
    H: 5.65,
    G: 0.15,
    diameterKm: 407.12
  },
  {
    key: "eunomia",
    number: 15,
    name: "Eunomia",
    labelVi: "Eunomia",
    kindVi: "tiểu hành tinh",
    kind: "asteroid",
    color: "#d3c3ab",
    epochJd: 2461200.5,
    a: 2.641958730730434,
    e: 0.1877707677912555,
    iDeg: 11.76139314431215,
    nodeDeg: 292.8807830122993,
    periDeg: 98.46131825798194,
    m0Deg: 159.6891049210672,
    nDegPerDay: 0.2295170904959873,
    H: 5.42,
    G: 0.23,
    diameterKm: 231.69
  }
];

type Vec3 = { x: number; y: number; z: number };

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len3 = (a: Vec3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const clampN = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Giải phương trình Kepler M = E − e·sin E bằng Newton (hội tụ rất nhanh vì e < 0,26).
 * Trả về dị thường tâm sai E (radian); `mDeg` là dị thường trung bình (độ).
 */
export const solveKepler = (mDeg: number, e: number): number => {
  const mRad = normalizeDegree(mDeg) * DEG;
  let ecc = mRad + e * Math.sin(mRad);
  for (let i = 0; i < 24; i += 1) {
    const delta = (mRad - (ecc - e * Math.sin(ecc))) / (1 - e * Math.cos(ecc));
    ecc += delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return ecc;
};

/**
 * Vector nhật tâm của tiểu hành tinh tại JD (đơn vị AU, hệ **xích đạo J2000** —
 * cùng hệ với `HelioVector` của astronomy-engine để trừ ra vector địa tâm được ngay).
 */
export const asteroidHelioJ2000 = (elements: AsteroidElements, jd: number): Vec3 => {
  const mDeg = elements.m0Deg + elements.nDegPerDay * (jd - elements.epochJd);
  const E = solveKepler(mDeg, elements.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // Toạ độ trong mặt phẳng quỹ đạo (x′ hướng cận điểm).
  const xp = elements.a * (cosE - elements.e);
  const yp = elements.a * Math.sqrt(1 - elements.e * elements.e) * sinE;

  const w = elements.periDeg * DEG;
  const node = elements.nodeDeg * DEG;
  const inc = elements.iDeg * DEG;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  // Mặt phẳng quỹ đạo → hoàng đạo J2000 (công thức chuẩn R_z(−Ω)·R_x(−i)·R_z(−ω)).
  const xEcl = (cosw * cosO - sinw * sinO * cosI) * xp + (-sinw * cosO - cosw * sinO * cosI) * yp;
  const yEcl = (cosw * sinO + sinw * cosO * cosI) * xp + (-sinw * sinO + cosw * cosO * cosI) * yp;
  const zEcl = sinw * sinI * xp + cosw * sinI * yp;

  // Hoàng đạo J2000 → xích đạo J2000 (quay quanh trục x một góc ε).
  return {
    x: xEcl,
    y: yEcl * Math.cos(OBLIQUITY_J2000) - zEcl * Math.sin(OBLIQUITY_J2000),
    z: yEcl * Math.sin(OBLIQUITY_J2000) + zEcl * Math.cos(OBLIQUITY_J2000)
  };
};

/** Cấp sao biểu kiến theo mô hình H/G (Bowell et al., dùng cho ephemeris của MPC). */
export const hgMagnitude = (H: number, G: number, sunDistanceAu: number, earthDistanceAu: number, phaseDeg: number): number => {
  const half = (clampN(phaseDeg, 0, 179.9) / 2) * DEG;
  const tanHalf = Math.tan(half);
  const phi1 = Math.exp(-3.33 * Math.pow(tanHalf, 0.63));
  const phi2 = Math.exp(-1.87 * Math.pow(tanHalf, 1.22));
  const brightness = Math.max(1e-12, (1 - G) * phi1 + G * phi2);
  return H + 5 * Math.log10(Math.max(1e-9, sunDistanceAu * earthDistanceAu)) - 2.5 * Math.log10(brightness);
};

export type AsteroidSky = {
  key: string;
  number: number;
  name: string;
  label: string;
  kindVi: string;
  kind: AsteroidKind;
  color: string;
  /** Xích kinh / xích vĩ "của ngày" (đã tiến động) — độ. */
  ra: number;
  dec: number;
  /** Kinh độ hoàng đạo nhiệt đới (độ). */
  lon: number;
  alt: number;
  az: number;
  /** Cấp sao biểu kiến (H/G, đã tính pha). */
  magnitude: number;
  /** Khoảng cách địa tâm (AU). */
  distanceAu: number;
  /** Khoảng cách nhật tâm (AU). */
  sunDistanceAu: number;
  /** Bán kính góc thật (độ) — dùng khi phóng to sâu. */
  angularRadiusDeg: number;
  /** Đường kính (km). */
  diameterKm: number;
};

/**
 * Vị trí biểu kiến của các tiểu hành tinh tại một thời điểm/địa điểm.
 * Quy trình giống `computeSkySnapshot`: thời gian ánh sáng → J2000 → tiến động → chân trời.
 */
export const computeAsteroidsSky = (date: Date, lstDeg: number, latitude: number, obliquityDeg: number): AsteroidSky[] => {
  const jd = julianDay(date);
  const time = MakeTime(date);
  const earthNow = HelioVector(Body.Earth, time);
  const earthSunDistance = len3(earthNow);

  return ASTEROIDS.map((elements) => {
    // Lần 1: ước lượng thời gian ánh sáng bằng vị trí tức thời.
    const firstGuess = sub3(asteroidHelioJ2000(elements, jd), earthNow);
    const lightDelayDays = len3(firstGuess) * LIGHT_DAYS_PER_AU;
    // Lần 2: vị trí phát xạ thật (lùi lại đúng thời gian ánh sáng đã đi).
    const helio = asteroidHelioJ2000(elements, jd - lightDelayDays);
    const geo = sub3(helio, earthNow);

    const distanceAu = len3(geo);
    const sunDistanceAu = len3(helio);
    const raJ2000 = normalizeDegree(Math.atan2(geo.y, geo.x) / DEG);
    const decJ2000 = Math.asin(clampN(geo.z / distanceAu, -1, 1)) / DEG;

    const ofDate = precessFromJ2000(raJ2000, decJ2000, date);
    const horizontal = toHorizontal(ofDate.ra, ofDate.dec, lstDeg, latitude);
    const lon = toEcliptic(ofDate.ra, ofDate.dec, obliquityDeg).lon;

    // Góc pha tại tiểu hành tinh: định lý cosin trong tam giác Mặt Trời–Trái Đất–tiểu hành tinh.
    const cosPhase = clampN(
      (sunDistanceAu * sunDistanceAu + distanceAu * distanceAu - earthSunDistance * earthSunDistance) /
        (2 * sunDistanceAu * distanceAu),
      -1,
      1
    );
    const phaseDeg = Math.acos(cosPhase) / DEG;
    const magnitude = hgMagnitude(elements.H, elements.G, sunDistanceAu, distanceAu, phaseDeg);
    const angularRadiusDeg = Math.atan2(elements.diameterKm / 2, distanceAu * KM_PER_AU) / DEG;

    return {
      key: elements.key,
      number: elements.number,
      name: elements.name,
      label: elements.labelVi,
      kindVi: elements.kindVi,
      kind: elements.kind,
      color: elements.color,
      ra: ofDate.ra,
      dec: ofDate.dec,
      lon,
      alt: horizontal.alt,
      az: horizontal.az,
      magnitude,
      distanceAu,
      sunDistanceAu,
      angularRadiusDeg,
      diameterKm: elements.diameterKm
    };
  });
};
