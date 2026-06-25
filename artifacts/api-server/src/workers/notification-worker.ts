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

  // BUG-5-M11: Add retry config so failed push deliveries move to the failed
  // queue with BullMQ standard backoff, rather than blocking the concurrency
  // slot by lingering in "active". removeOnFail keeps the failed queue bounded.
  const worker = new Worker<NotificationJobData>(
    QUEUE.NOTIFICATIONS,
    processNotification,
    {
      connection: conn,
      concurrency: 5,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "fixed", delay: 30_000 }, // 30s between push retries
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
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
