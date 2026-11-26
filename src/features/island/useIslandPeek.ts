import { useEffect, useRef, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IslandMascotPlacement } from "../../domain/settings";
import type { PeekAppearance } from "./PeekMascot";

type Anchor = Pick<DOMRect, "x" | "y" | "width" | "height"> & {
  placement: Exclude<IslandMascotPlacement, "inline">;
};
type Update = { appearance: PeekAppearance | null; anchor: Anchor | null };

export function useIslandPeek(
  panel: RefObject<HTMLDivElement | null>,
  visible: boolean,
  mascot: PeekAppearance["mascot"],
  pose: PeekAppearance["pose"],
  placement: IslandMascotPlacement,
) {
  const activeMascot = visible ? mascot : null;
  const activePose = visible ? pose : null;
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef<Update | null>(null);
  const send = useRef<((update: Update) => void) | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const flush = () => {
      if (inFlight.current || !pending.current) return;
      const update = pending.current;
      pending.current = null;
      inFlight.current = invoke<void>("set_island_peek", update)
        .catch(console.error)
        .finally(() => {
          inFlight.current = null;
          flush();
        });
    };
    send.current = (update) => {
      pending.current = update;
      flush();
    };
    return () => {
      send.current?.({ appearance: null, anchor: null });
      send.current = null;
    };
  }, []);

  useEffect(() => {
    const element = panel.current;
    if (!send.current) return;
    if (!activeMascot || !activePose || !element || placement === "inline") {
      send.current({ appearance: null, anchor: null });
      return;
    }
    let frame = 0;
    let active = true;
    const schedule = () => {
      if (!active || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { x, y, width, height } = element.getBoundingClientRect();
        if (width)
          send.current?.({
            appearance: { mascot: activeMascot, pose: activePose },
            anchor: { x, y, width, height, placement },
          });
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    const appWindow = getCurrentWindow();
    const subscriptions = [
      appWindow.onMoved(schedule),
      appWindow.onResized(schedule),
      appWindow.onScaleChanged(schedule),
    ];
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      for (const subscription of subscriptions) {
        void subscription.then((unlisten) => unlisten()).catch(console.error);
      }
    };
  }, [activeMascot, activePose, panel, placement]);
}
