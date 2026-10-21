import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  GOOGLE_APPLICATION_CREDENTIALS,
  pushConfigured,
} from "../config/env.js";

let messaging = null;

if (pushConfigured) {
  const jsonCredential =
    FIREBASE_SERVICE_ACCOUNT_JSON ||
    (GOOGLE_APPLICATION_CREDENTIALS?.trimStart().startsWith("{")
      ? GOOGLE_APPLICATION_CREDENTIALS
      : null);
  let credential;

  if (jsonCredential) {
    try {
      const serviceAccount = JSON.parse(jsonCredential);
      if (
        serviceAccount.type !== "service_account" ||
        !serviceAccount.project_id ||
        !serviceAccount.client_email ||
        !serviceAccount.private_key
      ) {
        throw new Error("Invalid service account fields");
      }
      credential = cert(serviceAccount);
    } catch {
      throw new Error(
        "Invalid Firebase Admin JSON. Set FIREBASE_SERVICE_ACCOUNT_JSON to the complete service-account JSON value.",
      );
    }
  } else {
    credential = applicationDefault();
  }

  const app = getApps().length ? getApp() : initializeApp({ credential });
  messaging = getMessaging(app);
}

export default messaging;
