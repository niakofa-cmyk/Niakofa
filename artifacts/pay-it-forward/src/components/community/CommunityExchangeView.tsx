import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  HandHeart,
  HeartHandshake,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Tag,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  createExchangeListing,
  createExchangePickupRequest,
  getExchangeListing,
  getExchangeListings,
  getExchangePickupRequests,
  reportExchangeListing,
  renewExchangeListing,
  updateExchangeListing,
  updateExchangePickupRequest,
  type ExchangeReportType,
} from "@/lib/community-exchange-client";
import type {
  ExchangeCategory,
  ExchangeCondition,
  ExchangeListing,
  ExchangeListingType,
  ExchangePickupRequest,
  ExchangeResourceType,
} from "@/lib/community-exchange-types";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";

type FeedFilter = "all" | "goods" | "services" | "needs" | "mine";
type LocalLocation = {
  label: string;
  city: string;
  source: "zip" | "area" | "browser";
};

type ExchangeImpact = {
  completed: number | null;
  active_offers: number;
  active_needs: number;
  unique_neighbors: number | null;
  completed_30d: number | null;
  suppressed: boolean;
  privacy_threshold: number;
  privacy_note: string;
};

const LOCATION_KEY = "niakofa_exchange_location";
const CITY_OPTIONS = ["Fort Worth, TX", "Dallas, TX", "Kansas City, MO", "Other community"] as const;
const categories: Array<{ value: ExchangeCategory; label: string }> = [
  { value: "household", label: "Household" },
  { value: "clothing", label: "Clothing" },
  { value: "food", label: "Food" },
  { value: "books", label: "Books" },
  { value: "electronics", label: "Electronics" },
  { value: "children", label: "Children" },
  { value: "urgent_aid", label: "Urgent aid" },
  { value: "other", label: "Other" },
];
const conditions: Array<{ value: ExchangeCondition; label: string }> = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "well_loved", label: "Well loved" },
];

function readLocation(): LocalLocation | null {
  try {
    const saved = localStorage.getItem(LOCATION_KEY);
    if (!saved) return null;
    const value = JSON.parse(saved) as Partial<LocalLocation>;
    return typeof value.label === "string"
      && typeof value.city === "string"
      && (value.source === "zip" || value.source === "area" || value.source === "browser")
      ? { label: value.label, city: value.city, source: value.source }
      : null;
  } catch {
    return null;
  }
}

