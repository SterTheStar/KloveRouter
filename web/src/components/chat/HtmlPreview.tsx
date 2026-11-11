import { useEffect, useMemo, useRef, useState } from "react";
import {
  RiDeleteBinLine,
  RiRefreshLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

type LogEntry = {
  level: "log" | "info" | "warn" | "error" | "runtime";
  message: string;
};

type PreviewMessage = {
  source: "saturn-preview";
  token: string;
  type: "log";
  level: LogEntry["level"];
  message: string;
};

const MAX_LOGS = 200;

function makeBridge(token: string) {
  const serializedToken = JSON.stringify(token);
  return `<script>(${((bridgeToken: string) => {
    const send = (message: { type: string; level?: string; message?: string }) =>
      window.parent.postMessage({ source: "saturn-preview", token: bridgeToken, ...message }, "*");
    const format = (value: unknown) => {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    };
    const createStorage = () => {
      const values = new Map<string, string>();
      return {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(String(key)) ?? null,
        setItem: (key: string, value: string) => { values.set(String(key), String(value)); },
        removeItem: (key: string) => { values.delete(String(key)); },
        clear: () => { values.clear(); },
      };
    };
    try {
      const storage = createStorage();
      Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
      Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
    } catch (error) {
      send({ type: "log", level: "runtime", message: `Storage unavailable: ${format(error)}` });
    }
    ["log", "info", "warn", "error"].forEach((level) => {
      const original = console[level as "log" | "info" | "warn" | "error"];
      console[level as "log" | "info" | "warn" | "error"] = (...args: unknown[]) => {
        send({ type: "log", level, message: args.map(format).join(" ") });
        original(...args);
      };
    });
    window.addEventListener("error", (event) => {
      send({ type: "log", level: "runtime", message: event.message || "Runtime error" });
    });
    window.addEventListener("unhandledrejection", (event) => {
      send({ type: "log", level: "runtime", message: `Unhandled rejection: ${format(event.reason)}` });
    });
  }).toString()})(${serializedToken})</script>`;
}

function injectBridge(code: string, bridge: string) {
  const lower = code.toLowerCase();
  const headEnd = lower.indexOf("</head>");
  if (headEnd >= 0) return `${code.slice(0, headEnd)}${bridge}${code.slice(headEnd)}`;
  const bodyEnd = lower.indexOf("</body>");
  if (bodyEnd >= 0) return `${code.slice(0, bodyEnd)}${bridge}${code.slice(bodyEnd)}`;
  return `${bridge}${code}`;
}

export function HtmlPreview({
  code,
  className,
  streaming = false,
  fill = false,
}: {
  code: string;
  className?: string;
  streaming?: boolean;
  fill?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef(crypto.randomUUID());
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const srcDoc = useMemo(
    () => injectBridge(code, makeBridge(tokenRef.current)),
    [code, streaming],
  );

  useEffect(() => {
    if (!streaming) setLogs([]);
  }, [srcDoc, streaming]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.source !== "saturn-preview" ||
        event.data.token !== tokenRef.current
      ) return;
      setLogs((current) => [...current, { level: event.data.level, message: event.data.message }].slice(-MAX_LOGS));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (streaming) {
    return <div className={cn("flex min-h-[28rem] items-center justify-center bg-white text-sm text-muted-foreground", className)}>Preview available after response finishes.</div>;
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title="HTML preview"
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        srcDoc={srcDoc}
        className={fill ? "min-h-0 w-full flex-1 border-0 bg-white" : "h-[min(65vh,720px)] min-h-[28rem] w-full flex-1 border-0 bg-white"}
      />
      <div className="shrink-0 border-t border-border bg-background/60">
        <div className="flex h-10 items-center gap-0.5 px-1.5">
          <button
            type="button"
            className={`flex h-7 items-center gap-1 rounded-lg px-2 text-xs transition-colors hover:bg-accent hover:text-foreground ${terminalOpen ? "bg-overlay/70 font-normal text-foreground" : "text-tertiary"}`}
            onClick={() => setTerminalOpen((open) => !open)}
            aria-expanded={terminalOpen}
            aria-controls="html-preview-terminal"
          >
            {terminalOpen ? <RiArrowDownSLine className="size-3.5" /> : <RiArrowRightSLine className="size-3.5" />}
            Terminal
          </button>
          <button
            type="button"
            className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-tertiary transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => {
              setReloading(true);
              setReloadKey((key) => key + 1);
              setTimeout(() => setReloading(false), 500);
            }}
            aria-label="Reload preview"
          >
            <RiRefreshLine className={cn("size-3.5", reloading && "animate-spin")} /> Reload
          </button>
          {terminalOpen && (
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-tertiary transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setLogs([])}
              aria-label="Clear terminal logs"
            >
              <RiDeleteBinLine className="size-3.5" /> Clear
            </button>
          )}
        </div>
        {terminalOpen && <div id="html-preview-terminal" className="border-t border-border p-2">
          <div className="mb-2 max-h-40 overflow-auto rounded-lg bg-[#0d0d0d] p-2 font-mono text-xs text-white" aria-live="polite">
            {logs.length === 0 ? <span className="text-white/50">No logs</span> : logs.map((log, index) => <div key={`${index}-${log.message}`} className={log.level === "error" || log.level === "runtime" ? "text-[#ff9a9a]" : log.level === "warn" ? "text-[#ffcb8a]" : "whitespace-pre-wrap"}><span className="mr-2 text-white/50">[{log.level}]</span>{log.message}</div>)}
          </div>
        </div>}
      </div>
    </div>
  );
}
