import { describe, expect, it } from "vitest";
import { nextReminderAt, REMINDER_SNOOZE_MS } from "./reminderSnooze";

describe("nextReminderAt", () => {
  it("uses the normal interval until snoozed", () => {
    expect(nextReminderAt(1_000, 30, null)).toBe(1_801_000);
  });

  it("uses the explicit snooze deadline even when the regular interval differs", () => {
    const deadline = 5_000 + REMINDER_SNOOZE_MS;
    expect(nextReminderAt(1_000, 60, deadline)).toBe(deadline);
    expect(nextReminderAt(1_000, 1, deadline)).toBe(deadline);
  });
});
