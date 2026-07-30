import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { SpiritEnvironmentProvider } from "@/components/SpiritAnimal/SpiritEnvironmentProvider";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NiaFab, NiaDrawer } from "@/components/NiaDrawer";
import { useState, useEffect, lazy, Suspense } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useAnimationPreference } from "@/hooks/useAnimationPreference";

// ── Route-level lazy loading ───────────────────────────────────────────────
// Each page is loaded on-demand, splitting the monolithic bundle into many
// small per-route chunks. This keeps the initial JS payload small and lets
// the browser cache each page independently.
//
// MapScreen is NOT lazy — it is the default route and must paint immediately
// on first load to avoid a blank screen flash.
import MapScreen from "@/pages/map";

const NewRequestScreen     = lazy(() => import("@/pages/request-new"));
const ActiveRequestScreen  = lazy(() => import("@/pages/request-active"));
const ProfileScreen        = lazy(() => import("@/pages/profile"));
const SettingsPage         = lazy(() => import("@/pages/settings"));
const WalletScreen         = lazy(() => import("@/pages/wallet"));
const CommunityScreen      = lazy(() => import("@/pages/community"));
const AdminScreen          = lazy(() => import("@/pages/admin"));
const AdminAnalyticsDashboard = lazy(() => import("@/pages/admin-analytics"));
const NotFound             = lazy(() => import("@/pages/not-found"));
const RequesterTrackingScreen = lazy(() => import("@/pages/request-track"));
const LoginScreen          = lazy(() => import("@/pages/login"));
const HelperProfileScreen  = lazy(() => import("@/pages/helper-profile"));
const RequestDetailScreen  = lazy(() => import("@/pages/request-detail"));
const OnboardingScreen     = lazy(() => import("@/pages/onboarding"));
const StripeConnectedScreen = lazy(() => import("@/pages/stripe-connected"));
const HelperDashboardScreen = lazy(() => import("@/pages/helper-dashboard"));
const HelperOnboardingScreen = lazy(() => import("@/pages/helper-onboarding"));
const PendingApprovalScreen = lazy(() => import("@/pages/pending-approval"));
const RecurringScreen      = lazy(() => import("@/pages/recurring"));
const BusinessApplyScreen  = lazy(() => import("@/pages/business-apply"));
const GovSponsorApplyScreen = lazy(() => import("@/pages/gov-sponsor-apply"));
const CivicPortalPage      = lazy(() => import("@/pages/civic-portal"));
const CivicNeedsPage       = lazy(() => import("@/pages/civic-needs"));
const StatusPage           = lazy(() => import("@/pages/status"));
const RequestsBrowsePage   = lazy(() => import("@/pages/requests-browse"));
const AudioCirclesScreen = lazy(() => import("@/pages/audio-circles"));
const AudioCircleRoomScreen = lazy(() => import("@/pages/audio-circle-room"));
const CountyImpactPage     = lazy(() => import("@/pages/county-impact"));
const GlobePage            = lazy(() => import("@/pages/globe"));
const HubLeaderDashboard   = lazy(() => import("@/pages/hub-leader"));
const BirdTestPage         = lazy(() => import("@/pages/bird-test"));
const CivicTaskNavPage     = lazy(() => import("@/pages/civic-task-nav"));
const FamilySpacesPage     = lazy(() => import("@/pages/family-spaces"));
const FamilyVaultPage      = lazy(() => import("@/pages/family-vault"));
const FamilyMemoryPage     = lazy(() => import("@/pages/family-memory"));
const DiasporaDashboardPage = lazy(() => import("@/pages/diaspora-dashboard"));
const FamilyTreePage        = lazy(() => import("@/pages/family-tree"));
const DnaConnectionsPage   = lazy(() => import("@/pages/dna-connections"));
const HeritageCollectionsPage = lazy(() => import("@/pages/heritage-collections"));
const ResearchCenterPage    = lazy(() => import("@/pages/research-center"));
const PreserveCulturePage   = lazy(() => import("@/pages/preserve-culture"));
const LegacyTimelinePage    = lazy(() => import("@/pages/legacy-timeline"));

// Minimal spinner shown while a lazy chunk is loading.
// Kept intentionally simple — just a centred, low-opacity dot so the
// transition is barely perceptible on fast connections.
function PageFallback() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background-primary, #0e1111)",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--color-text-tertiary, #444)",
          animation: "pulse 1.2s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// ── Data-loss fix (app-wide) ────────────────────────────────────────────────
