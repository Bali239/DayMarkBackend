import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { CLIENT_EMAIL, PRIVATE_KEY, PROJECT_ID, pushConfigured } from "../config/env.js";

let messaging = null;

if (pushConfigured) {
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error(JSON.stringify({
      level: "error",
      event: "firebase_admin_initialization_failed",
      reason: "incomplete_credentials",
      missingFields: [
        ["PROJECT_ID", PROJECT_ID],
        ["CLIENT_EMAIL", CLIENT_EMAIL],
        ["PRIVATE_KEY", PRIVATE_KEY],
      ].filter(([, value]) => !value).map(([name]) => name),
      at: new Date().toISOString(),
    }));
    throw new Error(
      "Firebase Admin credentials are incomplete. Set PROJECT_ID, CLIENT_EMAIL, and PRIVATE_KEY.",
    );
  }

  try {
    const credential = cert({
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
    const app = getApps().length ? getApp() : initializeApp({ credential });
    messaging = getMessaging(app);
    console.info(JSON.stringify({
      level: "info",
      event: "firebase_admin_initialized",
      projectId: PROJECT_ID,
      at: new Date().toISOString(),
    }));
  } catch (error) {
    let message = String(error?.message || "Firebase Admin initialization failed.");
    message = message
      .split(PRIVATE_KEY)
      .join("[REDACTED]")
      .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED KEY]")
      .slice(0, 500);
    console.error(JSON.stringify({
      level: "error",
      event: "firebase_admin_initialization_failed",
      errorName: error?.name || "Error",
      errorCode: error?.code || null,
      message,
      at: new Date().toISOString(),
    }));
    throw error;
  }
}

export default messaging;
