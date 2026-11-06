import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { IdleWaterTimer } from "./idleWidgetData";
import {
  defaultWaterSettings,
  parseWaterSettings,
  type WaterSettings,
} from "../../domain/water";
import { addWater, loadWaterSettings } from "../../services/waterRepository";

/**
 * Hydration tracking and reminders: the goal progress the island shows, the
 * periodic nudges during the active window, and the manual / custom logging.
 */
export function useIslandWater(
  todayWater: number,
  now: number,
  language: string,
) {
  const [water, setWater] = useState<WaterSettings>(defaultWaterSettings);
  const waterRef = useRef(water);
  const [waterReminder, setWaterReminder] = useState(false);
  const [waterAdded, setWaterAdded] = useState(0);
  const [waterAddedMl, setWaterAddedMl] = useState(0);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [customWaterMl, setCustomWaterMl] = useState("300");
  const [waterError, setWaterError] = useState("");
  // Session start: the first nudge waits a full interval from here.
  const [sessionStart] = useState(() => Date.now());
  const lastReminderRef = useRef(sessionStart);
  const waterTodayRef = useRef(todayWater);
  useEffect(() => {
    waterRef.current = water;
  }, [water]);
  useEffect(() => {
    waterTodayRef.current = todayWater;
  }, [todayWater]);
  useEffect(() => {
    let active = true;
    void loadWaterSettings().then((stored) => {
      if (!active) return;
      waterRef.current = stored;
      setWater(stored);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("water-changed", ({ payload }) => {
      const next = parseWaterSettings(payload);
      if (next && active) {
        waterRef.current = next;
        setWater(next);
      }
    })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    const check = () => {
      const settings = waterRef.current;
      if (!settings.enabled || waterTodayRef.current >= settings.goalMl) {
        return;
      }
      const hour = new Date().getHours();
      if (hour < settings.activeStart || hour >= settings.activeEnd) return;
      const current = Date.now();
      if (
        current - lastReminderRef.current <
        settings.reminderMinutes * 60_000
      ) {
        return;
      }
      lastReminderRef.current = current;
      setWaterReminder(true);
    };
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!waterReminder) return;
    const id = window.setTimeout(() => setWaterReminder(false), 30_000);
    return () => window.clearTimeout(id);
  }, [waterReminder]);
  // The idle widget mirrors the reminder rules and always names the next
  // reminder: minutes while active, otherwise the next active window.
  function waterTimerState(): IdleWaterTimer | null {
    if (!water.enabled) return null;
    if (todayWater >= water.goalMl) return { done: true };
    const current = new Date(now);
    const todayStart = new Date(current);
    todayStart.setHours(water.activeStart, 0, 0, 0);
    const todayEnd = new Date(current);
    todayEnd.setHours(water.activeEnd, 0, 0, 0);
    const clock = (date: Date) =>
      date.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    const tomorrow = (): IdleWaterTimer => {
      const date = new Date(todayStart);
      date.setDate(date.getDate() + 1);
      return { at: clock(date), tomorrow: true };
    };
    const hour = current.getHours();
    if (hour >= water.activeStart && hour < water.activeEnd) {
      const next = lastReminderRef.current + water.reminderMinutes * 60_000;
      if (next < todayEnd.getTime()) {
        if (next <= now) return { soon: true };
        return { minutes: Math.ceil((next - now) / 60_000) };
      }
      return tomorrow();
    }
    if (now < todayStart.getTime()) {
      return { at: clock(todayStart), tomorrow: false };
    }
    return tomorrow();
  }
  async function drinkWater(amountMl: number) {
    setWaterError("");
    try {
      await addWater(amountMl);
      lastReminderRef.current = Date.now();
      setWaterReminder(false);
      setWaterAddedMl(amountMl);
      setWaterAdded((count) => count + 1);
    } catch (error) {
      setWaterError(String(error));
    }
  }
  return {
    water,
    waterReminder,
    setWaterReminder,
    waterAdded,
    waterAddedMl,
    customWaterOpen,
    setCustomWaterOpen,
    customWaterMl,
    setCustomWaterMl,
    waterError,
    setWaterError,
    drinkWater,
    waterTimerState,
  };
}
