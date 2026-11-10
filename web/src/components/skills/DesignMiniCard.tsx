import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DesignSkill } from "../../types";

export function DesignMiniCard({ design }: { design: DesignSkill }) {
  const swatches = [
    { name: "Primary", color: design.palette.primary, desc: "Action & CTA" },
    { name: "Canvas", color: design.palette.background, desc: "Background" },
    { name: "Surface", color: design.palette.surface, desc: "Card base" },
    { name: "Accent", color: design.palette.accent, desc: "Highlight" },
    { name: "Ink", color: design.palette.text, desc: "Text color" },
  ];

  return (
    <div className="flex items-center gap-1 shrink-0 select-none">
      {swatches.map((item, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger
            render={<span />}
            className="size-3.5 rounded-full border border-black/15 dark:border-white/20 transition-transform duration-150 hover:scale-125 shadow-2xs cursor-pointer shrink-0 block"
            style={{ backgroundColor: item.color }}
            title={`${item.name}: ${item.color}`}
            aria-label={`${item.name}: ${item.color}`}
          />
          <TooltipContent side="top" className="text-[11px] py-1 px-2 space-y-0.5">
            <div className="font-normal text-foreground">{item.name}</div>
            <div className="font-mono text-tertiary text-[10px]">{item.color}</div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
