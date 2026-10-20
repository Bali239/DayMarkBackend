import { createHash, randomBytes } from "node:crypto";
import googleClient from "../config/googleOauthClient.js";
import { GOOGLE_CLIENT_ID, SESSION_DAYS } from "../config/env.js";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { serializePublicUser } from "../serializers/user.js";
import { AppError } from "../util/Error.js";

export async function createGoogleSession(credential) {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new AppError("Google credential is invalid or expired", 401);
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new AppError("Google account email must be verified", 401);
  }

  let user;
  try {
    user = await User.findOneAndUpdate(
      { googleId: payload.sub },
      {
        $set: {
          email: payload.email,
          name: payload.name || payload.email,
          picture: payload.picture || "",
          emailVerified: true,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    if (error.name === "MongoServerError" && error.code === 11000) {
      throw new AppError(
        "Google account already exists; please sign in again",
        409,
      );
    }
    throw error;
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await Session.create({ user: user._id, tokenHash, expiresAt });

  return { token: rawToken, expiresAt, user: serializePublicUser(user) };
}

export async function revokeSession(sessionId) {
  await Session.deleteOne({ _id: sessionId });
}
