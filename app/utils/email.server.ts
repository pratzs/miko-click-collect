import nodemailer from "nodemailer";
import type { ClickCollectOrder, PickupLocation, ShopConfig } from "@prisma/client";
import { db } from "../db.server";

type OrderWithLocation = ClickCollectOrder & { pickupLocation: PickupLocation };

const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendViaResend(
  from: string,
  to: string,
  subject: string,
  html: string,
  bcc?: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(bcc ? { bcc: [bcc] } : {}),
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(
  config: ShopConfig,
  from: string,
  to: string,
  subject: string,
  html: string,
  bcc?: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  await transporter.sendMail({ from, to, ...(bcc ? { bcc } : {}), subject, html });
}

async function sendEmail(
  config: ShopConfig,
  to: string,
  subject: string,
  html: string,
  bcc?: string,
): Promise<void> {
  const fromName = config.smtpFromName || config.senderName || config.shopName || "Your Store";
  const fromEmail = config.smtpFromEmail || config.replyToEmail;
  const from = `${fromName} <${fromEmail}>`;

  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    await sendViaSmtp(config, from, to, subject, html, bcc);
  } else if (RESEND_API_KEY) {
    const resendFrom = `${fromName} <onboarding@resend.dev>`;
    await sendViaResend(resendFrom, to, subject, html, bcc);
  } else {
    throw new Error("No email provider configured. Set RESEND_API_KEY or configure SMTP.");
  }
}

function brandColor(config: ShopConfig) {
  return config.brandPrimaryColor || "#1a1a1a";
}

function logoBlock(config: ShopConfig) {
  if (config.brandLogoUrl) {
    return `<img src="${config.brandLogoUrl}" alt="${config.brandName || config.shopName}" style="max-height:48px;max-width:200px;" />`;
  }
  return `<span style="font-size:22px;font-weight:700;color:white;">${config.brandName || config.shopName || "Your Store"}</span>`;
}

const STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Collected" },
];

function progressBarHtml(currentStatus: string, config: ShopConfig): string {
  const color = brandColor(config);
  const steps = STEPS.filter((s) => {
    if (s.key === "processing" && !config.useProcessingStep) return false;
    if (s.key === "packing" && !config.usePackingStep) return false;
    return true;
  });

  const currentIdx = steps.findIndex((s) => s.key === currentStatus);

  const stepHtml = steps
    .map((step, i) => {
      const isActive = i <= currentIdx;
      const isCurrent = i === currentIdx;
      const circleColor = isActive ? color : "#ddd";
      const textWeight = isCurrent ? "700" : "400";
      const textColor = isActive ? "#1a1a1a" : "#999";
      return `
        <td style="text-align:center;padding:0 4px;width:${100 / steps.length}%;">
          <div style="width:28px;height:28px;border-radius:50%;background:${circleColor};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-bottom:4px;">
            ${isActive ? "&#10003;" : i + 1}
          </div>
          <div style="font-size:11px;color:${textColor};font-weight:${textWeight};">${step.label}</div>
        </td>`;
    })
    .join("");

  const lineHtml = steps
    .slice(0, -1)
    .map((_, i) => {
      const filled = i < currentIdx;
      return `<td style="padding:0;height:3px;background:${filled ? color : "#ddd"};"></td>`;
    })
    .join('<td style="width:28px;"></td>');

  return `
    <div style="margin:24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>${stepHtml}</tr>
      </table>
      <table width="80%" cellpadding="0" cellspacing="0" style="margin:0 auto;margin-top:-22px;">
        <tr>${lineHtml}</tr>
      </table>
    </div>`;
}

