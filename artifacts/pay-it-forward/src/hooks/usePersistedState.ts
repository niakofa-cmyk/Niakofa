/**
 * usePersistedState — drop-in replacement for React.useState that also
 * mirrors the value to sessionStorage, keyed per dataset.
 *
 * WHY THIS EXISTS
 * ----------------
 * This closes the same "data disappeared" class of bug that useCachedList
 * already fixed for Audio Circles (see hooks/useCachedList.ts), but for
 * screens that fetch multiple independent lists inside one component and
 * update them from several different call sites (civic-needs.tsx's
 * openNeeds/claimedNeeds/myPosted, civic-portal.tsx's requests, etc.).
 * Those screens already do the right thing on a *failed* fetch — they never
 * clear state on error, so a network blip was never actually deleting data.
 * The real symptom was: navigating away (unmount) and back, or a hard
 * refresh, always remounts the component fresh, so `useState<T[]>([])`
 * starts empty again and the user sees "No civic needs" / an empty list for
 * a beat before the re-fetch resolves. That empty flash is what reads as
 * "the app lost my data" even though the server never lost anything.
 *
 * WHAT IT DOES
 * ------------
 * 1. On mount, synchronously hydrates from sessionStorage (if present) —
 *    the last-known-good list paints on the very first render, no blank
 *    frame while the network request is in flight.
 * 2. Every successful setState call also writes through to sessionStorage,
 *    so the cache is always in sync with what's on screen.
 * 3. Nothing here changes error handling — callers keep their existing
 *    "never clear on failure" logic. This hook only adds persistence across
 *    mount/unmount and full-page refresh; it does not add any new place
 *    where data could be wiped.
 * 4. If `key` itself changes (e.g. viewing a different sponsor/city), state
 *    re-hydrates from the new key's cache slot instead of leaking the old
 *    key's data under the new one.
 *
 * USAGE (swap-in for useState)
 * -----------------------------
 *   // before:
 *   const [openNeeds, setOpenNeeds] = useState<CivicNeed[]>([]);
 *   // after:
 *   const [openNeeds, setOpenNeeds] = usePersistedState<CivicNeed[]>(
 *     "niakofa_civic_open_needs", []
 *   );
 *
 * Every other line of calling code (setOpenNeeds(data), setOpenNeeds(prev =>
 * [...])) keeps working unchanged — the returned setter supports both a
 * plain value and an updater function, exactly like useState's.
 */
import { useCallback, useEffect, useRef, useState } from "react";

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/blocked (private browsing, quota, etc.) — degrade to
    // in-memory-only for this session. A cache-write failure must never
    // affect the in-memory state currently on screen.
  }
}

export function usePersistedState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readCache<T>(key) ?? initial);
  const keyRef = useRef(key);

  // Re-hydrate whenever the key itself changes (e.g. switching which
  // sponsor/city/tab this cache slot represents) — otherwise the previous
  // key's data would keep rendering under the new key until a fresh fetch
  // resolves.
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setState(readCache<T>(key) ?? initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setPersisted = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        writeCache(keyRef.current, next);
        return next;
      });
    },
    []
  );

  return [state, setPersisted];
}
