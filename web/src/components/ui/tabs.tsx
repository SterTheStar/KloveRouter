import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

function Tabs({
  tabs,
  active,
  onChange,
  className,
  ariaLabel = "Sections",
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-1 border-border border-b", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id.replace(/-tab$/, "")}`}
          id={tab.id.endsWith("-tab") ? tab.id : `${tab.id}-tab`}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative px-4 py-2 text-sm font-medium transition-colors",
            "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
            active === tab.id
              ? "text-foreground after:bg-foreground"
              : "text-muted-foreground hover:text-foreground after:bg-transparent",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export { Tabs };
export type { Tab };
