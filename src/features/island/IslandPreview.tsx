import { useEffect, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
export function IslandPreview({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  return (
    <div className="preview-stage">
      <IslandContent appearance={appearance} />
    </div>
  );
}

export function IslandContent({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="island" style={{ transform: `scale(${appearance.scale})` }}>
      <Clock3 className="island-clock-icon" size={15} aria-hidden="true" />
      {appearance.showClock
        ? now.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Dynamic Island"}
      <ChevronDown className="island-signal" size={15} aria-hidden="true" />
    </div>
  );
}
