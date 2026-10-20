import { Router } from "express";
import requireAuth from "../middlewares/requireAuth.js";
import {
  getAuthConfig,
  getCurrentUser,
  signInWithGoogle,
  signOut,
} from "../controller/auth.js";

const router = Router();

router.get("/config", getAuthConfig);
router.post("/google", signInWithGoogle);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", requireAuth, signOut);

export default router;
