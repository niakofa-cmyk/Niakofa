import { useEffect, useRef } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  isHealthCommitPayload,
  normalizeBuildCommit,
  shouldNotifyForBuildUpdate,
} from "@/lib/buildIdentity";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;
const RELOAD_GUARD_KEY = "niakofa-build-update-reload";
const SERVICE_WORKER_UPDATE_TITLE = "A new version of Niakofa is available";

function hasReloadedForThisMismatch(buildCommit: string, serverCommit: string): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) === `${buildCommit}:${serverCommit}`;
  } catch {
    return false;
  }
}

function rememberReloadForThisMismatch(buildCommit: string, serverCommit: string): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, `${buildCommit}:${serverCommit}`);
  } catch {
    // Storage may be unavailable (for example, in a privacy-restricted context).
  }
}

export function useBuildUpdateNotice(): void {
  const { toast, toasts } = useToast();
  const promptedMismatch = useRef<string | null>(null);
  const serviceWorkerNoticeVisible = useRef(false);
  serviceWorkerNoticeVisible.current = toasts.some(
    ({ title }) => title === SERVICE_WORKER_UPDATE_TITLE,
  );

  useEffect(() => {
    const buildCommit = normalizeBuildCommit(import.meta.env.VITE_BUILD_COMMIT);
    if (!buildCommit) return;

    let active = true;
    let checking = false;

    const checkForUpdate = async () => {
      if (!active || checking || document.visibilityState === "hidden") return;
      checking = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/healthz", {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (!active || !isHealthCommitPayload(payload)) return;
        const serverCommit = normalizeBuildCommit(payload.commit);
        if (
          !serverCommit ||
          !shouldNotifyForBuildUpdate(buildCommit, serverCommit) ||
          hasReloadedForThisMismatch(buildCommit, serverCommit)
        ) {
          return;
        }

        const mismatch = `${buildCommit}:${serverCommit}`;
        if (promptedMismatch.current === mismatch || serviceWorkerNoticeVisible.current) return;

        // A waiting worker already has its own refresh notice and activation flow.
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.getRegistration("/");
            if (!active || registration?.waiting) return;
          } catch {
            // The commit check remains useful even if SW introspection is unavailable.
          }
        }
        if (!active || serviceWorkerNoticeVisible.current) return;
        promptedMismatch.current = mismatch;

        toast({
          title: "An update to Niakofa is ready",
          description: "Reload to get the latest version.",
          duration: Infinity,
          action: (
            <ToastAction
              altText="Reload Niakofa"
              onClick={() => {
                rememberReloadForThisMismatch(buildCommit, serverCommit);
                window.location.reload();
              }}
            >
              Update
            </ToastAction>
          ),
        });
      } catch {
        // Health checks are best-effort; an unavailable API must not affect app use.
      } finally {
        window.clearTimeout(timeout);
        checking = false;
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const onForeground = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [toast]);
}