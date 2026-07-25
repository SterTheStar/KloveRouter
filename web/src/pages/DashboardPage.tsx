import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import ProviderCard from "../components/ProviderCard";
import AddProviderModal from "../components/AddProviderModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { providers } from "../api/client";
import type { Provider } from "../types";

interface DashboardPageProps {
  onNavigate: (page: "provider-detail", providerId: string) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [providerList, setProviderList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await providers.list();
      setProviderList(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const updated = await providers.toggle(id);
      setProviderList((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, is_active: updated.is_active } : p
        )
      );
    } catch (err: any) {
      console.error("Toggle failed:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await providers.remove(deleteTarget.id);
      setProviderList((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (id: string) => {
    onNavigate("provider-detail", id);
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center", mt: 2 }}
        >
          Loading providers...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Providers
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage your AI providers and their models
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => setShowAddModal(true)}
        >
          Add Provider
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {providerList.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 10,
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <Typography variant="h3" sx={{ mb: 2 }}>
            ⚡
          </Typography>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            No Providers Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connect your first OpenAI-compatible provider to get started.
          </Typography>
          <Button
            variant="contained"
            onClick={() => setShowAddModal(true)}
          >
            Add Your First Provider
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          {providerList.map((provider) => (
            <Box
              key={provider.id}
              sx={{
                width: {
                  xs: "100%",
                  sm: "calc(50% - 8px)",
                  lg: "calc(33.33% - 11px)",
                },
              }}
            >
              <ProviderCard
                provider={provider}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={(id) =>
                  setDeleteTarget(
                    providerList.find((p) => p.id === id) ?? null
                  )
                }
                isToggling={togglingId === provider.id}
              />
            </Box>
          ))}
        </Box>
      )}

      <AddProviderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchProviders}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Provider"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All associated models will also be removed.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Box>
  );
}
