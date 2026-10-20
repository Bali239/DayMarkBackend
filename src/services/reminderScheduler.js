import { CronJob } from "cron";
import nodemailer from "nodemailer";
import { MAIL_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER, mailConfigured } from "../config/env.js";
import Reminder from "../models/Reminder.js";
import User from "../models/User.js";

const transporter = mailConfigured ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
}) : null;

let running = false;
async function processDueReminders() {
  if (!transporter || running) return;
  running = true;
  try {
    const now = new Date();
    const eligibleUsers = await User.find({}, { _id: 1, email: 1, name: 1, reminderAdvanceMinutes: 1 }).lean();
    const advanceByUser = new Map(eligibleUsers.map((user) => [String(user._id), user]));
    const reminders = await Reminder.find({
      completedAt: null,
      emailSentAt: null,
      emailSuppressed: { $ne: true },
      title: { $not: /^\[Seed\]/ },
      dueAt: { $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    }).sort({ dueAt: 1 }).limit(500).lean();
    for (const reminder of reminders) {
      const user = advanceByUser.get(String(reminder.user));
      if (!user) continue;
      const notifyAt = new Date(reminder.dueAt.getTime() - user.reminderAdvanceMinutes * 60 * 1000);
      if (notifyAt > now) continue;
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

        if (!wasAccepted) {
          const rejected = (delivery.rejected || []).join(", ");
          console.error(
            `Reminder email was not accepted (${reminder._id})${rejected ? `: ${rejected}` : "."}`,
          );
          continue;
        }

        await Reminder.updateOne({ _id: reminder._id, emailSentAt: null }, { $set: { emailSentAt: new Date() } });
      } catch (error) { console.error(`Reminder email failed (${reminder._id}): ${error.message}`); }
    }
  } catch (error) { console.error(`Reminder scheduler failed: ${error.message}`); }
  finally { running = false; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function startReminderScheduler() {
  if (!mailConfigured) {
    console.warn("Reminder email scheduler is idle: configure SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM.");
    return;
  }
  const job = new CronJob("0 * * * * *", processDueReminders, null, true, "UTC");
  void processDueReminders();
  console.log("Reminder email scheduler started (every minute).");
}
