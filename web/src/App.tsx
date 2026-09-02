import { useEffect, useRef, useState } from "react";
import { RiLoader4Line as LoaderCircle } from "@remixicon/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./hooks/useAuth";
import Sidebar from "./components/Sidebar";
import ChatSidebar from "./components/ChatSidebar";
import { chats as chatsApi } from "./api/client";
import { downloadChatMarkdown } from "./lib/chat-export";
import type { ChatSession } from "./types";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import ProviderDetailPage from "./pages/ProviderDetailPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import SettingsPage from "./pages/SettingsPage";
import ModelsPage from "./pages/ModelsPage";
import ChatPage from "./pages/ChatPage";
import StatsPage from "./pages/StatsPage";
import UsageLimitsPage from "./pages/UsageLimitsPage";
import RequestLogsPage from "./pages/RequestLogsPage";
import type { Page } from "./types";
import { ToastProvider } from "./components/ui/toast";
import { settings } from "./api/client";
import type { UserProfile } from "./types";
import { queryCache, queryKeys, invalidateChats } from "./lib/query-cache";

function sortChats(chats: ChatSession[]): ChatSession[] {
  return chats
    .map((chat, index) => ({ chat, index }))
    .sort((a, b) =>
      b.chat.updated_at.localeCompare(a.chat.updated_at) ||
      b.chat.created_at.localeCompare(a.chat.created_at) ||
      a.index - b.index,
    )
    .map(({ chat }) => chat);
}

