import { Switch, Route, Router as WouterRouter, useRoute, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NiaFab, NiaDrawer } from "@/components/NiaDrawer";
import { useState, useEffect } from "react";

import MapScreen from "@/pages/map";
import NewRequestScreen from "@/pages/request-new";
import ActiveRequestScreen from "@/pages/request-active";
import ProfileScreen from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import WalletScreen from "@/pages/wallet";
import CommunityScreen from "@/pages/community";
import AdminScreen from "@/pages/admin";
import AdminAnalyticsDashboard from "@/pages/admin-analytics";
import NotFound from "@/pages/not-found";
import RequesterTrackingScreen from "@/pages/request-track";
import LoginScreen from "@/pages/login";
import HelperProfileScreen from "@/pages/helper-profile";
import RequestDetailScreen from "@/pages/request-detail";
import OnboardingScreen from "@/pages/onboarding";
import StripeConnectedScreen from "@/pages/stripe-connected";
import HelperDashboardScreen from "@/pages/helper-dashboard";
import HelperOnboardingScreen from "@/pages/helper-onboarding";
import PendingApprovalScreen from "@/pages/pending-approval";
import RecurringScreen from "@/pages/recurring";
import BusinessApplyScreen from "@/pages/business-apply";
import GovSponsorApplyScreen from "@/pages/gov-sponsor-apply";
import StatusPage from "@/pages/status";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

// NiaGlobal — mounts Nia FAB + Drawer globally.
// niaEnabled comes from AppContext (polled every 60s + instant WS) — there is
// no local copy of that state here. One source of truth, zero drift.
//
// Bug fixed: previously `if (niaEnabled === null || hideNiaFab) return null`
// bailed out of the entire component on the map route, which meant
// <NiaDrawer> was never in the tree, so window.openNia() from TopBar's
// center orb fired but nothing responded. Now only the floating FAB div is
// hidden on map — the Drawer stays mounted everywhere, hard-gated on
// niaEnabled === true so it can never open while disabled.
function NiaGlobal() {
  const { currentUser, myLocation, helperModeActive, activeRequestId, userPlace, niaEnabled } = useAppContext();
  const [niaOpen, setNiaOpen] = useState(false);
  const [niaInitialMessage, setNiaInitialMessage] = useState<string | undefined>(undefined);
  const [isAdmin] = useRoute("/admin");
  const [isOnboarding] = useRoute("/onboarding");
  const [isMap] = useRoute("/");
  const [isStripeConnected] = useRoute("/wallet/connected");

  // Expose openNia globally so TopBar's center Nia orb can trigger the drawer.
  // Only actually opens when niaEnabled is true — the orb tap on map is
  // the entry point; the gate is enforced here and in the Drawer's open prop.
  useEffect(() => {
    (window as any).openNia = () => {
      if (niaEnabled === true) setNiaOpen(true);
    };
    return () => { delete (window as any).openNia; };
  }, [niaEnabled]);

  // Close drawer instantly if admin disables Nia while it's open.
  useEffect(() => {
    if (!niaEnabled && niaOpen) setNiaOpen(false);
  }, [niaEnabled, niaOpen]);

  // On admin / onboarding / stripe-connected, hide everything.
  if (isAdmin || isOnboarding || isStripeConnected) return null;

  // On the map screen: the TopBar renders its own Nia orb (wired to
  // window.openNia). We still need <NiaDrawer> mounted here so that orb
  // can actually open it — but we skip the duplicate floating FAB div.
  const showFloatingFab = !isMap;

  // null = still loading — don't flash the FAB before the first poll resolves.
  if (niaEnabled === null) return null;

  return (
    <>
      {/* Floating FAB — shown on all non-map screens, hidden on map to avoid
          double-orb with TopBar's own Nia button. */}
      {showFloatingFab && (
        <div style={{
          position: "fixed",
          top: "max(8px, env(safe-area-inset-top))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9997,
          pointerEvents: "auto",
        }}>
          {niaEnabled
            ? <NiaFab onClick={() => setNiaOpen(true)} enabled={true} />
            : <NiaFab onClick={() => {}} enabled={false} dormant />
          }
        </div>
      )}

      {/* NiaDrawer — always mounted (so window.openNia from TopBar works on
          map), but open prop is hard-gated on niaEnabled===true so the drawer
          can never actually appear while Nia is disabled. */}
      <NiaDrawer
        open={niaEnabled === true && niaOpen}
        onClose={() => { setNiaOpen(false); setNiaInitialMessage(undefined); }}
        initialMessage={niaInitialMessage}
        userId={currentUser?.id ?? null}
        userName={currentUser?.name ?? null}
        userLocation={myLocation ? { lat: myLocation.lat, lon: myLocation.lng } : null}
        userCity={userPlace?.city ?? null}
        userCounty={userPlace?.county ?? null}
        userState={userPlace?.state ?? null}
        helperModeActive={helperModeActive}
        activeRequestId={activeRequestId}
        accountType={currentUser?.account_type ?? null}
      />
    </>
  );
}

