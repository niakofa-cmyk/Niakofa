import { useState, useEffect, type ReactElement } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, DollarSign, Heart, Gift, AlertTriangle, MapPin, Plus, Minus, Camera, X, ShieldCheck, Building2, User } from "lucide-react";
import { isSensitiveCategory } from "@workspace/trust-tiers";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/auth";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useCreateRequest, getGetRequestsQueryKey, getGetNearbyRequestsQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/AppContext";
import { useQueryClient } from "@tanstack/react-query";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxMap, { Marker } from "react-map-gl/mapbox";

type PaymentType = "immediate" | "pay_it_forward" | "goodwill";

const CATEGORIES = [
  // Community
  { value: "groceries",         label: "🛒 Groceries",         group: "Community" },
  { value: "transportation",    label: "🚗 Transportation",     group: "Community" },
  { value: "errands",           label: "📦 Errands",            group: "Community" },
  { value: "home_repair",       label: "🔧 Home Repair",        group: "Community" },
  { value: "medical",           label: "💊 Medical",            group: "Community" },
  { value: "emergency",         label: "🚨 Emergency",          group: "Community" },
  { value: "moving_labor",      label: "📦 Moving & Labor",     group: "Community" },
  { value: "pet_care",          label: "🐾 Pet Care",           group: "Community" },
  { value: "childcare",         label: "🧸 Childcare",          group: "Community" },
  { value: "senior_care",       label: "🧓 Senior Care",        group: "Community" },
  { value: "yard_work",         label: "🌿 Yard Work",          group: "Community" },
  { value: "tutoring",          label: "📚 Tutoring",           group: "Community" },
  { value: "cleaning",          label: "🧹 Cleaning",           group: "Community" },
  { value: "meal_prep",         label: "🍲 Meal Prep",          group: "Community" },
  { value: "paperwork",         label: "📄 Paperwork Help",     group: "Community" },
  { value: "local_farm",        label: "🌾 Local Farm",         group: "Community" },
  { value: "food_pantry",       label: "🥫 Food Pantry",        group: "Community" },
  // Business
  { value: "stock_shelves",     label: "📦 Stock Shelves",      group: "Business" },
  { value: "event_setup",       label: "🎪 Event Setup",        group: "Business" },
  { value: "delivery_run",      label: "🚚 Delivery Run",       group: "Business" },
  { value: "tech_support",      label: "💻 Tech Support",       group: "Business" },
  { value: "business_services", label: "💼 Business Services",  group: "Business" },
  // Catch-all
  { value: "other",             label: "📋 Other",              group: "Community" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

const formSchema = z.object({
  title: z.string().min(3, "Title is too short").max(80, "Title is too long"),
  description: z.string().optional(),
  category: z.enum([
    "groceries", "transportation", "errands", "home_repair", "medical", "emergency",
    "moving_labor", "pet_care", "childcare", "senior_care", "yard_work", "tutoring",
    "cleaning", "meal_prep", "paperwork", "local_farm", "food_pantry",
    "stock_shelves", "event_setup", "delivery_run", "tech_support", "business_services",
    "other",
  ] as [string, ...string[]]),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
  pay_it_forward_amount: z.number().optional(),
  pledge_amount: z.number().optional(),
});

const PAYMENT_OPTIONS: { type: PaymentType; label: string; desc: string; color: string; icon: ReactElement }[] = [
  {
    type: "immediate",
    label: "Pay Now",
    desc: "Compensate helper immediately upon completion",
    color: "border-green-500/60 bg-green-500/10 text-green-400",
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    type: "pay_it_forward",
    label: "Pay It Forward",
    desc: "Can't afford it today? Pay it forward when you're able — no judgment, no pressure.",
    color: "border-primary/60 bg-primary/10 text-primary",
    icon: <Heart className="w-5 h-5" />,
  },
  {
    type: "goodwill",
    label: "Goodwill",
    desc: "Volunteer help — no payment expected",
    color: "border-purple-500/60 bg-purple-500/10 text-purple-400",
    icon: <Gift className="w-5 h-5" />,
  },
];

const COMMUNITY_CATS = CATEGORIES.filter(c => c.group === "Community");
const BUSINESS_CATS = CATEGORIES.filter(c => c.group === "Business");

const DRAFT_KEY = "niakofa_request_draft";

interface PendingPayment {
  clientSecret: string;
  amount: number;
  requestTitle: string;
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function NewRequestScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, myLocation, userPlace } = useAppContext();
  const queryClient = useQueryClient();
  const createMutation = useCreateRequest();
  const [paymentType, setPaymentType] = useState<PaymentType>("pay_it_forward");
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const [webGLSupported] = useState(checkWebGL);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pinLocation, setPinLocation] = useState<{ lat: number; lng: number } | null>(
    myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "other",
      urgency: "medium",
    },
  });

  const urgency = form.watch("urgency");
  const selectedCategory = form.watch("category");
  const isSensitive = isSensitiveCategory(selectedCategory);
  const [sensitiveAcknowledged, setSensitiveAcknowledged] = useState(false);

  // ── Business "posting as" state ────────────────────────────────────────────
  const [myBusinesses, setMyBusinesses] = useState<{ id: number; display_name: string }[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);

  // Reset the acknowledgment whenever the user switches category — consent
  // must be given for the specific sensitive category being posted.
  useEffect(() => {
    setSensitiveAcknowledged(false);
  }, [selectedCategory]);

  // Fetch approved businesses the user belongs to (for "posting as" switcher)
  useEffect(() => {
    if (!currentUser) return;
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/businesses/mine`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; display_name: string; approval_status?: string }[]) => {
        if (Array.isArray(data)) {
          setMyBusinesses(data.filter(b => !b.approval_status || b.approval_status === "approved"));
        }
      })
      .catch(() => {});
  }, [currentUser]);

  // When switching TO a business, always default to immediate payment (pay now).
  // A business should never default to free volunteer work.
  // The user can still manually choose goodwill after the switch —
  // this only fires on the transition to a selected business, not on every render.
  // Dependency: only [selectedBusinessId] so manual payment-type changes by the user
  // after picking a business are not overwritten.
  useEffect(() => {
    if (selectedBusinessId !== null) {
      setPaymentType("immediate");
    }
  }, [selectedBusinessId]);

  // Offline draft: restore on mount, auto-save on every change, clear on successful submit
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const vals = JSON.parse(saved) as Record<string, unknown>;
        form.reset({
          title:       String(vals.title ?? ""),
          description: String(vals.description ?? ""),
          category:    String(vals.category ?? "other"),
          urgency:     (vals.urgency as "low" | "medium" | "high" | "emergency") ?? "medium",
        });
        toast({ title: "✏️ Draft restored", description: "Your previous unfinished request has been loaded." });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = form.watch(vals => {
      if (vals.title) {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(vals)); } catch {}
      }
    });
    return () => sub.unsubscribe();
  }, [form]);

  // Sync pinLocation from GPS when it first becomes available
  useEffect(() => {
    if (myLocation && !pinLocation) {
      setPinLocation({ lat: myLocation.lat, lng: myLocation.lng });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation]);

  const finishAndNavigate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
    if (myLocation) {
      queryClient.invalidateQueries({ queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation.lat, lng: myLocation.lng }) });
    }
    setLocation("/");
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Photo must be under 5MB");
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const original = ev.target?.result as string;
      // Compress to max 800px on client side
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!currentUser || !pinLocation) {
      toast({ title: "Error", description: "Please confirm your pickup location on the map", variant: "destructive" });
      return;
    }

    if (isSensitive && !sensitiveAcknowledged) {
      toast({
        title: "One more step",
        description: "Please read and check the care acknowledgment before posting this request.",
        variant: "destructive",
      });
      return;
    }

    // Append checklist and accessibility needs to description
    const extras: string[] = [];
    const filledItems = checklistItems.filter(i => i.trim());
    if (filledItems.length > 0) {
      extras.push("Items needed:\n" + filledItems.map(i => `• ${i}`).join("\n"));
    }
    if (accessibilityNeeds.length > 0) {
      const labels: Record<string, string> = {
        wheelchair: "Wheelchair accessible location",
        female_helper: "Prefer female helper",
        pet_friendly: "Pet-friendly",
        non_smoking: "Non-smoking",
      };
      extras.push("Needs: " + accessibilityNeeds.map(n => labels[n] ?? n).join(", "));
    }
    const fullDescription = [values.description, ...extras].filter(Boolean).join("\n\n");

    createMutation.mutate({
      data: {
        title: values.title,
        description: fullDescription || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: values.category as any,
        urgency: values.urgency as any,
        payment_type: paymentType,
        requester_id: currentUser.id,
        lat: pinLocation.lat,
        lng: pinLocation.lng,
        neighborhood: userPlace?.city ?? userPlace?.county ?? undefined,
        pay_it_forward_amount: values.pay_it_forward_amount,
        pledge_amount: values.pledge_amount,
        ...(isSensitive ? { sensitive_acknowledged: true } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(photoDataUrl ? { photo_url: photoDataUrl } as any : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(selectedBusinessId !== null ? { business_id: selectedBusinessId } as any : {}),
      }
    }, {
      onSuccess: async (request) => {
        localStorage.removeItem(DRAFT_KEY);

        // Staff posts under a business go to the owner approval queue first.
        if (request.status === "pending_owner_approval") {
          toast({
            title: "⏳ Sent to owner approval",
            description: "Your request is pending approval from the business owner before it goes live.",
          });
          finishAndNavigate();
          return;
        }

        toast({ title: "📍 Request posted!", description: "Nearby helpers have been notified in real time." });

        // ── Pay Now: create PaymentIntent and show Stripe checkout ──────────
        const amount = values.pay_it_forward_amount;
        if (paymentType === "immediate" && amount && amount > 0 && isStripeConfigured()) {
          setCreatingPaymentIntent(true);
          try {
            const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
            const res = await fetch(`${base}/api/stripe/payment-intent`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                requestId: request.id,
                amount,
                requesterId: currentUser.id,
              }),
            });

            if (res.ok) {
              const { clientSecret } = await res.json() as { clientSecret: string };
              setPendingPayment({ clientSecret, amount, requestTitle: values.title });
              return; // wait for payment modal to complete
            } else {
              const err = await res.json() as { error?: string; setup?: string };
              if (res.status === 503) {
                toast({
                  title: "Stripe not configured",
                  description: err.setup ?? "Ask the admin to add the Stripe API key to enable real payments.",
                });
              } else {
                toast({ title: "Could not create payment", description: err.error ?? "Please try again.", variant: "destructive" });
              }
            }
          } catch {
            toast({ title: "Network error — payment skipped", variant: "destructive" });
          } finally {
            setCreatingPaymentIntent(false);
          }
        }

        finishAndNavigate();
      },
      onError: (err) => {
        toast({ title: "Failed to post request", description: String(err), variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4 pt-safe flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-widest">New Request</h1>
          <p className="text-xs text-muted-foreground">Helpers are notified in real time</p>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto">
        <div className="max-w-md mx-auto space-y-6">
          {urgency === "emergency" && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-3 flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
              <div>
                <div className="font-bold text-sm">Emergency Request</div>
                <div className="text-xs opacity-80">This will be dispatched to helpers with highest priority</div>
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">What do you need?</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Ride to pharmacy, grocery pickup..." className="bg-card border-border text-base py-5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-card border-border h-11">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Community</div>
                          {COMMUNITY_CATS.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}{isSensitiveCategory(c.value) ? " 🛡️" : ""}
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-t border-border mt-1 pt-2">Business</div>
                          {BUSINESS_CATS.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Urgency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className={`bg-card border-border h-11 ${field.value === 'emergency' ? 'text-destructive font-bold' : ''}`}>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high" className="text-orange-500">High</SelectItem>
                          <SelectItem value="emergency" className="text-destructive font-bold">🚨 Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {isSensitive && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-bold">Extra safeguards apply to this category</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Because this request involves care for a vulnerable person, only <span className="font-semibold text-foreground">Verified Helpers</span> who
                    have completed identity verification can claim it. It may take a little longer to get matched.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sensitiveAcknowledged}
                      onChange={(e) => setSensitiveAcknowledged(e.target.checked)}
                      className="mt-0.5 w-5 h-5 accent-amber-500 shrink-0"
                      data-testid="checkbox-sensitive-acknowledge"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I understand that Niakofa is a community mutual-aid network — <span className="font-semibold text-foreground">not a licensed childcare, homecare, or medical provider</span> —
                      and that I am responsible for vetting the helper (meeting them, checking their profile and reviews) before care begins.
                    </span>
                  </label>
                </div>
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Details (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Specific instructions, building code, special considerations..."
                        className="bg-card border-border min-h-[90px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Item Checklist — §3.1.4 Request specificity */}
              {checklistItems.length > 0 || true ? (
                <div>
                  <div className="uppercase tracking-wider text-xs text-muted-foreground mb-2 font-medium">Item Checklist (optional)</div>
                  <div className="space-y-2">
                    {checklistItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={e => setChecklistItems(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                          placeholder={`Item ${i + 1}`}
                          className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setChecklistItems(prev => prev.filter((_, j) => j !== i))}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {checklistItems.length < 8 && (
                      <button
                        type="button"
                        onClick={() => setChecklistItems(prev => [...prev, ""])}
                        className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors py-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add item
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Accessibility Needs — §4.5 */}
              <div>
                <div className="uppercase tracking-wider text-xs text-muted-foreground mb-2 font-medium">Accessibility Needs</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "wheelchair", label: "♿ Wheelchair access" },
                    { id: "female_helper", label: "👩 Prefer female helper" },
                    { id: "pet_friendly", label: "🐾 Pet-friendly" },
                    { id: "non_smoking", label: "🚭 Non-smoking" },
                  ].map(opt => (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all text-xs font-medium ${
                        accessibilityNeeds.includes(opt.id)
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={accessibilityNeeds.includes(opt.id)}
                        onChange={e => setAccessibilityNeeds(prev =>
                          e.target.checked ? [...prev, opt.id] : prev.filter(v => v !== opt.id)
                        )}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Photo Upload — optional */}
              <div>
                <div className="uppercase tracking-wider text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  Add a Photo <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-normal tracking-normal">(optional — helps your helper)</span>
                </div>
                {photoDataUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img src={photoDataUrl} alt="Request photo" className="w-full max-h-48 object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl(null)}
                      className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-card">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tap to take or upload a photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={handlePhotoChange}
                    />
                  </label>
                )}
                {photoError && <p className="text-xs text-destructive mt-1">{photoError}</p>}
              </div>

              {/* ── Location Picker ─────────────────────────────────────── */}
              <div>
                <div className="uppercase tracking-wider text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Pickup Location
                  <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-normal tracking-normal">Tap or drag pin to adjust</span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-border bg-card" style={{ height: 180 }}>
                  {webGLSupported && pinLocation ? (
                    <MapboxMap
                      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                      initialViewState={{ longitude: pinLocation.lng, latitude: pinLocation.lat, zoom: 14 }}
                      style={{ width: "100%", height: "100%" }}
                      mapStyle="mapbox://styles/mapbox/dark-v11"
                      attributionControl={false}
                      onClick={(e) => setPinLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
                    >
                      <Marker
                        longitude={pinLocation.lng}
                        latitude={pinLocation.lat}
                        anchor="bottom"
                        draggable
                        onDragEnd={(e) => setPinLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
                      >
                        <div className="text-2xl drop-shadow-lg select-none">📍</div>
                      </Marker>
                    </MapboxMap>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <MapPin className="w-8 h-8 text-primary" />
                      <span className="text-xs">
                        {pinLocation
                          ? `${pinLocation.lat.toFixed(5)}, ${pinLocation.lng.toFixed(5)}`
                          : "Waiting for GPS…"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5 min-h-[16px]">
                  <span className="text-[10px] text-muted-foreground">
                    {pinLocation ? `📍 ${pinLocation.lat.toFixed(5)}, ${pinLocation.lng.toFixed(5)}` : ""}
                  </span>
                  {myLocation && pinLocation &&
                    (Math.abs(pinLocation.lat - myLocation.lat) > 0.00001 || Math.abs(pinLocation.lng - myLocation.lng) > 0.00001) && (
                    <button
                      type="button"
                      onClick={() => setPinLocation({ lat: myLocation.lat, lng: myLocation.lng })}
                      className="text-[10px] text-primary underline"
                    >
                      Reset to my GPS
                    </button>
                  )}
                </div>
              </div>

              {/* Posting As Switcher — appears only when user belongs to ≥1 approved business */}
              {myBusinesses.length > 0 && (
                <div>
                  <div className="uppercase tracking-wider text-xs text-muted-foreground mb-2 font-medium">Posting As</div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBusinessId(null)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        selectedBusinessId === null
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card/50 hover:border-border/80"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className={`text-xs font-black ${selectedBusinessId === null ? "text-primary" : "text-foreground"}`}>Myself</div>
                        <div className="text-[10px] text-muted-foreground">Personal request</div>
                      </div>
                    </button>
                    {myBusinesses.map(biz => (
                      <button
                        key={biz.id}
                        type="button"
                        onClick={() => setSelectedBusinessId(biz.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          selectedBusinessId === biz.id
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-border bg-card/50 hover:border-border/80"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <div className={`text-xs font-black ${selectedBusinessId === biz.id ? "text-blue-500" : "text-foreground"}`}>{biz.display_name}</div>
                          <div className="text-[10px] text-muted-foreground">Business request · pay-it-forward unavailable</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Three-Tier Payment Selector */}
              <div>
                <div className="uppercase tracking-wider text-xs text-muted-foreground mb-3 font-medium">Assistance Type</div>
                <div className="grid grid-cols-3 gap-2">
                  {(selectedBusinessId !== null ? PAYMENT_OPTIONS.filter(o => o.type !== "pay_it_forward") : PAYMENT_OPTIONS).map(opt => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => setPaymentType(opt.type)}
                      className={`relative flex flex-col items-center text-center p-3 rounded-xl border-2 transition-all ${
                        paymentType === opt.type ? opt.color : 'border-border bg-card/50 text-muted-foreground hover:border-border/80'
                      }`}
                    >
                      <div className="mb-1.5">{opt.icon}</div>
                      <div className="text-[11px] font-black uppercase tracking-wide leading-tight">{opt.label}</div>
                      {paymentType === opt.type && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-current opacity-80" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {PAYMENT_OPTIONS.find(o => o.type === paymentType)?.desc}
                </p>
              </div>

              {paymentType === "immediate" && (
                <FormField
                  control={form.control}
                  name="pay_it_forward_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Amount to Pay ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g. 15.00"
                          className="bg-card border-border"
                          {...field}
                          onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      {isStripeConfigured() ? (
                        <p className="text-xs text-green-400 mt-1">You'll confirm payment via Stripe after posting.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">Stripe must be configured to enable real card payments.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {paymentType === "pay_it_forward" && (
                <FormField
                  control={form.control}
                  name="pledge_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Pledge Amount (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Any amount, when you're able"
                          className="bg-card border-border"
                          {...field}
                          onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">No pressure — any contribution helps sustain the community</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button
                type="submit"
                className="w-full h-13 text-base font-black tracking-widest uppercase"
                disabled={!pinLocation || createMutation.isPending || creatingPaymentIntent}
              >
                {createMutation.isPending || creatingPaymentIntent ? "Posting..." : "📍 Post Request"}
              </Button>

              {!pinLocation && (
                <p className="text-xs text-yellow-500 text-center">Waiting for GPS to set your location...</p>
              )}
            </form>
          </Form>
        </div>
      </div>

      {/* Stripe Payment Modal — shown after request is created for immediate payments */}
      {pendingPayment && (
        <StripePaymentModal
          clientSecret={pendingPayment.clientSecret}
          amount={pendingPayment.amount}
          description={`Pay your helper for: "${pendingPayment.requestTitle}". Your helper receives the funds when the request is completed.`}
          onSuccess={() => {
            setPendingPayment(null);
            toast({ title: "Payment confirmed!", description: "Your helper will be paid automatically upon completion." });
            finishAndNavigate();
          }}
          onSkip={() => {
            setPendingPayment(null);
            toast({ title: "Payment skipped", description: "You can pay from your wallet later." });
            finishAndNavigate();
          }}
          onClose={() => {
            setPendingPayment(null);
            finishAndNavigate();
          }}
        />
      )}
    </div>
  );
}
