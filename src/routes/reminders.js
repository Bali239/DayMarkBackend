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
  dueAt: z
    .string()
    .datetime({ offset: true })
    .refine(
      (value) => new Date(value).getTime() > Date.now(),
      "Reminder date and time must be in the future",
    ),
  category: z.enum(["Personal", "Work", "Health", "Other"]).default("Personal"),
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(8),
  filter: z
    .enum(["Overview", "Upcoming", "All reminders", "Completed", "Overdue"])
    .default("Overview"),
  search: z.string().trim().max(100).default(""),
});
const toClient = (item) => ({
  id: item.id,
  title: item.title,
  description: item.description,
  dueAt: item.dueAt,
  category: item.category,
  completed: Boolean(item.completedAt),
  completedAt: item.completedAt,
  emailSentAt: item.emailSentAt,
});

router.get("/", async (req, res, next) => {
  try {
    const parsedQuery = listQuerySchema.safeParse(req.query);
    if (!parsedQuery.success)
      return ErrorResponse(res, "Invalid reminder pagination or filter", 400);
    const { page, pageSize, filter, search } = parsedQuery.data;
    const now = new Date();
    const baseFilter = { user: req.user._id };
    const filterConditions = {
      Overview: { completedAt: null, dueAt: { $gte: now } },
      Upcoming: { completedAt: null, dueAt: { $gte: now } },
      "All reminders": {},
      Completed: { completedAt: { $ne: null } },
      Overdue: { completedAt: null, dueAt: { $lt: now } },
    };
    const reminderFilter = { ...baseFilter, ...filterConditions[filter] };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      reminderFilter.$or = ["title", "description", "category"].map(
        (field) => ({ [field]: { $regex: escapedSearch, $options: "i" } }),
      );
    }
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const [total, upcoming, completed, overdue, today, user] =
      await Promise.all([
        Reminder.countDocuments(reminderFilter),
        Reminder.countDocuments({
          ...baseFilter,
          completedAt: null,
          dueAt: { $gte: now },
        }),
        Reminder.countDocuments({ ...baseFilter, completedAt: { $ne: null } }),
        Reminder.countDocuments({
          ...baseFilter,
          completedAt: null,
          dueAt: { $lt: now },
        }),
        Reminder.countDocuments({
          ...baseFilter,
          completedAt: null,
          dueAt: { $gte: todayStart, $lt: tomorrowStart },
        }),
        User.findById(req.user._id).select("reminderAdvanceMinutes"),
      ]);
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = Math.min(page, Math.max(1, totalPages));
    const items = await Reminder.find(reminderFilter)
      .sort({ dueAt: 1, _id: 1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize);
    return SuccessResponse(res, {
      reminders: items.map(toClient),
      stats: { upcoming, completed, overdue, today },
      pagination: { page: currentPage, pageSize, total, totalPages },
      reminderAdvanceMinutes: user.reminderAdvanceMinutes,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success)
      return ErrorResponse(
        res,
        "Please provide a title, valid date, and time",
        400,
      );
    const dueAt = new Date(parsed.data.dueAt);
    const item = await Reminder.create({
      user: req.user._id,
      ...parsed.data,
      dueAt,
      completedAt: null,
    });
    return SuccessResponse(res, toClient(item), "Reminder created", 201);
  } catch (error) {
    next(error);
  }
});

router.patch("/preferences/advance", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        minutes: z
          .number()
          .int()
          .refine((value) => [0, 5, 15, 30, 60, 1440].includes(value)),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return ErrorResponse(res, "Unsupported reminder advance time", 400);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { reminderAdvanceMinutes: parsed.data.minutes },
      { new: true },
    );
    return SuccessResponse(
      res,
      { reminderAdvanceMinutes: user.reminderAdvanceMinutes },
      "Notification preference saved",
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id))
      return ErrorResponse(res, "Reminder not found", 404);
    const parsed = reminderSchema.partial().safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data || {}).length === 0)
      return ErrorResponse(res, "No valid reminder changes supplied", 400);
    const changes = { ...parsed.data };
    if (changes.dueAt) {
      changes.dueAt = new Date(changes.dueAt);
      changes.emailSentAt = null;
    }
    const currentItem = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!currentItem) return ErrorResponse(res, "Reminder not found", 404);
    if (
      changes.dueAt &&
      changes.dueAt.getTime() !== currentItem.dueAt.getTime()
    ) {
      // Rescheduling a completed reminder makes it active again.
      changes.completedAt = null;
    }
    Object.assign(currentItem, changes);
    const item = await currentItem.save();
    return SuccessResponse(res, toClient(item), "Reminder updated");
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/complete", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id))
      return ErrorResponse(res, "Reminder not found", 404);
    const item = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!item) return ErrorResponse(res, "Reminder not found", 404);
    item.completedAt = item.completedAt ? null : new Date();
    await item.save();
    return SuccessResponse(
      res,
      toClient(item),
      item.completedAt ? "Reminder completed" : "Reminder reopened",
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id))
      return ErrorResponse(res, "Reminder not found", 404);
    const item = await Reminder.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!item) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(res, { id: item.id }, "Reminder deleted");
  } catch (error) {
    next(error);
  }
});

export default router;
