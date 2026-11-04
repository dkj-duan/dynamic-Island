/** Select the most important current item for the island's compact display. */
export type IslandDisplay =
  "finished" | "mail" | "notice" | "timer" | "media" | "idle";

export function selectIslandDisplay(state: {
  timer: "idle" | "running" | "paused" | "finished";
  mail: boolean;
  notice: boolean;
  media: boolean;
}): IslandDisplay {
  if (state.timer === "finished") return "finished";
  if (state.mail) return "mail";
  if (state.notice) return "notice";
  if (state.timer !== "idle") return "timer";
  if (state.media) return "media";
  return "idle";
}
