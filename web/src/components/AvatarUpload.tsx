import { useRef } from "react";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

interface AvatarUploadProps {
  value: string | null;
  name: string;
  onChange: (base64: string | null) => void;
}

const COLORS = [
  "#1976d2", "#388e3c", "#f57c00", "#d32f2f",
  "#7b1fa2", "#0097a7", "#c2185b", "#689f38",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function AvatarUpload({ value, name, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <IconButton
        onClick={() => inputRef.current?.click()}
        sx={{ p: 0 }}
      >
        <Avatar
          src={value || undefined}
          sx={{
            bgcolor: value ? "transparent" : nameToColor(name),
            width: 56,
            height: 56,
            fontSize: "1.25rem",
            fontWeight: 700,
            cursor: "pointer",
            "&:hover": { opacity: 0.8 },
          }}
        >
          {!value && name.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>
      <Box>
        <Typography variant="body2" fontWeight={500}>
          Provider Avatar
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {value ? (
            <>
              Image set.{" "}
              <Box
                component="span"
                sx={{ color: "primary.main", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => inputRef.current?.click()}
              >
                Change
              </Box>
              {" / "}
              <Box
                component="span"
                sx={{ color: "error.main", cursor: "pointer", textDecoration: "underline" }}
                onClick={handleRemove}
              >
                Remove
              </Box>
            </>
          ) : (
            "Click to upload an image (PNG, JPG)"
          )}
        </Typography>
      </Box>
    </Box>
  );
}
