/**
 * Kiểm chứng DỮ LIỆU gửi lên mô hình lớn và lời dặn trong SYSTEM_PROMPT.
 *
 *   npm run test:ai-payload
 *
 * Không gọi mạng: dựng báo cáo bằng chính engine của app rồi soi nội dung. Trọng tâm là những
 * chỗ mà báo cáo từng nói SAI về dữ liệu nó đang chứa — loại lỗi nguy hiểm hơn thiếu dữ liệu,
 * vì mô hình lớn sẽ luận giải rất tự tin theo nhãn sai:
 *
 *   1. Hệ nhà bị ghi cứng "Whole Sign (toàn cung)" dù người dùng chọn Placidus/Koch/…
 *   2. Hệ hoàng đạo bị ghi cứng "(tropical, geocentric)" dù kinh độ ĐÃ trừ ayanamsa (sidereal
 *      Lahiri ~23,8° — gần trọn một cung), và không khai ayanamsa.
 *   3. Câu hỏi nằm ở CUỐI báo cáo nên bị trần ký tự của máy chủ cắt mất khi báo cáo dài.
 *   4. SYSTEM_PROMPT hứa trả lời được "tối nay thấy hành tinh nào" nhưng báo cáo không hề có
 *      dữ liệu bầu trời thực tế (khối đó chỉ tồn tại trong bộ luận giải nội bộ).
 *   5. Bộ luận giải nội bộ bảo người dùng cấu hình OPENAI_API_KEY (app dùng GEMINI_API_KEY).
 */
import { REPORT_CHAR_LIMIT, SYSTEM_PROMPT } from "../api/_handler.js";
import {
  REPORT_QUESTION_LIMIT,
  buildChartReport,
  calcObliquity,
  calculateChart,
  computeTransits,
  displayAngle,
  localSiderealDegrees,
  normalizeDegree,
  transitToLines,
  type ChartData
} from "../src/lib/astro.ts";
import { HOUSE_SYSTEMS, type HouseSystemId } from "../src/lib/houses.ts";
import { ZODIAC_FRAMES, type ZodiacFrameId } from "../src/lib/zodiac.ts";
import { buildVariantChart, variantReport } from "../src/lib/chart-variants.ts";
import { computeSkySnapshot, findFixedStarHits, riseSetForDay, skyObservationLines } from "../src/lib/sky.ts";
import { answerLocally } from "../src/lib/interpret.ts";

let checks = 0;
const failures: string[] = [];
const fail = (group: string, message: string) => failures.push(`${group}: ${message}`);
const ok = () => {
  checks += 1;
};
const expect = (group: string, actual: unknown, expected: unknown, label: string) => {
  ok();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(group, `${label} — nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`);
  }
};
const assert = (group: string, condition: boolean, message: string) => {
  ok();
  if (!condition) fail(group, message);
};

/* ── Dữ liệu gốc: lá số ví dụ 11/11/1996 00:30 (UTC+7) tại Hà Nội ─────────── */

const LAT = 21.0285;
const LON = 105.8542;
const PLACE = "Hà Nội, Việt Nam";
const OFFSET = 7;
const BIRTH_UTC = new Date(Date.UTC(1996, 10, 10, 17, 30));
const NOW = new Date(Date.UTC(2026, 8, 18, 12, 0));
const QUESTION = "Năm tới tôi có nên đổi việc không?";

const build = (houseSystem: HouseSystemId, zodiacFrame: ZodiacFrameId, latitude = LAT, longitude = LON): ChartData =>
  calculateChart(BIRTH_UTC, latitude, longitude, PLACE, "Asia/Ho_Chi_Minh", OFFSET, { houseSystem, zodiacFrame });

const variantOf = (chart: ChartData, houseSystem: HouseSystemId, zodiacFrame: ZodiacFrameId) => {
  const localDate = new Date(chart.utcDate.getTime() + chart.timezoneOffset * 3600 * 1000);
  return buildVariantChart({
    chart,
    localDate,
    localHour: localDate.getUTCHours() + localDate.getUTCMinutes() / 60,
    gender: "nam",
    houseSystem,
    zodiacFrame
  });
};

const sky = computeSkySnapshot(NOW, LAT, LON, localSiderealDegrees(NOW, LON), calcObliquity(NOW));
const riseSet = riseSetForDay(NOW, LAT, LON, "Asia/Ho_Chi_Minh");
const skyLines = skyObservationLines(sky, riseSet);

