import { useState, type ReactElement } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, DollarSign, Heart, Gift, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useCreateRequest, getGetRequestsQueryKey, getGetNearbyRequestsQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/AppContext";
import { useQueryClient } from "@tanstack/react-query";
import { StripePaymentModal, isStripeConfigured } from "@/components/StripePaymentModal";

type PaymentType = "immediate" | "pay_it_forward" | "goodwill";

const CATEGORIES = [
  // Community
  { value: "groceries",      label: "🛒 Groceries",       group: "Community" },
  { value: "transportation", label: "🚗 Transportation",   group: "Community" },
  { value: "errands",        label: "📦 Errands",          group: "Community" },
  { value: "home_repair",    label: "🔧 Home Repair",      group: "Community" },
  { value: "medical",        label: "💊 Medical",          group: "Community" },
  { value: "emergency",      label: "🚨 Emergency",        group: "Community" },
  // Business
  { value: "stock_shelves",  label: "📦 Stock Shelves",    group: "Business" },
  { value: "event_setup",    label: "🎪 Event Setup",      group: "Business" },
  { value: "delivery",       label: "🚚 Delivery Run",     group: "Business" },
  { value: "tech_support",   label: "💻 Tech Support",     group: "Business" },
  // Catch-all
  { value: "other",          label: "📋 Other",            group: "Community" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

const formSchema = z.object({
  title: z.string().min(3, "Title is too short").max(80, "Title is too long"),
  description: z.string().optional(),
  category: z.enum([
    "groceries", "transportation", "errands", "home_repair", "medical", "emergency",
    "stock_shelves", "event_setup", "delivery", "tech_support", "other",
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

interface PendingPayment {
  clientSecret: string;
  amount: number;
  requestTitle: string;
}

export default function NewRequestScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, myLocation } = useAppContext();
  const queryClient = useQueryClient();
  const createMutation = useCreateRequest();
  const [paymentType, setPaymentType] = useState<PaymentType>("pay_it_forward");
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);

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

  const finishAndNavigate = () => {
    if (!myLocation) { setLocation("/"); return; }
    queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation.lat, lng: myLocation.lng }) });
    setLocation("/");
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!currentUser || !myLocation) {
      toast({ title: "Error", description: "Missing user or location data", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      data: {
        title: values.title,
        description: values.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: values.category as any,
        urgency: values.urgency as any,
        payment_type: paymentType,
        requester_id: currentUser.id,
        lat: myLocation.lat,
        lng: myLocation.lng,
        pay_it_forward_amount: values.pay_it_forward_amount,
        pledge_amount: values.pledge_amount,
      }
    }, {
      onSuccess: async (request) => {
        toast({ title: "📍 Request posted!", description: "Nearby helpers have been notified in real time." });

        // ── Pay Now: create PaymentIntent and show Stripe checkout ──────────
        const amount = values.pay_it_forward_amount;
        if (paymentType === "immediate" && amount && amount > 0 && isStripeConfigured()) {
          setCreatingPaymentIntent(true);
          try {
            const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
            const res = await fetch(`${base}/api/stripe/payment-intent`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-wider text-xs text-muted-foreground">Details (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Specific instructions, building code, accessibility needs..."
                        className="bg-card border-border min-h-[90px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Three-Tier Payment Selector */}
              <div>
                <div className="uppercase tracking-wider text-xs text-muted-foreground mb-3 font-medium">Assistance Type</div>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map(opt => (
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
                disabled={!myLocation || createMutation.isPending || creatingPaymentIntent}
              >
                {createMutation.isPending || creatingPaymentIntent ? "Posting..." : "📍 Post Request"}
              </Button>

              {!myLocation && (
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
