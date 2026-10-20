import { GOOGLE_CLIENT_ID } from "../config/env.js";
import { createGoogleSession, revokeSession } from "../services/authService.js";
import { serializePublicUser } from "../serializers/user.js";
import { googleCredentialSchema } from "../validators/auth.js";
import { ErrorResponse, SuccessResponse } from "../util/Responses.js";

export function getAuthConfig(_req, res) {
  return SuccessResponse(res, { googleClientId: GOOGLE_CLIENT_ID });
}

export async function signInWithGoogle(req, res, next) {
  try {
    const parsed = googleCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      return ErrorResponse(res, "A valid Google credential is required", 400);
    }
    const session = await createGoogleSession(parsed.data.credential);
    return SuccessResponse(res, session, "Signed in with Google", 201);
  } catch (error) {
    return next(error);
  }
}

export function getCurrentUser(req, res) {
  return SuccessResponse(res, {
    user: serializePublicUser(req.user),
    expiresAt: req.session.expiresAt,
  });
}

export async function signOut(req, res, next) {
  try {
    await revokeSession(req.session._id);
    return SuccessResponse(res, null, "Signed out");
  } catch (error) {
    return next(error);
  }
}
