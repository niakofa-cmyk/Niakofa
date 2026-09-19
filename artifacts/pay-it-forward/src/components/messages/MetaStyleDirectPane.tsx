/**
 * V19 — Meta-style Direct Messages pane.
 *
 * UI-only enhancement over the existing Direct Messages API.
 * Direct / Requests / Hubs remain one unified Messages product.
 */
import { useEffect, useRef } from "react";
import { ArrowLeft, Ban, Search, ShieldAlert, Wifi, WifiOff, X } from "lucide-react";
import type { WsConnectionState } from "@/lib/wsClient";
import { MessageAttachment, type MessageAttachmentData } from "./MessageAttachment";
import { MessageComposerWithAttachments, type PendingAttachment, type PendingContext } from "./MessageComposerWithAttachments";

type DirectUser = { id: number; name: string; avatar_url: string | null };
type DirectConversation = {
  id: number;
  updated_at: string | null;
  other_user: DirectUser;
  last_message: { id: number; body: string; sender_id: number; created_at: string | null; read_at: string | null; attachment_count?: number } | null;
};
type DirectMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar?: string | null;
  body: string;
  attachments?: MessageAttachmentData[];
  created_at: string | null;
  read_at?: string | null;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Avatar({ user, size = 40 }: { user: DirectUser; size?: number }) {
  const sizeClass = size <= 36 ? "h-9 w-9 text-[10px]" : "h-10 w-10 text-xs";
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className={`${sizeClass} shrink-0 rounded-2xl object-cover`} />
  ) : (
    <span className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-2xl bg-primary/15 font-black text-primary`} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type MetaStyleDirectPaneProps = {
  conversations: DirectConversation[];
  messages: DirectMessage[];
  selectedId: number | null;
  recipient: DirectUser | null;
  search: string;
  searchResults: DirectUser[];
  body: string;
  attachments: PendingAttachment[];
  contexts?: PendingContext[];
  working: boolean;
  currentUserId: number | null;
  realtimeState?: WsConnectionState;
  reportOpen: boolean;
  reportReason: string;
  onSearchChange: (value: string) => void;
  onSelectConversation: (id: number) => void;
  onSelectUser: (user: DirectUser) => void;
  onBackToList: () => void;
  onBodyChange: (value: string) => void;
  onAttachmentsChange: (value: PendingAttachment[]) => void;
  onContextsChange?: (value: PendingContext[]) => void;
  onSend: () => void;
  onBlock: () => void;
  onToggleReport: () => void;
  onReportReasonChange: (value: string) => void;
  onReport: () => void;
  onCancelReport: () => void;
};

export function MetaStyleDirectPane({
  conversations, messages, selectedId, recipient, search, searchResults, body, attachments, working,
  currentUserId, realtimeState = "disconnected", reportOpen, reportReason,
  onSearchChange, onSelectConversation, onSelectUser, onBackToList, onBodyChange,
  onAttachmentsChange, contexts = [], onContextsChange = () => {},
  onSend, onBlock, onToggleReport, onReportReasonChange, onReport, onCancelReport,
}: MetaStyleDirectPaneProps) {
  const showThread = Boolean(recipient);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, selectedId]);

  return (
    <div className="grid min-h-[28rem] overflow-hidden rounded-3xl border border-border bg-card lg:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)]">
      <section className={`flex min-h-0 flex-col border-border lg:border-r ${showThread ? "hidden lg:flex" : "flex"}`} aria-label="Direct conversations">
        <div className="border-b border-border p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Find an approved person"
              aria-label="Find an approved person"
              className="min-h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-border bg-background p-1">
              {searchResults.map((user) => (
                <button key={user.id} type="button" onClick={() => onSelectUser(user)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted">
                  <Avatar user={user} size={36} />
                  <span className="truncate text-sm font-bold">{user.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-6 text-center text-xs leading-relaxed text-muted-foreground">Search for an approved person to start a conversation.</p>
          ) : conversations.map((conversation) => {
            const unread = Boolean(conversation.last_message && !conversation.last_message.read_at && conversation.last_message.sender_id !== currentUserId);
            const active = conversation.id === selectedId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={`flex min-h-[68px] w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left ${active ? "bg-primary/10" : "hover:bg-muted/60"}`}
              >
                <Avatar user={conversation.other_user} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? "font-black" : "font-bold"}`}>{conversation.other_user.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(conversation.last_message?.created_at ?? conversation.updated_at)}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-xs ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {conversation.last_message?.body || (conversation.last_message?.attachment_count ? "Attachment" : "Open conversation")}
                  </span>
                </span>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className={`flex min-h-0 flex-col ${showThread ? "flex" : "hidden lg:flex"}`} aria-label="Direct message thread">
        {!recipient ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <p className="font-black text-foreground">Your messages</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Select a conversation or search for an approved person.</p>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
              <button type="button" onClick={onBackToList} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted lg:hidden" aria-label="Back to conversations">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar user={recipient} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{recipient.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  Direct message
                  {selectedId && realtimeState === "connected" && <><span>·</span><Wifi className="h-3 w-3 text-emerald-400" aria-label="Live delivery" /></>}
                  {selectedId && realtimeState !== "connected" && <><span>·</span><WifiOff className="h-3 w-3 text-amber-400" aria-label="Reconnecting" /></>}
                </p>
              </div>
              {selectedId && (
                <>
                  <button type="button" onClick={onToggleReport} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Report conversation">
                    <ShieldAlert className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={onBlock} disabled={working} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300" aria-label="Block user">
                    <Ban className="h-4 w-4" />
                  </button>
                </>
              )}
            </header>

            {reportOpen && selectedId && (
              <div className="shrink-0 border-b border-rose-300/15 bg-rose-300/[0.04] p-3">
                <label className="text-xs font-bold text-muted-foreground" htmlFor="direct-report-reason">Why are you reporting this conversation?</label>
                <textarea id="direct-report-reason" value={reportReason} onChange={(e) => onReportReasonChange(e.target.value)} maxLength={500} rows={2} className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={onCancelReport} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /> Cancel</button>
                  <button type="button" disabled={working || !reportReason.trim()} onClick={onReport} className="min-h-10 rounded-xl bg-rose-500 px-3 text-xs font-black text-white disabled:opacity-50">Submit report</button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
              <div className="space-y-2">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">Say hello to start the conversation.</p>
                ) : messages.map((message) => {
                  const mine = message.sender_id === currentUserId;
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"}`}>
                         {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                         {message.attachments?.map((attachment) => (
                           <MessageAttachment key={attachment.id} attachment={attachment} />
                         ))}
                        <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatTime(message.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
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
          </>
        )}
      </section>
    </div>
  );
}
