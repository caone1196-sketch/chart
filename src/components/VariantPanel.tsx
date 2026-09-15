import { useMemo, useState } from "react";
import type { ChartData } from "@/lib/astro";
import { displayAngle } from "@/lib/astro";
import { HOUSE_SYSTEMS, type HouseSystemId } from "@/lib/houses";
import { ZODIAC_FRAMES, type ZodiacFrameId } from "@/lib/zodiac";
import { VARIANT_CARDS, VARIANT_GROUPS } from "@/lib/variants-knowledge";
import { compareHouseSystems, compareZodiacFrames, type VariantChart } from "@/lib/chart-variants";

const card = "rounded-2xl border border-slate-800 bg-slate-900/50 p-5";
const sub = "text-xs uppercase tracking-wider text-slate-400";
const row = "flex items-center justify-between gap-3 border-b border-slate-800/70 py-1.5 text-sm";

const TABS = [
  { id: "houses", label: "Hệ nhà" },
  { id: "frame", label: "Hoàng đạo" },
  { id: "points", label: "Điểm ảo" },
  { id: "patterns", label: "Hình mẫu" },
  { id: "vedic", label: "Vệ Đà" },
  { id: "chinese", label: "Trung Hoa · Maya" },
  { id: "design", label: "Human Design" },
  { id: "predict", label: "Dự báo" },
  { id: "knowledge", label: "Kiến thức biến thể" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function VariantPanel({
  variant,
  chart,
  onHouseSystem,
  onZodiacFrame
}: {
  variant: VariantChart;
  chart: ChartData;
  onHouseSystem: (id: HouseSystemId) => void;
  onZodiacFrame: (id: ZodiacFrameId) => void;
}) {
  const [tab, setTab] = useState<TabId>("houses");
  const dashaNow = useMemo(() => variant.vedic.dasha.find((period) => period.isCurrent) ?? variant.vedic.dasha[0], [variant]);
  const houseComparison = useMemo(() => compareHouseSystems(chart), [chart]);
  const frameComparison = useMemo(() => compareZodiacFrames(chart), [chart]);

  const dateText = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ") + " UTC";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Biến thể bản đồ sao</h2>
          <p className="text-sm text-slate-400">
            {variant.houseSystemLabel} ·{" "}
            {variant.zodiacFrame === "tropical"
              ? "hoàng đạo nhiệt đới"
              : `${ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame)?.label ?? variant.zodiacFrame} (ayanamsa ${variant.ayanamsaValue.toFixed(3)}°)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={variant.houseSystem}
            onChange={(event) => onHouseSystem(event.target.value as HouseSystemId)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
          >
            {HOUSE_SYSTEMS.map((system) => (
              <option key={system.id} value={system.id}>
                Hệ nhà: {system.label}
              </option>
            ))}
          </select>
          <select
            value={variant.zodiacFrame}
            onChange={(event) => onZodiacFrame(event.target.value as ZodiacFrameId)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
          >
            {ZODIAC_FRAMES.map((frame) => (
              <option key={frame.id} value={frame.id}>
                Hoàng đạo: {frame.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              tab === item.id
                ? "border-sky-400/70 bg-sky-400/15 text-sky-200"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "houses" && (
        <>
        <div className={`${card} overflow-x-auto`}>
          <h3 className="text-lg font-semibold">So sánh 12 hệ chia nhà</h3>
          <p className="mt-1 text-xs text-slate-400">
            Ô đậm là nhà khác với hệ đang chọn ({variant.houseSystemLabel}). Đây là lý do cùng một hành tinh có thể được luận ở nhà 4 hoặc nhà 5
            tuỳ trường phái.
          </p>
          <table className="mt-3 w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="p-1.5 text-left">Hệ nhà</th>
                <th className="p-1.5">Cusp 1</th>
                {chart.planets.map((planet) => (
                  <th key={`h-${planet.key}`} className="p-1.5 text-base" title={planet.label}>
                    <span aria-hidden="true">{planet.glyph}</span>
                    <span className="sr-only">{planet.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {houseComparison.map((entry) => {
                const current = entry.id === variant.houseSystem;
                return (
                  <tr key={entry.id} className={`border-t border-slate-800 ${current ? "bg-sky-400/10 text-sky-100" : "text-slate-300"}`}>
                    <td className="p-1.5 text-left">
                      {entry.label}
                      {current ? " •" : ""}
                    </td>
                    <td className="p-1.5 text-center">{displayAngle(entry.cusp1)}</td>
                    {chart.planets.map((planet) => {
                      const house = entry.houses[planet.key];
                      const base = variant.cusps.length ? houseComparison.find((item) => item.id === variant.houseSystem)?.houses[planet.key] : house;
                      const changed = base !== undefined && house !== base;
                      return (
                        <td key={`h-${entry.id}-${planet.key}`} className={`p-1.5 text-center ${changed ? "font-semibold text-amber-200" : ""}`}>
                          {house}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {chart.planets.map((planet) => (
              <span key={`legend-${planet.key}`}>
                <span className="text-slate-200">{planet.glyph}</span> {planet.label}
              </span>
            ))}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Cusp 1 là điểm bắt đầu nhà 1 của từng hệ. Toàn cung/Chia bằng nhau từ Thiên Đỉnh/Morinus/Sripati cố ý không đặt cusp 1
            ở Cung Mọc; Sripati lấy <em>giữa</em> nhà làm cusp nên cusp 1 lệch khỏi Cung Mọc khoảng nửa nhà.
          </p>
          {chart.houseNote && <p className="mt-2 text-xs text-amber-200">⚠ {chart.houseNote}</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">Cusp 12 nhà — {variant.houseSystemLabel}</h3>
            <div className="mt-3">
              {variant.cusps.map((cusp, index) => (
                <div key={index} className={row}>
                  <span className="text-slate-300">
                    Nhà {index + 1} · {variant.cuspSigns[index]}
                  </span>
                  <span className="text-slate-100">{displayAngle(cusp)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              AC {displayAngle(chart.ascendant)} · MC {displayAngle(chart.midheaven)} · Vertex {displayAngle(chart.vertex)} · East Point{" "}
              {displayAngle(chart.eastPoint)}
            </p>
            {chart.houseNote && <p className="mt-2 text-xs text-amber-200">⚠ {chart.houseNote}</p>}
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Hành tinh theo nhà</h3>
            <div className="mt-3">
              {chart.planets.map((planet) => (
                <div key={planet.key} className={row}>
                  <span className="text-slate-300">{planet.label}</span>
                  <span className="text-slate-100">
                    {displayAngle(planet.longitude)} · nhà {planet.house}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Hệ nhà quyết định “sân khấu” của hành tinh: cùng một độ hoàng đạo có thể nằm ở nhà khác nhau tuỳ hệ, làm đổi cách luận.
            </p>
          </div>
        </div>
        </>
      )}

      {tab === "frame" && (
        <div className={card}>
          <h3 className="text-lg font-semibold">Hệ hoàng đạo &amp; ayanamsa</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className={sub}>Vị trí theo hệ đang chọn</p>
              {["ascendant", "sun", "moon", "mercury", "venus", "mars"].map((key) => {
                const planet = chart.planets.find((item) => item.key === key);
                const value = variant.sidereal[key];
                return (
                  <div key={key} className={row}>
                    <span className="text-slate-300">{planet?.label ?? "Cung Mọc"}</span>
                    <span className="text-slate-100">{displayAngle(value ?? 0)}</span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              {(ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame) ?? ZODIAC_FRAMES[0]) && (
                <>
                  <p className={sub}>Đang dùng</p>
                  <p className="text-slate-100">
                    {ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame)?.label} — ayanamsa{" "}
                    {variant.ayanamsaValue.toFixed(4)}°
                  </p>
                  <p>{ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame)?.idea}</p>
                  <p className="text-slate-400">Dùng tốt cho: {ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame)?.use}</p>
                  <p className="text-slate-400">Gốc quy chiếu: {ZODIAC_FRAMES.find((frame) => frame.id === variant.zodiacFrame)?.epoch}</p>
                </>
              )}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <p className="mb-2 text-slate-300">Cùng một bản đồ theo 7 hệ hoàng đạo:</p>
                {frameComparison.map((frame) => (
                  <p key={frame.id} className="text-slate-400">
                    {frame.label} (ayanamsa {frame.ayanamsa.toFixed(3)}°): Mặt Trời {frame.sun} · Mặt Trăng {frame.moon} · Cung Mọc {frame.ascendant}
                  </p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                Ayanamsa kiểm chứng với Swiss Ephemeris: Lahiri/Fagan-Bradley lệch ≤ 0,0006°, hệ Ngân Hà ≤ 0,006°.
                Tiểu hành tinh dùng mô hình Kepler từ phần tử JPL; hành tinh giả định theo bảng chuẩn của trường phái Hamburg (lệch ≤ 0,007°).
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "points" && (
        <div className="grid gap-4 md:grid-cols-2">
          {variant.extraPoints.map((point) => (
            <div key={point.key} className={card}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold" style={{ color: point.color }}>
                  {point.label}
                </h3>
                <span className="text-sm text-slate-200">{displayAngle(point.longitude)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{point.meaning}</p>
              <p className="mt-1 text-xs text-slate-500">
                Nhà {point.house} · {point.kind === "hypothetical" ? "điểm quy ước (không có thiên thể thật)" : "thiên thể thật"}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "patterns" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">
              Hình dạng: {variant.shape.label}
            </h3>
            <p className="mt-2 text-sm text-slate-300">{variant.shape.meaning}</p>
            <p className="mt-2 text-sm text-sky-200">{variant.shape.advice}</p>
            <p className="mt-2 text-xs text-slate-400">{variant.shape.focus}</p>
            <p className="mt-2 text-xs text-slate-400">
              Ưu thế bán cầu: trên {variant.hemispheres.north} / dưới {variant.hemispheres.south} · đông {variant.hemispheres.east} / tây{" "}
              {variant.hemispheres.west}. {variant.hemispheres.note}
            </p>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Hình mẫu góc chiếu</h3>
            {variant.patterns.length === 0 && <p className="mt-2 text-sm text-slate-400">Không có cấu hình lớn nào trong bản đồ này.</p>}
            <div className="mt-3 space-y-3">
              {variant.patterns.map((pattern) => (
                <div key={pattern.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-sm font-semibold text-slate-100">{pattern.label}</p>
                  <p className="text-xs text-sky-200">{pattern.members.join(" · ")}</p>
                  <p className="mt-1 text-sm text-slate-300">{pattern.meaning}</p>
                  <p className="mt-1 text-xs text-slate-400">{pattern.advice}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "vedic" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">Rashi · Nakshatra · Pada</h3>
            <p className="mt-1 text-xs text-slate-400">
              Sidereal (Jyotish) · ayanamsa Lahiri {variant.vedic.ayanamsa.toFixed(3)}° — luôn tính theo hệ sidereal, không phụ thuộc hệ hoàng đạo
              đang chọn ở trên.
            </p>
            <div className="mt-3">
              {variant.vedic.planets.map((planet) => (
                <div key={planet.key} className={row}>
                  <span className="text-slate-300">
                    {planet.label} — {planet.rashi} ({planet.rashiVi})
                  </span>
                  <span className="text-slate-100">
                    {planet.nakshatra} · pada {planet.pada}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Cung Mọc sidereal: {variant.vedic.ascendantRashi} · Janma rashi (Mặt Trăng): {variant.vedic.janmaRashi} · Nakshatra Mặt Trăng:{" "}
              {variant.vedic.moonNakshatra} (pada {variant.vedic.moonPada})
            </p>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Vimshottari Dasha</h3>
            <p className="mt-2 text-sm text-slate-300">
              Đang ở <span className="text-sky-200">{variant.vedic.currentMahadasha}</span> /{" "}
              <span className="text-sky-200">{variant.vedic.currentAntardasha}</span>
            </p>
            <div className="mt-3">
              {variant.vedic.dasha.map((period) => (
                <div key={`${period.lord}-${period.start.toISOString()}`} className={row}>
                  <span className={period.isCurrent ? "text-sky-200" : "text-slate-300"}>{period.lord}</span>
                  <span className="text-xs text-slate-400">
                    {period.start.getFullYear()} – {period.end.getFullYear()} {period.isCurrent ? "· hiện tại" : ""}
                  </span>
                </div>
              ))}
            </div>
            {dashaNow && (
              <p className="mt-2 text-xs text-slate-400">
                Mahadasha hiện tại kéo dài tới {dateText(dashaNow.end)}. Antardasha kế tiếp:{" "}
                {variant.vedic.antara.find((period) => !period.isCurrent && period.end.getTime() > Date.now())?.lord ?? "—"}.
              </p>
            )}
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Panchang &amp; Varga</h3>
            <div className="mt-3 text-sm text-slate-300">
              <p>
                Tithi: {variant.vedic.panchang.tithi} ({variant.vedic.panchang.paksha}) · Nakshatra: {variant.vedic.panchang.nakshatra}
              </p>
              <p>
                Yoga: {variant.vedic.panchang.yoga} · Karana: {variant.vedic.panchang.karana} · Vara: {variant.vedic.panchang.vara}
              </p>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              {variant.vedic.vargas.map((varga) => (
                <div key={varga.id}>
                  <p className="text-slate-200">
                    {varga.label} — {varga.use}
                  </p>
                  <p className="text-slate-400">
                    Mặt Trời: {varga.signs["Mặt Trời"]} · Mặt Trăng: {varga.signs["Mặt Trăng"]} · Cung Mọc: {varga.signs["Cung Mọc"]}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Ghi chú Jyotish</h3>
            <p className="mt-2 text-sm text-slate-300">{variant.vedic.yoga}</p>
            {variant.vedic.doshaNotes.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {variant.vedic.doshaNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Luôn dùng hệ hoàng đạo sidereal khi đọc Jyotish; dasha tính từ vị trí Mặt Trăng và ayanamsa đang chọn.
            </p>
          </div>
        </div>
      )}

      {tab === "chinese" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">Tứ Trụ (BaZi)</h3>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {variant.chinese.bazi.pillars.map((pillar) => (
                <div key={pillar.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-xs text-slate-400">{pillar.label}</p>
                  <p className="text-lg font-semibold text-slate-100">{pillar.stemVi}</p>
                  <p className="text-lg font-semibold text-slate-100">{pillar.branchVi}</p>
                  <p className="text-[10px] text-slate-500">{pillar.animal}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-300">
              Nhật chủ: {variant.chinese.bazi.dayMaster.vi} ({variant.chinese.bazi.dayMaster.element}·
              {variant.chinese.bazi.dayMaster.yang ? " dương" : " âm"}) — {variant.chinese.bazi.dayMasterStrength.note}
            </p>
            <p className="mt-1 text-sm text-sky-200">{variant.chinese.bazi.usefulGodHint}</p>
            <div className="mt-3">
              {Object.entries(variant.chinese.bazi.elementScore).map(([element, score]) => (
                <div key={element} className={row}>
                  <span className="text-slate-300">{element}</span>
                  <span className="text-slate-100">{score.toFixed(1)} điểm</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              <p className="text-slate-300">Thập thần theo trụ:</p>
              {variant.chinese.bazi.pillars.map((pillar) => (
                <p key={`god-${pillar.label}`}>
                  {pillar.label}: {pillar.tenGod.vi} — {pillar.tenGod.meaning}
                </p>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              <p className="text-slate-300">Đại vận ({variant.chinese.bazi.luckDirection})</p>
              {variant.chinese.bazi.luckPillars.slice(0, 5).map((luck) => (
                <p key={luck.vi + luck.ageStart}>
                  {luck.ageStart.toFixed(1)} tuổi: {luck.vi} · {luck.tenGod.vi}
                </p>
              ))}
            </div>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Tử Vi Đẩu Số</h3>
            <p className="mt-2 text-sm text-slate-300">
              Ngày {variant.chinese.ziwei.lunarDay} tháng {variant.chinese.ziwei.lunarMonth}
              {variant.chinese.ziwei.leapMonth ? " nhuận" : ""} âm lịch · {variant.chinese.ziwei.bureau.name} · Mệnh chủ{" "}
              {variant.chinese.ziwei.lifeMaster} · Thân chủ {variant.chinese.ziwei.bodyMaster}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Tứ Hóa năm sinh: {variant.chinese.ziwei.transformations.map((item) => `${item.star} hóa ${item.label}`).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-slate-400">{variant.chinese.ziwei.note}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {variant.chinese.ziwei.palaces.map((palace) => (
                <div
                  key={palace.name}
                  className={`rounded-lg border p-2 text-xs ${
                    palace.isLife ? "border-amber-400/60 bg-amber-400/10" : "border-slate-800 bg-slate-950/50"
                  }`}
                >
                  <p className="text-slate-100">
                    {palace.name}
                    {palace.isBody && !palace.isLife ? " (Thân)" : ""} · {palace.stemVi}
                    {palace.branchVi}
                  </p>
                  <p className="text-slate-400">{palace.meaning}</p>
                  {palace.stars.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      {palace.stars.map((star) => (
                        <span
                          key={star.name}
                          className={
                            star.kind === "major"
                              ? "text-sky-200"
                              : star.kind === "lucky"
                                ? "text-emerald-200"
                                : star.kind === "malefic"
                                  ? "text-rose-200"
                                  : "text-amber-200"
                          }
                        >
                          {star.name}
                          {star.mutagen ? ` (${star.mutagen})` : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Maya (Tzolk'in &amp; Haab)</h3>
            <p className="mt-2 text-sm text-slate-300">
              {variant.chinese.mayan.tzolkin.full} · {variant.chinese.mayan.haab.full} · Long Count {variant.chinese.mayan.longCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">{variant.chinese.mayan.meaning}</p>
            <p className="mt-1 text-xs text-slate-500">{variant.chinese.mayan.galacticNote}</p>
          </div>
        </div>
      )}

      {tab === "design" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">{variant.design.typeVi}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p>
                <span className="text-slate-400">Chiến lược:</span> {variant.design.strategy}
              </p>
              <p>
                <span className="text-slate-400">Thẩm quyền:</span> {variant.design.authority} — {variant.design.authorityVi}
              </p>
              <p>
                <span className="text-slate-400">Hồ sơ:</span> {variant.design.profile} — {variant.design.profileName}
              </p>
              <p>
                <span className="text-slate-400">Bóng tối:</span> {variant.design.notSelf} → phần thưởng: {variant.design.signature}
              </p>
              <p>
                <span className="text-slate-400">Định nghĩa:</span> {variant.design.definition} — {variant.design.definitionNote}
              </p>
            </div>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Cổng · kênh · trung tâm</h3>
            <p className="mt-2 text-xs text-slate-400">Tính cách (13 thiên thể lúc sinh)</p>
            <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-300">
              {variant.design.personality.map((gate) => (
                <span key={gate.key}>
                  {gate.label}: {gate.gate}.{gate.line}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">Thiết kế (88° trước Mặt Trời)</p>
            <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-300">
              {variant.design.design.map((gate) => (
                <span key={gate.key}>
                  {gate.label}: {gate.gate}.{gate.line}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Trung tâm xác định: {variant.design.definedCenters.join(", ") || "không có"} · Kênh:{" "}
              {variant.design.channels.map((channel) => `${channel.gates[0]}-${channel.gates[1]}`).join(", ") || "không có"}
            </p>
          </div>
        </div>
      )}

      {tab === "predict" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-lg font-semibold">Hồi quy &amp; tiến triển</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p>
                Hồi quy Mặt Trời năm nay: <span className="text-sky-200">{dateText(variant.derived.solarReturn.moment)}</span> (Mặt Trời về{" "}
                {variant.derived.solarReturn.longitudeLabel})
              </p>
              <p>
                Hồi quy Mặt Trăng gần nhất: <span className="text-sky-200">{dateText(variant.derived.lunarReturn.moment)}</span>
              </p>
              <p>
                Tuổi hiện tại: {variant.derived.progression.age.toFixed(2)} · Mặt Trời tiến triển:{" "}
                {displayAngle(variant.derived.progression.points[0].longitude)}
              </p>
              <p>
                Solar arc: {variant.derived.solarArc.arc.toFixed(3)}° — cộng vào mọi điểm natal để xem bước ngoặt.
              </p>
              <p className="text-xs text-slate-400">
                Tiến triển thứ cấp: 1 ngày sau sinh ≈ 1 năm tuổi. Mặt Trăng tiến triển đổi cung khoảng 2,5 năm một lần.
              </p>
            </div>
          </div>
          <div className={card}>
            <h3 className="text-lg font-semibold">Bản đồ phái sinh</h3>
            <p className="mt-2 text-sm text-slate-300">
              Bản đồ Rồng (draconic) — lấy Bắc giao điểm làm 0° Bạch Dương:
            </p>
            <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-300">
              {variant.derived.draconic.slice(0, 8).map((point) => (
                <span key={`drac-${point.key}`}>
                  {point.label}: {displayAngle(point.longitude)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-300">Bản đồ Nhật tâm (heliocentric):</p>
            <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-300">
              {variant.derived.heliocentric.map((point) => (
                <span key={`helio-${point.key}`}>
                  {point.label}: {displayAngle(point.longitude)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-300">Bản đồ Hài hoà (kinh độ × n):</p>
            <div className="mt-1 space-y-1 text-xs text-slate-300">
              {variant.derived.harmonics.map((harmonic) => (
                <p key={harmonic.n}>
                  H{harmonic.n} — {harmonic.meaning}: Mặt Trời {displayAngle(harmonic.points[0].longitude)}, Cung Mọc{" "}
                  {displayAngle(harmonic.points[harmonic.points.length - 1].longitude)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "knowledge" && (
        <div className="space-y-4">
          <div className={card}>
            <h3 className="text-lg font-semibold">Toàn bộ biến thể bản đồ sao ({VARIANT_CARDS.length} mục)</h3>
            <p className="mt-2 text-sm text-slate-300">
              Bản đồ sao không chỉ có một dạng. Mỗi biến thể trả lời một câu hỏi khác nhau: chia nhà thế nào, dùng hệ hoàng đạo nào, thêm
              điểm nào, đọc hình học ra sao, dự báo bằng cách gì, và những truyền thống khác (Vệ Đà, Trung Hoa, Maya, Human Design) dùng
              hệ quy chiếu riêng.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              {VARIANT_GROUPS.map((group) => (
                <span key={group} className="rounded-full border border-slate-700 px-2 py-1">
                  {group}: {VARIANT_CARDS.filter((item) => item.group === group).length}
                </span>
              ))}
            </div>
          </div>
          {VARIANT_GROUPS.map((group) => (
            <div key={group} className="space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{group}</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {VARIANT_CARDS.filter((item) => item.group === group).map((item) => (
                  <details key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">{item.name}</summary>
                    <p className="mt-2 text-sm text-slate-300">{item.short}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      <span className="text-slate-300">Nguồn gốc:</span> {item.origin}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      <span className="text-slate-300">Cách tính:</span> {item.method}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      <span className="text-slate-300">Cách đọc:</span> {item.reading}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      <span className="text-slate-300">Dùng tốt nhất cho:</span> {item.bestFor}
                    </p>
                    <p className="mt-1 text-xs text-amber-200/80">
                      <span>Lưu ý:</span> {item.caution}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
