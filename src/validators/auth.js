import { z } from "zod";

export const googleCredentialSchema = z.object({
  credential: z.string().min(20).max(5000),
});
