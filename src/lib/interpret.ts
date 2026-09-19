import type { Aspect, ChartData, PlanetPosition, TransitHit } from "@/lib/astro";
import { ELEMENT_VI, MODALITY_VI, displayAngle, normalizeDegree } from "@/lib/astro";
import {
  ASPECT_TONES,
  ELEMENT_TRAITS,
  HOUSE_NUMBER_PATTERN,
  HOUSE_THEMES,
  INTENT_KEYWORDS,
  MOON_PHASE_TRAITS,
  PLANET_KEYWORDS,
  SIGN_TRAITS,
  normalizeVietnamese,
  type Intent
} from "@/lib/knowledge";
import type { FixedStarHit, SkySnapshot } from "@/lib/sky";
import { compass, signPositionOf } from "@/lib/sky";
import type { VariantChart } from "@/lib/chart-variants";
import { compareHouseSystems, compareZodiacFrames } from "@/lib/chart-variants";
import { VARIANT_CARDS, VARIANT_GROUPS, findVariants, variantAnswer, variantGroupSummary } from "@/lib/variants-knowledge";

export type LocalAnswerInput = {
  question: string;
  chart: ChartData;
  senderName: string;
  now: Date;
  sky: SkySnapshot;
  transits: TransitHit[];
  fixedStars: FixedStarHit[];
  variant?: VariantChart;
  riseSet: { sunRise: string; sunSet: string; moonRise: string; moonSet: string; timeZoneLabel: string };
};

const ASPECT_VI: Record<string, string> = {
  Conjunction: "trùng tụ",
  Sextile: "lục hợp",
  Square: "vuông góc",
  Trine: "tam hợp",
  Opposition: "đối đỉnh"
};

const detectIntents = (question: string): Intent[] => {
  const normalized = normalizeVietnamese(question);
  const found: Intent[] = [];

  for (const entry of INTENT_KEYWORDS) {
    if (entry.keys.some((key) => normalized.includes(key))) found.push(entry.intent);
  }

  if (!found.length) found.push("overview");
  return [...new Set(found)].slice(0, 3);
};

const signNameOf = (longitude: number) => {
  const names = Object.keys(SIGN_TRAITS);
  return names[Math.floor(normalizeDegree(longitude) / 30)] ?? "không rõ";
};

const SIGN_RULER: Record<string, string> = {
  "Bạch Dương": "mars",
  "Kim Ngưu": "venus",
  "Song Tử": "mercury",
  "Cự Giải": "moon",
  "Sư Tử": "sun",
  "Xử Nữ": "mercury",
  "Thiên Bình": "venus",
  "Bọ Cạp": "pluto",
  "Nhân Mã": "jupiter",
  "Ma Kết": "saturn",
  "Bảo Bình": "uranus",
  "Song Ngư": "neptune"
};

const houseLabel = (house: number) => HOUSE_THEMES[house]?.name ?? `Nhà ${house}`;
const houseTopics = (house: number) => HOUSE_THEMES[house]?.topics ?? "lĩnh vực liên quan";

const placement = (planet: PlanetPosition) => {
  const sign = signNameOf(planet.longitude);
  const detail = SIGN_TRAITS[sign];
  const house = HOUSE_THEMES[planet.house];
  const keyword = PLANET_KEYWORDS[planet.key];

  return `${planet.label} ở ${sign} ${displayAngle(planet.longitude).split(" ").pop()} — ${keyword?.role ?? ""}: ${detail?.core ?? ""}${
    planet.retrograde ? " (nghịch hành: năng lượng hướng vào bên trong, cần thời gian mới thể hiện ra ngoài)" : ""
  }. Lĩnh vực thể hiện: ${house?.topics ?? houseTopics(planet.house)}.`;
};

const aspectPhrase = (aspect: Aspect) => {
  const tone = ASPECT_TONES[aspect.type];
  return `${aspect.fromLabel} ${ASPECT_VI[aspect.type] ?? aspect.type} ${aspect.toLabel} (orb ${aspect.orb.toFixed(1)}°) — ${
    tone?.nature ?? ""
  }. Cơ hội: ${tone?.opportunity ?? ""}. Rủi ro: ${tone?.challenge ?? ""}.`;
};

const tightestAspects = (chart: ChartData, limit = 3, filter?: (aspect: Aspect) => boolean) =>
  chart.aspects.filter((aspect) => (filter ? filter(aspect) : true)).slice(0, limit);

const aspectsTouching = (chart: ChartData, keys: string[], limit = 4) =>
  chart.aspects.filter((aspect) => keys.includes(aspect.from) || keys.includes(aspect.to)).slice(0, limit);

/** Hành tinh chủ quản của một cung và vị trí thực tế của nó trong bản đồ. */
const rulerLine = (chart: ChartData, signName: string, context: string) => {
  const rulerKey = SIGN_RULER[signName];
  const ruler = chart.planets.find((planet) => planet.key === rulerKey);
  if (!ruler) return `${context} ở ${signName}: hành tinh chủ quản là ${PLANET_KEYWORDS[rulerKey]?.label ?? rulerKey}.`;

  return `${context} ở ${signName}, chủ quản là ${PLANET_KEYWORDS[ruler.key]?.label} — hành tinh này của bạn nằm ở ${signNameOf(
    ruler.longitude
  )} (nhà ${ruler.house}), nên năng lượng được dẫn tới ${houseTopics(ruler.house)}.`;
};

