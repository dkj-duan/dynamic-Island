import type { SystemNotice } from "./systemNotices";

/** Select the most important current item for the island's compact display. */
export type IslandDisplay =
  | "finished"
  | "mail"
  | "notice"
  | "water"
  | "waterLogged"
  | "sedentary"
  | "sedentaryLogged"
  | "timer"
  | "media"
  | "idle";

/** The alert chrome the capsule can raise for the current display. */
export type IslandAlertKind =
  "timer" | "mail" | "water" | "sedentary" | "notification" | "notice";

/** Keep compact controls reachable even when the island normally opens on hover. */
export function shouldBlockHoverExpansion(
  display: IslandDisplay,
  noticeKind: SystemNotice["kind"] | null | undefined,
): boolean {
  if (
    display === "water" ||
    display === "sedentary" ||
    display === "mail" ||
    display === "finished"
  ) {
    return true;
  }
  if (display === "notice") return noticeKind === "notification";
  return false;
}

/**
 * Reminder-aware chrome for the compact capsule: which kind of alert ring,
 * pop animation and auto-expand rule applies, if any. Forwarded
 * notifications are their own kind so they can auto-expand on their own
 * switch, while volume and brightness notices never do.
 */
export function alertKindFor(
  display: IslandDisplay,
  noticeKind?: SystemNotice["kind"] | null,
): IslandAlertKind | null {
  switch (display) {
    case "finished":
      return "timer";
    case "mail":
      return "mail";
    case "water":
    case "waterLogged":
      return "water";
    case "sedentary":
    case "sedentaryLogged":
      return "sedentary";
    case "notice":
      return noticeKind === "notification" ? "notification" : "notice";
    default:
      return null;
  }
}

/**
 * Identity token of the current alert. Two alerts share a token only when
 * they are the same kind carrying the same payload, so a repeated water
 * nudge can pop and auto-expand again once the previous one cleared.
 */
export function alertTokenFor(
  kind: IslandAlertKind | null,
  mailKey: string,
  noticeLabel = "",
  noticeValue = "",
  noticeEventId?: number,
): string {
  if (!kind) return "";
  return `${kind}:${kind === "mail" ? mailKey : ""}${
    kind === "notification"
      ? noticeEventId === undefined
        ? `:${noticeLabel}:${noticeValue}`
        : `:event:${noticeEventId}`
      : ""
  }`;
}

export function selectIslandDisplay(state: {
  timer: "idle" | "running" | "paused" | "finished";
  mail: boolean;
  notice: boolean;
  water: boolean;
  /** A cup was just logged; a short confirmation, never an interruption. */
  waterLogged: boolean;
  sedentary: boolean;
  /** A stand break was just logged; a short confirmation, like waterLogged. */
  sedentaryLogged: boolean;
  media: boolean;
}): IslandDisplay {
  if (state.timer === "finished") return "finished";
  // System notices are transient (a few seconds) and must interrupt longer
  // content such as a mail code that waits for the user.
  if (state.notice) return "notice";
  if (state.mail) return "mail";
  // A running focus session is never interrupted by a drink or stand-up
  // reminder, or the confirmation of one.
  if (state.timer !== "idle") return "timer";
  if (state.water) return "water";
  if (state.waterLogged) return "waterLogged";
  if (state.sedentary) return "sedentary";
  if (state.sedentaryLogged) return "sedentaryLogged";
  if (state.media) return "media";
  return "idle";
}
