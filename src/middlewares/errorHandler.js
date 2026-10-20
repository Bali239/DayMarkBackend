import { AppError } from "../util/Error.js";
import { ErrorResponse } from "../util/Responses.js";

export default function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error instanceof AppError && error.isOperational) {
    return ErrorResponse(res, error.message, error.statusCode);
  }
  if (error?.name === "ValidationError") {
    return ErrorResponse(res, "Submitted data is invalid", 400);
  }
  if (error?.type === "entity.parse.failed") {
    return ErrorResponse(res, "Invalid JSON body", 400);
  }
  return ErrorResponse(res, "Internal server error", 500);
}
