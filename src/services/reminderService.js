import Reminder from "../models/Reminder.js";
import User from "../models/User.js";
import { serializeReminder } from "../serializers/reminder.js";

const filterConditions = {
  Overview: (now) => ({ completedAt: null, dueAt: { $gte: now } }),
  Upcoming: (now) => ({ completedAt: null, dueAt: { $gte: now } }),
  "All reminders": () => ({}),
  Completed: () => ({ completedAt: { $ne: null } }),
  Overdue: (now) => ({ completedAt: null, dueAt: { $lt: now } }),
};

function makeSearchFilter(search) {
  if (!search) return {};
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: ["title", "description", "category"].map((field) => ({
      [field]: { $regex: escapedSearch, $options: "i" },
    })),
  };
}

export async function listReminders(
  userId,
  { page, pageSize, filter, search },
) {
  const now = new Date();
  const baseFilter = { user: userId };
  const reminderFilter = {
    ...baseFilter,
    ...filterConditions[filter](now),
    ...makeSearchFilter(search),
  };
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [total, upcoming, completed, overdue, today, user] = await Promise.all([
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
    User.findById(userId).select("reminderAdvanceMinutes"),
  ]);

  const totalPages = Math.ceil(total / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const items = await Reminder.find(reminderFilter)
    .sort({ dueAt: 1, _id: 1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize);

  return {
    reminders: items.map(serializeReminder),
    stats: { upcoming, completed, overdue, today },
    pagination: { page: currentPage, pageSize, total, totalPages },
    reminderAdvanceMinutes: user.reminderAdvanceMinutes,
  };
}

export async function createReminder(userId, data) {
  const item = await Reminder.create({
    user: userId,
    ...data,
    dueAt: new Date(data.dueAt),
    completedAt: null,
  });
  return serializeReminder(item);
}

export async function updateReminder(userId, reminderId, data) {
  const changes = { ...data };
  if (changes.dueAt) {
    changes.dueAt = new Date(changes.dueAt);
    changes.emailSentAt = null;
  }

  const item = await Reminder.findOne({ _id: reminderId, user: userId });
  if (!item) return null;
  if (changes.dueAt && changes.dueAt.getTime() !== item.dueAt.getTime()) {
    changes.completedAt = null;
  }

  Object.assign(item, changes);
  return serializeReminder(await item.save());
}

export async function toggleReminderCompletion(userId, reminderId) {
  const item = await Reminder.findOne({ _id: reminderId, user: userId });
  if (!item) return null;
  item.completedAt = item.completedAt ? null : new Date();
  await item.save();
  return serializeReminder(item);
}

export async function deleteReminder(userId, reminderId) {
  const item = await Reminder.findOneAndDelete({
    _id: reminderId,
    user: userId,
  });
  return item ? { id: item.id } : null;
}

export async function updateNotificationAdvance(userId, minutes) {
  const user = await User.findByIdAndUpdate(
    userId,
    { reminderAdvanceMinutes: minutes },
    { new: true },
  );
  return user ? { reminderAdvanceMinutes: user.reminderAdvanceMinutes } : null;
}
