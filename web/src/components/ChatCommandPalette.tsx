import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiChat1Line as ChatLine, RiSearchLine as Search } from "@remixicon/react";
import type { ChatSession } from "../types";

export default function ChatCommandPalette({
  chats,
  activeChatId,
  onSelect,
  onClose,
}: {
  chats: ChatSession[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return chats;
    return chats.filter((chat) => `${chat.title} ${chat.model}`.toLowerCase().includes(value));
  }, [chats, query]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/20 px-4 pt-[16vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations..." className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((chat) => (
            <button key={chat.id} type="button" onClick={() => { onSelect(chat.id); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted ${activeChatId === chat.id ? "bg-muted" : ""}`}>
              <ChatLine className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
              {activeChatId === chat.id && <span className="text-xs text-primary">Active</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No conversations found</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
