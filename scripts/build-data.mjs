/**
 * Sinh dữ liệu bản đồ sao cho app (chạy 1 lần, kết quả được commit vào src/data).
 *
 *   node scripts/build-data.mjs
 *
 * Nguồn dữ liệu: gói npm "d3-celestial" (Olaf Frohn, MIT) lấy từ npm registry,
 * giải nén vào .cache/ (không commit). Gồm:
 *   data/stars.6.json            - catalogue Hipparcos tới cấp sao 6 (~5000 sao, J2000)
 *   data/starnames.json          - tên riêng / Bayer / HIP của sao
 *   data/constellations.lines.json - đường nối các chòm sao
 *   data/constellations.json     - tên 88 chòm sao (Latin + nhiều ngôn ngữ)
 *   data/messier.json            - 110 thiên thể Messier
 *   data/dsos.bright.json        - thiên thể sáng có tên riêng (NGC, Magellan...)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cacheDir = path.join(root, ".cache");
const outDir = path.join(root, "src", "data");

/** Tên tiếng Việt của 88 chòm sao (theo cách gọi phổ biến trong tài liệu tiếng Việt). */
const VI_NAMES = {
  And: "Tiên Nữ",
  Ant: "Máy Không Khí",
  Aps: "Chim Thiên Đường",
  Aqr: "Bảo Bình",
  Aql: "Đại Bàng",
  Ara: "Thiên Đàn",
  Ari: "Bạch Dương",
  Aur: "Ngự Phu",
  Boo: "Mục Phu",
  Cae: "Cái Đục",
  Cam: "Lộc Miêu",
  Cnc: "Cự Giải",
  CVn: "Lạp Khuyển",
  CMa: "Đại Khuyển",
  CMi: "Tiểu Khuyển",
  Cap: "Ma Kết",
  Car: "Thuyền Để",
  Cas: "Tiên Hậu",
  Cen: "Bán Nhân Mã",
  Cep: "Tiên Vương",
  Cet: "Kình Ngư",
  Cha: "Tắc Kè Hoa",
  Cir: "Viên Quy",
  Col: "Thiên Cáp",
  Com: "Hậu Phát",
  CrA: "Nam Miện",
  CrB: "Bắc Miện",
  Crv: "Ô Nha",
  Crt: "Cự Tước",
  Cru: "Nam Thập Tự",
  Cyg: "Thiên Nga",
  Del: "Hải Đồn",
  Dor: "Kiếm Ngư",
  Dra: "Thiên Long",
  Equ: "Tiểu Mã",
  Eri: "Ba Giang",
  For: "Thiên Lô",
  Gem: "Song Tử",
  Gru: "Thiên Hạc",
  Her: "Vũ Tiên",
  Hor: "Thời Chung",
  Hya: "Trường Xà",
  Hyi: "Thủy Xà",
  Ind: "Ấn Đệ An",
  Lac: "Hiết Hổ",
  Leo: "Sư Tử",
  LMi: "Tiểu Sư",
  Lep: "Thiên Thố",
  Lib: "Thiên Bình",
  Lup: "Sài Lang",
  Lyn: "Thiên Miêu",
  Lyr: "Thiên Cầm",
  Men: "Sơn Án",
  Mic: "Hiển Vi Kính",
  Mon: "Kỳ Lân",
  Mus: "Thương Dăng",
  Nor: "Củ Xích",
  Oct: "Nam Cực",
  Oph: "Xà Phu",
  Ori: "Lạp Hộ",
  Pav: "Khổng Tước",
  Peg: "Phi Mã",
  Per: "Anh Tiên",
  Phe: "Phượng Hoàng",
  Pic: "Giá Vẽ",
  Psc: "Song Ngư",
  PsA: "Nam Ngư",
  Pup: "Thuyền Vĩ",
  Pyx: "La Bàn",
  Ret: "Võng Cổ",
  Sge: "Thiên Tiễn",
  Sgr: "Nhân Mã",
  Sco: "Thiên Hạt",
  Scl: "Ngọc Phu",
  Sct: "Thuẫn Bài",
  Ser: "Cự Xà",
  Sex: "Lục Phân Nghi",
  Tau: "Kim Ngưu",
  Tel: "Viễn Vọng Kính",
  Tri: "Tam Giác",
  TrA: "Nam Tam Giác",
  Tuc: "Cự Khuyết",
  UMa: "Đại Hùng",
  UMi: "Tiểu Hùng",
  Vel: "Thuyền Phàm",
  Vir: "Thất Nữ",
  Vol: "Phi Ngư",
  Vul: "Hồ Ly"
};

