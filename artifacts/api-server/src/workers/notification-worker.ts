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
  const { user_id, title, body, urgency, requestId, notifType } = job.data;

  await sendPushToUser(user_id, {
    title,
    body,
    urgency: urgency ?? "normal",
    requestId,
    notifType,
  });

  logger.info({ user_id, title }, "notification-worker: delivered");
}

export function startNotificationWorker(): Worker<NotificationJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("notification-worker: Redis not configured — worker will not start");
    return null;
  }

  const worker = new Worker<NotificationJobData>(
    QUEUE.NOTIFICATIONS,
    processNotification,
    {
      connection: conn,
      concurrency: 5, // push delivery is fast, allow parallelism
    }
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, user_id: job.data.user_id }, "notification-worker: delivered")
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "notification-worker: delivery failed")
  );

  logger.info("notification-worker: started (concurrency 5)");
  return worker;
}
