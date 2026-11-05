import type { CSSProperties } from "react";
import type { DailyValue } from "../../domain/dailyStats";

type Props = {
  values: DailyValue[];
  goal?: number;
  color: string;
  format: (value: number) => string;
  label: string;
};

export function DailyChart({ values, goal = 0, color, format, label }: Props) {
  const max = Math.max(goal, ...values.map((entry) => entry.value), 1);
  const goalPercent = goal > 0 ? Math.min(100, (goal / max) * 100) : 0;
  return (
    <div
      className="daily-chart"
      role="img"
      aria-label={label}
      style={{ "--chart-color": color } as CSSProperties}
    >
      <div className="daily-chart-plot">
        <span className="daily-chart-grid" aria-hidden="true" />
        <span className="daily-chart-baseline" aria-hidden="true" />
        {goal > 0 && (
          <>
            <span
              className="daily-chart-goal"
              style={{ bottom: `${goalPercent}%` }}
              aria-hidden="true"
            />
            <span
              className="daily-chart-goal-label"
              style={{ bottom: `calc(${goalPercent}% + 4px)` }}
            >
              {format(goal)}
            </span>
          </>
        )}
        <div className="daily-chart-bars">
          {values.map((entry, index) => {
            const height = (entry.value / max) * 100;
            const isToday = index === values.length - 1;
            return (
              <div
                key={entry.day}
                className={`daily-chart-col ${isToday ? "is-today" : ""} ${entry.value === 0 ? "is-empty" : ""}`}
                style={{ "--bar-height": `${height}%` } as CSSProperties}
                title={`${entry.day} · ${format(entry.value)}`}
              >
                <span className="daily-chart-bar" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="daily-chart-labels" aria-hidden="true">
        {values.map((entry, index) => {
          const distance = values.length - 1 - index;
          const show = distance === 0 || distance % 7 === 0;
          const [, month, day] = entry.day.split("-");
          return (
            <span key={entry.day}>
              {show ? `${Number(month)}/${Number(day)}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
