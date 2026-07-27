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
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 border-border border-b", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
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
