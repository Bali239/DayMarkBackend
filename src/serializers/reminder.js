export function serializeReminder(item) {
  const emailSuppressed = Boolean(
    item.emailSuppressed || item.title?.startsWith("[Seed]"),
  );

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    dueAt: item.dueAt,
    category: item.category,
    completed: Boolean(item.completedAt),
    completedAt: item.completedAt,
    emailSentAt: emailSuppressed ? null : item.emailSentAt,
    emailSuppressed,
  };
}
