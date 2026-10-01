import { useState } from "react";
import { useLocation } from "wouter";
import { Bell, BellOff, Check, CheckCheck, RefreshCw } from "lucide-react";
import { CommunitySocialShell } from "@/components/community/CommunitySocialShell";
import { useCommunityNotifications, type LiveNotification } from "@/components/community/useCommunityNotifications";

function ago(date: Date) {
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} minutes ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hours ago`;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function Notice({ item, onRead, onOpen }: { item: LiveNotification; onRead: (id: string) => void; onOpen: () => void }) {
  return (
    <article className={`nk-history-row ${item.read_at ? "" : "is-unread"}`} data-testid={`history-notification-${item.id}`}>
      <span className="nk-history-mark" aria-hidden="true"><Bell size={17} /></span>
      <button type="button" className="nk-history-content" onClick={onOpen}>
        <span className="nk-history-title">{item.title}</span>
        <span className="nk-history-body">{item.body}</span>
        <span className="nk-history-time">{ago(item.time)}</span>
      </button>
      {!item.read_at && <button type="button" className="nk-history-action" onClick={() => onRead(item.id)}
        aria-label={`Mark ${item.title} as read`}><Check size={17} /></button>}
    </article>
  );
}

export default function CommunityNotificationsPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { notifications, unreadCount, isLoading, isError, error, refetch, markRead, markAllRead,
    isMarkingAllRead, markReadError, markAllReadError } = useCommunityNotifications();
  const matchingNotifications = notifications.filter((item) =>
    `${item.title} ${item.body}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  return (
    <CommunitySocialShell active="notifications" onNavigate={(key) => setLocation(key === "home" ? "/" : `/community/${key}`)}
      onRoute={setLocation} onCreate={() => setLocation("/community/moments?composer=1")} onSearch={setSearchQuery} searchValue={searchQuery}>
      <section className="nk-notifications-page" aria-labelledby="nk-history-title">
        <div className="nk-history-hero">
          <div className="nk-history-overline"><span>THE NEIGHBORHOOD THREAD</span><i /></div>
          <div className="nk-history-title-line">
            <div><h1 id="nk-history-title">Notifications</h1>
              <p>Small signs that your community is showing up.</p></div>
            <div className="nk-history-count"><strong>{unreadCount}</strong><span>unread</span></div>
          </div>
          <div className="nk-history-actions">
            <span className="nk-history-live"><i /> Updates arrive as they happen</span>
            {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} disabled={isMarkingAllRead}
              className="nk-mark-all"><CheckCheck size={15} /> Mark all read</button>}
          </div>
        </div>

        {(markReadError || markAllReadError) && <p className="nk-inline-error" role="alert">
          That change did not save. Your list was restored; please try again.
        </p>}
        {isLoading && <div className="nk-history-list" aria-label="Loading notifications">
          {[0, 1, 2, 3].map((item) => <div className="nk-history-skeleton" key={item}><i /><span><b /><b /></span></div>)}
        </div>}
        {isError && <div className="nk-history-empty" role="alert"><BellOff size={25} /><h2>We couldn't reach your updates</h2>
          <p>{error instanceof Error ? error.message : "Please check your connection and try again."}</p>
          <button type="button" className="nk-retry-button" onClick={() => void refetch()}><RefreshCw size={15} /> Try again</button>
        </div>}
        {!isLoading && !isError && notifications.length === 0 && <div className="nk-history-empty">
          <span className="nk-caught-up-mark"><BellOff size={24} /></span>
          <h2>Nothing new, and that's okay.</h2>
          <p>When neighbors respond, share a Moment or pass along a Spark, you'll see it here.</p>
        </div>}
        {!isLoading && !isError && notifications.length > 0 && matchingNotifications.length === 0 && <div className="nk-history-empty">
          <BellOff size={24} /><h2>No matching updates</h2><p>Try another name or phrase.</p>
        </div>}
        {!isLoading && !isError && matchingNotifications.length > 0 && <div className="nk-history-list">
          {matchingNotifications.map((item) => <Notice key={item.id} item={item} onRead={(id) => void markRead(id)}
            onOpen={() => {
              if (!item.read_at) void markRead(item.id);
              if (item.actionUrl) setLocation(item.actionUrl);
            }} />)}
        </div>}
      </section>
    </CommunitySocialShell>
  );
}