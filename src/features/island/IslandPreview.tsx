import { useLayoutEffect, useRef, useState } from "react";
import type { QuotaItem } from "../../domain/aiQuota";
import type { AppearanceSettings, IdleWidgetId } from "../../domain/settings";
import { IdleWidgets } from "./IdleWidgets";
import { PeekMascot } from "./PeekMascot";
import { islandColorStyle } from "./islandColors";
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
  const capsuleRef = useRef<HTMLDivElement>(null);
  const [scaleCap, setScaleCap] = useState(Infinity);
  const peekEnabled =
    appearance.islandMascotPlacement !== "inline" &&
    appearance.idleWidgets.includes("mascot");
  const peekSide =
    peekEnabled && appearance.snapToTop && !appearance.taskbarMode
      ? appearance.islandMascotPlacement === "peek-right"
        ? "right"
        : "left"
      : undefined;
  useLayoutEffect(() => {
    const capsule = capsuleRef.current;
    const stage = capsule?.parentElement;
    if (!capsule || !stage) return;
    const fit = () => {
      if (
        stage.clientWidth > 16 &&
        stage.clientHeight > 4 &&
        capsule.offsetWidth &&
        capsule.offsetHeight
      ) {
        setScaleCap(
          Math.min(
            (stage.clientWidth - 16) / capsule.offsetWidth,
            (stage.clientHeight - 4) / capsule.offsetHeight,
          ),
        );
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    observer.observe(capsule);
    fit();
    return () => observer.disconnect();
  }, [peekEnabled, peekSide]);

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
    sedentary: { minutes: 23, over: false, reached: false },
  };
  return (
    // Zoom only the capsule, so the stage around it keeps a stable size.
    // Mirror the real idle island's style and material.
    <div
      ref={capsuleRef}
      className="island-preview-fit"
      style={{
        ...islandColorStyle(appearance),
        zoom: Math.min(appearance.scale, scaleCap),
      }}
      data-shape={appearance.expandedShape}
      data-accent={appearance.islandAccent}
      data-idle-style={appearance.idleStyle}
      data-glass={appearance.islandMaterial === "glass" ? "on" : undefined}
      data-peek={peekEnabled || undefined}
      data-peek-side={peekSide}
      data-peek-mascot={peekSide ? appearance.islandMascot : undefined}
    >
      {peekEnabled && (
        <div
          className="island-preview-peek"
          data-position={appearance.islandMascotPlacement}
          data-side={peekSide}
        >
          <PeekMascot
            mascot={appearance.islandMascot}
            pose="idle"
            side={peekSide}
          />
        </div>
      )}
      <IdleWidgets
        key={`${appearance.idleStyle}:${appearance.idleWidgets.join(",")}`}
        appearance={appearance}
        data={data}
        onReorder={onReorder}
        preview
      />
    </div>
  );
}
