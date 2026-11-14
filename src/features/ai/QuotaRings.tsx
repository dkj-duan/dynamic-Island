import { useEffect, useRef, useState } from "react";
import { quotaRings, type QuotaItem } from "../../domain/aiQuota";
import { ProviderIcon } from "./ProviderIcon";

/** Counts the centre label from zero (and between updates) like a gauge. */
function useCountUp(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(enabled ? 0 : target);
  const shownRef = useRef(shown);
  useEffect(() => {
    if (!enabled) {
      shownRef.current = target;
      return;
    }
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const from = shownRef.current;
    if (from === target) return;
    if (reduce) {
      const frame = window.requestAnimationFrame(() => {
        shownRef.current = target;
        setShown(target);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const duration = from === 0 ? 720 : 360;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, enabled]);
  return enabled ? Math.round(shown) : target;
}

export function QuotaRings({
  items,
  compact = false,
  provider,
}: {
  items: QuotaItem[];
  compact?: boolean;
  provider?: string;
}) {
  const rings = quotaRings(items);
  const centerValue = useCountUp(
    rings.length ? Math.round(rings[0].percent) : 0,
    !compact && rings.length === 1,
  );
  if (!rings.length) return null;
  return (
    <span
      className={compact ? "quota-rings quota-rings-compact" : "quota-rings"}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        focusable="false"
        shapeRendering="geometricPrecision"
        className={rings.length === 1 ? "is-single" : undefined}
      >
        {rings.map(({ item, percent }, index) => {
          // One gauge alone fills the disc; two nest as outer + inner.
          const radius = rings.length === 1 ? 38 : index === 0 ? 41 : 30;
          const ringClass = `quota-ring-${index}`;
          return (
            <g key={`${item.label}-${index}`}>
              <circle
                className="quota-ring-track"
                cx="50"
                cy="50"
                r={radius}
                pathLength="100"
              />
              {percent > 0 && (
                <circle
                  className={`quota-ring-glow ${ringClass}`}
                  cx="50"
                  cy="50"
                  r={radius}
                  pathLength="100"
                  strokeDasharray={`${percent} 100`}
                  transform="rotate(-90 50 50)"
                />
              )}
              {percent > 0 && (
                <circle
                  className={`quota-ring-progress ${ringClass}`}
                  cx="50"
                  cy="50"
                  r={radius}
                  pathLength="100"
                  strokeDasharray={`${percent} 100`}
                  transform="rotate(-90 50 50)"
                />
              )}
            </g>
          );
        })}
        {compact && provider && (
          <foreignObject x="20" y="20" width="60" height="60">
            <span className="quota-ring-logo">
              <ProviderIcon provider={provider} size="tiny" />
            </span>
          </foreignObject>
        )}
      </svg>
      {!compact && rings.length === 1 && (
        <span className="quota-ring-center">
          <strong>{centerValue}%</strong>
        </span>
      )}
    </span>
  );
}
