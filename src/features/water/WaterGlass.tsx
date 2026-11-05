import type { CSSProperties } from "react";
import type { WaterTone } from "../../domain/water";
import glass from "../../assets/water-glass.webp";
import drop from "../../assets/water-drop.webp";

type Props = {
  percent: number;
  tone?: WaterTone;
  size?: "settings" | "island";
  splashKey?: number;
};

export function WaterGlass({
  percent,
  tone = "mid",
  size = "settings",
  splashKey,
}: Props) {
  return (
    <div
      className={`water-glass water-glass-${size} tone-${tone}`}
      role="img"
      aria-label={`${percent}%`}
    >
      <span className="water-glass-body" aria-hidden="true">
        <span
          className="water-glass-fill"
          style={{ height: `${percent}%` } as CSSProperties}
        >
          {percent > 0 && <span className="water-glass-surface" />}
        </span>
      </span>
      <img className="water-glass-img" src={glass} alt="" draggable={false} />
      {splashKey ? (
        <span key={`splash-${splashKey}`} aria-hidden="true">
          <img
            className="water-glass-drop"
            src={drop}
            alt=""
            draggable={false}
          />
          <span className="water-glass-splash" />
        </span>
      ) : null}
    </div>
  );
}
