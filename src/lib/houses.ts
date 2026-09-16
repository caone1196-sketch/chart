/**
 * Các hệ thống nhà chiêm tinh.
 *
 * Công thức được port trực tiếp từ Swiss Ephemeris (swehouse.c của Dieter Koch & Alois Treindl,
 * giấy phép AGPL/khả dụng kép) và được kiểm chứng tự động bằng tests/scripts so với bản tham chiếu
 * sinh từ chính mã C (xem tests/fixtures/houses-swisseph.json và scripts/test-houses.mjs).
 */

const DEG = Math.PI / 180;
const EPS = 1e-12;

const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const tand = (x: number) => Math.tan(x * DEG);
const asind = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) / DEG;
const acosd = (x: number) => Math.acos(Math.max(-1, Math.min(1, x))) / DEG;
const atand = (x: number) => Math.atan(x) / DEG;

export const norm360 = (value: number) => ((value % 360) + 360) % 360;

/** Hiệu số góc trong khoảng [-180, 180) — giống swe_difdeg2n của Swiss Ephemeris. */
export const diffDeg = (a: number, b: number) => {
  const d = norm360(a - b);
  return d >= 180 ? d - 360 : d;
};

export type HouseSystemId =
  | "wholeSign"
  | "equal"
  | "equalMC"
  | "porphyry"
  | "placidus"
  | "koch"
  | "campanus"
  | "regiomontanus"
  | "alcabitius"
  | "topocentric"
  | "morinus"
  | "sripati";

export type HouseSystemInfo = {
  id: HouseSystemId;
  label: string;
  latin: string;
  short: string;
  area: string;
  idea: string;
  bestFor: string;
  caution: string;
};

