import { localDay } from "./pomodoro";

export type DailyStat = {
  day: string;
  waterMl: number;
  pomodoros: number;
  focusSeconds: number;
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
