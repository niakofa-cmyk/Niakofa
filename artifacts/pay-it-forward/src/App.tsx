import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NiaFab, NiaDrawer } from "@/components/NiaDrawer";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useWebSocket } from "@/lib/useWebSocket";
import { NotificationsDrawer, LiveNotification } from "@/components/NotificationsDrawer";
import React from "react";

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
  const { currentUser, myLocation, helperModeActive, activeRequestId, niaOpen, setNiaOpen, niaInitialMessage } = useAppContext();
  const [notifications, setNotifications] = React.useState<LiveNotification[]>([]);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const { requestPermissionAndSubscribe } = usePushNotifications(currentUser?.id ?? null);

  useWebSocket((event: any) => {
    const id = `${event.type}-${Date.now()}`;
    const time = new Date();
    let notif: LiveNotification | null = null;
    if (event.type === "new_request") {
      notif = { id, type: "new_request", time, title: "New request nearby", body: event.title ?? "Someone needs help" };
    } else if (event.type === "request_updated" && event.status === "completed") {
      notif = { id, type: "completed", time, title: "Help completed!", body: `Request #${event.id} marked complete` };
    } else if (event.type === "request_updated" && event.status === "claimed") {
      notif = { id, type: "helper_accepted", time, title: "Helper on the way", body: `${event.helper_name ?? "A helper"} accepted` };
    } else if (event.type === "pledge_paid") {
      const pp = event.payload as { user_id?: number; amount?: number };
      if (currentUser && pp.user_id === currentUser.id) {
        notif = { id, type: "pledge", time, title: "Pledge received!", body: `$${pp.amount?.toFixed(2) ?? "?"} pay-it-forward paid` };
      }
    }
    if (notif) {
      setNotifications(prev => [notif!, ...prev].slice(0, 50));
      if (document.hidden && Notification.permission === "granted") {
        new Notification(notif.title, { body: notif.body, icon: "/icon-192.png" });
      }
    }
  });

  React.useEffect(() => {
    if (!currentUser?.id) return;
    const key = `push_prompted_${currentUser.id}`;
    if (localStorage.getItem(key)) return;
    const t = setTimeout(() => {
      requestPermissionAndSubscribe().then(ok => { if (ok) localStorage.setItem(key, "1"); });
    }, 8000);
    return () => clearTimeout(t);
  }, [currentUser?.id]);

  const [isOnboarding] = useRoute("/onboarding");
  const hideNia = isOnboarding;

  return (
    <>
      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
      />
      <NiaFab onClick={() => setNiaOpen(true)} hidden={hideNia} />
      <NiaDrawer
        open={niaOpen}
        onClose={() => setNiaOpen(false)}
        userId={currentUser?.id ?? null}
        userName={currentUser?.name ?? null}
        userLocation={myLocation ? { lat: myLocation.lat, lon: myLocation.lng } : null}
        helperModeActive={helperModeActive}
        activeRequestId={activeRequestId}
        accountType={currentUser?.account_type ?? null}
        initialMessage={niaInitialMessage}
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
            <Toaster />
            {/* Nia floats above everything — available before login, on every screen */}
            <NiaWrapper />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