export const HOUSE_SYSTEMS: HouseSystemInfo[] = [
  {
    id: "wholeSign",
    label: "Toàn cung (Whole Sign)",
    latin: "Signa integra",
    short: "Whole Sign",
    area: "Hy Lạp - La Mã cổ đại, phục hưng Hellenistic",
    idea: "Mỗi cung hoàng đạo là một nhà, bắt đầu từ cung chứa Cung Mọc.",
    bestFor: "Đọc cấu trúc lớn: hành tinh - cung - nhà, chủ đề định mệnh, truyền thống Hellenistic.",
    caution: "Cung Mọc không phải cusp nhà 1 theo nghĩa chia độ; nhà 'rộng' bằng cả cung 30°."
  },
  {
    id: "equal",
    label: "Chia bằng nhau từ Cung Mọc",
    latin: "Aequales",
    short: "Equal (AC)",
    area: "Cổ đại, phổ biến trong Vệ Đà",
    idea: "Cung Mọc là cusp nhà 1, mỗi nhà đúng 30° theo chiều tăng kinh độ.",
    bestFor: "Khi giờ sinh chính xác, đọc sức mạnh cung Mọc; dùng trong Jyotish (Bhava).",
    caution: "Thiên Đỉnh thường không trùng cusp nhà 10."
  },
  {
    id: "equalMC",
    label: "Chia bằng nhau từ Thiên Đỉnh",
    latin: "Aequales a Medii Caeli",
    short: "Equal (MC)",
    area: "Truyền thống Trung cổ",
    idea: "Thiên Đỉnh là cusp nhà 10, các cusp cách nhau 30° theo kinh độ.",
    bestFor: "Nhấn mạnh sự nghiệp vì MC luôn nằm đúng đỉnh nhà 10.",
    caution: "Cung Mọc lệch khỏi cusp nhà 1 ở nhiều vĩ độ."
  },
  {
    id: "porphyry",
    label: "Porphyry (ba phần góc phần tư)",
    latin: "Porphyrius",
    short: "Porphyry",
    area: "Porphyry thành Tyre (thế kỷ 3)",
    idea: "Chia mỗi góc phần tư AC-MC thành ba phần bằng nhau theo kinh độ.",
    bestFor: "Giờ sinh gần đúng, đơn giản và dễ kiểm chứng; nền tảng của nhiều hệ sau này.",
    caution: "Không phản ánh chuyển động thực của bầu trời như Placidus."
  },
  {
    id: "placidus",
    label: "Placidus (thời gian bán cung)",
    latin: "Placidus de Titis",
    short: "Placidus",
    area: "Thế kỷ 17, mặc định phổ biến nhất ngày nay",
    idea: "Cusp là quỹ tích của các điểm đi được 1/3, 2/3 thời gian bán cung trong ngày.",
    bestFor: "Đa số trường phái phương Tây hiện đại, tâm lý học, đọc vận hạn theo nhà.",
    caution: "Không xác định trong vòng cực (|vĩ độ| ≥ 90° − ε); phải chuyển sang Porphyry."
  },
  {
    id: "koch",
    label: "Koch (nơi sinh)",
    latin: "Koch - Geburtsortshäuser",
    short: "Koch",
    area: "Walter Koch, thế kỷ 20",
    idea: "Biến thể của Placidus dùng thời gian mọc tính từ Thiên Đỉnh tại nơi sinh.",
    bestFor: "Trường phái Đức, đọc nhấn vào AC - MC và tiềm năng phát triển.",
    caution: "Rất nhạy với sai số giờ sinh; cũng thất bại trong vòng cực."
  },
  {
    id: "campanus",
    label: "Campanus (vòng thẳng đứng)",
    latin: "Campanus Novariensis",
    short: "Campanus",
    area: "Johannes Campanus, thế kỷ 13",
    idea: "Chia vòng thẳng đứng (prime vertical) thành 12 phần bằng nhau từ điểm Đông.",
    bestFor: "Đọc quan hệ giữa bản đồ và vị trí địa lý, chủ đề không gian - vật lý.",
    caution: "Khác biệt lớn với Placidus ở vĩ độ cao."
  },
  {
    id: "regiomontanus",
    label: "Regiomontanus (xích đạo)",
    latin: "Regiomontanus",
    short: "Regiomontanus",
    area: "Johannes Müller, thế kỷ 15",
    idea: "Chia xích đạo thiên cầu thành 12 phần bằng nhau rồi chiếu lên hoàng đạo.",
    bestFor: "Truyền thống Trung cổ - Phục hưng châu Âu, horary kinh điển.",
    caution: "Khác biệt Placidus tăng dần theo vĩ độ."
  },
  {
    id: "alcabitius",
    label: "Alcabitius (bán cung)",
    latin: "Alchabitius",
    short: "Alcabitius",
    area: "Al-Battani / Alchabitius, thế kỷ 10",
    idea: "Chia bán cung ngày của Cung Mọc thành ba phần rồi chiếu lên hoàng đạo.",
    bestFor: "Horary và truyền thống Ả Rập, cách đọc nhà theo thời gian thực.",
    caution: "Ở vĩ độ cao có thể cho nhà rất hẹp; ngoài vòng cực thì app chuyển sang Porphyry."
  },
  {
    id: "topocentric",
    label: "Topocentric (Polich - Page)",
    latin: "Systema topocentricum",
    short: "Topocentric",
    area: "Wendell Polich & Anthony Page, 1971",
    idea: "Placidus điều chỉnh cho vĩ độ và thị sai địa phương thực tế.",
    bestFor: "Bản đồ có vĩ độ cao vừa phải, quan sát địa phương chính xác.",
    caution: "Vẫn suy biến gần vòng cực (app chuyển sang Porphyry ngoài vòng cực); ít tài liệu luận giải."
  },
  {
    id: "morinus",
    label: "Morinus (xích đạo từ MC)",
    latin: "Morinus",
    short: "Morinus",
    area: "Jean-Baptiste Morin, thế kỷ 17",
    idea: "Chia xích đạo thành 12 phần 30° bắt đầu từ MC rồi chiếu lên hoàng đạo.",
    bestFor: "Đọc đối xứng quanh MC; dùng trong một số kỹ thuật tiên đoán.",
    caution: "Cusp nhà 1 không trùng Cung Mọc."
  },
  {
    id: "sripati",
    label: "Sripati (Vệ Đà)",
    latin: "Śrīpati",
    short: "Sripati",
    area: "Sripati, thế kỷ 11, dùng phổ biến trong Jyotish hiện đại",
    idea: "Lấy Porphyry rồi dịch cusp vào giữa mỗi phần (cusp là tâm nhà).",
    bestFor: "Lá số Vệ Đà dùng nhà theo Bhava Chalit.",
    caution: "Cusp không phải điểm bắt đầu của nhà mà là trung tâm."
  }
];

