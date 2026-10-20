import { Router } from "express";
import requireAuth from "../middlewares/requireAuth.js";
import {
  getAuthConfig,
  getCurrentUser,
  registerPushToken,
  signInWithGoogle,
  signOut,
  unregisterPushToken,
} from "../controller/auth.js";

const router = Router();

router.get("/config", getAuthConfig);
router.post("/google", signInWithGoogle);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", requireAuth, signOut);
router.post("/push-token", requireAuth, registerPushToken);
router.delete("/push-token", requireAuth, unregisterPushToken);

export default router;
