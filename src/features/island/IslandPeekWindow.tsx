import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PeekMascot, type PeekAppearance } from "./PeekMascot";

type PeekView = PeekAppearance & { side: "left" | "right" | null };

export function IslandPeekWindow() {
  const [appearance, setAppearance] = useState<PeekView | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let receivedEvent = false;
    const subscription = listen<PeekView | null>(
      "island-peek-changed",
      ({ payload }) => {
        receivedEvent = true;
        if (active) setAppearance(payload);
      },
    );
    void subscription
      .then(async () => {
        if (!active) return;
        const initial = await invoke<PeekView | null>("get_island_peek");
        if (active && !receivedEvent) setAppearance(initial);
      })
      .catch(console.error);
    return () => {
      active = false;
      void subscription.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);
  return (
    <div
      className="island-peek-window"
      data-side={appearance?.side ?? undefined}
    >
      {appearance && <PeekMascot {...appearance} />}
    </div>
  );
}