export type HouseSet = {
  system: HouseSystemId;
  ascendant: number;
  midheaven: number;
  vertex: number;
  eastPoint: number;
  cusps: number[];
  note?: string;
};

export const armcToMc = (armc: number, obliquity: number) => {
  const cosE = cosd(obliquity);
  if (Math.abs(armc - 90) > EPS && Math.abs(armc - 270) > EPS) {
    let mc = atand(tand(armc) / cosE);
    if (armc > 90 && armc <= 270) mc = norm360(mc + 180);
    return norm360(mc);
  }
  return Math.abs(armc - 90) <= EPS ? 90 : 270;
};

/** Góc phương vị của điểm hoàng đạo trên đường tròn lớn có "độ cao cực" f, cắt xích đạo tại x1. */
const asc2 = (x: number, f: number, sinE: number, cosE: number) => {
  let ass = -tand(f) * sinE + cosE * cosd(x);
  if (Math.abs(ass) < EPS) ass = 0;

  let sinx = sind(x);
  if (Math.abs(sinx) < EPS) sinx = 0;

  if (sinx === 0) {
    ass = ass < 0 ? -EPS : EPS;
  } else if (ass === 0) {
    ass = sinx < 0 ? -90 : 90;
  } else {
    ass = atand(sinx / ass);
  }

  if (ass < 0) ass = 180 + ass;
  return ass;
};

const asc1 = (x1: number, f: number, sinE: number, cosE: number) => {
  let x = norm360(x1);
  const n = Math.floor(x / 90) + 1;

  if (Math.abs(90 - f) < EPS) return 180;
  if (Math.abs(90 + f) < EPS) return 0;

  let ass: number;
  if (n === 1) ass = asc2(x, f, sinE, cosE);
  else if (n === 2) ass = 180 - asc2(180 - x, -f, sinE, cosE);
  else if (n === 3) ass = 180 + asc2(x - 180, -f, sinE, cosE);
  else ass = 360 - asc2(360 - x, f, sinE, cosE);

  ass = norm360(ass);
  if (Math.abs(ass - 90) < 1e-9) ass = 90;
  if (Math.abs(ass - 180) < 1e-9) ass = 180;
  if (Math.abs(ass - 270) < 1e-9) ass = 270;
  if (Math.abs(ass - 360) < 1e-9) ass = 0;

  x = ass;
  return x;
};

const fillOpposite = (cusps: number[]) => {
  cusps[4] = norm360(cusps[10] + 180);
  cusps[5] = norm360(cusps[11] + 180);
  cusps[6] = norm360(cusps[12] + 180);
  cusps[7] = norm360(cusps[1] + 180);
  cusps[8] = norm360(cusps[2] + 180);
  cusps[9] = norm360(cusps[3] + 180);
};

const porphyryCusps = (cusps: number[], asc: number, mc: number) => {
  const acmc = diffDeg(asc, mc);
  cusps[1] = asc;
  cusps[10] = mc;
  cusps[2] = norm360(asc + (180 - acmc) / 3);
  cusps[3] = norm360(asc + ((180 - acmc) / 3) * 2);
  cusps[11] = norm360(mc + acmc / 3);
  cusps[12] = norm360(mc + (acmc / 3) * 2);
};

