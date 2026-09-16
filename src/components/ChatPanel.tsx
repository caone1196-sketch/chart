import { type KeyboardEvent, type ReactElement, useEffect, useMemo, useRef } from "react";
import { suggestionChips } from "@/lib/interpret";
import type { ChatEngine, ChatTurn, ServerHealth } from "@/lib/ai";

type ServerLlmState = "checking" | "gemini" | "local" | "unreachable";

const serverStatusText: Record<ServerLlmState, string> = {
  checking: "đang kiểm tra…",
  gemini: "Gemini đã sẵn sàng",
  local: "chưa có key — dùng bộ nội bộ",
  unreachable: "không gọi được /api/health"
};

const serverStatusClass: Record<ServerLlmState, string> = {
  checking: "text-slate-300",
  gemini: "text-emerald-300",
  local: "text-amber-200",
  unreachable: "text-rose-300"
};

const renderInline = (text: string, keyPrefix: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${index}`} className="font-semibold text-sky-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${index}`}>{part}</span>
    )
  );
};

const MarkdownLite = ({ content }: { content: string }) => {
  const blocks = useMemo(() => content.split("\n"), [content]);
  const elements: ReactElement[] = [];

  blocks.forEach((line, index) => {
    const key = `line-${index}`;
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={key} className="h-2" />);
      return;
    }

    if (trimmed.startsWith("- ")) {
      elements.push(
        <p key={key} className="flex gap-2 pl-1">
          <span className="text-sky-400">•</span>
          <span>{renderInline(trimmed.slice(2), key)}</span>
        </p>
      );
      return;
    }

    if (trimmed.startsWith("  ")) {
      elements.push(
        <p key={key} className="pl-6 text-slate-300">
          {renderInline(trimmed, key)}
        </p>
      );
      return;
    }

    elements.push(<p key={key}>{renderInline(trimmed, key)}</p>);
  });

  return <div className="space-y-1.5 text-sm leading-relaxed">{elements}</div>;
};

export type ChatPanelProps = {
  messages: ChatTurn[];
  question: string;
  setQuestion: (value: string) => void;
  onSend: (text?: string) => void;
  onClear: () => void;
  isAsking: boolean;
  status: string;
  engine: ChatEngine | null;
  engineLabel: string;
  serverLlm: ServerLlmState;
  serverHealth: ServerHealth | null;
  isCheckingServer: boolean;
  onCheckServer: () => void;
  senderName: string;
  setSenderName: (value: string) => void;
  hasChart: boolean;
};

