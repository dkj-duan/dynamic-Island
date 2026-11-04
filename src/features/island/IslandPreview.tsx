import { useEffect, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
export function CompactClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="compact-clock">
      <span>
        {now.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <span>{`${now.getMonth() + 1}/${now.getDate()} ${now.toLocaleDateString("zh-CN", { weekday: "short" })}`}</span>
    </span>
  );
}
export function IslandPreview({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  /* Stage wrapper lives in SettingsPage — do not nest another .preview-stage. */
  return <IslandContent appearance={appearance} />;
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
      {appearance.showClock ? (
        <span className="compact-idle-copy">
          <span>
            {now.toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span>{`${now.getMonth() + 1}/${now.getDate()} ${now.toLocaleDateString("zh-CN", { weekday: "short" })}`}</span>
        </span>
      ) : (
        "Dynamic Island"
      )}
      <ChevronDown className="island-signal" size={15} aria-hidden="true" />
    </div>
  );
}
