import { useEffect, useState } from "react";
import type React from "react";
import {
  RiAddLine,
  RiHome4Line as HomeLine,
  RiLayoutLeftLine as CollapseLine,
  RiSearchLine as SearchLine,
  RiCheckLine as CheckLine,
  RiDeleteBinLine as DeleteLine,
  RiEditLine as EditLine,
  RiDownloadLine as DownloadLine,
  RiMore2Line as MoreLine,
  RiLogoutBoxRLine as LogoutLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSession, Page, UserProfile } from "../types";
import DisplayAvatar from "./DisplayAvatar";
import ChatCommandPalette from "./ChatCommandPalette";
import SaturnMark from "./SaturnMark";
import SidebarResizeHandle from "./SidebarResizeHandle";
import { pathForPage, shouldHandleLinkClick } from "../lib/navigation";

const CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function parseChatTimestamp(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

function chatDateGroup(value: string, now: Date): string {
  const date = parseChatTimestamp(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const chatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((today.getTime() - chatDay.getTime()) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return CALENDAR_DATE_FORMATTER.format(date);
}

function groupChatsByDate(chats: ChatSession[], now = new Date()) {
  const groups = new Map<string, ChatSession[]>();
  const sortedChats = [...chats].sort((a, b) => {
    const aTime = parseChatTimestamp(a.updated_at || a.created_at).getTime();
    const bTime = parseChatTimestamp(b.updated_at || b.created_at).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
  for (const chat of sortedChats) {
    const group = chatDateGroup(chat.updated_at || chat.created_at, now);
    const entries = groups.get(group) ?? [];
    entries.push(chat);
    groups.set(group, entries);
  }
  return [...groups.entries()];
}

export default function ChatSidebar({
  chats,
  activeChatId,
  profile,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onExport,
  onBack,
  onLogout,
  onNavigate,
  generatingChats,
  mobileOpen,
  width,
  isResizing,
  onResizeStart,
  onResetWidth,
}: {
  chats: ChatSession[];
  activeChatId: string | null;
  profile: UserProfile;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (chat: ChatSession) => void;
  onBack: () => void;
  onLogout: () => void;
  onNavigate?: (page: Page) => void;
  generatingChats: Record<string, boolean>;
  mobileOpen: boolean;
  width?: number;
  isResizing?: boolean;
  onResizeStart?: (event: React.MouseEvent) => void;
  onResetWidth?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("klove_chat_sidebar_collapsed") === "true");
  const [commandOpen, setCommandOpen] = useState(false);
  const chatGroups = groupChatsByDate(chats);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("klove_chat_sidebar_collapsed", String(next));
      return next;
    });
  };

  const startRename = (chat: ChatSession) => {
    setEditing(chat.id);
    setTitle(chat.title);
  };

  const saveRename = async (id: string) => {
    if (!title.trim()) return;
    try {
      await onRename(id, title.trim());
      setEditing(null);
    } catch {
      // Keep the editor open so the user can retry or correct the title.
    }
  };

  if (collapsed && !mobileOpen) {
    return (
      <>
        <aside className="relative flex h-svh w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-2 text-sidebar-foreground">
          <div className="mb-4 flex flex-col gap-1 px-1.5">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              title="Expand chat sidebar"
              aria-label="Expand chat sidebar"
            >
              <SaturnMark className="size-5 text-sidebar-foreground" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onNew}
              className="group rounded-lg"
              title="New chat"
              aria-label="New chat"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors group-hover:bg-neutral-900 dark:bg-white/10 dark:text-white dark:group-hover:bg-white/15">
                <RiAddLine className="size-3.5" />
              </span>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onBack}
              className="rounded-lg text-sidebar-foreground"
              title="Home"
              aria-label="Home"
            >
              <HomeLine className="size-5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setCommandOpen(true)}
              className="rounded-lg text-sidebar-foreground"
              title="Search conversations"
              aria-label="Search conversations"
            >
              <SearchLine className="size-5" />
            </Button>
          </div>
          <div className="mt-auto">
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate("settings") : onBack())}
              className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              title={profile.name}
              aria-label={profile.name}
            >
              <DisplayAvatar name={profile.name} src={profile.avatar} fallback="user" className="size-7" />
            </button>
          </div>
        </aside>
        {commandOpen && (
          <ChatCommandPalette
            chats={chats}
            activeChatId={activeChatId}
            onSelect={onSelect}
            onClose={() => setCommandOpen(false)}
          />
        )}
      </>
    );
  }

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
            onBack();
          }}
          className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <SaturnMark className="size-8 shrink-0 text-foreground" />
          <span
            className="truncate text-2xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}
          >
            Saturn
          </span>
        </a>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={toggleCollapsed}
          className="absolute right-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <CollapseLine className="size-4" />
        </Button>
      </div>

      <div className="shrink-0 space-y-1 p-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="group flex h-10 w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-start text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors group-hover:bg-neutral-900 dark:bg-white/10 dark:text-white dark:group-hover:bg-white/15">
            <RiAddLine className="size-3.5" />
          </span>
          <span className="truncate">New chat</span>
        </button>

        <a
          href={pathForPage("dashboard")}
          onClick={(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            onBack();
          }}
          className="flex h-10 w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-start text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <HomeLine className="size-5 shrink-0" />
          <span className="truncate">Home</span>
        </a>

        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex h-10 w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-start text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <SearchLine className="size-5 shrink-0" />
          <span className="truncate">Search</span>
        </button>
      </div>

      {commandOpen && (
        <ChatCommandPalette
          chats={chats}
          activeChatId={activeChatId}
          onSelect={onSelect}
          onClose={() => setCommandOpen(false)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <div className="space-y-3 pb-3">
          {chatGroups.map(([group, groupedChats]) => (
            <section key={group} aria-label={group}>
              <h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{group}</h3>
              <div className="flex flex-col gap-0.5">
                {groupedChats.map((chat) => (
                  <div key={chat.id} className={`chat-sidebar-item group rounded-lg ${activeChatId === chat.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                    {editing === chat.id ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <Input
                          autoFocus
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void saveRename(chat.id);
                            if (event.key === "Escape") setEditing(null);
                          }}
                          className="h-7 min-w-0 rounded-md"
                        />
                        <Button size="icon-xs" variant="ghost" onClick={() => void saveRename(chat.id)}>
                          <CheckLine className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-3 py-2">
                        <a
                          href={pathForPage("chat", chat.id)}
                          onClick={(event) => {
                            if (!shouldHandleLinkClick(event)) return;
                            event.preventDefault();
                            onSelect(chat.id);
                          }}
                          className="flex min-w-0 flex-1 items-center text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <span className={`truncate ${generatingChats[chat.id] ? "chat-title-generating" : ""}`}>
                            {generatingChats[chat.id] ? "Generating title" : chat.title}
                          </span>
                        </a>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="chat-sidebar-actions-trigger size-6 rounded-md text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                aria-label={`Actions for ${chat.title}`}
                                title="Conversation actions"
                              />
                            }
                          >
                            <MoreLine className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-lg">
                            <DropdownMenuItem className="whitespace-nowrap" onClick={() => onExport(chat)}>
                              <DownloadLine />
                              Export as Markdown
                            </DropdownMenuItem>
                            <DropdownMenuItem className="whitespace-nowrap" onClick={() => startRename(chat)}>
                              <EditLine />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              className="whitespace-nowrap"
                              onClick={() => {
                                if (window.confirm(`Delete “${chat.title}”?`)) void onDelete(chat.id);
                              }}
                            >
                              <DeleteLine />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {chats.length === 0 && <p className="px-3 py-8 text-center text-xs text-tertiary">No conversations yet</p>}
        </div>
      </div>

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2 shadow-xs">
          <button
            type="button"
            onClick={() => (onNavigate ? onNavigate("settings") : onBack())}
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
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogoutLine className="size-4" />
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
