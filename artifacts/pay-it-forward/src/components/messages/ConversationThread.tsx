import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageAttachment, type MessageAttachmentData } from "./MessageAttachment";
import { MessageComposerWithAttachments, type PendingAttachment, type PendingContext } from "./MessageComposerWithAttachments";
import { MessageAvatar } from "./MessageAvatar";

export function ConversationThread({
  title,
  subtitle,
  avatarUrl,
  active,
  messages,
  currentUserId,
  body,
  attachments,
  contexts,
  working,
  onBack,
  onInfo,
  onSearch,
  searchOpen,
  searchQuery,
  searchMatchCount,
  searchMatchIndex,
  onSearchQueryChange,
  onNextSearchMatch,
  onPreviousSearchMatch,
  onCloseSearch,
  onVoiceCall,
  onVideoCall,
  onBodyChange,
  onAttachmentsChange,
  onContextsChange,
  onSend,
  highlightedMessageId,
}: {
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  active?: boolean | null;
  messages: Array<{ id: number; sender_id: number; sender_name?: string | null; sender_avatar?: string | null; body: string; created_at: string | null; attachments?: MessageAttachmentData[] }>;
  currentUserId: number | null;
  body: string;
  attachments: PendingAttachment[];
  contexts: PendingContext[];
  working: boolean;
  onBack?: () => void;
  onInfo?: () => void;
  onSearch?: () => void;
  searchOpen?: boolean;
  searchQuery?: string;
  searchMatchCount?: number;
  searchMatchIndex?: number;
  onSearchQueryChange?: (value: string) => void;
  onNextSearchMatch?: () => void;
  onPreviousSearchMatch?: () => void;
  onCloseSearch?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onBodyChange: (value: string) => void;
  onAttachmentsChange: (value: PendingAttachment[]) => void;
  onContextsChange: (value: PendingContext[]) => void;
  onSend: () => void;
  highlightedMessageId?: number | null;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (highlightedMessageId) {
      messageRefs.current[highlightedMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedMessageId, messages.length, title]);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        title={title}
        subtitle={subtitle}
        avatarUrl={avatarUrl}
        active={active}
        onBack={onBack}
        onInfo={onInfo}
        onSearch={onSearch}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
      />
      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2" role="search" aria-label="Search this conversation">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={searchQuery ?? ""}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) onPreviousSearchMatch?.();
                else onNextSearchMatch?.();
              }
              if (event.key === "Escape") onCloseSearch?.();
            }}
            placeholder="Search in conversation"
            aria-label="Search in conversation"
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" aria-live="polite">
            {searchMatchCount ? `${(searchMatchIndex ?? 0) + 1}/${searchMatchCount}` : "No matches"}
          </span>
          <button type="button" onClick={onPreviousSearchMatch} disabled={!searchMatchCount} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-40" aria-label="Previous search match"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" onClick={onNextSearchMatch} disabled={!searchMatchCount} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-40" aria-label="Next search match"><ChevronDown className="h-4 w-4" /></button>
          <button type="button" onClick={onCloseSearch} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Close conversation search"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Say hello to start the conversation.</p> : messages.map((message) => (
          <div key={message.id} ref={(node) => { messageRefs.current[message.id] = node; }} className={`flex items-end gap-1.5 ${message.sender_id === currentUserId ? "justify-end" : "justify-start"}`}>
            {message.sender_id !== currentUserId && <MessageAvatar name={message.sender_name ?? title} avatarUrl={message.sender_avatar} size={28} />}
            <div className="max-w-[85%] space-y-2">
              {message.body && <MessageBubble body={message.body} mine={message.sender_id === currentUserId} createdAt={message.created_at} highlighted={message.id === highlightedMessageId} searchQuery={searchQuery} />}
              {message.attachments?.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageComposerWithAttachments
        body={body}
        attachments={attachments}
        contexts={contexts}
        working={working}
        onBodyChange={onBodyChange}
        onAttachmentsChange={onAttachmentsChange}
        onContextsChange={onContextsChange}
        onSend={onSend}
      />
    </section>
  );
}