import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// SW registration is now handled by useServiceWorkerUpdate (in App.tsx)
// so we get the app's Toaster context for the "new version" prompt.

createRoot(document.getElementById("root")!).render(<App />);
