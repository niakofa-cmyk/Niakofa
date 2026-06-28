/**
 * NiaGlobal.tsx — Enhanced (Round 4)
 *
 * This is the single source of truth for Nia's presence across the entire app.
 *
 * Kill-switch architecture:
 *  - Admin toggles Nia via /api/admin/nia-toggle (stored in DB, survives redeploy)
 *  - NiaGlobal polls /api/admin/nia-status every 60s
 *  - niaEnabled state flows down to NiaFab (via props) and NiaDrawer (via context)
 *
 * Screen rules:
 *  LOGIN  (/login):
 *    - NiaFab is NEVER shown (login has its own hero NiaOrb — always alive)
 *    - The hero NiaOrb in login.tsx is NOT kill-switch controlled
 *
 *  ALL OTHER SCREENS (when niaEnabled = true):
 *    - NiaFab renders, is draggable, opens NiaDrawer
 *
 *  ALL OTHER SCREENS (when niaEnabled = false):
 *    - NiaFab is completely hidden (NiaFab returns null when enabled=false)
 *    - NiaDrawer cannot be opened
 *    - No N orb anywhere
 *
 * Features when enabled:
 *  - Draggable N orb (position persists in localStorage)
 *  - Full pulse / sparkle animations
 *  - NiaDrawer with full chat, TTS, location context
 *
 * Features locked when disabled:
 *  - No FAB rendered
 *  - No drawer access
 *  - No chat, no TTS, no location prompts from Nia
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { NiaFab } from "./NiaFab";
import { NiaDrawer } from "./NiaDrawer";
import { useAppContext } from "../lib/AppContext";

const NIA_STATUS_POLL_MS = 60_000; // re-check kill-switch every 60s

export function NiaGlobal() {
  const [location] = useLocation();
  const { currentUser, helperModeActive, activeRequestId, userPlace } = useAppContext();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [niaEnabled, setNiaEnabled] = useState<boolean>(true); // optimistic: assume enabled
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);

  // ── Kill-switch polling ──────────────────────────────────────────────────
  const checkNiaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nia-status");
      if (res.ok) {
        const data = await res.json() as { enabled: boolean };
        setNiaEnabled(data.enabled);
      }
    } catch {
      // Network error — keep existing state, don't flip to disabled
    }
  }, []);

  useEffect(() => {
    // Check immediately on mount
    checkNiaStatus();
    // Then poll every 60s
    const id = setInterval(checkNiaStatus, NIA_STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [checkNiaStatus]);

  // Close drawer when kill-switch fires while it's open
  useEffect(() => {
    if (!niaEnabled && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [niaEnabled, drawerOpen]);

  // ── Route guard ────────────────────────────────────────────────────────
  // Never render the FAB on the login screen — login has its own hero NiaOrb
  const isLoginScreen = location === "/login";
  if (isLoginScreen) return null;

  // ── Resolve user location for NiaDrawer context ────────────────────────
  const userLocation = null; // GPS coords live in AppContext and are passed via place

  return (
    <>
      {/*
        NiaFab:
        - enabled=false  → renders null (no N orb anywhere)
        - enabled=true   → renders draggable N orb
        - Only shown on non-login screens (login has its own hero orb)
      */}
      <NiaFab
        enabled={niaEnabled}
        onClick={() => {
          if (niaEnabled) {
            setInitialMessage(undefined);
            setDrawerOpen(true);
          }
        }}
      />

      {/*
        NiaDrawer:
        - Only opens when niaEnabled = true
        - Closed immediately if kill-switch fires while open (effect above)
      */}
      {niaEnabled && (
        <NiaDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          initialMessage={initialMessage}
          userId={currentUser?.id ?? null}
          userName={currentUser?.name ?? null}
          userLocation={userLocation}
          userCity={userPlace.city}
          userCounty={userPlace.county}
          userState={userPlace.state}
          helperModeActive={helperModeActive}
          activeRequestId={activeRequestId}
          accountType={currentUser ? (currentUser.is_helper ? "helper" : "requester") : null}
        />
      )}
    </>
  );
}

// Re-export NiaFab, NiaOrb, NiaDrawer for any legacy imports
export { NiaFab, NiaDrawer } from "./NiaDrawer";
