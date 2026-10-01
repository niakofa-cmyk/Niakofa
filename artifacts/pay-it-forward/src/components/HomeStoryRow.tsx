import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Camera } from "lucide-react";
import { authHeaders } from "@/lib/auth";

type StoryIcon = {
  id: number;
  author: { name: string; avatar_url: string | null };
  media: Array<{ media_url: string }>;
};

export function HomeStoryRow() {
  const [, setLocation] = useLocation();
  const [stories, setStories] = useState<StoryIcon[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/community/stories", { headers: authHeaders() })
      .then((response) => response.json())
      .then((data: { stories?: StoryIcon[] }) => {
        if (!cancelled) setStories(Array.isArray(data.stories) ? data.stories.slice(0, 12) : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 pointer-events-auto" aria-label="Moments">
      <button type="button" onClick={() => setLocation("/community/moments?composer=1")} className="flex w-16 shrink-0 flex-col items-center gap-1">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-primary bg-card text-primary">
          <Camera className="h-5 w-5" />
        </span>
        <span className="text-[11px] text-muted-foreground">You</span>
      </button>
      {stories.map((story) => (
        <button
          key={story.id}
          type="button"
          onClick={() => setLocation(`/community/moments?spark=${story.id}`)}
          className="flex w-16 shrink-0 flex-col items-center gap-1"
        >
          <span className="h-14 w-14 overflow-hidden rounded-full border-2 border-primary">
            {story.author.avatar_url || story.media[0]?.media_url ? (
              <img src={story.author.avatar_url || story.media[0]?.media_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-card text-xs font-bold">{story.author.name.slice(0, 1)}</span>
            )}
          </span>
          <span className="w-full truncate text-[11px] text-muted-foreground">{story.author.name.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}
