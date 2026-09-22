import type { UnifiedConversation } from "@/lib/unifiedConversation";
import { MessageAvatar } from "./MessageAvatar";
import { UnreadBadge } from "./UnreadBadge";
import { MapPinned, MessageCircle, Radio } from "lucide-react";

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const kindLabels: Record<string, string> = { direct: "Direct", request: "Request", hub: "Hub" };
const kindStyles: Record<string, string> = {
  direct: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  request: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  hub: "border-violet-400/20 bg-violet-400/10 text-violet-200",
};

export function ConversationListItem({ item, selected, onSelect }: { item: UnifiedConversation; selected: boolean; onSelect: () => void }) {
  const unread = item.unreadCount > 0;
  const KindIcon = item.kind === "request" ? MapPinned : item.kind === "hub" ? Radio : MessageCircle;
  return (
    <button type="button" onClick={onSelect} data-testid={`button-conversation-${item.key.replace(":", "-")}`} className={`flex w-full items-center gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/60"}`}>
      <MessageAvatar name={item.title} avatarUrl={item.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${unread ? "font-black" : "font-bold"}`}><span className="truncate">{item.title}</span></span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(item.timestamp)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{item.lastMessage || item.subtitle || kindLabels[item.kind] || "Open conversation"}</span>
          <UnreadBadge count={item.unreadCount} />
        </span>
        <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${kindStyles[item.kind]}`}>
          <KindIcon className="h-3 w-3" /> {kindLabels[item.kind]}
          {item.kind === "request" && item.status ? <span className="normal-case tracking-normal opacity-80">· {item.status.replaceAll("_", " ")}</span> : null}
        </span>
      </span>
    </button>
  );
}