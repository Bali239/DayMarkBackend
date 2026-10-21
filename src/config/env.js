import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL("../../.env.local", import.meta.url) });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  GOOGLE_CLIENT_ID: z.string().trim().min(1, "GOOGLE_CLIENT_ID is required"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  GMAIL_API_KEY: z.string().trim().optional(),
  GMAIL_OAUTH_CLIENT_ID: z.string().trim().optional(),
  GMAIL_OAUTH_CLIENT_SECRET: z.string().trim().optional(),
  GMAIL_REFRESH_TOKEN: z.string().trim().optional(),
  GMAIL_SENDER_EMAIL: z
    .union([z.string().trim().email(), z.literal("")])
    .optional(),
  PROJECT_ID: z.string().trim().optional(),
  CLIENT_EMAIL: z.string().trim().optional(),
  PRIVATE_KEY: z.string().optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
}).superRefine((env, context) => {
  const gmailFields = [
    "GMAIL_OAUTH_CLIENT_ID",
    "GMAIL_OAUTH_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "GMAIL_SENDER_EMAIL",
  ];
  const configuredCount = gmailFields.filter((field) => Boolean(env[field])).length;
  if (configuredCount > 0 && configuredCount < gmailFields.length) {
    context.addIssue({
      code: "custom",
      path: ["GMAIL_OAUTH_CLIENT_ID"],
      message: `Gmail API configuration is incomplete. Set all of: ${gmailFields.join(", ")}.`,
    });
  }
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
  GMAIL_API_KEY,
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
  SESSION_DAYS,
  PROJECT_ID,
  CLIENT_EMAIL,
  PRIVATE_KEY,
} = result.data;
export const mailConfigured = Boolean(
  GMAIL_OAUTH_CLIENT_ID &&
    GMAIL_OAUTH_CLIENT_SECRET &&
    GMAIL_REFRESH_TOKEN &&
    GMAIL_SENDER_EMAIL,
);
export const gmailApiKeyConfigured = Boolean(GMAIL_API_KEY);
export const pushConfigured = Boolean(PROJECT_ID || CLIENT_EMAIL || PRIVATE_KEY);
