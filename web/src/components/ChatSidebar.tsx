import { useEffect, useState } from "react";
import {
  RiChatNewLine as NewChatLine,
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
import type { ChatSession, UserProfile } from "../types";
import DisplayAvatar from "./DisplayAvatar";
import ChatCommandPalette from "./ChatCommandPalette";
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
  generatingChats,
  mobileOpen,
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
  generatingChats: Record<string, boolean>;
  mobileOpen: boolean;
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
        <aside className="flex h-svh w-14 shrink-0 flex-col items-center bg-sidebar py-2 text-sidebar-foreground">
          <div className="mb-5 flex flex-col gap-1 px-1.5">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-accent"
              title="Expand chat sidebar"
              aria-label="Expand chat sidebar"
            >
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-5" aria-hidden="true">
                <path d="M5.6906 6 3.1651 1.6258A8 8 0 0 1 9.1106.0765L5.6906 6Z" fill="currentColor" />
                <path d="M5.1133 9 1.6936 3.077A8 8 0 0 0 .0619 9h5.0514Z" fill="currentColor" />
                <path d="M4.8964 15.3757A8 8 0 0 1 .5815 11h6.8411l-2.5262 4.3757Z" fill="currentColor" />
                <path d="M8 16a8 8 0 0 1-1.1106-.0765L10.3094 10l2.5255 4.3742A8 8 0 0 1 8 16Z" fill="currentColor" />
                <path d="M16 8a8 8 0 0 1-1.6936 4.9229L10.8868 7h5.0513c.0419.3276.0619.6614.0619 1Z" fill="currentColor" />
                <path d="M11.1036.6243A8 8 0 0 1 15.4185 5H8.5774l2.5262-4.3757Z" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={onNew} className="rounded-lg" title="New chat" aria-label="New chat"><NewChatLine className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setCommandOpen(true)} className="rounded-lg" title="Search conversations" aria-label="Search conversations"><SearchLine className="size-4" /></Button>
          </div>
          <div className="mt-auto">
            <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-accent" title={profile.name} aria-label={profile.name}>
              <DisplayAvatar name={profile.name} src={profile.avatar} fallback="user" className="size-7" />
            </button>
          </div>
        </aside>
        {commandOpen && <ChatCommandPalette chats={chats} activeChatId={activeChatId} onSelect={onSelect} onClose={() => setCommandOpen(false)} />}
      </>
    );
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex h-svh w-72 shrink-0 flex-col overflow-hidden bg-sidebar text-sm text-sidebar-foreground transition-transform duration-200 md:sticky md:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
      <div className="relative flex h-16 shrink-0 items-center justify-center gap-3 px-5">
        <a href={pathForPage("dashboard")} onClick={(event) => {
          if (!shouldHandleLinkClick(event)) return;
          event.preventDefault();
          onBack();
        }} className="flex min-w-0 items-center gap-3 rounded-lg">
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-8 text-foreground" aria-hidden="true">
            <path d="M5.6906 6 3.1651 1.6258A8 8 0 0 1 9.1106.0765L5.6906 6Z" fill="currentColor" />
            <path d="M5.1133 9 1.6936 3.077A8 8 0 0 0 .0619 9h5.0514Z" fill="currentColor" />
            <path d="M4.8964 15.3757A8 8 0 0 1 .5815 11h6.8411l-2.5262 4.3757Z" fill="currentColor" />
            <path d="M8 16a8 8 0 0 1-1.1106-.0765L10.3094 10l2.5255 4.3742A8 8 0 0 1 8 16Z" fill="currentColor" />
            <path d="M16 8a8 8 0 0 1-1.6936 4.9229L10.8868 7h5.0513c.0419.3276.0619.6614.0619 1Z" fill="currentColor" />
            <path d="M11.1036.6243A8 8 0 0 1 15.4185 5H8.5774l2.5262-4.3757Z" fill="currentColor" />
          </svg>
          <span className="truncate text-2xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}>Klove</span>
        </a>
        <Button size="icon-sm" variant="ghost" onClick={toggleCollapsed} className="absolute right-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" title="Collapse sidebar" aria-label="Collapse sidebar"><CollapseLine className="size-4" /></Button>
      </div>

      <div className="mb-5 flex shrink-0 flex-col gap-1 px-1.5">
        <a
          href={pathForPage("dashboard")}
          onClick={(event) => {
            if (!shouldHandleLinkClick(event)) return;
            event.preventDefault();
            onBack();
          }}
          className="flex w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-lg py-2 pl-3 pr-3 text-start text-sm text-sidebar-foreground transition-colors hover:bg-accent"
        >
          <HomeLine className="size-4 shrink-0" />
          <span className="truncate">Home</span>
        </a>
        <button
          type="button"
          onClick={onNew}
          className="flex w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-lg py-2 pl-3 pr-3 text-start text-sm text-sidebar-foreground transition-colors hover:bg-accent"
        >
          <NewChatLine className="size-4 shrink-0" />
          <span className="truncate">New chat</span>
        </button>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-lg py-2 pl-3 pr-3 text-start text-sm text-sidebar-foreground transition-colors hover:bg-accent"
        >
          <SearchLine className="size-4 shrink-0" />
          <span className="truncate">Search</span>
        </button>
      </div>

      {commandOpen && <ChatCommandPalette chats={chats} activeChatId={activeChatId} onSelect={onSelect} onClose={() => setCommandOpen(false)} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        <div className="space-y-3 pb-3">
          {chatGroups.map(([group, groupedChats]) => (
            <section key={group} aria-label={group}>
              <h3 className="px-3 pb-1 pt-2 text-xs font-medium text-tertiary">{group}</h3>
              <div className="flex flex-col gap-0.5">
                {groupedChats.map((chat) => (
                  <div key={chat.id} className={`chat-sidebar-item group rounded-lg ${activeChatId === chat.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                    {editing === chat.id ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveRename(chat.id); if (event.key === "Escape") setEditing(null); }} className="h-7 min-w-0 rounded-md" />
                        <Button size="icon-xs" variant="ghost" onClick={() => void saveRename(chat.id)}><CheckLine className="size-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-3 py-2">
                        <a href={pathForPage("chat", chat.id)} onClick={(event) => {
                          if (!shouldHandleLinkClick(event)) return;
                          event.preventDefault();
                          onSelect(chat.id);
                        }} className="flex min-w-0 flex-1 items-center text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                          <span className={`truncate ${generatingChats[chat.id] ? "chat-title-generating" : ""}`}>
                            {generatingChats[chat.id] ? "Generating title" : chat.title}
                          </span>
                        </a>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button
                              size="icon-xs"
                              variant="ghost"
                              className="chat-sidebar-actions-trigger size-6 rounded-md text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                              aria-label={`Actions for ${chat.title}`}
                              title="Conversation actions"
                            />}
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

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-lg bg-card p-2">
          <button type="button" onClick={onBack} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong">
            <DisplayAvatar name={profile.name} src={profile.avatar} fallback="user" className="size-8 rounded-full object-cover" />
            <span className="truncate text-sm font-medium text-foreground">{profile.name}</span>
          </button>
          <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={onLogout} title="Logout" aria-label="Logout"><LogoutLine className="size-4" /></Button>
        </div>
      </div>
    </aside>
  );
}
