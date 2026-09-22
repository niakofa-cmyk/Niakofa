export type MessageMode = "all" | "direct" | "requests" | "hub";

export function messagesPath(
  mode: MessageMode = "all",
  params: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  if (mode !== "all") query.set("mode", mode);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim()) query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `/messages?${suffix}` : "/messages";
}

export const directMessagePath = (userId: number | string) => messagesPath("direct", { to: userId });
export const hubMessagePath = (hubId: number | string) => messagesPath("hub", { sourceHub: hubId });
export const directConversationPath = (conversationId: number | string, messageId?: number | string) =>
  messagesPath("direct", { conversation: conversationId, message: messageId });
export const requestConversationPath = (requestId: number | string) =>
  messagesPath("requests", { request: requestId });
export const hubConversationPath = (conversationId: number | string) =>
  messagesPath("hub", { conversation: conversationId });