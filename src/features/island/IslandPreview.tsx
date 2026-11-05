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
  const data: IdleData = { quota, water, pomodoros };
  return (
    <IdleWidgets appearance={appearance} data={data} onReorder={onReorder} />
  );
}
