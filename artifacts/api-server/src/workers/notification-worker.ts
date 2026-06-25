/**
 * Notification Worker — Async push notification delivery.
 *
 * Decouples push notification delivery from the HTTP request/response cycle.
 * Enqueue a notification from any route handler without blocking the response.
 * Retries 3 times with 30-second fixed delays on delivery failure.
 */
import { Worker, type Job } from "bullmq";
import { getRedisConnection, QUEUE, type NotificationJobData } from "../lib/queue";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { user_id, title, body, urgency, requestId } = job.data;

  await sendPushToUser(user_id, {
    title,
    body,
    urgency: urgency ?? "normal",
    requestId,
  });

  logger.info({ user_id, title }, "notification-worker: delivered");
}

export function startNotificationWorker(): Worker<NotificationJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("notification-worker: Redis not configured — worker will not start");
    return null;
  }

  // Retry config (attempts: 3, backoff: fixed 30s) lives on notificationQueue
  // in lib/queue.ts — Worker does NOT support defaultJobOptions (BullMQ silently
  // ignores that key on Worker; only Queue honours it). concurrency controls how
  // many push deliveries run in parallel.
  const worker = new Worker<NotificationJobData>(
    QUEUE.NOTIFICATIONS,
    processNotification,
    {
      connection: conn,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, user_id: job.data.user_id }, "notification-worker: delivered")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "notification-worker: delivery failed — will retry if attempts remain")
  );

  logger.info("notification-worker: started (concurrency 5)");
  return worker;
}
