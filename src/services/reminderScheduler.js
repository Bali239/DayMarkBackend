import { CronJob } from "cron";
import firebaseMessaging from "./firebaseAdmin.js";
import {
  PRIVATE_KEY,
  DATABASE_URL,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
  gmailApiKeyConfigured,
  mailConfigured,
  pushConfigured,
} from "../config/env.js";
import { sendGmailMessage } from "./gmail.js";
import Reminder from "../models/Reminder.js";
import User from "../models/User.js";

let running = false;
const pushSkipLoggedAt = new Map();

async function processDueReminders() {
  if ((!mailConfigured && !firebaseMessaging) || running) return;
  running = true;
  try {
    const now = new Date();
    const eligibleUsers = await User.find(
      {},
      { _id: 1, email: 1, name: 1, reminderAdvanceMinutes: 1, pushTokens: 1 },
    ).lean();
    const advanceByUser = new Map(
      eligibleUsers.map((user) => [String(user._id), user]),
    );
    const deliveryConditions = [];
    if (mailConfigured) deliveryConditions.push({ emailSentAt: null });
    const pushUserIds = eligibleUsers
      .filter((user) => user.pushTokens?.length)
      .map((user) => user._id);
    if (firebaseMessaging && pushUserIds.length) {
      deliveryConditions.push({
        pushSentAt: null,
        user: { $in: pushUserIds },
      });
    }
    if (!deliveryConditions.length) return;

    const reminders = await Reminder.find({
      completedAt: null,
      emailSuppressed: { $ne: true },
      title: { $not: /^\[Seed\]/ },
      dueAt: { $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      $or: deliveryConditions,
    })
      .sort({ dueAt: 1 })
      .limit(500)
      .lean();
    let emailSentThisRun = false;
    for (const reminder of reminders) {
      const user = advanceByUser.get(String(reminder.user));
      if (!user) continue;
      const notifyAt = new Date(
        reminder.dueAt.getTime() - user.reminderAdvanceMinutes * 60 * 1000,
      );
      if (notifyAt > now) continue;
      const deliveries = [];
      if (mailConfigured && !reminder.emailSentAt) {
        if (!emailSentThisRun) {
          await sendReminderEmail(reminder, user);
          emailSentThisRun = true;
        }
      }
      if (firebaseMessaging && !reminder.pushSentAt && user.pushTokens?.length) {
        deliveries.push(sendReminderPush(reminder, user));
      } else if (firebaseMessaging && !reminder.pushSentAt && !user.pushTokens?.length) {
        logPushSkipped(String(reminder._id));
      }
      await Promise.all(deliveries);
    }
  } catch (error) {
    logError("reminder_scheduler_failed", error);
  } finally {
    running = false;
  }
}

async function sendReminderEmail(reminder, user) {
  let phase = "provider_send";
  try {
    const dueAt = new Date(reminder.dueAt);
    const dateText = dueAt.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeText = dueAt.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const descriptionText = reminder.description?.trim() || "No additional details provided.";
    const category = reminder.category || "Personal";
    const safeName = escapeHtml(user.name || "there");
    const safeTitle = escapeHtml(reminder.title);
    const safeDescription = escapeHtml(descriptionText).replace(/\n/g, "<br>");
    const safeCategory = escapeHtml(category);
    const dueLabel = `${dateText} at ${timeText}`;
    const delivery = await sendGmailMessage({
      to: user.email,
      subject: `Reminder: ${reminder.title}`,
      text: `Hi ${user.name || "there"},\n\nYour reminder is coming up.\n\n${reminder.title}\n${descriptionText}\n\nDue ${dueLabel}\nCategory: ${category}\n\n— Daymark`,
      html: `<!doctype html><html><body style="margin:0;padding:32px 12px;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e9e5f5;border-radius:18px;overflow:hidden"><tr><td style="padding:24px 30px;background:#6d5ce8;color:#ffffff"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold">Daymark</div><div style="font-size:14px;margin-top:7px;opacity:.9">A gentle heads-up</div></td></tr><tr><td style="padding:30px"><p style="margin:0 0 18px;font-size:16px">Hi ${safeName},</p><p style="margin:0 0 8px;color:#6b7280;font-size:14px">You have a reminder coming up</p><h1 style="margin:0 0 18px;font-size:25px;line-height:1.3;color:#242033">${safeTitle}</h1><div style="display:inline-block;margin-bottom:22px;padding:7px 11px;border-radius:999px;background:#f3f0ff;color:#5b4bcc;font-size:12px;font-weight:bold">${safeCategory}</div><div style="padding:17px 18px;border:1px solid #eeeaf7;border-radius:12px;background:#faf9ff"><div style="margin-bottom:6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px">Due</div><div style="font-size:16px;font-weight:bold;color:#29243d">${escapeHtml(dueLabel)}</div></div><div style="margin-top:22px;color:#4b5563;font-size:14px;line-height:1.7">${safeDescription}</div></td></tr><tr><td style="padding:18px 30px;border-top:1px solid #eeeaf7;color:#8b8798;font-size:12px">Sent by Daymark · Stay on top of what matters.</td></tr></table></td></tr></table></body></html>`,
    });
    if (delivery.messageId) {
      phase = "mark_sent_in_database";
      await Reminder.updateOne(
        { _id: reminder._id, emailSentAt: null },
        { $set: { emailSentAt: new Date() } },
      );
      logEvent("info", "reminder_delivery_sent", {
        channel: "email",
        provider: "gmail_api",
        reminderId: String(reminder._id),
        providerMessageId: delivery.messageId,
      });
    } else {
      logError("reminder_delivery_failed", new Error("Gmail API returned no message ID"), {
        channel: "email",
        phase: "provider_rejected",
        reminderId: String(reminder._id),
      });
    }
  } catch (error) {
    logError("reminder_delivery_failed", error, {
      channel: "email",
      phase,
      reminderId: String(reminder._id),
    }, [user.email]);
  }
}

async function sendReminderPush(reminder, user) {
  let phase = "firebase_send";
  try {
    const result = await firebaseMessaging.sendEachForMulticast({
      tokens: user.pushTokens,
      data: {
        title: `Reminder: ${reminder.title}`,
        body: reminder.description || "Your reminder is due soon.",
        url: "/reminder",
        reminderId: String(reminder._id),
      },
    });
    const invalidTokens = result.responses.flatMap((response, index) => {
      const code = response.error?.code;
      return [
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered",
      ].includes(code)
        ? [user.pushTokens[index]]
        : [];
    });
    if (invalidTokens.length) {
      phase = "remove_invalid_tokens_from_database";
      await User.updateOne(
        { _id: user._id },
        { $pull: { pushTokens: { $in: invalidTokens } } },
      );
      logEvent("warn", "push_invalid_tokens_removed", {
        channel: "push",
        reminderId: String(reminder._id),
        removedCount: invalidTokens.length,
      });
    }
    if (result.successCount > 0) {
      logEvent("info", "reminder_delivery_sent", {
        channel: "push",
        provider: "firebase_fcm",
        reminderId: String(reminder._id),
        successCount: result.successCount,
        failureCount: result.failureCount,
      });
    }
    if (result.successCount > 0) {
      phase = "mark_sent_in_database";
      await Reminder.updateOne(
        { _id: reminder._id, pushSentAt: null },
        { $set: { pushSentAt: new Date() } },
      );
    }
    if (result.failureCount > 0) {
      const failureCodes = result.responses.reduce((counts, response) => {
        if (!response.error) return counts;
        const code = response.error.code || "unknown";
        counts[code] = (counts[code] || 0) + 1;
        return counts;
      }, {});
      logError("reminder_delivery_failed", new Error("Firebase rejected one or more devices"), {
        channel: "push",
        phase: "provider_rejected",
        reminderId: String(reminder._id),
        successCount: result.successCount,
        failureCount: result.failureCount,
        failureCodes,
      });
    }
  } catch (error) {
    logError("reminder_delivery_failed", error, {
      channel: "push",
      phase,
      reminderId: String(reminder._id),
    }, user.pushTokens);
  }
}

function logError(event, error, context = {}, additionalSecrets = []) {
  let message = String(error?.message || error || "Unknown failure");
  for (const secret of [
    PRIVATE_KEY,
    DATABASE_URL,
    GMAIL_OAUTH_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
    GMAIL_SENDER_EMAIL,
    ...(additionalSecrets || []),
  ]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED EMAIL]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED KEY]")
    .slice(0, 1000);

  console.error(
    JSON.stringify({
      level: "error",
      event,
      ...context,
      error: {
        name: error?.name || "Error",
        code: error?.code || null,
        command: error?.command || null,
        responseCode: error?.responseCode || null,
        httpStatus: error?.response?.status || error?.status || null,
        providerReason: error?.response?.data?.error?.status || null,
        message,
      },
      at: new Date().toISOString(),
    }),
  );
}

