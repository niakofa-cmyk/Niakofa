import type { UnifiedConversation } from "@/lib/unifiedConversation";
import { MessageAvatar } from "./MessageAvatar";
import { UnreadBadge } from "./UnreadBadge";

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const kindLabels: Record<string, string> = { direct: "Direct", request: "Request", hub: "Hub" };

export function ConversationListItem({ item, selected, onSelect }: { item: UnifiedConversation; selected: boolean; onSelect: () => void }) {
  const unread = item.unreadCount > 0;
  return (
    <button type="button" onClick={onSelect} className={`flex w-full items-center gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/60"}`}>
      <MessageAvatar name={item.title} avatarUrl={item.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${unread ? "font-black" : "font-bold"}`}>{item.title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(item.timestamp)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{item.lastMessage || item.subtitle || kindLabels[item.kind] || "Open conversation"}</span>
          <UnreadBadge count={item.unreadCount} />
        </span>
      </span>
    </button>
  );
}