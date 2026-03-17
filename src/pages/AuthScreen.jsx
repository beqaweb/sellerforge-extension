import GoogleIcon from "@mui/icons-material/Google";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Typography,
} from "@mui/material";
import { useState } from "react";

export default function AuthScreen({ onSignIn }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const res = await onSignIn();
    if (!res?.ok) {
      setError(res?.error || "Sign-in failed");
    }
    setLoading(false);
  };

  return (
    <Box
      sx={{
        width: 380,
        minHeight: 300,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
        gap: 3,
      }}
    >
      <Typography variant="h5" fontWeight={700} color="secondary">
        SellerForge
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Amazon seller toolkit — automate reviews, generate labels, and more.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <GoogleIcon />}
        onClick={handleClick}
        disabled={loading}
        fullWidth
      >
        {loading ? "Signing in…" : "Sign in with Google"}
      </Button>
    </Box>
  );
}
