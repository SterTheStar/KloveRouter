import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AvatarUpload from "../components/AvatarUpload";
import AddModelModal from "../components/AddModelModal";
import EditModelModal from "../components/EditModelModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { providers, models as modelsApi } from "../api/client";
import type { Provider, Model } from "../types";

interface ProviderDetailPageProps {
  providerId: string;
  onBack: () => void;
}

export default function ProviderDetailPage({
  providerId,
  onBack,
}: ProviderDetailPageProps) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [modelList, setModelList] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editTarget, setEditTarget] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Model | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [prov, mods] = await Promise.all([
        providers.get(providerId),
        modelsApi.listByProvider(providerId),
      ]);
      setProvider(prov);
      setModelList(mods);
      setEditName(prov.name);
      setEditBaseUrl(prov.base_url);
      setEditAvatar(prov.avatar ?? null);
      setEditApiKey("");
      setError(null);
      setSuccess(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data: any = { name: editName, base_url: editBaseUrl, avatar: editAvatar };
      if (editApiKey) data.api_key = editApiKey;
      const updated = await providers.update(providerId, data);
      setProvider(updated);
      setEditApiKey("");
      setSuccess("Provider updated successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await modelsApi.sync(providerId);
      await fetchData();
      setSuccess(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleModel = async (modelId: string) => {
    try {
      const updated = await modelsApi.toggle(modelId);
      setModelList((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, is_active: updated.is_active } : m
        )
      );
    } catch (err: any) {
      console.error("Toggle model failed:", err);
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await modelsApi.remove(deleteTarget.id);
      setModelList((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete model failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await modelsApi.deleteAll(providerId);
      setModelList([]);
      setClearAllOpen(false);
    } catch (err: any) {
      console.error("Clear all failed:", err);
    } finally {
      setClearingAll(false);
    }
  };   

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!provider) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Provider not found.
        </Alert>
        <Button variant="outlined" onClick={onBack}>
          Back to Providers
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 3,
        }}
      >
        <Button
          variant="outlined"
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
        >
          Back
        </Button>
        <Typography variant="h5" fontWeight={700}>
          {provider.name}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Connection Settings */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Connection Settings
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <AvatarUpload value={editAvatar} name={editName} onChange={setEditAvatar} />
          <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
            <TextField
              label="Provider Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              helperText="Identifier used for routing (providername/modelname)"
              size="small"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Base URL"
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
              helperText="API base URL"
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
          <TextField
            label="API Key"
            value={editApiKey}
            onChange={(e) => setEditApiKey(e.target.value)}
            type="password"
            placeholder="Enter new API key (leave blank to keep current)"
            helperText="Fill only if changing the key"
            size="small"
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outlined"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync Models"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Models */}
      <Paper variant="outlined" sx={{ p: 0 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 3,
            py: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Models ({modelList.length})
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            {modelList.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => setClearAllOpen(true)}
              >
                Delete All
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              onClick={() => setShowAddModel(true)}
            >
              Add Model
            </Button>
          </Box>
        </Box>
        <Divider />
        {modelList.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", py: 4, px: 3 }}
          >
            No models yet. Click "Sync Models" above to fetch from the provider,
            or click "Add Model" to add one manually.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Model ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Display Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 140 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modelList.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          "& .copy-icon": { opacity: 0, transition: "opacity 0.15s" },
                          "&:hover .copy-icon": { opacity: 1 },
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontFamily="monospace"
                          fontSize="0.8rem"
                        >
                          {model.model_id}
                        </Typography>
                        <Tooltip title="Copy model ID">
                          <IconButton
                            className="copy-icon"
                            size="small"
                            onClick={() => copyToClipboard(model.model_id)}
                            sx={{ width: 22, height: 22 }}
                          >
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {model.display_name || (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={model.is_manual ? "Manual" : "Auto-synced"}
                        color={model.is_manual ? "warning" : "primary"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={model.is_active === 1}
                        onChange={() => handleToggleModel(model.id)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Tooltip title="Edit model">
                          <IconButton
                            size="small"
                            onClick={() => setEditTarget(model)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete model">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(model)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <AddModelModal
        isOpen={showAddModel}
        onClose={() => setShowAddModel(false)}
        onSuccess={fetchData}
        providerId={providerId}
      />

      <EditModelModal
        isOpen={!!editTarget}
        model={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={fetchData}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Model"
        message={`Remove model "${deleteTarget?.model_id}" from this provider?`}
        confirmLabel="Delete"
        onConfirm={handleDeleteModel}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <ConfirmDialog
        open={clearAllOpen}
        title="Delete All Models"
        message={`Remove all ${modelList.length} models from "${provider.name}"? This action cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={handleClearAll}
        onCancel={() => setClearAllOpen(false)}
        loading={clearingAll}
      />
    </Box>
  );
}
