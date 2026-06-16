import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { useGetRequest, useGetRoute, useCompleteRequest, useMarkEnRoute, useMarkArrived, getGetRequestQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, DollarSign, Star, Navigation2, Clock, AlertTriangle, Share2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import { InAppChat } from "@/components/InAppChat";
import { TipModal } from "@/components/TipModal";
import { useWebSocket } from "@/lib/useWebSocket";
import { motion } from "framer-motion";

const ARRIVAL_THRESHOLD_METERS = 80;
const OFF_ROUTE_THRESHOLD_METERS = 150;
const SAFETY_TIMER_SECONDS = 1200; // 20 minutes

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse ETA text into seconds for countdown
function parseEtaSeconds(etaText: string): number {
  const minMatch = etaText.match(/(\d+)\s*min/i);
  const hrMatch = etaText.match(/(\d+)\s*hr/i);
  let s = 0;
  if (hrMatch) s += parseInt(hrMatch[1]) * 3600;
  if (minMatch) s += parseInt(minMatch[1]) * 60;
  return s || 0;
}

// Flat-earth point-to-segment distance in meters (accurate enough for navigation)
function ptToSegDist(
  lat: number, lng: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 111320;
  const cosLat = Math.cos(lat * (Math.PI / 180));
  const dy = (lat2 - lat1) * R;
  const dx = (lng2 - lng1) * R * cosLat;
  const py = (lat - lat1) * R;
  const px = (lng - lng1) * R * cosLat;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;
  const rx = px - t * dx;
  const ry = py - t * dy;
  return Math.sqrt(rx * rx + ry * ry);
}

// Distance from point to nearest point on route polyline
function distToRoute(
  lat: number, lng: number,
  geometry: { type: string; coordinates: number[][] } | null,
): number {
  if (!geometry?.coordinates?.length) return 0;
  let min = Infinity;
  const coords = geometry.coordinates;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const d = ptToSegDist(lat, lng, lat1, lng1, lat2, lng2);
    if (d < min) min = d;
  }
  return min;
}

// Step advancement: find which step the user is currently on based on distance remaining
function computeCurrentStep(
  lat: number, lng: number,
  steps: { distance_meters: number }[],
  destLat: number, destLng: number,
): number {
  const totalDistToDest = distanceMeters(lat, lng, destLat, destLng);
  let cumulative = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    cumulative += steps[i].distance_meters;
    if (cumulative >= totalDistToDest) {
      return Math.max(0, i);
    }
  }
  return 0;
}

