export type TimerState =
  | { status: "idle" }
  | { status: "running"; endsAt: number }
  | { status: "paused"; remainingMs: number }
  | { status: "finished" };

/** Accept whole minutes and seconds, from one second up to 999:59. */
export function parseDuration(minutes: string, seconds: string): number | null {
  if (!/^\d{0,3}$/.test(minutes) || !/^\d{0,2}$/.test(seconds)) return null;
  const mins = Number(minutes || "0");
  const secs = Number(seconds || "0");
  if (secs > 59 || (mins === 0 && secs === 0)) return null;
  return (mins * 60 + secs) * 1000;
}

export function remainingMilliseconds(timer: TimerState, now: number): number {
  if (timer.status === "running") return Math.max(0, timer.endsAt - now);
  if (timer.status === "paused") return timer.remainingMs;
  return 0;
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.status !== "running") return timer;
  const remainingMs = remainingMilliseconds(timer, now);
  return remainingMs === 0
    ? { status: "finished" }
    : { status: "paused", remainingMs };
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
  return timer.status === "paused"
    ? { status: "running", endsAt: now + timer.remainingMs }
    : timer;
}

export function formatRemaining(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