/* ── 1. Báo cáo phải khai ĐÚNG hệ nhà và hệ hoàng đạo đang dùng ───────────── */

{
  const group = "nhãn hệ quy chiếu";
  let combinations = 0;

  for (const system of HOUSE_SYSTEMS) {
    for (const frame of ZODIAC_FRAMES) {
      combinations += 1;
      const chart = build(system.id, frame.id);
      const report = buildChartReport(chart, "Người kiểm tra", QUESTION, transitToLines(computeTransits(chart, NOW, 4)));
      const where = `${system.id} + ${frame.id}`;

      assert(group, report.includes(system.label), `${where}: báo cáo phải khai đúng nhãn hệ nhà “${system.label}”`);
      assert(group, report.includes(frame.label), `${where}: báo cáo phải khai đúng nhãn hệ hoàng đạo “${frame.label}”`);
      // Nhãn phải là nhãn THẬT của hệ đang chọn trong bảng HOUSE_SYSTEMS (không phải chuỗi ghi cứng).
      assert(
        group,
        report.includes(`HỆ THỐNG NHÀ đang dùng: ${system.label}`),
        `${where}: dòng khai hệ nhà phải khớp nhãn của engine`
      );
      assert(
        group,
        report.includes(`HỆ HOÀNG ĐẠO đang dùng: ${frame.label}`),
        `${where}: dòng khai hệ hoàng đạo phải khớp nhãn của engine`
      );
      // Vài mô tả hệ nhà vốn kết thúc bằng dấu chấm → nối câu không được sinh ra dấu chấm đôi.
      assert(group, !/\.\.\s*Số ["]Nhà n["]/.test(report), `${where}: dòng khai hệ nhà bị dấu chấm đôi`);

      if (system.id !== "wholeSign") {
        assert(group, !report.includes("Whole Sign"), `${where}: KHÔNG được ghi cứng “Whole Sign” khi đang dùng ${system.id}`);
      }

      if (frame.id === "tropical") {
        assert(group, chart.ayanamsa === 0, `${where}: hệ nhiệt đới thì ayanamsa phải bằng 0`);
        assert(group, report.includes("(tropical, geocentric)"), `${where}: hệ nhiệt đới được dán nhãn tropical`);
      } else {
        assert(group, report.includes("(sidereal, geocentric)"), `${where}: kinh độ đã trừ ayanamsa thì phải dán nhãn sidereal`);
        assert(group, report.includes(chart.ayanamsa.toFixed(4)), `${where}: phải khai giá trị ayanamsa ${chart.ayanamsa.toFixed(4)}°`);
        assert(group, !report.includes("(tropical, geocentric)"), `${where}: KHÔNG được nhận kinh độ sidereal là tropical`);
        // Cung Mọc trong báo cáo phải là giá trị sidereal mà engine đang giữ.
        assert(group, report.includes(displayAngle(chart.ascendant)), `${where}: phải in đúng Cung Mọc của hệ đang chọn`);
      }
    }
  }

  assert(group, combinations >= 70, `phải quét đủ mọi cặp hệ nhà × hệ hoàng đạo (đã quét ${combinations})`);
}

/* ── 2. Ghi chú thay hệ nhà (ngoài vòng cực) phải có mặt trong báo cáo ─────── */

{
  const group = "ghi chú hệ nhà";
  const polar = build("placidus", "tropical", 78, 15.6);
  assert(group, Boolean(polar.houseNote), "Placidus ở vĩ độ 78° phải sinh ghi chú thay hệ nhà");
  const report = buildChartReport(polar, "Người kiểm tra", QUESTION, []);
  assert(group, report.includes(polar.houseNote ?? ""), "báo cáo gửi AI phải kèm ghi chú hệ nhà (trước đây chỉ có trong báo cáo biến thể)");

  const normal = build("placidus", "tropical");
  const normalReport = buildChartReport(normal, "Người kiểm tra", QUESTION, []);
  if (!normal.houseNote) {
    assert(group, !normalReport.includes("LƯU Ý về hệ nhà"), "không có ghi chú thì không được bịa dòng lưu ý");
  }
}

/* ── 3. Câu hỏi phải nằm ĐẦU báo cáo để không bị trần ký tự cắt mất ───────── */

