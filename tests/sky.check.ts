/**
 * Kiểm tra mô-đun hiển thị bầu trời (sky-visual + sky-render) — phần "trông thực tế" và "điều khiển dễ".
 *
 *   npm run test:sky
 *
 * Các bất biến:
 *  1. Khúc xạ khí quyển: dương, lớn nhất ở chân trời (≈34′), giảm dần theo độ cao; hàm nghịch đảo khớp lại.
 *  2. Khối khí quyển: 1 ở thiên đỉnh, tăng đơn điệu khi hạ thấp, hữu hạn ở chân trời.
 *  3. Cấp sao suy giảm vì hấp thụ: 0 ở thiên đỉnh và tăng khi xuống gần chân trời.
 *  4. Bảng màu bầu trời đơn điệu theo độ cao Mặt Trời (đêm tối dần → ngày sáng dần).
 *  5. Phép chiếu chân trời: thiên đỉnh ở tâm, chân trời là vòng tròn bán kính 2×scale, hình học đúng.
 *  6. Nghịch đảo phép chiếu khớp vòng tròn với phép chiếu thuận (sai số < 0.5°).
 *  7. Phóng to quanh con trỏ giữ nguyên điểm dưới con trỏ (chế độ bản đồ và chân trời).
 *  8. Vẽ: mỗi sao chỉ xuất hiện một lần trong danh sách bắt sự kiện; toạ độ nằm trong khung.
 *  9. Ngân Hà: sinh tất định, toạ độ hợp lệ, có vùng sáng và vùng tối (rãnh tối).
 * 10. Hình dạng Mặt Trăng: trăng mới → 0%, trăng tròn → 100%, bán nguyệt → 50%.
 * 11. Tra cứu: gõ không dấu vẫn tìm đúng ("bac cuc" → Polaris, "m42" → M42, "nhan ma" → Nhân Mã).
 *
 * Không cần DOM: @napi-rs/canvas chỉ là devDependency và chỉ dùng để render thử.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createCanvas } from "@napi-rs/canvas";
import StarMap from "../src/components/StarMap.tsx";
import {
  HORIZON_ZOOM,
  MAP_ZOOM,
  airmass,
  buildSkyFrame,
  buildSkyTargets,
  clamp,
  eclipticLongitudeOf,
  extinctionMag,
  findSkyTarget,
  formatDec,
  formatRa,
  galacticCoordinatesOf,
  horizonScale,
  makeProjector,
  mapScale,
  moonGeometry,
  phaseName,
  refractedAltitude,
  refractionArcMin,
  refractionDeg,
  skyTone,
  starAppearance,
  starTint,
  terrainMaxDeg,
  toHorizontalSafe,
  trueAltitude,
  wrap180,
  zoomAroundPoint,
  MILKY_WAY_POINTS
} from "../src/lib/sky-visual.ts";
import { createSpriteCache, drawSky, sunMagnitudePenalty } from "../src/lib/sky-render.ts";
import { eclipticPath, galacticToEquatorial, precessFromJ2000 } from "../src/lib/sky.ts";

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

const CASES: Array<{ name: string; lat: number; lon: number; utc: Date }> = [
  { name: "Hà Nội 11/11/1996 00:30", lat: 21.0285, lon: 105.8542, utc: new Date(Date.UTC(1996, 10, 10, 17, 30)) },
  { name: "Sydney 03/03/1990 08:15", lat: -33.87, lon: 151.21, utc: new Date(Date.UTC(1990, 2, 2, 21, 15)) },
  { name: "Tromsø 21/06/1985 12:00", lat: 69.65, lon: 18.96, utc: new Date(Date.UTC(1985, 5, 21, 10, 0)) },
  { name: "Xích đạo 01/01/2000 00:00", lat: 0, lon: 0, utc: new Date(Date.UTC(2000, 0, 1, 0, 0)) }
];

/* --------------------------------------------------- 1. khúc xạ khí quyển */
{
  const atHorizon = refractionArcMin(0);
  if (atHorizon < 28 || atHorizon > 40) fail("khúc xạ", `chân trời phải ≈34′, nhận ${atHorizon.toFixed(1)}′`);
  ok();
  if (refractionArcMin(45) <= 0.8) fail("khúc xạ", `ở 45° còn ${refractionArcMin(45).toFixed(2)}′ (quá nhỏ)`);
  ok();

  let previous = Infinity;
  for (const alt of [-0.5, 0, 1, 2, 5, 10, 20, 45, 70, 89]) {
    const value = refractionArcMin(alt);
    if (!Number.isFinite(value) || value < 0) fail("khúc xạ", `giá trị không hợp lệ ở ${alt}°: ${value}`);
    ok();
    if (value > previous + 1e-6) fail("khúc xạ", `không giảm dần ở ${alt}° (${previous.toFixed(2)}′ → ${value.toFixed(2)}′)`);
    ok();
    previous = value;
  }

  for (const apparent of [-0.3, 0, 0.5, 1, 2, 5, 10, 30, 60]) {
    const back = refractedAltitude(trueAltitude(apparent));
    if (!near(back, apparent, 0.01)) fail("khúc xạ", `nghịch đảo sai ở ${apparent}°: ${back.toFixed(3)}°`);
    ok();
  }
  if (!near(refractionDeg(0), refractionArcMin(0) / 60, 1e-9)) fail("khúc xạ", "refractionDeg không khớp refractionArcMin");
  ok();
}

