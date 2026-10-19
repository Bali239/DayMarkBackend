import dotenv from "dotenv";
import { z } from "zod";

// Load the server's local environment file regardless of the process cwd.
dotenv.config({ path: new URL("../../.env.local", import.meta.url) });

const envSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
    GOOGLE_CLIENT_ID: z.string().trim().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z.string().trim().min(1, "GOOGLE_REDIRECT_URI is required"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map(({ path, message }) => `  - ${path.join(".")}: ${message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${details}`);
}

export const { PORT, DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = result.data;
