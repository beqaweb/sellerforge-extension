import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import {
    Box,
    Card,
    CardActionArea,
    CardContent,
    Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

const tools = [
  {
    title: "Request Reviews",
    description:
      "Automatically request reviews for recent Amazon orders in bulk.",
    icon: <RateReviewOutlinedIcon sx={{ fontSize: 40 }} />,
    path: "/reviews",
    color: "#ff9900",
  },
  {
    title: "Generate FNSKU Labels",
    description:
      "Create clean, print-ready FNSKU labels for your FBA products.",
    icon: <LabelOutlinedIcon sx={{ fontSize: 40 }} />,
    path: "/labels",
    color: "#0073bb",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select a tool to get started
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {tools.map((tool) => (
          <Card key={tool.path} variant="outlined">
            <CardActionArea onClick={() => navigate(tool.path)}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
                <Box sx={{ color: tool.color }}>{tool.icon}</Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {tool.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tool.description}
                  </Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