/* --------------------------------------------------- 2–3. khối khí quyển & hấp thụ */
{
  for (const [alt, expected] of [
    [90, 1],
    [60, 1.154],
    [30, 1.995],
    [10, 5.6],
    [5, 10.3],
    [2, 19.4],
    [1, 26.3]
  ] as Array<[number, number]>) {
    const value = airmass(alt);
    if (!near(value, expected, Math.max(0.06, expected * 0.06))) {
      fail("khối khí quyển", `X(${alt}°) = ${value.toFixed(2)} (Kasten–Young ≈ ${expected})`);
    }
    ok();
  }

  let previous = 0;
  for (const alt of [90, 60, 30, 15, 5, 1, 0]) {
    const value = airmass(alt);
    if (!Number.isFinite(value) || value < previous) fail("khối khí quyển", `X(${alt}°) = ${value} không tăng đơn điệu`);
    ok();
    previous = value;
  }

  if (!near(extinctionMag(90), 0, 1e-9)) fail("hấp thụ", `thiên đỉnh phải mất 0 mag, nhận ${extinctionMag(90)}`);
  ok();
  if (!(extinctionMag(1) > extinctionMag(5) && extinctionMag(5) > extinctionMag(30))) {
    fail("hấp thụ", "hấp thụ phải tăng khi hạ thấp độ cao");
  }
  ok();
  const overhead = starAppearance(2, 1);
  const dimmed = starAppearance(2 + extinctionMag(2), 1);
  if (!(dimmed.radius < overhead.radius)) fail("hấp thụ", "sao gần chân trời phải nhỏ hơn sao cùng cấp ở thiên đỉnh");
  ok();
}