export default function ChatPanel({
  messages,
  question,
  setQuestion,
  onSend,
  onClear,
  isAsking,
  status,
  engine,
  engineLabel,
  serverLlm,
  serverHealth,
  isCheckingServer,
  onCheckServer,
  senderName,
  setSenderName,
  hasChart
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, isAsking]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-1">
        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Tên người hỏi</span>
          <input
            type="text"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            className="w-full rounded-lg border border-slate-600/80 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-300"
          />
        </label>

        <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-3 text-xs text-slate-300">
          <p className="font-semibold text-slate-200">Trợ lý trả lời bằng 2 lớp</p>
          <p className="mt-1">
            1. Nếu máy chủ có <code className="text-sky-200">GEMINI_API_KEY</code>, câu hỏi được gửi tới Gemini kèm toàn bộ
            dữ liệu chart.
          </p>
          <p className="mt-1">
            2. Nếu chưa có key, hệ thống dùng bộ luận giải nội bộ chạy ngay trên trình duyệt (vẫn đọc đúng vị trí hành tinh, nhà, góc
            chiếu, transit của bạn).
          </p>
          <p className="mt-2 text-slate-400">
            Trạng thái máy chủ: <span className={serverStatusClass[serverLlm]}>{serverStatusText[serverLlm]}</span>
            {serverLlm === "gemini" && serverHealth?.model ? <span className="text-slate-500"> · {serverHealth.model}</span> : null}
          </p>
          {serverLlm === "unreachable" ? (
            <p className="mt-2 text-rose-300">
              {serverHealth?.error || "Không gọi được route /api/health."} Nếu đang chạy trên Vercel, hãy kiểm tra{" "}
              <code className="text-rose-200">vercel.json</code> (rewrite SPA phải chừa <code className="text-rose-200">/api/*</code>) và mở thẳng{" "}
              <code className="text-rose-200">/api/health</code> trên tên miền đã deploy.
            </p>
          ) : null}
          {serverLlm === "local" && serverHealth?.keyPresent ? (
            <p className="mt-2 text-amber-200">
              Máy chủ có biến <code className="text-amber-100">GEMINI_API_KEY</code> nhưng khoá chưa dùng được
              {serverHealth.probe?.code ? ` (${serverHealth.probe.code})` : ""}. Bấm “Kiểm tra Gemini” để xem Google trả lời gì.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCheckServer}
              disabled={isCheckingServer}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-200 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCheckingServer ? "Đang kiểm tra…" : "Kiểm tra Gemini"}
            </button>
            <span className="text-[11px] text-slate-500">
              {serverHealth?.runtime ? `${serverHealth.runtime}${serverHealth.region ? ` · ${serverHealth.region}` : ""}` : "—"}
              {serverHealth?.keyPresent && typeof serverHealth.keyLength === "number" ? ` · khoá ${serverHealth.keyLength} ký tự` : ""}
            </span>
          </div>
          {serverHealth?.probe ? (
            <p className={`mt-2 ${serverHealth.probe.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {serverHealth.probe.ok
                ? `Google chấp nhận khoá · ${serverHealth.probe.modelCount ?? 0} model dùng được${
                    serverHealth.probe.preferredModelAvailable === false && serverHealth.probe.suggestedModel
                      ? ` · nên đặt GEMINI_MODEL=${serverHealth.probe.suggestedModel}`
                      : ""
                  }`
                : `${serverHealth.probe.error || "Khoá chưa dùng được."}${serverHealth.probe.hint ? ` ${serverHealth.probe.hint}` : ""}`}
            </p>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">Câu hỏi gợi ý</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestionChips.map((chip) => (
              <button key={chip} type="button" className="chip text-left" onClick={() => onSend(chip)} disabled={!hasChart || isAsking}>
                {chip}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="chip w-full" onClick={onClear}>
          Xoá hội thoại
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Trò chuyện với AI luận giải</h3>
          {engine ? (
            <span className={engine === "gemini" ? "chip chip-active" : "chip"}>
              {engine === "gemini" ? `Gemini: ${engineLabel}` : "Bộ luận giải nội bộ"}
            </span>
          ) : null}
        </div>

        <div ref={scrollRef} className="mt-4 h-[24rem] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/80 p-3 md:h-[28rem] md:p-4">
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-3 py-2.5 ${
                  message.role === "user"
                    ? "ml-auto max-w-[88%] border border-sky-300/30 bg-sky-400/15 text-sky-50"
                    : "mr-auto max-w-[92%] border border-slate-700 bg-slate-900/90 text-slate-100"
                }`}
              >
                {message.role === "user" ? <p className="text-sm leading-relaxed">{message.content}</p> : <MarkdownLite content={message.content} />}
              </div>
            ))}
            {isAsking ? (
              <div className="mr-auto max-w-[80%] rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-300">
                Đang phân tích bản đồ sao
                <span className="animate-pulse">…</span>
              </div>
            ) : null}
          </div>
        </div>

        {status ? <p className="mt-2 text-xs text-amber-200">{status}</p> : null}

        <div className="mt-4 space-y-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ví dụ: Năm tới tôi có nên đổi việc không? Hoặc: Tối nay ở Hà Nội thấy được hành tinh nào?"
            rows={3}
            className="w-full rounded-lg border border-slate-600/80 bg-slate-950/90 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-300"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSend()}
              disabled={isAsking || !hasChart}
              className="inline-flex items-center justify-center rounded-lg bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAsking ? "Đang gửi…" : "Gửi câu hỏi"}
            </button>
            <span className="text-xs text-slate-500">Enter để gửi · Shift + Enter xuống dòng</span>
          </div>
          {!hasChart ? <p className="text-xs text-amber-200">Hãy tạo bản đồ sao ở phía trên trước khi hỏi AI.</p> : null}
        </div>
      </div>
    </div>
  );
}
