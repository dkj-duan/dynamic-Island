import type { QuotaItem } from "../../domain/aiQuota";
import type { AppearanceSettings, IdleWidgetId } from "../../domain/settings";
import { IdleWidgets } from "./IdleWidgets";
import type { IdleData } from "./idleWidgetData";

export type PreviewQuota = { provider: string; items: QuotaItem[] };

export function IslandPreview({
  appearance,
  quota,
  water,
  pomodoros,
  onReorder,
}: {
  appearance: AppearanceSettings;
  quota?: PreviewQuota | null;
  water?: { percent: number } | null;
  pomodoros?: number | null;
  onReorder?: (widgets: IdleWidgetId[]) => void;
}) {
  // Sample values keep newly enabled widgets visible in the preview; the real
  // island only renders live data.
  const data: IdleData = {
    quota,
    water,
    pomodoros,
    battery: { percent: 76, charging: false },
    focusMinutes: 92,
    streak: 4,
    volume: { percent: 48, muted: false },
    bluetooth: { name: "耳机", battery: 70 },
    waterTimer: { minutes: 23 },
    countdown: { label: "下班", remainingMs: 2 * 3600_000, reached: false },
    pomodoroCycle: { done: 2, total: 4 },
    sedentary: { minutes: 23, over: false },
  };
  return (
    // Zoom only the capsule, so the stage around it keeps a stable size.
    <div style={{ zoom: appearance.scale }}>
      <IdleWidgets
        key={appearance.idleWidgets.join(",")}
        appearance={appearance}
        data={data}
        onReorder={onReorder}
        preview
      />
    </div>
  );
}
