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
  const credential = GOOGLE_APPLICATION_CREDENTIALS
    ? applicationDefault()
    : cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON));
  const app = getApps().length ? getApp() : initializeApp({ credential });
  messaging = getMessaging(app);
}

export default messaging;
