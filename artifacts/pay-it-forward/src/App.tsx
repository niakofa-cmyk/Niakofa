import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

// NiaGlobal — mounts Nia FAB + Drawer globally, polls admin kill-switch every 60s
function NiaGlobal() {
  const { currentUser, myLocation, helperModeActive, activeRequestId } = useAppContext();
  const [niaOpen, setNiaOpen] = useState(false);
  // Expose openNia globally so TopBar's center Nia orb can trigger the drawer
  useEffect(() => { (window as any).openNia = () => setNiaOpen(true); return () => { delete (window as any).openNia; }; }, []);
  const [niaEnabled, setNiaEnabled] = useState(true); // optimistic: show Nia immediately
  const [niaInitialMessage, setNiaInitialMessage] = useState<string | undefined>(undefined);
  const [isAdmin] = useRoute("/admin");
  const [isOnboarding] = useRoute("/onboarding");
  const [isMap] = useRoute("/");
  const [isStripeConnected] = useRoute("/wallet/connected");

  // Poll /admin/nia-status every 60s — admin kill-switch takes effect without reload
  useEffect(() => {
    let cancelled = false;
    async function checkNiaStatus() {
      try {
        const res = await fetch("/api/admin/nia-status");
        if (res.ok) {
          const data = await res.json() as { enabled: boolean };
          if (!cancelled) setNiaEnabled(data.enabled);
        }
      } catch { /* non-critical — keep showing Nia by default */ }
    }
    checkNiaStatus();
    const interval = setInterval(checkNiaStatus, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Hide on screens where Nia FAB would conflict with layout
  const hideNiaFab = isAdmin || isOnboarding || isStripeConnected;
  if (!niaEnabled || hideNiaFab) return null;

  return (
    <>
      {/* Nia FAB — floats top-center on non-map screens */}
      <div style={{
        position: "fixed",
        top: "max(8px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9997,
        pointerEvents: "auto",
      }}>
        <NiaFab onClick={() => setNiaOpen(true)} />
      </div>
      <NiaDrawer
        open={niaOpen}
        onClose={() => { setNiaOpen(false); setNiaInitialMessage(undefined); }}
        initialMessage={niaInitialMessage}
        userId={currentUser?.id ?? null}
        userName={currentUser?.name ?? null}
        userLocation={myLocation ? { lat: myLocation.lat, lon: myLocation.lng } : null}
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
        <Route component={NotFound} />
      </Switch>
      {!isActiveRequest && !isTrackingRequest && !isAdmin && !isLogin && !isOnboarding && !isStripeConnected && <BottomNav />}
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
              <AppShell />
              {/* NiaGlobal: Nia FAB + Drawer globally mounted, polls nia-status */}
              <NiaGlobal />
            </WouterRouter>
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
