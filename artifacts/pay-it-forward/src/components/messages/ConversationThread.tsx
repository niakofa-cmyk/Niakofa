import { useEffect, useRef } from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageAttachment, type MessageAttachmentData } from "./MessageAttachment";
import { MessageComposerWithAttachments, type PendingAttachment } from "./MessageComposerWithAttachments";

export function ConversationThread({
  title,
  subtitle,
  avatarUrl,
  active,
  messages,
  currentUserId,
  body,
  attachments,
  working,
  onBack,
  onInfo,
  onBodyChange,
  onAttachmentsChange,
  onSend,
}: {
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  active?: boolean | null;
  messages: Array<{ id: number; sender_id: number; body: string; created_at: string | null; attachments?: MessageAttachmentData[] }>;
  currentUserId: number | null;
  body: string;
  attachments: PendingAttachment[];
  working: boolean;
  onBack?: () => void;
  onInfo?: () => void;
  onBodyChange: (value: string) => void;
  onAttachmentsChange: (value: PendingAttachment[]) => void;
  onSend: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length, title]);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConversationHeader title={title} subtitle={subtitle} avatarUrl={avatarUrl} active={active} onBack={onBack} onInfo={onInfo} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Say hello to start the conversation.</p> : messages.map((message) => (
          <div key={message.id} className={message.sender_id === currentUserId ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[85%] space-y-2">
              {message.body && <MessageBubble body={message.body} mine={message.sender_id === currentUserId} createdAt={message.created_at} />}
              {message.attachments?.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageComposerWithAttachments
        body={body}
        attachments={attachments}
        working={working}
        onBodyChange={onBodyChange}
        onAttachmentsChange={onAttachmentsChange}
        onSend={onSend}
      />
    </section>
  );
}