import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { localDay } from "../../domain/pomodoro";
import {
  nextReminderAt,
  REMINDER_SNOOZE_MS,
} from "../../domain/reminderSnooze";
import {
  defaultSedentarySettings,
  parseSedentarySettings,
  sittingMinutes,
  type SedentarySettings,
} from "../../domain/sedentary";
import {
  loadSedentaryProgress,
  loadSedentarySettings,
  recordStand,
  saveSedentaryProgress,
} from "../../services/sedentaryRepository";

/**
 * Sedentary tracking and reminders: how long the user has been sitting, the
 * periodic stand-up nudges during the active window, and logging a break.
 * Unlike water there is no goal gate — sitting is harmful regardless of how
 * many breaks were already logged today, so reminders and recording continue
 * after the daily goal is met. The idle widget only flags the reached state
 * for its display, it never gates the nudges.
 */
export function useIslandSedentary(
  now: number,
  reminderSeconds: number,
  todayBreaks: number,
) {
  const [sedentary, setSedentary] = useState<SedentarySettings>(
    defaultSedentarySettings,
  );
  const sedentaryRef = useRef(sedentary);
  const [sedentaryReminder, setSedentaryReminder] = useState(false);
  // The nudge stays configurable long; the timer reads it through a ref so
  // the interval effect never needs to re-register.
  const reminderSecondsRef = useRef(reminderSeconds);
  useEffect(() => {
    reminderSecondsRef.current = reminderSeconds;
  }, [reminderSeconds]);
  const [sedentaryAdded, setSedentaryAdded] = useState(0);
  const [sedentaryError, setSedentaryError] = useState("");
  // A just-logged break confirms itself on the capsule for a few seconds,
  // following the `now` tick like the water confirmation.
  const [sedentaryLoggedAt, setSedentaryLoggedAt] = useState(0);
  const sedentaryLogged = sedentaryAdded > 0 && now - sedentaryLoggedAt < 3_000;
  // The last recorded stand; persisted so an island reload does not pretend
  // the user just sat down.
  const [lastBreakAt, setLastBreakAt] = useState(() => Date.now());
  const lastBreakRef = useRef(lastBreakAt);
  // The local day the stored progress belongs to; null until it loads.
  const progressDayRef = useRef<string | null>(null);
  // Session start: the first nudge waits a full interval from here.
  const [sessionStart] = useState(() => Date.now());
  const lastReminderRef = useRef(sessionStart);
  const snoozedUntilRef = useRef<number | null>(null);
  useEffect(() => {
    sedentaryRef.current = sedentary;
  }, [sedentary]);
  useEffect(() => {
    lastBreakRef.current = lastBreakAt;
  }, [lastBreakAt]);
  useEffect(() => {
    let active = true;
    void Promise.all([loadSedentarySettings(), loadSedentaryProgress()]).then(
      ([stored, progress]) => {
        if (!active) return;
        sedentaryRef.current = stored;
        setSedentary(stored);
        lastBreakRef.current = progress.lastBreakAt;
        progressDayRef.current = progress.day;
        setLastBreakAt(progress.lastBreakAt);
        // A restored sitting streak may already be over the interval; the
        // first nudge still waits a full interval from this session.
        lastReminderRef.current = Math.max(Date.now(), progress.lastBreakAt);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("sedentary-changed", ({ payload }) => {
      const next = parseSedentarySettings(payload);
      if (next && active) {
        sedentaryRef.current = next;
        setSedentary(next);
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
      const settings = sedentaryRef.current;
      if (!settings.enabled) return;
      // Past local midnight the sitting clock restarts; nobody sat through
      // the whole night in front of the same reload.
      const today = localDay(Date.now());
      const known = progressDayRef.current;
      if (known === null) {
        progressDayRef.current = today;
      } else if (known !== today) {
        progressDayRef.current = today;
        const fresh = Date.now();
        lastBreakRef.current = fresh;
        setLastBreakAt(fresh);
        void saveSedentaryProgress({ day: today, lastBreakAt: fresh });
        return;
      }
      const hour = new Date().getHours();
      if (hour < settings.activeStart || hour >= settings.activeEnd) return;
      const current = Date.now();
      if (
        current - lastBreakRef.current < settings.reminderMinutes * 60_000 ||
        current <
          nextReminderAt(
            lastReminderRef.current,
            settings.reminderMinutes,
            snoozedUntilRef.current,
          )
      ) {
        return;
      }
      lastReminderRef.current = current;
      snoozedUntilRef.current = null;
      setSedentaryReminder(true);
    };
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!sedentaryReminder) return;
    const id = window.setTimeout(
      () => setSedentaryReminder(false),
      Math.max(3, reminderSecondsRef.current) * 1000,
    );
    return () => window.clearTimeout(id);
  }, [sedentaryReminder]);
  async function standNow() {
    setSedentaryError("");
    try {
      await recordStand();
      const at = Date.now();
      lastBreakRef.current = at;
      progressDayRef.current = localDay(at);
      setLastBreakAt(at);
      lastReminderRef.current = at;
      snoozedUntilRef.current = null;
      setSedentaryReminder(false);
      setSedentaryAdded((count) => count + 1);
      setSedentaryLoggedAt(at);
      void saveSedentaryProgress({ day: localDay(at), lastBreakAt: at });
    } catch (error) {
      setSedentaryError(String(error));
    }
  }
  function snoozeSedentary() {
    snoozedUntilRef.current = Date.now() + REMINDER_SNOOZE_MS;
    setSedentaryReminder(false);
  }
  // The idle widget mirrors the reminder rules: minutes since the last break,
  // with an `over` flag once the interval has elapsed. `reached` only drives
  // the widget's display (a calm goal-met state); the nudges keep running.
  function sedentaryWidgetState(): {
    minutes: number;
    over: boolean;
    reached: boolean;
  } | null {
    if (!sedentaryRef.current.enabled) return null;
    const minutes = sittingMinutes(lastBreakRef.current, now);
    return {
      minutes,
      over: minutes >= sedentaryRef.current.reminderMinutes,
      reached: todayBreaks >= sedentaryRef.current.goalBreaks,
    };
  }
  return {
    sedentary,
    lastBreakAt,
    sedentaryReminder,
    setSedentaryReminder,
    sedentaryAdded,
    sedentaryLogged,
    sedentaryError,
    setSedentaryError,
    standNow,
    snoozeSedentary,
    sedentaryWidgetState,
  };
}
