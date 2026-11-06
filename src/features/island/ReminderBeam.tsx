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
      duration={4}
      lineWidth={1.5}
      outset={0}
      size={44}
      items={enabled ? undefined : noBeams}
    >
      {children}
    </BorderBeam>
  );
}
