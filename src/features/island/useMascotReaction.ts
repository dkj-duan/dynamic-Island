import { useEffect, useRef, useState } from "react";
import {
  mascotReactionForChange,
  type MascotReaction,
  type MascotSignals,
} from "../../domain/mascotReaction";

/** Keep reactions alive while a higher-priority capsule temporarily covers idle. */
export function useMascotReaction(
  signals: MascotSignals,
  visible: boolean,
): MascotReaction | null {
  const [reaction, setReaction] = useState<MascotReaction | null>(null);
  const previous = useRef<MascotSignals | null>(null);
  const {
    waterMl,
    waterActions,
    pomodoros,
    focusFinished,
    countdownReached,
    sedentaryOver,
  } = signals;

  useEffect(() => {
    const current = {
      waterMl,
      waterActions,
      pomodoros,
      focusFinished,
      countdownReached,
      sedentaryOver,
    };
    const next = previous.current
      ? mascotReactionForChange(previous.current, current)
      : null;
    previous.current = current;
    if (!next) return;
    const start = window.setTimeout(() => {
      setReaction(next);
    }, 0);
    return () => window.clearTimeout(start);
  }, [
    waterMl,
    waterActions,
    pomodoros,
    focusFinished,
    countdownReached,
    sedentaryOver,
  ]);

  useEffect(() => {
    if (!reaction) return;
    const expiry = window.setTimeout(
      () => setReaction(null),
      visible ? 8_000 : 60_000,
    );
    return () => window.clearTimeout(expiry);
  }, [reaction, visible]);
  return reaction;
}
