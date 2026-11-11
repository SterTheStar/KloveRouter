import { AlertTriangle, Info } from "lucide-react";
import type { ThinkOpeningTagMode } from "../../types";

interface OutputFixesTabProps {
  value: ThinkOpeningTagMode;
  onChange: (value: ThinkOpeningTagMode) => void;
}

const thinkTagModeOptions: {
  value: ThinkOpeningTagMode;
  title: string;
  description: string;
}[] = [
  {
    value: "off",
    title: "Off (Default)",
    description: "Return model streaming and completion chunks untouched.",
  },
  {
    value: "detect",
    title: "Detect missing opening tag",
    description:
      "Buffer output until an opening or closing <think> tag is detected. If the provider model emits thinking content without <think>, Saturn prepends it automatically.",
  },
  {
    value: "force",
    title: "Force opening tag",
    description:
      "Always prefix <think> immediately to the first chunk of each response without buffering.",
  },
];

export function OutputFixesTab({ value, onChange }: OutputFixesTabProps) {
  return (
    <div className="space-y-4 py-1">
      <div>
        <h3 className="text-sm font-normal text-foreground">
          Think tag handling & reasoning stream
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure how Saturn handles reasoning models that omit the initial &lt;think&gt; tag in streaming responses (e.g. DeepSeek-R1 derivatives).
        </p>
      </div>

      <div className="space-y-2">
        {thinkTagModeOptions.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`w-full rounded-lg border p-3 text-left text-xs transition-colors cursor-pointer ${
                selected
                  ? "border-primary/50 bg-primary/10 shadow-xs"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/50"
              }`}
              aria-pressed={selected}
            >
              <div className="flex items-center justify-between">
                <span className="font-normal text-foreground text-xs">{option.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground font-normal">
                  {selected ? "Active" : "Select"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      {value === "detect" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-3 text-xs text-muted-foreground leading-relaxed">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
          <span>
            <strong className="text-foreground font-normal">Streaming buffer note:</strong> Saturn buffers the initial tokens of each choice until either a tag is spotted or certainty is reached, preserving compatibility with Claude Code, Cursor, and OpenCode clients.
          </span>
        </div>
      )}

      {value === "force" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong className="font-normal">Use with caution:</strong> This mode always inserts a &lt;think&gt; tag on the very first token without checking the content. If the upstream provider already includes tags, clients may encounter duplicated XML tags.
          </span>
        </div>
      )}
    </div>
  );
}
