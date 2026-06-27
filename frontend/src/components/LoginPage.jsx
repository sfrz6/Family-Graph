/**
 * LoginPage.jsx - Secret code entry screen.
 * 
 * This is the first page users see. They type the family secret code
 * and press Enter or click Login. The component calls the backend
 * to verify the code, and if valid, passes the role back to the parent
 * component (App.jsx) which then shows the main app.
 * 
 * React concepts used here:
 * - useState: stores data that can change (the code they typed, error messages)
 * - Props: onLogin is a function passed from the parent component
 * - Event handling: onChange captures typing, onSubmit captures form submission
 */

import { useState } from "react";
import { login } from "../api";

function LoginPage({ onLogin }) {
  // useState creates a variable that React watches.
  // When it changes, React re-renders the component.
  // [value, setterFunction] = useState(initialValue)
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    // e.preventDefault() stops the browser from refreshing the page
    // (which is the default behavior when a form is submitted)
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Call the backend with the entered code
      const result = await login(code);
      // If successful, tell the parent component the role
      onLogin(result.role);
    } catch (err) {
      // If the code is wrong, the backend returns 401
      // and we show an error message
      setError("Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Family Graph</h1>
        <p className="login-subtitle">شجرة العائلة</p>

        {/* 
          onSubmit fires when the user presses Enter or clicks the button.
          We handle it with handleSubmit above.
        */}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter family code"
            className="login-input"
            autoFocus
          />

          {/* Only show error message if there is one */}
          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className="login-button"
            disabled={loading || !code}
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>

        <div className="login-credit">
          <span className="login-credit-line">✦</span>
          <p className="login-credit-text">تم بواسطة سليمان بن محمد</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
