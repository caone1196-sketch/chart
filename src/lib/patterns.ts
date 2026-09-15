/**
 * Hình mẫu góc chiếu (aspect patterns) và hình dạng bản đồ (chart shape)
 * — hai cách đọc "biến thể" hình học của một bản đồ sao.
 */

import { ZODIAC_SIGNS, normalizeDegree, signedSeparation } from "@/lib/astro";

export type PatternPoint = { key: string; label: string; longitude: number };

export type AspectPattern = {
  key: string;
  label: string;
  members: string[];
  meaning: string;
  advice: string;
  strength: number;
};

const ANGLE = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
  quincunx: 150
};

const separationOf = (a: number, b: number) => Math.abs(signedSeparation(a, b));

const hasAspect = (a: number, b: number, angle: number, orb: number) => Math.abs(separationOf(a, b) - angle) <= orb;

const labelOf = (points: PatternPoint[], index: number) => points[index].label;

/** Tìm tất cả hình mẫu góc chiếu trong một tập điểm (hành tinh + góc). */
export const findAspectPatterns = (points: PatternPoint[]): AspectPattern[] => {
  const results: AspectPattern[] = [];
  const n = points.length;

  // Stellium: ≥3 hành tinh trong 12° (không tính góc AC/MC)
  const planetOnly = points.filter((point) => !["ascendant", "midheaven"].includes(point.key));
  for (let i = 0; i < planetOnly.length; i += 1) {
    const cluster = planetOnly.filter((point) => separationOf(point.longitude, planetOnly[i].longitude) <= 8);
    if (cluster.length >= 3) {
      const key = `stellium-${cluster.map((point) => point.key).sort().join("-")}`;
      if (!results.some((item) => item.key === key)) {
        const signIndex = Math.floor(cluster[0].longitude / 30);
        results.push({
          key,
          label: `Stellium (nhóm tập trung) tại ${ZODIAC_SIGNS[signIndex].name}`,
          members: cluster.map((point) => point.label),
          meaning:
            "Ba hành tinh trở lên nằm sát nhau trong cùng một cung — năng lượng bị nén lại một chủ đề, thường là trục chính của cả bản đồ.",
          advice: "Đừng cố dàn trải; hãy nhận ra mình mạnh ở đúng một hướng và đầu tư vào đó.",
          strength: cluster.length / 3
        });
      }
    }
  }

  // Grand Trine: 3 điểm tam hợp 120° lẫn nhau
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!hasAspect(points[i].longitude, points[j].longitude, ANGLE.trine, 6)) continue;
      for (let k = j + 1; k < n; k += 1) {
        if (
          hasAspect(points[j].longitude, points[k].longitude, ANGLE.trine, 6) &&
          hasAspect(points[i].longitude, points[k].longitude, ANGLE.trine, 6)
        ) {
          results.push({
            key: `grand-trine-${points[i].key}-${points[j].key}-${points[k].key}`,
            label: "Đại tam giác (Grand Trine)",
            members: [labelOf(points, i), labelOf(points, j), labelOf(points, k)],
            meaning: "Ba điểm tam hợp thành một vòng khép kín — tài năng chảy tự nhiên, nhưng dễ thành vùng an toàn thiếu động lực.",
            advice: "Thêm một góc vuông (điểm đối của một đỉnh) để biến tiềm năng thành thành tựu.",
            strength: 1
          });
        }
      }
    }
  }

  // T-Square: 2 điểm đối đỉnh, điểm thứ ba vuông góc cả hai
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!hasAspect(points[i].longitude, points[j].longitude, ANGLE.opposition, 8)) continue;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j) continue;
        if (
          hasAspect(points[i].longitude, points[k].longitude, ANGLE.square, 6) &&
          hasAspect(points[j].longitude, points[k].longitude, ANGLE.square, 6)
        ) {
          results.push({
            key: `t-square-${points[k].key}-${points[i].key}-${points[j].key}`,
            label: "Chữ T (T-Square)",
            members: [labelOf(points, i), labelOf(points, j), labelOf(points, k)],
            meaning: `${labelOf(points, k)} là điểm nén, hai đầu còn lại là lực đối kháng — căng thẳng thúc đẩy hành động.`,
            advice: "Đối diện điểm nén bằng cách dùng nó như động lực; nhìn về điểm trống đối diện để tìm lối thoát.",
            strength: 1.2
          });
        }
      }
    }
  }

  // Grand Cross: 2 cặp đối đỉnh vuông góc nhau
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!hasAspect(points[i].longitude, points[j].longitude, ANGLE.square, 6)) continue;
      for (let k = j + 1; k < n; k += 1) {
        if (
          hasAspect(points[i].longitude, points[k].longitude, ANGLE.opposition, 8) &&
          hasAspect(points[j].longitude, points[k].longitude, ANGLE.square, 6)
        ) {
          for (let l = k + 1; l < n; l += 1) {
            if (
              hasAspect(points[j].longitude, points[l].longitude, ANGLE.opposition, 8) &&
              hasAspect(points[i].longitude, points[l].longitude, ANGLE.square, 6) &&
              hasAspect(points[k].longitude, points[l].longitude, ANGLE.opposition, 8)
            ) {
              results.push({
                key: `grand-cross-${points[i].key}-${points[j].key}-${points[k].key}-${points[l].key}`,
                label: "Đại vuông góc (Grand Cross)",
                members: [labelOf(points, i), labelOf(points, j), labelOf(points, k), labelOf(points, l)],
                meaning: "Bốn điểm tạo khung vuông cân bằng — cuộc đời nhiều áp lực tứ phía, nhưng cũng là cấu trúc bền vững nếu biết dùng.",
                advice: "Giữ nhịp sống cân bằng, xử lý từng trục một thay vì kéo cả bốn cùng lúc.",
                strength: 1.5
              });
              return results; // Đại vuông góc là cấu trúc trọn vẹn, không cần tìm thêm biến thể phủ lên nó
            }
          }
        }
      }
    }
  }

  // Yod: 2 điểm lục hợp, cùng tạo góc 150° với đỉnh
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!hasAspect(points[i].longitude, points[j].longitude, ANGLE.sextile, 4)) continue;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j) continue;
        if (
          hasAspect(points[i].longitude, points[k].longitude, ANGLE.quincunx, 3) &&
          hasAspect(points[j].longitude, points[k].longitude, ANGLE.quincunx, 3)
        ) {
          results.push({
            key: `yod-${points[k].key}-${points[i].key}-${points[j].key}`,
            label: "Yod (Ngón tay của Thượng đế)",
            members: [labelOf(points, i), labelOf(points, j), labelOf(points, k)],
            meaning: `Ngón tay chỉ về ${labelOf(points, k)} — một sứ mệnh khó tránh, thường trở thành điểm xoay của cuộc đời khi đủ tuổi.`,
            advice: "Kiên nhẫn với cảm giác 'lệch nhịp' — Yod lớn dần theo thời gian và thường bộc lộ sau tuổi 30.",
            strength: 1.1
          });
        }
      }
    }
  }

  // Kite: Grand Trine + một điểm đối của một đỉnh tạo thêm hai góc 60°
  for (const pattern of results.filter((item) => item.label.startsWith("Đại tam giác"))) {
    const members = pattern.members;
    for (const point of points) {
      if (members.includes(point.label)) continue;
      const apex = points.find((item) => item.label === members[0]);
      if (!apex) continue;
      if (
        hasAspect(point.longitude, normalizeDegree(apex.longitude + 180), ANGLE.conjunction, 8) &&
        members.slice(1).every((member) => {
          const other = points.find((item) => item.label === member);
          return other ? hasAspect(point.longitude, other.longitude, ANGLE.sextile, 5) : false;
        })
      ) {
        results.push({
          key: `kite-${pattern.key}-${point.key}`,
          label: "Cánh diều (Kite)",
          members: [...members, point.label],
          meaning: "Đại tam giác có thêm một điểm đối — tài năng không chỉ tự nhiên mà còn có hướng và được hiện thực hoá.",
          advice: "Dùng điểm đối như mục tiêu cụ thể để biến tài năng thành kết quả nhìn thấy được.",
          strength: 1.4
        });
      }
    }
  }

  // Mystic Rectangle: 2 cặp đối đỉnh, hai bên lục hợp
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        for (let l = k + 1; l < n; l += 1) {
          const pairs: Array<[number, number]> = [
            [i, j],
            [k, l]
          ];
          const isOpposite = pairs.every(([a, b]) => hasAspect(points[a].longitude, points[b].longitude, ANGLE.opposition, 8));
          if (!isOpposite) continue;
          const sextilePairings =
            hasAspect(points[i].longitude, points[k].longitude, ANGLE.sextile, 5) &&
            hasAspect(points[i].longitude, points[l].longitude, ANGLE.sextile, 5) &&
            hasAspect(points[j].longitude, points[k].longitude, ANGLE.sextile, 5) &&
            hasAspect(points[j].longitude, points[l].longitude, ANGLE.sextile, 5);
          const trinePairings =
            hasAspect(points[i].longitude, points[k].longitude, ANGLE.trine, 5) &&
            hasAspect(points[j].longitude, points[l].longitude, ANGLE.trine, 5);
          if (sextilePairings || trinePairings) {
            results.push({
              key: `mystic-${points[i].key}-${points[j].key}-${points[k].key}-${points[l].key}`,
              label: "Chữ nhật huyền bí (Mystic Rectangle)",
              members: [labelOf(points, i), labelOf(points, j), labelOf(points, k), labelOf(points, l)],
              meaning: "Hai trục đối nhau được nối bằng lục hợp/tam hợp — căng thẳng có sẵn lối thoát, dễ chuyển hoá thành thực tế.",
              advice: "Đây là cấu trúc dễ 'làm được việc' nhất: đặt mục tiêu cụ thể và dùng các điểm lục hợp làm cầu nối.",
              strength: 1.3
            });
          }
        }
      }
    }
  }

  // Thor's Hammer: 2 điểm vuông góc cùng tạo góc 150° với một điểm thứ ba (bổ sung của Yod)
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!hasAspect(points[i].longitude, points[j].longitude, ANGLE.square, 5)) continue;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j) continue;
        if (
          hasAspect(points[i].longitude, points[k].longitude, ANGLE.quincunx, 3) &&
          hasAspect(points[j].longitude, points[k].longitude, ANGLE.quincunx, 3)
        ) {
          results.push({
            key: `hammer-${points[k].key}-${points[i].key}-${points[j].key}`,
            label: "Búa Thor (Thor's Hammer)",
            members: [labelOf(points, i), labelOf(points, j), labelOf(points, k)],
            meaning: "Cấu trúc cưỡng bức mạnh: áp lực buộc phải hành động, thường gắn với bước ngoặt dứt khoát.",
            advice: "Nhận diện điểm nén để chủ động tạo thay đổi thay vì bị hoàn cảnh đẩy.",
            strength: 1.2
          });
        }
      }
    }
  }

  // Lọc trùng & sắp theo độ mạnh
  const seen = new Set<string>();
  const unique = results.filter((item) => {
    const signature = `${item.label}:${[...item.members].sort().join("|")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  return unique.sort((a, b) => b.strength - a.strength).slice(0, 8);
};

/* ----------------------------------------------------------- hình dạng bản đồ */

export type ChartShape = {
  key: string;
  label: string;
  meaning: string;
  advice: string;
  coverage: number;
  gap: number;
  focus: string;
};

const SHAPE_META: Record<string, { label: string; meaning: string; advice: string }> = {
  bundle: {
    label: "Bó (Bundle)",
    meaning: "Tất cả hành tinh nằm trong một cung ~120° hoặc ít hơn — năng lượng tập trung cao độ vào một vùng chủ đề.",
    advice: "Chuyên sâu thay vì dàn trải; đây là bản đồ của chuyên gia hơn là người đa nhiệm."
  },
  bowl: {
    label: "Bát (Bowl)",
    meaning: "Hành tinh chiếm một nửa vòng tròn, nửa còn lại trống — luôn có cảm giác thiếu một cái gì cần đi tìm.",
    advice: "Nửa trống là nơi bạn tìm kiếm sự hoàn thiện; hãy chủ động lấp bằng mục tiêu, không chờ ai mang tới."
  },
  bucket: {
    label: "Xô (Bucket)",
    meaning: "Gần như tất cả nằm một nửa, một hành tinh tách ra như quai xô (thường là điểm dẫn dắt).",
    advice: "Hành tinh 'quai xô' là vai trò của bạn với tập thể: giữ nó làm định hướng, đồng thời đừng để nó quá tải."
  },
  locomotive: {
    label: "Đầu máy (Locomotive)",
    meaning: "2/3 hành tinh dàn thành khối, khoảng trống 120° — bản đồ của người dẫn đường.",
    advice: "Bạn thường kéo cả nhóm đi trước; phần trống là nơi cần hợp tác thay vì tự làm hết."
  },
  seesaw: {
    label: "Bập bênh (Seesaw)",
    meaning: "Hai nhóm hành tinh đối nhau, thường để lại hai khoảng trống — bạn sống trong thế cân bằng giữa hai mặt.",
    advice: "Giỏi nhìn hai phía, nhưng cần chốt một lựa chọn; đừng để dao động kéo dài quá lâu."
  },
  splash: {
    label: "Toả (Splash)",
    meaning: "Hành tinh rải đều khắp vòng tròn, không khoảng trống lớn — sở thích rộng, trải nghiệm phong phú.",
    advice: "Đa dạng là điểm mạnh; hãy chọn một chủ đề làm mỏ neo để không bị phân tán."
  },
  splay: {
    label: "Nan hoa (Splay)",
    meaning: "Ba nhóm hành tinh tách biệt rõ, tạo các khoảng trống không đều — năng lượng làm việc theo cụm chuyên biệt.",
    advice: "Mỗi nhóm là một 'chế độ' khác nhau của bạn; nhận ra mình đang ở chế độ nào để không tự cản trở."  
  }
};

/** Hình dạng bản đồ: dựa trên phân bố hành tinh quanh vòng hoàng đạo. */
export const chartShapeOf = (planets: PatternPoint[]): ChartShape => {
  const longitudes = planets.map((planet) => planet.longitude).sort((a, b) => a - b);
  const n = longitudes.length;

  // Khoảng trống lớn nhất giữa hai hành tinh liên tiếp
  let gapStart = 0;
  let gap = 0;
  for (let i = 0; i < n; i += 1) {
    const current = longitudes[i];
    const next = i === n - 1 ? longitudes[0] + 360 : longitudes[i + 1];
    if (next - current > gap) {
      gap = next - current;
      gapStart = current;
    }
  }

  const coverage = 360 - gap;
  let key: string;
  if (coverage <= 120) key = "bundle";
  else if (coverage <= 180) key = "bowl";
  else if (coverage <= 210) key = "bucket";
  else if (coverage <= 240) key = "locomotive";
  else {
    // Kiểm tra nhóm đối nhau / rải đều
    const sorted = [...longitudes];
    let largestOpposed = 0;
    for (const first of sorted) {
      const second = sorted.find((value) => Math.abs(((value - first + 540) % 360) - 180) < 15);
      if (second !== undefined) {
        const cluster = sorted.filter((value) => Math.abs(((value - first + 540) % 360) - 180) < 90).length;
        largestOpposed = Math.max(largestOpposed, cluster);
      }
    }

    if (gap >= 60 && gap <= 120) {
      const clusters = countClusters(longitudes, 30);
      key = clusters >= 3 ? "splay" : "seesaw";
    } else if (largestOpposed >= n / 2) key = "seesaw";
    else key = "splash";
  }

  const meta = SHAPE_META[key];
  const gapSign = ZODIAC_SIGNS[Math.floor(normalizeDegree(gapStart + gap / 2) / 30)].name;
  const focusSign = ZODIAC_SIGNS[Math.floor(normalizeDegree(gapStart + gap + coverage / 2) / 30)].name;

  return {
    key,
    label: meta.label,
    meaning: meta.meaning,
    advice: meta.advice,
    coverage,
    gap,
    focus: `Cụm hành tinh tập trung quanh ${focusSign}, khoảng trống lớn nhất hướng về ${gapSign}.`
  };
};

const countClusters = (longitudes: number[], threshold: number) => {
  let clusters = 1;
  for (let i = 1; i < longitudes.length; i += 1) {
    if (longitudes[i] - longitudes[i - 1] > threshold) clusters += 1;
  }
  return clusters;
};

export type HemisphereEmphasis = {
  north: number;
  south: number;
  east: number;
  west: number;
  note: string;
};

/** Ưu thế bán cầu (trên/dưới, nửa trước/nửa sau của bản đồ). */
export const hemisphereEmphasis = (planets: PatternPoint[], ascendant: number, midheaven: number) => {
  let north = 0;
  let south = 0;
  let east = 0;
  let west = 0;

  for (const planet of planets) {
    const house = Math.floor(normalizeDegree((planet.longitude - ascendant) % 360) / 30) + 1;
    if ([7, 8, 9, 10, 11, 12].includes(house)) north += 1;
    else south += 1;
    if ([10, 11, 12, 1, 2, 3].includes(house)) east += 1;
    else west += 1;
  }

  const notes: string[] = [];
  if (north > south) notes.push("Nhiều hành tinh ở bán cầu trên: cuộc đời diễn ra ngoài xã hội, được nhìn thấy.");
  if (south > north) notes.push("Nhiều hành tinh ở bán cầu dưới: đời sống nội tâm, gia đình và nền tảng riêng tư quan trọng hơn.");
  if (east > west) notes.push("Nghiêng về nửa trước (Đông/AC): chủ động, tự tạo cơ hội.");
  if (west > east) notes.push("Nghiêng về nửa sau (Tây/DC): học hỏi và cộng tác với người khác là con đường chính.");
  if (planets.some((planet) => Math.abs(signedSeparation(planet.longitude, midheaven)) < 10))
    notes.push("Có hành tinh gần Thiên Đỉnh: định hướng sự nghiệp/địa vị rất rõ.");

  return { north, south, east, west, note: notes.join(" ") };
};