/* --------------------------------------------------- 4. bảng màu bầu trời */
{
  let previousLuminance = -1;
  for (const sunAlt of [-30, -18, -12, -8, -4, 0, 4, 10, 30, 60]) {
    const tone = skyTone(sunAlt);
    const luminance = tone.zenith[0] + tone.zenith[1] + tone.zenith[2];
    if (luminance < previousLuminance - 1e-9) fail("màu trời", `độ sáng thiên đỉnh giảm khi Mặt Trời mọc lên (${sunAlt}°)`);
    ok();
    previousLuminance = luminance;
    if (tone.starFactor < 0 || tone.starFactor > 1) fail("màu trời", `starFactor ngoài [0,1] ở ${sunAlt}°`);
    ok();
  }
  if (skyTone(-30).starFactor !== 1) fail("màu trời", "đêm tối hoàn toàn phải thấy sao hết mức");
  ok();
  if (skyTone(20).starFactor !== 0) fail("màu trời", "ban ngày phải không thấy sao");
  ok();

  if (sunMagnitudePenalty(-18) !== 0) fail("sáng nền", `Mặt Trời −18° phải trừ 0 mag, nhận ${sunMagnitudePenalty(-18)}`);
  ok();
  if (!(sunMagnitudePenalty(-6) < -2 && sunMagnitudePenalty(-6) > -4.6)) fail("sáng nền", "chạng vạng dân sự phải mất 2–4.6 mag sao");
  ok();
  if (!(sunMagnitudePenalty(0) <= sunMagnitudePenalty(-6) && sunMagnitudePenalty(-30) === 0)) {
    fail("sáng nền", "mức trừ cấp sao phải tăng đơn điệu khi trời sáng dần");
  }
  ok();
}

/* --------------------------------------------------- 5–6. phép chiếu */
{
  const width = 1000;
  const height = 600;

  for (const zoom of [0.6, 1, 2.5, 8]) {
    const projector = makeProjector("horizon", { zoom, x: 0, y: 0, centerRa: 0, centerDec: 0 }, width, height, { refract: true });
    const scale = horizonScale(width, height, zoom);
    const zenith = projector.fromHorizontal(90, 0);
    if (!near(zenith.x, width / 2, 1e-6) || !near(zenith.y, height / 2, 1e-6)) fail("chiếu chân trời", `thiên đỉnh không ở tâm (zoom ${zoom})`);
    ok();

    // Chân trời đã nâng lên bởi khúc xạ (~34′) nên bán kính hơi nhỏ hơn 2×scale một chút.
    const horizonRadius = Math.hypot(projector.fromHorizontal(0, 0).x - zenith.x, projector.fromHorizontal(0, 0).y - zenith.y);
    const expectedHorizon = 2 * Math.tan(((90 - refractedAltitude(0)) * Math.PI) / 360) * scale;
    if (!near(horizonRadius, expectedHorizon, Math.max(0.5, scale * 0.002))) {
      fail("chiếu chân trời", `bán kính chân trời ${horizonRadius.toFixed(1)} ≠ ${expectedHorizon.toFixed(1)} (zoom ${zoom})`);
    }
    ok();
    const flat = makeProjector("horizon", { zoom, x: 0, y: 0, centerRa: 0, centerDec: 0 }, width, height, { refract: false });
    const flatRadius = Math.hypot(flat.fromHorizontal(0, 0).x - width / 2, flat.fromHorizontal(0, 0).y - height / 2);
    if (!near(flatRadius, 2 * scale, 0.5)) fail("chiếu chân trời", `không khúc xạ: bán kính chân trời phải = 2×scale (${flatRadius.toFixed(1)})`);
    ok();

    for (const alt of [0, 15, 45, 75, 89]) {
      const radius = Math.hypot(
        projector.fromHorizontal(alt, 0).x - zenith.x,
        projector.fromHorizontal(alt, 0).y - zenith.y
      );
      const expected = 2 * Math.tan(((90 - refractedAltitude(alt)) * Math.PI) / 360) * scale;
      if (!near(radius, expected, 0.5)) fail("chiếu chân trời", `bán kính ở ${alt}° sai: ${radius.toFixed(2)} ≠ ${expected.toFixed(2)}`);
      ok();
    }

    for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const point = projector.fromHorizontal(0, az);
      const expectedAz = ((Math.atan2(point.x - zenith.x, zenith.y - point.y) * 180) / Math.PI + 360) % 360;
      if (!near(expectedAz, az, 0.05)) fail("chiếu chân trời", `phương vị ${az}° chiếu thành ${expectedAz.toFixed(2)}°`);
      ok();
    }

    for (const alt of [0, 5, 20, 45, 70, 89]) {
      for (const az of [12, 100, 250, 333]) {
        const point = projector.fromHorizontal(alt, az);
        const back = projector.inverse(point.x, point.y);
        if (!near(back.alt, alt, 0.05) || !near(back.az, az, 0.05)) {
          fail("chiếu chân trời", `nghịch đảo sai ở alt ${alt}°, az ${az}°: được ${back.alt.toFixed(2)}° / ${back.az.toFixed(2)}°`);
        }
        ok();
      }
    }
  }

  for (const zoom of [1, 2, 6]) {
    const projector = makeProjector("map", { zoom, x: 0, y: 0, centerRa: 40, centerDec: -12 }, width, height);
    const scale = mapScale(width, height, zoom);
    const center = projector.forward({ ra: 40, dec: -12, alt: 0, az: 0 });
    if (!near(center.x, width / 2, 1e-6) || !near(center.y, height / 2, 1e-6)) fail("chiếu bản đồ", `tâm khung sai ở zoom ${zoom}`);
    ok();
    const east = projector.forward({ ra: 40 - 1, dec: -12, alt: 0, az: 0 });
    if (!(east.x > center.x)) fail("chiếu bản đồ", "xích kinh giảm phải nằm về bên phải (đông ở phải)");
    ok();
    const north = projector.forward({ ra: 40, dec: -11, alt: 0, az: 0 });
    if (!(north.y < center.y)) fail("chiếu bản đồ", "xích vĩ tăng phải nằm phía trên");
    ok();
    if (!near(projector.forward({ ra: 41, dec: -12, alt: 0, az: 0 }).x, center.x - scale, 1e-6)) {
      fail("chiếu bản đồ", "1° xích kinh phải bằng đúng một scale");
    }
    ok();
    for (const [ra, dec] of [
      [40, -12],
      [0, 89],
      [359, -89],
      [123.4, 45.6]
    ] as Array<[number, number]>) {
      const point = projector.forward({ ra, dec, alt: 0, az: 0 });
      const back = projector.inverse(point.x, point.y);
      if (!near(wrap180(back.ra - ra), 0, 1e-6) || !near(back.dec, dec, 1e-6)) {
        fail("chiếu bản đồ", `nghịch đảo sai ở (${ra}, ${dec}): (${back.ra.toFixed(3)}, ${back.dec.toFixed(3)})`);
      }
      ok();
    }
  }
}

