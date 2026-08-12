import { useEffect, useRef, useState } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiCheckLine as CheckLine,
} from "@remixicon/react";
import type { ReasoningEffort } from "../../types";

export default function ReasoningInput({
  efforts,
  value,
  onChange,
  disabled,
}: {
  efforts: ReasoningEffort[];
  value: string | null;
  onChange: (effort: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = efforts.find((effort) => effort.effort === value) ?? efforts.find((effort) => effort.is_default) ?? efforts[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (current && current.effort !== value) onChange(current.effort);
  }, [current, onChange, value]);

  if (!efforts.length) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex h-8 max-w-36 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
        onClick={() => setOpen((previous) => !previous)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Reasoning effort"
      >
        <span className="min-w-0 truncate">{current?.display_name || current?.effort}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-11 z-50 w-56 overflow-hidden rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl">
          <div className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Reasoning effort</div>
          <div className="space-y-0.5">
            {efforts.map((effort) => {
              const selected = effort.effort === current?.effort;
              return (
                <button
                  key={effort.effort}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    onChange(effort.effort);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm">
                    <span className="truncate text-foreground">{effort.display_name}</span>
                    <span className="shrink-0 text-muted-foreground/60">/</span>
                    <span className="truncate text-xs text-muted-foreground">{effort.effort}</span>
                  </span>
                  {selected && <CheckLine className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