const balanceLine = (chart: ChartData) => {
  const elements = Object.entries(chart.elements).sort((a, b) => b[1] - a[1]);
  const dominant = elements[0];
  const weakest = elements[elements.length - 1];
  const modalities = Object.entries(chart.modalities).sort((a, b) => b[1] - a[1]);

  const list = elements.map(([key, value]) => `${ELEMENT_VI[key]} ${value}`).join(" · ");
  const modalityList = modalities.map(([key, value]) => `${MODALITY_VI[key]} ${value}`).join(" · ");

  return (
    `Cân bằng nguyên tố: ${list}. Trội ${ELEMENT_VI[dominant[0]]} → ${ELEMENT_TRAITS[dominant[0]]?.trait}. ` +
    `Ít ${ELEMENT_VI[weakest[0]]} nhất → lưu ý: ${ELEMENT_TRAITS[weakest[0]]?.lacking}. ` +
    `Tính chất: ${modalityList}.`
  );
};

const stelliumHouses = (chart: ChartData) => {
  const counts = new Map<number, PlanetPosition[]>();
  for (const planet of chart.planets) {
    counts.set(planet.house, [...(counts.get(planet.house) ?? []), planet]);
  }
  return [...counts.entries()].filter(([, planets]) => planets.length >= 2).sort((a, b) => b[1].length - a[1].length);
};

const coreLine = (chart: ChartData) => {
  const sun = chart.planets.find((planet) => planet.key === "sun")!;
  const moon = chart.planets.find((planet) => planet.key === "moon")!;
  const asc = signNameOf(chart.ascendant);

  return (
    `Ba trụ cột: Mặt Trời ở ${signNameOf(sun.longitude)} (nhà ${sun.house}) — ${SIGN_TRAITS[signNameOf(sun.longitude)]?.core}; ` +
    `Mặt Trăng ở ${signNameOf(moon.longitude)} (nhà ${moon.house}) — nhu cầu cảm xúc: ${SIGN_TRAITS[signNameOf(moon.longitude)]?.core}; ` +
    `Cung Mọc ${asc} — ấn tượng bạn tạo ra ban đầu: ${SIGN_TRAITS[asc]?.core}.`
  );
};

const transitSection = (input: LocalAnswerInput, limit = 4) => {
  const { transits } = input;
  if (!transits.length) {
    return "Hiện tại không có transit nào lệch dưới 4° so với các điểm quan trọng trong bản đồ của bạn — đây là giai đoạn khá ổn định, phù hợp để củng cố nền tảng thay vì mở việc mới.";
  }

  const lines = transits
    .slice(0, limit)
    .map(
      (hit) =>
        `- ${hit.transitLabel} ${ASPECT_VI[hit.aspect] ?? hit.aspect} ${hit.natalLabel} (orb ${hit.orb.toFixed(
          1
        )}°, ${hit.applying ? "đang áp sát → sức ép tăng dần" : "đang tách → đã qua đỉnh"}${
          hit.transitRetrograde ? ", nghịch hành → chủ đề quay lại để hoàn tất" : ""
        }), tác động tới ${houseTopics(hit.natalHouse)}`
    )
    .join("\n");

  const slow = transits.filter((hit) => ["jupiter", "saturn", "uranus", "neptune", "pluto"].includes(hit.transitKey));
  const fast = transits.filter((hit) => ["moon", "venus", "mars", "mercury", "sun"].includes(hit.transitKey));

  const closing = [
    slow.length
      ? `Các transit của hành tinh chậm (${[...new Set(slow.map((hit) => hit.transitLabel))].join(", ")}) đặt ra chủ đề lớn của giai đoạn này; đây là nhóm ảnh hưởng trong nhiều tháng.`
      : "Hiện chưa có hành tinh chậm nào chạm trực tiếp bản đồ, nên các biến động chủ yếu đến từ hành tinh nhanh và chỉ kéo dài vài ngày.",
    fast.length
      ? `Nhóm hành tinh nhanh (${[...new Set(fast.map((hit) => hit.transitLabel))].join(", ")}) cho biết nhịp ngắn hạn — nên chọn tuần/tháng để hành động, không nên dựa vào đó để quyết định đường dài.`
      : "Hành tinh nhanh hiện chưa tạo điểm chạm rõ, nên đây là lúc thuận lợi để hoàn tất việc còn dang dở."
  ].join(" ");

  return `${lines}\n\n${closing}`;
};

