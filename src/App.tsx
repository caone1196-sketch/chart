import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import tzLookup from "tz-lookup";
import BirthForm, { type BirthFormValues } from "@/components/BirthForm";
import ChartPanel from "@/components/ChartPanel";
import ChartWheel from "@/components/ChartWheel";
import ChatPanel from "@/components/ChatPanel";
import Sky3D from "@/components/Sky3D";
import VariantPanel from "@/components/VariantPanel";
import { buildVariantChart, variantReport } from "@/lib/chart-variants";
import type { HouseSystemId } from "@/lib/houses";
import type { ZodiacFrameId } from "@/lib/zodiac";
import {
  buildChartReport,
  buildUtcDate,
  calcObliquity,
  calculateChart,
  computeTransits,
  displayAngle,
  formatLocalDate,
  formatLocalTime,
  getOffsetHours,
  localSiderealDegrees,
  transitToLines,
  type ChartData,
  type TransitHit
} from "@/lib/astro";
import { askServerAi, type ChatEngine, type ChatTurn } from "@/lib/ai";
import { geocodePlace } from "@/lib/geocode";
import { answerLocally } from "@/lib/interpret";
import { computeSkySnapshot, findFixedStarHits, riseSetForDay, type FixedStarHit } from "@/lib/sky";

const STORAGE_FORM = "astral-chart-vn:form";
const STORAGE_CHAT = "astral-chart-vn:chat";

const defaultForm = (): BirthFormValues => {
  const now = new Date();
  return {
    birthDate: formatLocalDate(now),
    birthTime: formatLocalTime(now),
    timezone: (-now.getTimezoneOffset() / 60).toString(),
    birthPlace: "Hà Nội, Việt Nam",
    latitude: "21.0285",
    longitude: "105.8542",
    timeZoneId: "Asia/Ho_Chi_Minh",
    gender: "nam"
  };
};

const loadForm = (): BirthFormValues => {
  try {
    const raw = window.localStorage.getItem(STORAGE_FORM);
    if (!raw) return defaultForm();
    return { ...defaultForm(), ...(JSON.parse(raw) as Partial<BirthFormValues>) };
  } catch {
    return defaultForm();
  }
};

const loadChat = (): ChatTurn[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_CHAT);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatTurn[];
    return Array.isArray(parsed) ? parsed.slice(-20) : [];
  } catch {
    return [];
  }
};

const INTRO_MESSAGE: ChatTurn = {
  role: "assistant",
  content:
    "Chào bạn, tôi là trợ lý AI của Astral Chart VN. Hãy tạo bản đồ sao ở phía trên, rồi hỏi tôi bất cứ điều gì — từ tính cách, sự nghiệp, tình cảm, tài chính, vận hạn theo transit cho tới câu hỏi quan sát bầu trời tối nay.\n\nMỗi câu trả lời đều được luận dựa trên đúng dữ liệu bản đồ sao của bạn (vị trí hành tinh, nhà, góc chiếu, sao cố định, transit hiện tại)."
};

