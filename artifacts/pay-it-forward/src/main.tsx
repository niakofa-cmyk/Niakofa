import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BirdTest from "./pages/bird-test";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <BirdTest />
  </StrictMode>
);
