import type React from "react";
import {
  RiServerLine as ProvidersLine,
  RiLogoutBoxRLine as LogoutBoxRLine,
  RiRobot2Line as ModelsLine,
  RiStackLine as CompoundLine,
  RiBarChart2Line as StatsLine,
  RiHistoryLine as LogsLine,
  RiBookOpenLine as BookOpenLine,
  RiScales3Line as LimitsLine,
  RiTerminalBoxLine as KeysLine,
  RiSettings4Line as Settings4Line,
  RiChatAiLine as ChatAiLine,
  RiSparklingLine as SkillsLine,
  RiPaletteLine as MediaLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import DisplayAvatar from "./DisplayAvatar";
import SaturnMark from "./SaturnMark";
import SaturnBetaBadge from "./SaturnBetaBadge";
import SidebarResizeHandle from "./SidebarResizeHandle";
import type { Page } from "../types";
import type { UserProfile } from "../types";
import { pathForPage, shouldHandleLinkClick } from "../lib/navigation";

const items = [
  { page: "dashboard" as Page, label: "Providers", icon: ProvidersLine },
  { page: "chat" as Page, label: "Chat", icon: ChatAiLine, badge: "Beta" },
  { page: "media" as Page, label: "Media Hub", icon: MediaLine },
  { page: "models" as Page, label: "Models", icon: ModelsLine },
  { page: "model-pools" as Page, label: "Compound models", icon: CompoundLine },
  { page: "skills" as Page, label: "Skills & Prompts", icon: SkillsLine },
  { page: "keys" as Page, label: "API keys", icon: KeysLine },
  { page: "request-logs" as Page, label: "Request logs", icon: LogsLine },
  { page: "stats" as Page, label: "Statistics", icon: StatsLine },
  { page: "usage" as Page, label: "Usage limits", icon: LimitsLine },
  { page: "docs" as Page, label: "Documentation", icon: BookOpenLine },
  { page: "settings" as Page, label: "Settings", icon: Settings4Line },
];

export default function Sidebar({
  currentPage,
  onNavigate,
  onLogout,
  profile,
  mobileOpen,
  width,
  isResizing,
  onResizeStart,
  onResetWidth,
  hasUpdate,
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  profile: UserProfile;
  mobileOpen: boolean;
  width?: number;
  isResizing?: boolean;
  onResizeStart?: (event: React.MouseEvent) => void;
  onResetWidth?: () => void;
  hasUpdate?: boolean;
}) {
  return (
    <aside
      style={{ width: `${width ?? 288}px`, maxWidth: "85vw" }}
      className={`fixed inset-y-0 left-0 z-40 flex h-svh shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:sticky md:z-auto ${
        isResizing ? "transition-none select-none" : "transition-transform duration-200"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      <div className="relative flex h-16 shrink-0 items-center justify-center gap-3 px-5">
        <a
          href={pathForPage("dashboard")}
          onClick={(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            onNavigate("dashboard");
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <SaturnMark className="size-8 shrink-0 text-foreground" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className="truncate text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}
            >
              Saturn
            </span>
            <SaturnBetaBadge />
          </div>
        </a>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ page, label, icon: Icon, badge }) => (
          <Button
            key={page}
            variant={currentPage === page ? "secondary" : "ghost"}
            className="h-10 w-full justify-start gap-3 rounded-lg px-3 text-sm font-normal"
            render={<a href={pathForPage(page)} />}
            nativeButton={false}
            onClick={(event) => {
              if (!shouldHandleLinkClick(event)) return;
              event.preventDefault();
              onNavigate(page);
            }}
          >
            <Icon className="size-5 shrink-0" />
            <span className="truncate">{label}</span>
            {page === "settings" && hasUpdate && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/30">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                Update
              </span>
            )}
            {badge && (!hasUpdate || page !== "settings") && (
              <span className="ml-auto rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground transition-colors group-hover/button:text-foreground">
                {badge}
              </span>
            )}
          </Button>
        ))}
      </nav>

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2 shadow-xs">
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            <DisplayAvatar
              name={profile.name}
              src={profile.avatar}
              fallback="user"
              className="size-8 rounded-full object-cover"
            />
            <span className="truncate text-sm font-normal text-foreground">{profile.name}</span>
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogoutBoxRLine className="size-4" />
          </Button>
        </div>
      </div>

      {onResizeStart && (
        <SidebarResizeHandle
          onMouseDown={onResizeStart}
          onDoubleClick={onResetWidth}
          isResizing={isResizing}
        />
      )}
    </aside>
  );
}
