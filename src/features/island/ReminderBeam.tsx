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
    <BorderBeam
      color="var(--alert-color, #e4a65d)"
      count={2}
      duration={3}
      lineWidth={2.5}
      outset={0}
      size={100}
      items={enabled ? undefined : noBeams}
    >
      {children}
    </BorderBeam>
  );
}
