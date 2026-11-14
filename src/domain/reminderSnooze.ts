/** A snoozed reminder replaces the normal interval until it is handled. */
export const REMINDER_SNOOZE_MS = 10 * 60_000;

export function nextReminderAt(
  lastReminderAt: number,
  intervalMinutes: number,
  snoozedUntil: number | null,
): number {
  return snoozedUntil ?? lastReminderAt + intervalMinutes * 60_000;
}
