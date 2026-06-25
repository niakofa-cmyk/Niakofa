import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, DollarSign, Heart, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import type { HelpRequest } from "@workspace/api-client-react";

interface RepaymentSchedulerModalProps {
  open: boolean;
  onClose: () => void;
  request: HelpRequest | null;
  onSchedule: (date: Date, amount: number) => void;
  isScheduling?: boolean;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function MiniCalendar({
  selectedDate,
  onSelect,
  minDate,
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

const AMOUNT_PRESETS = [5, 10, 15, 25, 50];

export function RepaymentSchedulerModal({
  open,
  onClose,
  request,
  onSchedule,
  isScheduling = false,
}: RepaymentSchedulerModalProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [amount, setAmount] = useState(10);
  const [scheduled, setScheduled] = useState(false);

  const outstanding = request ? (request.pledge_amount ?? 0) - (request.pledge_paid ?? 0) : 0;
  const maxAmount = Math.max(outstanding, 100);

  const handleSchedule = () => {
    if (!selectedDate) return;
    onSchedule(selectedDate, amount);
    setScheduled(true);
    setTimeout(() => {
      setScheduled(false);
      setSelectedDate(null);
      setAmount(10);
      onClose();
    }, 2000);
  };

  const handleClose = () => {
    setSelectedDate(null);
    setAmount(10);
    setScheduled(false);
    onClose();
  };

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
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card border-t border-border rounded-t-3xl shadow-2xl max-h-[96dvh] overflow-y-auto pb-safe"
          >
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="font-black text-lg">Schedule Repayment</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close" className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {request && (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
                  <div className="text-sm font-bold truncate">{request.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-primary" />
                    Outstanding: <span className="text-yellow-400 font-bold ml-1">${outstanding.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {scheduled ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-8"
                >
                  <div className="text-5xl mb-3">💙</div>
                  <div className="font-black text-lg text-primary">Scheduled!</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    ${amount.toFixed(2)} on {selectedDate?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </div>
                </motion.div>
              ) : (
                <>
                  <div className="bg-background/60 rounded-2xl p-4 border border-border">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Pick a Date
                    </div>
                    <MiniCalendar
                      selectedDate={selectedDate}
                      onSelect={setSelectedDate}
                      minDate={today}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Amount
                      </div>
                      <div className="text-xl font-black text-primary">${amount.toFixed(2)}</div>
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

                  {selectedDate && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground"
                    >
                      <span className="text-primary font-bold">${amount.toFixed(2)}</span> will be sent on{" "}
                      <span className="text-foreground font-bold">
                        {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </span>
                      . No pressure — you can adjust anytime.
                    </motion.div>
                  )}

                  <Button
                    className="w-full h-12 font-black"
                    onClick={handleSchedule}
                    disabled={!selectedDate || isScheduling}
                  >
                    {isScheduling ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                      </span>
                    ) : "💙 Schedule Repayment"}
                  </Button>

                  <p className="text-[10px] text-muted-foreground text-center pb-2">
                    Pay when you can. No penalties, no deadlines — just community.
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
