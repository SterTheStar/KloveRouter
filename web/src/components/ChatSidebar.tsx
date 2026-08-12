import { useEffect, useState } from "react";
import {
  RiAddLine as AddLine,
  RiHome4Line as HomeLine,
  RiLayoutLeftLine as CollapseLine,
  RiSearchLine as SearchLine,
  RiArrowDownSLine as ArrowDownLine,
  RiCheckLine as CheckLine,
  RiDeleteBinLine as DeleteLine,
  RiEditLine as EditLine,
  RiLogoutBoxRLine as LogoutLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatSession, UserProfile } from "../types";
import DisplayAvatar from "./DisplayAvatar";
import ChatCommandPalette from "./ChatCommandPalette";

export default function ChatSidebar({
  chats,
  activeChatId,
  profile,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onBack,
  onLogout,
  generatingChatId,
}: {
  chats: ChatSession[];
  activeChatId: string | null;
  profile: UserProfile;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
  onLogout: () => void;
  generatingChatId: string | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("klove_chat_sidebar_collapsed") === "true");
  const [recentChatsOpen, setRecentChatsOpen] = useState(() => localStorage.getItem("klove_recent_chats_open") !== "false");
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

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
    if (title.trim()) await onRename(id, title.trim());
    setEditing(null);
  };

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="fixed left-3 top-3 z-40 flex size-9 items-center justify-center rounded-xl border border-border bg-sidebar text-sidebar-foreground shadow-lg hover:bg-sidebar-accent"
          title="Expand chat sidebar"
          aria-label="Expand chat sidebar"
        >
          <CollapseLine className="size-4" />
        </button>
        {commandOpen && <ChatCommandPalette chats={chats} activeChatId={activeChatId} onSelect={onSelect} onClose={() => setCommandOpen(false)} />}
      </>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-svh w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center justify-between px-3">
        <button type="button" onClick={onBack} className="flex min-w-0 items-center gap-2 px-1">
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-6 text-foreground" aria-hidden="true">
            <path d="M5.6906 6 3.1651 1.6258A8 8 0 0 1 9.1106.0765L5.6906 6Z" fill="currentColor" />
            <path d="M5.1133 9 1.6936 3.077A8 8 0 0 0 .0619 9h5.0514Z" fill="currentColor" />
            <path d="M4.8964 15.3757A8 8 0 0 1 .5815 11h6.8411l-2.5262 4.3757Z" fill="currentColor" />
            <path d="M8 16a8 8 0 0 1-1.1106-.0765L10.3094 10l2.5255 4.3742A8 8 0 0 1 8 16Z" fill="currentColor" />
            <path d="M16 8a8 8 0 0 1-1.6936 4.9229L10.8868 7h5.0513c.0419.3276.0619.6614.0619 1Z" fill="currentColor" />
            <path d="M11.1036.6243A8 8 0 0 1 15.4185 5H8.5774l2.5262-4.3757Z" fill="currentColor" />
          </svg>
          <span className="truncate text-lg" style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}>Klove</span>
        </button>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={onBack} title="Return to Home" aria-label="Return to Home"><HomeLine className="size-4" /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setCommandOpen(true)} title="Search conversations" aria-label="Search conversations"><SearchLine className="size-4" /></Button>
          <Button size="icon-sm" variant="ghost" onClick={toggleCollapsed} title="Collapse sidebar" aria-label="Collapse sidebar"><CollapseLine className="size-4" /></Button>
        </div>
      </div>
      {commandOpen && <ChatCommandPalette chats={chats} activeChatId={activeChatId} onSelect={onSelect} onClose={() => setCommandOpen(false)} />}
      <div className="px-3 pb-3">
        <Button
          size="sm"
          variant="default"
          className="h-9 w-full justify-start gap-2 rounded-lg bg-white px-2 text-sm text-slate-900 hover:bg-white/90 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          onClick={onNew}
        >
          <AddLine className="size-4" />
          New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <button
          type="button"
          onClick={() => setRecentChatsOpen((current) => {
            const next = !current;
            localStorage.setItem("klove_recent_chats_open", String(next));
            return next;
          })}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-medium text-muted-foreground hover:text-sidebar-foreground"
          aria-expanded={recentChatsOpen}
        >
          <span>Recent chats</span>
          <ArrowDownLine className={`size-4 transition-transform ${recentChatsOpen ? "" : "-rotate-90"}`} />
        </button>
        {recentChatsOpen && (
          <div className="space-y-1 pb-2">
            {chats.map((chat) => (
              <div key={chat.id} className={`chat-sidebar-item group rounded-lg ${activeChatId === chat.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}>
                {editing === chat.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveRename(chat.id); if (event.key === "Escape") setEditing(null); }} className="h-7 min-w-0" />
                    <Button size="icon-xs" variant="ghost" onClick={() => void saveRename(chat.id)}><CheckLine className="size-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button type="button" onClick={() => onSelect(chat.id)} className="flex min-w-0 flex-1 items-center py-1.5 text-left">
                      <span className={`truncate text-sm ${generatingChatId === chat.id ? "chat-title-generating" : ""}`}>
                        {generatingChatId === chat.id ? "Generating title" : chat.title}
                      </span>
                    </button>
                    <div className="hidden items-center gap-0.5 group-hover:flex">
                      <Button size="icon-xs" variant="ghost" onClick={() => startRename(chat)} title="Rename"><EditLine className="size-3.5" /></Button>
                      <Button size="icon-xs" variant="ghost" className="hover:text-destructive" onClick={() => { if (window.confirm(`Delete “${chat.title}”?`)) void onDelete(chat.id); }} title="Delete"><DeleteLine className="size-3.5" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chats.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted-foreground">No chats yet</p>}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent/70 p-2.5">
          <button type="button" onClick={onBack} className="flex min-w-0 flex-1 items-center gap-2 text-left"><DisplayAvatar name={profile.name} src={profile.avatar} className="size-8" /><span className="truncate text-sm">{profile.name}</span></button>
          <Button size="icon-sm" variant="ghost" onClick={onLogout} title="Logout"><LogoutLine className="size-4" /></Button>
        </div>
      </div>
    </aside>
  );
}
