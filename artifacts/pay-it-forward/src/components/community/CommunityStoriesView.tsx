import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Heart, Loader2, Mic, MicOff, Send } from "lucide-react";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { useNiaStory } from "@/hooks/useNiaStory";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { useWebSocket } from "@/lib/useWebSocket";
import { CommunityStoriesExperience } from "@/components/community/CommunityStoriesExperience";

type GratitudePost = {
  id: number;
  author_name: string;
  author_avatar?: string | null;
  diaspora_hub_id?: number | null;
  helper_name?: string | null;
  message: string;
  request_title?: string | null;
  likes: number;
  created_at: string;
};

function filterGratitudePostsForHub(posts: GratitudePost[], hubId: number | null) {
  if (hubId === null) return posts;
  return posts.filter((post) => post.diaspora_hub_id === hubId);
}

function NiaStoryModal({
  onClose,
  onPosted,
}: {
  onClose: () => void;
  onPosted: () => void;
}) {
  const { currentUser } = useAppContext();
  const suppressed = useIsAnimationSuppressed();
  const userName = currentUser?.name ?? "A neighbor";
  const { state, story, error, transcript, startRecording, stopAndSubmit, reset } = useNiaStory(userName);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const handlePost = async () => {
    if (!story || !currentUser) return;
    setPosting(true);
    setPostError(null);
    try {
      const response = await fetch("/api/gratitude", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: story.story }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => ({}));
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : `Post failed (${response.status})`;
        throw new Error(message);
      }
      onPosted();
      onClose();
    } catch (reason: unknown) {
      setPostError(reason instanceof Error ? reason.message : "Failed to post story. Try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-t-3xl bg-background p-6 pb-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black">Share Your Story</h2>
            <p className="text-xs text-muted-foreground">Nia will polish your words into a community post</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close story composer">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {state === "idle" && (
          <button
            type="button"
            onClick={startRecording}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground"
          >
            <Mic className="h-5 w-5" aria-hidden="true" /> Tap to Record
          </button>
        )}

        {state === "recording" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <span className={`h-2 w-2 rounded-full bg-red-500${suppressed ? "" : " animate-pulse"}`} aria-hidden="true" />
              Recording… speak naturally
            </div>
            {transcript && <p className="text-xs italic leading-relaxed text-muted-foreground">"{transcript}"</p>}
            <button
              type="button"
              onClick={() => stopAndSubmit()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted py-3 text-sm font-bold"
            >
              <MicOff className="h-4 w-4" aria-hidden="true" /> Done — let Nia craft it
            </button>
          </div>
        )}

        {state === "processing" && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Nia is crafting your story…
          </div>
        )}

        {state === "done" && story && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nia crafted your story
            </div>
            <div className="rounded-2xl bg-muted p-4 text-sm leading-relaxed text-foreground">"{story.story}"</div>
            <div className="flex gap-2">
              <button type="button" onClick={reset} className="flex-1 rounded-2xl border border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted">
                Re-record
              </button>
              <button
                type="button"
                onClick={handlePost}
                disabled={posting}
                className="flex-2 flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-70"
              >
                {posting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Posting…</> : <><Send className="h-4 w-4" aria-hidden="true" /> Post to Community</>}
              </button>
            </div>
            {postError && <p className="text-xs text-destructive" role="alert">{postError}</p>}
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <div className="text-xs text-destructive" role="alert">{error ?? "Something went wrong."}</div>
            <button type="button" onClick={reset} className="w-full rounded-2xl border border-border py-3 text-sm font-bold">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommunityStoriesView({ hubId }: { hubId: number | null }) {
  const { niaEnabled } = useAppContext();
  const [showNiaStory, setShowNiaStory] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [posts, setPosts] = useState<GratitudePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const gratitudeFeedUrl = `${base}/api/gratitude${hubId ? `?hub_id=${encodeURIComponent(String(hubId))}` : ""}`;

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const response = await fetch(gratitudeFeedUrl, { headers: authHeaders() });
      const data: unknown = await response.json();
      if (Array.isArray(data)) setPosts(filterGratitudePostsForHub(data as GratitudePost[], hubId));
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [gratitudeFeedUrl, hubId]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useWebSocket("gratitude_created", useCallback((event) => {
    const payload = event.payload as GratitudePost;
    if (hubId !== null && payload.diaspora_hub_id !== hubId) return;
    setPosts((previous) => [payload, ...previous.filter((post) => post.id !== payload.id)]);
  }, [hubId]));

  const toggleLike = (id: number) => {
    setLikedPosts((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <CommunityStoriesExperience hubId={hubId} />
      <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="gratitude-stories-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="gratitude-stories-heading" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Gratitude &amp; Stories</h2>
          {niaEnabled === true ? (
            <button
              type="button"
              onClick={() => setShowNiaStory(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Share with Nia
            </button>
          ) : niaEnabled === false ? (
            <span className="rounded-full px-3 py-1.5 text-xs text-muted-foreground/50" title="Nia AI is currently resting — share your story in text below">
              <Mic className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" /> Nia resting
            </span>
          ) : null}
        </div>

        {postsLoading ? (
          <div className="flex items-center justify-center py-10" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary/50" aria-hidden="true" />
            <span className="sr-only">Loading gratitude stories</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Heart className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              No gratitude posts yet.<br />
              <span className="font-semibold text-primary">Complete a request</span> to add the first one!
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {posts.map((post) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                      <span className="text-sm font-black text-muted-foreground">{post.author_name[0]?.toUpperCase() ?? "?"}</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{post.author_name}</div>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        {post.helper_name && <><span className="font-medium text-primary">Thanks to {post.helper_name}</span><span>·</span></>}
                        <span>{new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </div>
                  </div>
                  {post.request_title && <div className="mb-2.5 inline-block max-w-full truncate rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary/80">{post.request_title}</div>}
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">"{post.message}"</p>
                  <button
                    type="button"
                    onClick={() => toggleLike(post.id)}
                    aria-label={`${likedPosts.has(post.id) ? "Unlike" : "Like"} gratitude post by ${post.author_name}`}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${likedPosts.has(post.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                  >
                    <Heart className={`h-4 w-4 ${likedPosts.has(post.id) ? "fill-current" : ""}`} aria-hidden="true" />
                    {post.likes + (likedPosts.has(post.id) ? 1 : 0)}
                  </button>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {showNiaStory && (
        <NiaStoryModal
          onClose={() => setShowNiaStory(false)}
          onPosted={() => {
            setShowNiaStory(false);
            void loadPosts();
          }}
        />
      )}
    </div>
  );
}