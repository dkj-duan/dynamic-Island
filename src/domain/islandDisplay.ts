/** Select the most important current item for the island's compact display. */
export type IslandDisplay =
  | "finished"
  | "mail"
  | "notice"
  | "water"
  | "waterLogged"
  | "timer"
  | "media"
  | "idle";

export function selectIslandDisplay(state: {
  timer: "idle" | "running" | "paused" | "finished";
  mail: boolean;
  notice: boolean;
  water: boolean;
  /** A cup was just logged; a short confirmation, never an interruption. */
  waterLogged: boolean;
  media: boolean;
}): IslandDisplay {
  if (state.timer === "finished") return "finished";
  // System notices are transient (a few seconds) and must interrupt longer
  // content such as a mail code that waits for the user.
  if (state.notice) return "notice";
  if (state.mail) return "mail";
  // A running focus session is never interrupted by a drink reminder or the
  // confirmation of one.
  if (state.timer !== "idle") return "timer";
  if (state.water) return "water";
  if (state.waterLogged) return "waterLogged";
  if (state.media) return "media";
  return "idle";
}
