import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import { settings } from "../api/client";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError("Current password is required.");
      return;
    }
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const result = await settings.changePassword(currentPassword, newPassword);
      setSuccess(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 720 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage your Klove panel settings
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
          Change Panel Password
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2.5 }}
        >
          Update the password required to access the Klove panel.
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 2,
            mb: 2,
          }}
        >
          <TextField
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            error={newPassword.length > 0 && newPassword.length < 4}
            helperText={
              newPassword.length > 0 && newPassword.length < 4
                ? "New password is too short."
                : "Minimum 4 characters."
            }
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            error={
              confirmPassword.length > 0 && confirmPassword !== newPassword
            }
            helperText={
              confirmPassword.length > 0 && confirmPassword !== newPassword
                ? "Passwords do not match."
                : undefined
            }
            size="small"
            sx={{ flex: 1 }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            onClose={() => setSuccess(null)}
          >
            {success}
          </Alert>
        )}

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Change Password"}
        </Button>
      </Paper>
    </Box>
  );
}
