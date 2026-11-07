import { localDay } from "./pomodoro";

export type DailyStat = {
  day: string;
  waterMl: number;
  pomodoros: number;
  focusSeconds: number;
  sedentaryBreaks: number;
};

export type DailyValue = { day: string; value: number };

/** Ascending list of local calendar days ending today. */
export function recentDays(count: number, now = Date.now()): string[] {
  const days: string[] = [];
  const base = new Date(now);
  base.setHours(12, 0, 0, 0);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(base);
    date.setDate(base.getDate() - offset);
    days.push(localDay(date.getTime()));
  }
  return days;
}

function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date, 12);
  value.setDate(value.getDate() - 1);
  return localDay(value.getTime());
}

/**
 * Consecutive focused days ending today. A not-yet-focused today keeps the
 * streak alive by looking back from yesterday.
 */
export function focusStreak(
  stats: DailyStat[],
  today: string,
  minimumSeconds = 1,
): number {
  if (!stats.length) return 0;
  const focused = new Map(stats.map((stat) => [stat.day, stat.focusSeconds]));
  let cursor = today;
  if ((focused.get(cursor) ?? 0) < minimumSeconds) cursor = previousDay(cursor);
  let count = 0;
  while ((focused.get(cursor) ?? 0) >= minimumSeconds) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return count;
}

export function statForDay(
  stats: DailyStat[],
  day: string,
): DailyStat | undefined {
  return stats.find((stat) => stat.day === day);
}

export function dailyValues(
  stats: DailyStat[],
  days: string[],
  pick: (stat: DailyStat) => number,
): DailyValue[] {
  const byDay = new Map(stats.map((stat) => [stat.day, stat]));
  return days.map((day) => {
    const stat = byDay.get(day);
    return { day, value: stat ? pick(stat) : 0 };
  });
}