/* --------------------------------------------------- 7. phóng to quanh con trỏ */
{
  const width = 900;
  const height = 520;
  for (const mode of ["horizon", "map"] as const) {
    const view = { zoom: 1.4, x: 0, y: 0, centerRa: 100, centerDec: 15 };
    const point = { x: 700, y: 120 };
    const options = { refract: mode === "horizon" };
    const before = makeProjector(mode, view, width, height, options).inverse(point.x, point.y);
    const next = zoomAroundPoint(mode, view, point, 1.8, width, height);
    const after = makeProjector(mode, next, width, height, options).inverse(point.x, point.y);
    if (!near(next.zoom, view.zoom * 1.8, 1e-9)) fail("phóng to quanh con trỏ", `${mode}: mức phóng không đúng`);
    ok();
    if (mode === "map") {
      if (!near(wrap180(after.ra - before.ra), 0, 1e-6) || !near(after.dec, before.dec, 1e-6)) {
        fail("phóng to quanh con trỏ", `map: điểm dưới con trỏ bị lệch (${before.ra.toFixed(3)} → ${after.ra.toFixed(3)})`);
      }
      ok();
    } else {
      if (!near(after.alt, before.alt, 1e-6) || !near(wrap180(after.az - before.az), 0, 1e-6)) {
        fail("phóng to quanh con trỏ", `horizon: điểm dưới con trỏ bị lệch (${before.alt.toFixed(3)} → ${after.alt.toFixed(3)})`);
      }
      ok();
    }

    const clampedHigh = zoomAroundPoint(mode, { ...view, zoom: mode === "map" ? MAP_ZOOM.max : HORIZON_ZOOM.max }, point, 4, width, height);
    if (clampedHigh.zoom !== (mode === "map" ? MAP_ZOOM.max : HORIZON_ZOOM.max)) fail("giới hạn phóng", `${mode}: vượt trần phóng đại`);
    ok();
    const clampedLow = zoomAroundPoint(mode, { ...view, zoom: mode === "map" ? MAP_ZOOM.min : HORIZON_ZOOM.min }, point, 0.1, width, height);
    if (clampedLow.zoom !== (mode === "map" ? MAP_ZOOM.min : HORIZON_ZOOM.min)) fail("giới hạn phóng", `${mode}: vượt sàn phóng đại`);
    ok();
  }
}