/**
 * Tính 12 nhà theo hệ đã chọn.
 * `armc` = xích kinh của Thiên Đỉnh (giờ sao địa phương quy ra độ).
 */
export const computeHouses = (
  system: HouseSystemId,
  armcDeg: number,
  latitude: number,
  obliquity: number
): HouseSet => {
  const armc = norm360(armcDeg);
  const sinE = sind(obliquity);
  const cosE = cosd(obliquity);
  const lat = Math.max(-89.9999, Math.min(89.9999, latitude));
  const tanLat = tand(lat);
  const cusps = new Array(13).fill(0);

  const asc = asc1(armc + 90, lat, sinE, cosE);
  const mc = armcToMc(armc, obliquity);

  // Vertex: điểm hoàng đạo trên vòng thẳng đứng ở phía Tây (công thức Swiss Ephemeris).
  const vertexF = lat >= 0 ? 90 - lat : -90 - lat;
  let vertex = asc1(armc - 90, vertexF, sinE, cosE);
  if (Math.abs(lat) <= obliquity && diffDeg(vertex, mc) > 0) vertex = norm360(vertex + 180);

  // Trong vòng cực, Cung Mọc có thể rơi vào nửa Tây: Swiss Ephemeris đổi AC sang nửa Đông.
  const isPolar = Math.abs(lat) >= 90 - obliquity;
  let ac = asc;
  let mcOut = mc;
  const polarSwap = () => {
    if (diffDeg(ac, mc) < 0) {
      ac = norm360(ac + 180);
      return true;
    }
    return false;
  };

  // Equatorial ascendant (East Point).
  const th2 = norm360(armc + 90);
  let eastPoint: number;
  if (Math.abs(th2 - 90) > EPS && Math.abs(th2 - 270) > EPS) {
    eastPoint = atand(tand(th2) / cosE);
    if (th2 > 90 && th2 <= 270) eastPoint = norm360(eastPoint + 180);
  } else {
    eastPoint = Math.abs(th2 - 90) <= EPS ? 90 : 270;
  }

  cusps[1] = asc;
  cusps[10] = mc;

  let note: string | undefined;
  const inPolar = Math.abs(lat) >= 90 - obliquity;

  switch (system) {
    case "wholeSign": {
      polarSwap();
      cusps[1] = ac - ((((ac % 30) + 30) % 30));
      for (let i = 2; i <= 12; i += 1) cusps[i] = norm360(cusps[1] + (i - 1) * 30);
      break;
    }
    case "equal": {
      polarSwap();
      cusps[1] = ac;
      for (let i = 2; i <= 12; i += 1) cusps[i] = norm360(cusps[1] + (i - 1) * 30);
      break;
    }
    case "equalMC": {
      polarSwap();
      cusps[10] = mc;
      for (let i = 11; i <= 12; i += 1) cusps[i] = norm360(cusps[10] + (i - 10) * 30);
      for (let i = 1; i <= 9; i += 1) cusps[i] = norm360(cusps[10] + (i + 2) * 30);
      break;
    }
    case "porphyry": {
      polarSwap();
      porphyryCusps(cusps, ac, mc);
      break;
    }
    case "campanus": {
      const fh1 = asind(sind(lat) / 2);
      const fh2 = asind((Math.sqrt(3) / 2) * sind(lat));
      const cosLat = cosd(lat);
      let xh1: number;
      let xh2: number;
      if (Math.abs(cosLat) < EPS) {
        xh1 = xh2 = lat > 0 ? 90 : 270;
      } else {
        xh1 = atand(Math.sqrt(3) / cosLat);
        xh2 = atand(1 / Math.sqrt(3) / cosLat);
      }
      cusps[11] = asc1(armc + 90 - xh1, fh1, sinE, cosE);
      cusps[12] = asc1(armc + 90 - xh2, fh2, sinE, cosE);
      cusps[2] = asc1(armc + 90 + xh2, fh2, sinE, cosE);
      cusps[3] = asc1(armc + 90 + xh1, fh1, sinE, cosE);
      if (isPolar && diffDeg(ac, mc) < 0) {
        ac = norm360(ac + 180);
        mcOut = norm360(mc + 180);
        [1, 2, 3, 10, 11, 12].forEach((house) => {
          cusps[house] = norm360(cusps[house] + 180);
        });
      }
      break;
    }
    case "regiomontanus": {
      const fh1 = atand(tanLat * 0.5);
      const fh2 = atand(tanLat * cosd(30));
      cusps[11] = asc1(30 + armc, fh1, sinE, cosE);
      cusps[12] = asc1(60 + armc, fh2, sinE, cosE);
      cusps[2] = asc1(120 + armc, fh2, sinE, cosE);
      cusps[3] = asc1(150 + armc, fh1, sinE, cosE);
      if (isPolar && diffDeg(ac, mc) < 0) {
        ac = norm360(ac + 180);
        mcOut = norm360(mc + 180);
        [1, 2, 3, 10, 11, 12].forEach((house) => {
          cusps[house] = norm360(cusps[house] + 180);
        });
      }
      break;
    }
    case "koch": {
      if (inPolar) {
        note = "Ngoài vòng cực: Koch không xác định, đã chuyển sang Porphyry.";
        polarSwap();
        porphyryCusps(cusps, ac, mc);
        break;
      }
      const sina = Math.max(-1, Math.min(1, (sind(mc) * sinE) / cosd(lat)));
      const cosa = Math.sqrt(Math.max(0, 1 - sina * sina));
      const c = atand(tanLat / cosa);
      const ad3 = asind(sind(c) * sina) / 3;
      cusps[11] = asc1(armc + 30 - 2 * ad3, lat, sinE, cosE);
      cusps[12] = asc1(armc + 60 - ad3, lat, sinE, cosE);
      cusps[2] = asc1(armc + 120 + ad3, lat, sinE, cosE);
      cusps[3] = asc1(armc + 150 + 2 * ad3, lat, sinE, cosE);
      break;
    }
    case "placidus":
    case "topocentric": {
      if (inPolar && system === "placidus") {
        note = "Placidus không xác định ngoài vòng cực, đã chuyển sang Porphyry.";
        polarSwap();
        porphyryCusps(cusps, ac, mc);
        break;
      }
      const a = asind(tanLat * tand(obliquity));
      let fh1: number;
      let fh2: number;

      if (system === "placidus") {
        fh1 = atand(sind(a / 3) / tand(obliquity));
        fh2 = atand(sind((a * 2) / 3) / tand(obliquity));
      } else {
        fh1 = atand(tanLat / 3);
        fh2 = atand((tanLat * 2) / 3);
      }

      const targets: Array<{ house: number; ra: number; factor: number }> = [
        { house: 11, ra: 30, factor: 3 },
        { house: 12, ra: 60, factor: 1.5 },
        { house: 2, ra: 120, factor: 1.5 },
        { house: 3, ra: 150, factor: 3 }
      ];

      if (system === "topocentric") {
        if (inPolar) {
          note = "Ngoài vòng cực: Topocentric không xác định, đã chuyển sang Porphyry.";
          polarSwap();
          porphyryCusps(cusps, ac, mc);
          break;
        }
        cusps[11] = asc1(30 + armc, fh1, sinE, cosE);
        cusps[12] = asc1(60 + armc, fh2, sinE, cosE);
        cusps[2] = asc1(120 + armc, fh2, sinE, cosE);
        cusps[3] = asc1(150 + armc, fh1, sinE, cosE);
        break;
      }

      for (const target of targets) {
        const rectasc = norm360(target.ra + armc);
        let tant = tand(asind(sinE * sind(asc1(rectasc, target.factor === 3 ? fh1 : fh2, sinE, cosE))));

        if (Math.abs(tant) < EPS) {
          cusps[target.house] = rectasc;
          continue;
        }

        let f = atand(sind(asind(tanLat * tant) / target.factor) / tant);
        let cusp = asc1(rectasc, f, sinE, cosE);
        let previous = 0;
        let converged = false;

        for (let iteration = 1; iteration <= 100; iteration += 1) {
          tant = tand(asind(sinE * sind(cusp)));
          if (Math.abs(tant) < EPS) {
            cusp = rectasc;
            converged = true;
            break;
          }
          f = atand(sind(asind(tanLat * tant) / target.factor) / tant);
          cusp = asc1(rectasc, f, sinE, cosE);
          if (iteration > 1 && Math.abs(diffDeg(cusp, previous)) < 1e-9) {
            converged = true;
            break;
          }
          previous = cusp;
        }

        if (!converged) {
          note = "Rất gần vòng cực: Placidus không hội tụ, đã chuyển sang Porphyry.";
          polarSwap();
          porphyryCusps(cusps, ac, mc);
          break;
        }

        cusps[target.house] = cusp;
      }
      break;
    }
    case "alcabitius": {
      if (inPolar) {
        note = "Ngoài vòng cực: Alcabitius không xác định, đã chuyển sang Porphyry.";
        polarSwap();
        porphyryCusps(cusps, ac, mc);
        break;
      }
      polarSwap();
      const dek = asind(sind(asc) * sinE);
      let r = -tanLat * tand(dek);
      r = Math.max(-1, Math.min(1, r));
      const sda = acosd(r);
      const sna = 180 - sda;
      const sd3 = sda / 3;
      const sn3 = sna / 3;
      cusps[11] = asc1(armc + sd3, 0, sinE, cosE);
      cusps[12] = asc1(armc + 2 * sd3, 0, sinE, cosE);
      cusps[2] = asc1(armc + 180 - 2 * sn3, 0, sinE, cosE);
      cusps[3] = asc1(armc + 180 - sn3, 0, sinE, cosE);
      break;
    }
    case "morinus": {
      // Điểm trên xích đạo (armc + n*30) đổi sang toạ độ hoàng đạo (như swe_cotrans).
      polarSwap();
      for (let i = 1; i <= 12; i += 1) {
        let j = i + 10;
        if (j > 12) j -= 12;
        const ra = norm360(armc + i * 30);
        // Chuyển (xích kinh, xích vĩ = 0) sang (kinh độ, vĩ độ) hoàng đạo.
        const lon = (Math.atan2(sind(ra) * cosE, cosd(ra)) * 180) / Math.PI;
        cusps[j] = norm360(lon);
      }
      break;
    }
    case "sripati": {
      polarSwap();
      const acmc = diffDeg(ac, mc);
      const q1 = 180 - acmc;
      const s1 = q1 / 3;
      const s4 = acmc / 3;
      cusps[1] = norm360(ac - s4 * 0.5);
      cusps[2] = norm360(ac + s1 * 0.5);
      cusps[3] = norm360(ac + s1 * 1.5);
      cusps[10] = norm360(mc - s1 * 0.5);
      cusps[11] = norm360(mc + s4 * 0.5);
      cusps[12] = norm360(mc + s4 * 1.5);
      break;
    }
    default: {
      porphyryCusps(cusps, asc, mc);
    }
  }

  fillOpposite(cusps);

  return {
    system,
    ascendant: ac,
    midheaven: mcOut,
    vertex: norm360(vertex),
    eastPoint: norm360(eastPoint),
    cusps: cusps.slice(1, 13).map(norm360),
    note
  };
};

/** Số nhà chứa một kinh độ hoàng đạo (theo dãy cusp đã cho, đi theo chiều tăng kinh độ). */
export const houseOfLongitude = (longitude: number, cusps: number[]) => {
  const lon = norm360(longitude);
  for (let i = 0; i < 12; i += 1) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = norm360(end - start);
    if (norm360(lon - start) < span) return i + 1;
  }
  return 1;
};
