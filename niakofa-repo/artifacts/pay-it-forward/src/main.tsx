import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";

// Wire the Niakofa auth token into every customFetch call so generated
// API client hooks automatically send Authorization: Bearer <token>.
// This must run before any component is mounted so the first query from
// React Query already has credentials attached.
setAuthTokenGetter(getToken);

// SW registration is now handled by useServiceWorkerUpdate (in App.tsx)
// so we get the app's Toaster context for the "new version" prompt.

createRoot(document.getElementById("root")!).render(<App />);
