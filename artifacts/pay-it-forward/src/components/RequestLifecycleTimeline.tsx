import { CheckCircle2, ClipboardList, HeartHandshake, MapPin, Navigation2, UserCheck, XCircle } from "lucide-react";

type LifecycleStep = {
  key: string;
  label: string;
  icon: typeof ClipboardList;
};

const LIFECYCLE_STEPS: LifecycleStep[] = [
  { key: "open", label: "Requested", icon: ClipboardList },
  { key: "claimed", label: "Claimed", icon: UserCheck },
  { key: "en_route", label: "En route", icon: Navigation2 },
  { key: "arrived", label: "Arrived", icon: MapPin },
  { key: "helping", label: "Helping", icon: HeartHandshake },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

const STATUS_INDEX: Record<string, number> = {
  open: 0,
  claimed: 1,
  en_route: 2,
  helping: 4,
  arrived: 4,
  completed: 5,
};

const STATUS_SUMMARY: Record<string, string> = {
  open: "Waiting for a helper",
  claimed: "Helper matched",
  en_route: "Helper is on the way",
  helping: "Helping now",
  arrived: "Helping now",
  completed: "Request completed",
  cancelled: "Request cancelled",
};

export function requestLifecycleLabel(status: string): string {
  return STATUS_SUMMARY[status] ?? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lifecycleIndex(status: string): number {
  return STATUS_INDEX[status] ?? 0;
}

export function RequestLifecycleTimeline({
  status,
  compact = false,
  className = "",
}: {
  status: string;
  compact?: boolean;
  className?: string;
}) {
  const cancelled = status === "cancelled";
  const activeIndex = lifecycleIndex(status);
  const summary = requestLifecycleLabel(status);

  if (cancelled) {
    return (
      <div className={`flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs ${className}`}>
        <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="font-bold text-destructive">{summary}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-border/80 bg-background/45 ${compact ? "px-3 py-2.5" : "px-3 py-3"} ${className}`}
      aria-label={`Request lifecycle: ${summary}`}
    >
      <div className="relative flex items-start gap-0 overflow-x-auto" aria-hidden={compact ? "true" : undefined}>
        <div className="absolute left-[8%] right-[8%] top-3 h-0.5 bg-border" />
        <div
          className="absolute left-[8%] top-3 h-0.5 rounded-full bg-primary transition-all"
          style={{ width: `${activeIndex >= LIFECYCLE_STEPS.length - 1 ? 84 : (activeIndex / (LIFECYCLE_STEPS.length - 1)) * 84}%` }}
        />
        {LIFECYCLE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const done = index < activeIndex || status === "completed";
          const active = index === activeIndex;
          return (
            <div key={step.key} className="relative z-[1] flex min-w-[3.6rem] flex-1 flex-col items-center gap-1 text-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                done || active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"
              } ${active ? "shadow-[0_0_0_4px_hsl(var(--primary)/0.14)]" : ""}`}>
                <Icon className="h-3 w-3" aria-hidden="true" />
              </span>
              {!compact && (
                <span className={`text-[10px] font-bold leading-tight ${done || active ? "text-primary" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {compact ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs font-black text-primary">{summary}</span>
          <span className="text-[10px] font-bold text-muted-foreground">Step {activeIndex + 1} of {LIFECYCLE_STEPS.length}</span>
        </div>
      ) : (
        <ol className="sr-only">
          {LIFECYCLE_STEPS.map((step, index) => (
            <li key={step.key} aria-current={index === activeIndex ? "step" : undefined}>
              {step.label}: {index < activeIndex || status === "completed" ? "complete" : index === activeIndex ? "current" : "up next"}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}