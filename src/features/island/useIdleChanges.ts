import { useEffect, useRef, useState } from "react";
import type { IdleWidgetId } from "../../domain/settings";
import type { IdleChangeShownAt } from "./idleWidgetData";

/** Serialized value of every change-tier widget; null = no data yet. */
export type IdleChangeKeys = Partial<Record<IdleWidgetId, string | null>>;

/**
 * Remembers when each change-tier widget last said something new. The first
 * value seen after startup is the baseline: a widget appears only when its
 * value moves afterwards, so launching the app never replays the state it
 * started with. Expiry needs no timer — the island re-renders every second
 * against the shared clock beat.
 */
export function useIdleChanges(keys: IdleChangeKeys): IdleChangeShownAt {
  const [shownAt, setShownAt] = useState<IdleChangeShownAt>({});
  const baselineRef = useRef<Partial<Record<string, string>>>({});
  const seenRef = useRef<Partial<Record<string, boolean>>>({});
  // Timestamps waiting for the deferred publish; merging before the flush
  // keeps overlapping changes from dropping each other.
  const pendingRef = useRef<IdleChangeShownAt>({});
  const keysBatch = JSON.stringify(keys);
  useEffect(() => {
    const keys = JSON.parse(keysBatch) as IdleChangeKeys;
    const changed: IdleChangeShownAt = {};
    for (const id of Object.keys(keys) as IdleWidgetId[]) {
      const key = keys[id];
      if (key === null || key === undefined) continue;
      if (!seenRef.current[id]) {
        seenRef.current[id] = true;
        baselineRef.current[id] = key;
        continue;
      }
      if (baselineRef.current[id] !== key) {
        baselineRef.current[id] = key;
        changed[id] = Date.now();
      }
    }
    if (Object.keys(changed).length === 0) return;
    pendingRef.current = { ...pendingRef.current, ...changed };
    // Publish outside the effect body; the merge keeps every timestamp.
    window.setTimeout(() => {
      const flush = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(flush).length === 0) return;
      setShownAt((current) => ({ ...current, ...flush }));
    }, 0);
  }, [keysBatch]);
  return shownAt;
}
