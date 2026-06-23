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

// No HTML-escaping utility existed anywhere in this codebase (the "esc("
// hits found earlier were false positives — substring matches on
// drizzle-orm's `desc(...)`). User-supplied strings (names, request titles,
// alert bodies) were being interpolated directly into HTML emails sent from
// the Niakofa address — an HTML/phishing-link injection risk. This escapes
// the characters that matter for both HTML text content and double-quoted
// attribute contexts (e.g. href="...").
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email subjects become SMTP headers — strip CR/LF so user content can't
// inject extra headers into the message.
export function sanitizeHeaderValue(input: string): string {
  return input.replace(/[\r\n]+/g, " ").trim();
}

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
      <div style="font-size:18px;font-weight:700;margin-bottom:16px">${escapeHtml(data.requestTitle)}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Helper</span><span style="font-weight:600">${escapeHtml(data.helperName)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Requester</span><span style="font-weight:600">${escapeHtml(data.requesterName)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#64748b">Completed</span><span>${data.completedAt.toLocaleString()}</span>
      </div>
      <div style="border-top:1px solid #1e3a5f;margin:16px 0"></div>
      <div style="text-align:center">${amountLine}</div>
    </div>
    <p style="text-align:center;font-size:12px;color:#64748b">
      Thank you for being part of the Niakofa community.<br>
      Your kindness makes your community stronger.
    </p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject: `✅ Help completed: ${sanitizeHeaderValue(data.requestTitle)}`,
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
    ? `<div style="text-align:center;margin-top:24px"><a href="${escapeHtml(data.ctaUrl)}" style="display:inline-block;background:#00d4ff;color:#0a0f1e;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">${escapeHtml(data.ctaText)}</a></div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="background:#0a0f1e;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:32px 24px">
  <div style="max-width:480px;margin:0 auto">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:28px;font-weight:900;color:#00d4ff">Niakofa</div>
    </div>
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:16px;padding:24px">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px">${escapeHtml(data.title)}</div>
      <div style="color:#94a3b8;line-height:1.6">${escapeHtml(data.body)}</div>
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
      subject: sanitizeHeaderValue(data.subject),
      html,
    });
    logger.info({ to: data.to, subject: data.subject }, "alert email sent");
  } catch (err) {
    logger.error({ err, to: data.to }, "alert email failed");
  }
}

export interface HelperDecisionData {
  to: string;
  applicantName: string;
  decision: "approved" | "denied";
  appUrl?: string;
}

export async function sendHelperApplicationDecision(data: HelperDecisionData): Promise<void> {
  if (!isSmtpConfigured()) return;
  const smtpUser = process.env["SMTP_USER"]!;
  const appUrl = escapeHtml(data.appUrl ?? "https://niakofa.community");

  const isApproved = data.decision === "approved";
  const safeApplicantName = escapeHtml(data.applicantName);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0f1e;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:32px;font-weight:900;color:#00d4ff;letter-spacing:-1px">Niakofa</div>
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;margin-top:4px">Help Today · Pay It Forward Tomorrow</div>
    </div>

    <div style="background:#111827;border:1px solid ${isApproved ? "#16a34a33" : "#dc262633"};border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <div style="font-size:48px;margin-bottom:16px">${isApproved ? "🎉" : "💙"}</div>
      <h1 style="font-size:22px;font-weight:900;margin:0 0 12px;color:${isApproved ? "#22c55e" : "#94a3b8"}">
        ${isApproved ? "You're Approved as a Helper!" : "Application Not Approved"}
      </h1>
      <p style="color:#94a3b8;line-height:1.6;margin:0 0 24px">
        Hi ${safeApplicantName},<br><br>
        ${isApproved
          ? "Your Niakofa helper application has been <strong style='color:#22c55e'>approved</strong>. You can now activate Helper Mode and start accepting requests from neighbors who need your support."
          : "Thank you for applying to be a Niakofa community helper. After review, we're unable to approve your application at this time. You may re-apply in 30 days. If you have questions, contact us at <a href='mailto:help@niakofa.community' style='color:#00d4ff'>help@niakofa.community</a>."}
      </p>
      ${isApproved ? `<a href="${appUrl}" style="display:inline-block;background:#00d4ff;color:#0a0f1e;font-weight:800;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;letter-spacing:0.5px">Open the App →</a>` : ""}
    </div>

    ${isApproved ? `
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:12px;padding:20px;margin-bottom:24px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">What's next</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${["Open your profile and enable Helper Mode", "Browse open requests near you on the map", "Claim a request and make someone's day"].map((step, i) => `
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:24px;height:24px;background:#00d4ff22;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#00d4ff;flex-shrink:0">${i + 1}</div>
          <span style="font-size:13px;color:#cbd5e1">${step}</span>
        </div>`).join("")}
      </div>
    </div>` : ""}

    <p style="text-align:center;font-size:12px;color:#475569;line-height:1.6">
      ${isApproved ? "Welcome to the team, neighbor. Your community is stronger because of you." : "Thank you for your interest in making your community stronger."}<br>
      — The Niakofa Community
    </p>
  </div>
</body>
</html>`;

  const subject = isApproved
    ? "🎉 You're approved — welcome to the Niakofa helper team!"
    : "Your Niakofa helper application update";

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject,
      html,
    });
    logger.info({ to: data.to, decision: data.decision }, "helper decision email sent");
  } catch (err) {
    logger.error({ err, to: data.to }, "helper decision email failed");
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
    <div style="font-size:14px;color:#64748b;margin-top:8px">Tip received for: <strong style="color:#e2e8f0">${escapeHtml(data.requestTitle)}</strong></div>
    <div style="font-size:12px;color:#64748b;margin-top:16px">Hi ${escapeHtml(data.helperName)}, someone appreciated your help so much they left a tip. It's been added to your wallet.</div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Niakofa" <${smtpUser}>`,
      to: data.to,
      subject: sanitizeHeaderValue(`💚 You received a tip for: ${data.requestTitle}`),
      html,
    });
  } catch (err) {
    logger.error({ err }, "tip notification email failed");
  }
}
