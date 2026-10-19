import { createHash } from "node:crypto";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { ErrorResponse } from "../util/Responses.js";

export default async function requireAuth(req, res, next) {
  try {
    const [scheme, rawToken] = (req.get("authorization") || "").split(" ");
    if (scheme !== "Bearer" || !rawToken || rawToken.length > 200) return ErrorResponse(res, "Authentication required", 401);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).select("+tokenHash");
    if (!session) return ErrorResponse(res, "Session expired. Sign in again.", 401);
    const user = await User.findById(session.user).select("-googleId -__v");
    if (!user) return ErrorResponse(res, "Account not found", 401);
    req.user = user;
    req.session = session;
    next();
  } catch (error) { next(error); }
}
