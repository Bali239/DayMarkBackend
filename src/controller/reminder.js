import {
  createReminder as createReminderRecord,
  deleteReminder as deleteReminderRecord,
  listReminders,
  toggleReminderCompletion,
  updateNotificationAdvance,
  updateReminder as updateReminderRecord,
} from "../services/reminderService.js";
import {
  notificationAdvanceSchema,
  reminderIdSchema,
  reminderListQuerySchema,
  reminderSchema,
  reminderUpdateSchema,
} from "../validators/reminder.js";
import { ErrorResponse, SuccessResponse } from "../util/Responses.js";

export async function getReminders(req, res, next) {
  try {
    const parsed = reminderListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return ErrorResponse(res, "Invalid reminder pagination or filter", 400);
    }
    const data = await listReminders(req.user._id, parsed.data);
    return SuccessResponse(res, data);
  } catch (error) {
    return next(error);
  }
}

export async function createReminder(req, res, next) {
  try {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return ErrorResponse(
        res,
        "Please provide a title, valid date, and time",
        400,
      );
    }
    const reminder = await createReminderRecord(req.user._id, parsed.data);
    return SuccessResponse(res, reminder, "Reminder created", 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateReminder(req, res, next) {
  try {
    if (!reminderIdSchema.safeParse(req.params.id).success) {
      return ErrorResponse(res, "Reminder not found", 404);
    }
    const parsed = reminderUpdateSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
      return ErrorResponse(res, "No valid reminder changes supplied", 400);
    }
    const reminder = await updateReminderRecord(
      req.user._id,
      req.params.id,
      parsed.data,
    );
    if (!reminder) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(res, reminder, "Reminder updated");
  } catch (error) {
    return next(error);
  }
}

export async function toggleReminder(req, res, next) {
  try {
    if (!reminderIdSchema.safeParse(req.params.id).success) {
      return ErrorResponse(res, "Reminder not found", 404);
    }
    const reminder = await toggleReminderCompletion(
      req.user._id,
      req.params.id,
    );
    if (!reminder) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(
      res,
      reminder,
      reminder.completed ? "Reminder completed" : "Reminder reopened",
    );
  } catch (error) {
    return next(error);
  }
}

export async function removeReminder(req, res, next) {
  try {
    if (!reminderIdSchema.safeParse(req.params.id).success) {
      return ErrorResponse(res, "Reminder not found", 404);
    }
    const reminder = await deleteReminderRecord(req.user._id, req.params.id);
    if (!reminder) return ErrorResponse(res, "Reminder not found", 404);
    return SuccessResponse(res, reminder, "Reminder deleted");
  } catch (error) {
    return next(error);
  }
}

export async function updateReminderAdvance(req, res, next) {
  try {
    const parsed = notificationAdvanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return ErrorResponse(res, "Unsupported reminder advance time", 400);
    }
    const preference = await updateNotificationAdvance(
      req.user._id,
      parsed.data.minutes,
    );
    if (!preference) return ErrorResponse(res, "Account not found", 404);
    return SuccessResponse(res, preference, "Notification preference saved");
  } catch (error) {
    return next(error);
  }
}