const fixedStarSection = (input: LocalAnswerInput, limit = 6) => {
  const hits = input.fixedStars.slice(0, limit);
  if (!hits.length) {
    return "Không có sao cố định nào nằm trong 1.5° so với các điểm chính trong bản đồ natal của bạn. Điều này khá phổ biến và không phải điều xấu — bản đồ của bạn chủ yếu được dẫn dắt bởi các hành tinh.";
  }

  return hits
    .map(
      (hit) =>
        `- ${hit.starName} (${hit.constellation}, cấp sao ${hit.starMag}) ở ${hit.signName} ${hit.degree}°${String(
          hit.minutes
        ).padStart(2, "0")}' — cách ${hit.natalLabel} ${hit.orb.toFixed(2)}°. Ý nghĩa truyền thống: ${hit.meaning}.`
    )
    .join("\n");
};

const skySection = (input: LocalAnswerInput) => {
  const { sky, riseSet } = input;
  const visible = sky.visibleNow.slice(0, 5);
  const planets = sky.planets
    .filter((planet) => planet.key !== "sun")
    .map((planet) => `${planet.label} ở ${signPositionOf(planet.lon)}${planet.retrograde ? " (nghịch hành)" : ""}`)
    .join(" · ");

  const visibility = visible.length
    ? visible.map((item) => `${item.label} (cao ${item.alt.toFixed(0)}°, hướng ${compass(item.az)})`).join(", ")
    : "chưa có hành tinh nào nổi trên 5° ở thời điểm này";

  const sunState =
    sky.sunAltitude > 0
      ? `Mặt Trời đang cao ${sky.sunAltitude.toFixed(0)}° nên bầu trời còn sáng`
      : `Mặt Trời đang ở ${sky.sunAltitude.toFixed(0)}° dưới đường chân trời`;

  return [
    `Vị trí hiện tại (${input.now.toLocaleString("vi-VN", { hour12: false })}): ${planets}.`,
    `Mặt Trăng: ${sky.moonPhase}, độ sáng khoảng ${(sky.moonIllumination * 100).toFixed(0)}%, mọc ${riseSet.moonRise} và lặn ${riseSet.moonSet}. Mặt Trời mọc ${riseSet.sunRise}, lặn ${riseSet.sunSet} (giờ ${riseSet.timeZoneLabel}).`,
    `Quan sát được ngay lúc này: ${visibility}. ${sunState}.`,
    `Mẹo quan sát: ${input.sky.hemi} bán cầu, địa điểm của bạn có vĩ độ ${input.sky.latitude.toFixed(
      2
    )}°. Để ý hướng ${sky.hemi === "Bắc" ? "Nam - nơi Mặt Trời, Mặt Trăng và các hành tinh đi qua" : "Bắc - nơi các thiên thể cũng đi qua thiên đỉnh"}, tránh đèn thành phố và để mắt làm quen tối 15–20 phút.`
  ].join("\n\n");
};

const houseSpecificSection = (chart: ChartData, question: string) => {
  const match = question.match(HOUSE_NUMBER_PATTERN);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number < 1 || number > 12) return null;

  const house = chart.houses.find((item) => item.house === number);
  if (!house) return null;
  const occupants = chart.planets.filter((planet) => planet.house === number);
  const ruler = chart.houses[number - 1]?.signName;

  return (
    `**${houseLabel(number)}** của bạn nằm ở ${ruler} ${displayAngle(house.cusp).split(" ").pop()} — chủ đề: ${
      houseTopics(number)
    }. ` +
    `${rulerLine(chart, ruler, `Cung đặt nhà ${number}`)} ` +
    (occupants.length
      ? `Trong nhà này có ${occupants.map((planet) => `${planet.label} (${signNameOf(planet.longitude)})`).join(", ")} → ${
          PLANET_KEYWORDS[occupants[0].key]?.need ?? ""
        } được đẩy vào lĩnh vực này.`
      : "Không có hành tinh nào nằm trong nhà này, nên chủ đề ở đây vận hành theo cung và hành tinh quản chiếu: nên đọc thêm vị trí hành tinh chủ quản của cung này trong bản đồ.") +
    ` Gợi ý: ${HOUSE_THEMES[number]?.advice ?? ""}.`
  );
};

