export function serializeReminder(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    dueAt: item.dueAt,
    category: item.category,
    completed: Boolean(item.completedAt),
    completedAt: item.completedAt,
    emailSentAt: item.emailSentAt,
  };
}
