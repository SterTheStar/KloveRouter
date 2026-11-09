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
  RiCupLine as CupLine,
  RiChatAiLine as ChatAiLine,
  RiSparklingLine as SkillsLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import DisplayAvatar from "./DisplayAvatar";
import type { Page } from "../types";
import type { UserProfile } from "../types";
import { pathForPage, shouldHandleLinkClick } from "../lib/navigation";

const items = [
  { page: "chat" as Page, label: "Chat", icon: ChatAiLine },
  { page: "dashboard" as Page, label: "Providers", icon: ProvidersLine },
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

function BuyMeACoffeeButton() {
  return (
    <div className="mb-3 px-1">
      <Button
        render={<a href="https://ko-fi.com/V7V11EYI5U" target="_blank" rel="noreferrer" />}
        variant="default"
        className="kofi-button group relative h-10 w-full justify-center bg-primary px-3 text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
        aria-label="Support me on Ko-fi"
      >
        <span className="kofi-icon-wrap" aria-hidden="true">
          <CupLine className="kofi-icon size-6" />
          <span className="kofi-steam" />
        </span>
        <span className="text-sm font-semibold">Support me on Ko-fi</span>
      </Button>
    </div>
  );
}

export default function Sidebar({
  currentPage,
  onNavigate,
  onLogout,
  profile,
  mobileOpen,
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  profile: UserProfile;
  mobileOpen: boolean;
}) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex h-svh w-72 shrink-0 flex-col bg-surface text-foreground transition-transform duration-200 md:sticky md:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
      <div className="flex h-16 items-center justify-center gap-3 px-5">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="size-8 text-foreground"
        >
          <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
          <g
            id="SVGRepo_tracerCarrier"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></g>
          <g id="SVGRepo_iconCarrier">
            {" "}
            <path
              d="M5.6906 6.00001L3.16512 1.62576C4.50811 0.605527 6.18334 0 8 0C8.37684 0 8.74759 0.0260554 9.11056 0.076463L5.6906 6.00001Z"
              fill="currentColor"
            ></path>{" "}
            <path
              d="M5.11325 9L1.69363 3.07705C0.632438 4.43453 0 6.14341 0 8C0 8.33866 0.0210434 8.67241 0.0618939 9H5.11325Z"
              fill="currentColor"
            ></path>{" "}
            <path
              d="M4.89635 15.3757C2.93947 14.5512 1.37925 12.9707 0.581517 11H7.42265L4.89635 15.3757Z"
              fill="currentColor"
            ></path>{" "}
            <path
              d="M8 16C7.62316 16 7.25241 15.9739 6.88944 15.9235L10.3094 10L12.8349 14.3742C11.4919 15.3945 9.81666 16 8 16Z"
              fill="currentColor"
            ></path>{" "}
            <path
              d="M16 8C16 9.85659 15.3676 11.5655 14.3064 12.9229L10.8868 7H15.9381C15.979 7.32759 16 7.66134 16 8Z"
              fill="currentColor"
            ></path>{" "}
            <path
              d="M11.1036 0.624326C13.0605 1.44877 14.6208 3.02927 15.4185 5H8.57735L11.1036 0.624326Z"
              fill="currentColor"
            ></path>{" "}
          </g>
        </svg>
        <span
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}
        >
          Klove
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ page, label, icon: Icon }) => (
          <Button
            key={page}
            size="lg"
            variant={currentPage === page ? "secondary" : "ghost"}
            className="w-full justify-start gap-3 text-sm font-medium"
            render={<a href={pathForPage(page)} />}
            onClick={(event) => {
              if (!shouldHandleLinkClick(event)) return;
              event.preventDefault();
              onNavigate(page);
            }}
          >
            <Icon className="size-5" />
            {label}
          </Button>
        ))}
      </nav>
      <div className="p-3">
        <BuyMeACoffeeButton />
        <div className="flex items-center gap-2 rounded-lg bg-card p-2">
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
            <span className="truncate text-sm font-medium text-foreground">{profile.name}</span>
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogoutBoxRLine className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
