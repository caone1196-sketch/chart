import type { ChartData, TransitHit } from "@/lib/astro";
import { ELEMENT_VI, MODALITY_VI, displayAngle, formatOffset } from "@/lib/astro";
import type { FixedStarHit } from "@/lib/sky";

const card = "rounded-2xl border border-slate-800 bg-slate-900/50 p-5 md:p-6";
const row = "flex items-center justify-between border-b border-slate-800 py-2 text-sm";

const ASPECT_VI: Record<string, string> = {
  Conjunction: "Trùng tụ",
  Sextile: "Lục hợp",
  Square: "Vuông góc",
  Trine: "Tam hợp",
  Opposition: "Đối đỉnh"
};

export default function ChartPanel({
  chart,
  transits,
  fixedStars
}: {
  chart: ChartData;
  transits: TransitHit[];
  fixedStars: FixedStarHit[];
}) {
  const elements = Object.entries(chart.elements).sort((a, b) => b[1] - a[1]);
  const modalities = Object.entries(chart.modalities).sort((a, b) => b[1] - a[1]);
  const total = elements.reduce((sum, [, value]) => sum + value, 0) || 1;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={card}>
        <h3 className="text-xl font-semibold">Góc quan trọng &amp; cân bằng</h3>
        <div className="mt-4">
          {[
            { label: "AC — Cung Mọc", value: displayAngle(chart.ascendant), color: "text-sky-300" },
            { label: "DC — Cung Lặn", value: displayAngle(chart.descendant), color: "text-sky-300" },
            { label: "MC — Thiên Đỉnh", value: displayAngle(chart.midheaven), color: "text-amber-300" },
            { label: "IC — Đáy trời", value: displayAngle(chart.imumCoeli), color: "text-amber-300" },
            { label: "Pha Mặt Trăng lúc sinh", value: chart.moonPhase, color: "text-slate-300" }
          ].map((item) => (
            <div key={item.label} className={row}>
              <span className={item.color}>{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>

        <h4 className="mt-6 text-sm font-semibold uppercase tracking-wider text-slate-400">Cân bằng nguyên tố</h4>
        <div className="mt-3 space-y-2">
          {elements.map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between text-xs text-slate-300">
                <span>{ELEMENT_VI[key] ?? key}</span>
                <span>
                  {value} điểm · {Math.round((value / total) * 100)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400"
                  style={{ width: `${(value / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Tính chất: {modalities.map(([key, value]) => `${MODALITY_VI[key] ?? key} ${value}`).join(" · ")}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Lập lúc {chart.utcDate.toUTCString()} · {chart.timezoneId ?? "múi giờ thủ công"} ({formatOffset(chart.timezoneOffset)}) ·{" "}
          {chart.locationLabel}
        </p>
      </div>

      <div className={card}>
        <h3 className="text-xl font-semibold">Vị trí hành tinh</h3>
        <div className="mt-4">
          {chart.planets.map((planet) => (
            <div key={planet.key} className={row}>
              <span className="font-medium" style={{ color: planet.color }}>
                {planet.label}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-slate-500 text-xs">nhà {planet.house}</span>
                <span className="text-slate-200">{displayAngle(planet.longitude)}</span>
                <span className={planet.retrograde ? "text-rose-300 text-xs" : "text-slate-600 text-xs"}>
                  {planet.retrograde ? "nghịch hành" : `+${planet.speed.toFixed(2)}°/ngày`}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-xl font-semibold">12 nhà (Whole Sign)</h3>
        <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
          {chart.houses.map((house) => (
            <div key={house.house} className={row}>
              <span className="text-slate-400">Nhà {house.house}</span>
              <span>
                {house.signName} <span className="text-slate-500 text-xs">({displayAngle(house.cusp).split(" ").pop()})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-xl font-semibold">Góc chiếu trong bản đồ ({chart.aspects.length})</h3>
        <div className="mt-4 max-h-80 overflow-y-auto">
          {chart.aspects.length === 0 ? <p className="text-sm text-slate-400">Không có góc chiếu trong ngưỡng orb.</p> : null}
          {chart.aspects.map((aspect) => (
            <div key={`${aspect.from}-${aspect.to}-${aspect.type}`} className={row}>
              <span className="text-slate-200">
                {aspect.fromLabel} – {aspect.toLabel}
              </span>
              <span className="flex items-center gap-3 text-xs">
                <span style={{ color: aspect.color }}>{ASPECT_VI[aspect.type] ?? aspect.type}</span>
                <span className="text-slate-400">orb {aspect.orb.toFixed(2)}°</span>
                <span className="text-slate-500">{aspect.trend === "Applying" ? "áp sát" : "tách"}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-xl font-semibold">Sao cố định gần điểm natal</h3>
        <p className="mt-1 text-xs text-slate-400">Các sao sáng có tên trong 1.5° so với Mặt Trời, Mặt Trăng, hành tinh, AC hoặc MC.</p>
        <div className="mt-4 max-h-80 overflow-y-auto">
          {fixedStars.length === 0 ? (
            <p className="text-sm text-slate-400">Không có sao cố định nào nằm trong 1.5° so với các điểm chính.</p>
          ) : null}
          {fixedStars.slice(0, 24).map((hit) => (
            <div key={`${hit.starName}-${hit.natalLabel}`} className="border-b border-slate-800 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-100">
                  {hit.starName} <span className="text-xs text-slate-500">{hit.constellation}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {hit.signName} {hit.degree}°{String(hit.minutes).padStart(2, "0")}′ · cách {hit.natalLabel} {hit.orb.toFixed(2)}°
                </span>
              </div>
              {hit.meaning ? <p className="mt-1 text-xs text-slate-400">{hit.meaning}.</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-xl font-semibold">Transit hiện tại lên bản đồ</h3>
        <p className="mt-1 text-xs text-slate-400">Hành tinh trên trời hiện tại tạo góc chiếu (orb ≤ 4°) với các điểm natal.</p>
        <div className="mt-4 max-h-80 overflow-y-auto">
          {transits.length === 0 ? <p className="text-sm text-slate-400">Hiện chưa có transit nào trong ngưỡng orb.</p> : null}
          {transits.slice(0, 24).map((hit) => (
            <div key={`${hit.transitKey}-${hit.natalKey}-${hit.aspect}`} className={row}>
              <span className="text-slate-200">
                {hit.transitLabel} {ASPECT_VI[hit.aspect] ?? hit.aspect} {hit.natalLabel}
              </span>
              <span className="text-xs text-slate-400">
                orb {hit.orb.toFixed(2)}° · {hit.applying ? "áp sát" : "tách"}
                {hit.transitRetrograde ? " · R" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