// Two defaults changed here to stop the "my data disappeared" reports that
// were traced to how React Query behaves by default, not to anything
// actually being deleted server-side:
//
// 1. `placeholderData: keepPreviousData` — ANY query whose params or
//    queryKey change (switching helper/community mode, changing a filter,
//    a moving GPS center, paginating) used to render `data: undefined` for
//    one render while the new fetch resolved. Every page that destructures
//    that as `const { data: foo = [] } = useSomeQuery(...)` then rendered an
//    empty list for a moment — request cards, Circles, civic needs, wallet
//    ledger rows, all of it — which reads to a user as their data vanishing.
//    This makes every query keep showing its last successful result until
//    the *new* one actually arrives, instead of blanking in between.
//
// 2. `gcTime: 10 * 60 * 1000` (was the 5-minute library default) — a user
//    bouncing from the map to their profile, wallet, or a civic-needs page
//    and back within a few minutes was enough for the map's cached requests/
//    helpers to be garbage-collected while unmounted, forcing a from-scratch
//    refetch (and another empty-then-populated flash) on return. Ten minutes
//    comfortably covers normal page-to-page navigation without keeping
//    truly-abandoned data around indefinitely.
//
// Individual queries can still opt out (pass their own `placeholderData` or
// `gcTime` in their own `query` options) if a specific screen genuinely needs
// a hard reset — none currently do.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      placeholderData: keepPreviousData,
    },
  },
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
      {/* Floating FAB — position:fixed relative to viewport. No wrapping
          transform div: transforms create a new containing block for fixed
          children (CSS spec), which would break the orb positioning. Shown on
          all non-map screens; on map the TopBar renders its own Nia orb. */}
      {showFloatingFab && niaEnabled === true && (
        <NiaFab onClick={() => setNiaOpen(true)} enabled={true} />
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
  // Apply stored bird-animation preference to <html> on mount so the CSS gate
  // (html:not([data-bird-anim="enabled"])) is set before first paint.
  useAnimationPreference();
  const [isActiveRequest] = useRoute("/request/:id");
  const [isTrackingRequest] = useRoute("/request/:id/track");
  const [isAdmin] = useRoute("/admin");
  const [isLogin] = useRoute("/login");
  const [isOnboarding] = useRoute("/onboarding");
  const [isStripeConnected] = useRoute("/wallet/connected");
  // Circles pages manage their own full-screen layout — suppress the global bottom nav
  const [isAudioCircles] = useRoute("/audio-circles");
  const [isAudioCircleRoom] = useRoute("/audio-circle/:id");

  // Admin page has its own auth — don't redirect to login
  if (isAdmin) return (
    <Suspense fallback={<PageFallback />}>
      <AdminScreen />
    </Suspense>
  );

  // Show login/register screen if no authenticated user
  if (!currentUser) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginScreen />
      </Suspense>
    );
  }

  // Redirect unapproved users to pending-approval screen
  const extUser = currentUser as (typeof currentUser & { approval_status?: string }) | null;
  if (extUser?.approval_status === 'pending' || extUser?.approval_status === 'denied') {
    return (
      <Suspense fallback={<PageFallback />}>
        <PendingApprovalScreen />
      </Suspense>
    );
  }

  return (
    <>
      {/* Per-page ErrorBoundary: if one page's render throws, the shell
          (BottomNav, NiaGlobal) stays intact. The user sees a page-level
          "Something went wrong" card rather than a full blank screen, and
          can tap any nav item to escape to a working route. */}
      <ErrorBoundary
        fallback={
          <div className="min-h-[60dvh] flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-lg font-black mb-2">Page crashed</h2>
            <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">
              This page hit an unexpected error. Use the navigation below to go somewhere else, or reload the app.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-primary-foreground font-black rounded-xl px-6 py-2.5 text-sm"
            >
              Reload
            </button>
          </div>
        }
      >
        <Suspense fallback={<PageFallback />}>
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
            <Route path="/bird-test" component={BirdTestPage} />
            <Route path="/helper-dashboard" component={HelperDashboardScreen} />
            <Route path="/helper-onboarding" component={HelperOnboardingScreen} />
            <Route path="/pending-approval" component={PendingApprovalScreen} />
            <Route path="/recurring" component={RecurringScreen} />
            <Route path="/admin/analytics" component={AdminAnalyticsDashboard} />
            <Route path="/business/apply" component={BusinessApplyScreen} />
            <Route path="/gov-sponsor/apply" component={GovSponsorApplyScreen} />
            <Route path="/civic-portal" component={CivicPortalPage} />
            <Route path="/audio-circles" component={AudioCirclesScreen} />
            <Route path="/audio-circle/:id" component={AudioCircleRoomScreen} />
            <Route path="/civic-task-nav/:needId" component={CivicTaskNavPage} />
            <Route path="/civic-needs" component={CivicNeedsPage} />
            <Route path="/requests" component={RequestsBrowsePage} />
            <Route path="/hub-leader/:id" component={HubLeaderDashboard} />
            <Route path="/family/:id/memory/:memoryId" component={FamilyMemoryPage} />
            <Route path="/family/:id" component={FamilyVaultPage} />
            <Route path="/family" component={FamilySpacesPage} />
            <Route path="/globe" component={GlobePage} />
            <Route path="/diaspora/family" component={FamilySpacesPage} />
            <Route path="/diaspora/vault/:familyId" component={FamilyVaultPage} />
            <Route path="/diaspora/tree" component={FamilyTreePage} />
            <Route path="/diaspora/tree/:familyId" component={FamilyTreePage} />
            <Route path="/diaspora/dna" component={DnaConnectionsPage} />
            <Route path="/diaspora/heritage" component={HeritageCollectionsPage} />
            <Route path="/diaspora/heritage/globe" component={GlobePage} />
            <Route path="/diaspora/research" component={ResearchCenterPage} />
            <Route path="/diaspora/preserve" component={PreserveCulturePage} />
            <Route path="/diaspora/timeline" component={LegacyTimelinePage} />
            <Route path="/diaspora" component={DiasporaDashboardPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
      {!isActiveRequest && !isTrackingRequest && !isAdmin && !isLogin && !isOnboarding && !isStripeConnected && !isAudioCircles && !isAudioCircleRoom && <BottomNav />}
    </>
  );
}

