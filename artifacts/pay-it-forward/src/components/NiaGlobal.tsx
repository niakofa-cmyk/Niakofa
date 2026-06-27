import { useState, useEffect } from "react";
import { NiaFab } from "./NiaFab";
import { NiaDrawer } from "./NiaDrawer";

/**
 * NiaGlobal — mounts the NiaFab (sparkle orb) and NiaDrawer globally on every page.
 * Polls /admin/nia-status every 60s to respect the admin kill-switch.
 * This component is rendered once at the App root level.
 */
export function NiaGlobal() {
  const [niaEnabled, setNiaEnabled] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Poll admin kill-switch every 60 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/admin/nia-status");
        if (res.ok) {
          const { enabled } = await res.json() as { enabled: boolean };
          setNiaEnabled(enabled);
          if (!enabled) setDrawerOpen(false); // close drawer if killed
        }
      } catch {
        // Non-fatal: keep current state if network blips
      }
    };
    check(); // immediate check on mount
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!niaEnabled) return null;

  return (
    <>
      <NiaFab onClick={() => setDrawerOpen((o) => !o)} isOpen={drawerOpen} />
      <NiaDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
