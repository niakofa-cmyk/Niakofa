/**
 * NiaGlobal — re-exported from NiaDrawer for backwards compatibility.
 *
 * NOTE: App.tsx mounts its own inline NiaGlobal function that handles
 * kill-switch polling, user context, and drawer state. This file exists
 * as a named export alias so any future imports of NiaGlobal from this
 * path still resolve correctly instead of crashing the build.
 *
 * HISTORY: The old version of this file imported from "./NiaFab" which
 * never existed (NiaFab is defined in NiaDrawer.tsx), and used the wrong
 * API path "/admin/nia-status" instead of "/api/admin/nia-status". Both
 * bugs are resolved by this re-export approach — App.tsx's inline
 * NiaGlobal is the live implementation; this file is a clean alias.
 */
export { NiaFab, NiaOrb, NiaDrawer } from "./NiaDrawer";
