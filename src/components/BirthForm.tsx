import type { FormEvent } from "react";
import { motion } from "framer-motion";

export type BirthFormValues = {
  birthDate: string;
  birthTime: string;
  timezone: string;
  birthPlace: string;
  latitude: string;
  longitude: string;
  timeZoneId: string;
  gender: "nam" | "nữ";
};

const fieldClass =
  "w-full rounded-lg border border-slate-600/80 bg-slate-950/90 px-3 py-2.5 text-slate-100 outline-none ring-sky-300 transition placeholder:text-slate-500 focus:border-sky-300 focus:ring";
const labelClass = "text-xs font-medium uppercase tracking-[0.08em] text-slate-300";

export const CITY_PRESETS = [
  { name: "Hà Nội", lat: 21.0285, lon: 105.8542 },
  { name: "TP. Hồ Chí Minh", lat: 10.7769, lon: 106.7009 },
  { name: "Đà Nẵng", lat: 16.0544, lon: 108.2022 },
  { name: "Hải Phòng", lat: 20.8449, lon: 106.6881 },
  { name: "Huế", lat: 16.4637, lon: 107.5909 },
  { name: "Nha Trang", lat: 12.2388, lon: 109.1967 },
  { name: "Đà Lạt", lat: 11.9404, lon: 108.4583 },
  { name: "Cần Thơ", lat: 10.0452, lon: 105.7469 },
  { name: "Buôn Ma Thuột", lat: 12.6667, lon: 108.05 },
  { name: "Vinh", lat: 18.6796, lon: 105.6813 },
  { name: "Hà Nội (múi giờ UTC+7)", lat: 21.0285, lon: 105.8542 },
  { name: "Quy Nhơn", lat: 13.7829, lon: 109.2196 }
];

export default function BirthForm({
  values,
  setValues,
  onSubmit,
  onResolvePlace,
  isGeocoding,
  geocodeNote,
  error
}: {
  values: BirthFormValues;
  setValues: (updater: (previous: BirthFormValues) => BirthFormValues) => void;
  onSubmit: (event: FormEvent) => void;
  onResolvePlace: () => void;
  isGeocoding: boolean;
  geocodeNote: string;
  error: string;
}) {
  const update = (key: keyof BirthFormValues, value: string) => setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-5 rounded-2xl border border-slate-700/80 bg-slate-900/65 p-6 shadow-[0_20px_80px_-40px_rgba(56,189,248,0.35)] md:grid-cols-2 md:p-8"
    >
      <label className="space-y-2 md:col-span-2">
        <span className={labelClass}>Nơi sinh (tìm toạ độ tự động)</span>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={values.birthPlace}
            onChange={(event) => update("birthPlace", event.target.value)}
            placeholder="VD: Đà Nẵng, Việt Nam"
            className={fieldClass}
            required
          />
          <button
            type="button"
            onClick={onResolvePlace}
            disabled={isGeocoding}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-sky-300/60 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:border-sky-200 hover:text-sky-100 disabled:opacity-60"
          >
            {isGeocoding ? "Đang tìm…" : "Tìm toạ độ"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  setValues((previous) => ({
                    ...previous,
                    latitude: position.coords.latitude.toFixed(6),
                    longitude: position.coords.longitude.toFixed(6),
                    birthPlace: previous.birthPlace || "Vị trí hiện tại",
                    timeZoneId: "Asia/Ho_Chi_Minh"
                  }));
                },
                () => undefined,
                { timeout: 8000 }
              );
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-sky-300 hover:text-sky-100"
          >
            Vị trí của tôi
          </button>
        </div>
        {geocodeNote ? <p className="text-xs text-emerald-300">{geocodeNote}</p> : null}
      </label>

      <label className="space-y-2 md:col-span-2">
        <span className={labelClass}>Chọn nhanh thành phố</span>
        <div className="flex flex-wrap gap-2">
          {CITY_PRESETS.map((city, index) => (
            <button
              key={`${city.name}-${index}`}
              type="button"
              className="chip"
              onClick={() =>
                setValues((previous) => ({
                  ...previous,
                  birthPlace: `${city.name}, Việt Nam`,
                  latitude: city.lat.toFixed(6),
                  longitude: city.lon.toFixed(6),
                  timeZoneId: "Asia/Ho_Chi_Minh",
                  timezone: "7"
                }))
              }
            >
              {city.name}
            </button>
          ))}
        </div>
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Ngày sinh</span>
        <input type="date" value={values.birthDate} onChange={(event) => update("birthDate", event.target.value)} className={fieldClass} required />
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Giờ sinh (24h)</span>
        <input
          type="text"
          value={values.birthTime}
          onChange={(event) => update("birthTime", event.target.value)}
          placeholder="HH:mm"
          inputMode="numeric"
          pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
          className={fieldClass}
          required
        />
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Vĩ độ</span>
        <input
          type="number"
          value={values.latitude}
          onChange={(event) => update("latitude", event.target.value)}
          min={-90}
          max={90}
          step="any"
          className={fieldClass}
          required
        />
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Kinh độ</span>
        <input
          type="number"
          value={values.longitude}
          onChange={(event) => update("longitude", event.target.value)}
          min={-180}
          max={180}
          step="any"
          className={fieldClass}
          required
        />
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Timezone IANA</span>
        <input
          type="text"
          value={values.timeZoneId}
          onChange={(event) => update("timeZoneId", event.target.value)}
          placeholder="Asia/Ho_Chi_Minh"
          className={fieldClass}
        />
        <p className="text-xs text-slate-400">Dùng để tra offset lịch sử (kể cả DST). Để trống nếu muốn nhập offset thủ công.</p>
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Múi giờ thủ công (UTC offset)</span>
        <input
          type="number"
          value={values.timezone}
          onChange={(event) => update("timezone", event.target.value)}
          min={-12}
          max={14}
          step={0.5}
          className={fieldClass}
          required
        />
        <p className="text-xs text-slate-400">Chỉ dùng khi không có Timezone IANA hợp lệ.</p>
      </label>

      <label className="space-y-2">
        <span className={labelClass}>Giới tính (dùng cho Tứ Trụ / Đại vận)</span>
        <select value={values.gender} onChange={(event) => update("gender", event.target.value as BirthFormValues["gender"])} className={fieldClass}>
          <option value="nam">Nam</option>
          <option value="nữ">Nữ</option>
        </select>
      </label>

      <div className="md:col-span-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          className="inline-flex rounded-lg bg-violet-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300"
        >
          Tạo bản đồ sao
        </motion.button>
      </div>

      {error ? <p className="md:col-span-2 text-sm text-rose-300">{error}</p> : null}
    </form>
  );
}
