export type CircleParticipantRole = "host" | "co_host" | "speaker" | "listener";
export type CircleMediaPublishPolicy = "open" | "moderated";

/**
 * Publishing media is separate from being on stage. An active participant in
 * an open room may intentionally publish a microphone or camera; moderated
 * rooms restrict publishing to hosts, co-hosts, and speakers.
 */
export function canPublishCircleMedia(
  role: CircleParticipantRole | null | undefined,
  policy: CircleMediaPublishPolicy = "open",
): boolean {
  if (!role) return false;
  return policy === "open" || role === "host" || role === "co_host" || role === "speaker";
}