{
  const group = "vị trí câu hỏi";
  const chart = build("placidus", "tropical");
  const variant = variantOf(chart, "placidus", "tropical");
  const chartReport = buildChartReport(chart, "Người kiểm tra", QUESTION, transitToLines(computeTransits(chart, NOW, 4)), {
    gender: "nam",
    localBirth: "00:30:00 11/11/1996 (giờ địa phương nơi sinh)",
    extraPoints: variant.extraPoints,
    skyLines,
    fixedStarLines: findFixedStarHits(chart, calcObliquity(chart.utcDate), 1.5)
      .slice(0, 6)
      .map((star) => `- ${star.starName} trùng ${star.natalLabel} (orb ${star.orb.toFixed(2)}°)`)
  });
  const fullPayload = [chartReport, variantReport(variant)].filter(Boolean).join("\n\n");

  assert(group, chartReport.indexOf("CÂU HỎI CẦN LUẬN GIẢI") < 800, "câu hỏi phải nằm gần đầu báo cáo");
  assert(group, chartReport.indexOf(QUESTION) < chartReport.length / 2, "câu hỏi phải ở nửa đầu báo cáo");
  assert(group, fullPayload.length < REPORT_CHAR_LIMIT, `payload đầy đủ (${fullPayload.length} ký tự) phải lọt trần ${REPORT_CHAR_LIMIT} của máy chủ`);
  assert(group, fullPayload.slice(0, REPORT_CHAR_LIMIT).includes(QUESTION), "sau khi máy chủ cắt, câu hỏi vẫn phải còn");

  // Câu hỏi quá dài phải bị cắt kèm ghi chú, để phần dữ liệu phía sau không bị đẩy ra ngoài trần.
  const longQuestion = `Tôi muốn hỏi rất nhiều điều. ${"Xin hãy luận chi tiết từng nhà một. ".repeat(200)}`;
  const longReport = buildChartReport(chart, "Người kiểm tra", longQuestion, []);
  assert(group, longReport.includes("[câu hỏi đã bị cắt ngắn"), "câu hỏi dài hơn trần phải được cắt kèm ghi chú rõ ràng");
  assert(group, longReport.length < REPORT_QUESTION_LIMIT + 4000, `báo cáo không được phình theo câu hỏi (đang ${longReport.length} ký tự)`);
  assert(group, !longReport.includes(longQuestion), "câu hỏi nguyên bản quá dài không được lọt hết vào báo cáo");
}

/* ── 4. Khối bầu trời thực tế: có dữ liệu thì đưa vào, không có thì không bịa ── */

{
  const group = "bầu trời thực tế";
  const chart = build("placidus", "tropical");
  const withSky = buildChartReport(chart, "Người kiểm tra", "Tối nay tôi thấy được hành tinh nào?", [], { skyLines });
  assert(group, withSky.includes("BẦU TRỜI THỰC TẾ LÚC NGƯỜI DÙNG HỎI"), "phải có mục bầu trời lúc hỏi");
  assert(group, withSky.includes(riseSet.sunRise) && withSky.includes(riseSet.sunSet), "phải có giờ Mặt Trời mọc/lặn");
  assert(group, withSky.includes(riseSet.moonRise) && withSky.includes(riseSet.moonSet), "phải có giờ Mặt Trăng mọc/lặn");
  assert(group, withSky.includes(`${(sky.moonIllumination * 100).toFixed(0)}%`), "phải có độ sáng Mặt Trăng");
  assert(group, withSky.includes(sky.hemi), "phải nói rõ bán cầu để khuyên hướng quan sát");
  // Kinh độ trong khối bầu trời là của TRỜI THẬT (nhiệt đới); người dùng đang xem sidereal thì
  // số này dễ bị mô hình đọc nhầm thành kinh độ sidereal của bản đồ → khối phải tự khai hệ.
  assert(
    group,
    withSky.includes("KHÔNG phụ thuộc hệ hoàng đạo người dùng chọn"),
    "khối bầu trời phải tự khai kinh độ là trời thật (nhiệt đới), không đổi theo hệ sidereal"
  );

  const withoutSky = buildChartReport(chart, "Người kiểm tra", "Tối nay thấy hành tinh nào?", []);
  assert(group, !withoutSky.includes("BẦU TRỜI THỰC TẾ"), "không có dữ liệu bầu trời thì không được bịa mục đó");

  // Không có hành tinh nào nổi trên chân trời → phải nói thẳng để AI không hứa hão.
  const emptySky = skyObservationLines({ ...sky, visibleNow: [] }, riseSet).join("\n");
  assert(group, emptySky.includes("không có hành tinh nào nổi trên 5°"), "trời trống phải được nói rõ");

  // Dữ liệu trong khối bầu trời là của LÚC HỎI, không phải lúc sinh.
  assert(group, withSky.includes(sky.moonPhase), "pha Trăng hiện tại (lúc hỏi) phải có mặt");
  assert(group, chart.moonPhase !== sky.moonPhase, "lá số này có pha Trăng lúc sinh khác lúc hỏi — hai mốc phải tách bạch");
}

