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

/** Completed fraction of the current timer; unknown duration has no gauge. */
export function timerProgress(
  timer: TimerState,
  durationMs: number,
  now: number,
): number | null {
  if (
    timer.status === "idle" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  )
    return null;
  if (timer.status === "finished") return 1;
  return Math.max(
    0,
    Math.min(1, 1 - remainingMilliseconds(timer, now) / durationMs),
  );
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

/** Extend an active timer without changing whether it is paused. */
export function extendTimer(
  timer: TimerState,
  milliseconds: number,
): TimerState {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return timer;
  if (timer.status === "running")
    return { ...timer, endsAt: timer.endsAt + milliseconds };
  if (timer.status === "paused")
    return { ...timer, remainingMs: timer.remainingMs + milliseconds };
  return timer;
}

export function formatRemaining(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export type TimerKind = "pomodoro" | "timer" | "countdown";
export type TimerMode = "focus" | "break" | "longBreak" | "timer" | "countdown";

/** Snapshot kept in SQLite so a running timer survives a restart. */
export type PersistedTimer = {
  version: 1;
  kind: TimerKind;
  mode: TimerMode;
  durationMs: number;
  label: string | null;
  countdownId: string | null;
  state: TimerState;
};

const MAX_TIMER_MS = (999 * 60 + 59) * 1000;

export function parsePersistedTimer(value: unknown): PersistedTimer | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const kind = record.kind;
  const mode = record.mode;
  if (kind !== "pomodoro" && kind !== "timer" && kind !== "countdown") {
    return null;
  }
  if (
    kind === "pomodoro" &&
    !["focus", "break", "longBreak"].includes(String(mode))
  ) {
    return null;
  }
  if (kind === "timer" && mode !== "timer") return null;
  if (kind === "countdown" && mode !== "countdown") return null;
  const durationMs = record.durationMs;
  if (
    typeof durationMs !== "number" ||
    !Number.isInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > MAX_TIMER_MS
  ) {
    return null;
  }
  const label = record.label;
  if (label !== null && (typeof label !== "string" || label.length > 24)) {
    return null;
  }
  const countdownId = record.countdownId;
  if (
    countdownId !== null &&
    (typeof countdownId !== "string" ||
      countdownId.length === 0 ||
      countdownId.length > 64)
  ) {
    return null;
  }
  if (kind === "countdown" && countdownId === null) return null;
  const rawState = record.state;
  if (typeof rawState !== "object" || rawState === null) return null;
  const state = rawState as Record<string, unknown>;
  let timer: TimerState;
  if (state.status === "idle") {
    timer = { status: "idle" };
  } else if (state.status === "finished") {
    timer = { status: "finished" };
  } else if (
    state.status === "running" &&
    typeof state.endsAt === "number" &&
    Number.isFinite(state.endsAt)
  ) {
    timer = { status: "running", endsAt: state.endsAt };
  } else if (
    state.status === "paused" &&
    typeof state.remainingMs === "number" &&
    Number.isFinite(state.remainingMs) &&
    state.remainingMs > 0
  ) {
    timer = { status: "paused", remainingMs: state.remainingMs };
  } else {
    return null;
  }
  return {
    version: 1,
    kind,
    mode: mode as TimerMode,
    durationMs,
    label,
    countdownId,
    state: timer,
  };
}

/** Restores a running timer; a timer that ended while closed becomes finished. */
export function restorePersistedTimer(
  persisted: PersistedTimer,
  now: number,
): { state: TimerState; expired: boolean } {
  if (persisted.state.status === "running" && persisted.state.endsAt <= now) {
    return { state: { status: "finished" }, expired: true };
  }
  return { state: persisted.state, expired: false };
}
