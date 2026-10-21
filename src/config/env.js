import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL("../../.env.local", import.meta.url) });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  GOOGLE_CLIENT_ID: z.string().trim().min(1, "GOOGLE_CLIENT_ID is required"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().trim().optional(),
  PROJECT_ID: z.string().trim().optional(),
  CLIENT_EMAIL: z.string().trim().optional(),
  PRIVATE_KEY: z.string().optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const details = result.error.issues
    .map(({ path, message }) => `  - ${path.join(".")}: ${message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${details}`);
}

export const {
  PORT,
  DATABASE_URL,
  GOOGLE_CLIENT_ID,
  CLIENT_ORIGIN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  SESSION_DAYS,
  PROJECT_ID,
  CLIENT_EMAIL,
  PRIVATE_KEY,
} = result.data;
export const mailConfigured = Boolean(
  SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM,
);
export const pushConfigured = Boolean(PROJECT_ID || CLIENT_EMAIL || PRIVATE_KEY);
