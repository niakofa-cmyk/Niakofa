import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Detects when a new service worker installs in the background and shows a
 * one-click "New version available — Refresh" toast.
 *
 * Also owns the SW registration so main.tsx doesn't need the bare
 * navigator.serviceWorker.register() call any more.
 *
 * Flow:
 *   1. register /sw.js
 *   2. On updatefound → installing → installed (with an existing controller,
 *      so this is an update, not a first-ever install) → show toast
 *   3. User clicks Refresh → postMessage SKIP_WAITING → sw.js skipWaiting()
 *   4. controllerchange fires → window.location.reload()
 *
 * Reload-loop guard: reloadingInProgress flag — controllerchange can fire on
 * the initial SW activation too; we only reload when we triggered skipWaiting.
 */
export function useServiceWorkerUpdate() {
  const { toast } = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloadingInProgress = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            // Only show the toast when a *new* version installs while another
            // SW is already controlling the page — i.e. this is an update, not
            // the very first installation.
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              toast({
                title: "A new version of Niakofa is available",
                description: "Refresh to get the latest updates.",
                // IMPORTANT: must be Infinity, NOT 0. In Radix Toast the duration
                // prop is evaluated as `durationProp || context.duration` — since 0
                // is falsy in JS, duration: 0 silently falls through to the
                // provider default (~5 s) and the toast auto-dismisses before the
                // user can click Refresh. Infinity is the correct sentinel for
                // "never auto-dismiss".
                duration: Infinity,
                action: (
                  <ToastAction
                    altText="Refresh"
                    onClick={() => {
                      if (reloadingInProgress) return;
                      reloadingInProgress = true;
                      // Tell the waiting worker to skip its waiting phase and
                      // take control. sw.js already listens for this message.
                      newWorker.postMessage({ type: "SKIP_WAITING" });
                    }}
                  >
                    Refresh
                  </ToastAction>
                ),
              });
            }
          });
        });
      })
      .catch(() => {});

    // When the new SW takes control, reload so the user gets the latest JS.
    // The reloadingInProgress guard prevents a reload on the initial activation
    // (controllerchange fires then too) or any unrelated controller swap.
    const onControllerChange = () => {
      if (reloadingInProgress) {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [toast]);
}
