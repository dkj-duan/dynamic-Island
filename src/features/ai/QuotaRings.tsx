import { quotaRings, type QuotaItem } from "../../domain/aiQuota";
import { ProviderIcon } from "./ProviderIcon";
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
  if (!rings.length) return null;
  return (
    <span
      className={compact ? "quota-rings quota-rings-compact" : "quota-rings"}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" focusable="false">
        {rings.map(({ item, percent }, index) => {
          const radius = index === 0 ? 41 : 30;
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
                  className={`quota-ring-progress quota-ring-${index}`}
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
      </svg>
      {!compact &&
        (provider ? (
          <span className="quota-ring-center">
            <span className="quota-ring-logo">
              <ProviderIcon provider={provider} size="normal" />
            </span>
          </span>
        ) : (
          <span className="quota-ring-center">
            <strong>{rings[0].item.value}</strong>
          </span>
        ))}
      {compact && provider && (
        <span className="quota-ring-logo">
          <ProviderIcon provider={provider} size="tiny" />
        </span>
      )}
    </span>
  );
}
