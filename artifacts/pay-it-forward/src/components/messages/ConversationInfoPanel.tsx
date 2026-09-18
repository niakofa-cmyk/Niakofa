import { Ban, Flag, User, X } from "lucide-react";
import { MessageAvatar } from "./MessageAvatar";

export function ConversationInfoPanel({
  name,
  avatarUrl,
  active,
  onViewProfile,
  onBlock,
  onReport,
  onClose,
}: {
  name: string;
  avatarUrl?: string | null;
  active?: boolean | null;
  onViewProfile?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-6 text-center">
        <MessageAvatar name={name} avatarUrl={avatarUrl} size={56} active={active} />
        <div><p className="text-base font-black">{name}</p><p className="text-xs text-muted-foreground">{active ? "Active now" : "Niakofa member"}</p></div>
      </div>
      <div className="space-y-1 p-3">
        {onViewProfile && <button type="button" onClick={onViewProfile} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold hover:bg-muted"><User className="h-4 w-4 text-primary" /> View profile</button>}
        {onBlock && <button type="button" onClick={onBlock} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold text-rose-400 hover:bg-rose-500/10"><Ban className="h-4 w-4" /> Block</button>}
        {onReport && <button type="button" onClick={onReport} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted"><Flag className="h-4 w-4" /> Report</button>}
      </div>
      <div className="border-t border-border px-4 py-3"><p className="text-xs text-muted-foreground">Shared media will appear here when attachment storage is supported.</p></div>
      {onClose && <button type="button" onClick={onClose} className="m-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold lg:hidden"><X className="h-4 w-4" /> Close</button>}
    </aside>
  );
}