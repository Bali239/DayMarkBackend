import { z } from "zod";

export const googleCredentialSchema = z.object({
  credential: z.string().min(20).max(5000),
});

export const pushTokenSchema = z.object({
  token: z.string().trim().min(20).max(4096),
});
