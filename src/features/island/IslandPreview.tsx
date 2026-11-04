import { useEffect, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
import { quotaRings, type QuotaItem } from "../../domain/aiQuota";
import { ProviderIcon } from "../ai/ProviderIcon";
import { QuotaRings } from "../ai/QuotaRings";

export type PreviewQuota = { provider: string; items: QuotaItem[] };

/** Width of the collapsed capsule, shared by the island and its preview. */
export const IDLE_WIDTH = 196;
export const IDLE_QUOTA_WIDTH = 156;

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

/** Clock plus the pinned account's ring, as shown while the island idles. */
export function IdleQuota({
  appearance,
  provider,
  items,
}: {
  appearance: AppearanceSettings;
  provider: string;
  items: QuotaItem[];
}) {
  return (
    <span className="island-current compact-timer compact-idle-quota">
      {appearance.showClock && <CompactClock />}
      {quotaRings(items).length ? (
        <QuotaRings items={items} compact provider={provider} />
      ) : (
        <ProviderIcon provider={provider} size="normal" />
      )}
    </span>
  );
}

export function IslandPreview({
  appearance,
  quota,
}: {
  appearance: AppearanceSettings;
  quota?: PreviewQuota | null;
}) {
  /* Stage wrapper lives in SettingsPage — do not nest another .preview-stage. */
  if (!quota)
    return (
      <IslandContent
        appearance={appearance}
        width={IDLE_WIDTH * appearance.scale}
      />
    );
  return (
    <div
      className="island is-quota-preview"
      style={{ width: IDLE_QUOTA_WIDTH * appearance.scale }}
    >
      <IdleQuota
        appearance={appearance}
        provider={quota.provider}
        items={quota.items}
      />
    </div>
  );
}

export function IslandContent({
  appearance,
  width,
}: {
  appearance: AppearanceSettings;
  width?: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      className="island"
      style={width === undefined ? undefined : { width, minWidth: 0 }}
    >
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
