import { Ban, FileText, Flag, MapPinned, Radio, User, X } from "lucide-react";
import type { MessageAttachmentData } from "./MessageAttachment";
import { MessageAttachment } from "./MessageAttachment";
import { MessageAvatar } from "./MessageAvatar";

export function ConversationInfoPanel({
  name,
  avatarUrl,
  active,
  kind = "direct",
  contextTitle,
  contextStatus,
  contextMeta,
  sharedAttachments = [],
  onOpenContext,
  onViewProfile,
  onBlock,
  onReport,
  onClose,
}: {
  name: string;
  avatarUrl?: string | null;
  active?: boolean | null;
  kind?: "direct" | "request" | "hub";
  contextTitle?: string;
  contextStatus?: string | null;
  contextMeta?: string | null;
  sharedAttachments?: MessageAttachmentData[];
  onOpenContext?: () => void;
  onViewProfile?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onClose?: () => void;
}) {
  const images = sharedAttachments.filter((attachment) => attachment.mime_type.startsWith("image/")).slice(0, 4);
  const files = sharedAttachments.filter((attachment) => !attachment.mime_type.startsWith("image/")).slice(0, 4);
  const KindIcon = kind === "request" ? MapPinned : kind === "hub" ? Radio : User;
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-6 text-center">
        <MessageAvatar name={name} avatarUrl={avatarUrl} size={56} active={active} />
        <div><p className="text-base font-black">{name}</p><p className="text-xs text-muted-foreground">{active ? "Active now" : "Niakofa member"}</p></div>
      </div>
      {contextTitle && (
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary"><KindIcon className="h-3.5 w-3.5" /> {kind === "request" ? "Request" : kind === "hub" ? "Hub" : "Conversation"}</div>
          <p className="mt-2 truncate text-sm font-black">{contextTitle}</p>
          {contextStatus && <p className="mt-1 text-xs capitalize text-muted-foreground">{contextStatus.replaceAll("_", " ")}</p>}
          {contextMeta && <p className="mt-1 text-xs text-muted-foreground">{contextMeta}</p>}
          {onOpenContext && <button type="button" onClick={onOpenContext} data-testid="button-open-conversation-context" className="mt-3 min-h-10 w-full rounded-xl border border-primary/30 text-xs font-black text-primary hover:bg-primary/10">{kind === "request" ? "Open live request" : "Open Hub conversation"}</button>}
        </div>
      )}
      <div className="space-y-1 p-3">
        {onViewProfile && <button type="button" onClick={onViewProfile} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold hover:bg-muted"><User className="h-4 w-4 text-primary" /> View profile</button>}
        {onBlock && <button type="button" onClick={onBlock} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold text-rose-400 hover:bg-rose-500/10"><Ban className="h-4 w-4" /> Block</button>}
        {onReport && <button type="button" onClick={onReport} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted"><Flag className="h-4 w-4" /> Report</button>}
      </div>
      {kind === "direct" && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-4">
          <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent shared media</p><span className="text-[10px] text-muted-foreground">{sharedAttachments.length || "—"}</span></div>
          {images.length > 0 ? <div className="mt-3 grid grid-cols-2 gap-2">{images.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} compact />)}</div> : <p className="mt-3 text-xs text-muted-foreground">Photos and videos from this conversation will appear here.</p>}
          {files.length > 0 && <div className="mt-4 space-y-2"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground"><FileText className="h-3 w-3" /> Shared files</p>{files.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} compact />)}</div>}
          {sharedAttachments.length > 4 && <p className="mt-3 text-[10px] text-muted-foreground">Showing recent attachments from the loaded conversation history.</p>}
        </div>
      )}
      {onClose && <button type="button" onClick={onClose} className="m-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold lg:hidden"><X className="h-4 w-4" /> Close</button>}
    </aside>
  );
}