/* --------------------------------------------------- 8. vẽ & bắt sự kiện */
{
  const width = 900;
  const height = 560;
  for (const item of CASES) {
    const frame = buildSkyFrame(item.utc, item.lat, item.lon);
    if (!Number.isFinite(frame.lstDeg) || !Number.isFinite(frame.obliquity)) fail("khung bầu trời", `${item.name}: LST/obliquity không hữu hạn`);
    ok();
    if (frame.stars.length !== 5044) fail("khung bầu trời", `${item.name}: phải có 5044 sao, nhận ${frame.stars.length}`);
    ok();

    for (const mode of ["horizon", "map"] as const) {
      const canvas = createCanvas(width, height);
      const view = {
        zoom: mode === "map" ? 2 : 1.2,
        x: 0,
        y: 0,
        centerRa: wrap180(frame.lstDeg),
        centerDec: item.lat >= 0 ? 25 : -25
      };
      const result = drawSky({
        ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
        width,
        height,
        mode,
        view,
        frame,
        toggles: {
          lines: true,
          constellationNames: true,
          starNames: true,
          deepSky: true,
          milkyWay: true,
          ecliptic: true,
          planets: true,
          grid: true,
          atmosphere: true,
          ground: true
        },
        selected: null,
        sprites: createSpriteCache(),
        spriteFactory: (spriteWidth, spriteHeight) => createCanvas(spriteWidth, spriteHeight)
      });

      if (!result.hits.length) fail("vẽ", `${item.name}/${mode}: không có vật thể nào để bấm`);
      ok();

      const keys = result.hits.map((hit) => `${hit.kind}:${hit.key}`);
      if (new Set(keys).size !== keys.length) fail("vẽ", `${item.name}/${mode}: có vật thể trùng trong danh sách bắt sự kiện`);
      ok();

      const planets = result.hits.filter((hit) => hit.kind === "planet");
      const starHits = result.hits.filter((hit) => hit.kind === "star");
      if (planets.length < 1) fail("vẽ", `${item.name}/${mode}: không có hành tinh nào bấm được`);
      ok();

      if (mode === "map") {
        // Bản đồ toàn cảnh: mọi hành tinh nằm trong khung đều phải vẽ (10 hành tinh, trừ khi rơi ra ngoài rìa).
        const inside = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"].filter(
          (key) => {
            const planet = frame.planets.find((entry) => entry.key === key);
            if (!planet) return false;
            const point = makeProjector("map", view, width, height).forward(planet);
            return point.x > -50 && point.x < width + 50 && point.y > -50 && point.y < height + 50;
          }
        );
        if (planets.length !== inside.length) {
          fail("vẽ", `${item.name}/map: có ${planets.length} hành tinh nhưng ${inside.length} hành tinh nằm trong khung`);
        }
        ok();
      }

      if (frame.sunAlt < -18 && mode === "map") {
        // Trời tối hoàn toàn: phải vẽ được phần lớn sao tới cấp 5.
        const expected = frame.stars.filter((star) => star.mag <= 4.6).length;
        if (starHits.length < expected * 0.9) fail("vẽ", `${item.name}: chỉ vẽ ${starHits.length}/${expected} sao tới cấp 4.6`);
        ok();
      }
      if (frame.sunAlt > 0 && mode === "horizon") {
        // Ban ngày gần như không thấy sao.
        if (starHits.length > 5) fail("vẽ", `${item.name}: ban ngày vẫn vẽ ${starHits.length} sao`);
        ok();
      }

      for (const hit of result.hits) {
        if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) fail("vẽ", `${item.name}/${mode}: toạ độ không hữu hạn (${hit.kind}:${hit.key})`);
        ok();
      }

      if (mode === "horizon") {
        const belowGround = result.hits.filter((hit) => {
          if (hit.kind !== "star") return false;
          const star = frame.stars[Number(hit.key)];
          return star.alt < terrainMaxDeg(star.az) - 1;
        });
        if (belowGround.length) {
          fail("vẽ", `${item.name}/horizon: ${belowGround.length} sao dưới chân trời lọt vào danh sách bấm`);
        }
        ok();
      }
    }
  }
}

