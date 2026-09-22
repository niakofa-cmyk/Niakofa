import { Loader2, Send } from "lucide-react";

export function MessageComposer({
  body,
  working,
  onChange,
  onSend,
  placeholder = "Type a message…",
}: {
  body: string;
  working: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
}) {
  return (
    <form className="flex items-end gap-2 border-t border-border bg-card/95 p-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); if (!working && body.trim()) onSend(); }}>
      <textarea value={body} onChange={(event) => onChange(event.target.value)} rows={1} maxLength={4000} placeholder={placeholder} aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!working && body.trim()) onSend(); } }} />
      <button type="submit" disabled={working || !body.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send message">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
    </form>
  );
}