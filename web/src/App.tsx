import { useEffect, useRef, useState } from "react";
import { RiLoader4Line as LoaderCircle } from "@remixicon/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./hooks/useAuth";
import Sidebar from "./components/Sidebar";
import ChatSidebar from "./components/ChatSidebar";
import { chats as chatsApi } from "./api/client";
import type { ChatSession } from "./types";
import LoginPage from "./pages/LoginPage";
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

export default function App() {
  const { isAuth, loading, error, login, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [generatingChatId, setGeneratingChatId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
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
      touchStartX.current = event.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartX.current;
      const end = event.changedTouches[0]?.clientX;
      touchStartX.current = null;
      if (start === null || end === undefined) return;
      if (start < 28 && end - start > 56) setMobileSidebarOpen(true);
      if (mobileSidebarOpen && start - end > 56) setMobileSidebarOpen(false);
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
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
    chatsApi.list().then((list) => {
      setChatSessions(list);
      setActiveChatId((current) => current && list.some((chat) => chat.id === current) ? current : list[0]?.id ?? null);
    }).catch(() => setChatSessions([]));
  }, [isAuth, currentPage]);

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

  if (!isAuth)
    return <LoginPage onLogin={login} error={error} loading={loading} />;

  const createChat = async () => {
    const chat = await chatsApi.create();
    setChatSessions((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    handleNavigate("chat");
  };
  const renameChat = async (id: string, title: string) => {
    const chat = await chatsApi.update(id, { title });
    setChatSessions((current) => current.map((item) => item.id === id ? chat : item));
  };
  const deleteChat = async (id: string) => {
    await chatsApi.remove(id);
    const remaining = chatSessions.filter((chat) => chat.id !== id);
    setChatSessions(remaining);
    if (activeChatId === id) setActiveChatId(remaining[0]?.id ?? null);
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
              onBack={() => handleNavigate("dashboard")}
              onLogout={logout}
              generatingChatId={generatingChatId}
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
                  setGeneratingChatId((current) => current === chat_id ? null : current);
                  setChatSessions((current) => {
                    const existing = current.find((chat) => chat.id === chat_id);
                    const updated = existing
                      ? { ...existing, title }
                      : {
                          id: chat_id,
                          title,
                          model: "",
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        };
                    return [updated, ...current.filter((chat) => chat.id !== chat_id)];
                  });
                }}
                onTitleGenerationStart={(id) => setGeneratingChatId(id)}
                onChatCreated={(id) => {
                  setActiveChatId(id);
                  chatsApi.list().then((list) => {
                    const created = list.find((chat) => chat.id === id);
                    setChatSessions(created ? [created, ...list.filter((chat) => chat.id !== id)] : list);
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
