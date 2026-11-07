import { BorderBeam } from "antd";
import type { ReactElement } from "react";

const noBeams: [] = [];

/** Always keep the same wrapper so changing reminders never remounts the panel. */
export function ReminderBeam({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactElement;
}) {
  return (
    // antd's default beam run; only the colour follows the reminder type.
    <BorderBeam
      color="var(--alert-color, #e4a65d)"
      count={2}
      duration={3}
      lineWidth={2}
      outset={0}
      size={50}
      items={enabled ? undefined : noBeams}
    >
      {children}
    </BorderBeam>
  );
}
