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

type AlertKind = "timer" | "mail" | "water" | "notice";

/**
 * The island's open/close lifecycle: click and hover expansion, the
 * auto-collapse timers, native dragging and the reminder auto-expand, plus
 * keeping the native window's hit region on the visible panel.
 */
export function useExpandCollapse(options: {
  expandTrigger: ExpandTrigger;
  autoCollapseSeconds: number;
  reminderAutoExpand: boolean;
  /** Native window scale; the hit region tracks layout at the current zoom. */
  scale: number;
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
    scale,
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
  // A panel opened by a reminder gets 20s to be noticed. As soon as the
  // pointer reaches it the reminder has been seen, so the hold is dropped and
  // the normal "collapse after leaving" delay applies again.
  const reminderHold = useRef(0);
  function reminderHoldRemaining() {
    return Math.max(0, reminderHold.current - Date.now());
  }
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
        reminderHold.current = 0;
        if (collapseTimeout.current !== null) {
          window.clearTimeout(collapseTimeout.current);
          collapseTimeout.current = null;
        }
      } else if (collapseTimeout.current === null) {
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
      if (!panel.current?.matches(":hover")) scheduleCollapseRef.current?.();
    }, 450);
    return () => window.clearTimeout(id);
  }, [expanded, expandTrigger]);

  /**
   * Opens or closes the panel. A `passive` expansion is fired by a reminder:
   * the panel shows but clicks pass through it, so the user's pointer and
   * focus are never disturbed; it collapses on its own timer.
   */
  async function toggleExpanded(passive = false) {
    if (transitioning) return;
    setTransitioning(true);
    try {
      if (expanded) {
        reminderHold.current = 0;
        const animation = waitForPanelTransition(panel.current);
        setExpanded(false);
        await animation;
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => resolve()),
        );
        await invoke("set_island_expanded", {
          expanded: false,
          passive: false,
        });
      } else {
        await invoke("set_island_expanded", { expanded: true, passive });
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => resolve()),
          ),
        );
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
    if (!alertToken || !reminderAutoExpand) return;
    if (autoExpandedRef.current === alertToken) return;
    if (!alertKind || alertKind === "notice") return;
    autoExpandedRef.current = alertToken;
    const current = reminderActions.current;
    if (current.expanded || current.transitioning) return;
    reminderHold.current = Date.now() + 20_000;
    current.open(false);
    // Passive: the panel is a hint only, never a focus or pointer grab.
    void current.expand(true);
  }, [alertToken, alertKind, reminderAutoExpand]);
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
  }, [scale]);
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
