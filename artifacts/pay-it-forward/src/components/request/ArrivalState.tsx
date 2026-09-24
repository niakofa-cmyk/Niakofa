import { CheckCircle2, HeartHandshake, Navigation2 } from "lucide-react";

export function ArrivalState({
  status,
  personName,
  role,
  onComplete,
}: {
  status: string;
  personName?: string | null;
  role: "helper" | "requester";
  onComplete?: () => void;
}) {
  const arrived = status === "arrived";
  const completed = status === "completed";
  if (!arrived && !completed) return null;

  return (
    <section
      className={`rounded-2xl border p-4 ${
        completed
          ? "border-primary/25 bg-primary/5"
          : "border-green-400/30 bg-green-500/10"
      }`}
      role="status"
      aria-live="polite"
      data-testid={`state-arrival-${status}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          completed ? "bg-primary/15 text-primary" : "bg-green-500/15 text-green-400"
        }`}>
          {completed ? <CheckCircle2 className="h-5 w-5" /> : <HeartHandshake className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {completed ? "Help completed" : role === "helper" ? "You’ve arrived" : "Your helper has arrived"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {completed
              ? "Thank you for making this neighbor-to-neighbor connection."
              : role === "helper"
                ? `Meet ${personName ?? "your neighbor"} and complete the request when the help is delivered.`
                : `${personName ?? "Your helper"} is here. Confirm the handoff before closing the request.`}
          </p>
        </div>
      </div>
      {role === "helper" && arrived && onComplete && (
        <button type="button" onClick={onComplete} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-3 text-xs font-black text-white hover:bg-green-600">
          <Navigation2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark help complete
        </button>
      )}
    </section>
  );
}