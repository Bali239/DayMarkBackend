import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import reminderRoutes from "./routes/reminders.js";
import { CLIENT_ORIGIN } from "./config/env.js";
import errorHandler from "./middlewares/errorHandler.js";
import notFound from "./middlewares/notFound.js";
import { healthCheck } from "./controller/system.js";

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", healthCheck);
app.use("/api/auth", authRoutes);
app.use("/api/reminders", reminderRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
