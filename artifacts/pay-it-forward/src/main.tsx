import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import { getToken, clearToken } from "./lib/auth";
import App from "./App";
import "./index.css";

// Wire the generated API client's bearer-token getter to our stored token —
// without this, every hook built on the generated client (useGetRoute,
// useClaimRequest, useGetUserTransactions, etc. — almost the entire app)
// sends no Authorization header at all, regardless of whether a valid
// token exists. This was never connected.
setAuthTokenGetter(getToken);

// ENH-003: on any 401 from the API, clear the stale token and bounce to
// login with a session-expired flag, instead of letting every subsequent
// call silently fail. Guarded so a flood of concurrent 401s (e.g. several
// in-flight requests when the token expires) only redirects once.
let redirectingForSessionExpiry = false;
setUnauthorizedHandler(() => {
  if (redirectingForSessionExpiry) return;
  redirectingForSessionExpiry = true;
  clearToken();
  sessionStorage.setItem("niakofa_session_expired", "1");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
