import { useEffect, useRef } from "react";
import { ConversationHeader } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";

export function ConversationThread({
  title,
  subtitle,
  avatarUrl,
  active,
  messages,
  currentUserId,
  body,
  working,
  onBack,
  onInfo,
  onBodyChange,
  onSend,
}: {
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  active?: boolean | null;
  messages: Array<{ id: number; sender_id: number; body: string; created_at: string | null }>;
  currentUserId: number | null;
  body: string;
  working: boolean;
  onBack?: () => void;
  onInfo?: () => void;
  onBodyChange: (value: string) => void;
  onSend: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length, title]);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConversationHeader title={title} subtitle={subtitle} avatarUrl={avatarUrl} active={active} onBack={onBack} onInfo={onInfo} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Say hello to start the conversation.</p> : messages.map((message) => <MessageBubble key={message.id} body={message.body} mine={message.sender_id === currentUserId} createdAt={message.created_at} />)}
        <div ref={bottomRef} />
      </div>
      <MessageComposer body={body} working={working} onChange={onBodyChange} onSend={onSend} />
    </section>
  );
}