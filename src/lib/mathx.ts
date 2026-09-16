/**
 * Hàm toán dùng chung, tách riêng để tránh vòng lặp import giữa astro — zodiac — sky.
 */

/** Chuẩn hoá góc về 0..360. */
export const normalizeDegree = (value: number) => {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

/** Chênh lệch góc có dấu trong khoảng -180..180 (b - a). */
export const signedSeparation = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** Độ nghiêng hoàng đạo (obliquity) theo công thức IAU 1980 rút gọn. */
export const calcObliquity = (date: Date) => {
  const julianDayValue = date.getTime() / 86400000 + 2440587.5;
  const T = (julianDayValue - 2451545) / 36525;
  return 23 + 26 / 60 + 21.448 / 3600 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
};

/** Ngày Julius từ Date (UT). */
export const julianDay = (date: Date) => date.getTime() / 86400000 + 2440587.5;

export const DEG = Math.PI / 180;
