import type { Request, Response, NextFunction } from "express";
import { recordMessageActivity, type MessageActivityEventType } from "../lib/message-activity-audit";

function classify(path: string): { eventType: MessageActivityEventType; entityType: string; entityId?: string; metadata?: Record<string, unknown> } | null {
  if (path === "/messages/direct" || path === "/messages/direct/") {
    return { eventType: "direct_message_sent", entityType: "direct_message" };
  }
  let match = path.match(/^\/messages\/direct\/(\d+)\/call-token$/);
  if (match) return { eventType: "direct_call_started", entityType: "direct_conversation", entityId: match[1] };

  match = path.match(/^\/diaspora\/hub-messages\/conversations\/(\d+)\/messages$/);
  if (match) return { eventType: "hub_message_sent", entityType: "hub_conversation", entityId: match[1] };

  if (path === "/messages/stories" || path === "/messages/stories/") {
    return { eventType: "story_created", entityType: "story" };
  }

  match = path.match(/^\/community\/hubs\/(\d+)\/posts$/);
  if (match) return { eventType: "community_post_created", entityType: "community_post", entityId: match[1] };

  match = path.match(/^\/community\/hubs\/(\d+)\/posts\/(\d+)\/media$/);
  if (match) return { eventType: "community_media_added", entityType: "community_post", entityId: match[2] };

  match = path.match(/^\/community\/hubs\/(\d+)\/posts\/(\d+)\/comments$/);
  if (match) return { eventType: "community_comment_created", entityType: "community_post", entityId: match[2] };

  match = path.match(/^\/community\/hubs\/(\d+)\/posts\/(\d+)\/reactions$/);
  if (match) return { eventType: "community_reaction", entityType: "community_post", entityId: match[2] };

  return null;
}

export function messageActivityAudit(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "POST") {
    next();
    return;
  }

  const classification = classify(req.path);
  if (!classification) {
    next();
    return;
  }

  res.once("finish", () => {
    const userId = req.authenticatedUserId;
    if (!userId || res.statusCode < 200 || res.statusCode >= 300) return;

    const metadata: Record<string, unknown> = {
      ...(classification.metadata ?? {}),
    };
    if (classification.eventType === "direct_message_sent") {
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0;
      metadata.has_attachments = attachments > 0;
      metadata.attachment_count = attachments;
      metadata.has_text = typeof req.body?.body === "string" && req.body.body.trim().length > 0;
    }
    if (classification.eventType === "community_reaction" && typeof req.body?.reaction === "string") {
      metadata.reaction = req.body.reaction.slice(0, 40);
    }

    void recordMessageActivity({
      userId,
      eventType: classification.eventType,
      entityType: classification.entityType,
      entityId: classification.entityId,
      metadata,
    });
  });

  next();
}