export default function ActiveRequestScreen() {
  const [, params] = useRoute("/request/:id");
  const [, setLocation] = useLocation();
  const { currentUser, myLocation } = useAppContext();
  const queryClient = useQueryClient();
  const requestId = parseInt(params?.id || "0", 10);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [autoArrived, setAutoArrived] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [etaCountdown, setEtaCountdown] = useState(0);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [safetyAlertShown, setSafetyAlertShown] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipShown, setTipShown] = useState(false);

  const enRouteRef = useRef(false);
  const offRouteCooldownRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());

  const { data: request, isLoading: requestLoading } = useGetRequest(requestId, {
    query: { enabled: !!requestId, queryKey: getGetRequestQueryKey(requestId) }
  });

  const routeParams = {
    start_lat: myLocation?.lat || 0,
    start_lng: myLocation?.lng || 0,
    end_lat: request?.lat || 0,
    end_lng: request?.lng || 0,
  };
  const { data: routeData } = useGetRoute(routeParams, {
    query: {
      enabled: !!myLocation && !!request,
      // Refetch every 15s normally; when off-route, the key changes to force reroute
      refetchInterval: isOffRoute ? 5000 : 15000,
      queryKey: getGetRouteQueryKey(routeParams),
    }
  });

  const completeMutation = useCompleteRequest();
  const enRouteMutation = useMarkEnRoute();
  const arrivedMutation = useMarkArrived();

  // Trip timer
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Safety timer — gentle check-in after 20 minutes
  useEffect(() => {
    if (autoArrived || safetyAlertShown) return;
    if (elapsedSeconds >= SAFETY_TIMER_SECONDS) {
      setSafetyAlertShown(true);
      toast({
        title: "⏱️ Still on your way?",
        description: "You've been en route for 20 minutes. Everything okay? Complete the request or use SOS if needed.",
      });
    }
  }, [elapsedSeconds, autoArrived, safetyAlertShown]);

  // ETA countdown
  useEffect(() => {
    if (routeData?.eta_text) setEtaCountdown(parseEtaSeconds(routeData.eta_text));
  }, [routeData?.eta_text]);
  useEffect(() => {
    if (etaCountdown <= 0) return;
    const id = setInterval(() => setEtaCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [etaCountdown > 0]);

  // Mark en_route once
  useEffect(() => {
    if (request?.status === "claimed" && currentUser && !enRouteRef.current && !enRouteMutation.isPending) {
      enRouteRef.current = true;
      enRouteMutation.mutate({ id: requestId, data: { helper_id: currentUser.id } });
    }
  }, [request?.status]);

  // Auto-detect arrival
  useEffect(() => {
    if (!myLocation || !request || autoArrived) return;
    if (request.status === "completed" || request.status === "arrived") return;
    const dist = distanceMeters(myLocation.lat, myLocation.lng, request.lat, request.lng);
    if (dist <= ARRIVAL_THRESHOLD_METERS && currentUser) {
      setAutoArrived(true);
      arrivedMutation.mutate(
        { id: requestId, data: { helper_id: currentUser.id } },
        {
          onSuccess: () => {
            toast({ title: "📍 You've arrived!", description: "Complete the request when you're done helping." });
            queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
          }
        }
      );
    }
  }, [myLocation, request, autoArrived, currentUser]);

  // Off-route detection + auto-reroute
  useEffect(() => {
    if (!myLocation || !routeData?.geometry || autoArrived) return;
    if (offRouteCooldownRef.current) return;

    const geom = routeData.geometry as { type: string; coordinates: number[][] };
    const dist = distToRoute(myLocation.lat, myLocation.lng, geom);

    if (dist > OFF_ROUTE_THRESHOLD_METERS) {
      setIsOffRoute(true);
      offRouteCooldownRef.current = true;
      toast({
        title: "🔄 Off route — recalculating…",
        description: "You've deviated from the route. Fetching updated directions.",
      });
      // Force new route by invalidating the query — new start position triggers fresh fetch
      queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(routeParams) });
      // Cool down: don't re-trigger for 30 seconds
      setTimeout(() => {
        offRouteCooldownRef.current = false;
        setIsOffRoute(false);
      }, 30000);
    } else {
      setIsOffRoute(false);
    }
  }, [myLocation, routeData]);

  // Step advancement — compute which step based on distance remaining
  useEffect(() => {
    if (!routeData?.steps || !myLocation || !request) return;
    const newStep = computeCurrentStep(
      myLocation.lat, myLocation.lng,
      routeData.steps,
      request.lat, request.lng,
    );
    setCurrentStepIndex(newStep);
  }, [myLocation, routeData, request]);

  // WebSocket: real-time request updates
  useWebSocket(useCallback((event) => {
    if (event.type === "request_updated") {
      const req = event.payload as { id: number };
      if (req.id === requestId) {
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
      }
    }
  }, [requestId, queryClient]));

  const handleComplete = () => {
    if (!currentUser || !request) return;
    completeMutation.mutate(
      { id: requestId, data: { helper_id: currentUser.id } },
      {
        onSuccess: () => {
          const earned = request.payment_type === "immediate" && request.pay_it_forward_amount
            ? `+$${request.pay_it_forward_amount.toFixed(2)} added to your wallet`
            : request.payment_type === "goodwill" ? "+1 goodwill point earned" : "Thank you for helping!";
          toast({ title: "🎉 Request Completed!", description: earned });
          setTimeout(() => setShowTip(true), 1500);
          queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          setLocation("/");
        },
        onError: () => toast({ title: "Failed to complete", variant: "destructive" })
      }
    );
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/request/${requestId}`;
    if (navigator.share) {
      await navigator.share({
        title: `Help request: ${request?.title ?? ""}`,
        text: `I'm on my way to help. Track my trip here.`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      toast({ title: "Trip link copied!", description: "Share this link so others can track your progress." });
    }
    setShareVisible(false);
  };

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (requestLoading || !myLocation) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p>Loading route...</p>
      </div>
    );
  }

  if (!request) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
      Request not found
    </div>
  );

  const currentStep = routeData?.steps?.[currentStepIndex] ?? null;
  const isArrived = request.status === "arrived" || autoArrived;
  const isCompleted = request.status === "completed";
  const earnAmount = request.payment_type === "immediate" && request.pay_it_forward_amount
    ? request.pay_it_forward_amount : null;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      {/* Back button */}
      <div className="absolute top-4 left-4 z-30">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full bg-card/80 backdrop-blur-sm border border-border">
          <ChevronLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Driver HUD — top right */}
      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
        className="absolute top-4 right-4 z-30 flex flex-col gap-2 items-end"
      >
        {/* Trip timer */}
        <div className={`flex items-center gap-1.5 backdrop-blur-md border px-3 py-1.5 rounded-full shadow-lg transition-colors ${
          elapsedSeconds >= SAFETY_TIMER_SECONDS
            ? "bg-yellow-500/20 border-yellow-500/40"
            : "bg-card/90 border-border"
        }`}>
          <Clock className={`w-3 h-3 ${elapsedSeconds >= SAFETY_TIMER_SECONDS ? "text-yellow-400" : "text-primary"}`} />
          <span className={`text-xs font-black font-mono ${elapsedSeconds >= SAFETY_TIMER_SECONDS ? "text-yellow-400" : "text-primary"}`}>
            {fmtTime(elapsedSeconds)}
          </span>
        </div>

        {/* ETA countdown */}
        {etaCountdown > 0 && !isArrived && (
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg">
            <Navigation2 className="w-3 h-3 text-yellow-400" />
            <span className="text-xs font-black text-yellow-400">{Math.ceil(etaCountdown / 60)} min</span>
          </div>
        )}

        {/* Off-route indicator */}
        {isOffRoute && (
          <div className="flex items-center gap-1.5 bg-orange-500/20 backdrop-blur-md border border-orange-500/40 px-3 py-1.5 rounded-full shadow-lg animate-pulse">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-black text-orange-400">Rerouting</span>
          </div>
        )}

        {/* Earnings badge */}
        {earnAmount && (
          <div className="flex items-center gap-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/40 px-3 py-1.5 rounded-full shadow-lg">
            <DollarSign className="w-3 h-3 text-green-400" />
            <span className="text-xs font-black text-green-400">+${earnAmount.toFixed(2)}</span>
          </div>
        )}
        {request.payment_type === "goodwill" && (
          <div className="flex items-center gap-1.5 bg-purple-500/20 backdrop-blur-md border border-purple-500/40 px-3 py-1.5 rounded-full shadow-lg">
            <Star className="w-3 h-3 text-purple-400" />
            <span className="text-xs font-black text-purple-400">Goodwill</span>
          </div>
        )}

        {/* Share trip button */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg hover:border-primary/50 transition-colors"
          title="Share trip"
        >
          <Share2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-black text-muted-foreground">Share</span>
        </button>
      </motion.div>

      {/* Navigation step overlay */}
      <div className="absolute top-0 left-14 right-24 z-20 pointer-events-none">
        <NavigationOverlay
          step={currentStep}
          eta={routeData?.eta_text ?? ""}
          distanceText={routeData?.distance_text ?? ""}
          status={request.status}
          totalSteps={routeData?.steps?.length ?? 0}
          currentStepIndex={currentStepIndex}
          isOffRoute={isOffRoute}
        />
      </div>

      {/* Mapbox */}
      <Map
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        initialViewState={{
          longitude: myLocation.lng,
          latitude: myLocation.lat,
          zoom: 15,
          pitch: 55,
          bearing: 0,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        attributionControl={false}
      >
        {/* Me (helper) — animated position dot */}
        <Marker longitude={myLocation.lng} latitude={myLocation.lat} anchor="center">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute w-10 h-10 bg-primary rounded-full opacity-20 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="absolute w-6 h-6 bg-primary rounded-full opacity-30 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
            <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_15px_rgba(0,212,255,1)] border-2 border-background" />
          </div>
        </Marker>

        {/* Destination */}
        <Marker longitude={request.lng} latitude={request.lat} anchor="bottom">
          <div className="relative">
            <svg width="44" height="44" viewBox="0 0 24 24" className={`drop-shadow-[0_0_12px_rgba(0,212,255,0.7)] ${isArrived ? "fill-green-500" : "fill-primary"}`}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {isArrived && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
        </Marker>

        {/* Route line */}
        {routeData?.geometry && (
          <Source id="route" type="geojson" data={routeData.geometry as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="route-casing"
              type="line"
              paint={{ "line-color": "#000", "line-width": 10, "line-opacity": 0.4 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-color": isArrived ? "#22c55e" : isOffRoute ? "#f97316" : "hsl(190, 100%, 50%)",
                "line-width": 6,
                "line-opacity": 0.92,
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}
      </Map>

      {/* Bottom action card */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-card border-t border-border rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] p-5 pb-safe">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border shrink-0">
            {request.requester_avatar ? (
              <img src={request.requester_avatar} alt="Requester" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{request.requester_name?.[0] || "U"}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate">{request.title}</h2>
            <p className="text-muted-foreground text-sm">{request.requester_name}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Status</div>
            <div className={`text-xs font-black uppercase ${isArrived ? "text-green-500" : isOffRoute ? "text-orange-400" : "text-primary"}`}>
              {isArrived ? "Arrived" : isOffRoute ? "Rerouting" : request.status.replace("_", " ")}
            </div>
          </div>
        </div>

        {/* Navigation progress bar */}
        {routeData?.steps && routeData.steps.length > 0 && !isArrived && (
          <div className="mb-3">
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(routeData.steps.length, 10) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    i <= currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
              <span>Step {currentStepIndex + 1} of {routeData.steps.length}</span>
              <span>{routeData.distance_text}</span>
            </div>
          </div>
        )}

        <Button
          className={`w-full h-12 text-base font-black uppercase tracking-widest gap-2 ${
            isCompleted ? "bg-muted text-muted-foreground" : isArrived ? "bg-green-500 hover:bg-green-600 text-white" : ""
          }`}
          onClick={handleComplete}
          disabled={completeMutation.isPending || isCompleted}
        >
          {completeMutation.isPending ? "Processing..." : isCompleted ? "✓ Completed" : isArrived ? "✓ Mark Complete" : "I'm Here — Complete"}
        </Button>

        {request.payment_type === "immediate" && earnAmount && (
          <p className="text-center text-xs text-green-400 font-bold mt-2">
            💰 +${earnAmount.toFixed(2)} will be added to your wallet on completion
          </p>
        )}
        {request.payment_type === "pay_it_forward" && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            💙 Pay It Forward — your help sustains the community
          </p>
        )}
        {request.payment_type === "goodwill" && (
          <p className="text-center text-xs text-purple-400 mt-2">
            ✨ Goodwill mission — +1 community goodwill point
          </p>
        )}

        {/* In-app chat */}
        <div className="mt-4">
          <InAppChat
            requestId={requestId}
            helperName={request.helper_name ?? "Helper"}
            requesterName={request.requester_name ?? "Requester"}
          />
        </div>
      </div>

      {/* Tip modal */}
      {showTip && request.helper_name && (
        <TipModal
          requestId={requestId}
          helperName={request.helper_name}
          onClose={() => setShowTip(false)}
        />
      )}
    </div>
  );
}
