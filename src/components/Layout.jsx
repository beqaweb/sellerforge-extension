import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import {
    AppBar,
    Avatar,
    BottomNavigation,
    BottomNavigationAction,
    Box,
    IconButton,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const navItems = [
  { label: "Home", icon: <HomeOutlinedIcon />, path: "/" },
  { label: "Reviews", icon: <RateReviewOutlinedIcon />, path: "/reviews" },
  { label: "Labels", icon: <LabelOutlinedIcon />, path: "/labels" },
];

export default function Layout({ user, onSignOut }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);

  const currentNav = navItems.findIndex(
    (item) => item.path === location.pathname
  );

  return (
    <Box sx={{ width: 380, minHeight: 500, display: "flex", flexDirection: "column" }}>
      <AppBar position="static" color="secondary" elevation={0}>
        <Toolbar variant="dense" sx={{ minHeight: 44 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontSize: "0.95rem" }}>
            SellerForge
          </Typography>
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <Avatar
              src={user?.photoURL}
              sx={{ width: 28, height: 28, fontSize: "0.8rem" }}
            >
              {user?.displayName?.[0] || "U"}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem disabled sx={{ opacity: "1 !important" }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {user?.displayName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                onSignOut();
              }}
            >
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        <Outlet />
      </Box>

      <BottomNavigation
        value={currentNav === -1 ? 0 : currentNav}
        onChange={(_, newValue) => navigate(navItems[newValue].path)}
        showLabels
        sx={{ borderTop: "1px solid", borderColor: "divider" }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Box>
  );
}
