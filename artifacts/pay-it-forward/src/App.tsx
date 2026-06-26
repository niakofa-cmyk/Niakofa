import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { NiaDrawer, NiaFab } from "@/components/NiaDrawer";
import { useState, useEffect } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import MapScreen from "@/pages/map";
import NewRequestScreen from "@/pages/request-new";
import ActiveRequestScreen from "@/pages/request-active";
import ProfileScreen from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import WalletScreen from "@/pages/wallet";
import CommunityScreen from "@/pages/community";
import AdminScreen from "@/pages/admin";
import NotFound from "@/pages/not-found";
import RequesterTrackingScreen from "@/pages/request-track";
import LoginScreen from "@/pages/login";
import HelperProfileScreen from "@/pages/helper-profile";
import RequestDetailScreen from "@/pages/request-detail";
import OnboardingScreen from "@/pages/onboarding";
import StripeConnectedScreen from "@/pages/stripe-connected";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function NiaWrapper() {
  const [niaOpen, setNiaOpen] = useState(false);
  const [niaEnabled, setNiaEnabled] = useState(true);
  const API_BASE = import.meta.env.VITE_API_BASE ?? "";

  // Poll /admin/nia-status every 30s so the FAB disappears within half a minute of a toggle
  useEffect(() => {
    const check = () =>
      fetch(`${API_BASE}/api/admin/nia-status`)
        .then((r) => r.json())
        .then((d: { enabled: boolean }) => setNiaEnabled(d.enabled))
        .catch(() => {/* non-fatal */});
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [API_BASE]);

  if (!niaEnabled) return null;
  return (
    <>
      <NiaFab onClick={() => setNiaOpen(true)} />
      <NiaDrawer open={niaOpen} onClose={() => setNiaOpen(false)} />
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

  // Admin page has its own auth — don't redirect it to login
  if (isAdmin) return <AdminScreen />;

  // Show login/register screen if no authenticated user is stored
  if (!currentUser) {
    return <LoginScreen />;
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
            </WouterRouter>
            <NiaWrapper />
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
