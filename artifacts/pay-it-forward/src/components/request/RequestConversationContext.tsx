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
  return (
    <div className="space-y-3" data-testid={`context-request-conversation-${request.id}`}>
      <RequestContextCard request={request} currentUserId={currentUserId} onOpen={onOpen} />
      <RequestMapContext request={request} currentUserId={currentUserId} />
    </div>
  );
}