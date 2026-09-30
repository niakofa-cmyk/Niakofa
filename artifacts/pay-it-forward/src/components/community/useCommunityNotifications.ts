import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { wsSubscribe } from "@/lib/wsClient";

export interface LiveNotification {
  id: string;
  type:
    | "emergency" | "new_request" | "completed" | "pledge" | "nearby"
    | "helper_accepted" | "pledge_scheduled" | "chat" | "call" | "hub_message"
    | "story" | "story_reaction" | "story_share" | "story_mention" | "community"
    | "exchange" | "system" | "circle_went_live";
  title: string;
  body: string;
  time: Date;
  actionUrl?: string;
  read_at?: string | null;
}

export interface CommunityNotificationsData {
  notifications: LiveNotification[];
  unread_count: number;
}

type WireNotification = Omit<LiveNotification, "time"> & { time?: string | null };
const notificationQueryKey = (userId: number | null) =>
  ["niakofa-community-notifications", userId ?? "signed-out"] as const;

async function requestNotifications(
  signal: AbortSignal,
  isCurrentSession: () => boolean,
): Promise<CommunityNotificationsData> {
  const response = await fetch("/api/messages/notifications", { headers: authHeaders(), signal });
  if (!isCurrentSession()) throw new Error("Notification session changed while loading.");
  if (!response.ok) throw new Error(`Notifications could not be loaded (${response.status}).`);
  const data = await response.json() as { unread_count?: number; notifications?: WireNotification[] };
  if (!isCurrentSession()) throw new Error("Notification session changed while loading.");
  return {
    unread_count: Number(data.unread_count ?? 0),
    notifications: (data.notifications ?? []).map((item) => ({
      ...item,
      time: item.time ? new Date(item.time) : new Date(),
    })),
  };
}

async function postNotificationAction(url: string, isCurrentSession: () => boolean): Promise<void> {
  if (!isCurrentSession()) throw new Error("Your account changed before the notification update could be sent.");
  const response = await fetch(url, { method: "POST", headers: authHeaders() });
  if (!response.ok) throw new Error(`Notification update failed (${response.status}).`);
}

export function useCommunityNotifications() {
  const queryClient = useQueryClient();
  const { currentUser } = useAppContext();
  const userId = currentUser?.id ?? null;
  const currentUserIdRef = useRef<number | null>(userId);
  currentUserIdRef.current = userId;
  const queryKey = notificationQueryKey(userId);

  const query = useQuery<CommunityNotificationsData>({
    queryKey,
    queryFn: ({ signal }) => {
      if (userId == null) throw new Error("Sign in to load notifications.");
      return requestNotifications(signal, () => currentUserIdRef.current === userId);
    },
    enabled: userId != null,
    staleTime: 15_000,
  });
  const markReadMutation = useMutation({
    mutationFn: ({ id, userId: targetUserId }: { id: string; userId: number }) =>
      postNotificationAction(
        `/api/messages/notifications/${encodeURIComponent(id)}/read`,
        () => currentUserIdRef.current === targetUserId,
      ),
    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKey(variables.userId), exact: true });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: (targetUserId: number) => postNotificationAction(
      "/api/messages/notifications/read-all",
      () => currentUserIdRef.current === targetUserId,
    ),
    onSettled: async (_data, _error, targetUserId) => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKey(targetUserId), exact: true });
    },
  });

  useEffect(() => {
    if (userId == null) return;
    const subscribedUserId = userId;
    return wsSubscribe((event) => {
      if (event.type !== "message_notification" || currentUserIdRef.current !== subscribedUserId) return;
      // Treat the socket frame only as a signal. The authenticated endpoint is
      // the source of truth for both ownership and notification contents.
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKey(subscribedUserId),
        exact: true,
      });
    });
  }, [queryClient, userId]);

  const markReadMutateRef = useRef(markReadMutation.mutate);
  markReadMutateRef.current = markReadMutation.mutate;
  const markAllReadMutateRef = useRef(markAllReadMutation.mutate);
  markAllReadMutateRef.current = markAllReadMutation.mutate;
  const markRead = useCallback((id: string) => {
    if (userId != null) markReadMutateRef.current({ id, userId });
  }, [userId]);
  const markAllRead = useCallback(() => {
    if (userId != null) markAllReadMutateRef.current(userId);
  }, [userId]);
  return {
    ...query,
    notifications: userId == null ? [] : query.data?.notifications ?? [],
    unreadCount: userId == null ? 0 : query.data?.unread_count ?? 0,
    markRead,
    markAllRead,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
    markReadError: markReadMutation.error,
    markAllReadError: markAllReadMutation.error,
  };
}