import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Calendar, DollarSign, Heart, ChevronLeft, ChevronRight,
  Loader2, Zap, Clock, Users, Sparkles, CheckCircle2
} from "lucide-react";
import { Button } from "./ui/button";
import type { HelpRequest } from "@workspace/api-client-react";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

interface RepaymentSchedulerModalProps {
  open: boolean;
  onClose: () => void;
  request: HelpRequest | null;
  /** Called for single-payment scheduling (existing flow) */
  onSchedule: (date: Date, amount: number) => void;
  isScheduling?: boolean;
  userId?: number | null;
}

// ── Payment plan definitions ────────────────────────────────────────────────
type PlanMode = "one_time" | "installments_2" | "installments_4";
type Period = "days_2" | "weeks_2" | "months_2" | "years_2";

interface PlanOption {
  mode: PlanMode;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface PeriodOption {
  period: Period;
  label: string;
  shortLabel: string;
  days: number;
}

const PLAN_OPTIONS: PlanOption[] = [
  {
    mode: "one_time",
    label: "One-Time",
    icon: <Zap className="w-4 h-4" />,
    description: "Pick a single date to pay it all forward",
  },
  {
    mode: "installments_2",
    label: "2 Payments",
    icon: <Clock className="w-4 h-4" />,
    description: "Split into 2 equal payments",
  },
  {
    mode: "installments_4",
    label: "4 Payments",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Spread across 4 equal payments",
  },
];

const PERIOD_OPTIONS: PeriodOption[] = [
  { period: "days_2",   label: "Over 2 days",   shortLabel: "2 days",   days: 2 },
  { period: "weeks_2",  label: "Over 2 weeks",  shortLabel: "2 weeks",  days: 14 },
  { period: "months_2", label: "Over 2 months", shortLabel: "2 months", days: 60 },
  { period: "years_2",  label: "Over 2 years",  shortLabel: "2 years",  days: 730 },
];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const AMOUNT_PRESETS = [5, 10, 15, 25, 50];

function MiniCalendar({
  selectedDate, onSelect, minDate,
}: {
  selectedDate: Date | null;
  onSelect: (d: Date) => void;
  minDate: Date;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-black">{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const cellDate = new Date(viewYear, viewMonth, day);
          const isPast = cellDate < minDate;
          const isSelected =
            selectedDate &&
            selectedDate.getFullYear() === viewYear &&
            selectedDate.getMonth() === viewMonth &&
            selectedDate.getDate() === day;
          const isToday =
            today.getFullYear() === viewYear &&
            today.getMonth() === viewMonth &&
            today.getDate() === day;

          return (
            <button
              key={day}
              disabled={isPast}
              onClick={() => onSelect(cellDate)}
              className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isPast
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : isToday
                  ? "border border-primary/50 text-primary hover:bg-primary/10"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Add `days` calendar days to a date (skips nothing — simple offset) */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Compute installment due dates evenly spread across the full period.
 *
 * Contract: first payment on startDate (day 0), last payment on day periodDays.
 * Formula: payment_i = startDate + round(i * periodDays / (count - 1))
 *
 * Edge case: count === 1 → single payment on startDate.
 *
 * Examples:
 *   2 payments / 60 days → day 0, day 60          (60-day span ✓)
 *   4 payments / 14 days → day 0, day 5, day 9, day 14  (14-day span ✓)
 *   2 payments /  2 days → day 0, day 2            (2-day span  ✓)
 */
export function computeInstallmentDates(
  startDate: Date,
  installmentCount: number,
  periodDays: number,
): Date[] {
  if (installmentCount <= 1) return [new Date(startDate)];
  return Array.from({ length: installmentCount }, (_, i) => {
    const offsetDays = Math.round((i * periodDays) / (installmentCount - 1));
    return addDays(startDate, offsetDays);
  });
}

/** Impact story: "Your $X helped Y more neighbors" */
function ImpactBanner({ total }: { total: number }) {
  const neighborsHelped = Math.floor(total / 5);
  if (neighborsHelped < 1) return null;
  const icons = Array.from({ length: Math.min(neighborsHelped, 8) }, (_, i) => i);
  return (
    <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-start gap-3">
      <Heart className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="text-xs leading-relaxed">
        <span className="font-black text-primary">${total.toFixed(2)}</span> paid forward keeps the cycle going —
        your contribution helped <span className="font-black text-primary">{neighborsHelped}+</span> more neighbors.
        <div className="flex gap-0.5 mt-1.5 flex-wrap">
          {icons.map(i => (
            <span key={i} className="text-sm">🤝</span>
          ))}
          {neighborsHelped > 8 && <span className="text-xs text-muted-foreground ml-1">+{neighborsHelped - 8} more</span>}
        </div>
      </div>
    </div>
  );
}

export function RepaymentSchedulerModal({
  open,
  onClose,
  request,
  onSchedule,
  isScheduling = false,
  userId,
}: RepaymentSchedulerModalProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [planMode, setPlanMode] = useState<PlanMode>("one_time");
  const [period, setPeriod] = useState<Period>("weeks_2");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [amount, setAmount] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);

  const outstanding = request ? (request.pledge_amount ?? 0) - (request.pledge_paid ?? 0) : 0;
  const maxAmount = Math.max(outstanding, 100);

  const isInstallments = planMode !== "one_time";
  const installmentCount = planMode === "installments_4" ? 4 : 2;
  const periodOption = PERIOD_OPTIONS.find(p => p.period === period) ?? PERIOD_OPTIONS[1];

  const amountPerInstallment = useMemo(() => {
    if (!isInstallments) return amount;
    return parseFloat((amount / installmentCount).toFixed(2));
  }, [amount, installmentCount, isInstallments]);

  // Compute installment schedule for preview
  const installmentDates = useMemo(() => {
    if (!isInstallments || !selectedDate) return [];
    return computeInstallmentDates(selectedDate, installmentCount, periodOption.days);
  }, [isInstallments, selectedDate, installmentCount, periodOption.days]);

  const handleOneTimeSchedule = () => {
    if (!selectedDate) return;
    onSchedule(selectedDate, amount);
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
      reset();
      onClose();
    }, 2200);
  };

  const handleInstallmentPlan = async () => {
    if (!selectedDate || !request || !userId) return;
    setPlanLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/requests/${request.id}/repayment-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          plan_type: planMode,
          period,
          total_amount: amount,
          installment_count: installmentCount,
          start_date: selectedDate.toISOString(),
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string; plan_id?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed to create plan");
      toast({
        title: "Repayment plan created! 💙",
        description: `${installmentCount} payments of $${amountPerInstallment.toFixed(2)} scheduled over ${periodOption.shortLabel}. We'll remind you — no pressure.`,
      });
      setConfirmed(true);
      setTimeout(() => {
        setConfirmed(false);
        reset();
        onClose();
      }, 2200);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not create plan", variant: "destructive" });
    } finally {
      setPlanLoading(false);
    }
  };

