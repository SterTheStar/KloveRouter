import { useState, useEffect } from "react";
import {
  RiCloseLine,
  RiFileCopyLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiCheckDoubleLine,
  RiLoader4Line,
  RiPaletteLine,
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
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [design?.slug, design?.image_url]);

  if (!design) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(design.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={Boolean(design)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-w-6xl h-[88vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-normal flex items-center gap-2">
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
              className={`px-3 py-1.5 text-xs font-normal rounded-md transition-colors ${
                activeTab === "showcase"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-tertiary hover:text-foreground hover:bg-muted"
              }`}
            >
              Design Tokens &amp; Rules
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("skill")}
              className={`px-3 py-1.5 text-xs font-normal rounded-md transition-colors ${
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
        <div
          className={`flex-1 p-6 ${
            activeTab === "skill"
              ? "flex flex-col min-h-0 overflow-hidden"
              : "overflow-y-auto space-y-6"
          }`}
        >
          {activeTab === "showcase" ? (
            <div className="space-y-6">
              {/* Marketing Visual Preview Banner or Themed Placeholder */}
              {!design.image_url || imgError ? (
                <div
                  className="relative aspect-[16/9] w-full max-h-[260px] overflow-hidden rounded-xl border border-border flex flex-col items-center justify-center gap-2 p-6 text-center select-none shadow-xs"
                  style={{
                    background: `linear-gradient(135deg, ${design.palette.surface} 0%, ${design.palette.background} 100%)`,
                  }}
                >
                  <div
                    className="size-12 rounded-full flex items-center justify-center shadow-xs border border-black/10 dark:border-white/10"
                    style={{ backgroundColor: design.palette.primary, color: "#fff" }}
                  >
                    <RiPaletteLine className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <div
                      className="text-lg font-normal tracking-tight"
                      style={{
                        color: design.palette.text,
                        fontFamily: design.tokens?.fontFamily ? design.tokens.fontFamily.split(",")[0] : undefined,
                      }}
                    >
                      {design.name}
                    </div>
                    <div
                      className="text-xs font-mono opacity-60"
                      style={{ color: design.palette.text }}
                    >
                      {design.aesthetic}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative w-full rounded-xl border border-border bg-muted/20 dark:bg-muted/10 overflow-hidden flex items-center justify-center p-2 shadow-xs">
                  <img
                    key={design.image_url}
                    src={design.image_url}
                    alt={design.name}
                    className="w-full h-auto max-h-[500px] object-contain rounded-lg"
                    onError={() => setImgError(true)}
                  />
                </div>
              )}

              {/* Color Palette Grid */}
              <div className="space-y-2">
                <span className="text-xs font-normal text-tertiary">
                  Design Tokens &amp; Color System
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
                        <span className="text-[11px] font-normal text-foreground">{color.label}</span>
                        <div
                          className="size-4 rounded-xs border border-black/10 dark:border-white/10 shadow-xs"
                          style={{ backgroundColor: color.hex }}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-mono font-normal">{color.hex}</div>
                        <div className="text-[10px] text-tertiary">{color.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tokens Table */}
              <div className="space-y-2">
                <span className="text-xs font-normal text-tertiary">
                  System Specifications &amp; Rules
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tokens */}
                  <div className="p-4 rounded-lg border border-border bg-card/40 space-y-2 text-xs">
                    <span className="font-normal text-foreground">Design Tokens</span>
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
                    <span className="font-normal text-foreground">Core Rules for AI Agent</span>
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
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs font-normal text-tertiary">
                  SKILL.md Agent Instructions
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

              <div className="flex-1 min-h-0 p-5 rounded-lg border border-border bg-card/40 text-sm leading-relaxed overflow-y-auto">
                {design.content ? (
                  <div className="min-w-0 space-y-3 text-sm leading-relaxed text-foreground">
                    <Markdown content={design.content} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 gap-2 text-tertiary">
                    <RiLoader4Line className="size-4 animate-spin" />
                    <span>Loading SKILL.md system prompt from repository...</span>
                  </div>
                )}
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