/* ── 5. Điểm ảo phải được quy về ĐÚNG hệ hoàng đạo đang chọn ─────────────── */

{
  const group = "điểm ảo theo hệ";
  const siderealChart = build("placidus", "lahiri");
  const variant = variantOf(siderealChart, "placidus", "lahiri");
  const node = variant.extraPoints.find((point) => point.key === "trueNode");
  assert(group, Boolean(node), "phải có Bắc giao điểm để kiểm");

  if (node) {
    const report = buildChartReport(siderealChart, "Người kiểm tra", QUESTION, [], { extraPoints: [node] });
    const siderealLabel = displayAngle(normalizeDegree(node.longitude - siderealChart.ayanamsa));
    const tropicalLabel = displayAngle(node.longitude);
    assert(group, report.includes(`${node.label}: ${siderealLabel}`), `điểm ảo phải in theo hệ sidereal (${siderealLabel})`);
    assert(group, !report.includes(`${node.label}: ${tropicalLabel}`), "không được in kinh độ nhiệt đới khi người dùng đang xem sidereal");
    assert(group, report.includes(`Nhà ${node.house}`), "số nhà của điểm ảo phải được giữ (nhà là hình học, không đổi theo hệ)");
  }

  // Ở hệ nhiệt đới, kinh độ điểm ảo phải giữ nguyên.
  const tropicalChart = build("placidus", "tropical");
  const tropicalVariant = variantOf(tropicalChart, "placidus", "tropical");
  const tropicalNode = tropicalVariant.extraPoints.find((point) => point.key === "trueNode");
  if (tropicalNode) {
    const report = buildChartReport(tropicalChart, "Người kiểm tra", QUESTION, [], { extraPoints: [tropicalNode] });
    assert(group, report.includes(displayAngle(tropicalNode.longitude)), "hệ nhiệt đới: kinh độ điểm ảo giữ nguyên");
  }
}

/* ── 6. Đủ cusp 12 nhà, giới tính, giờ sinh địa phương, sao cố định ────────── */

{
  const group = "đủ dữ liệu";
  const chart = build("koch", "tropical");
  const fixedStars = findFixedStarHits(chart, calcObliquity(chart.utcDate), 1.5);
  const report = buildChartReport(chart, "Người kiểm tra", QUESTION, transitToLines(computeTransits(chart, NOW, 4)), {
    gender: "nữ",
    localBirth: "00:30:00 11/11/1996 (giờ địa phương nơi sinh)",
    fixedStarLines: fixedStars.slice(0, 6).map((star) => `- ${star.starName} trùng ${star.natalLabel} (orb ${star.orb.toFixed(2)}°)`)
  });

  for (let house = 1; house <= 12; house += 1) {
    assert(group, report.includes(`nhà ${house} `), `phải liệt kê cusp nhà ${house} (hệ Koch không suy ra được từ Whole Sign)`);
  }
  assert(group, report.includes("giới tính khai trong form: nữ"), "giới tính cần cho Tứ Trụ/Tử Vi/dasha");
  assert(group, report.includes("Ngày giờ sinh địa phương"), "phải có giờ sinh ĐỊA PHƯƠNG, không chỉ UTC");
  assert(group, report.includes("SAO CỐ ĐỊNH"), fixedStars.length ? "phải có mục sao cố định khi có hit" : "không có hit thì bỏ qua");

  // Góc chiếu phải xếp theo orb chặt dần đúng như tiêu đề báo cáo tuyên bố.
  const orbs = report
    .split("\n")
    .filter((line) => line.startsWith("- ") && line.includes("orb "))
    .slice(0, 40)
    .map((line) => Number(/orb (\d+[.,]\d+)°/.exec(line)?.[1].replace(",", ".")) )
    .filter((value) => Number.isFinite(value));
  const aspectOrbs = orbs.slice(0, chart.aspects.length);
  let sorted = true;
  for (let index = 1; index < aspectOrbs.length; index += 1) {
    if (aspectOrbs[index] < aspectOrbs[index - 1] - 1e-9) sorted = false;
  }
  assert(group, aspectOrbs.length > 0, "phải đọc được orb từ báo cáo để kiểm thứ tự");
  assert(group, sorted, "góc chiếu trong báo cáo phải xếp theo orb chặt dần như tiêu đề đã tuyên bố");
}