/* --------------------------------------------------- 9. Ngân Hà */
{
  if (MILKY_WAY_POINTS.length < 1500) fail("Ngân Hà", `quá ít điểm: ${MILKY_WAY_POINTS.length}`);
  ok();
  const grains = MILKY_WAY_POINTS.filter((point) => point.grain).length;
  if (grains < 400) fail("Ngân Hà", `quá ít hạt sao phân giải được: ${grains}`);
  ok();

  let brightest = 0;
  let darkest = 1;
  for (const point of MILKY_WAY_POINTS) {
    if (!Number.isFinite(point.ra) || !Number.isFinite(point.dec)) fail("Ngân Hà", "toạ độ không hữu hạn");
    ok();
    if (point.ra < -180 || point.ra > 180) fail("Ngân Hà", `xích kinh ngoài khoảng: ${point.ra}`);
    ok();
    if (point.dec < -90 || point.dec > 90) fail("Ngân Hà", `xích vĩ ngoài khoảng: ${point.dec}`);
    ok();
    if (point.w < 0 || point.w > 4) fail("Ngân Hà", `trọng số ngoài khoảng: ${point.w}`);
    ok();
    brightest = Math.max(brightest, point.w);
    darkest = Math.min(darkest, point.w);
  }
  if (brightest < 1.5) fail("Ngân Hà", "phải có vùng sáng mạnh ở trung tâm thiên hà");
  ok();
  if (darkest > 0.35) fail("Ngân Hà", `rãnh tối (Great Rift) chưa đủ tối: min w = ${darkest.toFixed(2)}`);
  ok();

  // Vùng rãnh tối (l ≈ −6°…82°, |b| < 2.6°) phải tối hơn rõ rệt so với nhánh sáng đối diện (l ≈ −120°…−60°).
  const riftWeights: number[] = [];
  const brightWeights: number[] = [];
  for (const point of MILKY_WAY_POINTS) {
    const { l, b } = galacticCoordinatesOf(point);
    if (Math.abs(b) > 1.5) continue;
    if (l > -6 && l < 82) riftWeights.push(point.w);
    if (l > -130 && l < -60) brightWeights.push(point.w);
  }
  if (riftWeights.length < 20 || brightWeights.length < 20) fail("Ngân Hà", "không đủ điểm để so sánh rãnh tối");
  ok();
  const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  if (mean(riftWeights) > 0.75 * mean(brightWeights)) {
    fail(
      "Ngân Hà",
      `rãnh tối chưa nổi bật: trung bình ${mean(riftWeights).toFixed(2)} so với nhánh sáng ${mean(brightWeights).toFixed(2)}`
    );
  }
  ok();

  // Trung tâm thiên hà (l=0, b=0) phải nằm ở Nhân Mã, gần xích vĩ −29°.
  const center = galacticToEquatorial(0, 0);
  if (!near(center.dec, -28.94, 0.1)) fail("Ngân Hà", `Sgr A* phải ở xích vĩ ≈ −28.94°, nhận ${center.dec.toFixed(2)}°`);
  ok();
  // 17h45m40s = 266.42° ⇒ −93.58° trong khoảng ±180°.
  if (!near(wrap180(center.ra - 266.42), 0, 0.05)) fail("Ngân Hà", `Sgr A* phải ở xích kinh 266.42°, nhận ${(center.ra + 360) % 360}°`);
  ok();
  const cygnus = galacticToEquatorial(80, 0);
  if (!(cygnus.dec > 35 && cygnus.dec < 45)) fail("Ngân Hà", `hướng Thiên Nga phải ở xích vĩ ≈ 40°, nhận ${cygnus.dec.toFixed(2)}°`);
  ok();
}

