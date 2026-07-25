import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { models } from "../api/client";

interface AddModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
}

export default function AddModelModal({
  isOpen,
  onClose,
  onSuccess,
  providerId,
}: AddModelModalProps) {
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setModelId("");
    setDisplayName("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!modelId) {
      setError("Model ID is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await models.create(providerId, {
        model_id: modelId,
        display_name: displayName || undefined,
      });
      setModelId("");
      setDisplayName("");
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
      <DialogTitle>Add Model Manually</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Model ID"
          placeholder="e.g. gpt-4, claude-3-opus"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          helperText="The model identifier used in API calls"
          required
          sx={{ mb: 2, mt: 1 }}
        />
        <TextField
          fullWidth
          label="Display Name (optional)"
          placeholder="e.g. GPT-4 Turbo"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
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
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save Model"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
