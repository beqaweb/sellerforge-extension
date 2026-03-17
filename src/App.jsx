import { CssBaseline, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AuthScreen from "./pages/AuthScreen";
import Dashboard from "./pages/Dashboard";
import LabelGenerator from "./pages/LabelGenerator";
import ReviewRequester from "./pages/ReviewRequester";
import theme from "./theme";
import { MSG, sendMessage } from "./utils/messaging";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    sendMessage({ type: MSG.GET_AUTH_STATE }).then((res) => {
      setUser(res?.user || null);
      setAuthLoading(false);
    });
  }, []);

  const handleSignIn = async () => {
    const res = await sendMessage({ type: MSG.SIGN_IN });
    if (res?.ok) {
      setUser(res.user);
    }
    return res;
  };

  const handleSignOut = async () => {
    await sendMessage({ type: MSG.SIGN_OUT });
    setUser(null);
  };

  if (authLoading) {
    return null;
  }

  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthScreen onSignIn={handleSignIn} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <Routes>
          <Route element={<Layout user={user} onSignOut={handleSignOut} />}>
            <Route index element={<Dashboard />} />
            <Route path="reviews" element={<ReviewRequester />} />
            <Route path="labels" element={<LabelGenerator />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
