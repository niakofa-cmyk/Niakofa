import nodemailer from "nodemailer";
import { logger } from "./logger";

const transporter = nodemailer.createTransport({
  host: process.env["SMTP_HOST"] ?? "smtp.mailgun.org",
  port: parseInt(process.env["SMTP_PORT"] ?? "587"),
  secure: false,
  auth: {
    user: process.env["SMTP_USER"] ?? "",
    pass: process.env["SMTP_PASS"] ?? "",
  },
});

export interface ReceiptData {
  to: string;
  helperName: string;
  requesterName: string;
  requestTitle: string;
  amount?: number;
  paymentType: string;
  completedAt: Date;
}

function isSmtpConfigured(): boolean {
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!user || !pass) {
    logger.warn({ hasUser: !!user, hasPass: !!pass }, "SMTP not fully configured — email disabled");
    return false;
  }
  return true;
}

export async function sendReceipt(data: ReceiptData): Promise<void> {
  if (!isSmtpConfigured()) return;
  const smtpUser = process.env["SMTP_USER"]!;

  const amountLine = data.amount
    ? `<p style="font-size:28px;font-weight:900;color:#00d4ff;margin:0">$${data.amount.toFixed(2)}</p>`
    : `<p style="color:#a78bfa">Goodwill — no payment required</p>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0f1e;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:32px;font-weight:900;color:#00d4ff;letter-spacing:-1px">Niakofa</div>
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;margin-top:4px">Help Today · Pay It Forward Tomorrow</div>
    </div>
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:16px;padding:24px;margin-bottom:24px">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Request Completed</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:16px">${data.requestTitle}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Helper</span><span style="font-weight:600">${data.helperName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Requester</span><span style="font-weight:600">${data.requesterName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Completed</span><span>${data.completedAt.toLocaleString()}</span>
      </div>
      <div style="border-top:1px solid #1e3a5f;margin:16px 0"></div>
      <div style="text-align:center">${amountLine}</div>
    </div>
    <p style="text-align:center;font-size:12px;color:#64748b">
      Thank you for being part of the Niakofa community.<br>
      Your kindness makes Fort Worth stronger.
    </p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject: `✅ Help completed: ${data.requestTitle}`,
      html,
    });
    logger.info({ to: data.to }, "receipt: email sent");
  } catch (err) {
    logger.error({ err, to: data.to }, "receipt: email failed");
  }
}

export interface AlertEmailData {
  to: string;
  subject: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

export async function sendAlertEmail(data: AlertEmailData): Promise<void> {
  if (!isSmtpConfigured()) return;
  const smtpUser = process.env["SMTP_USER"]!;

  const ctaBlock = data.ctaText && data.ctaUrl
    ? `<div style="text-align:center;margin-top:24px"><a href="${data.ctaUrl}" style="display:inline-block;background:#00d4ff;color:#0a0f1e;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">${data.ctaText}</a></div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="background:#0a0f1e;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:32px 24px">
  <div style="max-width:480px;margin:0 auto">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:28px;font-weight:900;color:#00d4ff">Niakofa</div>
    </div>
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:16px;padding:24px">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px">${data.title}</div>
      <div style="color:#94a3b8;line-height:1.6">${data.body}</div>
      ${ctaBlock}
    </div>
    <p style="text-align:center;font-size:12px;color:#475569;margin-top:16px">
      Niakofa — Help Today · Pay It Forward Tomorrow
    </p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject: data.subject,
      html,
    });
    logger.info({ to: data.to, subject: data.subject }, "alert email sent");
  } catch (err) {
    logger.error({ err, to: data.to }, "alert email failed");
  }
}

export interface TipData {
  to: string;
  helperName: string;
  requestTitle: string;
  tipAmount: number;
}

export async function sendTipNotification(data: TipData): Promise<void> {
  if (!isSmtpConfigured()) return;
  const smtpUser = process.env["SMTP_USER"]!;

  const html = `
<!DOCTYPE html>
<html>
<body style="background:#0a0f1e;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:32px 24px;max-width:480px;margin:0 auto">
  <div style="text-align:center;padding:32px;background:#111827;border:1px solid #16a34a33;border-radius:16px">
    <div style="font-size:48px;margin-bottom:16px">💚</div>
    <div style="font-size:28px;font-weight:900;color:#22c55e">+$${data.tipAmount.toFixed(2)}</div>
    <div style="font-size:14px;color:#64748b;margin-top:8px">Tip received for: <strong style="color:#e2e8f0">${data.requestTitle}</strong></div>
    <div style="font-size:12px;color:#64748b;margin-top:16px">Hi ${data.helperName}, someone appreciated your help so much they left a tip. It's been added to your wallet.</div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject: `💚 You received a tip for: ${data.requestTitle}`,
      html,
    });
  } catch (err) {
    logger.error({ err }, "tip notification email failed");
  }
}
