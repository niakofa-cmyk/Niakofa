import { useEffect } from "react";
import { useLocation } from "wouter";
import { normalizeDiasporaPath } from "@/lib/diaspora/diasporaRoutes";

export default function DiasporaLegacyRedirectPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const target = normalizeDiasporaPath(window.location.pathname, window.location.search) ?? "/diaspora";
    navigate(target, { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-[50dvh] items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Opening the Diaspora Globe…</p>
    </div>
  );
}