// FocusRefresh — re-fetches stale queries when the user returns to the tab.
// This implements the "refresh on focus / visibility change" pattern from the
// Document 1 global-cache proposal, but uses React Query's invalidateQueries
// instead of a parallel fetch/state layer — cleaner and interops with the
// existing keepPreviousData/gcTime defaults so data never vanishes while
// refreshing.
function FocusRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      // Only invalidate when the tab is actually visible — avoids useless
      // network churn if the user just focused a popup or dev tools.
      if (!document.hidden) {
        void queryClient.invalidateQueries();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [queryClient]);
  return null;
}

// Renders either the public status page (no auth) or the main app shell.
// Uses window.location.pathname directly to avoid Wouter base-stripping
// ambiguity — the raw browser URL is always reliable for this one check.
function AppContent() {
  // Register the service worker and show a one-click refresh toast when a
  // new version is available. Lives here (inside QueryClientProvider + AppProvider)
  // so it can access the app's existing Toaster context.
  useServiceWorkerUpdate();

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  if (pathname === "/status" || pathname.endsWith("/status")) {
    return (
      <Suspense fallback={<PageFallback />}>
        <StatusPage />
      </Suspense>
    );
  }
  // Public county impact dashboard — accessible without authentication
  if (pathname === "/impact" || pathname.startsWith("/impact/")) {
    return (
      <Suspense fallback={<PageFallback />}>
        <CountyImpactPage />
      </Suspense>
    );
  }
  // SankofaBird visual test harness — no auth required, dev/QA tool
  if (pathname === "/bird-test") {
    return (
      <Suspense fallback={<PageFallback />}>
        <BirdTestPage />
      </Suspense>
    );
  }
  return (
    <>
      {/* FocusRefresh: invalidates stale queries when the user returns to the
          tab, implementing the "refresh on focus" pattern without a parallel
          state layer — uses the existing QueryClient so keepPreviousData
          ensures data never vanishes during the refetch. */}
      <FocusRefresh />
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
            <SpiritEnvironmentProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AppContent />
              </WouterRouter>
            </SpiritEnvironmentProvider>
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
