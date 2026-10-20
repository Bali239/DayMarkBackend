import { SuccessResponse } from "../util/Responses.js";

export function healthCheck(_req, res) {
  return SuccessResponse(res, { status: "ok" });
}
