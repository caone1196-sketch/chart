import type { GeocodeResult } from "@/lib/astro";

export const fetchJson = async <T,>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const geocodeWithNominatim = async (query: string): Promise<GeocodeResult> => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=vi&q=${encodeURIComponent(
    query
  )}`;
  const results = await fetchJson<Array<{ lat: string; lon: string; display_name: string }>>(url);
  const first = results[0];

  if (!first) throw new Error("Không tìm thấy địa điểm này.");

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) throw new Error("Toạ độ từ Nominatim không hợp lệ.");

  return { latitude, longitude, label: first.display_name, timezoneId: null, provider: "nominatim" };
};

const geocodeWithOpenMeteo = async (query: string): Promise<GeocodeResult> => {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=vi&format=json`;
  const payload = await fetchJson<{
    results?: Array<{ latitude: number; longitude: number; name: string; country?: string; admin1?: string; timezone?: string }>;
  }>(url);

  const first = payload.results?.[0];
  if (!first) throw new Error("Không tìm thấy địa điểm này.");

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    label: [first.name, first.admin1, first.country].filter(Boolean).join(", "),
    timezoneId: first.timezone ?? null,
    provider: "open-meteo"
  };
};

/** Tra toạ độ + timezone IANA từ tên địa điểm, có phương án dự phòng. */
export const geocodePlace = async (query: string): Promise<GeocodeResult> => {
  try {
    return await geocodeWithNominatim(query);
  } catch {
    return await geocodeWithOpenMeteo(query);
  }
};
