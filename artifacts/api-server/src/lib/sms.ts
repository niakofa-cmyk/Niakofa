import { logger } from "./logger";

const TWILIO_SID = process.env["TWILIO_ACCOUNT_SID"];
const TWILIO_AUTH = process.env["TWILIO_AUTH_TOKEN"];
const TWILIO_FROM = process.env["TWILIO_PHONE_NUMBER"];

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
    logger.warn("Twilio not configured — SMS skipped");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64")}`,
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

// SMS fallback when push notification fails
export async function smsFallback(
  phone: string | null | undefined,
  title: string,
  body: string,
): Promise<void> {
  if (!phone) return;
  await sendSms(phone, `[Niakofa] ${title}: ${body}`);
}
