/**
 * Các điểm ảo và thiên thể nhỏ dùng trong chiêm tinh:
 *  - Giao điểm Mặt Trăng: Bắc/Nam giao (trung bình & thật), Lilith (Black Moon), Selena.
 *  - Tiểu hành tinh: Chiron, Ceres, Pallas, Juno, Vesta.
 *  - Thiên thể xa: Eris, Sedna.
 *  - Hành tinh giả định nhóm Hamburg (Witte/Sieggrün): Cupido, Hades, Zeus, Kronos,
 *    Apollon, Admetos, Vulkanus, Poseidon + Isis-Transpluto.
 *
 * Cách tính: bài toán Kepler hai vật thể. Phần tử quỹ đạo của tiểu hành tinh và TNO lấy
 * từ NASA/JPL Small-Body Database; phần tử hành tinh giả định lấy đúng bảng seorbel.txt
 * của Swiss Ephemeris (nhóm Witte/Sieggrün, hiệu chỉnh bởi James Neely).
 * Phần tử tiểu hành tinh được chia thành 7 cửa sổ thời gian và nội suy — xem
 * tests/points.check.ts để biết sai số so với Swiss Ephemeris (≈0,5° trong 1900-2100).
 */

import { Body, GeoMoon, HelioVector, MakeTime } from "astronomy-engine";
import { calcObliquity, normalizeDegree } from "@/lib/astro";
import { julianDay } from "@/lib/sky";
import { julianCenturies, precessionMatrix } from "@/lib/zodiac";

const DEG = Math.PI / 180;
const J2000 = 2451545.0;
const EARTH_OBLIQUITY_J2000 = 23.4392911;
/** Tốc độ ánh sáng, AU/ngày. */
const LIGHT_DAY_AU = 173.144632674240;

export const AXIS = {
  x: [1, 0, 0] as [number, number, number],
  y: [0, 1, 0] as [number, number, number],
  z: [0, 0, 1] as [number, number, number]
};

type Vec3 = [number, number, number];

const rotateX = (v: Vec3, angDeg: number): Vec3 => {
  const c = Math.cos(angDeg * DEG);
  const s = Math.sin(angDeg * DEG);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
};

const applyMatrix = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
];

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const obliquityAt = (date: Date) => calcObliquity(date);

/** Nutation in longitude/obliquity (4 số hạng chính của Meeus) — đủ chính xác cho chiêm tinh. */
export const nutation = (date: Date) => {
  const T = julianCenturies(date);
  const L = (280.4665 + 36000.7698 * T) * DEG;
  const Lp = (218.3165 + 481267.8813 * T) * DEG;
  const Om = (125.04452 - 1934.136261 * T) * DEG;

  const deltaPsi = (-17.2 * Math.sin(Om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lp) + 0.21 * Math.sin(2 * Om)) / 3600;
  const deltaEps = (9.2 * Math.cos(Om) + 0.57 * Math.cos(2 * L) + 0.1 * Math.cos(2 * Lp) - 0.09 * Math.cos(2 * Om)) / 3600;
  return { deltaPsi, deltaEps, trueObliquity: obliquityAt(date) + deltaEps };
};

/** Kinh độ hoàng đạo biểu kiến của một vector xích đạo J2000 địa tâm. */
export const vectorToEclipticLongitude = (vectorEQJ: Vec3, date: Date) => {
  const precessed = applyMatrix(precessionMatrix(date), vectorEQJ);
  const ecliptic = rotateX(precessed, -obliquityAt(date));
  const lon = Math.atan2(ecliptic[1], ecliptic[0]) / DEG;
  const lat = Math.asin(ecliptic[2] / length(ecliptic)) / DEG;
  const { deltaPsi } = nutation(date);
  return { longitude: normalizeDegree(lon + deltaPsi), latitude: lat };
};

/* --------------------------------------------------------- bài toán Kepler */