function AppShell() {
  const { currentUser } = useAppContext();
  const [isActiveRequest] = useRoute("/request/:id");
  const [isTrackingRequest] = useRoute("/request/:id/track");
  const [isAdmin] = useRoute("/admin");
  const [isLogin] = useRoute("/login");
  const [isOnboarding] = useRoute("/onboarding");
  const [isStripeConnected] = useRoute("/wallet/connected");

  // Admin page has its own auth — don't redirect to login
  if (isAdmin) return <AdminScreen />;

  // Show login/register screen if no authenticated user
  if (!currentUser) {
    return <LoginScreen />;
  }
  // Redirect unapproved users to pending-approval screen
  const extUser = currentUser as (typeof currentUser & { approval_status?: string }) | null;
  if (extUser?.approval_status === 'pending' || extUser?.approval_status === 'denied') {
    return <PendingApprovalScreen />;
  }


  return (
    <>
      <Switch>
        <Route path="/login" component={LoginScreen} />
        <Route path="/onboarding" component={OnboardingScreen} />
        <Route path="/helper/:id" component={HelperProfileScreen} />
        <Route path="/request/:id/view" component={RequestDetailScreen} />
        <Route path="/wallet/connected" component={StripeConnectedScreen} />
        <Route path="/" component={MapScreen} />
        <Route path="/community" component={CommunityScreen} />
        <Route path="/request/new" component={NewRequestScreen} />
        <Route path="/request/:id/track" component={RequesterTrackingScreen} />
        <Route path="/request/:id" component={ActiveRequestScreen} />
        <Route path="/wallet" component={WalletScreen} />
        <Route path="/profile" component={ProfileScreen} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/admin" component={AdminScreen} />
        <Route path="/helper-dashboard" component={HelperDashboardScreen} />
        <Route path="/helper-onboarding" component={HelperOnboardingScreen} />
        <Route path="/pending-approval" component={PendingApprovalScreen} />
        <Route path="/recurring" component={RecurringScreen} />
        <Route path="/admin/analytics" component={AdminAnalyticsDashboard} />
        <Route path="/business/apply" component={BusinessApplyScreen} />
        <Route path="/gov-sponsor/apply" component={GovSponsorApplyScreen} />
        <Route component={NotFound} />
      </Switch>
      {!isActiveRequest && !isTrackingRequest && !isAdmin && !isLogin && !isOnboarding && !isStripeConnected && <BottomNav />}
    </>
  );
}

// Renders either the public status page (no auth) or the main app shell.
// Uses window.location.pathname directly to avoid Wouter base-stripping
// ambiguity — the raw browser URL is always reliable for this one check.
function AppContent() {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  if (pathname === "/status" || pathname.endsWith("/status")) {
    return <StatusPage />;
  }
  return (
    <>
      <AppShell />
      {/* NiaGlobal: Nia FAB + Drawer globally mounted, polls nia-status */}
      <NiaGlobal />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppContent />
            </WouterRouter>
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
