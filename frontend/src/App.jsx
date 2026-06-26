/**
 * App.jsx - Root component.
 *
 * Default language is Arabic (ar).
 * Normal users see UserMenu popup after login.
 * Admin goes straight to the graph with admin panel access.
 *
 * The session itself lives in an HttpOnly cookie set by the backend, so on
 * every load we ask GET /api/auth/me whether that cookie is still valid
 * before showing the login page - this is what makes the 30-day session
 * survive a page refresh instead of forgetting the user immediately.
 */

import { useState, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import LoginPage from "./components/LoginPage";
import FamilyGraph from "./components/FamilyGraph";
import { getMe, logout as apiLogout } from "./api";
import "./index.css";

function App() {
  const [role, setRole] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [language, setLanguage] = useState("ar"); // Arabic by default

  useEffect(() => {
    getMe()
      .then((data) => setRole(data.role))
      .catch(() => setRole(null))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogin = (userRole) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    apiLogout().catch(() => {});
    setRole(null);
  };

  if (checkingSession) {
    return null;
  }

  if (!role) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      <FamilyGraph
        role={role}
        onLogout={handleLogout}
        language={language}
        setLanguage={setLanguage}
      />
      <Analytics />
    </>
  );
}

export default App;