/* --------------------------------------------------- 10. pha Mặt Trăng */
{
  const cases: Array<[number, number, number]> = [
    [0, 0, 1],
    [45, 0.146, 0.707],
    [90, 0.5, 0],
    [135, 0.854, 0.707],
    [180, 1, 1]
  ];
  for (const [elongation, illumination, terminator] of cases) {
    const geometry = moonGeometry(elongation);
    if (!near(geometry.illumination, illumination, 0.01)) {
      fail("pha Trăng", `ly giác ${elongation}°: độ sáng ${geometry.illumination.toFixed(3)} ≠ ${illumination}`);
    }
    ok();
    if (!near(geometry.terminatorRatio, terminator, 0.01)) {
      fail("pha Trăng", `ly giác ${elongation}°: tỉ lệ phân giới ${geometry.terminatorRatio.toFixed(3)} ≠ ${terminator}`);
    }
    ok();
  }
  if (!near(moonGeometry(180).illumination, 1, 1e-9)) fail("pha Trăng", "trăng tròn phải sáng 100%");
  ok();
  const names = [-160, -90, -45, 0, 45, 90, 160].map((value) => phaseName(value));
  if (names.some((name) => !name)) fail("pha Trăng", "thiếu tên pha");
  ok();
  if (phaseName(0) === phaseName(180)) fail("pha Trăng", "trăng mới và trăng tròn phải khác tên");
  ok();
}

/* --------------------------------------------------- 11. tra cứu */
{
  const targets = buildSkyTargets();
  if (targets.length < 700) fail("tra cứu", `danh mục quá ít: ${targets.length}`);
  ok();

  const expectations: Array<[string, string, string]> = [
    ["bac cuc", "star", "46"],
    ["Bắc Cực", "star", "46"],
    ["polaris", "star", "46"],
    ["m42", "deepsky", "21"],
    ["tinh van lap ho", "deepsky", "21"],
    ["nhan ma", "constellation", "Sgr"],
    ["sao hoa", "planet", "mars"],
    ["hoa tinh", "planet", "mars"],
    ["thien nga", "constellation", "Cyg"],
    ["andromeda", "constellation", "And"],
    ["trung tam ngan ha", "galacticCenter", "galactic"],
    ["thien lang", "star", "0"],
    ["chuc nu", "star", "4"],
    ["tieu hung", "constellation", "UMi"]
  ];
  for (const [query, kind, key] of expectations) {
    const found = findSkyTarget(targets, query);
    if (!found || found.kind !== kind || String(found.key) !== key) {
      fail("tra cứu", `"${query}" → ${found ? `${found.kind}:${found.key}` : "không tìm thấy"} (mong đợi ${kind}:${key})`);
    }
    ok();
  }
  if (findSkyTarget(targets, "zzzzz")) fail("tra cứu", "truy vấn rác phải trả về null");
  ok();
}

/* --------------------------------------------------- 12. định dạng toạ độ */
{
  const expectations: Array<[number, string]> = [
    [0, "00h00m"],
    [15, "01h00m"],
    [266.416, "17h46m"],
    [359.9, "00h00m"],
    [-86.9, "18h12m"]
  ];
  for (const [ra, expected] of expectations) {
    const text = formatRa(ra);
    if (text !== expected) fail("định dạng", `RA ${ra} → ${text} (mong đợi ${expected})`);
    ok();
  }
  const decs: Array<[number, string]> = [
    [0, "+0°00′"],
    [-28.94, "−28°56′"],
    [41.27, "+41°16′"],
    [-89.99, "−89°59′"]
  ];
  for (const [dec, expected] of decs) {
    const text = formatDec(dec);
    if (text !== expected) fail("định dạng", `Dec ${dec} → ${text} (mong đợi ${expected})`);
    ok();
  }
}

