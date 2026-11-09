import { useState } from "react";
import {
  RiCloseLine,
  RiFileCopyLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiCheckDoubleLine,
  RiSparklingLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "../chat/Markdown";
import type { DesignSkill } from "../../types";

export function DesignPreviewModal({
  design,
  onClose,
  onToggleActive,
  isToggling,
}: {
  design: DesignSkill | null;
  onClose: () => void;
  onToggleActive: (slug: string) => void;
  isToggling: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"showcase" | "skill">("showcase");
  const [copied, setCopied] = useState(false);
  const [sampleInput, setSampleInput] = useState("Interactive test input");

  if (!design) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(design.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNeobrutalism = design.slug === "neobrutalism";
  const isGlass = design.slug === "glassmorphism";
  const isCyberpunk = design.slug === "cyberpunk";
  const isPaper = design.slug === "paper";
  const isBento = design.slug === "bento";
  const isTerminal = design.slug === "terminal";
  const isDithered = design.slug === "dithered";
  const isDoodle = design.slug === "doodle";
  const isSkeuomorphic = design.slug === "skeuomorphic";

  return (
    <Dialog open={Boolean(design)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-w-6xl max-md:h-[88vh] md:aspect-[16/9] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span>{design.name}</span>
              </DialogTitle>
              <Badge variant="outline" className="text-xs font-normal">
                {design.aesthetic}
              </Badge>
              {design.is_active && (
                <Badge variant="outline" className="text-xs gap-1 text-foreground">
                  <RiCheckLine className="size-3" />
                  Active
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-tertiary">
              {design.subtitle} • {design.author}
            </DialogDescription>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab("showcase")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "showcase"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-tertiary hover:text-foreground hover:bg-muted"
              }`}
            >
              Live Component Playground
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("skill")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "skill"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-tertiary hover:text-foreground hover:bg-muted"
              }`}
            >
              SKILL.md System Prompt
            </button>
          </div>
        </DialogHeader>

        {/* Dialog Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "showcase" ? (
            <div className="space-y-6">
              {/* Color Palette Grid */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                  Design Tokens • Color System
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  {[
                    { label: "Primary", hex: design.palette.primary, desc: "Action & CTA" },
                    { label: "Background", hex: design.palette.background, desc: "Canvas" },
                    { label: "Surface", hex: design.palette.surface, desc: "Card base" },
                    { label: "Text / Ink", hex: design.palette.text, desc: "Typography" },
                    { label: "Accent", hex: design.palette.accent, desc: "Highlights" },
                    { label: "Border", hex: design.palette.border, desc: "Hairlines" },
                  ].map((color, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg border border-border bg-card/40 flex flex-col justify-between space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground">{color.label}</span>
                        <div
                          className="size-4 rounded-xs border border-black/10 dark:border-white/10 shadow-xs"
                          style={{ backgroundColor: color.hex }}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-mono font-bold">{color.hex}</div>
                        <div className="text-[10px] text-tertiary">{color.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* The Live Interactive Sandbox Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                    Live Rendered Components (In-Style)
                  </span>
                  <span className="text-[11px] text-tertiary font-mono">
                    Font: {design.tokens.fontFamily.split(",")[0]}
                  </span>
                </div>

                <div
                  className="p-6 transition-all rounded-xl relative overflow-hidden"
                  style={{
                    backgroundColor: design.palette.background,
                    color: design.palette.text,
                    fontFamily: design.tokens.fontFamily,
                  }}
                >
                  {/* Glassmorphism ambient gradient orbs */}
                  {isGlass && (
                    <>
                      <div
                        className="absolute -top-12 -left-12 size-40 blur-2xl opacity-40 pointer-events-none"
                        style={{ backgroundColor: design.palette.primary }}
                      />
                      <div
                        className="absolute -bottom-12 -right-12 size-48 blur-2xl opacity-40 pointer-events-none"
                        style={{ backgroundColor: design.palette.accent }}
                      />
                    </>
                  )}

                  <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    {/* Themed Card Component */}
                    <div
                      className="p-5 transition-all space-y-4"
                      style={{
                        backgroundColor: design.palette.surface,
                        borderColor: design.palette.border,
                        borderWidth: isNeobrutalism ? "2.5px" : "1px",
                        borderStyle: "solid",
                        borderRadius: isNeobrutalism
                          ? "4px"
                          : isBento || isGlass
                          ? "16px"
                          : isDoodle
                          ? "20px 4px 18px 6px"
                          : isDithered || isTerminal
                          ? "0px"
                          : "8px",
                        boxShadow: isNeobrutalism
                          ? "4px 4px 0px #000"
                          : isCyberpunk
                          ? "0 0 20px rgba(0, 240, 255, 0.2)"
                          : isTerminal
                          ? "0 0 12px rgba(34, 197, 94, 0.15)"
                          : isBento
                          ? "0 8px 30px rgba(0,0,0,0.4)"
                          : "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    >
                      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: design.palette.border }}>
                        <div className="space-y-0.5">
                          <h4
                            className="font-bold text-sm tracking-tight"
                            style={{ color: design.palette.text }}
                          >
                            {isTerminal ? "> SYSTEM_METRICS.LOG" : "Platform Analytics"}
                          </h4>
                          <p className="text-[11px] opacity-75">
                            Real-time streaming throughput
                          </p>
                        </div>
                        <span
                          className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded"
                          style={{
                            backgroundColor: isNeobrutalism
                              ? design.palette.accent
                              : isCyberpunk
                              ? "rgba(0, 240, 255, 0.15)"
                              : design.palette.primary,
                            color: isNeobrutalism ? "#000" : "#FFF",
                            border: isNeobrutalism ? "1.5px solid #000" : undefined,
                          }}
                        >
                          99.98% OK
                        </span>
                      </div>

                      {/* Interactive Form Field */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium block opacity-85">
                          {isTerminal ? "$ prompt_input" : "Prompt or Instruction"}
                        </label>
                        <input
                          type="text"
                          value={sampleInput}
                          onChange={(e) => setSampleInput(e.target.value)}
                          className="w-full px-3 py-2 text-xs transition-all focus:outline-none"
                          style={{
                            backgroundColor: isTerminal ? "#000" : isGlass ? "rgba(255,255,255,0.05)" : "#FFF",
                            color: isTerminal ? "#22C55E" : "#000",
                            borderColor: design.palette.border,
                            borderWidth: isNeobrutalism ? "2px" : "1px",
                            borderStyle: "solid",
                            borderRadius: isNeobrutalism ? "3px" : isTerminal || isDithered ? "0px" : "6px",
                            boxShadow: isNeobrutalism ? "2px 2px 0px #000" : undefined,
                          }}
                        />
                      </div>

                      {/* Buttons Showcase */}
                      <div className="pt-2 flex flex-wrap items-center gap-2.5">
                        {/* Primary Button */}
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5"
                          style={{
                            backgroundColor: design.palette.primary,
                            color: isNeobrutalism || isDoodle ? "#000" : "#FFF",
                            borderRadius: isNeobrutalism
                              ? "4px"
                              : isBento || isGlass
                              ? "10px"
                              : isDoodle
                              ? "255px 15px 225px 15px"
                              : isDithered || isTerminal
                              ? "0px"
                              : "6px",
                            border: isNeobrutalism
                              ? "2px solid #000"
                              : isDithered
                              ? "2px solid #000"
                              : isTerminal
                              ? "1px solid #22C55E"
                              : "none",
                            boxShadow: isNeobrutalism
                              ? "3px 3px 0px #000"
                              : isSkeuomorphic
                              ? "0 3px 0 #1d4ed8, 0 4px 6px rgba(0,0,0,0.2)"
                              : isCyberpunk
                              ? "0 0 12px rgba(0, 240, 255, 0.4)"
                              : undefined,
                          }}
                        >
                          <RiSparklingLine className="size-3.5" />
                          <span>{isTerminal ? "[ EXECUTE ]" : isNeobrutalism ? "Submit →" : "Primary Action"}</span>
                        </button>

                        {/* Secondary Button */}
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-medium transition-all cursor-pointer"
                          style={{
                            backgroundColor: "transparent",
                            color: isTerminal ? design.palette.primary : design.palette.text,
                            borderColor: design.palette.border,
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: isNeobrutalism ? "4px" : isTerminal || isDithered ? "0px" : "6px",
                          }}
                        >
                          Secondary
                        </button>

                        {/* Outline / Tag */}
                        <span
                          className="text-[11px] font-mono px-2 py-1 rounded"
                          style={{
                            backgroundColor: isGlass ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                            border: `1px dashed ${design.palette.border}`,
                          }}
                        >
                          radius: {design.tokens.borderRadius}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tokens Table */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                  System Specifications &amp; Rules
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tokens */}
                  <div className="p-4 rounded-lg border border-border bg-card/40 space-y-2 text-xs">
                    <span className="font-semibold text-foreground">Design Tokens</span>
                    <div className="divide-y divide-border text-tertiary">
                      <div className="py-1.5 flex justify-between">
                        <span>Font Stack:</span>
                        <span className="font-mono text-foreground">{design.tokens.fontFamily}</span>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <span>Border Radius:</span>
                        <span className="font-mono text-foreground">{design.tokens.borderRadius}</span>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <span>Spacing Grid:</span>
                        <span className="font-mono text-foreground">{design.tokens.spacing}</span>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <span>Shadow Depth:</span>
                        <span className="font-mono text-foreground">{design.tokens.shadow}</span>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <span>Border Width:</span>
                        <span className="font-mono text-foreground">{design.tokens.borderWidth}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rules Checklist */}
                  <div className="p-4 rounded-lg border border-border bg-card/40 space-y-2 text-xs">
                    <span className="font-semibold text-foreground">Core Rules for AI Agent</span>
                    <ul className="space-y-1.5 text-tertiary list-none">
                      {design.rules.map((rule, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <RiCheckDoubleLine className="size-3.5 text-primary shrink-0 mt-0.5" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                  Raw SKILL.md Agent Instructions
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleCopy}
                  className="gap-1.5 text-xs"
                >
                  {copied ? (
                    <>
                      <RiCheckLine className="size-3.5 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <RiFileCopyLine className="size-3.5" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="p-4 rounded-lg border border-border bg-card/50 text-xs font-mono leading-relaxed overflow-x-auto max-h-[500px]">
                <Markdown content={design.content} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="m-0 px-6 py-4 border-t border-border bg-card/60 shrink-0 flex items-center justify-between sm:justify-between w-full">
          <div className="flex items-center gap-2">
            <a
              href={design.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-tertiary hover:text-foreground transition-colors"
            >
              <span>GitHub</span>
              <RiExternalLinkLine className="size-3.5" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant={design.is_active ? "destructive" : "default"}
              size="sm"
              onClick={() => onToggleActive(design.slug)}
              disabled={isToggling}
              className="gap-1.5"
            >
              {isToggling ? (
                <RiLoader4Line className="size-4 animate-spin" />
              ) : design.is_active ? (
                <>
                  <RiCloseLine className="size-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <RiCheckLine className="size-4" />
                  Activate This Design
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
