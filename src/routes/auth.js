import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import googleClient from "../config/googleOauthClient.js";
import { GOOGLE_CLIENT_ID, SESSION_DAYS } from "../config/env.js";
import requireAuth from "../middlewares/requireAuth.js";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { ErrorResponse, SuccessResponse } from "../util/Responses.js";

const router = Router();
const credentialSchema = z.object({ credential: z.string().min(20).max(5000) });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, picture: user.picture, emailVerified: user.emailVerified, reminderAdvanceMinutes: user.reminderAdvanceMinutes });

router.get("/config", (_req, res) => SuccessResponse(res, { googleClientId: GOOGLE_CLIENT_ID }));

router.post("/google", async (req, res, next) => {
  try {
    const parsed = credentialSchema.safeParse(req.body);
    if (!parsed.success) return ErrorResponse(res, "A valid Google credential is required", 400);
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({ idToken: parsed.data.credential, audience: GOOGLE_CLIENT_ID });
    } catch {
      return ErrorResponse(res, "Google credential is invalid or expired", 401);
    }
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) return ErrorResponse(res, "Google account email must be verified", 401);
    const user = await User.findOneAndUpdate(
      { googleId: payload.sub },
      { $set: { email: payload.email, name: payload.name || payload.email, picture: payload.picture || "", emailVerified: true } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await Session.create({ user: user._id, tokenHash, expiresAt });
    return SuccessResponse(res, { token: rawToken, expiresAt, user: publicUser(user) }, "Signed in with Google", 201);
  } catch (error) {
    if (error.name === "MongoServerError" && error.code === 11000) return ErrorResponse(res, "Google account already exists; please sign in again", 409);
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => SuccessResponse(res, { user: publicUser(req.user), expiresAt: req.session.expiresAt }));
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await Session.deleteOne({ _id: req.session._id });
    return SuccessResponse(res, null, "Signed out");
  } catch (error) { next(error); }
});

export default router;
