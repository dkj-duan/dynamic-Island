/**
 * Island panel motion — the single source of truth for morph timings.
 *
 * The numbers live here rather than in the stylesheet so the JS state
 * machine can derive its completion fallbacks from the same constants
 * instead of magic numbers that silently drift out of sync with island.css.
 * `applyMotionTokens` publishes them as CSS custom properties before the
 * island's first paint; island.css reads them with matching inline
 * fallbacks so a browser-only preview (`npm run dev`) still animates
 * without the injection.
 */

/** Expand and page-switch morph: width, height and border-radius. */
export const PANEL_EXPAND_MS = 320;
/** Collapse morph — deliberately quicker than expansion. */
export const PANEL_COLLAPSE_MS = 240;
/** Page content entrance when switching tabs. */
export const PAGE_IN_MS = 240;

/**
 * Extra margin on top of an animation duration for JS-side completion
 * fallbacks. `transitionend` can be swallowed by a busy webview, so every
 * wait also carries a timeout; the buffer keeps it comfortably above the
 * animation without stalling the state machine.
 */
export const PANEL_SETTLE_BUFFER_MS = 160;

export const PANEL_EXPAND_TIMEOUT_MS = PANEL_EXPAND_MS + PANEL_SETTLE_BUFFER_MS;
export const PANEL_COLLAPSE_TIMEOUT_MS =
  PANEL_COLLAPSE_MS + PANEL_SETTLE_BUFFER_MS;

/** Fallback for a stuck rAF while waiting for a committed layout frame. */
export const FRAME_WAIT_MS = 120;

/** Dwell before a hover expansion, so crossing the capsule does not pop it. */
export const HOVER_DWELL_MS = 180;

/**
 * A page switch can shrink the panel under a stationary pointer, which the
 * browser reports as a mouseleave; that synthetic leave is ignored for a
 * short grace window after a programmatic page change.
 */
export const PAGE_SWITCH_LEAVE_GRACE_MS = 400;

/** After expanding in hover mode, re-check the pointer position once. */
export const LEAVE_RECHECK_MS = 450;

/**
 * A passive reminder panel is the alert's display itself: it holds for the
 * configured flash time plus this buffer, so the collapse starts as the
 * content fades instead of clipping it mid-frame.
 */
export const REMINDER_HOLD_BUFFER_MS = 600;

/** Tighten the native hit region this long after the last resize frame. */
export const BOUNDS_SETTLE_MS = 260;

/** Native hit-region updates skip sends when the rect moved less than this. */
export const BOUNDS_EPSILON_PX = 0.5;

/** CSS custom properties consumed by island.css. */
export function applyMotionTokens(
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty("--motion-panel", `${PANEL_EXPAND_MS}ms`);
  root.style.setProperty("--motion-collapse", `${PANEL_COLLAPSE_MS}ms`);
  root.style.setProperty("--motion-page-in", `${PAGE_IN_MS}ms`);
}
