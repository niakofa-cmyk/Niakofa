function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MessageBubble({
  body,
  mine,
  createdAt,
  highlighted = false,
  searchQuery,
}: {
  body: string;
  mine: boolean;
  createdAt?: string | null;
  highlighted?: boolean;
  searchQuery?: string;
}) {
  const query = searchQuery?.trim() ?? "";
  const parts = query
    ? body.split(new RegExp(`(${escapeRegExp(query)})`, "ig"))
    : [body];
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-shadow ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"} ${highlighted ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-card" : ""}`}>
        <p className="whitespace-pre-wrap break-words">{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={`${part}-${index}`} className={mine ? "rounded bg-primary-foreground/20 px-0.5 text-inherit" : "rounded bg-amber-200/60 px-0.5 text-inherit"}>{part}</mark> : part)}</p>
        <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatTime(createdAt)}</p>
      </div>
    </div>
  );
}