  const handleConfirm = () => {
    if (isInstallments) {
      handleInstallmentPlan();
    } else {
      handleOneTimeSchedule();
    }
  };

  const reset = () => {
    setSelectedDate(null);
    setAmount(10);
    setConfirmed(false);
    setPlanMode("one_time");
    setPeriod("weeks_2");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isLoading = isScheduling || planLoading;
  const canConfirm = !!selectedDate && !isLoading;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[60] backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 230 }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card border-t border-border rounded-t-3xl shadow-2xl max-h-[94dvh] overflow-y-auto"
          >
            <div className="p-5 space-y-5 pb-8">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">Flexible Repayment</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Request context */}
              {request && (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
                  <div className="text-sm font-bold truncate">{request.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-primary" />
                    Outstanding: <span className="text-yellow-400 font-bold ml-1">${outstanding.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Success state */}
              {confirmed ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-10"
                >
                  <div className="text-6xl mb-3">💙</div>
                  <div className="font-black text-xl text-primary">
                    {isInstallments ? "Plan Created!" : "Scheduled!"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {isInstallments
                      ? `${installmentCount} payments of $${amountPerInstallment.toFixed(2)} starting ${selectedDate?.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
                      : `$${amount.toFixed(2)} on ${selectedDate?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                    }
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-green-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    We'll send reminders when payments are due
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Plan type selector */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Plan</div>
                    <div className="grid grid-cols-3 gap-2">
                      {PLAN_OPTIONS.map(plan => (
                        <button
                          key={plan.mode}
                          onClick={() => setPlanMode(plan.mode)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                            planMode === plan.mode
                              ? "bg-primary/15 border-primary text-primary"
                              : "bg-background border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {plan.icon}
                          <span className="text-[11px] font-black leading-tight">{plan.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      {PLAN_OPTIONS.find(p => p.mode === planMode)?.description}
                    </p>
                  </div>

                  {/* Period selector — only for installment plans */}
                  <AnimatePresence>
                    {isInstallments && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> Spread Over
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {PERIOD_OPTIONS.map(opt => (
                            <button
                              key={opt.period}
                              onClick={() => setPeriod(opt.period)}
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                                period === opt.period
                                  ? "bg-primary/15 border-primary text-primary"
                                  : "bg-background border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Amount selector */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Total Amount
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-primary">${amount.toFixed(2)}</div>
                        {isInstallments && (
                          <div className="text-[10px] text-muted-foreground">
                            {installmentCount} × ${amountPerInstallment.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    <input
                      type="range"
                      min={1}
                      max={maxAmount}
                      step={1}
                      value={amount}
                      onChange={e => setAmount(Number(e.target.value))}
                      className="w-full accent-[hsl(190,100%,50%)] h-2 rounded-full cursor-pointer"
                    />

                    <div className="flex gap-2">
                      {AMOUNT_PRESETS.filter(p => p <= maxAmount + 10).map(preset => (
                        <button
                          key={preset}
                          onClick={() => setAmount(preset)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all ${
                            amount === preset
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          ${preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Calendar — "first payment date" or "payment date" */}
                  <div className="bg-background/60 rounded-2xl p-4 border border-border">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {isInstallments ? "First Payment Date" : "Payment Date"}
                    </div>
                    <MiniCalendar
                      selectedDate={selectedDate}
                      onSelect={setSelectedDate}
                      minDate={today}
                    />
                  </div>

                  {/* Installment schedule preview */}
                  <AnimatePresence>
                    {isInstallments && selectedDate && installmentDates.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                      >
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Your Repayment Schedule
                        </div>
                        <div className="space-y-1.5">
                          {installmentDates.map((date, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-black text-primary">
                                  {i + 1}
                                </div>
                                <span className="text-xs font-semibold text-foreground">
                                  {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                </span>
                              </div>
                              <span className="text-xs font-black text-primary">${amountPerInstallment.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Single payment preview */}
                  {!isInstallments && selectedDate && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground"
                    >
                      <span className="text-primary font-bold">${amount.toFixed(2)}</span> will be set for{" "}
                      <span className="text-foreground font-bold">
                        {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </span>
                      . No pressure — you can adjust anytime.
                    </motion.div>
                  )}

                  {/* Impact banner */}
                  {amount >= 5 && <ImpactBanner total={amount} />}

                  {/* Confirm button */}
                  <Button
                    className="w-full h-12 font-black"
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                      </span>
                    ) : isInstallments ? (
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Create {installmentCount}-Payment Plan
                      </span>
                    ) : (
                      "💙 Schedule Repayment"
                    )}
                  </Button>

                  <p className="text-[10px] text-muted-foreground text-center">
                    Pay when you can. No penalties, no deadlines — just community. 💙
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