export type KeplerElements = {
  /** Bán trục lớn, AU. */
  a: number;
  e: number;
  /** Độ nghiêng, độ. */
  i: number;
  /** Kinh độ điểm nút lên, độ. */
  node: number;
  /** Góc xa điểm cận nhật, độ. */
  peri: number;
  /** Dị thường trung bình tại tâm cửa sổ, độ. */
  meanAnomaly: number;
  /** Chuyển động trung bình, độ/ngày. */
  meanMotion: number;
  /** Đạo hàm chuyển động trung bình, độ/ngày². */
  meanMotionRate: number;
  /** Mốc thời gian JD của meanAnomaly. */
  epoch: number;
};

/** Giải phương trình Kepler M = E − e·sin E. */
const solveKepler = (M: number, e: number) => {
  let E = M;
  for (let iter = 0; iter < 60; iter += 1) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
};

/** Vị trí nhật tâm (AU) trong mặt phẳng hoàng đạo của chính hệ quy chiếu phần tử. */
export const keplerPosition = (elements: KeplerElements, jd: number): Vec3 => {
  const dt = jd - elements.epoch;
  const M = (elements.meanAnomaly + elements.meanMotion * dt + 0.5 * elements.meanMotionRate * dt * dt) * DEG;
  const E = solveKepler(M, elements.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = elements.a * (1 - elements.e * cosE);
  const trueAnomaly = Math.atan2(Math.sqrt(1 - elements.e * elements.e) * sinE, cosE - elements.e);
  const u = trueAnomaly + elements.peri * DEG;
  const cosNode = Math.cos(elements.node * DEG);
  const sinNode = Math.sin(elements.node * DEG);
  const cosIncl = Math.cos(elements.i * DEG);
  const sinIncl = Math.sin(elements.i * DEG);

  return [
    r * (cosNode * Math.cos(u) - sinNode * Math.sin(u) * cosIncl),
    r * (sinNode * Math.cos(u) + cosNode * Math.sin(u) * cosIncl),
    r * Math.sin(u) * sinIncl
  ];
};

/** Đổi vector hoàng đạo J2000 sang xích đạo J2000. */
const eclipticToEquatorialJ2000 = (v: Vec3): Vec3 => rotateX(v, EARTH_OBLIQUITY_J2000);

/** Đổi vector hoàng đạo của một equinox bất kỳ (độ nghiêng cho trước) sang xích đạo J2000. */
const equinoxEclipticToJ2000 = (v: Vec3, equinoxJd: number): Vec3 => {
  const equinoxDate = new Date((equinoxJd - 2440587.5) * 86400000);
  const obliquity = obliquityAt(equinoxDate);
  const equatorial = rotateX(v, obliquity);
  if (Math.abs(equinoxJd - J2000) < 1e-6) return equatorial;
  // precess J2000 -> equinox, rồi đảo ngược bằng chuyển vị
  const m = precessionMatrix(equinoxDate);
  const transposed = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  return applyMatrix(transposed, equatorial);
};

/* --------------------------------------------------- phần tử quỹ đạo (dữ liệu) */

type ElementWindow = [number, number, number, number, number, number, number, number];

/** [a, e, i, node, peri, M(tâm cửa sổ), n, ṅ] — khớp với phần tử JPL, hiệu chỉnh theo cửa sổ. */
const ASTEROID_WINDOWS: Record<string, ElementWindow[]> = {
  chiron: [
    [13.557613312, 0.383217315, 6.901636676, 209.845491611, 336.926713726, 53.90508656, 0.019778134, 2.8e-8],
    [13.640806334, 0.380254774, 6.911152919, 209.621661235, 338.531739358, 241.280869774, 0.019573256, -0.0],
    [13.640572596, 0.381369566, 6.91903357, 209.485649595, 339.108757897, 69.476589196, 0.019589891, 4e-9],
    [13.655955654, 0.38082625, 6.930720131, 209.422377582, 339.473337147, 257.352905982, 0.019544598, -1e-9],
    [13.661518675, 0.380962206, 6.931663955, 209.302516909, 339.511126217, 85.42929839, 0.019532471, 1e-9],
    [13.664930058, 0.38058688, 6.934839969, 209.27895287, 339.542966867, 273.414695497, 0.019527216, -2e-9],
    [13.655834746, 0.380112023, 6.935143007, 209.212392344, 339.64411324, 101.392140883, 0.019536279, -1e-9]
  ],
  ceres: [
    [2.767226014, 0.07826009, 10.611182405, 81.99411902, 69.457051715, 319.692417694, 0.21406925, 1e-9],
    [2.767173904, 0.078471042, 10.601510796, 81.620355573, 70.286772319, 219.841717343, 0.214104638, 2e-9],
    [2.767524189, 0.078163332, 10.600043626, 81.256223711, 70.759151786, 120.454639693, 0.214092048, -4e-9],
    [2.767312233, 0.077761207, 10.601044141, 80.823787214, 71.980395473, 20.095823015, 0.214073572, -0.0],
    [2.767193337, 0.07794399, 10.589036388, 80.436492902, 72.775356566, 280.281185506, 0.214093324, 1e-9],
    [2.767393662, 0.077474637, 10.591112183, 80.070716795, 73.322577132, 180.736613435, 0.214082817, -3e-9],
    [2.767578257, 0.077152917, 10.587195032, 79.64027211, 74.486400596, 80.419533538, 0.214082822, 1e-9]
  ],
  pallas: [
    [2.771594146, 0.237934681, 34.703041414, 174.217383666, 309.296783208, 319.925159485, 0.213588761, -3.4e-8],
    [2.771980821, 0.235515401, 34.73976618, 173.9411319, 309.598081267, 214.631142498, 0.213524604, 2.9e-8],
    [2.769977002, 0.235133648, 34.801676894, 173.648313182, 309.933966572, 111.214161572, 0.213796878, 1.6e-8],
    [2.771052493, 0.233954852, 34.814188365, 173.399036661, 309.953451071, 9.018772374, 0.213646146, -3.8e-8],
    [2.772073824, 0.231569687, 34.84513066, 173.12620304, 310.18337921, 264.068609946, 0.213507586, 8e-9],
    [2.77032573, 0.230776607, 34.908275868, 172.842892605, 310.579394844, 160.095451167, 0.213759862, 2e-8],
    [2.770745074, 0.229828176, 34.918683652, 172.590266647, 310.614873342, 58.08842699, 0.213699233, -3.2e-8]
  ],
  juno: [
    [2.669445998, 0.256505603, 13.006136411, 172.047140683, 244.860650637, 130.16194105, 0.225953631, 5e-9],
    [2.669615674, 0.256519898, 12.997405887, 171.555761371, 245.608512703, 144.90567277, 0.225941044, -9e-9],
    [2.669401715, 0.256915804, 12.990642013, 171.075918146, 246.341604842, 159.387448038, 0.225980455, 6e-9],
    [2.669556147, 0.256859088, 12.984937572, 170.562420623, 247.08689151, 174.046780052, 0.225938879, -4e-9],
    [2.669595039, 0.256988946, 12.977832347, 170.086347873, 247.814210083, 188.682670621, 0.225959338, -2e-9],
    [2.669396419, 0.257372387, 12.972342801, 169.587545428, 248.54228683, 203.17171539, 0.225968792, 4e-9],
    [2.669671629, 0.25728763, 12.966305973, 169.085782554, 249.288319359, 217.862260785, 0.22593092, -2e-9]
  ],
  vesta: [
    [2.361589082, 0.089102544, 7.131867644, 104.831022965, 148.337631627, 48.602187551, 0.271581303, 2e-9],
    [2.361625315, 0.089084035, 7.132811561, 104.595874384, 148.877375035, 142.088222778, 0.271547193, 3e-9],
    [2.361612173, 0.08922471, 7.134484183, 104.36311891, 149.335921031, 235.79698577, 0.271575962, -8e-9],
    [2.361635085, 0.089324862, 7.13629555, 104.120524472, 149.938490292, 329.059150738, 0.271566145, 1.1e-8],
    [2.361662587, 0.089365837, 7.137563243, 103.890076706, 150.475338939, 62.759709657, 0.271552854, -9e-9],
    [2.36164401, 0.089487596, 7.139252153, 103.64636558, 151.10862976, 156.040789948, 0.271580762, 3e-9],
    [2.36166968, 0.089471923, 7.140690482, 103.418656742, 151.65263134, 249.519707025, 0.271545213, 3e-9]
  ]
};

/** Tâm các cửa sổ phần tử (JD) — cách nhau ~26 năm, phủ 1885-2125. */
const WINDOW_CENTERS = [2416000.5, 2425625.5, 2435250.5, 2444875.5, 2454500.5, 2464125.5, 2473750.5];

/** Thiên thể xa (phần tử JPL SBDB, equinox J2000, epoch 2461200.5). */
const FIELDS_OBJECTS: Record<string, ElementWindow> = {
  eris: [67.93394687853566, 0.4382385347971672, 43.9258279471791, 36.00477044417249, 150.7949235840312, 211.774434275007, 0.001760247770619088, 0],
  sedna: [543.7195289104732, 0.8598824585187618, 11.92527582847476, 144.5061662673739, 311.0987725939751, 358.5956944005428, 7.773948799642578e-5, 0]
};

/** Nhóm Witte/Sieggrün: phần tử theo seorbel.txt, equinox J1900 = JD 2415020.0. */
const J1900 = 2415020.0;

/** Chuyển động trung bình Gauss: 0,9856076686 / a^1.5 (độ/ngày) — công thức của Swiss Ephemeris. */
const gaussianMeanMotion = (semiMajorAxis: number) => 0.9856076686 / Math.pow(semiMajorAxis, 1.5);
const FICTITIOUS: Record<
  string,
  { elements: ElementWindow; geocentric: boolean; equinoxJd: number; epochJd?: number; meaning: string }
> = {
  cupido: {
    elements: [40.99837, 0.0046, 1.0833, 129.8325, 171.4333, 163.7409, 0.003759342, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Cupido (Witte/Sieggrün): gia đình, hôn nhân, xã hội, nhóm tập thể, sự kết hợp."
  },
  hades: {
    elements: [50.66744, 0.00245, 1.05, 161.3339, 148.1796, 27.6496, 0.002734118, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Hades: quá khứ, bí mật, mất mát, sự nghèo khó, điều bị chôn giấu."
  },
  zeus: {
    elements: [59.21436, 0.0012, 0.0, 0.0, 299.044, 165.1232, 0.002166464, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Zeus: năng lượng sáng tạo có mục tiêu, lãnh đạo, kỹ thuật, đám đông."
  },
  kronos: {
    elements: [64.8169, 0.00305, 0.0, 0.0, 208.8801, 169.0193, 0.001888081, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Kronos: thẩm quyền cao, nhà nước, sự xuất chúng, tầm nhìn vượt trội."
  },
  apollon: {
    elements: [70.29949, 0.0, 0.0, 0.0, 0.0, 138.0533, 0.001672665, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Apollon: mở rộng, kinh doanh, nhiều mối quan hệ, khoa học và sự thành công rộng khắp."
  },
  admetos: {
    elements: [73.62765, 0.0, 0.0, 0.0, 0.0, 351.335, 0.001560782, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Admetos: sự dừng lại, tập trung cực độ, nguyên liệu thô, sức mạnh chịu đựng."
  },
  vulkanus: {
    elements: [77.25568, 0.0, 0.0, 0.0, 0.0, 55.8983, 0.001453195, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Vulkanus: sức mạnh khổng lồ, sức ép lớn, sự thay đổi cưỡng bức, quyền lực vật chất."
  },
  poseidon: {
    elements: [83.66907, 0.0, 0.0, 0.0, 0.0, 165.5163, 0.001289517, 0],
    geocentric: false,
    equinoxJd: J1900,
    meaning: "Poseidon: tinh thần, trí tuệ trong sáng, lý tưởng, ảnh hưởng văn hoá và truyền thông."
  },
  isisTranspluto: {
    elements: [77.775, 0.3, 0.0, 0.0, 0.7, 0.0, 0.001440568, 0],
    geocentric: false,
    // seorbel.txt: epoch phần tử 2368547.66 (1772) nhưng equinox là 2431456.5 (1945)
    equinoxJd: 2431456.5,
    epochJd: 2368547.66,
    meaning: "Isis-Transpluto (Transpluto): sự hoàn thiện, hy sinh vì lý tưởng, tình yêu vũ trụ (hành tinh giả định, phần tử của Strubell 1952)."
  },
  selena: {
    elements: [0.05280098949, 0.0, 0.0, 0.0, 0.0, 242.2205555, 0.1406900, 0],
    geocentric: true,
    // seorbel.txt: equinox = "JDATE" (equinox của ngày) nên không tiến động
    equinoxJd: 0,
    epochJd: J2000,
    meaning: "Selena (White Moon): điểm ánh sáng/ân sủng, phần hoà bình và lý tưởng trong bản đồ (định nghĩa khác nhau giữa các trường phái)."
  }
};

/* ------------------------------------------------------------ tính vị trí */

const earthHeliocentricVector = (jd: number): Vec3 => {
  const time = MakeTime(new Date((jd - 2440587.5) * 86400000));
  const vector = HelioVector(Body.Earth, time);
  return [vector.x, vector.y, vector.z];
};

/** Vị trí địa tâm (xích đạo J2000, AU) của một thiên thể nhật tâm, có hiệu chỉnh thời gian ánh sáng. */
const geocentricFromHeliocentric = (
  positionOf: (jd: number) => Vec3,
  jd: number
): { vector: Vec3; lightTimeDays: number } => {
  const earth = earthHeliocentricVector(jd);
  let vector = subtract(positionOf(jd), earth);
  const lightTime = length(vector) / LIGHT_DAY_AU;
  vector = subtract(positionOf(jd - lightTime), earth);
  return { vector, lightTimeDays: lightTime };
};

/** (xuất cho kiểm thử) Vị trí nhật tâm hệ hoàng đạo J2000 của tiểu hành tinh, AU. */
export const asteroidHeliocentricJ2000 = (name: string, jd: number): Vec3 => asteroidEclipticJ2000(name, jd);

/** Vị trí nhật tâm tiểu hành tinh trong hệ hoàng đạo J2000 (nội bộ, dùng để kiểm chứng). */
const asteroidEclipticJ2000 = (name: string, jd: number): Vec3 => {
  const windows = ASTEROID_WINDOWS[name];
  const index = Math.max(0, Math.min(windows.length - 2, Math.floor(((jd - WINDOW_CENTERS[0]) / (WINDOW_CENTERS[1] - WINDOW_CENTERS[0])))));
  const lowIndex = Math.max(0, Math.min(windows.length - 2, index));
  const highIndex = lowIndex + 1;
  const span = WINDOW_CENTERS[highIndex] - WINDOW_CENTERS[lowIndex];
  const frac = Math.max(0, Math.min(1, (jd - WINDOW_CENTERS[lowIndex]) / span));

  const toElements = (window: ElementWindow, center: number): KeplerElements => ({
    a: window[0],
    e: window[1],
    i: window[2],
    node: window[3],
    peri: window[4],
    meanAnomaly: window[5],
    meanMotion: window[6],
    meanMotionRate: window[7],
    epoch: center
  });

  const low = keplerPosition(toElements(windows[lowIndex], WINDOW_CENTERS[lowIndex]), jd);
  const high = keplerPosition(toElements(windows[highIndex], WINDOW_CENTERS[highIndex]), jd);

  return [low[0] + (high[0] - low[0]) * frac, low[1] + (high[1] - low[1]) * frac, low[2] + (high[2] - low[2]) * frac];
};

const fictitiousPosition = (name: string, jd: number): { vector: Vec3; geocentric: boolean } => {
  const entry = FICTITIOUS[name];
  const elements: KeplerElements = {
    a: entry.elements[0],
    e: entry.elements[1],
    i: entry.elements[2],
    node: entry.elements[3],
    peri: entry.elements[4],
    meanAnomaly: entry.elements[5],
    meanMotion: gaussianMeanMotion(entry.elements[0]),
    meanMotionRate: entry.elements[7],
    epoch: entry.epochJd ?? entry.equinoxJd
  };
  const position = keplerPosition(elements, jd);
  if (!entry.equinoxJd) return { vector: rotateX(position, obliquityAt(new Date((jd - 2440587.5) * 86400000))), geocentric: entry.geocentric };
  const equatorial = equinoxEclipticToJ2000(position, entry.equinoxJd);
  return { vector: equatorial, geocentric: entry.geocentric };
};

const fieldObjectPosition = (name: string, jd: number): Vec3 => eclipticToEquatorialJ2000(fieldObjectEclipticJ2000(name, jd));

/** Vị trí nhật tâm thiên thể xa trong hệ hoàng đạo J2000. */
const fieldObjectEclipticJ2000 = (name: string, jd: number): Vec3 => {
  const window = FIELDS_OBJECTS[name];
  return (
    keplerPosition(
      {
        a: window[0],
        e: window[1],
        i: window[2],
        node: window[3],
        peri: window[4],
        meanAnomaly: window[5],
        meanMotion: window[6],
        meanMotionRate: window[7],
        epoch: 2461200.5
      },
      jd
    )
  );
};

/* ------------------------------------------------------------ giao điểm & Lilith */

/** Kinh độ Bắc giao điểm trung bình (mean node) trong hệ hoàng đạo của ngày. */
export const meanNodeLongitude = (date: Date) => {
  const T = julianCenturies(date);
  const omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
  const { deltaPsi } = nutation(date);
  return normalizeDegree(omega + deltaPsi);
};

/** Kinh độ Bắc giao điểm thật (true node) — giao tuyến mặt phẳng quỹ đạo tức thời của Mặt Trăng. */
export const trueNodeLongitude = (date: Date, step = 0.02) => {
  const jd = julianDay(date);
  const moonVector = (value: number): Vec3 => {
    const time = MakeTime(new Date((value - 2440587.5) * 86400000));
    const moon = GeoMoon(time);
    return [moon.x, moon.y, moon.z];
  };

  const before = moonVector(jd - step);
  const after = moonVector(jd + step);
  const position = moonVector(jd);
  const velocity: Vec3 = [
    (after[0] - before[0]) / (2 * step),
    (after[1] - before[1]) / (2 * step),
    (after[2] - before[2]) / (2 * step)
  ];

  const normal = cross(position, velocity);
  // Đổi vector mô men động lượng sang hệ hoàng đạo J2000 rồi lấy giao tuyến với mặt phẳng hoàng đạo.
  const normalEcliptic = rotateX(normal, -EARTH_OBLIQUITY_J2000);
  const nodeEcliptic: Vec3 = [-normalEcliptic[1], normalEcliptic[0], 0];
  const directed: Vec3 = nodeEcliptic[2] < 0 ? [-nodeEcliptic[0], -nodeEcliptic[1], -nodeEcliptic[2]] : nodeEcliptic;
  const nodeEQJ = rotateX(directed, EARTH_OBLIQUITY_J2000);
  const result = vectorToEclipticLongitude(nodeEQJ, date);
  return normalizeDegree(result.longitude);
};

/** Lilith trung bình (mean Black Moon): địa tâm của điểm viễn địa Mặt Trăng. */
export const meanLilithLongitude = (date: Date) => {
  const T = julianCenturies(date);
  const meanLongitude = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + (T * T * T) / 538841 - (T * T * T * T) / 65194000;
  const meanAnomaly = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699 - (T * T * T * T) / 14712000;
  const { deltaPsi } = nutation(date);
  return normalizeDegree(meanLongitude - meanAnomaly + 180 + deltaPsi);
};

/* ------------------------------------------------------------------ danh mục */

export type ExtraPointKind = "node" | "asteroid" | "tno" | "hypothetical" | "blackmoon";

export type ExtraPointMeta = {
  key: string;
  label: string;
  kind: ExtraPointKind;
  color: string;
  /** Vòng quay: true nếu chuyển động rất chậm, để UI hiển thị đúng. */
  slow?: boolean;
  meaning: string;
};

export const EXTRA_POINTS: ExtraPointMeta[] = [
  {
    key: "trueNode",
    label: "Bắc giao điểm (thật)",
    kind: "node",
    color: "#a3e635",
    meaning: "Hướng phát triển trong đời này; bài học cần bước tới, nơi năng lượng mới được mở ra."
  },
  {
    key: "meanNode",
    label: "Bắc giao điểm (trung bình)",
    kind: "node",
    color: "#84cc16",
    slow: true,
    meaning: "Như trên nhưng theo chuyển động trung bình — ổn định hơn, thường dùng trong chiêm tinh Vệ Đà (Rahu)."
  },
  {
    key: "southNode",
    label: "Nam giao điểm",
    kind: "node",
    color: "#fda4af",
    slow: true,
    meaning: "Vốn quen thuộc từ quá khứ; kỹ năng có sẵn nhưng dễ thành vùng an toàn cần vượt qua (Ketu trong Vệ Đà)."
  },
  {
    key: "lilith",
    label: "Lilith (Black Moon)",
    kind: "blackmoon",
    color: "#c084fc",
    slow: true,
    meaning: "Phần bị kìm nén, khao khát nguyên thuỷ, nơi ta từ chối thoả hiệp; cũng là chủ đề về giới hạn và tự do."
  },
  {
    key: "chiron",
    label: "Chiron",
    kind: "asteroid",
    color: "#f0abfc",
    slow: true,
    meaning: "Vết thương không lành hẳn và con đường chữa lành; nơi bạn trở thành người thầy cho người khác."
  },
  {
    key: "ceres",
    label: "Ceres",
    kind: "asteroid",
    color: "#86efac",
    slow: true,
    meaning: "Chăm sóc, nuôi dưỡng, mùa vụ, chu kỳ no đủ và mất mát; quan hệ mẹ - con."
  },
  {
    key: "pallas",
    label: "Pallas",
    kind: "asteroid",
    color: "#7dd3fc",
    slow: true,
    meaning: "Trí tuệ chiến lược, công bằng, sáng tạo có kỹ thuật; cách xử lý xung đột bằng lý lẽ."
  },
  {
    key: "juno",
    label: "Juno",
    kind: "asteroid",
    color: "#fbcfe8",
    slow: true,
    meaning: "Hôn nhân, giao ước, sự trung thành; điều bạn cần ở một người bạn đời."
  },
  {
    key: "vesta",
    label: "Vesta",
    kind: "asteroid",
    color: "#fde047",
    slow: true,
    meaning: "Sự tận hiến, lửa thiêng, công việc thiêng liêng; nơi tập trung năng lượng và giữ gìn điều quý."
  },
  {
    key: "eris",
    label: "Eris",
    kind: "tno",
    color: "#e879f9",
    slow: true,
    meaning: "Xáo trộn, tranh chấp để lộ ra sự thật bị che; tinh thần bất phục tùng (thế hệ 1926-2044)."
  },
  {
    key: "sedna",
    label: "Sedna",
    kind: "tno",
    color: "#60a5fa",
    slow: true,
    meaning: "Vùng xa xôi, ký ức sâu, sự hy sinh và trở về từ nơi tăm tối; chủ đề sinh tồn và tái tạo."
  }
];

const FICTITIOUS_CATALOG: ExtraPointMeta[] = [
  { key: "cupido", label: "Cupido", kind: "hypothetical", color: "#fca5a5", slow: true, meaning: FICTITIOUS.cupido.meaning },
  { key: "hades", label: "Hades", kind: "hypothetical", color: "#a1a1aa", slow: true, meaning: FICTITIOUS.hades.meaning },
  { key: "zeus", label: "Zeus", kind: "hypothetical", color: "#fdba74", slow: true, meaning: FICTITIOUS.zeus.meaning },
  { key: "kronos", label: "Kronos", kind: "hypothetical", color: "#fcd34d", slow: true, meaning: FICTITIOUS.kronos.meaning },
  { key: "apollon", label: "Apollon", kind: "hypothetical", color: "#f9a8d4", slow: true, meaning: FICTITIOUS.apollon.meaning },
  { key: "admetos", label: "Admetos", kind: "hypothetical", color: "#94a3b8", slow: true, meaning: FICTITIOUS.admetos.meaning },
  { key: "vulkanus", label: "Vulkanus", kind: "hypothetical", color: "#f87171", slow: true, meaning: FICTITIOUS.vulkanus.meaning },
  { key: "poseidon", label: "Poseidon", kind: "hypothetical", color: "#67e8f9", slow: true, meaning: FICTITIOUS.poseidon.meaning },
  { key: "isisTranspluto", label: "Isis-Transpluto", kind: "hypothetical", color: "#c4b5fd", slow: true, meaning: FICTITIOUS.isisTranspluto.meaning },
  { key: "selena", label: "Selena (White Moon)", kind: "hypothetical", color: "#e0f2fe", slow: true, meaning: FICTITIOUS.selena.meaning }
];

export const ALL_EXTRA_POINTS = [...EXTRA_POINTS, ...FICTITIOUS_CATALOG];

export const extraPointMeta = (key: string) => ALL_EXTRA_POINTS.find((point) => point.key === key);

export type ExtraPointPosition = {
  key: string;
  label: string;
  kind: ExtraPointKind;
  color: string;
  longitude: number;
  latitude: number;
  meaning: string;
  slow: boolean;
};

/** Kinh độ hoàng đạo (nhiệt đới, biểu kiến, hệ hoàng đạo của ngày) của tất cả điểm ảo. */
export const computeExtraPoints = (utcDate: Date, keys?: string[]): ExtraPointPosition[] => {
  const jd = julianDay(utcDate);
  const wanted = keys ?? ALL_EXTRA_POINTS.map((point) => point.key);
  const results: ExtraPointPosition[] = [];

  for (const key of wanted) {
    const meta = extraPointMeta(key);
    if (!meta) continue;

    if (key === "meanNode" || key === "southNode") {
      const node = meanNodeLongitude(utcDate);
      const longitude = key === "southNode" ? normalizeDegree(node + 180) : node;
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude, latitude: 0, meaning: meta.meaning, slow: true });
      continue;
    }

    if (key === "trueNode") {
      const node = trueNodeLongitude(utcDate);
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude: node, latitude: 0, meaning: meta.meaning, slow: false });
      continue;
    }

    if (key === "lilith") {
      const longitude = meanLilithLongitude(utcDate);
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude, latitude: 0, meaning: meta.meaning, slow: true });
      continue;
    }

    if (ASTEROID_WINDOWS[key]) {
      const { vector } = geocentricFromHeliocentric((value) => eclipticToEquatorialJ2000(asteroidEclipticJ2000(key, value)), jd);
      const { longitude, latitude } = vectorToEclipticLongitude(vector, utcDate);
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude, latitude, meaning: meta.meaning, slow: !!meta.slow });
      continue;
    }

    if (FIELDS_OBJECTS[key]) {
      const { vector } = geocentricFromHeliocentric((value) => fieldObjectPosition(key, value), jd);
      const { longitude, latitude } = vectorToEclipticLongitude(vector, utcDate);
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude, latitude, meaning: meta.meaning, slow: true });
      continue;
    }

    if (FICTITIOUS[key]) {
      const entry = FICTITIOUS[key];
      const positionAt = (value: number) => fictitiousPosition(key, value).vector;
      // Phần tử của seorbel.txt là nhật tâm (trừ Selena/White Moon được đánh dấu "geo").
      const vector = entry.geocentric ? positionAt(jd) : subtract(positionAt(jd), earthHeliocentricVector(jd));
      const { longitude, latitude } = vectorToEclipticLongitude(vector, utcDate);
      results.push({ key, label: meta.label, kind: meta.kind, color: meta.color, longitude, latitude, meaning: meta.meaning, slow: true });
      continue;
    }
  }

  return results;
};
