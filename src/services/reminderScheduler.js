import { CronJob } from "cron";
import nodemailer from "nodemailer";
import firebaseMessaging from "./firebaseAdmin.js";
import {
  MAIL_FROM,
  PRIVATE_KEY,
  DATABASE_URL,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  mailConfigured,
  pushConfigured,
} from "../config/env.js";
import Reminder from "../models/Reminder.js";
import User from "../models/User.js";

const transporter = mailConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

let running = false;
async function processDueReminders() {
  if ((!transporter && !firebaseMessaging) || running) return;
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
    if (transporter) deliveryConditions.push({ emailSentAt: null });
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
    for (const reminder of reminders) {
      const user = advanceByUser.get(String(reminder.user));
      if (!user) continue;
      const notifyAt = new Date(
        reminder.dueAt.getTime() - user.reminderAdvanceMinutes * 60 * 1000,
      );
      if (notifyAt > now) continue;
      const deliveries = [];
      if (transporter && !reminder.emailSentAt) {
        deliveries.push(sendReminderEmail(reminder, user));
      }
      if (firebaseMessaging && !reminder.pushSentAt && user.pushTokens?.length) {
        deliveries.push(sendReminderPush(reminder, user));
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
    const delivery = await transporter.sendMail({
      from: MAIL_FROM,
      to: user.email,
      subject: `Reminder: ${reminder.title}`,
      text: `Hi ${user.name},\n\nThis is your reminder${reminder.description ? `: ${reminder.description}` : "."}\nDue: ${reminder.dueAt.toLocaleString()}\n\n— Daymark`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>This is your reminder: <strong>${escapeHtml(reminder.title)}</strong></p>${reminder.description ? `<p>${escapeHtml(reminder.description)}</p>` : ""}<p>Due: ${escapeHtml(reminder.dueAt.toLocaleString())}</p><p>— Daymark</p>`,
    });
    const acceptedRecipients = (delivery.accepted || []).map((recipient) =>
      typeof recipient === "string" ? recipient : recipient.address,
    );
    const wasAccepted = acceptedRecipients.some(
      (recipient) => recipient?.toLowerCase() === user.email.toLowerCase(),
    );

    if (wasAccepted) {
      phase = "mark_sent_in_database";
      await Reminder.updateOne(
        { _id: reminder._id, emailSentAt: null },
        { $set: { emailSentAt: new Date() } },
      );
    } else {
      logError("reminder_delivery_failed", new Error("SMTP did not accept the recipient"), {
        channel: "email",
        phase: "provider_rejected",
        reminderId: String(reminder._id),
        acceptedCount: acceptedRecipients.length,
        rejectedCount: delivery.rejected?.length || 0,
        responseCode: delivery.responseCode || null,
      });
    }
  } catch (error) {
    logError("reminder_delivery_failed", error, {
      channel: "email",
      phase,
      reminderId: String(reminder._id),
    });
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
    });
  }
}

function logError(event, error, context = {}) {
  let message = String(error?.message || error || "Unknown failure");
  for (const secret of [PRIVATE_KEY, SMTP_PASS, DATABASE_URL]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message
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
        message,
      },
      at: new Date().toISOString(),
    }),
  );
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
  if (!mailConfigured && !pushConfigured) {
    console.warn(
      "Reminder scheduler is idle: configure SMTP or Firebase Admin credentials.",
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
  void processDueReminders();
  console.log("Reminder scheduler started (every minute).");
}
