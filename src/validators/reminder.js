import { z } from "zod";

const futureDateTime = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) => new Date(value).getTime() > Date.now(),
    "Reminder date and time must be in the future",
  );

export const reminderSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional().default(""),
  dueAt: futureDateTime,
  category: z.enum(["Personal", "Work", "Health", "Other"]).default("Personal"),
});

export const reminderUpdateSchema = reminderSchema.partial();

export const reminderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(8),
  filter: z
    .enum(["Overview", "Upcoming", "All reminders", "Completed", "Overdue"])
    .default("Overview"),
  search: z.string().trim().max(100).default(""),
});

export const reminderIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const notificationAdvanceSchema = z.object({
  minutes: z
    .number()
    .int()
    .refine((value) => [0, 5, 15, 30, 60, 1440].includes(value)),
});
