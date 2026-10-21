import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
  mailConfigured,
} from "../config/env.js";

const mimeTransport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "unix",
});

const gmailOAuthClient = mailConfigured
  ? new OAuth2Client(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
  : null;

if (gmailOAuthClient) {
  gmailOAuthClient.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
}

export async function sendGmailMessage({ to, subject, text, html }) {
  if (!gmailOAuthClient) {
    throw new Error("Gmail API is not configured.");
  }

  const mimeMessage = await mimeTransport.sendMail({
    from: GMAIL_SENDER_EMAIL,
    to,
    subject,
    text,
    html,
  });
  const response = await gmailOAuthClient.request({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    method: "POST",
    data: { raw: mimeMessage.message.toString("base64url") },
  });

  return {
    messageId: response.data?.id || null,
    threadId: response.data?.threadId || null,
  };
}