/** Tên tiếng Việt cho thiên thể Messier / NGC nổi tiếng. */
const DSO_VI = {
  M1: "Tinh vân Con Cua",
  M6: "Cụm sao Bướm",
  M7: "Cụm sao Ptolemy",
  M8: "Tinh vân Đầm Phá",
  M11: "Cụm sao Vịt Trời",
  M13: "Cụm sao cầu Hercules",
  M16: "Tinh vân Đại Bàng",
  M17: "Tinh vân Thiên Nga (Omega)",
  M20: "Tinh vân Chẻ Ba",
  M24: "Đám mây sao Nhân Mã",
  M27: "Tinh vân Quả Tạ",
  M31: "Thiên hà Tiên Nữ",
  M33: "Thiên hà Tam Giác",
  M42: "Tinh vân Lạp Hộ",
  M44: "Cụm sao Tổ Ong",
  M45: "Chòm Tua Rua (Pleiades)",
  M51: "Thiên hà Xoáy Nước",
  M57: "Tinh vân Vành Khuyên",
  M81: "Thiên hà Bode",
  M82: "Thiên hà Xì Gà",
  M104: "Thiên hà Sombrero",
  "47 Tuc": "Cụm sao cầu 47 Tucanae",
  "C 41": "Cụm sao Hyades",
  "Cr 39": "Cụm sao Alpha Persei",
  "Cr 256": "Cụm sao Coma Berenices",
  "Cr 399": "Móc Áo",
  "Mel 25": "Cụm sao Hyades",
  "Mel 20": "Cụm sao Alpha Persei",
  "Mel 111": "Cụm sao Coma Berenices",
  "GalCtr": "Trung tâm Ngân Hà (Nhân Mã A*)",
  "IC 2602": "Cụm sao Theta Carinae", 
  "NGC 869": "Cụm Đôi Perseus (h & χ Per)",
  LMC: "Đám Mây Magellan Lớn",
  SMC: "Đám Mây Magellan Nhỏ",
  "NGC 5139": "Cụm sao cầu Omega Centauri",
  "NGC 3372": "Tinh vân Carina",
  "NGC 7000": "Tinh vân Bắc Mỹ",
  "NGC 869": "Cụm sao Đôi Perseus",
  "NGC 2232": "Cụm sao Kỳ Lân"
};

/** Mã loại thiên thể -> nhãn tiếng Việt. */
const DSO_TYPES = {
  gc: "Cụm sao cầu",
  oc: "Cụm sao mở",
  cl: "Cụm sao",
  s: "Thiên hà xoắn ốc",
  sd: "Thiên hà xoắn ốc lùn",
  e: "Thiên hà elip",
  i: "Thiên hà bất định",
  gg: "Thiên hà",
  gxy: "Thiên hà",
  sfr: "Vùng tạo sao",
  en: "Tinh vân phát xạ",
  rn: "Tinh vân phản xạ",
  bn: "Tinh vân tối",
  neb: "Tinh vân",
  pn: "Tinh vân hành tinh",
  snr: "Tàn dư siêu tân tinh",
  pos: "Vùng sao (không phải vật thể đơn)",
  "oc+neb": "Cụm sao mở kèm tinh vân"
};

const dsoTypeLabel = (code) => DSO_TYPES[code] || "Thiên thể sâu";

function ensureSourceData() {
  const marker = path.join(cacheDir, "d3-celestial", "package", "data", "stars.6.json");
  if (fs.existsSync(marker)) return path.dirname(marker);

  fs.mkdirSync(cacheDir, { recursive: true });
  console.log("· Đang tải d3-celestial từ npm registry...");
  const tarball = execFileSync("npm", ["pack", "d3-celestial", "--silent", "--pack-destination", cacheDir], {
    cwd: cacheDir,
    encoding: "utf8"
  })
    .trim()
    .split("\n")
    .pop();

  const target = path.join(cacheDir, "d3-celestial");
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xzf", path.join(cacheDir, tarball), "-C", target], { stdio: "inherit" });
  fs.rmSync(path.join(cacheDir, tarball), { force: true });

  if (!fs.existsSync(marker)) throw new Error("Không giải nén được dữ liệu d3-celestial.");
  return path.dirname(marker);
}

const readJson = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
const round = (value, digits) => Number(value.toFixed(digits));

const wrap180 = (lon) => {
  let value = ((lon + 180) % 360 + 360) % 360;
  value -= 180;
  return value;
};

