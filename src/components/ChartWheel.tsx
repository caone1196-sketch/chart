import { useMemo } from "react";
import type { Aspect, House, PlanetPosition } from "@/lib/astro";
import { ZODIAC_SIGNS } from "@/lib/astro";

const anglePoint = (longitude: number, radius: number) => {
  // Kinh độ hoàng đạo tăng ngược chiều kim đồng hồ, 0° Bạch Dương nằm bên trái (hướng Đông).
  const angle = ((longitude + 90) * Math.PI) / 180;
  return {
    x: 250 + radius * Math.cos(angle),
    y: 250 - radius * Math.sin(angle)
  };
};

const buildPlanetRadiusMap = (planets: PlanetPosition[]) => {
  const map = new Map<string, number>();
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
  let stack = 0;

  sorted.forEach((planet, index) => {
    if (index === 0) {
      stack = 0;
    } else {
      const gap = planet.longitude - sorted[index - 1].longitude;
      stack = gap < 8 ? Math.min(stack + 1, 4) : 0;
    }
    map.set(planet.key, 190 - stack * 14);
  });

  return map;
};

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
  const radiusMap = useMemo(() => buildPlanetRadiusMap(planets), [planets]);
  const byKey = useMemo(() => new Map(planets.map((planet) => [planet.key, planet])), [planets]);

  const ascOuter = anglePoint(ascendant, 232);
  const dcOuter = anglePoint(descendant, 232);
  const mcOuter = anglePoint(midheaven, 232);
  const icOuter = anglePoint(imumCoeli, 232);

  return (
    <svg viewBox="0 0 500 500" role="img" aria-label="Vòng bản đồ sao: 12 cung hoàng đạo, 12 nhà và vị trí các hành tinh" className="mx-auto block h-auto w-full max-w-[560px] touch-pan-y">
      <title>Vòng bản đồ sao natal</title>
      <defs>
        <radialGradient id="wheel-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0b1224" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
      </defs>

      <circle cx="250" cy="250" r="236" fill="url(#wheel-glow)" />
      <circle cx="250" cy="250" r="230" fill="none" stroke="#475569" strokeWidth="1.5" />
      <circle cx="250" cy="250" r="200" fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="3 4" />
      <circle cx="250" cy="250" r="145" fill="none" stroke="#334155" strokeWidth="1" />

      {ZODIAC_SIGNS.map((sign, index) => {
        const start = anglePoint(index * 30, 230);
        const end = anglePoint(index * 30, 145);
        const mid = anglePoint(index * 30 + 15, 214);
        return (
          <g key={sign.name}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#1e293b" strokeWidth="1" />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="#cbd5e1" fontSize="16">
              {sign.symbol}
            </text>
          </g>
        );
      })}

      {houses.map((house) => {
        const from = anglePoint(house.cusp, 145);
        const to = anglePoint(house.cusp, 230);
        const label = anglePoint(house.cusp + 15, 130);
        return (
          <g key={`house-${house.house}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#1e293b" strokeWidth="1" />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="12">
              {house.house}
            </text>
          </g>
        );
      })}

      {aspects.map((aspect) => {
        const fromPlanet = byKey.get(aspect.from);
        const toPlanet = byKey.get(aspect.to);
        if (!fromPlanet || !toPlanet) return null;

        const from = anglePoint(fromPlanet.longitude, 130);
        const to = anglePoint(toPlanet.longitude, 130);

        return (
          <line
            key={`${aspect.from}-${aspect.to}-${aspect.type}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={aspect.color}
            strokeWidth="1.2"
            strokeOpacity="0.55"
          />
        );
      })}

      <line x1={ascOuter.x} y1={ascOuter.y} x2={dcOuter.x} y2={dcOuter.y} stroke="#22d3ee" strokeWidth="2" />
      <line x1={mcOuter.x} y1={mcOuter.y} x2={icOuter.x} y2={icOuter.y} stroke="#f59e0b" strokeWidth="2" />

      {[
        { point: ascOuter, label: "AC", color: "#22d3ee" },
        { point: dcOuter, label: "DC", color: "#22d3ee" },
        { point: mcOuter, label: "MC", color: "#f59e0b" },
        { point: icOuter, label: "IC", color: "#f59e0b" }
      ].map((item) => (
        <text key={item.label} x={item.point.x} y={item.point.y - 13} textAnchor="middle" fill={item.color} fontSize="12" fontWeight="700">
          {item.label}
        </text>
      ))}

      {planets.map((planet) => {
        const radius = radiusMap.get(planet.key) ?? 190;
        const point = anglePoint(planet.longitude, radius);
        const highlighted = highlightKeys.includes(planet.key);

        return (
          <g key={planet.key}>
            <line
              x1={anglePoint(planet.longitude, 200).x}
              y1={anglePoint(planet.longitude, 200).y}
              x2={anglePoint(planet.longitude, radius + 12).x}
              y2={anglePoint(planet.longitude, radius + 12).y}
              stroke={planet.color}
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            <circle cx={point.x} cy={point.y} r={highlighted ? 15 : 13} fill="#0f172a" stroke={planet.color} strokeWidth={highlighted ? 2.4 : 1.2} />
            <text
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={planet.color}
              fontSize="11"
              fontWeight="700"
            >
              {planet.symbol}
            </text>
            {planet.retrograde ? (
              <text x={point.x + 14} y={point.y - 10} textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="700">
                R
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
