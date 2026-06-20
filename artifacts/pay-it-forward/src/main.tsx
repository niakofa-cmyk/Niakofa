import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";
import App from "./App";
import "./index.css";

// Wire the generated API client's bearer-token getter to our stored token —
// without this, every hook built on the generated client (useGetRoute,
// useClaimRequest, useGetUserTransactions, etc. — almost the entire app)
// sends no Authorization header at all, regardless of whether a valid
// token exists. This was never connected.
setAuthTokenGetter(getToken);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