async function persistExchangeDigestLocation(userId: number, location: LocalLocation): Promise<void> {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const response = await fetch(`${base}/api/users/${userId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      exchange_digest_area: location.label,
      exchange_digest_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
  });
  if (!response.ok) throw new Error("Exchange digest location could not be saved");
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  const ageMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (ageMinutes < 1) return "Just now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}h ago`;
  if (ageMinutes < 10080) return `${Math.round(ageMinutes / 1440)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="text-xs font-bold text-foreground">{children}</label>;
}

function ModalFrame({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div className={`relative mx-auto my-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl sm:my-8 ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 p-5 backdrop-blur sm:p-6">
          <div>
            {eyebrow && <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
            <h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Close dialog" data-testid="button-close-dialog">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function ExchangeSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading community listings" data-testid="loading-listings">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-48 animate-pulse rounded-2xl border border-border bg-card/70 p-4">
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="mt-5 h-5 w-4/5 rounded bg-muted" />
          <div className="mt-3 h-3 w-full rounded bg-muted" />
          <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
          <div className="mt-7 h-3 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ListingCard({ listing, onOpen, onRenew, onEdit }: {
  listing: ExchangeListing;
  onOpen: () => void;
  onRenew?: (listing: ExchangeListing) => void;
  onEdit?: (listing: ExchangeListing) => void;
}) {
  const isNeed = listing.listing_type === "need";
  return (
    <div className="group flex min-h-48 flex-col rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card/80" data-testid={`card-listing-${listing.id}`}>
      <button type="button" onClick={onOpen} className="flex min-h-36 flex-1 flex-col text-left focus:outline-none focus:ring-2 focus:ring-primary">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${isNeed ? "bg-amber-400/15 text-amber-200" : "bg-primary/15 text-primary"}`}>
            {isNeed ? <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" /> : <HandHeart className="h-3.5 w-3.5" aria-hidden="true" />}
            {isNeed ? "Need" : "Offer"}
          </span>
          <span className="text-[11px] text-muted-foreground">{listing.resource_type === "services" ? "Service" : "Goods"}</span>
        </div>
        <h3 className="mt-4 line-clamp-2 text-lg font-black tracking-tight group-hover:text-primary">{listing.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{listing.description}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{listing.neighborhood}</span>
          <span className="shrink-0">{formatDate(listing.created_at)}</span>
        </div>
      </button>
      {listing.status === "archived" && onRenew && (
        <button type="button" onClick={() => onRenew(listing)} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-renew-listing-${listing.id}`}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Renew this post
        </button>
      )}
      {listing.status === "active" && onEdit && (
        <button type="button" onClick={() => onEdit(listing)} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-edit-listing-${listing.id}`}>
          <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Edit this post
        </button>
      )}
    </div>
  );
}

export function CommunityExchangeView() {
  const { currentUser } = useAppContext();
  const initialLocation = readLocation();
  const [location, setLocation] = useState<LocalLocation | null>(initialLocation);
  const [locationOpen, setLocationOpen] = useState(!initialLocation);
  const [zip, setZip] = useState(initialLocation?.source === "zip" ? initialLocation.label : "");
  const [area, setArea] = useState(initialLocation?.source === "area" ? initialLocation.label : "");
  const [city, setCity] = useState(initialLocation?.city ?? "Fort Worth, TX");
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>(() =>
    new URLSearchParams(window.location.search).get("mine") === "true" ? "mine" : "all"
  );
  const [mineOnly, setMineOnly] = useState(() => new URLSearchParams(window.location.search).get("mine") === "true");
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<ExchangeListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsMoreLoading, setListingsMoreLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listingsError, setListingsError] = useState("");
  const [pickupRequests, setPickupRequests] = useState<ExchangePickupRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("listingId"));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const [selectedListing, setSelectedListing] = useState<ExchangeListing | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [postStep, setPostStep] = useState(1);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestForm, setRequestForm] = useState({ note: "", pickup_area: "", proposed_window: "" });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState<{ type: ExchangeReportType; description: string }>({ type: "other", description: "" });
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [impact, setImpact] = useState<ExchangeImpact | null>(null);
  const [postForm, setPostForm] = useState({
    listing_type: "offer" as ExchangeListingType,
    resource_type: "goods" as ExchangeResourceType,
    title: "",
    description: "",
    category: "household" as ExchangeCategory,
    condition: "good" as ExchangeCondition,
    neighborhood: initialLocation?.label ?? "",
    pickup_notes: "",
  });
  const [editForm, setEditForm] = useState({
    listing_type: "offer" as ExchangeListingType,
    resource_type: "goods" as ExchangeResourceType,
    title: "",
    description: "",
    category: "household" as ExchangeCategory,
    condition: "good" as ExchangeCondition,
    neighborhood: "",
    pickup_notes: "",
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reportOpen) setReportOpen(false);
      else if (selectedId !== null) setSelectedId(null);
      else if (postOpen && location) setPostOpen(false);
      else if (locationOpen && location) setLocationOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location, locationOpen, postOpen, reportOpen, selectedId]);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setListings([]);
    setNextCursor(null);
    const timer = window.setTimeout(async () => {
      setListingsLoading(true);
      setListingsError("");
      try {
        const filter: Parameters<typeof getExchangeListings>[0] = {
          ...(mineOnly ? { mine: true } : { neighborhood: location.label, nearby: location.source === "browser" }),
          limit: 24,
        };
        if (feedFilter === "goods" || feedFilter === "services") filter.resource_type = feedFilter;
        if (feedFilter === "needs") filter.type = "need";
        if (query.trim()) filter.q = query;
        const result = await getExchangeListings(filter);
        if (!cancelled) {
          setListings(result.listings ?? []);
          setNextCursor(result.next_cursor ?? null);
        }
      } catch (error) {
        if (!cancelled) setListingsError(error instanceof Error ? error.message : "Listings could not be loaded.");
      } finally {
        if (!cancelled) setListingsLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedFilter, location, mineOnly, query, refreshTick]);

  const loadMoreListings = async () => {
    if (!location || !nextCursor || listingsMoreLoading) return;
    setListingsMoreLoading(true);
    setListingsError("");
    try {
      const filter: Parameters<typeof getExchangeListings>[0] = {
        ...(mineOnly ? { mine: true } : { neighborhood: location.label, nearby: location.source === "browser" }),
        cursor: nextCursor,
        limit: 24,
      };
      if (feedFilter === "goods" || feedFilter === "services") filter.resource_type = feedFilter;
      if (feedFilter === "needs") filter.type = "need";
      if (query.trim()) filter.q = query;
      const result = await getExchangeListings(filter);
      setListings((current) => [...current, ...(result.listings ?? [])]);
      setNextCursor(result.next_cursor ?? null);
    } catch (error) {
      setListingsError(error instanceof Error ? error.message : "More listings could not be loaded.");
    } finally {
      setListingsMoreLoading(false);
    }
  };

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError("");
    getExchangePickupRequests()
      .then((result) => {
        if (!cancelled) setPickupRequests(result.pickup_requests ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setRequestsError(error instanceof Error ? error.message : "Coordination requests could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setRequestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/community/exchange/impact`, { headers: authHeaders() })
      .then((response) => response.ok ? response.json() as Promise<ExchangeImpact> : null)
      .then((data) => {
        if (!cancelled && data) setImpact(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    if (selectedId === null) {
      setSelectedListing(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    getExchangeListing(selectedId)
      .then((result) => {
        if (!cancelled) {
          setSelectedListing(result.listing);
          setRequestForm({ note: "", pickup_area: location?.label ?? result.listing.neighborhood, proposed_window: "" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setDetailError(error instanceof Error ? error.message : "This listing could not be opened.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location, selectedId]);

  useEffect(() => {
    if (!currentUser?.id || !location) return;
    void persistExchangeDigestLocation(currentUser.id, location).catch(() => {
      // The local Exchange board remains usable if settings persistence is
      // temporarily unavailable; the next location change retries it.
    });
  }, [currentUser?.id, location]);

  const saveLocation = (event: FormEvent) => {
    event.preventDefault();
    const cleanZip = zip.trim();
    const cleanArea = area.trim();
    if (cleanZip && !/^\d{5}$/.test(cleanZip)) {
      setLocationError("Enter a five-digit ZIP code, or leave it blank and use a city or neighborhood.");
      return;
    }
    if (!cleanZip && cleanArea.length < 2) {
      setLocationError("Add a city or neighborhood so the exchange can stay local.");
      return;
    }
    const next: LocalLocation = cleanZip
      ? { label: cleanZip, city, source: "zip" }
      : { label: cleanArea, city, source: "area" };
    localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
    setLocation(next);
    setLocationOpen(false);
    setLocationError("");
    setPostForm((current) => ({ ...current, neighborhood: next.label }));
  };

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("This browser does not offer location access. Use a ZIP code or city instead.");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (currentUser?.id) {
          const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
          void fetch(`${base}/api/users/${currentUser.id}/location`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          }).catch(() => {
            // The coarse board remains usable if location persistence is
            // temporarily unavailable; manual area filtering still works.
          });
        }
        const next: LocalLocation = { label: "Nearby area", city: "Nearby community", source: "browser" };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
        setLocation(next);
        setLocationOpen(false);
        setPostForm((current) => ({ ...current, neighborhood: next.label }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError("Location access was not granted. Nothing was shared; you can enter your area manually.");
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  };

  const openPost = () => {
    setPostError("");
    setPostStep(1);
    setPostForm((current) => ({ ...current, neighborhood: location?.label ?? current.neighborhood }));
    setPostOpen(true);
  };

  const submitPost = async (event: FormEvent) => {
    event.preventDefault();
    if (postStep < 3) {
      setPostStep((step) => step + 1);
      return;
    }
    setPostSubmitting(true);
    setPostError("");
    try {
      const result = await createExchangeListing(postForm);
      setNotice(result.message || "Your community post was received.");
      setPostOpen(false);
      setPostStep(1);
      setPostForm((current) => ({ ...current, title: "", description: "", pickup_notes: "" }));
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Your post could not be shared.");
    } finally {
      setPostSubmitting(false);
    }
  };

  const submitPickupRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedListing) return;
    setRequestSubmitting(true);
    setNotice("");
    try {
      await createExchangePickupRequest(selectedListing.id, requestForm);
      setNotice("Your note was sent to the neighbor. Keep coordination inside Niakofa.");
      setRequestForm((current) => ({ ...current, note: "", proposed_window: "" }));
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The coordination note could not be sent.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedListing && !editForm.title) return;
    const listingId = selectedListing?.id ?? Number(new URLSearchParams(window.location.search).get("listingId"));
    if (!Number.isSafeInteger(listingId) || listingId <= 0) return;
    setEditSubmitting(true);
    setEditError("");
    try {
      const result = await updateExchangeListing(listingId, editForm);
      setNotice(result.message || "Listing updated.");
      setEditOpen(false);
      setSelectedId(null);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "The listing could not be updated.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const runPickupAction = async (request: ExchangePickupRequest, action: "accept" | "decline" | "cancel" | "confirm-complete") => {
    setActionLoading(request.id);
    setNotice("");
    try {
      const result = await updateExchangePickupRequest(request.id, action);
      setNotice(
        result.awaiting_other_confirmation
          ? "Your confirmation is recorded. We are waiting for the other participant to confirm the handoff."
          : action === "confirm-complete"
            ? "Both participants confirmed the handoff. Thank you for closing the loop."
            : "Coordination updated.",
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That coordination update could not be made.");
    } finally {
      setActionLoading(null);
    }
  };

  const renewListing = async (listing: ExchangeListing) => {
    setActionLoading(listing.id);
    setNotice("");
    try {
      await renewExchangeListing(listing.id);
      setNotice("Your Exchange post is active again.");
      setSelectedId(null);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This post could not be renewed.");
    } finally {
      setActionLoading(null);
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedListing) return;
    setReportSubmitting(true);
    try {
      const result = await reportExchangeListing(selectedListing.id, reportForm);
      setNotice(result.message || "Thanks. The safety team received your report.");
      setReportOpen(false);
      setReportForm({ type: "other", description: "" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The report could not be sent.");
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <section aria-label="Niakofa Exchange" className="space-y-4 px-3 pb-8 sm:px-0">
      <header className="relative overflow-hidden rounded-3xl border border-primary/25 bg-[radial-gradient(circle_at_90%_0%,hsl(var(--primary)/.22),transparent_42%),linear-gradient(145deg,hsl(var(--card)),hsl(var(--background)))] p-5 sm:p-7">
        <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-primary/10" aria-hidden="true" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              <Store className="h-4 w-4" aria-hidden="true" /> Niakofa Exchange
            </p>
            <button type="button" onClick={() => setLocationOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-primary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-change-area">
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {location?.label ?? "Choose your area"}
            </button>
          </div>
          <h1 className="mt-5 max-w-xl text-3xl font-black leading-[1.03] tracking-[-0.04em] sm:text-4xl">Free things. Shared skills. Neighbors looking out.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            A private neighborhood space for giving what you can, asking for what you need, and coordinating safely. No payments, no checkout — just community solidarity.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Approved neighbors</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-2"><MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Coarse areas only</span>
          </div>
        </div>
      </header>

      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm" role="status" data-testid="status-exchange-notice">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Dismiss notice" data-testid="button-dismiss-notice"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">The local board</p>
              <h2 className="mt-1 text-xl font-black tracking-tight">What neighbors are sharing</h2>
            </div>
            <button type="button" onClick={openPost} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-black text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background" data-testid="button-create-listing">
              <Plus className="h-4 w-4" aria-hidden="true" /> Post to Exchange
            </button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 no-scrollbar" role="tablist" aria-label="Exchange filters">
            {([
              ["all", "All"],
              ["goods", "Goods"],
              ["services", "Services"],
              ["needs", "Needs"],
              ["mine", "My posts"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={feedFilter === value} onClick={() => { setFeedFilter(value); setMineOnly(value === "mine"); }} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-primary ${feedFilter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} data-testid={`tab-filter-${value}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="relative block min-w-0 sm:w-56">
          <span className="sr-only">Search listings</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this area" className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-search-listings" />
        </label>
      </div>

      {listingsLoading ? <ExchangeSkeleton /> : listingsError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5" role="alert" data-testid="error-listings">
          <div className="flex items-start gap-3"><AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /><div><h3 className="font-bold">The local board is having a quiet moment.</h3><p className="mt-1 text-sm text-muted-foreground">{listingsError}</p><button type="button" onClick={() => setRefreshTick((tick) => tick + 1)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-retry-listings"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div></div>
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center" data-testid="empty-listings">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Compass className="h-6 w-6" aria-hidden="true" /></div>
          <h3 className="mt-4 text-lg font-black">{query ? "Nothing matches that search yet." : "Your neighborhood board is ready for its first share."}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{query ? "Try another phrase or clear the search to see the full local board." : "Post a free offer or a need. Every small act helps make the area more resilient."}</p>
          <button type="button" onClick={query ? () => setQuery("") : openPost} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-empty-listings-action">{query ? "Clear search" : "Make the first post"} <ArrowRight className="h-4 w-4" /></button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2" data-testid="listings-grid">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={() => setSelectedId(listing.id)} onRenew={mineOnly ? renewListing : undefined} onEdit={mineOnly ? (item) => {
              setEditError("");
              setEditForm({
                listing_type: item.listing_type,
                resource_type: item.resource_type,
                title: item.title,
                description: item.description,
                category: item.category,
                condition: item.condition,
                neighborhood: item.neighborhood,
                pickup_notes: item.pickup_notes ?? "",
              });
              setEditOpen(true);
            } : undefined} />)}
          </div>
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadMoreListings()}
              disabled={listingsMoreLoading}
              className="mx-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-load-more-listings"
            >
              {listingsMoreLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {listingsMoreLoading ? "Loading…" : "Load more listings"}
            </button>
          )}
        </>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="coordination-heading">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Keep it neighborly</p><h2 id="coordination-heading" className="mt-1 text-xl font-black">Coordination</h2><p className="mt-1 text-sm text-muted-foreground">Your pickup notes and requests live here. Keep exact addresses and private contact details out of posts.</p></div>
          <MessageSquare className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
        {requestsLoading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-muted" data-testid="loading-pickup-requests" /> : requestsError ? <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert" data-testid="error-pickup-requests">{requestsError}</div> : pickupRequests.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="empty-pickup-requests">No active coordination yet. When a neighbor responds, you will see the next step here.</p> : (
          <div className="mt-4 space-y-2" data-testid="pickup-requests-list">
            {pickupRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-border bg-background/45 p-3" data-testid={`pickup-request-${request.id}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{request.listing_title || `Exchange listing #${request.listing_id}`}</p><p className="mt-1 text-xs text-muted-foreground">{request.pickup_area} · {request.proposed_window}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${request.status === "completed" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`} data-testid={`status-pickup-${request.id}`}>{statusLabel(request.status)}</span></div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{request.note}</p>
                 {request.status === "accepted" && (request.buyer_confirmed_at || request.seller_confirmed_at) && (
                   <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs font-semibold text-primary" data-testid={`awaiting-confirmation-${request.id}`}>
                     One participant has confirmed the handoff. Waiting for the other participant to confirm.
                   </p>
                 )}
                 <div className="mt-3 flex flex-wrap gap-2">
                   {currentUser && (currentUser.id === request.buyer_id || currentUser.id === request.seller_id) && (currentUser.id === request.buyer_id ? request.seller_id : request.buyer_id) ? (
                     <button type="button" onClick={() => {
                       const recipientId = currentUser.id === request.buyer_id ? request.seller_id : request.buyer_id;
                       if (!recipientId) return;
                       const params = new URLSearchParams({ mode: "direct", recipientId: String(recipientId), exchangeListingId: String(request.listing_id), exchangePickupRequestId: String(request.id) });
                       window.location.assign(`/messages?${params.toString()}`);
                     }} className="min-h-8 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-open-exchange-messages-${request.id}`}><MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Open Messages</button>
                   ) : null}
                  {request.status === "requested" && <><button type="button" disabled={actionLoading === request.id} onClick={() => runPickupAction(request, "accept")} className="min-h-8 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-accept-pickup-${request.id}`}>Accept</button><button type="button" disabled={actionLoading === request.id} onClick={() => runPickupAction(request, "decline")} className="min-h-8 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-decline-pickup-${request.id}`}>Decline</button></>}
                  {(request.status === "requested" || request.status === "accepted") && <button type="button" disabled={actionLoading === request.id} onClick={() => runPickupAction(request, "cancel")} className="min-h-8 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-cancel-pickup-${request.id}`}>Cancel</button>}
                  {request.status === "accepted" && <button type="button" disabled={actionLoading === request.id} onClick={() => runPickupAction(request, "confirm-complete")} className="min-h-8 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary" data-testid={`button-complete-pickup-${request.id}`}>{actionLoading === request.id ? "Updating…" : "Confirm complete"}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {impact && (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5" aria-labelledby="exchange-impact-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Community Impact</p>
              <h2 id="exchange-impact-heading" className="mt-1 text-xl font-black">The Exchange is moving care</h2>
               <p className="mt-1 text-sm text-muted-foreground">{impact.privacy_note}</p>
            </div>
            <HeartHandshake className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
               ["Completed", impact.completed ?? "—"],
               ["Neighbors reached", impact.unique_neighbors ?? "—"],
              ["Offers live", impact.active_offers],
              ["Needs live", impact.active_needs],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-background/60 p-3">
                <p className="text-2xl font-black text-primary">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="flex items-center gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground"><CircleHelp className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Exchange is for free community sharing only. Niakofa does not handle payments or checkout here.</p>

      {locationOpen && (
        <ModalFrame title="Set your local area" eyebrow="Privacy first" onClose={() => location && setLocationOpen(false)}>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><p className="text-sm leading-relaxed text-muted-foreground">We use a coarse area to show nearby posts. Your exact location is never sent to Exchange, and browser location is reduced to “Nearby area” on this device.</p></div></div>
          <form onSubmit={saveLocation} className="mt-5 space-y-4">
             <div className="space-y-2"><FieldLabel htmlFor="exchange-city">City or community</FieldLabel><select id="exchange-city" value={city} onChange={(event) => setCity(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="select-location-city">{CITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
             <div className="space-y-2"><FieldLabel htmlFor="exchange-zip">Five-digit ZIP code (optional)</FieldLabel><input id="exchange-zip" value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" maxLength={5} placeholder="e.g. 76102" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-location-zip" /><p className="text-xs text-muted-foreground">Only the ZIP or neighborhood you choose is used to filter the board.</p></div>
            <div className="relative flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">or</span><div className="h-px flex-1 bg-border" /></div>
            <div className="space-y-2"><FieldLabel htmlFor="exchange-area">City or neighborhood</FieldLabel><input id="exchange-area" value={area} onChange={(event) => setArea(event.target.value.slice(0, 80))} placeholder="e.g. Mission District" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-location-area" /></div>
            <button type="button" disabled={locating} onClick={useBrowserLocation} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-muted disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-use-browser-location">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-primary" />} {locating ? "Finding a coarse area…" : "Use my browser location (coarse only)"}</button>
            {locationError && <p className="text-sm text-destructive" role="alert" data-testid="error-location">{locationError}</p>}
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-save-location">Enter the Exchange <ArrowRight className="h-4 w-4" /></button>
          </form>
        </ModalFrame>
      )}

      {postOpen && (
        <ModalFrame title="Post to Exchange" eyebrow={`Step ${postStep} of 3`} onClose={() => setPostOpen(false)} wide>
          <div className="mb-6 flex items-center gap-2" aria-label={`Posting step ${postStep} of 3`}>
            {[1, 2, 3].map((step) => <div key={step} className={`h-1.5 flex-1 rounded-full ${step <= postStep ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <form onSubmit={submitPost} className="space-y-5">
            {postStep === 1 && <div className="space-y-5"><div><h3 className="text-lg font-black">What kind of solidarity is this?</h3><p className="mt-1 text-sm text-muted-foreground">Choose whether you are offering something or naming a need.</p></div><div className="grid gap-3 sm:grid-cols-2">{([["offer", "I can offer", "Share a free item or skill.", HandHeart], ["need", "I need", "Ask neighbors for practical support.", HeartHandshake]] as const).map(([value, label, description, Icon]) => <button key={value} type="button" onClick={() => setPostForm((current) => ({ ...current, listing_type: value }))} className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary ${postForm.listing_type === value ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`} data-testid={`button-post-type-${value}`}><Icon className={`h-6 w-6 ${postForm.listing_type === value ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" /><p className="mt-3 font-black">{label}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></button>)}</div><div><p className="mb-2 text-xs font-bold">Is it a thing or a skill?</p><div className="grid grid-cols-2 gap-2">{([["goods", "Goods", Package], ["services", "Services", Wrench]] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setPostForm((current) => ({ ...current, resource_type: value }))} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary ${postForm.resource_type === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`} data-testid={`button-post-resource-${value}`}><Icon className="h-4 w-4" /> {label}</button>)}</div></div></div>}
            {postStep === 2 && <div className="space-y-4"><div><h3 className="text-lg font-black">Add the useful details</h3><p className="mt-1 text-sm text-muted-foreground">Be specific and kind. Do not include phone numbers, addresses, links, or payment details.</p></div><div className="space-y-2"><FieldLabel htmlFor="post-title">Short title</FieldLabel><input id="post-title" required minLength={3} maxLength={100} value={postForm.title} onChange={(event) => setPostForm((current) => ({ ...current, title: event.target.value }))} placeholder={postForm.resource_type === "services" ? "Help with basic bike repairs" : "Clean winter coats, mixed sizes"} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-post-title" /></div><div className="space-y-2"><FieldLabel htmlFor="post-description">Description</FieldLabel><textarea id="post-description" required minLength={10} maxLength={2000} rows={5} value={postForm.description} onChange={(event) => setPostForm((current) => ({ ...current, description: event.target.value }))} placeholder="What should a neighbor know?" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-post-description" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><FieldLabel htmlFor="post-category">Category</FieldLabel><select id="post-category" value={postForm.category} onChange={(event) => setPostForm((current) => ({ ...current, category: event.target.value as ExchangeCategory }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="select-post-category">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div><div className="space-y-2"><FieldLabel htmlFor="post-condition">Condition / format</FieldLabel><select id="post-condition" value={postForm.condition} onChange={(event) => setPostForm((current) => ({ ...current, condition: event.target.value as ExchangeCondition }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="select-post-condition">{conditions.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}</select></div></div></div>}
            {postStep === 3 && <div className="space-y-4"><div><h3 className="text-lg font-black">Set a coarse handoff area</h3><p className="mt-1 text-sm text-muted-foreground">Keep the first exchange public and general. You can coordinate a safer detail later inside Niakofa.</p></div><div className="space-y-2"><FieldLabel htmlFor="post-neighborhood">Neighborhood or ZIP</FieldLabel><input id="post-neighborhood" required minLength={2} maxLength={80} value={postForm.neighborhood} onChange={(event) => setPostForm((current) => ({ ...current, neighborhood: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-post-neighborhood" /></div><div className="space-y-2"><FieldLabel htmlFor="post-pickup-notes">Public pickup notes (optional)</FieldLabel><textarea id="post-pickup-notes" maxLength={500} rows={3} value={postForm.pickup_notes} onChange={(event) => setPostForm((current) => ({ ...current, pickup_notes: event.target.value }))} placeholder="Example: daytime handoff near the library" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-post-pickup-notes" /></div><div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" aria-hidden="true" /> Your post is free to the community and may be held for a quick safety review before it appears.</div></div>}
            {postError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="error-post">{postError}</p>}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><button type="button" onClick={() => postStep === 1 ? setPostOpen(false) : setPostStep((step) => step - 1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-post-back">{postStep === 1 ? "Cancel" : <><ArrowLeft className="h-4 w-4" /> Back</>}</button><button type="submit" disabled={postSubmitting} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-post-next">{postSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{postStep === 3 ? "Share with neighbors" : "Continue"} {!postSubmitting && <ChevronRight className="h-4 w-4" />}</button></div>
          </form>
        </ModalFrame>
      )}

       {editOpen && (
         <ModalFrame title="Edit Exchange post" eyebrow="Before pickup coordination is accepted" onClose={() => setEditOpen(false)} wide>
           <form onSubmit={submitEdit} className="space-y-4">
             <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm leading-relaxed text-muted-foreground">
               Updates go through the same safety review as a new post. Keep exact addresses, phone numbers, links, and payment details out of the post.
             </div>
             <div className="grid gap-3 sm:grid-cols-2">
               <div className="space-y-2"><FieldLabel htmlFor="edit-listing-type">Post type</FieldLabel><select id="edit-listing-type" value={editForm.listing_type} onChange={(event) => setEditForm((current) => ({ ...current, listing_type: event.target.value as ExchangeListingType }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="offer">Offer</option><option value="need">Need</option></select></div>
               <div className="space-y-2"><FieldLabel htmlFor="edit-resource-type">Resource</FieldLabel><select id="edit-resource-type" value={editForm.resource_type} onChange={(event) => setEditForm((current) => ({ ...current, resource_type: event.target.value as ExchangeResourceType }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="goods">Goods</option><option value="services">Services</option></select></div>
             </div>
             <div className="space-y-2"><FieldLabel htmlFor="edit-title">Short title</FieldLabel><input id="edit-title" required minLength={3} maxLength={100} value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" data-testid="input-edit-title" /></div>
             <div className="space-y-2"><FieldLabel htmlFor="edit-description">Description</FieldLabel><textarea id="edit-description" required minLength={10} maxLength={2000} rows={5} value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm" data-testid="input-edit-description" /></div>
             <div className="grid gap-3 sm:grid-cols-2">
               <div className="space-y-2"><FieldLabel htmlFor="edit-category">Category</FieldLabel><select id="edit-category" value={editForm.category} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value as ExchangeCategory }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div>
               <div className="space-y-2"><FieldLabel htmlFor="edit-condition">Condition / format</FieldLabel><select id="edit-condition" value={editForm.condition} onChange={(event) => setEditForm((current) => ({ ...current, condition: event.target.value as ExchangeCondition }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{conditions.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}</select></div>
             </div>
             <div className="space-y-2"><FieldLabel htmlFor="edit-neighborhood">Neighborhood or ZIP</FieldLabel><input id="edit-neighborhood" required minLength={2} maxLength={80} value={editForm.neighborhood} onChange={(event) => setEditForm((current) => ({ ...current, neighborhood: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" data-testid="input-edit-neighborhood" /></div>
             <div className="space-y-2"><FieldLabel htmlFor="edit-pickup-notes">Public pickup notes (optional)</FieldLabel><textarea id="edit-pickup-notes" maxLength={500} rows={3} value={editForm.pickup_notes} onChange={(event) => setEditForm((current) => ({ ...current, pickup_notes: event.target.value }))} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm" data-testid="input-edit-pickup-notes" /></div>
             {editError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="error-edit-listing">{editError}</p>}
             <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setEditOpen(false)} className="min-h-10 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button><button type="submit" disabled={editSubmitting} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60" data-testid="button-save-edit-listing">{editSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</button></div>
           </form>
         </ModalFrame>
       )}

      {selectedId !== null && (
        <ModalFrame title={selectedListing?.title || "Listing details"} eyebrow="Community post" onClose={() => setSelectedId(null)} wide>
          {detailLoading ? <div className="space-y-3" data-testid="loading-listing-detail"><div className="h-6 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-12 animate-pulse rounded-xl bg-muted" /></div> : detailError ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm" role="alert" data-testid="error-listing-detail">{detailError}</div> : selectedListing && <div className="space-y-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary">{selectedListing.listing_type === "need" ? "Need" : "Offer"}</span><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{selectedListing.resource_type}</span><span className="text-xs text-muted-foreground">Posted {formatDate(selectedListing.created_at)}</span></div><div><h3 className="text-2xl font-black tracking-tight">{selectedListing.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selectedListing.description}</p></div><div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-xs text-muted-foreground">Category</span><p className="mt-1 font-bold"><Tag className="mr-1.5 inline h-3.5 w-3.5 text-primary" />{selectedListing.category}</p></div><div className="rounded-xl border border-border bg-background/50 p-3"><span className="text-xs text-muted-foreground">Condition</span><p className="mt-1 font-bold">{selectedListing.condition.replaceAll("_", " ")}</p></div><div className="rounded-xl border border-border bg-background/50 p-3 sm:col-span-2"><span className="text-xs text-muted-foreground">Coarse area</span><p className="mt-1 font-bold"><MapPin className="mr-1.5 inline h-3.5 w-3.5 text-primary" />{selectedListing.neighborhood}</p>{selectedListing.pickup_notes && <p className="mt-2 text-xs text-muted-foreground">{selectedListing.pickup_notes}</p>}</div></div><div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><UserRound className="h-4 w-4 text-primary" /> Shared by {selectedListing.seller_name || "a verified neighbor"}</div>{selectedListing.status === "active" && <form onSubmit={submitPickupRequest} className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"><div><h4 className="font-black">{selectedListing.listing_type === "need" ? "Offer support" : "Ask to coordinate"}</h4><p className="mt-1 text-xs text-muted-foreground">Send a short note. Keep phone numbers, exact addresses, links, and payment details out of this space.</p></div><textarea required minLength={3} maxLength={1000} rows={3} value={requestForm.note} onChange={(event) => setRequestForm((current) => ({ ...current, note: event.target.value }))} placeholder={selectedListing.listing_type === "need" ? "I may be able to help with this…" : "I would be grateful to receive this…" } className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-pickup-note" /><div className="grid gap-3 sm:grid-cols-2"><input required minLength={2} maxLength={100} value={requestForm.pickup_area} onChange={(event) => setRequestForm((current) => ({ ...current, pickup_area: event.target.value }))} placeholder="Public pickup area" className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" aria-label="Public pickup area" data-testid="input-pickup-area" /><input required minLength={2} maxLength={120} value={requestForm.proposed_window} onChange={(event) => setRequestForm((current) => ({ ...current, proposed_window: event.target.value }))} placeholder="A time window" className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" aria-label="Proposed time window" data-testid="input-pickup-window" /></div><button type="submit" disabled={requestSubmitting} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-send-pickup-request">{requestSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Send coordination note</button></form>}<div className="flex justify-between gap-3 border-t border-border pt-4"><button type="button" onClick={() => setReportOpen(true)} className="text-xs font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-report-listing">Report a safety concern</button><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Keep it inside Niakofa</span></div></div>}
        </ModalFrame>
      )}

      {reportOpen && selectedListing && (
        <ModalFrame title="Report a safety concern" eyebrow="Community safety" onClose={() => setReportOpen(false)}>
          <form onSubmit={submitReport} className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">Tell the safety team what happened. Please do not include private contact information in the report.</p><div className="space-y-2"><FieldLabel htmlFor="report-type">Concern type</FieldLabel><select id="report-type" value={reportForm.type} onChange={(event) => setReportForm((current) => ({ ...current, type: event.target.value as ExchangeReportType }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="select-report-type"><option value="fraud">Fraud or misrepresentation</option><option value="harassment">Harassment</option><option value="dangerous_behavior">Dangerous behavior</option><option value="spam">Spam</option><option value="other">Other</option></select></div><div className="space-y-2"><FieldLabel htmlFor="report-description">What should we know?</FieldLabel><textarea id="report-description" required minLength={10} maxLength={2000} rows={5} value={reportForm.description} onChange={(event) => setReportForm((current) => ({ ...current, description: event.target.value }))} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" data-testid="input-report-description" /></div><button type="submit" disabled={reportSubmitting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary" data-testid="button-submit-report">{reportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Send to safety team</button></form>
        </ModalFrame>
      )}
    </section>
  );
}
