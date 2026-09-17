import { useMemo } from "react";
import type { Aspect, House, PlanetPosition } from "@/lib/astro";
import { ZODIAC_SIGNS } from "@/lib/astro";
import {
  WHEEL_CENTER,
  WHEEL_RETRO_OFFSET,
  WHEEL_SIZE,
  WHEEL_STROKES,
  WHEEL_TEXT,
  buildWheelLayout,
  wheelPoint
} from "@/lib/wheel-geometry";

/**
 * Vòng bản đồ sao natal.
 *
 * Toàn bộ toạ độ lấy từ `@/lib/wheel-geometry`: hình học được tính trước ở tầng lib nên
 * không phần tử nào (kể cả chữ và nửa nét vẽ) vượt ra ngoài khung — đúng lỗi "bản đồ bị cắt
 * lẹm" trên điện thoại Android. `tests/wheel.check.ts` soi lại chính SVG này để khẳng định
 * điều đó, kể cả trường hợp 10 hành tinh dồn vào một độ.
 */
export default function ChartWheel({
  planets,
  aspects,
  houses,
  ascendant,
  descendant,
  midheaven,
  imumCoeli,
  highlightKeys = []
}: {
  planets: PlanetPosition[];
  aspects: Aspect[];
  houses: House[];
  ascendant: number;
  descendant: number;
  midheaven: number;
  imumCoeli: number;
  highlightKeys?: string[];
}) {
  const angles = useMemo(
    () => [
      { label: "AC" as const, longitude: ascendant },
      { label: "DC" as const, longitude: descendant },
      { label: "MC" as const, longitude: midheaven },
      { label: "IC" as const, longitude: imumCoeli }
    ],
    [ascendant, descendant, midheaven, imumCoeli]
  );

  const layout = useMemo(
    () => buildWheelLayout({ planets, houses, angles, highlightKeys }),
    [planets, houses, angles, highlightKeys]
  );

  const byKey = useMemo(() => new Map(planets.map((planet) => [planet.key, planet])), [planets]);
  const [glowCircle, bandCircle, outerCircle, innerCircle, aspectCircle] = layout.circles;

  return (
    <svg
      viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
      role="img"
      aria-label="Vòng bản đồ sao: 12 cung hoàng đạo, 12 nhà và vị trí các hành tinh"
      className="mx-auto block h-auto w-full max-w-[32rem] min-[428px]:max-w-[36rem] sm:max-w-[36rem] touch-manipulation"
    >
      <title>Vòng bản đồ sao natal</title>
      <defs>
        <radialGradient id="wheel-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0b1224" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
      </defs>

      {/* Đĩa nền + các vòng đồng tâm (vành hoàng đạo vẽ bằng nét dày thành hình khuyên). */}
      <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={glowCircle.radius} fill="url(#wheel-glow)" />
      <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={bandCircle.radius} fill="none" stroke="#0c1526" strokeWidth={bandCircle.strokeWidth} />
      <circle
        cx={WHEEL_CENTER}
        cy={WHEEL_CENTER}
        r={outerCircle.radius}
        fill="none"
        stroke="#475569"
        strokeWidth={WHEEL_STROKES.zodiacOuter}
      />
      <circle
        cx={WHEEL_CENTER}
        cy={WHEEL_CENTER}
        r={innerCircle.radius}
        fill="none"
        stroke="#64748b"
        strokeWidth={WHEEL_STROKES.zodiacInner}
      />
      <circle
        cx={WHEEL_CENTER}
        cy={WHEEL_CENTER}
        r={aspectCircle.radius}
        fill="none"
        stroke="#334155"
        strokeWidth={WHEEL_STROKES.aspect}
      />

      {/* 12 cung: vạch chia + ký hiệu đặt giữa vành (không đè lên nhãn AC/DC/MC/IC). */}
      {layout.signDividers.map((divider) => (
        <line
          key={`sign-${divider.longitude}`}
          x1={divider.from.x}
          y1={divider.from.y}
          x2={divider.to.x}
          y2={divider.to.y}
          stroke="#1e293b"
          strokeWidth={WHEEL_STROKES.signDivider}
        />
      ))}
      {layout.signGlyphs.map((glyph) => (
        <text
          key={`glyph-${glyph.index}`}
          x={glyph.point.x}
          y={glyph.point.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#cbd5e1"
          fontSize={WHEEL_TEXT.signGlyph}
        >
          {ZODIAC_SIGNS[glyph.index].symbol}
        </text>
      ))}

      {/* 12 nhà: vạch chia + số nhà. */}
      {layout.houseDividers.map((divider) => (
        <line
          key={`house-${divider.house}`}
          x1={divider.from.x}
          y1={divider.from.y}
          x2={divider.to.x}
          y2={divider.to.y}
          stroke="#1e293b"
          strokeWidth={WHEEL_STROKES.houseCusp}
        />
      ))}
      {layout.houseNumbers.map((number) => (
        <text
          key={`house-number-${number.house}`}
          x={number.point.x}
          y={number.point.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#64748b"
          fontSize={WHEEL_TEXT.houseNumber}
        >
          {number.house}
        </text>
      ))}

      {/* Đường góc chiếu (vẽ trước hành tinh để ký hiệu luôn nằm trên). */}
      {aspects.map((aspect) => {
        const fromPlanet = byKey.get(aspect.from);
        const toPlanet = byKey.get(aspect.to);
        if (!fromPlanet || !toPlanet) return null;

        const from = wheelPoint(fromPlanet.longitude, layout.aspectRadius);
        const to = wheelPoint(toPlanet.longitude, layout.aspectRadius);

        return (
          <line
            key={`${aspect.from}-${aspect.to}-${aspect.type}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={aspect.color}
            strokeWidth={WHEEL_STROKES.aspect}
            strokeOpacity="0.55"
          />
        );
      })}

      {/* Trục AC–DC (xanh) và MC–IC (hổ phách): chỉ nằm trong vành hoàng đạo. */}
      {layout.angleAxes.map((axis) => (
        <line
          key={`axis-${axis.label}`}
          x1={axis.from.x}
          y1={axis.from.y}
          x2={axis.to.x}
          y2={axis.to.y}
          stroke={axis.color === "amber" ? "#f59e0b" : "#22d3ee"}
          strokeWidth={WHEEL_STROKES.angleAxis}
        />
      ))}

      {/* Hành tinh: vạch dẫn, đĩa, ký hiệu, huy hiệu nghịch hành. */}
      {layout.planets.map((geometry) => {
        const planet = byKey.get(geometry.key);
        if (!planet) return null;
        return (
          <g key={geometry.key}>
            <line
              x1={geometry.leader.from.x}
              y1={geometry.leader.from.y}
              x2={geometry.leader.to.x}
              y2={geometry.leader.to.y}
              stroke={planet.color}
              strokeOpacity="0.35"
              strokeWidth={WHEEL_STROKES.leader}
            />
            <circle
              cx={geometry.point.x}
              cy={geometry.point.y}
              r={geometry.disc}
              fill="#0f172a"
              stroke={planet.color}
              strokeWidth={geometry.stroke}
            />
            <text
              x={geometry.point.x}
              y={geometry.point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={planet.color}
              fontSize={WHEEL_TEXT.planetGlyph}
              fontWeight="700"
            >
              {planet.glyph}
            </text>
            {planet.retrograde ? (
              <text
                x={geometry.point.x + WHEEL_RETRO_OFFSET.x}
                y={geometry.point.y + WHEEL_RETRO_OFFSET.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fca5a5"
                fontSize={WHEEL_TEXT.retroBadge}
                fontWeight="700"
              >
                R
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Nhãn AC/DC/MC/IC: vẽ sau cùng, có chip nền đục nên luôn đọc được. */}
      {layout.angleLabels.map((label) => (
        <g key={`label-${label.label}`}>
          <rect
            x={label.point.x - label.halfWidth}
            y={label.point.y - label.halfHeight}
            width={label.halfWidth * 2}
            height={label.halfHeight * 2}
            rx={5}
            fill="#020617"
            fillOpacity="0.92"
            stroke={label.label === "MC" || label.label === "IC" ? "#f59e0b" : "#22d3ee"}
            strokeOpacity="0.5"
            strokeWidth={WHEEL_STROKES.chip}
          />
          <text
            x={label.point.x}
            y={label.point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={label.label === "MC" || label.label === "IC" ? "#f59e0b" : "#22d3ee"}
            fontSize={WHEEL_TEXT.angleLabel}
            fontWeight="700"
          >
            {label.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
