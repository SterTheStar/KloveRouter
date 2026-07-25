import { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import { apiKeys } from "../api/client";
import type { ApiKey, ApiKeyWithSecret } from "../types";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewKey, setShowNewKey] = useState<ApiKeyWithSecret | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiKeys.list();
      setKeys(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiKeys.create(newKeyName);
      setShowNewKey(result);
      setNewKeyName("");
      setShowCreate(false);
      await fetchKeys();
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiKeys.remove(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: any) {
      console.error("Delete key failed:", err);
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
            API Keys
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage API keys for accessing the Klove proxy
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => setShowCreate(true)}
        >
          Generate Key
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {keys.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ textAlign: "center", py: 8, px: 3 }}
        >
          <Typography variant="h3" sx={{ mb: 2 }}>
            🔑
          </Typography>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            No API Keys
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Generate an API key to use the Klove proxy endpoint.
          </Typography>
          <Button
            variant="contained"
            onClick={() => setShowCreate(true)}
          >
            Generate Your First Key
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ px: 3, py: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Active Keys ({keys.length})
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Prefix</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {key.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontFamily="monospace"
                        color="text.secondary"
                        fontSize="0.8rem"
                      >
                        {key.prefix}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={key.is_active ? "Active" : "Inactive"}
                        color={key.is_active ? "success" : "default"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(key.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Revoke key">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(key.id)}
                        >
                          ✕
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Create Key Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Generate API Key</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Key Name"
            placeholder="e.g. Production, Dev, My App"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            helperText="A name to identify this key"
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
          >
            {creating ? "Generating..." : "Generate"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Key Reveal Dialog */}
      <Dialog
        open={!!showNewKey}
        onClose={() => setShowNewKey(null)}
        fullWidth
        maxWidth="sm"
        disableEscapeKeyDown
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Key Generated
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Save this key now. You will not be able to see it again.
          </Alert>
          {showNewKey && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <TextField
                fullWidth
                value={showNewKey.raw_key}
                slotProps={{
                  input: {
                    readOnly: true,
                    sx: { fontFamily: "monospace", fontSize: "0.8rem" },
                  },
                }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => copyToClipboard(showNewKey.raw_key)}
                sx={{ whiteSpace: "nowrap", minWidth: 72 }}
              >
                Copy
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setShowNewKey(null)}
          >
            I've Saved It
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
