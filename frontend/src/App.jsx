/**
 * App.jsx - Root component.
 * 
 * Default language is Arabic (ar).
 * Normal users see UserMenu popup after login.
 * Admin goes straight to the graph with admin panel access.
 */

import { useState } from "react";
import LoginPage from "./components/LoginPage";
import FamilyGraph from "./components/FamilyGraph";
import "./index.css";

function App() {
  const [role, setRole] = useState(null);
  const [language, setLanguage] = useState("ar"); // Arabic by default

  const handleLogin = (userRole) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    setRole(null);
  };

  if (!role) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <FamilyGraph
      role={role}
      onLogout={handleLogout}
      language={language}
      setLanguage={setLanguage}
    />
  );
}

export default App;