/* --------------------------------------------------- 13. công cụ phụ trợ */
{
  const safe = toHorizontalSafe(10, 20, 30, 40);
  if (!Number.isFinite(safe.alt) || !Number.isFinite(safe.az)) fail("phụ trợ", "toHorizontalSafe trả về NaN");
  ok();
  if (!near(clamp(5, 0, 1), 1, 1e-9) || !near(wrap180(190), -170, 1e-9)) fail("phụ trợ", "clamp/wrap180 sai");
  ok();

  const tint = starTint(0.6);
  if (tint.some((channel) => channel < 0 || channel > 255)) fail("phụ trợ", `màu sao ngoài khoảng: ${tint.join(",")}`);
  ok();

  // Hoàng đạo: điểm 0° Bạch Dương và 90° phải đối xứng qua xích đạo.
  const path = eclipticPath(new Date(Date.UTC(2000, 0, 1)));
  const decs = path.map((point) => point.dec);
  const maxDec = Math.max(...decs);
  const minDec = Math.min(...decs);
  if (!near(maxDec, 23.44, 0.05) || !near(minDec, -23.44, 0.05)) {
    fail("phụ trợ", `độ nghiêng hoàng đạo sai: ${minDec.toFixed(2)}° … ${maxDec.toFixed(2)}°`);
  }
  ok();

  // Kinh độ hoàng đạo của điểm xuân phân phải là 0°, của điểm thu phân là 180°.
  const vernal = eclipticLongitudeOf(0, 0, 23.4392911);
  if (!near(vernal, 0, 1e-6)) fail("phụ trợ", `điểm xuân phân phải ở 0°, nhận ${vernal}`);
  ok();
  const autumnal = eclipticLongitudeOf(180, 0, 23.4392911);
  if (!near(autumnal, 180, 1e-6)) fail("phụ trợ", `điểm thu phân phải ở 180°, nhận ${autumnal}`);
  ok();

  // Tuế sai: J2000 → J2000 không đổi.
  const fixed = precessFromJ2000(83.82, -5.39, new Date(Date.UTC(2000, 0, 1, 12)));
  if (!near(fixed.ra, 83.82, 0.02) || !near(fixed.dec, -5.39, 0.02)) fail("phụ trợ", "precessFromJ2000 không giữ nguyên ở J2000");
  ok();
}

/* --------------------------------------------------- 14. dựng giao diện (render) */
{
  const html = renderToString(
    createElement(StarMap, {
      latitude: 21.0285,
      longitude: 105.8542,
      placeLabel: "Hà Nội, Việt Nam",
      chart: null,
      onAskAbout: () => {}
    })
  );

  const required = [
    "Bản đồ sao thực tế",
    "Bầu trời (độ cao – phương vị)",
    "Toàn cảnh (xích kinh – xích vĩ)",
    "Khí quyển &amp; ánh sáng nền",
    "Mặt đất &amp; núi",
    "Tìm sao, chòm sao, thiên thể…",
    "⟲ Căn lại",
    "Bấm vào một ngôi sao, thiên thể sâu hoặc hành tinh",
    "Ngân Hà",
    "Thiên đỉnh",
    "giờ sao địa phương",
    "5.044 sao (Hipparcos tới cấp 6)"
  ];
  for (const text of required) {
    if (!html.includes(text)) fail("giao diện", `thiếu thành phần "${text}"`);
    ok();
  }

  if (html.includes("undefined") || html.includes("NaN")) fail("giao diện", "HTML có giá trị undefined/NaN");
  ok();
}

console.log(`\n${failures ? "✘" : "✔"} Bản đồ sao: ${checks.toLocaleString("vi-VN")} phép kiểm, ${failures} lỗi.`);
if (failures) process.exit(1);
