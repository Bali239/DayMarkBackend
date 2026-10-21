import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { CLIENT_EMAIL, PRIVATE_KEY, PROJECT_ID, pushConfigured } from "../config/env.js";

let messaging = null;

if (pushConfigured) {
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error(
      "Firebase Admin credentials are incomplete. Set PROJECT_ID, CLIENT_EMAIL, and PRIVATE_KEY.",
    );
  }

  const credential = cert({
    projectId: PROJECT_ID,
    clientEmail: CLIENT_EMAIL,
    privateKey: PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
  const app = getApps().length ? getApp() : initializeApp({ credential });
  messaging = getMessaging(app);
}

export default messaging;
