/**
 * Âm lịch Việt Nam (múi giờ UTC+7) — tính theo thiên văn thật, không ước lượng theo pha Mặt Trăng.
 *
 * Quy tắc dùng ở đây (đúng như lịch vạn niên Việt Nam):
 *  1. Ngày mùng 1 = ngày dương lịch (giờ địa phương) có chứa thời điểm **sóc** (trăng mới).
 *  2. Tháng 11 âm lịch là tháng chứa **Đông chí** (Mặt Trời 270°); các tháng đánh số lùi/xuôi từ đó.
 *  3. Tháng nào không chứa **trung khí** (bội số 30° của kinh độ Mặt Trời) là tháng **nhuận** của tháng trước.
 *
 * Thuật toán khung theo Hồ Ngọc Đức (amlich) — bản được các phần mềm lịch Việt Nam dùng phổ biến —
 * nhưng thay chuỗi Meeus bằng astronomy-engine (cùng thư viện mà engine bản đồ sao đang dùng).
 * Kiểm chứng: tests/lunar.check.ts so từng ngày 1900–2100 với bản tham chiếu amlich.
 */
import { SearchMoonPhase, SunPosition } from "astronomy-engine";

/** Múi giờ dùng để cắt ngày âm lịch (Việt Nam từ 1968 dùng UTC+7). */
export const LUNAR_TIMEZONE = 7;

const SYNODIC_MONTH = 29.530588853;
const FIRST_NEW_MOON_1900 = 2415021.076998695;
/** Ngày bắt đầu "ngày Tý" theo Tử Vi / Tứ Trụ: 23 giờ đêm hôm trước. */
export const ZI_HOUR_START = 23;

export type LunarDate = {
  /** Ngày trong tháng âm lịch (1 = mùng 1). */
  day: number;
  /** Tháng âm lịch 1..12. */
  month: number;
  /** Năm âm lịch. */
  year: number;
  /** Tháng nhuận (tháng không có trung khí). */
  leap: boolean;
  /** Số ngày Julian (JDN) của ngày mùng 1 tháng này — dùng để kiểm tra độ dài tháng. */
  monthStart: number;
};

/* ------------------------------------------------------------------ tiện ích ngày */

/** JDN của một ngày dương lịch (không phụ thuộc múi giờ vì đã là "ngày lịch"). */
export const jdnFromDate = (year: number, month: number, day: number): number => {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
};

/** Ngày dương lịch (UTC) từ JDN, dùng cho việc tra kinh độ Mặt Trời. */
const dateFromJdn = (jdn: number): Date => new Date((jdn - 2440587.5) * 86400000);

/** JDN của ngày dương lịch chứa một thời điểm Julian Day (UT). */
const jdnFromJd = (jd: number, timezone: number): number => Math.floor(jd + 0.5 + timezone / 24);

/* ------------------------------------------------------- sóc (trăng mới) & trung khí */

const newMoonCache = new Map<string, number>();

/**
 * JDN (giờ địa phương) của ngày chứa cây sóc thứ k, với k = 0 ứng với trăng mới đầu năm 1900.
 * astronomy-engine tìm chính xác thời điểm Mặt Trăng trùng kinh độ với Mặt Trời (sóc hình học).
 */
export const newMoonDay = (k: number, timezone = LUNAR_TIMEZONE): number => {
  const key = `${timezone}:${k}`;
  const cached = newMoonCache.get(key);
  if (cached !== undefined) return cached;
  const estimate = 2415020.75933 + SYNODIC_MONTH * k;
  const found = SearchMoonPhase(0, new Date((estimate - 20 - 2440587.5) * 86400000), 45);
  if (!found) throw new Error(`Không tìm được thời điểm sóc thứ ${k}`);
  const jd = found.date.getTime() / 86400000 + 2440587.5;
  const value = jdnFromJd(jd, timezone);
  newMoonCache.set(key, value);
  return value;
};

/**
 * Chỉ số k của cây sóc gần nhất KHÔNG SAU ngày `jdn` (tức mùng 1 của tháng chứa ngày đó).
 * Ước lượng ban đầu theo chu kỳ trung bình rồi tự hiệu chỉnh, nên không phụ thuộc độ trôi của công thức trung bình.
 */
const monthIndexAt = (jdn: number, timezone = LUNAR_TIMEZONE): number => {
  let k = Math.floor((jdn - FIRST_NEW_MOON_1900) / SYNODIC_MONTH);
  let guard = 0;
  while (newMoonDay(k, timezone) > jdn && guard++ < 5) k -= 1;
  guard = 0;
  while (newMoonDay(k + 1, timezone) <= jdn && guard++ < 5) k += 1;
  return k;
};

