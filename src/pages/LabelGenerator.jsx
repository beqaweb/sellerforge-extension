import DownloadIcon from "@mui/icons-material/Download";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    TextField,
    Typography,
} from "@mui/material";
import { useState } from "react";

const API_BASE = "https://localhost:8123";

export default function LabelGenerator() {
  const [asin, setAsin] = useState("");
  const [fnsku, setFnsku] = useState("");
  const [title, setTitle] = useState("");
  const [condition, setCondition] = useState("New");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleGenerate = async () => {
    if (!fnsku.trim()) {
      setError("FNSKU is required");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const params = new URLSearchParams({ fnsku: fnsku.trim() });
      if (asin.trim()) params.set("asin", asin.trim());
      if (title.trim()) params.set("title", title.trim());
      if (condition.trim()) params.set("condition", condition.trim());

      const res = await fetch(`${API_BASE}/api/labels/fnsku?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fnsku.trim()}_labels.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setSuccess("Labels downloaded!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Generate clean, print-ready FNSKU labels for your FBA products.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="FNSKU"
          size="small"
          required
          placeholder="X00XXXXXXX"
          value={fnsku}
          onChange={(e) => setFnsku(e.target.value)}
        />
        <TextField
          label="ASIN (optional)"
          size="small"
          placeholder="B0XXXXXXXXX"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
        />
        <TextField
          label="Product Title (optional)"
          size="small"
          placeholder="Short product title for the label"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          label="Condition"
          size="small"
          placeholder="New"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        />

        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating…" : "Generate Labels"}
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && <Alert severity="success">{success}</Alert>}
    </Box>
  );
}