const recommendations = (intents: Intent[], chart: ChartData, transits: TransitHit[]) => {
  const suggestions: string[] = [];
  const applying = transits.filter((hit) => hit.applying).slice(0, 2);

  if (intents.includes("career") || intents.includes("money")) {
    const saturn = chart.planets.find((planet) => planet.key === "saturn")!;
    suggestions.push(
      `Xây dựng theo kiểu Thổ Tinh ở ${signNameOf(saturn.longitude)} (nhà ${saturn.house}): tiến từng bước có kiểm chứng, tránh nhảy việc chỉ vì sốt ruột.`
    );
  }
  if (intents.includes("love")) {
    const venus = chart.planets.find((planet) => planet.key === "venus")!;
    suggestions.push(
      `Trong tình cảm, nhu cầu thật của bạn là "${PLANET_KEYWORDS.venus.need}" — nói rõ điều này sớm thay vì để đối phương đoán.`
    );
    suggestions.push(`Kim Tinh ở ${signNameOf(venus.longitude)} cho thấy bạn bị hút bởi kiểu người ${SIGN_TRAITS[signNameOf(venus.longitude)]?.strength}.`);
  }
  if (intents.includes("health")) {
    suggestions.push("Ưu tiên giấc ngủ và nhịp sinh hoạt đều; đây là nền tảng trước khi bàn tới chế độ tập luyện hay ăn uống.");
  }
  if (intents.includes("study")) {
    const mercury = chart.planets.find((planet) => planet.key === "mercury")!;
    suggestions.push(`Cách học hợp với bạn: ${SIGN_TRAITS[signNameOf(mercury.longitude)]?.strength} (theo Thủy Tinh ở ${signNameOf(mercury.longitude)}).`);
  }
  if (intents.includes("timing") || applying.length) {
    suggestions.push(
      applying.length
        ? `Chọn thời điểm: ưu tiên khi ${applying.map((hit) => `${hit.transitLabel} ${ASPECT_VI[hit.aspect]} ${hit.natalLabel}`).join(" và ")} đi vào đúng orb — sức ép rõ hơn nhưng cơ hội mở ra nhanh hơn.`
        : "Chọn thời điểm: dùng trang bản đồ sao, bật chế độ chạy thời gian để xem khi nào hành tinh chậm đi vào orb với điểm quan trọng."
    );
  }
  suggestions.push(
    `Kiểm chứng thực tế: ghi lại sự kiện lớn theo ngày và đối chiếu với transit để dần hiểu cách bản đồ "nói" với bạn (đây là cách học chiêm tinh đáng tin nhất).`
  );

  return suggestions.map((item) => `- ${item}`).join("\n");
};

/** Phần trả lời cho nhóm câu hỏi về biến thể bản đồ sao. */
const variantSection = (input: LocalAnswerInput, normalized: string): string => {
  const variant = input.variant;
  const parts: string[] = [];

  const matches = findVariants(normalized, 3);
  const askingList = /bien the|nhung cach|toan bo|co nhung gi|liet ke|cac loai|cac he nha|cac he hoang dao/.test(normalized);

  if (askingList) {
    parts.push(
      `**Toàn bộ biến thể bản đồ sao đang có trong hệ thống (${VARIANT_CARDS.length} mục, ${VARIANT_GROUPS.length} nhóm)**`,
      ...variantGroupSummary().map((group) => `- *${group.group}* (${group.count}): ${group.items.join(", ")}`)
    );
  }

  for (const card of matches) {
    parts.push(variantAnswer(card));
  }

  if (variant) {
    const comparison = compareHouseSystems(input.chart);
    const frames = compareZodiacFrames(input.chart);
    const moved = input.chart.planets
      .map((planet) => {
        const houses = comparison.map((entry) => entry.houses[planet.key]).filter((house) => house !== undefined);
        const unique = [...new Set(houses)];
        return unique.length > 1 ? `${planet.label}: nhà ${unique.join(" / ")} tuỳ hệ` : "";
      })
      .filter(Boolean);

    parts.push(
      [
        `**Bản đồ của bạn đang dùng biến thể nào**`,
        `- Hệ nhà: ${variant.houseSystemLabel} — cung 1 tại ${displayAngle(variant.cusps[0])}.${variant.houseNote ? ` ⚠ ${variant.houseNote}` : ""}`,
        variant.zodiacFrame === "tropical"
          ? "- Hệ hoàng đạo: nhiệt đới (tropical). Bật hệ sidereal để xem theo Vệ Đà/ sao cố định."
          : `- Hệ hoàng đạo: ${variant.zodiacFrame}, ayanamsa ${variant.ayanamsaValue.toFixed(4)}°; cung Mọc sidereal ${displayAngle(variant.sidereal.ascendant)}.`,
        `- Hình dạng: ${variant.shape.label}. ${variant.shape.meaning}`,
        variant.patterns.length
          ? `- Hình mẫu góc chiếu: ${variant.patterns.map((pattern) => `${pattern.label} (${pattern.members.join(", ")})`).join("; ")}.`
          : "- Hình mẫu góc chiếu: không có cấu hình lớn.",
        `- Phái bản đồ: ${variant.hellenistic.sect === "day" ? "ban ngày" : "ban đêm"}; Lots tiêu biểu: ${variant.hellenistic.lots
          .slice(0, 3)
          .map((lot) => `${lot.vi} ${displayAngle(lot.longitude)} (nhà ${lot.house})`)
          .join(", ")}.`,
        `- Vệ Đà: Mặt Trăng ở ${variant.vedic.janmaRashi}, nakshatra ${variant.vedic.moonNakshatra} (pada ${variant.vedic.moonPada}); dasha ${variant.vedic.currentMahadasha}/${variant.vedic.currentAntardasha}.`,
        `- Tứ Trụ: ${variant.chinese.bazi.pillars.map((pillar) => `${pillar.label} ${pillar.stemVi} ${pillar.branchVi}`).join(" · ")} — Nhật chủ ${variant.chinese.bazi.dayMaster.vi}.`,
        `- Tử Vi (ước lượng): ${variant.chinese.ziwei.bureau.name}, Mệnh chủ ${variant.chinese.ziwei.lifeMaster}.`,
        `- Maya: ${variant.chinese.mayan.tzolkin.full} · ${variant.chinese.mayan.haab.full}.`,
        `- Human Design: ${variant.design.typeVi}, thẩm quyền ${variant.design.authority}, hồ sơ ${variant.design.profile}.`,
        `- Hồi quy Mặt Trời năm nay: ${variant.derived.solarReturn.moment.toISOString().slice(0, 10)}; tiến triển/Solar arc: ${variant.derived.solarArc.arc.toFixed(2)}°.`
      ].join("\n")
    );

    if (matches.some((card) => card.group === "Hệ nhà") || /bien the|he nha|house/.test(normalized)) {
      parts.push(
        [
          `**Hành tinh đổi nhà thế nào giữa 12 hệ chia nhà**`,
          ...(moved.length ? moved.map((line) => `- ${line}`) : ["- Bản đồ này ổn định: các hành tinh giữ nguyên nhà ở cả 12 hệ (thường gặp khi giờ sinh rõ ràng và vĩ độ thấp)."]),
          `- Chi tiết từng hệ: ${comparison
            .map((entry) => `${entry.label}: cung 1 ${displayAngle(entry.cusp1)}`)
            .slice(0, 6)
            .join(" | ")}…`
        ].join("\n")
      );
    }

    if (matches.some((card) => card.group === "Hệ hoàng đạo") || /ayanamsa|sidereal|tropical|ve da|hoang dao/.test(normalized)) {
      parts.push(
        [
          `**Cung theo từng hệ hoàng đạo (Mặt Trời / Mặt Trăng / Cung Mọc)**`,
          ...frames.map(
            (frame) =>
              `- ${frame.label} (ayanamsa ${frame.ayanamsa.toFixed(3)}°): ${frame.sun} / ${frame.moon} / ${frame.ascendant}`
          )
        ].join("\n")
      );
    }
  } else {
    parts.push("Bạn hãy lập bản đồ sao trước, sau đó tôi sẽ nói rõ biến thể nào đang áp dụng cho chính bản đồ của bạn.");
  }

  return parts.join("\n\n");
};