/* ── 7. SYSTEM_PROMPT phải dặn đúng những gì dữ liệu cho phép ─────────────── */

{
  const group = "SYSTEM_PROMPT";
  assert(group, SYSTEM_PROMPT.includes("Không tự tính lại"), "prompt phải cấm mô hình tự tính/bịa số liệu ngoài báo cáo");
  assert(group, SYSTEM_PROMPT.includes("TỰ KHAI hệ hoàng đạo"), "prompt phải nhắc báo cáo tự khai hệ quy chiếu");
  assert(group, SYSTEM_PROMPT.includes("sidereal"), "prompt phải cảnh giác với kinh độ sidereal");
  assert(group, SYSTEM_PROMPT.includes("BẦU TRỜI THỰC TẾ"), "prompt phải chỉ rõ khối dữ liệu quan sát");
  assert(
    group,
    SYSTEM_PROMPT.includes("BẦU TRỜI THẬT"),
    "prompt phải dặn không trộn kinh độ trời thật (nhiệt đới) với kinh độ sidereal của bản đồ"
  );
  assert(group, SYSTEM_PROMPT.includes("orb"), "prompt phải dặn đọc orb để không thổi phồng góc chiếu lỏng");
  assert(group, SYSTEM_PROMPT.includes("lúc sinh") && SYSTEM_PROMPT.includes("lúc hỏi"), "prompt phải tách bạch mốc lúc sinh và lúc hỏi");
  assert(group, !SYSTEM_PROMPT.includes("OPENAI"), "prompt không được nhắc tới nhà cung cấp khác");
  assert(group, SYSTEM_PROMPT.includes("y tế") && SYSTEM_PROMPT.includes("pháp lý"), "prompt phải giữ khuyến cáo không tư vấn y tế/pháp lý/đầu tư");
  assert(group, REPORT_CHAR_LIMIT >= 16000, `trần báo cáo phải đủ rộng cho payload thật (${REPORT_CHAR_LIMIT})`);
}

/* ── 8. Bộ luận giải nội bộ: chỉ đúng biến môi trường và hệ đang dùng ──────── */

{
  const group = "luận giải nội bộ";
  for (const frame of ["tropical", "lahiri"] as ZodiacFrameId[]) {
    const chart = build("placidus", frame);
    const variant = variantOf(chart, "placidus", frame);
    const answer = answerLocally({
      question: "Tổng quan bản đồ sao của tôi",
      chart,
      senderName: "Người kiểm tra",
      now: NOW,
      sky,
      transits: computeTransits(chart, NOW, 4),
      fixedStars: findFixedStarHits(chart, calcObliquity(chart.utcDate), 1.5),
      variant,
      riseSet
    });

    assert(group, !answer.includes("OPENAI"), "bộ luận giải nội bộ không được bảo người dùng cấu hình OPENAI_API_KEY");
    assert(group, answer.includes("GEMINI_API_KEY"), "phải chỉ đúng biến GEMINI_API_KEY");
    assert(group, answer.includes("placidus") || answer.includes("Placidus"), "câu trả lời nội bộ phải nói rõ hệ nhà đang dùng");
    assert(
      group,
      frame === "tropical" ? answer.includes("nhiệt đới") : answer.includes("lahiri") && answer.includes("ayanamsa"),
      `câu trả lời nội bộ phải nói rõ hệ hoàng đạo đang dùng (${frame})`
    );
    assert(group, answer.length > 400, "câu trả lời nội bộ phải có nội dung đáng kể");
  }
}

console.log(`\n${failures.length ? "✘" : "✔"} Dữ liệu gửi AI & cách luận: ${checks} phép kiểm, ${failures.length} lỗi.`);
for (const failure of failures.slice(0, 40)) console.log(`  · ${failure}`);
if (failures.length > 40) console.log(`  · … và ${failures.length - 40} lỗi nữa`);
if (failures.length) process.exit(1);