/** Chỉ số trung khí 0..11 của ngày: 0 = 0°–30° (Xuân phân), 9 = 270°–300° (Đông chí). */
const sunSectorAtMidnight = (jdn: number, timezone = LUNAR_TIMEZONE): number => {
  const midnightUtc = dateFromJdn(jdn - 0.5 - timezone / 24);
  return Math.floor((((SunPosition(midnightUtc).elon % 360) + 360) % 360) / 30);
};

/* --------------------------------------------------------------- tháng 11 & tháng nhuận */

const month11Cache = new Map<number, number>();

/** JDN ngày mùng 1 của tháng 11 âm lịch (tháng chứa Đông chí) trong năm `year`. */
const lunarMonth11 = (year: number, timezone = LUNAR_TIMEZONE): number => {
  const cached = month11Cache.get(year);
  if (cached !== undefined) return cached;
  const off = jdnFromDate(year, 12, 31) - 2415021;
  const k = Math.floor(off / SYNODIC_MONTH);
  let nm = newMoonDay(k, timezone);
  // Tháng chứa Đông chí phải BẮT ĐẦU trước Đông chí: nếu ngày mùng 1 đã qua tiết Đông chí (≥ 270°)
  // thì tháng 11 là tháng trước đó.
  if (sunSectorAtMidnight(nm, timezone) >= 9) nm = newMoonDay(k - 1, timezone);
  month11Cache.set(year, nm);
  return nm;
};

/** Vị trí (tính từ tháng 11) của tháng nhuận: tháng đầu tiên không chứa trung khí. */
const leapMonthOffset = (month11: number, timezone = LUNAR_TIMEZONE): number => {
  const k = monthIndexAt(month11, timezone);
  let i = 1;
  let last = 0;
  let arc = sunSectorAtMidnight(newMoonDay(k + 1, timezone), timezone);
  do {
    last = arc;
    i += 1;
    arc = sunSectorAtMidnight(newMoonDay(k + i, timezone), timezone);
  } while (arc !== last && i < 14);
  return i - 1;
};

/* ------------------------------------------------------------------------ đổi ngày */

const dayCache = new Map<string, LunarDate>();

/** Âm lịch của một ngày dương lịch (theo giờ địa phương). */
export const lunarFromDate = (year: number, month: number, day: number, timezone = LUNAR_TIMEZONE): LunarDate => {
  const key = `${timezone}:${year}-${month}-${day}`;
  const cached = dayCache.get(key);
  if (cached) return cached;

  const dayNumber = jdnFromDate(year, month, day);
  const monthStart = newMoonDay(monthIndexAt(dayNumber, timezone), timezone);

  // Mốc tháng 11 (tháng chứa Đông chí) trước và sau tháng đang xét.
  let a11 = lunarMonth11(year, timezone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = lunarMonth11(year - 1, timezone);
  } else {
    lunarYear = year + 1;
    b11 = lunarMonth11(year + 1, timezone);
  }

  const diff = Math.floor((monthStart - a11) / 29);
  let lunarMonth = diff + 11;
  let leap = false;
  if (b11 - a11 > 365) {
    const leapOffset = leapMonthOffset(a11, timezone);
    if (diff >= leapOffset) {
      lunarMonth = diff + 10;
      if (diff === leapOffset) leap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  // Bốn tháng đầu sau mốc tháng 11 (tháng 11, 12, 1, 2) vẫn thuộc năm âm lịch trước đó.
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;

  const result: LunarDate = { day: dayNumber - monthStart + 1, month: lunarMonth, year: lunarYear, leap, monthStart };
  dayCache.set(key, result);
  return result;
};

/**
 * Âm lịch dùng cho Tử Vi / Tứ Trụ: ngày được tính từ 23 giờ hôm trước (giờ Tý),
 * nên ca sinh 23:00–23:59 thuộc ngày hôm sau; ca 00:00–00:59 vẫn thuộc ngày đang xét.
 */
export const lunarForBirth = (
  localDate: Date,
  localHour: number
): LunarDate & { shiftedToNextDay: boolean } => {
  const base = lunarFromDate(localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate());
  if (localHour >= ZI_HOUR_START) {
    const next = new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate() + 1, 12));
    const shifted = lunarFromDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
    return { ...shifted, shiftedToNextDay: true };
  }
  return { ...base, shiftedToNextDay: false };
};

/** Ngày dương lịch (giờ địa phương) của ngày mùng 1 tháng âm lịch chứa ngày đã cho. */
export const monthLength = (lunar: LunarDate, timezone = LUNAR_TIMEZONE): number => {
  const k = monthIndexAt(lunar.monthStart, timezone);
  return newMoonDay(k + 1, timezone) - lunar.monthStart;
};
