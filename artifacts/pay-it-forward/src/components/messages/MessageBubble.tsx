function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({
  body,
  mine,
  createdAt,
  highlighted = false,
}: {
  body: string;
  mine: boolean;
  createdAt?: string | null;
  highlighted?: boolean;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-shadow ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"} ${highlighted ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-card" : ""}`}>
        <p className="whitespace-pre-wrap break-words">{body}</p>
        <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatTime(createdAt)}</p>
      </div>
    </div>
  );
}