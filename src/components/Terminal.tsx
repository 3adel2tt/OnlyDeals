import { useEffect, useRef } from "react";
import type { LogLine, ScrapeStatus } from "../types";

const COLOR: Record<LogLine["kind"], string> = {
  sys: "text-flare",
  info: "text-[#a9928b]",
  ok: "text-[#4fd68c]",
  warn: "text-amber",
  err: "text-[#f07a5f]",
};

interface Props {
  logs: LogLine[];
  status: ScrapeStatus;
}

export default function Terminal({ logs, status }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <section className="overflow-hidden rounded-xl border border-term-line bg-term shadow-[0_18px_40px_-22px_rgba(25,16,16,0.55)]">
      <div className="flex items-center gap-2 border-b border-term-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f07a5f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber" />
        <span className="h-2.5 w-2.5 rounded-full bg-flare" />
        <span className="ml-2 font-mono text-[11px] tracking-[0.1em] text-[#8f766f]">
          scrape.log — sources/alrajhi.ts
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] ${
            status === "running"
              ? "bg-amber/15 text-amber"
              : status === "done"
                ? "bg-live/15 text-live"
                : "bg-paper/5 text-[#8f766f]"
          }`}
        >
          {status === "running" ? "running" : status === "done" ? "complete" : "idle"}
        </span>
      </div>

      <div
        ref={bodyRef}
        className="term-scroll h-36 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.75] sm:h-32"
      >
        {logs.length === 0 && (
          <p className="text-[#6b544e]">$ offradar --source alrajhi --watch</p>
        )}
        {logs.map((l) => (
          <p key={l.id} className={COLOR[l.kind]}>
            <span className="text-[#6b544e]">[{l.time}]</span>{" "}
            {l.kind === "err" ? "✗ " : l.kind === "ok" ? "✓ " : l.kind === "warn" ? "! " : l.kind === "sys" ? "» " : "· "}
            {l.text}
          </p>
        ))}
        {status === "running" && (
          <span className="caret inline-block h-[13px] w-[7px] translate-y-[2px] bg-flare" />
        )}
      </div>
    </section>
  );
}