export default function App() {
  const [form, setForm] = useState<BirthFormValues>(loadForm);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [houseSystem, setHouseSystem] = useState<HouseSystemId>("wholeSign");
  const [zodiacFrame, setZodiacFrame] = useState<ZodiacFrameId>("tropical");
  const [birthInputs, setBirthInputs] = useState<{
    utcDate: Date;
    latitude: number;
    longitude: number;
    label: string;
    timeZoneId: string | null;
    timezoneOffset: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [geocodeNote, setGeocodeNote] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [senderName, setSenderName] = useState("Người dùng Astral Chart VN");
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>(() => [INTRO_MESSAGE, ...loadChat()]);
  const [isAsking, setIsAsking] = useState(false);
  const [status, setStatus] = useState("");
  const [engine, setEngine] = useState<ChatEngine | null>(null);
  const [engineLabel, setEngineLabel] = useState("");
  const [serverLlm, setServerLlm] = useState<"checking" | "gemini" | "local">("checking");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("no health"))))
      .then((payload: { llm?: string }) => {
        if (!cancelled) setServerLlm(payload.llm === "gemini" ? "gemini" : "local");
      })
      .catch(() => {
        if (!cancelled) setServerLlm("local");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_FORM, JSON.stringify(form));
    } catch {
      /* bỏ qua khi trình duyệt chặn localStorage */
    }
  }, [form]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_CHAT, JSON.stringify(chatMessages.slice(1).slice(-20)));
    } catch {
      /* bỏ qua */
    }
  }, [chatMessages]);

  const lat = Number(form.latitude);
  const lon = Number(form.longitude);

  // Khi đổi hệ nhà hoặc hệ hoàng đạo, lập lại bản đồ từ dữ liệu sinh đã nhập.
  useEffect(() => {
    if (!birthInputs) return;
    setChart(
      calculateChart(birthInputs.utcDate, birthInputs.latitude, birthInputs.longitude, birthInputs.label, birthInputs.timeZoneId, birthInputs.timezoneOffset, {
        houseSystem,
        zodiacFrame
      })
    );
  }, [birthInputs, houseSystem, zodiacFrame]);

  const variant = useMemo(() => {
    if (!chart || !birthInputs) return null;
    const localDate = new Date(birthInputs.utcDate.getTime() + birthInputs.timezoneOffset * 3600 * 1000);
    return buildVariantChart({
      chart,
      localDate,
      localHour: localDate.getUTCHours() + localDate.getUTCMinutes() / 60,
      gender: form.gender,
      houseSystem,
      zodiacFrame
    });
  }, [chart, birthInputs, houseSystem, zodiacFrame, form.gender]);

  const transits: TransitHit[] = useMemo(() => (chart ? computeTransits(chart, now, 4) : []), [chart, now]);

  const fixedStars: FixedStarHit[] = useMemo(
    () => (chart ? findFixedStarHits(chart, calcObliquity(chart.utcDate), 1.5) : []),
    [chart]
  );

  const skySnapshot = useMemo(
    () =>
      Number.isFinite(lat) && Number.isFinite(lon)
        ? computeSkySnapshot(now, lat, lon, localSiderealDegrees(now, lon), calcObliquity(now))
        : null,
    [now, lat, lon]
  );

  const riseSet = useMemo(
    () =>
      Number.isFinite(lat) && Number.isFinite(lon) ? riseSetForDay(now, lat, lon, form.timeZoneId.trim() || null) : null,
    [now, lat, lon, form.timeZoneId]
  );

  const resolvePlace = async () => {
    if (!form.birthPlace.trim()) {
      setError("Vui lòng nhập nơi sinh trước khi tìm vị trí.");
      return;
    }

    setError("");
    setGeocodeNote("");
    setIsGeocoding(true);

    try {
      const geo = await geocodePlace(form.birthPlace.trim());
      const tzId = geo.timezoneId ?? tzLookup(geo.latitude, geo.longitude);
      const previewOffset = getOffsetHours(now, tzId);

      setForm((previous) => ({
        ...previous,
        latitude: geo.latitude.toFixed(6),
        longitude: geo.longitude.toFixed(6),
        timeZoneId: tzId,
        timezone: previewOffset.toString()
      }));
      setGeocodeNote(`Đã tìm thấy: ${geo.label} (nguồn ${geo.provider}) · timezone ${tzId}`);
    } catch (reason) {
      const message =
        reason instanceof Error && reason.name === "AbortError"
          ? "Hết thời gian kết nối. Thử lại hoặc nhập tay vĩ độ, kinh độ."
          : "Không tìm được toạ độ tự động. Bạn hãy nhập tay vĩ độ, kinh độ và timezone.";
      setError(message);
    } finally {
      setIsGeocoding(false);
    }
  };

  const createChart = (event?: FormEvent) => {
    event?.preventDefault();
    setError("");

    try {
      const latitude = Number(form.latitude);
      const longitude = Number(form.longitude);
      const offset = Number(form.timezone);
      const timeZoneId = form.timeZoneId.trim() ? form.timeZoneId.trim() : null;

      if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) throw new Error("Vĩ độ phải nằm trong khoảng -90 đến 90.");
      if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) throw new Error("Kinh độ phải nằm trong khoảng -180 đến 180.");
      if (Number.isNaN(offset) || offset < -12 || offset > 14) throw new Error("UTC offset phải nằm trong khoảng -12 đến +14.");

      const timed = buildUtcDate(form.birthDate, form.birthTime, offset, timeZoneId);
      const label = form.birthPlace.trim() || "Không rõ địa điểm";
      const result = calculateChart(timed.utcDate, latitude, longitude, label, timeZoneId, timed.resolvedOffset, {
        houseSystem,
        zodiacFrame
      });

      setBirthInputs({ utcDate: timed.utcDate, latitude, longitude, label, timeZoneId, timezoneOffset: timed.resolvedOffset });
      setChart(result);
      setStatus("");
      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Đã lập bản đồ sao cho ${label} · ${form.birthDate} ${form.birthTime} (UTC${timed.resolvedOffset >= 0 ? "+" : ""}${timed.resolvedOffset}).\n\nMặt Trời ${displayAngle(
            result.planets[0].longitude
          )}, Mặt Trăng ${displayAngle(result.planets[1].longitude)}, Cung Mọc ${displayAngle(result.ascendant)}.\n\nBạn có thể hỏi tôi ngay, hoặc xem bản đồ sao thực tế phía dưới để biết bầu trời tại nơi bạn ở.`
        }
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lập bản đồ sao với dữ liệu hiện tại.");
    }
  };

  // Lập chart một lần khi mở lại trang nếu đã có thông tin đã lưu.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_FORM)) createChart();
    } catch {
      /* bỏ qua */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (text?: string) => {
    const value = (text ?? question).trim();
    if (!chart) {
      setStatus("Hãy tạo bản đồ sao trước khi trò chuyện với AI.");
      return;
    }
    if (!value) {
      setStatus("Vui lòng nhập câu hỏi trước khi gửi.");
      return;
    }

    const userTurn: ChatTurn = { role: "user", content: value };
    const history = [...chatMessages, userTurn].filter((turn) => turn.content !== INTRO_MESSAGE.content);
    setChatMessages((previous) => [...previous, userTurn]);
    setQuestion("");
    setIsAsking(true);
    setStatus("");
    setEngine(null);

    const report = [
      buildChartReport(chart, senderName.trim() || "Người dùng", value, transitToLines(transits)),
      variant ? variantReport(variant) : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const fallback = () =>
      answerLocally({
        question: value,
        chart,
        senderName: senderName.trim() || "bạn",
        now,
        sky: skySnapshot ?? computeSkySnapshot(now, chart.latitude, chart.longitude, localSiderealDegrees(now, chart.longitude), calcObliquity(now)),
        transits,
        fixedStars,
        variant: variant ?? undefined,
        riseSet: riseSet ?? { sunRise: "—", sunSet: "—", moonRise: "—", moonSet: "—", timeZoneLabel: "giờ máy của bạn" }
      });

    const result = await askServerAi({
      messages: history.slice(-12),
      chartReport: report,
      senderName: senderName.trim() || "Người dùng"
    });

    if ("reply" in result && result.reply) {
      setEngine("gemini");
      setEngineLabel(result.model || "mô hình lớn");
      setChatMessages((previous) => [...previous, { role: "assistant", content: result.reply }]);
    } else {
      const message = "error" in result ? result.error : "Không gọi được mô hình lớn.";
      setEngine("local");
      setEngineLabel("bộ luận giải nội bộ");
      setStatus(`Mô hình lớn chưa sẵn sàng (${message}) — đã trả lời bằng bộ luận giải nội bộ chạy trong trình duyệt.`);
      setChatMessages((previous) => [...previous, { role: "assistant", content: fallback() }]);
    }

    setIsAsking(false);
  };

  return (
    <main className="app-bg min-h-screen text-slate-100 antialiased">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3.5 md:px-10">
          <p className="inline-flex items-center gap-2 rounded-md border border-sky-300/35 bg-sky-300/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-sky-200">
            ✦ ASTRAL CHART VN
          </p>
          <nav className="no-scrollbar -mx-1 flex items-center gap-4 overflow-x-auto px-1 text-sm text-slate-300 md:gap-5">
            <a href="#lap-chart" className="whitespace-nowrap transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 rounded-md px-1 py-0.5">
              Lập bản đồ sao
            </a>
            <a href="#ban-do-sao" className="whitespace-nowrap transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 rounded-md px-1 py-0.5">
              Bản đồ sao 3D
            </a>
            <a href="#ket-qua" className="whitespace-nowrap transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 rounded-md px-1 py-0.5">
              Kết quả natal
            </a>
            <a href="#hoi-ai" className="whitespace-nowrap transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 rounded-md px-1 py-0.5">
              Hỏi AI
            </a>
          </nav>
        </div>
      </header>

      <section
        className="relative flex min-h-[80vh] items-center overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(rgba(2,6,23,0.72), rgba(2,6,23,0.92)), url('/images/astro-night.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(167,139,250,0.15),transparent_35%)]" />
        <motion.div
          className="pointer-events-none absolute -right-20 top-1/2 hidden h-[38rem] w-[38rem] -translate-y-1/2 lg:block"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, ease: "linear", repeat: Infinity }}
        >
          <div className="h-full w-full rounded-full border border-sky-200/30" />
          <div className="absolute inset-10 rounded-full border border-violet-200/20" />
          <div className="absolute inset-20 rounded-full border border-slate-300/20" />
        </motion.div>

        <div className="relative mx-auto w-full max-w-7xl px-6 py-20 md:px-10">
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-sm font-semibold tracking-[0.3em] text-sky-300"
          >
            BẢN ĐỒ SAO · BẦU TRỜI THỰC TẾ · AI LUẬN GIẢI
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl"
          >
            Lập bản đồ sao, xem bầu trời thật và đặt câu hỏi cho AI trả lời
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-100/90"
          >
            Nhập ngày - giờ - nơi sinh để dựng bản đồ sao natal (Mặt Trời, Mặt Trăng, cung Mọc, 12 nhà, góc chiếu, sao cố định). Sau đó mở
            bản đồ sao thực tế với 5.044 ngôi sao Hipparcos, 88 chòm sao và 118 thiên thể sâu, rồi hỏi trợ lý AI bất cứ điều gì.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-9 flex flex-wrap gap-4"
          >
            <a
              href="#lap-chart"
              className="inline-flex items-center justify-center rounded-lg bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Lập bản đồ sao ngay
            </a>
            <a
              href="#hoi-ai"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300/50 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300 hover:text-sky-200"
            >
              Hỏi AI luận giải
            </a>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-12 grid max-w-3xl grid-cols-2 gap-4 text-sm sm:grid-cols-4"
          >
            {[
              ["5.044", "ngôi sao Hipparcos"],
              ["88", "chòm sao (tên Việt)"],
              ["118", "thiên thể sâu"],
              ["2 lớp AI", "mô hình lớn + nội bộ"]
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3">
                <dt className="text-lg font-semibold text-sky-200">{value}</dt>
                <dd className="text-xs text-slate-400">{label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-slate-800/70">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[radial-gradient(600px_220px_at_50%_0%,rgb(56_189_248/0.14),transparent_70%)]" />
        <div className="mx-auto w-full max-w-7xl px-6 py-16 md:px-10 md:py-24">
          <p className="overline">Bản đồ sao · Bầu trời thật 3D · Luận giải AI</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Ngắm bầu trời của bạn{" "}
            <span className="bg-gradient-to-r from-sky-300 via-indigo-300 to-amber-200 bg-clip-text text-transparent">
              như đang đứng dưới sao
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
            Lập bản đồ sao natal trong vài giây, rồi bước vào khung ngắm phối cảnh 3D: sao nhấp nháy, Ngân Hà có rãnh tối,
            hành tinh là khối cầu với pha thật, và vòm trời xoay khi bạn tua thời gian. Cần luận giải? Hỏi AI từng câu hoặc
            hỏi riêng một thiên thể.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#lap-chart" className="btn-primary">Lập bản đồ sao</a>
            <a href="#ban-do-sao" className="btn-ghost">Ngắm bầu trời 3D</a>
            <a href="#hoi-ai" className="btn-ghost">Hỏi AI</a>
          </div>
          <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ["5.044", "sao Hipparcos"],
              ["88", "chòm sao tên Việt"],
              ["12", "hệ nhà chiêm tinh"],
              ["60 fps", "vòm trời quay mượt"]
            ].map(([value, label]) => (
              <div key={label} className="card flex flex-col px-4 py-3">
                <dt className="order-2 mt-1 block text-xs text-slate-400">{label}</dt>
                <dd className="order-1 text-xl font-semibold text-sky-200">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="lap-chart" className="mx-auto w-full max-w-7xl px-6 py-16 md:px-10">
        <p className="overline">Mục 1</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Nhập dữ liệu sinh</h2>
        <p className="mt-3 max-w-3xl text-slate-300">
          Toạ độ và múi giờ IANA giúp tính chính xác cung Mọc và nhà. Bạn có thể tìm toạ độ tự động bằng tên địa điểm, chọn nhanh thành
          phố, hoặc nhập tay.
        </p>
        <div className="mt-8">
          <BirthForm
            values={form}
            setValues={(updater) => setForm(updater)}
            onSubmit={createChart}
            onResolvePlace={resolvePlace}
            isGeocoding={isGeocoding}
            geocodeNote={geocodeNote}
            error={error}
          />
        </div>
      </section>

      <section id="ban-do-sao" className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-10">
        <p className="overline">Mục 2</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Bản đồ sao 3D &amp; bầu trời hôm nay</h2>
        <p className="mt-3 max-w-3xl text-slate-300">
          Bầu trời thật tại vị trí của bạn — sao, chòm sao, hành tinh, Mặt Trăng, Ngân Hà tính từ catalogue Hipparcos và
          astronomy-engine — chiếu qua ống kính phối cảnh 3D: chân trời thẳng, vòng độ cao cong, hành tinh là khối cầu có
          pha thật, mặt đất có chiều sâu và ba lớp núi. Kéo để nhìn quanh, lăn chuột phóng to quanh con trỏ, tua thời gian
          để thấy vòm trời xoay cùng lưới xích đạo và vệt sao cung tròn.
        </p>
        <div className="mt-8">
          <Sky3D
            latitude={Number.isFinite(lat) ? lat : 21.0285}
            longitude={Number.isFinite(lon) ? lon : 105.8542}
            placeLabel={form.birthPlace || "Hà Nội, Việt Nam"}
            onAskAbout={(value) => {
              void ask(value);
            }}
          />
        </div>

        {skySnapshot && riseSet ? (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="card p-5 transition hover:border-slate-700">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Đang thấy trên trời</h3>
              <ul className="mt-3 space-y-1 text-sm text-slate-200">
                {skySnapshot.visibleNow.length ? (
                  skySnapshot.visibleNow.slice(0, 5).map((item) => (
                    <li key={item.label} className="flex justify-between gap-2">
                      <span>{item.label}</span>
                      <span className="text-slate-400">
                        cao {item.alt.toFixed(0)}° · hướng {item.az.toFixed(0)}°
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400">Chưa có hành tinh nào nổi trên 5°.</li>
                )}
              </ul>
            </div>
            <div className="card p-5 transition hover:border-slate-700">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Mặt Trời &amp; Mặt Trăng</h3>
              <p className="mt-3 text-sm text-slate-200">{skySnapshot.moonPhase}</p>
              <p className="text-xs text-slate-400">Độ sáng {(skySnapshot.moonIllumination * 100).toFixed(0)}%</p>
              <p className="mt-2 text-sm text-slate-300">
                Mọc {riseSet.sunRise} · Lặn {riseSet.sunSet}
              </p>
              <p className="text-sm text-slate-300">
                Trăng mọc {riseSet.moonRise} · Trăng lặn {riseSet.moonSet}
              </p>
              <p className="text-xs text-slate-500">Giờ theo {riseSet.timeZoneLabel}</p>
            </div>
            <div className="card p-5 transition hover:border-slate-700">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Hành tinh theo cung</h3>
              <ul className="mt-3 space-y-1 text-sm text-slate-200">
                {skySnapshot.planets
                  .filter((planet) => planet.key !== "sun")
                  .slice(0, 5)
                  .map((planet) => (
                    <li key={planet.key} className="flex justify-between gap-2">
                      <span style={{ color: planet.color }}>{planet.label}</span>
                      <span className="text-slate-400">
                        {displayAngle(planet.lon)}
                        {planet.retrograde ? " R" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section id="ket-qua" className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-10">
        <p className="overline">Mục 3</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Kết quả bản đồ sao natal</h2>
        <AnimatePresence mode="wait">
          {chart ? (
            <motion.div key="result" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
              <p className="mt-3 text-slate-300">
                {chart.locationLabel} · {chart.latitude.toFixed(4)}°, {chart.longitude.toFixed(4)}° ·{" "}
                {chart.timezoneId ?? "múi giờ thủ công"} · giờ sinh quy đổi {chart.utcDate.toUTCString()}
              </p>

              <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="card p-4 md:p-6">
                  <ChartWheel
                    planets={chart.planets}
                    aspects={chart.aspects}
                    houses={chart.houses}
                    ascendant={chart.ascendant}
                    descendant={chart.descendant}
                    midheaven={chart.midheaven}
                    imumCoeli={chart.imumCoeli}
                  />
                  <p className="mt-4 text-center text-xs text-slate-500">
                    Vòng ngoài: 12 cung hoàng đạo · vòng trong: 12 nhà (hệ {variant?.houseSystemLabel ?? "Toàn cung (Whole Sign)"}) · đường nối
                    màu: góc chiếu chính.
                  </p>
                </div>
                <ChartPanel chart={chart} transits={transits} fixedStars={fixedStars} />
              </div>

              {variant ? (
                <div className="mt-6">
                  <VariantPanel
                    variant={variant}
                    chart={chart}
                    onHouseSystem={setHouseSystem}
                    onZodiacFrame={setZodiacFrame}
                  />
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h3 className="text-xl font-semibold">Chưa có bản đồ sao</h3>
              <p className="mt-2 max-w-2xl text-slate-400">
                Hãy nhập ngày - giờ - nơi sinh ở mục 1 rồi bấm “Tạo bản đồ sao”. Kết quả gồm vòng bản đồ sao, vị trí 10 hành tinh, 12 nhà,
                góc chiếu, cân bằng nguyên tố, sao cố định và transit hiện tại.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section id="hoi-ai" className="mx-auto w-full max-w-7xl px-6 pb-24 md:px-10">
        <div className="border-t border-slate-800 pt-12">
          <p className="overline">Mục 4</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Đặt câu hỏi cho AI trả lời</h2>
          <p className="mt-3 max-w-3xl text-slate-300">
            Hỏi tự nhiên bằng tiếng Việt. Câu hỏi được gửi kèm toàn bộ dữ liệu bản đồ sao, transit hiện tại, sao cố định và tình trạng bầu
            trời tại nơi bạn ở. Nếu máy chủ chưa có <code className="text-sky-200">GEMINI_API_KEY</code>, hệ thống vẫn trả lời bằng bộ luận
            giải nội bộ.
          </p>
        </div>

        <div className="mt-8">
          <ChatPanel
            messages={chatMessages}
            question={question}
            setQuestion={setQuestion}
            onSend={(text) => {
              void ask(text);
            }}
            onClear={() => {
              setChatMessages([INTRO_MESSAGE]);
              setStatus("");
              setEngine(null);
            }}
            isAsking={isAsking}
            status={status}
            engine={engine}
            engineLabel={engineLabel}
            serverLlm={serverLlm}
            senderName={senderName}
            setSenderName={setSenderName}
            hasChart={Boolean(chart)}
          />
        </div>
      </section>

      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto w-full max-w-7xl px-6 py-10 text-sm text-slate-400 md:px-10">
          <p>
            Dữ liệu sao: d3-celestial (Olaf Frohn, MIT) — catalogue Hipparcos, 88 chòm sao, Messier. Tính toán thiên văn: astronomy-engine
            (Don Cross, MIT). Tra toạ độ: OpenStreetMap Nominatim / Open-Meteo.
          </p>
          <p className="mt-3">
            Chiêm tinh là hệ thống tham khảo về xu hướng và tính cách, không thay thế tư vấn y tế, tài chính hay pháp lý. Hãy dùng nội dung
            như một góc nhìn để tự soi chiếu.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Mẹo: bấm vào một ngôi sao, hành tinh hoặc thiên thể trên bản đồ rồi chọn “Hỏi AI về đối tượng này” để nhận luận giải riêng cho
            đối tượng đó.
          </p>
        </div>
      </footer>
    </main>
  );
}
