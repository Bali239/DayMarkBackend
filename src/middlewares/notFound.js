import { ErrorResponse } from "../util/Responses.js";

export default function notFound(_req, res) {
  return ErrorResponse(res, "Route not found", 404);
}
