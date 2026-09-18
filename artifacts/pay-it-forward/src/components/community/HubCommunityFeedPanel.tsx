import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CircleDot, FileImage, Heart, Loader2, MessageCircle, Send, Users } from "lucide-react";
import { useLocation } from "wouter";
import {
  addHubCommunityComment,
  createHubCommunityPost,
  fetchHubCommunityFeed,
  toggleHubCommunityReaction,
  uploadHubCommunityMedia,
  type HubCommunityFeed,
} from "@/lib/hubCommunityFeed";
import { communitySpiralsPath, spiralsDiscoveryPath } from "@/lib/spirals";
import { useWebSocket } from "@/lib/useWebSocket";

export default function HubCommunityFeedPanel({ hubId }: { hubId: number | string }) {
  const [, navigate] = useLocation();
  const [feed, setFeed] = useState<HubCommunityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postBody, setPostBody] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [posting, setPosting] = useState(false);
  const [commentingPostId, setCommentingPostId] = useState<number | null>(null);
  const [reactingPostId, setReactingPostId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setFeed(await fetchHubCommunityFeed(hubId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not load this Hub feed.");
    }
  }, [hubId]);

  useEffect(() => { void reload(); }, [reload]);

  useWebSocket("hub_community_post_created", useCallback((event) => {
    const payload = event.payload as { hub_id?: number };
    if (Number(payload.hub_id) === Number(hubId)) void reload();
  }, [hubId, reload]));

  type FeedItem =
    | { kind: "gratitude"; id: number; createdAt: string | null; text: string; meta: string }
    | { kind: "request"; id: number; createdAt: string | null; title: string; category: string; urgency: string }
    | { kind: "post"; id: number; createdAt: string; post: HubCommunityFeed["posts"][number] };

  const items = useMemo<FeedItem[]>(() => {
    if (!feed) return [];
    const gratitude: FeedItem[] = feed.gratitude.map((post) => ({
      kind: "gratitude",
      id: post.id,
      createdAt: post.created_at,
      text: post.message,
      meta: `${post.author_name ?? "Community member"}${post.helper_name ? ` · thanked ${post.helper_name}` : ""}`,
    }));
    const requests: FeedItem[] = feed.requests.map((request) => ({
      kind: "request",
      id: request.id,
      createdAt: request.created_at,
      title: request.title,
      category: request.category ?? "Community help",
      urgency: request.urgency ?? "medium",
    }));
    const posts: FeedItem[] = feed.posts.map((post) => ({
      kind: "post",
      id: post.id,
      createdAt: post.created_at,
      post,
    }));
    return [...posts, ...gratitude, ...requests]
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
      .slice(0, 18);
  }, [feed]);

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected media."));
    reader.readAsDataURL(file);
  });

  const submitPost = async () => {
    if (!feed || !postBody.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const result = await createHubCommunityPost(feed.hub.id, postBody.trim());
      if (mediaFile) {
        await uploadHubCommunityMedia(feed.hub.id, result.post.id, await readFileAsDataUrl(mediaFile), mediaFile.name);
      }
      setPostBody("");
      setMediaFile(null);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not publish this Hub post.");
    } finally {
      setPosting(false);
    }
  };

  const submitComment = async (postId: number) => {
    if (!feed || !commentDrafts[postId]?.trim() || commentingPostId !== null) return;
    setCommentingPostId(postId);
    try {
      await addHubCommunityComment(feed.hub.id, postId, commentDrafts[postId].trim());
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not add this comment.");
    } finally {
      setCommentingPostId(null);
    }
  };

  const toggleReaction = async (postId: number) => {
    if (!feed || reactingPostId !== null) return;
    setReactingPostId(postId);
    try {
      await toggleHubCommunityReaction(feed.hub.id, postId);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not update this reaction.");
    } finally {
      setReactingPostId(null);
    }
  };

  if (error) return <div role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100">{error}</div>;
  if (!feed) return <div className="flex min-h-32 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const spiralsPath = spiralsDiscoveryPath({ hubId: feed.hub.id });

  return (
    <section className="rounded-3xl border border-border bg-card p-4 sm:p-5" data-hub-community-feed={feed.hub.id}>
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Hub Community</p>
          <h2 className="truncate text-xl font-black">{feed.hub.display_name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{feed.hub.region ?? feed.hub.country_code ?? "Diaspora Hub"}</p>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Members" value={feed.counts.members} />
        <Stat icon={<ArrowRight className="h-3.5 w-3.5" />} label="Open requests" value={feed.counts.open_requests} />
        <Stat icon={<CircleDot className="h-3.5 w-3.5" />} label="Posts" value={feed.counts.posts} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <Action label="Community" onClick={() => navigate(`/community?hubId=${feed.hub.id}`)} />
        <Action label="Messages" onClick={() => navigate(feed.actions.messages)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
        <Action label="Spirals" onClick={() => navigate(spiralsPath)} icon={<CircleDot className="h-3.5 w-3.5" />} />
        <Action label="Community Spirals" onClick={() => navigate(communitySpiralsPath(feed.hub.id))} />
      </div>

      {feed.permissions.can_post && (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Share with this Hub</p>
          <textarea
            value={postBody}
            onChange={(event) => setPostBody(event.target.value)}
            maxLength={5000}
            rows={3}
            placeholder="Share an update, resource, or encouragement…"
            className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            aria-label="Hub post"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:border-primary/50">
              <FileImage className="h-3.5 w-3.5" />
              {mediaFile ? mediaFile.name : "Add media"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav"
                className="sr-only"
                onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" disabled={posting || !postBody.trim()} onClick={() => void submitPost()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> {posting ? "Publishing…" : "Publish"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Media is stored securely with this post. Files up to 5 MB are supported.</p>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Latest in this Hub</h3>
          <span className="text-[10px] text-muted-foreground">{items.length} recent items</span>
        </div>
        <div className="grid gap-2">
          {items.length === 0 ? <Empty text="This Hub has no posts, gratitude, or open requests yet." /> : items.map((item) => item.kind === "gratitude" ? (
            <article key={`gratitude-${item.id}`} className="rounded-2xl border border-border/70 bg-background/40 p-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-primary"><CircleDot className="h-3 w-3" /> Gratitude</div>
              <p className="mt-1 text-sm leading-relaxed">{item.text}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">{item.meta}</p>
            </article>
          ) : item.kind === "post" ? (
            <article key={`post-${item.id}`} className="rounded-2xl border border-border/70 bg-background/40 p-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-primary"><Users className="h-3 w-3" /> Hub post</div>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{item.post.body}</p>
              {item.post.media.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.post.media.map((media) => media.mime_type.startsWith("image/") ? (
                    <img key={media.id} src={media.media_url} alt={media.alt_text ?? "Hub post media"} loading="lazy" className="max-h-64 w-full rounded-xl object-cover" />
                  ) : media.mime_type.startsWith("video/") ? (
                    <video key={media.id} src={media.media_url} controls className="max-h-64 w-full rounded-xl" />
                  ) : (
                    <audio key={media.id} src={media.media_url} controls className="w-full" />
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">{item.post.author_name ?? "Community member"}</p>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" disabled={!feed.permissions.can_react || reactingPostId === item.id} onClick={() => void toggleReaction(item.id)} className={`inline-flex items-center gap-1 text-xs font-bold ${item.post.viewer_reacted ? "text-rose-500" : "text-muted-foreground"} disabled:opacity-50`}>
                  <Heart className="h-3.5 w-3.5" fill={item.post.viewer_reacted ? "currentColor" : "none"} /> {item.post.reaction_count}
                </button>
                <span className="text-[10px] text-muted-foreground">{item.post.comments.length} recent comments</span>
              </div>
              {item.post.comments.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-2">
                  {item.post.comments.map((comment) => <p key={comment.id} className="text-xs"><span className="font-bold">{comment.author_name ?? "Member"}:</span> {comment.body}</p>)}
                </div>
              )}
              {feed.permissions.can_comment && (
                <div className="mt-3 flex gap-2">
                  <input value={commentDrafts[item.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Add a comment…" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" aria-label={`Comment on post ${item.id}`} />
                  <button type="button" disabled={!commentDrafts[item.id]?.trim() || commentingPostId === item.id} onClick={() => void submitComment(item.id)} className="rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-50">{commentingPostId === item.id ? "…" : "Reply"}</button>
                </div>
              )}
            </article>
          ) : (
            <button key={`request-${item.id}`} type="button" onClick={() => navigate(`/request/${item.id}/view`)} className="rounded-2xl border border-border/70 bg-background/40 p-3 text-left hover:border-primary/40">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-primary"><ArrowRight className="h-3 w-3" /> Open request</div>
              <p className="mt-1 truncate text-sm font-black">{item.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{item.category} · {item.urgency}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-border/70 bg-background/40 p-3"><div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">{icon}{label}</div><p className="mt-1 text-lg font-black">{value}</p></div>;
}
function Action({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-black hover:border-primary/40 hover:bg-primary/5">{icon}{label}</button>;
}
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">{text}</p>; }
