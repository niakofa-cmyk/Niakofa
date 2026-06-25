import React, { lazy, Suspense, useState, useEffect } from "react";
import "./i18n";

import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Spinner } from "@/components/ui/spinner";
import { NiaFab, NiaDrawer } from "@/components/NiaDrawer";
import { NotificationsDrawer, LiveNotification } from "@/components/NotificationsDrawer";
import { OfflineBanner } from "@/components/OfflineBanner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useWebSocket } from "@/lib/useWebSocket";

const MapScreen = lazy(() => import("@/pages/map"));
const NewRequestScreen = lazy(() => import("@/pages/request-new"));
const ActiveRequestScreen = lazy(() => import("@/pages/request-active"));
const ProfileScreen = lazy(() => import("@/pages/profile"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const WalletScreen = lazy(() => import("@/pages/wallet"));
const CommunityScreen = lazy(() => import("@/pages/community"));
const AdminScreen = lazy(() => import("@/pages/admin"));
const NotFound = lazy(() => import("@/pages/not-found"));
const RequesterTrackingScreen = lazy(() => import("@/pages/request-track"));
const LoginScreen = lazy(() => import("@/pages/login"));
const PendingApprovalScreen = lazy(() => import("@/pages/pending-approval"));
const HelperProfileScreen = lazy(() => import("@/pages/helper-profile"));
const RequestDetailScreen = lazy(() => import("@/pages/request-detail"));
const OnboardingScreen = lazy(() => import("@/pages/onboarding"));
const StripeConnectedScreen = lazy(() => import("@/pages/stripe-connected"));
const HelperDashboardScreen = lazy(() => import("@/pages/helper-dashboard"));
const RecurringScreen = lazy(() => import("@/pages/recurring"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner className="w-8 h-8 text-primary" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

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

  // Lock out anyone whose account hasn't been admin-approved yet — applies
  // to every account type (individual, business, sponsor). The API enforces
  // this server-side regardless; this just gives them a clear explanation
  // instead of a wall of broken-looking 403s.
  if (currentUser.approval_status === "pending" || currentUser.approval_status === "denied") {
    return (
      <Suspense fallback={<PageLoader />}>
        <PendingApprovalScreen />
      </Suspense>
    );
  }

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/login" component={LoginScreen} />
          <Route path="/onboarding" component={OnboardingScreen} />
          <Route path="/helper/:id" component={HelperProfileScreen} />
          <Route path="/request/:id/view" component={RequestDetailScreen} />
          <Route path="/wallet/connected" component={StripeConnectedScreen} />
          <Route path="/helper-dashboard" component={HelperDashboardScreen} />
          <Route path="/" component={MapScreen} />
          <Route path="/community" component={CommunityScreen} />
          <Route path="/request/new" component={NewRequestScreen} />
          <Route path="/request/:id/track" component={RequesterTrackingScreen} />
          <Route path="/request/:id" component={ActiveRequestScreen} />
          <Route path="/wallet" component={WalletScreen} />
          <Route path="/profile" component={ProfileScreen} />
          <Route path="/recurring" component={RecurringScreen} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/admin" component={AdminScreen} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      {!isActiveRequest && !isTrackingRequest && !isAdmin && !isLogin && !isOnboarding && !isStripeConnected && <BottomNav />}
    </>
  );
}

function NiaWrapper() {
  const { currentUser, myLocation, helperModeActive, activeRequestId, niaOpen, setNiaOpen, niaInitialMessage, lastViewedMatchReasons } = useAppContext();
  const [notifications, setNotifications] = React.useState<LiveNotification[]>([]);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const { requestPermissionAndSubscribe } = usePushNotifications(currentUser?.id ?? null);

  // Phase 8B: WebSocket events → live notifications
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
      notif = { id, type: "pledge", time, title: "Pledge received!", body: `$${event.amount ?? "?"} pay-it-forward paid` };
    } else if (event.type === "pledge_scheduled") {
      notif = { id, type: "pledge_scheduled", time, title: "Recurring pledge set up", body: "Community thanks you" };
    }
    if (notif) {
      setNotifications(prev => [notif!, ...prev].slice(0, 50));
      if (document.hidden && Notification.permission === "granted") {
        new Notification(notif.title, { body: notif.body, icon: "/icon-192.png" });
      }
    }
  });

  // Phase 8B: Auto-prompt push permission once per user, 8s after login
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
  // The floating NiaFab is hidden on login (the login screen's own Nia orb acts
  // as the tap target there) and on onboarding (full-screen multi-step form).
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
        matchReasons={lastViewedMatchReasons}
      />
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
            {/* Nia is always available — before login, on every screen */}
            <NiaWrapper />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
