import { useState } from "react";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useAuth } from "./hooks/useAuth";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProviderDetailPage from "./pages/ProviderDetailPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import SettingsPage from "./pages/SettingsPage";
import type { Page } from "./types";

export default function App() {
  const { isAuth, loading, error, login, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );

  const handleNavigate = (page: Page, providerId?: string) => {
    if (page === "provider-detail" && providerId) {
      setSelectedProviderId(providerId);
      setCurrentPage("provider-detail");
    } else {
      setCurrentPage(page);
      setSelectedProviderId(null);
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentPage("login");
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <LinearProgress sx={{ width: 320 }} />
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  if (!isAuth) {
    return <LoginPage onLogin={login} error={error} loading={loading} />;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => handleNavigate(page)}
        onLogout={handleLogout}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          overflow: "auto",
        }}
      >
        {currentPage === "dashboard" && (
          <DashboardPage onNavigate={handleNavigate} />
        )}
        {currentPage === "provider-detail" && selectedProviderId && (
          <ProviderDetailPage
            providerId={selectedProviderId}
            onBack={() => handleNavigate("dashboard")}
          />
        )}
        {currentPage === "keys" && <ApiKeysPage />}
        {currentPage === "settings" && <SettingsPage />}
      </Box>
    </Box>
  );
}