const main = () => {
  const dataDir = ensureSourceData();
  fs.mkdirSync(outDir, { recursive: true });

  /* ------------------------------------------------------------------ sao */
  const starSource = readJson(dataDir, "stars.6.json");
  const starNames = readJson(dataDir, "starnames.json");

  const constellations = readJson(dataDir, "constellations.json").features;
  // Serpens xuất hiện hai lần (Caput/Cauda) trong dữ liệu gốc.
  const constellationList = [...new Set(constellations.map((feature) => feature.id))];
  const constellationIndex = new Map(constellationList.map((id, index) => [id, index]));

  const labels = [];
  const labelIndex = new Map(); // Khoá: "HIP <id>" -> vị trí trong mảng labels
  const stars = [];

  for (const feature of starSource.features) {
    const hip = String(feature.id);
    const meta = starNames[hip];
    const mag = feature.properties?.mag;
    const bv = Number(feature.properties?.bv);
    if (typeof mag !== "number") continue;

    let labelIdx = -1;
    const proper = (meta?.name || "").trim();
    const bayer = (meta?.bayer || "").trim();
    const constellation = (meta?.c || "").trim();
    const notable = Boolean(proper) || Boolean(bayer && constellation);

    if (notable) {
      const key = `${hip}`;
      if (!labelIndex.has(key)) {
        const parts = [];
        if (proper) parts.push(proper);
        if (bayer && constellation) parts.push(`${bayer} ${constellation}`);
        parts.push(`HIP ${hip}`);
        labelIndex.set(key, labels.length);
        labels.push(parts);
      }
      labelIdx = labelIndex.get(key);
    }

    stars.push([
      round(feature.geometry.coordinates[0], 4),
      round(feature.geometry.coordinates[1], 4),
      round(mag, 2),
      Number.isFinite(bv) ? round(bv, 2) : 0,
      labelIdx,
      constellationIndex.has(constellation) ? constellationIndex.get(constellation) : -1
    ]);
  }

  stars.sort((a, b) => a[2] - b[2]);
  fs.writeFileSync(
    path.join(outDir, "stars.json"),
    JSON.stringify({ constellations: constellationList, labels, stars })
  );

  /* ------------------------------------------------------------ chòm sao */
  const lineSource = readJson(dataDir, "constellations.lines.json");
  const lines = {};

  for (const feature of lineSource.features) {
    const id = feature.id;
    // Serpens được chia làm hai phần (Caput/Cauda) -> phải gộp lại.
    if (!lines[id]) lines[id] = [];
    const multi = feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [feature.geometry.coordinates];

    for (const line of multi) {
      const flat = [];
      for (const [ra, dec] of line) {
        flat.push(round(ra, 3), round(dec, 3));
      }
      if (flat.length >= 4) lines[id].push(flat);
    }
  }

  // Vị trí đặt tên chòm sao = trung bình vector của các điểm trên đường nối.
  const meta = constellationList.map((id) => {
    const latin = constellations.find((item) => item.id === id)?.properties?.name || id;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const line of lines[id] || []) {
      for (let i = 0; i < line.length; i += 2) {
        const ra = (line[i] * Math.PI) / 180;
        const dec = (line[i + 1] * Math.PI) / 180;
        x += Math.cos(dec) * Math.cos(ra);
        y += Math.cos(dec) * Math.sin(ra);
        z += Math.sin(dec);
      }
    }
    const len = Math.hypot(x, y, z) || 1;
    const raCenter = wrap180((Math.atan2(y / len, x / len) * 180) / Math.PI);
    const decCenter = (Math.asin(z / len) * 180) / Math.PI;

    return {
      abbr: id,
      latin,
      vi: VI_NAMES[id] || latin,
      ra: round(raCenter, 2),
      dec: round(decCenter, 2),
      rank: Number(constellations.find((item) => item.id === id)?.properties?.rank || 3)
    };
  });

  fs.writeFileSync(path.join(outDir, "constellations.json"), JSON.stringify({ meta, lines }));

  /* -------------------------------------------------------- thiên thể sâu */
  // "M 31" (dsos.bright) và "M31" (messier.json) là cùng một thiên thể.
  const normalizeDesig = (value) => (value || "").trim().replace(/^M\s+(\d+)$/i, "M$1");
  const dsoMap = new Map();
  const pushDso = (id, properties, coordinates) => {
    const [ra, dec] = coordinates;
    const mag = typeof properties.mag === "number" ? properties.mag : null;
    const desig = normalizeDesig(properties.desig);
    const rawId = normalizeDesig(id);
    const messier = /^M\d+$/.test(rawId);
    const label = messier ? rawId : desig || rawId;
    const vi = DSO_VI[rawId] || DSO_VI[desig] || "";
    const key = messier ? rawId : desig || rawId;
    if (!label || dsoMap.has(key)) return;
    dsoMap.set(key, {
      id: label,
      alt: messier && desig ? desig : "",
      vi,
      en: properties.alt || "",
      type: properties.type || "",
      typeVi: dsoTypeLabel(properties.type),
      mag,
      ra: round(ra, 3),
      dec: round(dec, 3)
    });
  };

  for (const feature of readJson(dataDir, "messier.json").features) {
    pushDso(feature.id, feature.properties || {}, feature.geometry.coordinates);
  }
  for (const feature of readJson(dataDir, "dsos.bright.json").features) {
    pushDso(feature.id, feature.properties || {}, feature.geometry.coordinates);
  }

  const deepSky = [...dsoMap.values()]
    .filter((item) => item.mag === null || item.mag <= 9.5)
    .sort((a, b) => (a.mag ?? 99) - (b.mag ?? 99));

  fs.writeFileSync(path.join(outDir, "deepsky.json"), JSON.stringify({ objects: deepSky }));

  console.log(
    `✔ src/data: ${stars.length} sao · ${labels.length} định danh · ${meta.length} chòm sao · ${deepSky.length} thiên thể sâu`
  );
};

main();
