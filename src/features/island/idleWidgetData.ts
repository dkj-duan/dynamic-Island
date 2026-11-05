import type { QuotaItem } from "../../domain/aiQuota";
import type { AppearanceSettings, IdleWidgetId } from "../../domain/settings";

export type IdleData = {
  quota?: { provider: string; items: QuotaItem[] } | null;
  water?: { percent: number } | null;
  pomodoros?: number | null;
  music?: { title: string; artist: string; artwork?: string | null } | null;
};

export function availableIdleWidgets(
  appearance: AppearanceSettings,
  data: IdleData,
): IdleWidgetId[] {
  return appearance.idleWidgets.filter((id) => {
    if (id === "clock") return true;
    if (id === "music") return data.music !== null;
    if (id === "quota") return !!data.quota;
    if (id === "water") return !!data.water;
    return data.pomodoros != null;
  });
}
