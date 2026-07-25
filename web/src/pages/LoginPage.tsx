import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
}

export default function LoginPage({ onLogin, error, loading }: LoginPageProps) {
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onLogin(password);
  };

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: 380,
          p: 4,
          textAlign: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <Typography variant="h3" sx={{ mb: 1 }}>
          🧠
        </Typography>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Klove
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3 }}
        >
          AI Router Panel
        </Typography>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField
            fullWidth
            type="password"
            label="Password"
            placeholder="Enter panel password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            error={!!error}
            helperText={error}
            size="medium"
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Enter Panel"}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
