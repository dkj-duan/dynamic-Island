import { localDay } from "./pomodoro";

export type SedentarySettings = {
  goalBreaks: number;
  reminderMinutes: number;
  /** Whole hours; the reminder runs from activeStart up to activeEnd. */
  activeStart: number;
  activeEnd: number;
  enabled: boolean;
};

export const sedentaryVersion = 1;

export const defaultSedentarySettings: SedentarySettings = {
  goalBreaks: 10,
  reminderMinutes: 45,
  activeStart: 9,
  activeEnd: 21,
  enabled: true,
};

function integerInRange(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parseSedentarySettings(
  value: unknown,
): SedentarySettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== sedentaryVersion) return null;
  if (
    !integerInRange(record.goalBreaks, 1, 50) ||
    !integerInRange(record.reminderMinutes, 5, 240) ||
    !integerInRange(record.activeStart, 0, 23) ||
    !integerInRange(record.activeEnd, 1, 24) ||
    (record.activeStart as number) >= (record.activeEnd as number) ||
    typeof record.enabled !== "boolean"
  ) {
    return null;
  }
  return {
    goalBreaks: record.goalBreaks as number,
    reminderMinutes: record.reminderMinutes as number,
    activeStart: record.activeStart as number,
    activeEnd: record.activeEnd as number,
    enabled: record.enabled,
  };
}

/** The island persists when the user last stood up; a new day starts fresh. */
export type SedentaryProgress = {
  day: string;
  lastBreakAt: number;
};

export const sedentaryProgressVersion = 1;

export function emptySedentaryProgress(now: number): SedentaryProgress {
  return { day: localDay(now), lastBreakAt: now };
}

export function normalizeSedentaryProgress(
  progress: SedentaryProgress | null,
  now: number,
): SedentaryProgress {
  if (!progress || progress.day !== localDay(now)) {
    return emptySedentaryProgress(now);
  }
  return progress;
}

export function parseSedentaryProgress(
  value: unknown,
): SedentaryProgress | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== sedentaryProgressVersion) return null;
  if (typeof record.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.day))
    return null;
  if (
    typeof record.lastBreakAt !== "number" ||
    !Number.isInteger(record.lastBreakAt) ||
    record.lastBreakAt < 0
  ) {
    return null;
  }
  return { day: record.day, lastBreakAt: record.lastBreakAt };
}

/** Minutes the user has been sitting since the last recorded break. */
export function sittingMinutes(lastBreakAt: number, now: number): number {
  if (lastBreakAt > now) return 0;
  return Math.floor((now - lastBreakAt) / 60_000);
}

/** Colour state: green when fresh, amber approaching the reminder, red over. */
export type SedentaryTone = "fresh" | "near" | "over";

export const sedentaryToneColors: Record<SedentaryTone, string> = {
  fresh: "#6fd39a",
  near: "#f0b26b",
  over: "#ef7d68",
};

export function sedentaryTone(
  lastBreakAt: number,
  now: number,
  reminderMinutes: number,
): SedentaryTone {
  const minutes = sittingMinutes(lastBreakAt, now);
  if (minutes >= reminderMinutes) return "over";
  if (reminderMinutes > 0 && minutes >= reminderMinutes * 0.7) return "near";
  return "fresh";
}
