import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SignInGate } from "./SignInGate";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element missing");
}

createRoot(root).render(
  <StrictMode>
    <SignInGate>
      <App />
    </SignInGate>
  </StrictMode>,
);
