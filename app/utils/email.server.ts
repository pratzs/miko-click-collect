import nodemailer from "nodemailer";
import type { ClickCollectOrder, PickupLocation, ShopConfig } from "@prisma/client";
import { db } from "../db.server";

type OrderWithLocation = ClickCollectOrder & { pickupLocation: PickupLocation };

function getTransporter(config: ShopConfig) {
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  // Default: use Shopify email relay / ethereal for dev
  if (process.env.NODE_ENV !== "production") {
    return nodemailer.createTransport({ host: "localhost", port: 1025, ignoreTLS: true });
  }
  throw new Error("No SMTP configured");
}

function brandColor(config: ShopConfig) {
  return config.brandPrimaryColor || "#1a1a1a";
}

function logoBlock(config: ShopConfig) {
  if (config.brandLogoUrl) {
    return `<img src="${config.brandLogoUrl}" alt="${config.brandName || config.shopName}" style="max-height:48px;max-width:200px;" />`;
  }
  return `<span style="font-size:22px;font-weight:700;color:${brandColor(config)};">${config.brandName || config.shopName || "Your Store"}</span>`;
}

export async function sendReadyToCollectEmail(
  config: ShopConfig,
  order: OrderWithLocation,
): Promise<boolean> {
  if (!config.replyToEmail && !config.smtpHost) return false;

  const location = order.pickupLocation;
  const subject = config.notifyReadySubject || "Your order is ready for collection";
  const color = brandColor(config);
  const fromName = config.smtpFromName || config.senderName || config.shopName || "Your Store";
  const fromEmail = config.smtpFromEmail || config.replyToEmail;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">
          ${logoBlock(config)}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:26px;color:#1a1a1a;">Ready for collection</h1>
          <p style="color:#555;margin:0 0 24px;">Hi ${order.customerName || "there"}, great news - your order is ready to collect.</p>

          <!-- Order box -->
          <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em;">Order</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a;">${order.shopifyOrderName}</p>
          </div>

          <!-- Pickup location -->
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
          </div>` : ""}

          <p style="color:#888;font-size:13px;margin:0;">Please bring your order confirmation or ID when collecting. We look forward to seeing you!</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:12px;">© ${new Date().getFullYear()} ${config.brandName || config.shopName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: order.customerEmail,
      ...(config.notifyMerchantEmail ? { bcc: config.notifyMerchantEmail } : {}),
      subject,
      html,
    });

    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "ready_to_collect",
        recipientEmail: order.customerEmail,
        subject,
        status: "sent",
      },
    });
    return true;
  } catch (err) {
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "ready_to_collect",
        recipientEmail: order.customerEmail,
        subject,
        status: "failed",
        errorMessage: String(err),
      },
    });
    return false;
  }
}

export async function sendPickedUpEmail(
  config: ShopConfig,
  order: OrderWithLocation,
): Promise<boolean> {
  if (!config.replyToEmail && !config.smtpHost) return false;

  const subject = config.notifyPickedUpSubject || "Thanks for collecting your order!";
  const color = brandColor(config);
  const fromName = config.smtpFromName || config.senderName || config.shopName || "Your Store";
  const fromEmail = config.smtpFromEmail || config.replyToEmail;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">${logoBlock(config)}</td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:26px;color:#1a1a1a;">Thank you</h1>
          <p style="color:#555;margin:0 0 24px;">Hi ${order.customerName || "there"}, your order ${order.shopifyOrderName} has been collected. Enjoy!</p>
          <p style="color:#888;font-size:13px;margin:0;">If you have any questions, feel free to reply to this email or contact us.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:12px;">© ${new Date().getFullYear()} ${config.brandName || config.shopName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: order.customerEmail,
      subject,
      html,
    });
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "picked_up",
        recipientEmail: order.customerEmail,
        subject,
        status: "sent",
      },
    });
    return true;
  } catch (err) {
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "picked_up",
        recipientEmail: order.customerEmail,
        subject,
        status: "failed",
        errorMessage: String(err),
      },
    });
    return false;
  }
}
