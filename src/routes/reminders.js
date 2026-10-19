import { Router } from "express";
import { z } from "zod";
import requireAuth from "../middlewares/requireAuth.js";
import Reminder from "../models/Reminder.js";
import User from "../models/User.js";
import { ErrorResponse, SuccessResponse } from "../util/Responses.js";

const router = Router();
router.use(requireAuth);
const reminderSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional().default(""),
  dueAt: z.string().datetime({ offset: true }),
  category: z.enum(["Personal", "Work", "Health", "Other"]).default("Personal"),
});
const toClient = (item) => ({ id: item.id, title: item.title, description: item.description, dueAt: item.dueAt, category: item.category, completed: Boolean(item.completedAt), completedAt: item.completedAt, emailSentAt: item.emailSentAt });

router.get("/", async (req, res, next) => {
  try {
    const [items, user] = await Promise.all([
      Reminder.find({ user: req.user._id }).sort({ dueAt: 1 }),
      User.findById(req.user._id).select("reminderAdvanceMinutes"),
    ]);
    const reminders = items.map(toClient);
    const now = new Date();
    const stats = {
      upcoming: items.filter((item) => !item.completedAt && item.dueAt >= now).length,
      completed: items.filter((item) => item.completedAt).length,
      overdue: items.filter((item) => !item.completedAt && item.dueAt < now).length,
      today: items.filter((item) => !item.completedAt && item.dueAt.toDateString() === now.toDateString()).length,
    };
    return SuccessResponse(res, { reminders, stats, reminderAdvanceMinutes: user.reminderAdvanceMinutes });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) return ErrorResponse(res, "Please provide a title, valid date, and time", 400);
    const dueAt = new Date(parsed.data.dueAt);
    const item = await Reminder.create({ user: req.user._id, ...parsed.data, dueAt });
    return SuccessResponse(res, toClient(item), "Reminder created", 201);
  } catch (error) { next(error); }
});

router.patch("/preferences/advance", async (req, res, next) => {
  try {
    const parsed = z.object({ minutes: z.number().int().refine((value) => [0, 5, 15, 30, 60, 1440].includes(value)) }).safeParse(req.body);
    if (!parsed.success) return ErrorResponse(res, "Unsupported reminder advance time", 400);
    const user = await User.findByIdAndUpdate(req.user._id, { reminderAdvanceMinutes: parsed.data.minutes }, { new: true });
    return SuccessResponse(res, { reminderAdvanceMinutes: user.reminderAdvanceMinutes }, "Notification preference saved");
  } catch (error) { next(error); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return ErrorResponse(res, "Reminder not found", 404);
    const parsed = reminderSchema.partial().safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) return ErrorResponse(res, "No valid reminder changes supplied", 400);
    const changes = { ...parsed.data };
    if (changes.dueAt) {
      changes.dueAt = new Date(changes.dueAt);
      changes.emailSentAt = null;
    }
    const item = await Reminder.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: changes }, { new: true, runValidators: true });
    if (!item) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(res, toClient(item), "Reminder updated");
  } catch (error) { next(error); }
});

router.patch("/:id/complete", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return ErrorResponse(res, "Reminder not found", 404);
    const item = await Reminder.findOne({ _id: req.params.id, user: req.user._id });
    if (!item) return ErrorResponse(res, "Reminder not found", 404);
    item.completedAt = item.completedAt ? null : new Date();
    await item.save();
    return SuccessResponse(res, toClient(item), item.completedAt ? "Reminder completed" : "Reminder reopened");
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return ErrorResponse(res, "Reminder not found", 404);
    const item = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!item) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(res, { id: item.id }, "Reminder deleted");
  } catch (error) { next(error); }
});

export default router;
