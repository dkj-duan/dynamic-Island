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
};

export function availableIdleWidgets(
  appearance: AppearanceSettings,
  data: IdleData,
): IdleWidgetId[] {
  return appearance.idleWidgets
    .filter((id) => {
      if (id === "clock" || id === "mascot") return true;
      if (id === "music") return data.music !== null;
      if (id === "quota") return !!data.quota;
      if (id === "water") return !!data.water;
      if (id === "battery") return !!data.battery;
      if (id === "focus") return data.focusMinutes != null;
      if (id === "streak") return (data.streak ?? 0) > 0;
      if (id === "volume") return !!data.volume;
      if (id === "bluetooth") return !!data.bluetooth;
      if (id === "waterTimer") return !!data.waterTimer;
      if (id === "countdown") return !!data.countdown;
      if (appearance.pomodoroView === "focus") {
        return data.focusMinutes != null;
      }
      if (appearance.pomodoroView === "cycle") {
        return data.pomodoroCycle != null;
      }
      return data.pomodoros != null;
    })
    .slice(0, MAX_IDLE_WIDGETS);
}
