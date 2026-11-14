export type MascotReaction = "celebrate" | "water" | "attention";

export type MascotSignals = {
  waterMl: number | null;
  waterActions: number;
  pomodoros: number | null;
  focusFinished: boolean;
  countdownReached: boolean | null;
  sedentaryOver: boolean | null;
};

/** React only to new events, never to the initial snapshot or daily resets. */
export function mascotReactionForChange(
  previous: MascotSignals,
  current: MascotSignals,
): MascotReaction | null {
  if (
    (previous.countdownReached === false &&
      current.countdownReached === true) ||
    (previous.sedentaryOver === false && current.sedentaryOver === true)
  ) {
    return "attention";
  }
  if (
    (!previous.focusFinished && current.focusFinished) ||
    (previous.pomodoros !== null &&
      current.pomodoros !== null &&
      current.pomodoros > previous.pomodoros)
  ) {
    return "celebrate";
  }
  if (
    current.waterActions > previous.waterActions ||
    (previous.waterMl !== null &&
      current.waterMl !== null &&
      current.waterMl > previous.waterMl)
  ) {
    return "water";
  }
  return null;
}
