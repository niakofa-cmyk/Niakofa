import "./i18n";
import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Spinner } from "@/components/ui/spinner";

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
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
