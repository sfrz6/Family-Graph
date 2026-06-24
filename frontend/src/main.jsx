/**
 * main.jsx - The very first file that runs.
 * 
 * This mounts our App component into the HTML page.
 * React.StrictMode helps catch bugs during development
 * by running some checks twice.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
