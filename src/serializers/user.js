export function serializePublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    emailVerified: user.emailVerified,
    reminderAdvanceMinutes: user.reminderAdvanceMinutes,
    pushEnabled: Boolean(user.pushTokens?.length),
  };
}
