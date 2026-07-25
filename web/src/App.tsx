import { useEffect, useState } from "react";
import { RiLoader4Line as LoaderCircle } from "@remixicon/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./hooks/useAuth";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProviderDetailPage from "./pages/ProviderDetailPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import SettingsPage from "./pages/SettingsPage";
import ModelsPage from "./pages/ModelsPage";
import type { Page } from "./types";

export default function App() {
  const { isAuth, loading, error, login, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("klove_theme") !== "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("klove_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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
    return <div className="flex min-h-svh items-center justify-center"><LoaderCircle className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAuth) return <LoginPage onLogin={login} error={error} loading={loading} />;

  return (
    <TooltipProvider>
      <div className="flex min-h-svh bg-background text-foreground">
        <Sidebar currentPage={currentPage} onNavigate={(page) => handleNavigate(page)} onLogout={logout} />
        <main className="min-w-0 flex-1 overflow-auto">
          {currentPage === "dashboard" && <DashboardPage onNavigate={handleNavigate} />}
          {currentPage === "provider-detail" && selectedProviderId && (
            <ProviderDetailPage providerId={selectedProviderId} onBack={() => handleNavigate("dashboard")} />
          )}
          {currentPage === "models" && <ModelsPage />}
          {currentPage === "keys" && <ApiKeysPage />}
          {currentPage === "settings" && <SettingsPage darkMode={darkMode} onThemeChange={setDarkMode} />}
        </main>
      </div>
    </TooltipProvider>
  );
}
