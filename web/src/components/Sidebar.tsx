import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import type { Page } from "../types";

const DRAWER_WIDTH = 240;

interface NavItem {
  page: Page;
  label: string;
  icon: React.ReactElement;
}

const navItems: NavItem[] = [
  { page: "dashboard", label: "Providers", icon: <DashboardIcon /> },
  { page: "keys", label: "API Keys", icon: <VpnKeyIcon /> },
  { page: "settings", label: "Settings", icon: <SettingsIcon /> },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  onLogout,
}: SidebarProps) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
        },
      }}
    >
      <Box
        sx={{
          p: 3,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Typography
          variant="h6"
          fontWeight={800}
          letterSpacing="-0.02em"
        >
          Klove
        </Typography>
      </Box>
      <Divider />
      <List sx={{ flex: 1, px: 1.5, pt: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.page} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={currentPage === item.page}
              onClick={() => onNavigate(item.page)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontWeight: currentPage === item.page ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List sx={{ px: 1.5, py: 1 }}>
        <ListItem disablePadding>
          <ListItemButton onClick={onLogout} sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{ color: "error" }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}

export { DRAWER_WIDTH };
