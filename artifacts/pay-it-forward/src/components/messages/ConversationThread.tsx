import { useEffect, useRef } from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageAttachment, type MessageAttachmentData } from "./MessageAttachment";
import { MessageComposerWithAttachments, type PendingAttachment, type PendingContext } from "./MessageComposerWithAttachments";

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
  messages: Array<{ id: number; sender_id: number; body: string; created_at: string | null; attachments?: MessageAttachmentData[] }>;
  currentUserId: number | null;
  body: string;
  attachments: PendingAttachment[];
  contexts: PendingContext[];
  working: boolean;
  onBack?: () => void;
  onInfo?: () => void;
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
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Say hello to start the conversation.</p> : messages.map((message) => (
          <div key={message.id} ref={(node) => { messageRefs.current[message.id] = node; }} className={message.sender_id === currentUserId ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[85%] space-y-2">
              {message.body && <MessageBubble body={message.body} mine={message.sender_id === currentUserId} createdAt={message.created_at} highlighted={message.id === highlightedMessageId} />}
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