import type { SedentaryTone } from "../../domain/sedentary";

type Props = {
  /** Sitting progress toward the reminder, 0–100. */
  percent: number;
  tone: SedentaryTone;
  size: "island" | "settings";
  /** Accessible description, e.g. "已坐 23 分". */
  title: string;
  /** Centre art (the chair); it takes precedence over `label`. */
  art?: string;
  /** Centre text, e.g. "23 分". */
  label?: string;
};

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A ring that fills as sitting time approaches the reminder interval. */
export function StandRing({ percent, tone, size, title, art, label }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span
      className={`stand-ring stand-ring-${size} tone-${tone}`}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="stand-ring-track" cx="24" cy="24" r={RADIUS} />
        <circle
          className="stand-ring-value"
          cx="24"
          cy="24"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
        />
      </svg>
      {art ? (
        <img className="stand-ring-art" src={art} alt="" draggable={false} />
      ) : (
        label && <span className="stand-ring-label">{label}</span>
      )}
    </span>
  );
}