export default function App() {
  const { isAuth, loading, error, needsSetup, completeSetup, login, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [generatingChats, setGeneratingChats] = useState<Record<string, boolean>>({});
  const manualTitlesRef = useRef(new Set<string>());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [profile, setProfile] = useState<UserProfile>({
    name: "User",
    avatar: null,
  });
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("klove_theme") !== "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("klove_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStart.current;
      const touch = event.changedTouches[0];
      touchStart.current = null;
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
      if (!isHorizontalSwipe) return;

      if (!mobileSidebarOpen && start.x <= 64 && deltaX > 48) {
        setMobileSidebarOpen(true);
      } else if (mobileSidebarOpen && deltaX < -48) {
        setMobileSidebarOpen(false);
      }
    };
    const onTouchCancel = () => {
      touchStart.current = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [currentPage, activeChatId]);

  useEffect(() => {
    if (isAuth)
      settings
        .profile()
        .then(setProfile)
        .catch(() => undefined);
  }, [isAuth]);

  useEffect(() => {
    if (!isAuth || currentPage !== "chat") return;
    queryCache.getOrFetch(queryKeys.chats, 5_000, chatsApi.list).then((list) => {
      const sorted = sortChats(list);
      setChatSessions(sorted);
      setActiveChatId((current) => current && sorted.some((chat) => chat.id === current) ? current : sorted[0]?.id ?? null);
    }).catch(() => setChatSessions([]));
  }, [isAuth, currentPage]);

  useEffect(() => {
    if (!isAuth || currentPage !== "chat" || !Object.keys(generatingChats).length) return;
    let cancelled = false;
    let requestInFlight = false;

    const pollTitles = () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      chatsApi.list().then((list) => {
        if (cancelled) return;
        const pendingIds = Object.keys(generatingChats);
        const chatsById = new Map(list.map((chat) => [chat.id, chat]));
        const completedIds = pendingIds.filter((id) => {
          const chat = chatsById.get(id);
          return !chat || chat.title !== "New chat";
        });

        setGeneratingChats((current) => {
          const next = { ...current };
          completedIds.forEach((id) => delete next[id]);
          return next;
        });
        setChatSessions((current) => {
          const currentById = new Map(current.map((chat) => [chat.id, chat]));
          const merged = list.map((chat) => {
            const local = currentById.get(chat.id);
            return manualTitlesRef.current.has(chat.id) && local
              ? { ...chat, title: local.title, updated_at: local.updated_at }
              : chat;
          });
          return sortChats(merged);
        });
      }).catch(() => undefined).finally(() => {
        requestInFlight = false;
      });
    };

    pollTitles();
    const pollTimer = window.setInterval(pollTitles, 500);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [isAuth, currentPage, generatingChats]);

  const handleNavigate = (page: Page, providerId?: string) => {
    if (page === "provider-detail" && providerId) {
      setSelectedProviderId(providerId);
      setCurrentPage(page);
    } else {
      setSelectedProviderId(null);
      setCurrentPage(page);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuth) {
    if (needsSetup) return <SetupPage onComplete={completeSetup} />;
    return <LoginPage onLogin={login} error={error} loading={loading} />;
  }

  const createChat = async () => {
    const chat = await chatsApi.create();
    invalidateChats(chat.id);
    setChatSessions((current) => sortChats([chat, ...current]));
    setActiveChatId(chat.id);
    handleNavigate("chat");
  };
  const renameChat = async (id: string, title: string) => {
    manualTitlesRef.current.add(id);
    setGeneratingChats((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    const chat = await chatsApi.update(id, { title });
    invalidateChats(id);
    setChatSessions((current) => sortChats(current.map((item) => item.id === id ? chat : item)));
  };
  const onChatActivity = (id: string) => {
    const updatedAt = new Date().toISOString();
    setChatSessions((current) => sortChats(current.map((chat) =>
      chat.id === id ? { ...chat, updated_at: updatedAt } : chat,
    )));
  };
  const deleteChat = async (id: string) => {
    await chatsApi.remove(id);
    invalidateChats(id);
    const remaining = chatSessions.filter((chat) => chat.id !== id);
    setChatSessions(remaining);
    if (activeChatId === id) setActiveChatId(remaining[0]?.id ?? null);
  };
  const exportChat = async (chat: ChatSession) => {
    try {
      const result = await chatsApi.get(chat.id);
      downloadChatMarkdown(result.session, result.messages, {});
    } catch {
      // Exporting is best-effort; a failed fetch simply keeps the current view.
    }
  };

  return (
    <ToastProvider>
      <TooltipProvider>
        <div className="flex min-h-svh bg-background text-foreground">
          {currentPage === "chat" ? (
            <ChatSidebar
              chats={chatSessions}
              activeChatId={activeChatId}
              profile={profile}
              onNew={createChat}
              onSelect={setActiveChatId}
              onRename={renameChat}
              onDelete={deleteChat}
              onExport={(chat) => void exportChat(chat)}
              onBack={() => handleNavigate("dashboard")}
              onLogout={logout}
              generatingChats={generatingChats}
              mobileOpen={mobileSidebarOpen}
            />
          ) : (
            <Sidebar
              currentPage={currentPage}
              onNavigate={(page) => handleNavigate(page)}
              onLogout={logout}
              profile={profile}
              mobileOpen={mobileSidebarOpen}
            />
          )}
          {mobileSidebarOpen && (
            <button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          <main className="min-w-0 flex-1 overflow-auto">
            {currentPage === "dashboard" && (
              <DashboardPage onNavigate={handleNavigate} />
            )}
            {currentPage === "chat" && (
              <ChatPage
                chatId={activeChatId}
                onTitle={({ chat_id, title }) => {
                  setGeneratingChats((current) => {
                    const next = { ...current };
                    delete next[chat_id];
                    return next;
                  });
                  if (manualTitlesRef.current.has(chat_id)) return;
                  setChatSessions((current) => {
                    const existing = current.find((chat) => chat.id === chat_id);
                    const now = new Date().toISOString();
                    const updated = existing
                      ? { ...existing, title, updated_at: now }
                      : {
                          id: chat_id,
                          title,
                          model: "",
                          created_at: now,
                          updated_at: now,
                        };
                    return sortChats([updated, ...current.filter((chat) => chat.id !== chat_id)]);
                  });
                }}
                onTitleGenerationStart={(id) => {
                  setGeneratingChats((current) => ({ ...current, [id]: true }));
                }}
                onChatActivity={onChatActivity}
                onChatCreated={(id) => {
                  setActiveChatId(id);
                  invalidateChats(id);
                  queryCache.getOrFetch(queryKeys.chats, 5_000, chatsApi.list).then((list) => {
                    const created = list.find((chat) => chat.id === id);
                    setChatSessions(sortChats(created ? [created, ...list.filter((chat) => chat.id !== id)] : list));
                  }).catch(() => undefined);
                }}
                username={profile.name}
              />
            )}
            {currentPage === "provider-detail" && selectedProviderId && (
              <ProviderDetailPage
                providerId={selectedProviderId}
                onBack={() => handleNavigate("dashboard")}
              />
            )}
            {currentPage === "models" && <ModelsPage />}
            {currentPage === "stats" && <StatsPage />}
            {currentPage === "usage" && <UsageLimitsPage />}
            {currentPage === "request-logs" && <RequestLogsPage />}
            {currentPage === "keys" && <ApiKeysPage />}
            {currentPage === "settings" && (
              <SettingsPage
                darkMode={darkMode}
                onThemeChange={setDarkMode}
                profile={profile}
                onProfileChange={setProfile}
              />
            )}
          </main>
        </div>
      </TooltipProvider>
    </ToastProvider>
  );
}
