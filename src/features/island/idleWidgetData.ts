import type { QuotaItem } from "../../domain/aiQuota";
import {
  MAX_IDLE_WIDGETS,
  type AppearanceSettings,
  type IdleWidgetId,
} from "../../domain/settings";

export type IdleWaterTimer =
  | { minutes: number }
  | { soon: true }
  | { at: string; tomorrow: boolean }
  | { done: true };

export type IdleData = {
  quota?: { provider: string; items: QuotaItem[] } | null;
  water?: { percent: number } | null;
  pomodoros?: number | null;
  music?: { title: string; artist: string; artwork?: string | null } | null;
  battery?: { percent: number; charging: boolean } | null;
  focusMinutes?: number | null;
  streak?: number | null;
  volume?: { percent: number; muted: boolean } | null;
  bluetooth?: { name: string; battery: number } | null;
  waterTimer?: IdleWaterTimer | null;
  countdown?: { label: string; remainingMs: number; reached: boolean } | null;
  pomodoroCycle?: { done: number; total: number } | null;
  sedentary?: { minutes: number; over: boolean; reached: boolean } | null;
};

/**
 * How a widget earns its slot on the collapsed island:
 * - persistent: shows whenever its data exists (clock, ambient progress and
 *   live counters such as the water timer and sitting minutes);
 * - active: shows while its data is inherently transient (playing music is
 *   the only one — it vanishes when playback stops);
 * - change: shows briefly after its value moved, then gives the slot back.
 */
export type IdleWidgetMode = "persistent" | "active" | "change";

export const IDLE_WIDGET_MODES: Record<IdleWidgetId, IdleWidgetMode> = {
  clock: "persistent",
  mascot: "persistent",
  quota: "persistent",
  water: "persistent",
  pomodoro: "persistent",
  sedentary: "persistent",
  countdown: "persistent",
  waterTimer: "persistent",
  music: "active",
  battery: "change",
  volume: "change",
  bluetooth: "change",
  focus: "change",
  streak: "change",
};

/** When each change-tier widget last said something new; null = not yet. */
export type IdleChangeShownAt = Partial<Record<IdleWidgetId, number | null>>;

export type IdleAvailabilityContext = {
  now: number;
  changeWindowMs: number;
  changeShownAt?: IdleChangeShownAt;
};

function hasIdleWidgetData(
  id: IdleWidgetId,
  appearance: AppearanceSettings,
  data: IdleData,
): boolean {
  if (id === "clock" || id === "mascot") return true;
  if (id === "music") return data.music != null;
  if (id === "quota") return !!data.quota;
  if (id === "water") return !!data.water;
  if (id === "battery") return !!data.battery;
  if (id === "focus") return data.focusMinutes != null;
  if (id === "streak") return (data.streak ?? 0) > 0;
  if (id === "volume") return !!data.volume;
  if (id === "bluetooth") return !!data.bluetooth;
  if (id === "waterTimer") return !!data.waterTimer;
  if (id === "countdown") return !!data.countdown;
  if (id === "sedentary") return !!data.sedentary;
  if (appearance.pomodoroView === "focus") {
    return data.focusMinutes != null;
  }
  if (appearance.pomodoroView === "cycle") {
    return data.pomodoroCycle != null;
  }
  return data.pomodoros != null;
}

export function availableIdleWidgets(
  appearance: AppearanceSettings,
  data: IdleData,
  context?: IdleAvailabilityContext,
): IdleWidgetId[] {
  const withData = appearance.idleWidgets.filter((id) =>
    hasIdleWidgetData(id, appearance, data),
  );
  // Without a tracking context (settings preview) change-tier widgets keep
  // the legacy behaviour and show whenever data exists.
  if (!context) return withData.slice(0, MAX_IDLE_WIDGETS);
  const isFresh = (id: IdleWidgetId) => {
    const shownAt = context.changeShownAt?.[id];
    if (shownAt == null) return false;
    const age = context.now - shownAt;
    return age >= 0 && age < context.changeWindowMs;
  };
  // A change widget that is speaking always gets a slot at the tail of the
  // capsule — after the ambient widgets, whatever place it holds in the
  // saved order — displacing the lowest-priority ambient widget. Silent
  // change widgets never fill a slot, even when one is free.
  const speaking = withData.filter(
    (id) => IDLE_WIDGET_MODES[id] === "change" && isFresh(id),
  );
  const ambientBudget = Math.max(MAX_IDLE_WIDGETS - speaking.length, 1);
  const ambient = withData
    .filter((id) => IDLE_WIDGET_MODES[id] !== "change")
    .slice(0, ambientBudget);
  return [...ambient, ...speaking];
}

/**
 * The settings preview shows every enabled ambient widget — uncapped, so
 * they can all be dragged into order — and never the change widgets, which
 * only ever appear on the real island by displacing the last ambient slot.
 */
export function previewIdleWidgets(
  appearance: AppearanceSettings,
): IdleWidgetId[] {
  return appearance.idleWidgets.filter(
    (id) => IDLE_WIDGET_MODES[id] !== "change",
  );
}
