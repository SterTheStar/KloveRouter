import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { models } from "../api/client";
import type { Model } from "../types";

interface EditModelModalProps {
  isOpen: boolean;
  model: Model | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditModelModal({
  isOpen,
  model,
  onClose,
  onSuccess,
}: EditModelModalProps) {
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (model) {
      setModelId(model.model_id);
      setDisplayName(model.display_name ?? "");
      setError(null);
    }
  }, [model]);

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!model) return;
    if (!modelId.trim()) {
      setError("Model ID is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await models.update(model.id, {
        model_id: modelId,
        display_name: displayName || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Model</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Model ID"
          placeholder="e.g. gpt-4, claude-3-opus"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          helperText="The identifier used in API calls (providername/modelname)"
          required
          sx={{ mb: 2, mt: 1 }}
        />
        <TextField
          fullWidth
          label="Display Name"
          placeholder="e.g. GPT-4 Turbo"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          helperText="Leave empty to hide"
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