function logPushSkipped(reminderId) {
  const now = Date.now();
  const previous = pushSkipLoggedAt.get(reminderId) || 0;
  if (now - previous < 15 * 60 * 1000) return;

  pushSkipLoggedAt.set(reminderId, now);
  if (pushSkipLoggedAt.size > 1000) {
    for (const [key, timestamp] of pushSkipLoggedAt) {
      if (now - timestamp >= 15 * 60 * 1000) pushSkipLoggedAt.delete(key);
    }
  }
  logEvent("info", "reminder_delivery_skipped", {
    channel: "push",
    reason: "no_registered_tokens",
    reminderId,
  });
}

async function logPushReadiness() {
  if (!firebaseMessaging) return;
  try {
    const registeredUsers = await User.countDocuments({
      "pushTokens.0": { $exists: true },
    });
    if (registeredUsers === 0) {
      logEvent("warn", "push_delivery_not_ready", {
        reason: "no_registered_tokens",
      });
    }
  } catch (error) {
    logError("push_readiness_check_failed", error);
  }
}

function logEvent(level, event, context = {}) {
  const entry = JSON.stringify({
    level,
    event,
    ...context,
    at: new Date().toISOString(),
  });
  (level === "warn" ? console.warn : console.log)(entry);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

export function startReminderScheduler() {
  logEvent("info", "reminder_scheduler_configuration", {
    emailEnabled: mailConfigured,
    pushEnabled: pushConfigured,
  });
  if (gmailApiKeyConfigured && !mailConfigured) {
    logEvent("warn", "gmail_api_key_cannot_authorize_sending", {
      required: [
        "GMAIL_OAUTH_CLIENT_ID",
        "GMAIL_OAUTH_CLIENT_SECRET",
        "GMAIL_REFRESH_TOKEN",
        "GMAIL_SENDER_EMAIL",
      ],
    });
  }
  if (!mailConfigured && !pushConfigured) {
    console.warn(
      "Reminder scheduler is idle: configure Gmail API or Firebase Admin credentials.",
    );
    return;
  }
  const job = new CronJob(
    "0 * * * * *",
    processDueReminders,
    null,
    true,
    "UTC",
  );
  void logPushReadiness();
  void processDueReminders();
  logEvent("info", "reminder_scheduler_started", { interval: "every_minute" });
}
