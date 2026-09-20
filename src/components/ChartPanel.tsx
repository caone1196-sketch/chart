import { useState } from "react";
import type { ChartData, TransitHit } from "@/lib/astro";
import { ELEMENT_VI, MODALITY_VI, displayAngle, formatOffset } from "@/lib/astro";
import type { FixedStarHit } from "@/lib/sky";

// Cho phép xuống dòng trên màn hình hẹp để không tràn ngang (tên dài + số liệu).
const row =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-slate-800/80 py-1.5 text-[13px] last:border-0 sm:text-sm";

const ASPECT_VI: Record<string, string> = {
  Conjunction: "Trùng tụ",
  Sextile: "Lục hợp",
  Square: "Vuông góc",
  Trine: "Tam hợp",
  Opposition: "Đối đỉnh"
};

type TabId = "overview" | "planets" | "houses" | "aspects" | "fixed" | "transits";

export default function ChartPanel({
  chart,
  transits,
  fixedStars
}: {
  chart: ChartData;
  transits: TransitHit[];
  fixedStars: FixedStarHit[];
}) {
  const [tab, setTab] = useState<TabId>("overview");

  const elements = Object.entries(chart.elements).sort((a, b) => b[1] - a[1]);
  const modalities = Object.entries(chart.modalities).sort((a, b) => b[1] - a[1]);
  const total = elements.reduce((sum, [, value]) => sum + value, 0) || 1;

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Tổng quan" },
    { id: "planets", label: `Hành tinh (${chart.planets.length})` },
    { id: "houses", label: "12 nhà" },
    { id: "aspects", label: `Góc chiếu (${chart.aspects.length})` },
    { id: "fixed", label: `Sao cố định (${fixedStars.length})` },
    { id: "transits", label: `Transit (${transits.length})` }
  ];

  return (
    <div className="card flex min-h-0 w-full max-w-full flex-col p-3 min-[428px]:p-4 sm:p-4 md:p-5 overflow-hidden">
      <div className="no-scrollbar -mx-1 flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2" role="tablist" aria-label="Nội dung kết quả bản đồ sao">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 ${
              tab === item.id
                ? "border-sky-400/70 bg-sky-400/15 text-sky-200"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-2 max-h-[22rem] min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 sm:max-h-[24rem] lg:max-h-[32rem]">
        {tab === "overview" ? (
          <div className="space-y-4">
            <div>
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
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cân bằng nguyên tố</h4>
              <div className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                {elements.map(([key, value]) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>{ELEMENT_VI[key] ?? key}</span>
                      <span>
                        {value} · {Math.round((value / total) * 100)}%
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
              <p className="mt-2 text-xs text-slate-400">
                Tính chất: {modalities.map(([key, value]) => `${MODALITY_VI[key] ?? key} ${value}`).join(" · ")}
              </p>
            </div>
          </div>
        ) : null}

        {tab === "planets" ? (
          <div>
            {chart.planets.map((planet) => (
              <div key={planet.key} className={row}>
                <span className="font-medium" style={{ color: planet.color }}>
                  {planet.label}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5">
                  <span className="text-xs text-slate-500">nhà {planet.house}</span>
                  <span className="text-slate-200">{displayAngle(planet.longitude)}</span>
                  <span className={planet.retrograde ? "text-xs text-rose-300" : "text-xs text-slate-600"}>
                    {planet.retrograde ? "nghịch hành" : `+${planet.speed.toFixed(2)}°/ngày`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "houses" ? (
          <div>
            <p className="mb-1 text-xs text-slate-400">
              Hệ nhà: Toàn cung (Whole Sign) — mỗi cung hoàng đạo là một nhà, tính từ cung Mọc.
            </p>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {chart.houses.map((house) => (
                <div key={house.house} className={row}>
                  <span className="text-slate-400">Nhà {house.house}</span>
                  <span>
                    {house.signName} <span className="text-xs text-slate-500">({displayAngle(house.cusp).split(" ").pop()})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "aspects" ? (
          <div>
            {chart.aspects.length === 0 ? <p className="text-sm text-slate-400">Không có góc chiếu trong ngưỡng orb.</p> : null}
            {chart.aspects.map((aspect) => (
              <div key={`${aspect.from}-${aspect.to}-${aspect.type}`} className={row}>
                <span className="text-slate-200">
                  {aspect.fromLabel} – {aspect.toLabel}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs">
                  <span style={{ color: aspect.color }}>{ASPECT_VI[aspect.type] ?? aspect.type}</span>
                  <span className="text-slate-400">orb {aspect.orb.toFixed(2)}°</span>
                  <span className="text-slate-500">{aspect.trend === "Applying" ? "áp sát" : "tách"}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "fixed" ? (
          <div>
            <p className="mb-1 text-xs text-slate-400">Sao sáng nằm trong 1.5° so với Mặt Trời, Mặt Trăng, hành tinh, AC hoặc MC.</p>
            {fixedStars.length === 0 ? (
              <p className="text-sm text-slate-400">Không có sao cố định nào trong ngưỡng 1.5°.</p>
            ) : null}
            {fixedStars.slice(0, 24).map((hit) => (
              <div key={`${hit.starName}-${hit.natalLabel}`} className="border-b border-slate-800/80 py-1.5 text-[13px] last:border-0 sm:text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span className="text-slate-100">
                    {hit.starName} <span className="text-xs text-slate-500">{hit.constellation}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {hit.signName} {hit.degree}°{String(hit.minutes).padStart(2, "0")}′ · cách {hit.natalLabel} {hit.orb.toFixed(2)}°
                  </span>
                </div>
                {hit.meaning ? <p className="mt-0.5 text-xs text-slate-400">{hit.meaning}.</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {tab === "transits" ? (
          <div>
            <p className="mb-1 text-xs text-slate-400">Hành tinh trên trời hiện tại tạo góc chiếu (orb ≤ 4°) với các điểm natal.</p>
            {transits.length === 0 ? <p className="text-sm text-slate-400">Hiện chưa có transit nào trong ngưỡng orb.</p> : null}
            {transits.slice(0, 24).map((hit) => (
              <div key={`${hit.transitKey}-${hit.natalKey}-${hit.aspect}`} className={row}>
                <span className="text-slate-200">
                  {hit.transitLabel} {ASPECT_VI[hit.aspect] ?? hit.aspect} {hit.natalLabel}
                </span>
                <span className="text-right text-xs text-slate-400">
                  orb {hit.orb.toFixed(2)}° · {hit.applying ? "áp sát" : "tách"}
                  {hit.transitRetrograde ? " · R" : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Lập lúc {chart.utcDate.toUTCString()} · {chart.timezoneId ?? "múi giờ thủ công"} ({formatOffset(chart.timezoneOffset)}) ·{" "}
        {chart.locationLabel}
      </p>
    </div>
  );
}
