import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/AppContext";
import { SpiritEnvironmentProvider } from "@/components/SpiritAnimal/SpiritEnvironmentProvider";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NiaFab, NiaDrawer } from "@/components/NiaDrawer";
import { useState, useEffect, lazy, Suspense } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useAnimationPreference } from "@/hooks/useAnimationPreference";

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
const DashboardPage        = lazy(() => import("@/pages/dashboard"));
const DiasporaDashboardPage = lazy(() => import("@/pages/diaspora-dashboard"));
const FamilyTreePage        = lazy(() => import("@/pages/family-tree"));
const DnaConnectionsPage   = lazy(() => import("@/pages/dna-connections"));
const HeritageCollectionsPage = lazy(() => import("@/pages/heritage-collections"));
const ResearchCenterPage    = lazy(() => import("@/pages/research-center"));
const PreserveCulturePage   = lazy(() => import("@/pages/preserve-culture"));
const LegacyTimelinePage    = lazy(() => import("@/pages/legacy-timeline"));
const LegacyHomePage        = lazy(() => import("@/pages/legacy-home"));
const LegacyAchievementsPage = lazy(() => import("@/pages/legacy-achievements"));
const LegacyStartPage       = lazy(() => import("@/pages/legacy-start"));
const LegacyChapterPage      = lazy(() => import("@/pages/legacy-chapter"));
const LegacyMapPage          = lazy(() => import("@/pages/legacy-map"));

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

function NiaGlobal() {
  const { currentUser, myLocation, helperModeActive, activeRequestId, userPlace, niaEnabled } = useAppContext();
  const [niaOpen, setNiaOpen] = useState(false);
  const [niaInitialMessage, setNiaInitialMessage] = useState<string | undefined>(undefined);
  const [isAdmin] = useRoute("/admin");
  const [isOnboarding] = useRoute("/onboarding");
  const [isMap] = useRoute("/");
  const [isStripeConnected] = useRoute("/wallet/connected");

  useEffect(() => {
    (window as any).openNia = () => {
      if (niaEnabled === true) setNiaOpen(true);
    };
    return () => { delete (window as any).openNia; };
  }, [niaEnabled]);

  useEffect(() => {
    if (!niaEnabled && niaOpen) setNiaOpen(false);
  }, [niaEnabled, niaOpen]);

  if (isAdmin || isOnboarding || isStripeConnected) return null;

  const showFloatingFab = !isMap;

  if (niaEnabled === null) return null;

  return (
    <>
      {showFloatingFab && niaEnabled === true && (
        <NiaFab onClick={() => setNiaOpen(true)} enabled={true} />
      )}

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
  useAnimationPreference();
  const [isActiveRequest] = useRoute("/request/:id");
  const [isTrackingRequest] = useRoute("/request/:id/track");
  const [isAdmin] = useRoute("/admin");
  const [isLogin] = useRoute("/login");
  const [isOnboarding] = useRoute("/onboarding");
  const [isStripeConnected] = useRoute("/wallet/connected");
  const [isAudioCircles] = useRoute("/audio-circles");
  const [isAudioCircleRoom] = useRoute("/audio-circle/:id");

  if (isAdmin) return (
    <Suspense fallback={<PageFallback />}>
      <AdminScreen />
    </Suspense>
  );

  if (!currentUser) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginScreen />
      </Suspense>
    );
  }

  const extUser = currentUser as (typeof currentUser & { approval_status?: string }) | null;
  if (extUser?.approval_status === 'pending' || extUser?.approval_status === 'denied') {
    return (
      <Suspense fallback={<PageFallback />}>
        <PendingApprovalScreen />
      </Suspense>
    );
  }

  const showShell = !isActiveRequest && !isTrackingRequest && !isAdmin && !isLogin &&
    !isOnboarding && !isStripeConnected && !isAudioCircles && !isAudioCircleRoom;

  return (
    <>
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
        <div className={showShell ? "lg:pl-60" : undefined}>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/login" component={LoginScreen} />
            <Route path="/onboarding" component={OnboardingScreen} />
            <Route path="/helper/:id" component={HelperProfileScreen} />
            <Route path="/request/:id/view" component={RequestDetailScreen} />
            <Route path="/wallet/connected" component={StripeConnectedScreen} />
            <Route path="/" component={MapScreen} />
            <Route path="/dashboard" component={DashboardPage} />
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
            <Route path="/legacy/achievements" component={LegacyAchievementsPage} />
            <Route path="/legacy/start" component={LegacyStartPage} />
            <Route path="/legacy/chapter/:chapterId" component={LegacyChapterPage} />
            <Route path="/legacy/map/:familyId" component={LegacyMapPage} />
            <Route path="/legacy/map" component={LegacyMapPage} />
            <Route path="/legacy/play" component={LegacyHomePage} />
            <Route path="/legacy" component={LegacyHomePage} />
            <Route path="/diaspora" component={DiasporaDashboardPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
        </div>
      </ErrorBoundary>
      {showShell && <BottomNav />}
      {showShell && <DesktopSidebar />}
    </>
  );
}

function FocusRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
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

function AppContent() {
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
  if (pathname === "/impact" || pathname.startsWith("/impact/")) {
    return (
      <Suspense fallback={<PageFallback />}>
        <CountyImpactPage />
      </Suspense>
    );
  }
  if (pathname === "/bird-test") {
    return (
      <Suspense fallback={<PageFallback />}>
        <BirdTestPage />
      </Suspense>
    );
  }
  return (
    <>
      <FocusRefresh />
      <AppShell />
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
