import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ExpandTrigger } from "../../domain/settings";
import { t } from "../../services/i18n";

function waitForPanelTransition(element: HTMLElement | null): Promise<void> {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      element.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === "height") finish();
    };
    const timeout = window.setTimeout(finish, 450);
    element.addEventListener("transitionend", onEnd);
  });
}

/**
 * Waits two compositor frames so the resized layout is committed before the
 * native window reads it. A throttled or suspended webview can stop firing
 * rAF entirely; the timeout keeps the expansion state machine alive, since a
 * stuck frame would block every future expand and collapse.
 */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(done));
    window.setTimeout(done, 120);
  });
}

type AlertKind =
  "timer" | "mail" | "water" | "sedentary" | "notification" | "notice";

/**
 * The island's open/close lifecycle: click and hover expansion, the
 * auto-collapse timers, native dragging and the reminder auto-expand, plus
 * keeping the native window's hit region on the visible panel.
 */
export function useExpandCollapse(options: {
  expandTrigger: ExpandTrigger;
  autoCollapseSeconds: number;
  reminderAutoExpand: boolean;
  /** Passively open the panel when a forwarded notification arrives. */
  noticeAutoExpand: boolean;
  /** How long a forwarded notification stays visible, in seconds. */
  noticeDisplaySeconds: number;
  /** How long a reminder (water, mail, timer done) stays visible, in seconds. */
  reminderDisplaySeconds: number;
  /** A fullscreen app owns the screen: never auto-open the panel. */
  fullscreenSuppressed: boolean;
  /** Native window scale; the hit region tracks layout at the current zoom. */
  scale: number;
  taskbarMode: boolean;
  /** Destination page when the panel opens from a reminder. */
  openReminderPage: (acknowledge?: boolean) => void;
  /** Reports native window failures for the island banner. */
  onError: (message: string) => void;
  /** Token of the alert currently showing, empty when none. */
  alertToken: string;
  /** Kind of the current alert; system notices never auto-expand. */
  alertKind: AlertKind | null;
}) {
  const {
    expandTrigger,
    autoCollapseSeconds,
    reminderAutoExpand,
    noticeAutoExpand,
    noticeDisplaySeconds,
    reminderDisplaySeconds,
    fullscreenSuppressed,
    scale,
    taskbarMode,
    openReminderPage,
    onError,
    alertToken,
    alertKind,
  } = options;
  const panel = useRef<HTMLDivElement>(null);
  const collapseTimeout = useRef<number | null>(null);
  const hoverTimeout = useRef<number | null>(null);
  // A page switch can shrink the panel under a stationary pointer, which the
  // browser reports as a mouseleave; that synthetic leave must not collapse it.
  const ignoreLeaveUntil = useRef(0);
  const dragState = useRef<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const dragMoved = useRef(false);
  const scheduleCollapseRef = useRef<() => void>(() => {});
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  function cancelAutoCollapse() {
    if (collapseTimeout.current !== null) {
      window.clearTimeout(collapseTimeout.current);
      collapseTimeout.current = null;
    }
  }
  // A panel opened by a reminder gets 20s to be noticed. A panel opened by a
  // forwarded notification is the notification's display itself, so it stays
  // exactly as long as the configured flash time, then collapses. As soon as
  // the pointer reaches the panel the reminder has been seen, so the hold is
  // dropped and the normal "collapse after leaving" delay applies again.
  const reminderHold = useRef(0);
  function reminderHoldRemaining() {
    return Math.max(0, reminderHold.current - Date.now());
  }
  // Whether the pointer has actually reached the panel in this expansion. A
  // hotkey can open the panel with the pointer anywhere on screen; the
  // leave-driven collapse only makes sense once the pointer has been there.
  const engagedRef = useRef(false);
  function scheduleAutoCollapse() {
    cancelAutoCollapse();
    if (!expanded || transitioning) return;
    const delay = Math.max(autoCollapseSeconds * 1000, reminderHoldRemaining());
    collapseTimeout.current = window.setTimeout(() => {
      collapseTimeout.current = null;
      if (!panel.current?.matches(":hover")) {
        void toggleExpanded();
      }
    }, delay);
  }
  useEffect(() => {
    scheduleCollapseRef.current = scheduleAutoCollapse;
  });
  // A missed mouseleave at the screen edge would otherwise leave the panel
  // open forever; watching the pointer keeps click mode and hover mode equal.
  // Until the pointer has touched the panel (hotkey expansions), moving it
  // elsewhere must not start the collapse countdown.
  useEffect(() => {
    if (!expanded) return;
    const onMove = (event: PointerEvent) => {
      const element = panel.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        engagedRef.current = true;
        reminderHold.current = 0;
        if (collapseTimeout.current !== null) {
          window.clearTimeout(collapseTimeout.current);
          collapseTimeout.current = null;
        }
      } else if (engagedRef.current && collapseTimeout.current === null) {
        scheduleCollapseRef.current();
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [expanded]);
  useEffect(() => {
    const onWindowBlur = () => scheduleCollapseRef.current();
    const onWindowFocus = () => {
      if (panel.current?.matches(":hover")) cancelAutoCollapse();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      cancelAutoCollapse();
    };
  }, []);
  function cancelHoverExpand() {
    if (hoverTimeout.current !== null) {
      window.clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
  }
  function releaseReminderHold() {
    reminderHold.current = 0;
  }
  function handlePanelEnter() {
    engagedRef.current = true;
    releaseReminderHold();
    cancelAutoCollapse();
    if (expandTrigger !== "hover") return;
    if (expanded || transitioning || dragState.current?.active) return;
    if (hoverTimeout.current !== null) return;
    // A short dwell keeps the panel from popping up when the pointer just
    // crosses the top of the screen.
    hoverTimeout.current = window.setTimeout(() => {
      hoverTimeout.current = null;
      openReminderPage();
      void toggleExpanded();
    }, 180);
  }
  function handlePanelLeave() {
    cancelHoverExpand();
    if (Date.now() < ignoreLeaveUntil.current) return;
    scheduleAutoCollapse();
  }
  function beginDrag(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const control = target.closest("button, input, a, textarea");
    // Nested controls (copy, tabs, inputs) keep their own behaviour.
    if (control && control !== event.currentTarget) return;
    dragMoved.current = false;
    dragState.current = { x: event.clientX, y: event.clientY, active: false };
  }
  function moveDrag(event: React.PointerEvent) {
    const state = dragState.current;
    if (!state || state.active) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 4)
      return;
    state.active = true;
    dragMoved.current = true;
    cancelHoverExpand();
    void invoke("start_island_drag")
      .catch(() => {
        dragMoved.current = false;
      })
      .finally(() => {
        // Native dragging owns the pointer, so pointerup never reaches the
        // webview; a stale active flag would keep blocking hover expansion.
        if (dragState.current === state) dragState.current = null;
      });
  }
  function endDrag() {
    dragState.current = null;
  }
  useEffect(() => cancelHoverExpand, []);
  useEffect(() => {
    if (!expanded || expandTrigger !== "hover") return;
    const id = window.setTimeout(() => {
      if (engagedRef.current && !panel.current?.matches(":hover")) {
        scheduleCollapseRef.current?.();
      }
    }, 450);
    return () => window.clearTimeout(id);
  }, [expanded, expandTrigger]);

  /**
   * Opens or closes the panel. A `passive` expansion is fired by a reminder:
   * the panel shows but clicks pass through it, so the user's pointer and
   * focus are never disturbed; it collapses on its own timer. `engaged`
   * marks expansions where the pointer already sits on the panel (click,
   * hover); a hotkey passes false so the leave-driven collapse waits until
   * the pointer has actually reached the panel.
   */
  async function toggleExpanded(passive = false, engaged = !passive) {
    if (transitioning) return;
    setTransitioning(true);
    try {
      if (expanded) {
        reminderHold.current = 0;
        const animation = waitForPanelTransition(panel.current);
        setExpanded(false);
        await animation;
        await waitForFrame();
        await invoke("set_island_expanded", {
          expanded: false,
          passive: false,
        });
      } else {
        engagedRef.current = engaged && !passive;
        await invoke("set_island_expanded", { expanded: true, passive });
        await waitForFrame();
        const animation = waitForPanelTransition(panel.current);
        setExpanded(true);
        await animation;
      }
    } catch {
      setExpanded(expanded);
      onError(t("窗口调整失败，请重试"));
    } finally {
      setTransitioning(false);
    }
  }
  // Optional: open the panel by itself when a reminder arrives. System
  // notices stay transient so volume keys do not keep popping the panel.
  const reminderActions = useRef({
    open: openReminderPage,
    expand: toggleExpanded,
    expanded,
    transitioning,
  });
  useEffect(() => {
    reminderActions.current = {
      open: openReminderPage,
      expand: toggleExpanded,
      expanded,
      transitioning,
    };
  });
  const autoExpandedRef = useRef("");
  // A fresh reminder of the same kind (two water nudges in a row) must be
  // able to expand again once the previous one has cleared.
  useEffect(() => {
    if (!alertToken) autoExpandedRef.current = "";
  }, [alertToken]);
  useEffect(() => {
    // A fullscreen app owns the screen (the window is hidden): never pop the
    // panel over it.
    if (fullscreenSuppressed) return;
    if (!alertToken) return;
    // System notices stay transient so volume keys do not keep popping the
    // panel; forwarded notifications follow their own switch instead.
    const wantExpand =
      alertKind === "notice"
        ? false
        : alertKind === "notification"
          ? noticeAutoExpand
          : reminderAutoExpand;
    if (!wantExpand) return;
    if (autoExpandedRef.current === alertToken) return;
    if (!alertKind) return;
    autoExpandedRef.current = alertToken;
    const current = reminderActions.current;
    if (current.expanded || current.transitioning) return;
    // The passive panel is the alert's display itself: a forwarded
    // notification collapses with the notification flash time, a reminder
    // with the reminder display time. The 600ms buffer lets the collapse
    // start as the content fades instead of clipping it mid-frame.
    reminderHold.current =
      Date.now() +
      (alertKind === "notification"
        ? noticeDisplaySeconds * 1000 + 600
        : reminderDisplaySeconds * 1000 + 600);
    current.open(false);
    // Passive: the panel is a hint only, never a focus or pointer grab.
    void current.expand(true);
  }, [
    alertToken,
    alertKind,
    noticeAutoExpand,
    noticeDisplaySeconds,
    reminderAutoExpand,
    reminderDisplaySeconds,
    fullscreenSuppressed,
  ]);
  // The hold is measured from the moment the panel actually opens; wait for
  // the expansion transition to finish before arming the collapse timer.
  useEffect(() => {
    if (transitioning) return;
    if (!expanded) {
      reminderHold.current = 0;
      return;
    }
    if (reminderHoldRemaining() > 0) scheduleCollapseRef.current();
  }, [expanded, transitioning]);
  // The window is a large transparent surface; keep its native hit region on
  // the visible panel so clicks in the empty area reach the apps below. The
  // region only grows while the layout animates and is tightened once the
  // frame settles, so the moving panel is never clipped.
  useEffect(() => {
    if (!isTauri()) return;
    const element = panel.current;
    if (!element) return;
    let frame = 0;
    let settle: number | undefined;
    let disposed = false;
    const send = (settled: boolean) => {
      if (disposed) return;
      const rect = element.getBoundingClientRect();
      void invoke("set_island_panel_bounds", {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        settled,
      }).catch(() => undefined);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        send(false);
        window.clearTimeout(settle);
        settle = window.setTimeout(() => send(true), 260);
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    const initial = window.setTimeout(() => send(true), 0);
    window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.clearTimeout(initial);
      window.removeEventListener("resize", schedule);
    };
  }, [scale, taskbarMode]);
  /** Marks a programmatic page switch so the synthetic mouseleave is ignored. */
  function notePageSwitch() {
    ignoreLeaveUntil.current = Date.now() + 400;
  }
  /** The capsule's toggle button: a completed drag is not a click. */
  function handleToggleClick() {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    cancelHoverExpand();
    openReminderPage();
    void toggleExpanded();
  }
  return {
    expanded,
    transitioning,
    panel,
    notePageSwitch,
    handleToggleClick,
    cancelAutoCollapse,
    scheduleAutoCollapse,
    releaseReminderHold,
    handlePanelEnter,
    handlePanelLeave,
    beginDrag,
    moveDrag,
    endDrag,
    toggleExpanded,
  };
}