const sourceNote = (input: LocalAnswerInput) => {
  const { chart } = input;
  return (
    `**Nguồn luận giải:** bộ quy tắc nội bộ của Astral Chart VN, tính trực tiếp từ bản đồ sao bạn vừa lập ` +
    `(${chart.locationLabel}, ${chart.utcDate.toUTCString()}) — không cần API key nên luôn hoạt động. ` +
    `Nếu máy chủ có GEMINI_API_KEY (hoặc GEMINI_API_KEYS), hệ thống sẽ tự chuyển sang Gemini để trả lời linh hoạt hơn; ` +
    `kiểm tra bằng /api/health hoặc \`npm run check:ai\`. ` +
    `Hệ đang dùng: ${chart.houseSystem !== "wholeSign" ? chart.houseSystem : "Whole Sign"} · ${
      chart.zodiacFrame === "tropical" ? "hoàng đạo nhiệt đới" : `hoàng đạo sidereal ${chart.zodiacFrame} (ayanamsa ${chart.ayanamsa.toFixed(2)}°)`
    }. ` +
    `Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế quyết định y tế, tài chính hay pháp lý.`
  );
};

export const answerLocally = (input: LocalAnswerInput): string => {
  const intents = detectIntents(input.question);
  const { chart } = input;
  const sections: string[] = [];
  const stelliums = stelliumHouses(chart);

  sections.push(
    `Xin chào ${input.senderName}! Tôi đã luận giải câu hỏi của bạn dựa trên dữ liệu bản đồ sao: ${
      input.question.trim() ? `"${input.question.trim()}"` : "tổng quan bản đồ sao"
    }.`
  );

  const intro: string[] = [coreLine(chart), balanceLine(chart)];
  if (stelliums.length) {
    const [house, planets] = stelliums[0];
    intro.push(
      `Điểm nổi bật về cấu trúc: ${planets.length} hành tinh tập trung ở nhà ${house} (${houseLabel(house)}), nên chủ đề "${houseTopics(
        house
      )}" lặp lại nhiều trong cuộc đời bạn — cả cơ hội lẫn bài học đều xoay quanh đây.`
    );
  }
  sections.push(intro.join("\n\n"));

  const has = (intent: Intent) => intents.includes(intent);
  const normalizedQuestion = normalizeVietnamese(input.question);

  if (has("variant") || /bien the|he nha|ayanamsa|sidereal|jyotish|nakshatra|dasha|varga|panchang|tu tru|bazi|tu vi|maya|human design|chiron|lilith|tieu hanh tinh|hamburg|urani|midpoint|harmonic|draconic|nhat tam|hinh dang|grand trine|t-square|yod|stellium|synastry|composite|overlay|solar return|hoi quy|tien trien|solar arc|profection|firdaria|horary|electional|dignity|sect/.test(normalizedQuestion)) {
    sections.push(variantSection(input, normalizedQuestion));
  }

  if (has("overview") || has("personality")) {
    const mercury = chart.planets.find((planet) => planet.key === "mercury")!;
    const mars = chart.planets.find((planet) => planet.key === "mars")!;
    sections.push(
      [
        "**Điểm mạnh tự nhiên**",
        `- ${placement(mercury)}`,
        `- ${placement(mars)}`,
        `- Nguồn lực lớn nhất của bạn: ${SIGN_TRAITS[signNameOf(chart.ascendant)]?.strength}.`,
        "",
        "**Điểm cần tiết chế**",
        `- ${SIGN_TRAITS[signNameOf(chart.ascendant)]?.shadow} khi bị đặt dưới áp lực.`,
        `- ${tightestAspects(chart, 2)
          .map((aspect) => `${aspect.fromLabel} - ${aspect.toLabel} (${ASPECT_VI[aspect.type]}): ${ASPECT_TONES[aspect.type]?.challenge}`)
          .join("\n- ")}`
      ].join("\n")
    );
  }

  if (has("career")) {
    const mcSign = signNameOf(chart.midheaven);
    const tenthHouse = chart.houses[9];
    const careerAspects = aspectsTouching(chart, ["sun", "saturn", "jupiter", "mars", "midheaven"], 4);
    const tenthOccupants = chart.planets.filter((planet) => planet.house === 10);

    sections.push(
      [
        "**Sự nghiệp & định hướng nghề**",
        `- Thiên Đỉnh (MC) ở ${mcSign} ${displayAngle(chart.midheaven).split(" ").pop()} — hình ảnh nghề nghiệp bạn hướng tới: ${
          SIGN_TRAITS[mcSign]?.core
        }. Nhà 10 tính từ cung Mọc là ${tenthHouse?.signName}.`,
        `- ${rulerLine(chart, mcSign, "Thiên Đỉnh (MC)")}`,
        `- ${planetsInHouseLine(tenthOccupants, "nhà 10")}`,
        `- ${placement(chart.planets.find((planet) => planet.key === "saturn")!)}`,
        `- ${placement(chart.planets.find((planet) => planet.key === "jupiter")!)}`,
        careerAspects.length
          ? `- Góc chiếu định hình nghề nghiệp:\n${careerAspects.map((aspect) => `  ${aspectPhrase(aspect)}`).join("\n")}`
          : "- Không có góc chiếu mạnh tác động trực tiếp nhóm hành tinh sự nghiệp; con đường của bạn mang tính tự chủ cao."
      ].join("\n")
    );
  }

  if (has("money")) {
    const venus = chart.planets.find((planet) => planet.key === "venus")!;
    const moneyAspects = aspectsTouching(chart, ["venus", "jupiter", "saturn", "sun"], 3);
    sections.push(
      [
        "**Tài chính**",
        `- ${rulerLine(chart, chart.houses[1]?.signName ?? "Kim Ngưu", "Nhà 2 (tiền tự kiếm)")}`,
        `- Nhà 8 (tiền chung, đầu tư) ở ${chart.houses[7]?.signName}: lưu ý khi vay, góp vốn hoặc chia sẻ tài sản.`,
        `- ${placement(venus)}`,
        `- ${placement(chart.planets.find((planet) => planet.key === "saturn")!)}`,
        moneyAspects.length ? `- ${moneyAspects.map((aspect) => aspectPhrase(aspect)).join(" ")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (has("love")) {
    const venus = chart.planets.find((planet) => planet.key === "venus")!;
    const moon = chart.planets.find((planet) => planet.key === "moon")!;
    const loveAspects = aspectsTouching(chart, ["venus", "moon", "mars"], 4);
    sections.push(
      [
        "**Tình cảm & quan hệ**",
        `- ${placement(venus)}`,
        `- ${placement(moon)}`,
        `- ${rulerLine(chart, chart.houses[6]?.signName ?? "Thiên Bình", "Nhà 7 (hôn nhân, đối tác)")}`,
        `- Bạn cần ở đối phương: ${SIGN_TRAITS[chart.houses[6]?.signName ?? "Thiên Bình"]?.strength ?? "sự ổn định và tôn trọng"}.`,
        `- Nhà 5 (hẹn hò, lãng mạn) ở ${chart.houses[4]?.signName}: kiểu "mở đầu" bạn thấy hấp dẫn.`,
        loveAspects.length ? `- Các góc chiếu chính:\n${loveAspects.map((aspect) => `  ${aspectPhrase(aspect)}`).join("\n")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (has("health")) {
    const mars = chart.planets.find((planet) => planet.key === "mars")!;
    const moon = chart.planets.find((planet) => planet.key === "moon")!;
    sections.push(
      [
        "**Sức khỏe & nhịp sống**",
        `- Cung Mọc ${signNameOf(chart.ascendant)} mô tả thể trạng nền và cách cơ thể bạn phản ứng với áp lực: ${
          SIGN_TRAITS[signNameOf(chart.ascendant)]?.core
        }.`,
        `- Nhà 6 ở ${chart.houses[5]?.signName} — thói quen và công việc thường ngày ảnh hưởng trực tiếp tới sức bền.`,
        `- ${placement(moon)}`,
        `- ${placement(mars)}`,
        "- Đây là thông tin tham khảo về xu hướng. Mọi vấn đề sức khỏe cụ thể cần bác sĩ thăm khám, không dùng chiêm tinh để chẩn đoán hay bỏ thuốc."
      ].join("\n")
    );
  }

  if (has("family")) {
    sections.push(
      [
        "**Gia đình & gốc rễ**",
        `- ${rulerLine(chart, chart.houses[3]?.signName ?? "Cự Giải", "Nhà 4 (tổ ấm, nền tảng)")}`,
        `- IC ở ${displayAngle(chart.imumCoeli)} — nền cảm xúc bạn lớn lên mang màu sắc này.`,
        `- ${placement(chart.planets.find((planet) => planet.key === "moon")!)}`,
        `- Nhà 5 (con cái, sáng tạo) ở ${chart.houses[4]?.signName}.`
      ].join("\n")
    );
  }

  if (has("study")) {
    const mercury = chart.planets.find((planet) => planet.key === "mercury")!;
    sections.push(
      [
        "**Học tập & phát triển trí tuệ**",
        `- ${placement(mercury)}`,
        `- ${rulerLine(chart, chart.houses[2]?.signName ?? "Song Tử", "Nhà 3 (học nền, viết, giao tiếp gần)")}`,
        `- ${rulerLine(chart, chart.houses[8]?.signName ?? "Nhân Mã", "Nhà 9 (học cao, triết lý)")}`,
        `- ${placement(chart.planets.find((planet) => planet.key === "jupiter")!)}`
      ].join("\n")
    );
  }

  if (has("travel")) {
    sections.push(
      [
        "**Di chuyển, nơi ở & mở rộng**",
        `- ${rulerLine(chart, chart.houses[8]?.signName ?? "Nhân Mã", "Nhà 9 (hành trình xa)")}`,
        `- Nhà 12 ở ${chart.houses[11]?.signName}: nơi bạn cần lui về để hồi phục.`,
        `- ${placement(chart.planets.find((planet) => planet.key === "uranus")!)}`
      ].join("\n")
    );
  }

  if (has("timing")) {
    sections.push(
      [
        "**Vận hạn giai đoạn hiện tại (transit)**",
        transitSection(input),
        "",
        `Pha Mặt Trăng hôm nay: ${input.sky.moonPhase} — ${MOON_PHASE_TRAITS[input.sky.moonPhase] ?? ""}. Mặt Trăng đi hết một vòng 12 cung trong khoảng 27,3 ngày nên có thể dùng để chọn ngày cho việc nhỏ.`
      ].join("\n")
    );
  }

  if (has("compatibility")) {
    const venus = chart.planets.find((planet) => planet.key === "venus")!;
    const descSign = chart.houses[6]?.signName ?? signNameOf(chart.descendant);
    sections.push(
      [
        "**Tương hợp với người khác**",
        `- Để luận tương hợp (synastry) chính xác, tôi cần ngày - giờ - nơi sinh của người kia. Bạn hãy tạo thêm một bản đồ sao với thông tin của họ rồi hỏi lại — tôi sẽ so sánh cặp góc chiếu và nhà chồng lấn.`,
        `- Trong lúc chờ, đây là "hồ sơ" quan hệ của bạn: Nhà 7 ở ${descSign} (kiểu đối tác bạn dễ gắn bó), Kim Tinh ở ${signNameOf(
          venus.longitude
        )} (điều bạn thấy đẹp và đáng giá), Mặt Trăng ở ${signNameOf(chart.planets.find((planet) => planet.key === "moon")!.longitude)} (nhu cầu cảm xúc phải được đáp ứng).`,
        `- Nhóm cung dễ đồng điệu về nguyên tố: ${
          signNameOf(chart.ascendant) === "Bạch Dương" ? "Lửa và Khí" : ELEMENT_TRAITS[elementOfSign(signNameOf(chart.ascendant))]?.trait + " (cùng nguyên tố hoặc nguyên tố tương sinh với bạn)"
        }.`
      ].join("\n")
    );
  }

  if (has("fixedstar")) {
    sections.push(["**Sao cố định gắn với bản đồ natal**", fixedStarSection(input)].join("\n"));
  }

  if (has("sky")) {
    sections.push(["**Bầu trời tại thời điểm này**", skySection(input)].join("\n"));
  }

  if (has("chart")) {
    const specific = houseSpecificSection(chart, input.question);
    sections.push(
      [
        "**Giải thích nhanh các khái niệm trong bản đồ của bạn**",
        `- Cung Mọc (AC) ${displayAngle(chart.ascendant)} là điểm cung hoàng đạo mọc ở chân trời phía đông lúc bạn sinh — quyết định hệ thống nhà Whole Sign.`,
        `- Thiên Đỉnh (MC) ${displayAngle(chart.midheaven)} là đỉnh cao sự nghiệp và hình ảnh xã hội.`,
        `- Nhà là 12 lĩnh vực của đời sống; nhà 1 bắt đầu từ cung Mọc và đi ngược chiều kim đồng hồ theo thứ tự các cung hoàng đạo.`,
        `- ${rulerLine(chart, signNameOf(chart.ascendant), "Cung Mọc (AC)")}`,
        `- Góc chiếu là quan hệ hình học giữa các hành tinh (0°, 60°, 90°, 120°, 180°) ± orb. Bản đồ của bạn có ${chart.aspects.length} góc chiếu trong ngưỡng orb đã chọn.`,
        specific ? "" : null,
        specific
      ]
        .filter((item): item is string => Boolean(item))
        .join("\n")
    );
  }

  if (has("lucky") || has("overview")) {
    const sunSign = signNameOf(chart.planets.find((planet) => planet.key === "sun")!.longitude);
    const element = elementOfSign(sunSign);
    const palette: Record<string, string> = {
      fire: "đỏ, cam, vàng đồng",
      earth: "xanh rêu, nâu đất, be",
      air: "trắng, bạc, xanh nhạt",
      water: "xanh biển, tím, xanh ngọc"
    };
    sections.push(
      [
        "**Gợi ý nhỏ mang tính tham khảo**",
        `- Bảng màu hợp khí chất: ${palette[element]}.`,
        `- Hành tinh nên "học theo": ${PLANET_KEYWORDS[dominantPlanetKey(chart)]?.label} — ${
          PLANET_KEYWORDS[dominantPlanetKey(chart)]?.need
        }.`,
        `- Khung giờ thường thuận cho việc quan trọng: buổi ${chart.planets.find((planet) => planet.key === "sun")!.house % 2 === 0 ? "chiều - tối" : "sáng"} khi Mặt Trăng đi qua nhà ${chart.planets.find((planet) => planet.key === "moon")!.house}.`
      ].join("\n")
    );
  }

  const specific = houseSpecificSection(chart, input.question);
  if (specific && !has("chart")) sections.push(`**Câu hỏi trực tiếp về nhà trong bản đồ**\n${specific}`);

  sections.push(["**Gợi ý hành động**", recommendations(intents, chart, input.transits)].join("\n"));
  sections.push(sourceNote(input));

  return sections.join("\n\n");
};

const planetsInHouseLine = (planets: PlanetPosition[], where: string) =>
  planets.length
    ? `Hành tinh trong ${where}: ${planets
        .map((planet) => `${planet.label} (${signNameOf(planet.longitude)})`)
        .join(", ")} → ${houseTopics(planets[0].house)} trở thành trọng tâm.`
    : `Chưa có hành tinh nào nằm trực tiếp trong ${where}; hãy đọc theo hành tinh chủ quản của cung đặt ở đó.`;

const elementOfSign = (sign: string): string => {
  const map: Record<string, string> = {
    "Bạch Dương": "fire",
    "Sư Tử": "fire",
    "Nhân Mã": "fire",
    "Kim Ngưu": "earth",
    "Xử Nữ": "earth",
    "Ma Kết": "earth",
    "Song Tử": "air",
    "Thiên Bình": "air",
    "Bảo Bình": "air",
    "Cự Giải": "water",
    "Bọ Cạp": "water",
    "Song Ngư": "water"
  };
  return map[sign] ?? "fire";
};

const dominantPlanetKey = (chart: ChartData) => {
  const angular = chart.planets.filter((planet) => [1, 4, 7, 10].includes(planet.house));
  const chartRuler = chart.planets.find((planet) => planet.house === 1) ?? chart.planets[0];
  const score = new Map<string, number>();

  for (const planet of chart.planets) {
    let value = 1;
    if (angular.includes(planet)) value += 2;
    value += chart.aspects.filter((aspect) => aspect.from === planet.key || aspect.to === planet.key).length * 0.5;
    score.set(planet.key, value);
  }
  score.set(chartRuler.key, (score.get(chartRuler.key) ?? 0) + 1);

  return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

export const suggestionChips = [
  "Tổng quan bản đồ sao của tôi có gì đáng chú ý?",
  "Sự nghiệp và hướng phát triển nghề nghiệp phù hợp?",
  "Tình cảm: tôi cần kiểu người thế nào?",
  "Tài chính năm nay cần lưu ý điều gì?",
  "Vận hạn 12 tháng tới theo transit?",
  "Sao cố định nào đang chiếu vào Mặt Trời của tôi?",
  "Tối nay tôi thấy được hành tinh nào trên bầu trời?",
  "Nhà 7 của tôi nói gì về hôn nhân?",
  "Có những biến thể bản đồ sao nào?",
  "Vì sao cùng một hành tinh lại ở nhà khác nhau giữa các hệ nhà?",
  "Lá số Vệ Đà của tôi nói gì?",
  "Tứ Trụ và Tử Vi của tôi thế nào?",
  "Human Design của tôi là kiểu người gì?",
  "Điểm ảo Chiron, Lilith, tiểu hành tinh nghĩa là gì?"
];
