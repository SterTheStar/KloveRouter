import type { DesignSkill } from "../../types";

export function DesignMiniCard({ design }: { design: DesignSkill }) {
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
    <div className="space-y-3">
      {/* Color Palette Bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-tertiary font-mono uppercase tracking-wider">Palette</span>
        <div className="flex-1 flex h-1.5 rounded-xs overflow-hidden border border-border/40">
          {[
            { color: design.palette.primary, name: "Primary", weight: 3 },
            { color: design.palette.background, name: "Canvas", weight: 3 },
            { color: design.palette.surface, name: "Surface", weight: 2 },
            { color: design.palette.accent, name: "Accent", weight: 2 },
            { color: design.palette.text, name: "Ink", weight: 1 },
          ].map((item, idx) => (
            <div
              key={idx}
              title={`${item.name}: ${item.color}`}
              className="h-full transition-opacity hover:opacity-80"
              style={{ backgroundColor: item.color, flex: item.weight }}
            />
          ))}
        </div>
      </div>

      {/* Styled Interactive Sandbox Component */}
      <div
        className="relative overflow-hidden p-3.5 transition-all text-left"
        style={{
          backgroundColor: design.palette.background,
          borderColor: design.palette.border,
          borderWidth: isNeobrutalism ? "2px" : "1px",
          borderStyle: "solid",
          borderRadius: isNeobrutalism
            ? "4px"
            : isBento || isGlass
            ? "14px"
            : isDoodle
            ? "18px 4px 16px 6px"
            : isDithered || isTerminal
            ? "0px"
            : "8px",
          boxShadow: isNeobrutalism
            ? "3px 3px 0px #000"
            : isCyberpunk
            ? "0 0 15px rgba(0, 240, 255, 0.2)"
            : isTerminal
            ? "0 0 10px rgba(34, 197, 94, 0.15)"
            : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Background glow or scanline hints */}
        {isGlass && (
          <div
            className="absolute -top-6 -right-6 size-16 blur-lg opacity-40 pointer-events-none"
            style={{ backgroundColor: design.palette.primary }}
          />
        )}

        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{
                color: isTerminal || isCyberpunk ? design.palette.accent : design.palette.text,
                fontFamily: design.tokens.fontFamily,
              }}
            >
              {isTerminal ? "> STATUS: OK" : isCyberpunk ? "SYS_VERIFIED" : "Preview Component"}
            </span>

            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium"
              style={{
                backgroundColor: isNeobrutalism
                  ? design.palette.accent
                  : isCyberpunk
                  ? "rgba(255, 0, 85, 0.15)"
                  : "rgba(0,0,0,0.05)",
                color: isNeobrutalism ? "#000" : isCyberpunk ? design.palette.accent : design.palette.text,
                border: isNeobrutalism ? "1.5px solid #000" : undefined,
              }}
            >
              {design.aesthetic}
            </span>
          </div>

          <p
            className="text-xs line-clamp-2 leading-relaxed"
            style={{
              color: isTerminal ? design.palette.primary : design.palette.text,
              fontFamily: design.tokens.fontFamily,
              opacity: isGlass ? 0.9 : 0.85,
            }}
          >
            {design.subtitle}
          </p>

          {/* Sample Button in that style */}
          <div className="pt-1 flex items-center gap-2">
            <div
              className="inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-medium transition-all"
              style={{
                backgroundColor: design.palette.primary,
                color: isNeobrutalism || isDoodle ? "#000" : "#FFF",
                fontFamily: design.tokens.fontFamily,
                borderRadius: isNeobrutalism
                  ? "3px"
                  : isBento || isGlass
                  ? "8px"
                  : isDoodle
                  ? "255px 15px 225px 15px"
                  : isDithered || isTerminal
                  ? "0px"
                  : "6px",
                border: isNeobrutalism
                  ? "2px solid #000"
                  : isDithered
                  ? "2px solid"
                  : isTerminal
                  ? "1px solid #22C55E"
                  : "none",
                borderColor: isDithered ? "#000" : undefined,
                boxShadow: isNeobrutalism
                  ? "2px 2px 0px #000"
                  : isSkeuomorphic
                  ? "0 3px 0 #1d4ed8, 0 4px 6px rgba(0,0,0,0.15)"
                  : isCyberpunk
                  ? "0 0 10px rgba(0, 240, 255, 0.4)"
                  : "none",
              }}
            >
              {isTerminal ? "[ EXECUTE ]" : isCyberpunk ? "INITIATE" : isNeobrutalism ? "Action →" : "Button"}
            </div>

            <div
              className="text-[10px] font-mono opacity-60 truncate max-w-[120px]"
              style={{ color: design.palette.text }}
            >
              {design.tokens.borderRadius}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
