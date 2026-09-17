import { MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

export function CommunityMessageEntry() {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation("/messages?mode=direct")}
      className="w-full flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <MessageCircle className="h-4 w-4 text-primary" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-black">Message people</span>
        <span className="block text-xs text-muted-foreground">Start a direct conversation with another Niakofa user.</span>
      </span>
    </button>
  );
}