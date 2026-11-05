export type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
};

export type PomodoroProgress = {
  day: string;
  completedToday: number;
  cycle: number;
};

export const pomodoroVersion = 1;

export const defaultPomodoroSettings: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};

const limits = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  longBreakEvery: [2, 12],
} as const;

function inRange(
  value: unknown,
  [min, max]: readonly [number, number],
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parsePomodoroSettings(value: unknown): PomodoroSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== pomodoroVersion) return null;
  if (
    !inRange(record.focusMinutes, limits.focusMinutes) ||
    !inRange(record.shortBreakMinutes, limits.shortBreakMinutes) ||
    !inRange(record.longBreakMinutes, limits.longBreakMinutes) ||
    !inRange(record.longBreakEvery, limits.longBreakEvery)
  ) {
    return null;
  }
  return {
    focusMinutes: record.focusMinutes,
    shortBreakMinutes: record.shortBreakMinutes,
    longBreakMinutes: record.longBreakMinutes,
    longBreakEvery: record.longBreakEvery,
  };
}

export function parsePomodoroProgress(value: unknown): PomodoroProgress | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== pomodoroVersion) return null;
  if (typeof record.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.day))
    return null;
  if (!inRange(record.completedToday, [0, 999])) return null;
  if (!inRange(record.cycle, [0, 99])) return null;
  return {
    day: record.day,
    completedToday: record.completedToday,
    cycle: record.cycle,
  };
}

/** Local calendar day, so the daily count resets at local midnight. */
export function localDay(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function emptyProgress(now: number): PomodoroProgress {
  return { day: localDay(now), completedToday: 0, cycle: 0 };
}

export function normalizeProgress(
  progress: PomodoroProgress | null,
  now: number,
): PomodoroProgress {
  if (!progress || progress.day !== localDay(now)) return emptyProgress(now);
  return progress;
}

/** A naturally finished focus session counts as one pomodoro. */
export function completeFocus(
  progress: PomodoroProgress,
  now: number,
): PomodoroProgress {
  const base = normalizeProgress(progress, now);
  return {
    ...base,
    completedToday: base.completedToday + 1,
    cycle: base.cycle + 1,
  };
}

/** A new focus session opens a new cycle once the previous one is full. */
export function startFocusCycle(
  progress: PomodoroProgress,
  settings: PomodoroSettings,
  now: number,
): PomodoroProgress {
  const base = normalizeProgress(progress, now);
  return base.cycle >= settings.longBreakEvery ? { ...base, cycle: 0 } : base;
}

export function isLongBreakDue(
  cycle: number,
  settings: PomodoroSettings,
): boolean {
  return cycle > 0 && cycle % settings.longBreakEvery === 0;
}
