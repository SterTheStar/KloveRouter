import {
  RiInformationLine,
  RiSparklingLine,
  RiCpuLine,
  RiToolsLine,
  RiMoneyDollarCircleLine,
} from "@remixicon/react";
import type { ModelTabId, ModelTabItem } from "./types";
import { cn } from "@/lib/utils";

interface ModelNavigationProps {
  tabs: ModelTabItem[];
  activeTab: ModelTabId;
  onTabChange: (id: ModelTabId) => void;
  tabBadges?: Partial<Record<ModelTabId, string>>;
}

export function ModelNavigation({
  tabs,
  activeTab,
  onTabChange,
  tabBadges,
}: ModelNavigationProps) {
  const getIcon = (iconName: ModelTabItem["iconName"], isActive: boolean) => {
    const iconClass = cn(
      "size-5 shrink-0 transition-colors",
      isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
    );

    switch (iconName) {
      case "info":
        return <RiInformationLine className={iconClass} />;
      case "sparkles":
        return <RiSparklingLine className={iconClass} />;
      case "cpu":
        return <RiCpuLine className={iconClass} />;
      case "tool":
        return <RiToolsLine className={iconClass} />;
      case "coin":
        return <RiMoneyDollarCircleLine className={iconClass} />;
    }
  };

  return (
    <div className="flex flex-col space-y-1" role="tablist" aria-orientation="vertical">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = tabBadges?.[tab.id];

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer",
              isActive
                ? "border border-border bg-accent text-foreground font-normal"
                : "border border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            {getIcon(tab.iconName, isActive)}

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className={cn("text-xs leading-none font-normal", isActive ? "text-foreground" : "")}>
                  {tab.label}
                </span>
                {badge && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground leading-none">
                {tab.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
