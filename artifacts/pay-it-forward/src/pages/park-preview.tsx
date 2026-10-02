import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Compass,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Trees,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { haversineMeters } from "@/lib/geo-utils";
import { detectMapLanguage, detectUnits } from "@/lib/locale-utils";
import {
  formatParkDistance,
  getParkAddress,
  getParkDirectionsUrl,
  isValidCoordinates,
  parseMapboxParkFeatures,
  type ParkCoordinates,
  type ParkFeature,
} from "@/lib/park-preview-utils";

type SearchState = "idle" | "loading" | "ready" | "error";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export default function ParkPreviewPage() {
  const { myLocation } = useAppContext();
  const [, setLocation] = useLocation();
  const units = useMemo(() => detectUnits(), []);
  const contextCoordinates = myLocation && isValidCoordinates(myLocation.lat, myLocation.lng)
    ? { lat: myLocation.lat, lng: myLocation.lng }
    : null;
  const [requestedCoordinates, setRequestedCoordinates] = useState<ParkCoordinates | null>(null);
  const coordinates = contextCoordinates ?? requestedCoordinates;
  const approximateLocation = myLocation?.source === "ip" || myLocation?.privacyProtected === true;
  const [parks, setParks] = useState<ParkFeature[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [locationRequestState, setLocationRequestState] = useState<"idle" | "loading" | "error">("idle");
  const [locationError, setLocationError] = useState("");

  const orderedParks = useMemo(() => {
    if (!coordinates) return parks;
    return [...parks].sort((a, b) => {
      const [aLng, aLat] = a.geometry.coordinates;
      const [bLng, bLat] = b.geometry.coordinates;
      return haversineMeters(coordinates.lat, coordinates.lng, aLat, aLng)
        - haversineMeters(coordinates.lat, coordinates.lng, bLat, bLng);
    });
  }, [coordinates, parks]);

  useEffect(() => {
    if (!coordinates) {
      setSearchState("idle");
      setParks([]);
      return;
    }
    if (!MAPBOX_TOKEN?.trim()) {
      setSearchState("idle");
      setParks([]);
      return;
    }

    const controller = new AbortController();
    const search = async () => {
      setSearchState("loading");
      setSearchError("");
      setParks([]);
      const proximity = `${coordinates.lng},${coordinates.lat}`;
      const url = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/park.json");
      url.searchParams.set("access_token", MAPBOX_TOKEN);
      url.searchParams.set("proximity", proximity);
      url.searchParams.set("types", "poi");
      url.searchParams.set("limit", "10");
      url.searchParams.set("language", detectMapLanguage());
      try {
        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) throw new Error(`Park search returned ${response.status}.`);
        const payload: unknown = await response.json();
        const matching = parseMapboxParkFeatures(payload);
        if (!controller.signal.aborted) {
          setParks(matching);
          setSearchState("ready");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "We couldn’t load nearby parks.");
        setSearchState("error");
      }
    };
    void search();
    return () => controller.abort();
  }, [coordinates?.lat, coordinates?.lng, searchAttempt]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Location isn’t available in this browser. You can try again on a device with location services.");
      setLocationRequestState("error");
      return;
    }
    setLocationRequestState("loading");
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (isValidCoordinates(next.lat, next.lng)) {
          setRequestedCoordinates(next);
          setLocationRequestState("idle");
        } else {
          setLocationError("Your device returned an unusable location. Please try again.");
          setLocationRequestState("error");
        }
      },
      (error) => {
        setLocationError(error.code === error.PERMISSION_DENIED
          ? "Location access was declined. Allow it in your browser settings, then try again."
          : "We couldn’t get your location just now. Please try again.");
        setLocationRequestState("error");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  };

  const retrySearch = () => {
    if (!coordinates) return;
    setSearchAttempt((attempt) => attempt + 1);
  };

  const hasToken = Boolean(MAPBOX_TOKEN?.trim());

  return (
    <main className="min-h-[100dvh] bg-background text-foreground pb-28 lg:pb-12" data-testid="page-park-preview">
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-7 sm:pt-8 lg:px-10">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="group mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="button-back-to-map-top"
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          Back to map
        </button>

        <section className="relative isolate overflow-hidden rounded-[2rem] border border-[#19354f] bg-[#0f243b] text-[#f4fbff] shadow-[0_22px_60px_-38px_rgba(8,24,43,0.65)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full border border-[#66e4ff]/20" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-12 h-56 w-56 rounded-full border border-[#66e4ff]/15" />
          <div aria-hidden="true" className="pointer-events-none absolute right-11 top-8 h-36 w-36 rounded-full border border-[#66e4ff]/10" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-[14%] h-28 w-28 rounded-full bg-[#00cfff]/[0.08] blur-2xl" />

          <div className="relative grid gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[1fr_300px] lg:items-center lg:px-12 lg:py-12">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#66e4ff]/20 bg-[#66e4ff]/[0.08] px-3 py-1.5 text-xs font-semibold tracking-wide text-[#b8f3ff]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00cfff]" aria-hidden="true" />
                NEAR YOU, WHEN YOU’RE READY
              </div>
              <h1 className="font-display text-4xl leading-[1.04] tracking-[-0.035em] text-[#f5fbff] sm:text-5xl lg:text-[3.5rem]">
                A little room
                <br />
                to <span className="text-[#66e4ff]">meet outside.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#bfd0df] sm:text-lg">
                Find parks around you. A good place to pause, cross paths, and feel part of the neighborhood.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-medium text-[#afc4d7]">
                <span className="inline-flex items-center gap-2"><MapPin size={14} className="text-[#66e4ff]" aria-hidden="true" /> {approximateLocation ? "Around your area" : "Based on your location"}</span>
                <span className="inline-flex items-center gap-2"><Compass size={14} className="text-[#ffb703]" aria-hidden="true" /> Directions open in your maps app</span>
              </div>
            </div>

            <div className="relative hidden h-52 items-center justify-center lg:flex" aria-hidden="true">
              <div className="absolute h-48 w-48 rounded-full border border-dashed border-[#66e4ff]/20" />
              <div className="absolute h-36 w-36 rounded-full border border-[#66e4ff]/20" />
              <div className="absolute h-24 w-24 rounded-full border border-[#66e4ff]/25" />
              <div className="absolute h-2.5 w-2.5 -translate-x-20 -translate-y-10 rounded-full bg-[#ffb703]" />
              <div className="absolute h-2 w-2 translate-x-16 translate-y-12 rounded-full bg-[#ff7d77]" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-[#8cecff]/30 bg-[#143650] text-[#66e4ff] shadow-[0_14px_30px_-12px_rgba(0,207,255,.4)]">
                <Trees size={29} strokeWidth={1.7} />
              </div>
              <div className="absolute bottom-1 right-3 rounded-full border border-[#8cecff]/20 bg-[#102a42] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[#b8f3ff]">
                YOUR NEIGHBORHOOD
              </div>
            </div>
          </div>
        </section>

        <section className="mt-9 sm:mt-11" aria-labelledby="nearby-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">A nearby starting point</p>
              <h2 id="nearby-heading" className="font-display text-3xl tracking-tight sm:text-[2.15rem]">Parks around you</h2>
            </div>
            {coordinates && (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground" data-testid="status-location-active">
                <span className="h-2 w-2 rounded-full bg-[#00a987]" aria-hidden="true" />
                {approximateLocation ? "Approximate location" : "Location ready"}
              </div>
            )}
          </div>

          {!hasToken ? (
            <div className="flex gap-4 rounded-2xl border border-[#ffb703]/40 bg-[#ffb703]/[0.10] p-5 sm:p-6" role="status" data-testid="status-missing-token">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffb703]/20 text-amber-900 dark:text-amber-200">
                <AlertCircle size={20} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold">Nearby search isn’t set up yet</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Park listings need a Mapbox access token. Once it’s configured, this page can show real places near you.
                </p>
              </div>
            </div>
          ) : !coordinates ? (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" data-testid="status-no-location">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <LocateFixed size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Start with your location</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      We’ll send your location to Mapbox to find nearby parks. Niakofa doesn’t save park search results.
                    </p>
                    {locationRequestState === "error" && (
                      <p className="mt-2 text-sm text-destructive" role="alert" data-testid="status-location-error">{locationError}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationRequestState === "loading"}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
                  data-testid="button-enable-location"
                  aria-label="Use my current location to find nearby parks"
                >
                  {locationRequestState === "loading" ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={17} aria-hidden="true" />}
                  {locationRequestState === "loading" ? "Finding location…" : "Use my location"}
                </button>
              </div>
            </div>
          ) : searchState === "loading" || searchState === "idle" ? (
            <div className="space-y-3" aria-label="Loading nearby parks" aria-live="polite" data-testid="status-parks-loading">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-4 rounded-2xl border border-border bg-card p-5">
                  <div className="h-12 w-12 rounded-2xl bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded-full bg-muted" />
                    <div className="h-3 w-1/2 rounded-full bg-muted/70" />
                  </div>
                  <div className="hidden h-9 w-24 rounded-lg bg-muted sm:block" />
                </div>
              ))}
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" role="alert" data-testid="status-fetch-error">
              <div className="flex gap-3">
                <AlertCircle size={21} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">We couldn’t load nearby parks</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{searchError}</p>
                </div>
              </div>
              <button type="button" onClick={retrySearch} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary sm:self-center" data-testid="button-retry-parks">
                <RefreshCw size={15} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : orderedParks.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center sm:py-14" data-testid="status-no-results">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-secondary text-primary">
                <Trees size={25} aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-2xl">No parks found nearby</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                We didn’t find park listings for this location. You can try the search again or head back to the map.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={retrySearch} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-secondary" data-testid="button-retry-empty">
                  <RefreshCw size={15} aria-hidden="true" /> Search again
                </button>
                <button type="button" onClick={() => setLocation("/")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-empty-back-to-map">
                  <MapPin size={15} aria-hidden="true" /> Return to map
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3" data-testid="list-nearby-parks">
              {orderedParks.map((park) => {
                const [longitude, latitude] = park.geometry.coordinates;
                const distance = haversineMeters(coordinates.lat, coordinates.lng, latitude, longitude);
                const address = getParkAddress(park);
                const directionsUrl = getParkDirectionsUrl(park);
                return (
                  <article key={park.id} className="group rounded-2xl border border-border bg-card p-4 shadow-[0_8px_24px_-22px_rgba(8,24,43,0.4)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_32px_-24px_rgba(8,24,43,0.35)] sm:p-5" data-testid={`card-park-${park.id}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-primary/15">
                          <Trees size={22} strokeWidth={1.8} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold tracking-[-0.015em]" data-testid={`text-park-name-${park.id}`}>{park.text}</h3>
                          {address && <p className="mt-1 truncate text-sm text-muted-foreground" data-testid={`text-park-address-${park.id}`}>{address}</p>}
                          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid={`text-park-distance-${park.id}`}>
                            <MapPin size={13} aria-hidden="true" /> {approximateLocation ? "About " : ""}{formatParkDistance(distance, units)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Get directions to ${park.text} in Google Maps`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-secondary sm:shrink-0"
                        data-testid={`link-directions-${park.id}`}
                      >
                        <Navigation size={16} className="text-primary" aria-hidden="true" />
                        Get directions
                        <ArrowUpRight size={14} className="text-muted-foreground" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-8 flex flex-col gap-4 border-t border-border pt-5 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl">Mapbox processes your location query to return nearby places. Niakofa doesn’t save park search results; distances are straight-line estimates{approximateLocation ? " based on an approximate location." : "."}</p>
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="inline-flex min-h-10 items-center gap-2 self-start font-semibold text-foreground transition-colors hover:text-primary sm:self-auto"
            data-testid="button-return-to-map"
          >
            <ArrowLeft size={15} aria-hidden="true" /> Return to Niakofa Map
          </button>
        </div>
      </div>
    </main>
  );
}