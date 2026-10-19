import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import reminderRoutes from "./routes/reminders.js";
import { CLIENT_ORIGIN } from "./config/env.js";
import { ErrorResponse } from "./util/Responses.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: CLIENT_ORIGIN, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/reminders", reminderRoutes);
app.use((_req, res) => ErrorResponse(res, "Route not found", 404));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.name === "ValidationError") return ErrorResponse(res, "Submitted data is invalid", 400);
  if (error?.type === "entity.parse.failed") return ErrorResponse(res, "Invalid JSON body", 400);
  return ErrorResponse(res, "Internal server error", 500);
});

export default app;
