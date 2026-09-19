import { ArrowLeft, MoreHorizontal, Phone, Video } from "lucide-react";
import { MessageAvatar } from "./MessageAvatar";

export function ConversationHeader({
  title,
  subtitle,
  avatarUrl,
  active,
  onBack,
  onInfo,
  onVoiceCall,
  onVideoCall,
}: {
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  active?: boolean | null;
  onBack?: () => void;
  onInfo?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      {onBack && <button type="button" onClick={onBack} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>}
      <MessageAvatar name={title} avatarUrl={avatarUrl} size={40} active={active} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black">{title}</p>
        <p className="text-[10px] text-muted-foreground">{active ? "Active now" : subtitle || "Conversation"}</p>
      </div>
      <button type="button" onClick={onVoiceCall} disabled={!onVoiceCall} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 inline-flex" title="Voice call" aria-label="Voice call"><Phone className="h-4 w-4" /></button>
      <button type="button" onClick={onVideoCall} disabled={!onVideoCall} className="hidden min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 sm:inline-flex" title="Video call" aria-label="Video call"><Video className="h-4 w-4" /></button>
      {onInfo && <button type="button" onClick={onInfo} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Conversation info"><MoreHorizontal className="h-4 w-4" /></button>}
    </header>
  );
}