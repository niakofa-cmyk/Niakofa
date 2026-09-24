import { RequestContextCard } from "@/components/messages/RequestContextCard";
import { RequestMapContext } from "./RequestMapContext";
import type { RequestInteractionSummary } from "./RequestInteractionTypes";

type ConversationRequest = RequestInteractionSummary & {
  lat: number;
  lng: number;
};

export function RequestConversationContext({
  request,
  currentUserId,
  onOpen,
}: {
  request: ConversationRequest;
  currentUserId: number;
  onOpen: () => void;
}) {
  const normalizedRequest = {
    ...request,
    helper_id: request.helper_id ?? null,
  };

  return (
    <div className="space-y-3" data-testid={`context-request-conversation-${request.id}`}>
      <RequestContextCard request={normalizedRequest} currentUserId={currentUserId} onOpen={onOpen} />
      <RequestMapContext request={normalizedRequest} currentUserId={currentUserId} />
    </div>
  );
}