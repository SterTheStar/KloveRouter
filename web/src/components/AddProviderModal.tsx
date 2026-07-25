import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AvatarUpload from "../components/AvatarUpload";
import { providers } from "../api/client";

interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProviderModal({
  isOpen,
  onClose,
  onSuccess,
}: AddProviderModalProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setName("");
    setBaseUrl("");
    setApiKey("");
    setAvatar(null);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!name || !baseUrl || !apiKey) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await providers.create({ name, base_url: baseUrl, api_key: apiKey, avatar: avatar || undefined });
      setName("");
      setBaseUrl("");
      setApiKey("");
      setAvatar(null);
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
      <DialogTitle>Add Provider</DialogTitle>
      <DialogContent>
        <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
        <TextField
          fullWidth
          label="Provider Name"
          placeholder="e.g. openai, anthropic, groq"
          value={name}
          onChange={(e) => setName(e.target.value)}
          helperText="A unique identifier for this provider"
          required
          sx={{ mb: 2, mt: 2 }}
        />
        <TextField
          fullWidth
          label="Base URL"
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          helperText="The API base URL"
          required
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="API Key"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          required
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
          {loading ? "Saving..." : "Save Provider"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
