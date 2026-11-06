import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  extendTimer,
  formatRemaining,
  pauseTimer,
  remainingMilliseconds,
  resumeTimer,
  restorePersistedTimer,
  type PersistedTimer,
  type TimerMode,
  type TimerState,
} from "../../domain/timer";
import {
  defaultCountdowns,
  type CountdownItem,
  type CountdownSettings,
} from "../../domain/countdown";
import {
  loadCountdowns,
  loadPersistedTimer,
  savePersistedTimer,
} from "../../services/countdownRepository";
import {
  completeFocus,
  defaultPomodoroSettings,
  emptyProgress,
  parsePomodoroSettings,
  startFocusCycle,
  type PomodoroProgress,
  type PomodoroSettings,
} from "../../domain/pomodoro";
import {
  loadPomodoroProgress,
  loadPomodoroSettings,
  savePomodoroProgress,
} from "../../services/pomodoroRepository";
import { recordPomodoro } from "../../services/waterRepository";
import { t } from "../../services/i18n";

/**
 * Everything behind the island's timer page: manual timers, pomodoro cycles
 * and named countdowns, including persistence across restarts and the shared
 * `now` beat the header clock and idle widgets read.
 */
export function useIslandTimer() {
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [durationError, setDurationError] = useState("");
  const [lastDuration, setLastDuration] = useState(0);
  const [timerMode, setTimerMode] = useState<TimerMode>("focus");
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [countdowns, setCountdowns] =
    useState<CountdownSettings>(defaultCountdowns);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [countdownId, setCountdownId] = useState<string | null>(null);
  const [pomodoro, setPomodoro] = useState<PomodoroSettings>(
    defaultPomodoroSettings,
  );
  const [pomodoroProgress, setPomodoroProgress] = useState<PomodoroProgress>(
    () => emptyProgress(Date.now()),
  );
  const pomodoroRef = useRef(pomodoro);
  const progressRef = useRef(pomodoroProgress);
  const timerModeRef = useRef(timerMode);
  const restoredTimerRef = useRef(false);
  const finishCountedRef = useRef(false);
  const [customTimerOpen, setCustomTimerOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    pomodoroRef.current = pomodoro;
  }, [pomodoro]);
  useEffect(() => {
    progressRef.current = pomodoroProgress;
  }, [pomodoroProgress]);
  useEffect(() => {
    timerModeRef.current = timerMode;
  }, [timerMode]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [settings, progress] = await Promise.all([
        loadPomodoroSettings(),
        loadPomodoroProgress(),
      ]);
      if (!active) return;
      pomodoroRef.current = settings;
      progressRef.current = progress;
      setPomodoro(settings);
      setPomodoroProgress(progress);
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("pomodoro-changed", ({ payload }) => {
      const next = parsePomodoroSettings(payload);
      if (next && active) {
        pomodoroRef.current = next;
        setPomodoro(next);
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
    if (timer.status !== "running") return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= timer.endsAt) {
        if (!finishCountedRef.current) {
          finishCountedRef.current = true;
          if (timerModeRef.current === "focus") {
            const next = completeFocus(progressRef.current, current);
            progressRef.current = next;
            setPomodoroProgress(next);
            void savePomodoroProgress(next).catch(() => {});
            void recordPomodoro(
              pomodoroRef.current.focusMinutes,
              current,
            ).catch(() => {});
          }
        }
        setTimer({ status: "finished" });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timer]);
  // The header clock and the idle water countdown both need a live beat, so
  // this keeps ticking while the panel is collapsed too.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => {
      void loadCountdowns().then((next) => {
        if (active) setCountdowns(next);
      });
    };
    load();
    let unlisten: (() => void) | undefined;
    void listen("countdowns-changed", load)
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
    let active = true;
    void (async () => {
      const stored = await loadPersistedTimer();
      if (!active) return;
      if (stored) {
        const current = Date.now();
        const { state } = restorePersistedTimer(stored, current);
        setNow(current);
        setTimerMode(stored.mode);
        setLastDuration(stored.durationMs);
        setCountdownLabel(stored.label);
        setCountdownId(stored.countdownId);
        setTimer(state);
      }
      restoredTimerRef.current = true;
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!restoredTimerRef.current) return;
    const snapshot: PersistedTimer | null =
      timer.status === "idle"
        ? null
        : {
            version: 1,
            kind:
              timerMode === "countdown"
                ? "countdown"
                : timerMode === "timer"
                  ? "timer"
                  : "pomodoro",
            mode: timerMode,
            durationMs: Math.max(
              1000,
              lastDuration || remainingMilliseconds(timer, Date.now()),
            ),
            label: countdownLabel,
            countdownId,
            state: timer,
          };
    if (snapshot?.kind === "countdown" && !snapshot.countdownId) return;
    void savePersistedTimer(snapshot).catch(() => {});
  }, [timer, timerMode, lastDuration, countdownLabel, countdownId]);
  function startTimer(durationMs: number, current: number) {
    setNow(current);
    setLastDuration(durationMs);
    setDurationError("");
    finishCountedRef.current = false;
    setTimer({ status: "running", endsAt: current + durationMs });
  }
  /** A manual timer has no name and no countdown bookkeeping. */
  function startManualTimer(durationMs: number) {
    setTimerMode("timer");
    setCountdownLabel(null);
    setCountdownId(null);
    startTimer(durationMs, Date.now());
  }
  function resetTimer() {
    setTimer({ status: "idle" });
    setTimerMode("focus");
    setCountdownLabel(null);
    setCountdownId(null);
    setDurationError("");
  }
  function saveProgress(next: PomodoroProgress) {
    progressRef.current = next;
    setPomodoroProgress(next);
    void savePomodoroProgress(next).catch(() => {});
  }
  function beginFocus(durationMs: number) {
    const now = Date.now();
    const next = startFocusCycle(progressRef.current, pomodoroRef.current, now);
    if (next !== progressRef.current) saveProgress(next);
    setTimerMode("focus");
    setCountdownLabel(null);
    setCountdownId(null);
    startTimer(durationMs, now);
  }
  function beginBreak(kind: "break" | "longBreak") {
    setTimerMode(kind);
    setCountdownLabel(null);
    setCountdownId(null);
    startTimer(
      (kind === "longBreak"
        ? pomodoroRef.current.longBreakMinutes
        : pomodoroRef.current.shortBreakMinutes) * 60_000,
      Date.now(),
    );
  }
  function startCountdown(item: CountdownItem) {
    if (item.kind !== "duration" || !item.durationSeconds) return;
    setTimerMode("countdown");
    setCountdownLabel(item.label);
    setCountdownId(item.id);
    setCountdownOpen(false);
    setCustomTimerOpen(false);
    startTimer(item.durationSeconds * 1000, Date.now());
  }
  function presetMilliseconds() {
    if (timerMode === "focus") return pomodoro.focusMinutes * 60_000;
    if (timerMode === "break") return pomodoro.shortBreakMinutes * 60_000;
    if (timerMode === "longBreak") return pomodoro.longBreakMinutes * 60_000;
    return 0;
  }
  function pauseOrResumeTimer() {
    const current = Date.now();
    setNow(current);
    setTimer((state) =>
      state.status === "running"
        ? pauseTimer(state, current)
        : resumeTimer(state, current),
    );
  }
  function extendOneMinute() {
    setTimer((current) => extendTimer(current, 60_000));
    setLastDuration((current) => current + 60_000);
  }
  const isPomodoroMode =
    timerMode === "focus" || timerMode === "break" || timerMode === "longBreak";
  function timerModeLabel(): string {
    if (timerMode === "focus") return t("专注");
    if (timerMode === "break") return t("短休");
    if (timerMode === "longBreak") return t("长休");
    if (timerMode === "countdown") return countdownLabel || t("倒计时");
    return t("计时器");
  }
  const durationCountdowns = countdowns.items.filter(
    (item) => item.kind === "duration",
  );
  const remaining = formatRemaining(remainingMilliseconds(timer, now));
  return {
    timer,
    minutes,
    setMinutes,
    seconds,
    setSeconds,
    durationError,
    setDurationError,
    lastDuration,
    timerMode,
    countdownOpen,
    setCountdownOpen,
    countdowns,
    countdownId,
    pomodoro,
    pomodoroProgress,
    customTimerOpen,
    setCustomTimerOpen,
    now,
    isPomodoroMode,
    timerModeLabel,
    durationCountdowns,
    remaining,
    startTimer,
    startManualTimer,
    resetTimer,
    beginFocus,
    beginBreak,
    startCountdown,
    presetMilliseconds,
    pauseOrResumeTimer,
    extendOneMinute,
  };
}
