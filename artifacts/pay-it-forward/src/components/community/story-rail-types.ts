export type StoryMedia = {
  id: number;
  media_type: "photo" | "video" | "audio";
  mime_type: string;
  duration_ms: number | null;
  media_url: string;
  width?: number | null;
  height?: number | null;
  alt_text?: string | null;
  captions_vtt?: string | null;
};

export type MomentVideo = {
  status: string;
  duration_ms?: number | null;
  playback_grant_url: string;
};

export type CommunityStory = {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  caption: string | null;
  audience: string;
  reply_enabled: boolean;
  created_at: string | null;
  expires_at: string | null;
  featured_at?: string | null;
  archive_enabled?: boolean;
  remix_enabled?: boolean;
  response_to_story_id?: number | null;
  challenge_key?: string | null;
  challenge?: { key: string; prompt: string } | null;
  author: { id: number; name: string; avatar_url: string | null };
  media: StoryMedia[];
  moment_video?: MomentVideo | null;
  elements: Array<{
    id: number;
    type: string;
    payload: Record<string, unknown>;
    position_x?: number;
    position_y?: number;
    scale?: number;
    rotation?: number;
    z_index?: number;
  }>;
};

export type StoryFrame = { story: CommunityStory; media: StoryMedia | null; isMomentReel?: boolean };
export type StoryAuthor = {
  author_user_id: number;
  author: CommunityStory["author"];
  frames: StoryFrame[];
};

export type Effect = "none" | "warmth" | "contrast" | "grayscale" | "vignette";

export const TEXT_STORY_BACKGROUNDS = ["#172554", "#0f766e", "#7c2d12", "#701a75", "#111827"] as const;
