import { authHeaders } from "@/lib/auth";

export type StoryMetrics = {
  story_id: number;
  views: number;
  reactions: number;
  shares: number;
  viewer_reaction: string | null;
  comment_count?: number;
};

export type StoryComment = {
  id: number;
  body: string;
  created_at: string;
  author: { id: number | null; name: string; avatar_url: string | null };
  viewer_can_delete: boolean;
};

export type StoryComments = { story_id: number; total: number; comments: StoryComment[] };

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === "string" ? data.error : `Request failed (${response.status}).`,
    );
  }
  return data as T;
}

export async function recordStoryView(storyId: number): Promise<void> {
  await requestJson(`/api/community/stories/${storyId}/view`, { method: "POST" });
}

export async function reactToStory(storyId: number, reaction = "💙") {
  return requestJson<{ ok: true; reaction: string }>(
    `/api/community/stories/${storyId}/reaction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    },
  );
}

export async function removeStoryReaction(storyId: number): Promise<void> {
  await requestJson(`/api/community/stories/${storyId}/reaction`, { method: "DELETE" });
}

export async function shareStory(storyId: number): Promise<void> {
  await requestJson(`/api/community/stories/${storyId}/share`, { method: "POST" });
}

export async function getStoryMetrics(storyId: number): Promise<StoryMetrics> {
  return requestJson(`/api/community/stories/${storyId}/interactions`);
}

export async function getStoryComments(storyId: number, signal?: AbortSignal): Promise<StoryComments> {
  return requestJson(`/api/community/stories/${storyId}/comments`, { signal });
}

export async function postStoryComment(storyId: number, body: string): Promise<{ moderation_pending?: boolean; comment_id?: number }> {
  return requestJson(`/api/community/stories/${storyId}/comments`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
  });
}

export async function deleteStoryComment(storyId: number, commentId: number): Promise<void> {
  await requestJson(`/api/community/stories/${storyId}/comments/${commentId}`, { method: "DELETE" });
}

export async function sendStoryContextMessage(input: {
  recipientId: number;
  storyId: number;
  body?: string;
}): Promise<void> {
  await requestJson("/api/messages/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipientId: input.recipientId,
      body: input.body?.trim() ?? "",
      contexts: [{
        type: "story",
        story_id: input.storyId,
        label: `Community Story #${input.storyId}`,
      }],
    }),
  });
}