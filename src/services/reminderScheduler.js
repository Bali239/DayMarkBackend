import { CronJob } from "cron";
import nodemailer from "nodemailer";
import firebaseMessaging from "./firebaseAdmin.js";
import {
  MAIL_FROM,
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
    console.error(`Reminder scheduler failed: ${error.message}`);
  } finally {
    running = false;
  }
}

async function sendReminderEmail(reminder, user) {
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
      await Reminder.updateOne(
        { _id: reminder._id, emailSentAt: null },
        { $set: { emailSentAt: new Date() } },
      );
    } else {
      const rejected = (delivery.rejected || []).join(", ");
      console.error(
        `Reminder email was not accepted (${reminder._id})${rejected ? `: ${rejected}` : "."}`,
      );
    }
  } catch (error) {
    console.error(`Reminder email failed (${reminder._id}): ${error.message}`);
  }
}

async function sendReminderPush(reminder, user) {
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
      await User.updateOne(
        { _id: user._id },
        { $pull: { pushTokens: { $in: invalidTokens } } },
      );
    }
    if (result.successCount > 0) {
      await Reminder.updateOne(
        { _id: reminder._id, pushSentAt: null },
        { $set: { pushSentAt: new Date() } },
      );
    }
    if (result.failureCount > 0) {
      console.error(
        `Push delivery failed for ${result.failureCount} device(s) (${reminder._id}).`,
      );
    }
  } catch (error) {
    console.error(`Push delivery failed (${reminder._id}): ${error.message}`);
  }
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
