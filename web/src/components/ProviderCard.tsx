import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import type { Provider } from "../types";

const colors = [
  "#1976d2", "#388e3c", "#f57c00", "#d32f2f",
  "#7b1fa2", "#0097a7", "#c2185b", "#689f38",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface ProviderCardProps {
  provider: Provider;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isToggling?: boolean;
}

export default function ProviderCard({
  provider,
  onToggle,
  onEdit,
  onDelete,
  isToggling,
}: ProviderCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        opacity: provider.is_active ? 1 : 0.6,
        borderColor: provider.is_active ? "divider" : "action.disabledBackground",
        transition: ["opacity 0.2s", "border-color 0.2s"].join(","),
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent
        sx={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar
              src={provider.avatar || undefined}
              sx={{
                bgcolor: provider.avatar ? "transparent" : nameToColor(provider.name),
                width: 36,
                height: 36,
                fontSize: "0.9rem",
                fontWeight: 700,
              }}
            >
              {!provider.avatar && provider.name.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="subtitle1" fontWeight={600}>
              {provider.name}
            </Typography>
          </Box>
          <Switch
            checked={provider.is_active === 1}
            onChange={() => onToggle(provider.id)}
            disabled={isToggling}
            size="small"
          />
        </Box>

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onEdit(provider.id)}
            sx={{ flex: 1 }}
          >
            Manage
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => onDelete(provider.id)}
          >
            Delete
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