function statusUpdateHtml(
  config: ShopConfig,
  order: OrderWithLocation,
  title: string,
  message: string,
  status: string,
  showLocation: boolean,
): string {
  const color = brandColor(config);
  const location = order.pickupLocation;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">
          ${logoBlock(config)}
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:26px;color:#1a1a1a;">${title}</h1>
          <p style="color:#555;margin:0 0 16px;">Hi ${order.customerName || "there"}, ${message}</p>

          ${progressBarHtml(status, config)}

          <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em;">Order</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a;">${order.shopifyOrderName}</p>
          </div>

          ${showLocation ? `
          <div style="border:2px solid ${color};border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em;">Collect from</p>
            <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1a1a1a;">${location.name}</p>
            ${location.address ? `<p style="margin:0 0 2px;color:#555;">${location.address}</p>` : ""}
            ${location.city ? `<p style="margin:0 0 2px;color:#555;">${location.city}${location.postcode ? ` ${location.postcode}` : ""}</p>` : ""}
            ${location.phone ? `<p style="margin:0;color:#555;">${location.phone}</p>` : ""}
          </div>
          ${location.collectionInstructions ? `
          <div style="background:#fffbe6;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-weight:600;color:#1a1a1a;">Collection instructions</p>
            <p style="margin:0;color:#555;">${location.collectionInstructions}</p>
          </div>` : ""}` : ""}

          <p style="color:#888;font-size:13px;margin:0;">Please bring your order confirmation or ID when collecting.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:12px;">&copy; ${new Date().getFullYear()} ${config.brandName || config.shopName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendStatusEmail(
  config: ShopConfig,
  order: OrderWithLocation,
  status: string,
): Promise<boolean> {
  if (!config.replyToEmail && !config.smtpHost) return false;
  if (!RESEND_API_KEY && !config.smtpHost) return false;

  const templates: Record<string, { subject: string; title: string; message: string; showLocation: boolean }> = {
    confirmed: {
      subject: `Order ${order.shopifyOrderName} confirmed for pickup`,
      title: "Order confirmed",
      message: "your click & collect order has been received. We will notify you at each step.",
      showLocation: true,
    },
    processing: {
      subject: `Order ${order.shopifyOrderName} is being processed`,
      title: "We're working on your order",
      message: "your order is now being processed. We will let you know when it's ready.",
      showLocation: false,
    },
    packing: {
      subject: `Order ${order.shopifyOrderName} is being packed`,
      title: "Your order is being packed",
      message: "your order is being packed and will be ready for collection soon.",
      showLocation: false,
    },
    ready: {
      subject: config.notifyReadySubject || "Your order is ready for collection",
      title: "Ready for collection",
      message: "great news - your order is ready to collect.",
      showLocation: true,
    },
    picked_up: {
      subject: config.notifyPickedUpSubject || "Thanks for collecting your order!",
      title: "Thank you",
      message: `your order ${order.shopifyOrderName} has been collected. Enjoy!`,
      showLocation: false,
    },
  };

  const tmpl = templates[status];
  if (!tmpl) return false;

  const html = statusUpdateHtml(config, order, tmpl.title, tmpl.message, status, tmpl.showLocation);
  const bcc = status === "ready" ? config.notifyMerchantEmail || undefined : undefined;

  try {
    await sendEmail(config, order.customerEmail, tmpl.subject, html, bcc);

    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: status,
        recipientEmail: order.customerEmail,
        subject: tmpl.subject,
        status: "sent",
      },
    });
    return true;
  } catch (err) {
    console.error(`Email send failed for ${status}:`, err);
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: status,
        recipientEmail: order.customerEmail,
        subject: tmpl.subject,
        status: "failed",
        errorMessage: String(err),
      },
    });
    return false;
  }
}

// Legacy wrappers for backwards compatibility
export async function sendReadyToCollectEmail(config: ShopConfig, order: OrderWithLocation): Promise<boolean> {
  return sendStatusEmail(config, order, "ready");
}

export async function sendPickedUpEmail(config: ShopConfig, order: OrderWithLocation): Promise<boolean> {
  return sendStatusEmail(config, order, "picked_up");
}
