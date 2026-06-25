/**
 * SMS Abstraction — Multi-Modal Notifications
 *
 * Provides SMS fallback for critical alerts (SOS / Emergency requests)
 * when push notifications may not reach offline users.
 *
 * Backed by Twilio's REST API. Gracefully no-ops when TWILIO_* env vars
 * are not configured so the app stays functional without SMS in dev.
 *
 * Required env vars (all optional — SMS is disabled if any are missing):
 *   TWILIO_ACCOUNT_SID   — Twilio account SID
 *   TWILIO_AUTH_TOKEN    — Twilio auth token
 *   TWILIO_PHONE_NUMBER  — Twilio from number (e.g. +18175550100)
 *
 * Optional:
 *   ADMIN_SMS_NUMBER     — Admin phone to receive SOS/emergency alerts
 */
import { logger } from "./logger";

const TWILIO_SID  = process.env["TWILIO_ACCOUNT_SID"];
const TWILIO_AUTH = process.env["TWILIO_AUTH_TOKEN"];
const TWILIO_FROM = process.env["TWILIO_PHONE_NUMBER"];

function isTwilioConfigured(): boolean {
  return Boolean(TWILIO_SID && TWILIO_AUTH && TWILIO_FROM);
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isTwilioConfigured()) {
    logger.warn("Twilio not configured — SMS skipped");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({
    To:   to,
    From: TWILIO_FROM!,
    Body: body.slice(0, 1600), // SMS segment length guard
  });

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        Authorization:  `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    logger.info({ to }, "sms: sent");
    return true;
  } catch (err) {
    logger.error({ err, to }, "sms: failed");
    return false;
  }
}

/** SMS fallback when push notification fails for a specific user */
export async function smsFallback(
  phone: string | null | undefined,
  title: string,
  body: string
): Promise<void> {
  if (!phone) return;
  await sendSms(phone, `[Niakofa] ${title}: ${body}`);
}

/**
 * Alert the configured admin phone number about a critical platform event.
 * Silently no-ops if ADMIN_SMS_NUMBER or Twilio credentials are not set.
 */
export async function sendAdminSmsAlert(message: string): Promise<void> {
  const adminPhone = process.env["ADMIN_SMS_NUMBER"];
  if (!adminPhone) return;
  await sendSms(adminPhone, message);
}

/**
 * Send an emergency SMS to a user's panic contacts when they trigger SOS.
 * panicContacts is an array of phone number strings from the user profile.
 */
export async function sendSosPanicContacts(
  panicContacts: string[],
  requesterName: string,
  neighborhood: string | null,
  requestId: number
): Promise<void> {
  if (!isTwilioConfigured() || panicContacts.length === 0) return;

  const location = neighborhood ? ` in ${neighborhood}` : "";
  const msg =
    `🚨 NIAKOFA ALERT: ${requesterName} just posted an emergency request${location}. ` +
    `They may need help right now. Check on them or call 911 if concerned. ` +
    `Request #${requestId}`;

  await Promise.allSettled(panicContacts.map((phone) => sendSms(phone, msg)));
}
