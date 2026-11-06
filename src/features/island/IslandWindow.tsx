import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Music2,
  Power,
  Settings2,
  Timer,
  Mail,
  Captions,
  CaptionsOff,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Hourglass,
  RefreshCw,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import { defaultAppearance, parseAppearance } from "../../domain/settings";
import { loadAppearance } from "../../services/settingsRepository";
import { isLargeDisplay, watchDisplayTier } from "../../services/display";
import { IdleWidgets } from "./IdleWidgets";
import type { IdleData, IdleWaterTimer } from "./idleWidgetData";
import {
  formatRemaining,
  extendTimer,
  parseDuration,
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
  formatDurationSeconds,
  targetRemainingMilliseconds,
  type CountdownItem,
  type CountdownSettings,
} from "../../domain/countdown";
import {
  loadCountdowns,
  loadPersistedTimer,
  savePersistedTimer,
} from "../../services/countdownRepository";
import "../../styles/index.css";
import { selectIslandDisplay } from "../../domain/islandDisplay";
import { useSystemNotice } from "./useSystemNotice";
import { useAudioDevices } from "./useAudioDevices";
import { useIslandMedia } from "./useIslandMedia";
import { ReminderBeam } from "./ReminderBeam";
import { WaterPage } from "./WaterPage";
import { QuotaPage } from "./QuotaPage";
import { MailPage } from "./MailPage";
import { MusicPage } from "./MusicPage";
import { DevicePage } from "./DevicePage";
import { DEVICE_HINT_HEIGHT, deviceLayout } from "./deviceLayout";
import { formatMediaTime } from "./islandFormat";
import { ISLAND_PAGES, type IslandTab } from "./islandPages";
import { IslandPageIcon, MediaWave, NoticeIcon } from "./IslandParts";
import { useMail } from "../mail/useMail";
import { useAiQuota } from "../ai/useAiQuota";
import { QuotaRings } from "../ai/QuotaRings";
import { quotaRings } from "../../domain/aiQuota";
import {
  completeFocus,
  defaultPomodoroSettings,
  emptyProgress,
  isLongBreakDue,
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
import {
  defaultWaterSettings,
  parseWaterSettings,
  waterCups,
  waterPercent,
  waterTone,
  waterToneColors,
  type WaterSettings,
} from "../../domain/water";
import {
  addWater,
  loadWaterSettings,
  recordPomodoro,
} from "../../services/waterRepository";
import { useDailyStats } from "../stats/useDailyStats";
import { focusStreak } from "../../domain/dailyStats";
import { setLanguage, t } from "../../services/i18n";
import pomodoroClock from "../../assets/pomodoro-clock.png";
import waterDrop from "../../assets/water-drop.webp";

/** The media capsule shows one of these next to the track, picked at random. */
type MediaBadge = "pomodoro" | "water" | "quota";

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

export function IslandWindow() {
  const { notice, system, devices } = useSystemNotice();
  const ai = useAiQuota();
  const reloadAiQuota = ai.reload;
  const pinnedAi = ai.accounts.find((account) => account.pinned);
  const pinnedAiResult = pinnedAi ? ai.results[pinnedAi.id] : undefined;
  const [selectedAiId, setSelectedAiId] = useState("");
  const selectedAi =
    ai.accounts.find((account) => account.id === selectedAiId) ??
    pinnedAi ??
    ai.accounts[0];
  const selectedAiResult = selectedAi ? ai.results[selectedAi.id] : undefined;
  const selectedItems = selectedAiResult?.quota?.items ?? [];
  const selectedRings = quotaRings(selectedItems);
  const {
    recent: recentMail,
    highlight: mailHighlight,
    dismissHighlight,
  } = useMail();
  const [copyStatus, setCopyStatus] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [mailIndex, setMailIndex] = useState(0);
  const selectedMail = recentMail[Math.min(mailIndex, recentMail.length - 1)];
  const capsuleMail = recentMail[0];
  const capsuleCopied =
    !!capsuleMail?.code &&
    copyStatus?.code === capsuleMail.code &&
    copyStatus.message === t("已复制");
  const mailKey = capsuleMail
    ? `${capsuleMail.accountId}|${capsuleMail.subject}|${capsuleMail.code ?? ""}`
    : "";
  const currentCopyStatus =
    selectedMail?.code === copyStatus?.code ? copyStatus?.message : "";
  const [appearance, setAppearance] = useState(defaultAppearance);
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
  const [largeDisplay, setLargeDisplay] = useState(isLargeDisplay);
  const [idleWidth, setIdleWidth] = useState<number | null>(null);
  useEffect(() => watchDisplayTier(setLargeDisplay), []);
  const [transitioning, setTransitioning] = useState(false);
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
  const dailyStats = useDailyStats(30);
  const [water, setWater] = useState<WaterSettings>(defaultWaterSettings);
  const waterRef = useRef(water);
  const [waterReminder, setWaterReminder] = useState(false);
  const [waterAdded, setWaterAdded] = useState(0);
  const [waterAddedMl, setWaterAddedMl] = useState(0);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [customWaterMl, setCustomWaterMl] = useState("300");
  const [waterError, setWaterError] = useState("");
  const lastReminderRef = useRef(Date.now());
  const todayStat = dailyStats.stats.find(
    (stat) => stat.day === dailyStats.today,
  );
  const todayWater = todayStat?.waterMl ?? 0;
  const todayPomodoros =
    todayStat?.pomodoros ?? pomodoroProgress.completedToday;
  const todayFocusMinutes = Math.floor((todayStat?.focusSeconds ?? 0) / 60);
  const focusDays = focusStreak(dailyStats.stats, dailyStats.today);
  const waterTodayRef = useRef(todayWater);
  const [now, setNow] = useState(() => Date.now());
  const mediaState = useIslandMedia();
  const { media, mediaKey, artwork, mediaPosition, currentLyric } = mediaState;
  const [mediaBadge, setMediaBadge] = useState<MediaBadge>("quota");
  const [activeTab, setActiveTab] = useState<IslandTab>("timer");
  const deviceState = useAudioDevices(expanded && activeTab === "device");
  function selectPage(tab: IslandTab) {
    setActiveTab(tab);
    ignoreLeaveUntil.current = Date.now() + 400;
    if (tab === "mail") {
      setMailIndex(0);
      setCopyStatus(null);
    }
  }
  function cyclePage(direction: 1 | -1) {
    const index = ISLAND_PAGES.findIndex((page) => page.id === activeTab);
    const next =
      (index + direction + ISLAND_PAGES.length) % ISLAND_PAGES.length;
    selectPage(ISLAND_PAGES[next].id);
  }
  const lastPageWheel = useRef(0);
  function handlePageWheel(event: React.WheelEvent) {
    if (!expanded) return;
    const target = event.target as HTMLElement;
    // Sliders and text fields keep their own wheel behaviour.
    if (target.closest("input, textarea, select")) return;
    if (Math.abs(event.deltaY) < 6) return;
    const now = Date.now();
    if (now - lastPageWheel.current < 260) return;
    lastPageWheel.current = now;
    cyclePage(event.deltaY > 0 ? 1 : -1);
  }
  // Opening the quota page pulls fresh numbers instead of showing up to two
  // minutes of stale data.
  useEffect(() => {
    if (expanded && activeTab === "ai") void reloadAiQuota();
  }, [expanded, activeTab, reloadAiQuota]);
  const [customTimerOpen, setCustomTimerOpen] = useState(false);
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
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    let receivedUpdate = false;
    async function start() {
      try {
        const dispose = await listen<unknown>(
          "appearance-changed",
          ({ payload }) => {
            try {
              const next = parseAppearance(payload);
              receivedUpdate = true;
              if (active) {
                // Sync the string table before the render this triggers, so
                // t() calls already see the new language.
                setLanguage(next.language);
                setAppearance(next);
                // Size changes go through the native window scale; the value
                // saved at startup was already applied by the Rust setup.
                void invoke("apply_island_scale", { scale: next.scale }).catch(
                  () => {},
                );
              }
            } catch (error) {
              console.error("Invalid appearance update", error);
            }
          },
        );
        if (!active) {
          dispose();
          return;
        }
        unlisten = dispose;
        const stored = await loadAppearance();
        if (active && !receivedUpdate) {
          setLanguage(stored.language);
          setAppearance(stored);
        }
      } catch (error) {
        console.error("Unable to initialize island settings", error);
      }
    }
    void start();
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);
  const [error, setError] = useState("");
  // Failure banners are hints, not persistent states; a fresh error restarts
  // the window, and clearing it frees the capsule for the next message.
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 6_000);
    return () => window.clearTimeout(timeout);
  }, [error]);
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
    const delay = Math.max(
      appearance.autoCollapseSeconds * 1000,
      reminderHoldRemaining(),
    );
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
  async function run(command: string) {
    try {
      await invoke(command);
    } catch {
      setError(t("操作失败，请重试"));
    }
  }
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
    if (appearance.expandTrigger !== "hover") return;
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
  // Reminder capsules carry their own destination, so opening the panel from
  // one (by click or by hover) must land on that page instead of the last tab.
  function openReminderPage(acknowledge = true) {
    if (expanded) return;
    if (display === "mail") {
      setActiveTab("mail");
      setMailIndex(0);
      setCopyStatus(null);
      // A user opening the panel counts as handling the reminder; an
      // automatic expansion must keep it alive.
      if (acknowledge) dismissHighlight();
    } else if (display === "water") {
      setActiveTab("water");
    } else if (display === "finished") {
      setActiveTab("timer");
    }
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
    if (!expanded || appearance.expandTrigger !== "hover") return;
    const id = window.setTimeout(() => {
      if (!panel.current?.matches(":hover")) scheduleCollapseRef.current?.();
    }, 450);
    return () => window.clearTimeout(id);
  }, [expanded, appearance.expandTrigger]);

  async function toggleExpanded() {
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
        await invoke("set_island_expanded", { expanded: false });
      } else {
        await invoke("set_island_expanded", { expanded: true });
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
      setError(t("窗口调整失败，请重试"));
    } finally {
      setTransitioning(false);
    }
  }
  function startTimer(durationMs: number, current: number) {
    setNow(current);
    setLastDuration(durationMs);
    setDurationError("");
    finishCountedRef.current = false;
    setTimer({ status: "running", endsAt: current + durationMs });
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
      date.toLocaleTimeString(appearance.language, {
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
  const display = selectIslandDisplay({
    timer: timer.status,
    mail: !!(mailHighlight && recentMail.length),
    notice: !!notice,
    water: waterReminder,
    // Paused media stays in the panel but gives the island back. When island
    // lyrics are off, music only appears through the idle music widget.
    media: !!(media?.title && media.playing && appearance.islandLyrics),
  });
  // Reminder-aware chrome: the capsule pops once when a reminder arrives and
  // keeps a colour-coded breathing ring until it is acknowledged.
  const alertKind =
    display === "finished"
      ? "timer"
      : display === "mail"
        ? "mail"
        : display === "water"
          ? "water"
          : display === "notice"
            ? "notice"
            : null;
  const alertToken = alertKind
    ? `${alertKind}:${alertKind === "mail" ? mailKey : ""}`
    : "";
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (!alertToken) return;
    // Flip the class on the next frame so the spring transition replays even
    // when two reminders arrive back to back.
    const frame = window.requestAnimationFrame(() => setPopping(true));
    const timer = window.setTimeout(() => setPopping(false), 220);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [alertToken]);
  useEffect(() => {
    if (!alertKind) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (alertKind === "timer") resetTimer();
      else if (alertKind === "mail") dismissHighlight();
      else if (alertKind === "water") setWaterReminder(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alertKind, dismissHighlight]);

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
    if (!alertToken || !appearance.reminderAutoExpand) return;
    if (autoExpandedRef.current === alertToken) return;
    if (!alertKind || alertKind === "notice") return;
    autoExpandedRef.current = alertToken;
    const current = reminderActions.current;
    if (current.expanded || current.transitioning) return;
    reminderHold.current = Date.now() + 20_000;
    current.open(false);
    void current.expand();
  }, [alertToken, alertKind, appearance.reminderAutoExpand]);
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
  const waterPercentToday = waterPercent(todayWater, water.goalMl);
  const waterCupsToday = waterCups(todayWater, water.cupMl);
  const waterToneValue = waterTone(todayWater, water.goalMl);
  const waterToneColor = waterToneColors[waterToneValue];
  // The mail capsule needs a little more room for the account line.
  // Only the capsule grows with the size setting; type stays the same.
  // Only real playback earns the music widget; the settings preview supplies
  // its own sample tracks when no data is passed.
  const idleMusic = media?.playing
    ? {
        title: media.title,
        artist: media.artist || t("未知艺术家"),
        artwork: artwork?.key === mediaKey ? artwork.src : null,
      }
    : null;
  const connectedBluetooth =
    devices?.bluetooth?.find((device) => device.battery !== null) ?? null;
  const islandCountdown =
    countdowns.items.find((item) => item.id === countdowns.islandId) ?? null;
  const idleCountdown = (() => {
    if (!islandCountdown) return null;
    if (islandCountdown.kind === "target") {
      const remaining = targetRemainingMilliseconds(islandCountdown, now);
      return {
        label: islandCountdown.label,
        remainingMs: remaining,
        reached: remaining <= 0,
      };
    }
    if (
      timerMode === "countdown" &&
      countdownId === islandCountdown.id &&
      timer.status !== "idle"
    ) {
      const remaining = remainingMilliseconds(timer, now);
      return {
        label: islandCountdown.label,
        remainingMs: remaining,
        reached: timer.status === "finished" || remaining <= 0,
      };
    }
    return null;
  })();
  const idleData: IdleData = {
    quota:
      pinnedAi && pinnedAiResult?.quota
        ? { provider: pinnedAi.provider, items: pinnedAiResult.quota.items }
        : null,
    water: { percent: waterPercentToday },
    pomodoros: todayPomodoros,
    music: idleMusic,
    battery:
      system?.battery != null
        ? { percent: system.battery, charging: !!system.charging }
        : null,
    focusMinutes: todayFocusMinutes,
    streak: focusDays,
    volume:
      system?.volume != null
        ? { percent: system.volume, muted: !!system.muted }
        : null,
    bluetooth:
      connectedBluetooth && connectedBluetooth.battery !== null
        ? { name: connectedBluetooth.name, battery: connectedBluetooth.battery }
        : null,
    waterTimer: waterTimerState(),
    countdown: idleCountdown,
    pomodoroCycle: {
      done: Math.min(pomodoroProgress.cycle, pomodoro.longBreakEvery),
      total: pomodoro.longBreakEvery,
    },
  };
  // The media capsule has one spare slot: cycle it at random between the
  // pomodoro cycle, today's water and the pinned quota ring.
  const mediaBadgePool: MediaBadge[] =
    idleData.quota && quotaRings(idleData.quota.items).length > 0
      ? ["pomodoro", "water", "quota"]
      : ["pomodoro", "water"];
  const mediaBadgeKey = mediaBadgePool.join(",");
  const mediaBadgeShown = mediaBadgePool.includes(mediaBadge)
    ? mediaBadge
    : mediaBadgePool[0];
  const pomodoroBadgePercent = Math.round(
    Math.min(1, pomodoroProgress.cycle / pomodoro.longBreakEvery) * 100,
  );
  const pomodoroBadgeColor =
    timerMode === "focus"
      ? "#ff7d6e"
      : timerMode === "break"
        ? "#79d6a3"
        : "#7fb8f2";
  useEffect(() => {
    if (display !== "media") return;
    const pool = mediaBadgeKey.split(",") as MediaBadge[];
    const timer = window.setInterval(() => {
      setMediaBadge((current) => {
        const next = pool.filter((item) => item !== current);
        return next[Math.floor(Math.random() * next.length)] ?? current;
      });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [display, mediaBadgeKey]);
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
  }, [appearance.scale]);
  // Idle capsules shrink to their measured content; a numeric width lets the
  // panel animate smoothly into the expanded layout. Resolution scaling is
  // applied natively (webview zoom), so these widths stay in base CSS pixels.
  const panelWidth = expanded
    ? 340
    : display === "idle"
      ? idleWidth === null
        ? "fit-content"
        : idleWidth + 2
      : largeDisplay
        ? 240
        : 232;
  // The banner lane adds 34px; the layout cap keeps the tallest panel inside
  // the 320px island viewport instead of clipping the pager.
  const deviceHasHint =
    deviceState.devices !== null &&
    (!!deviceState.feedback || deviceState.failed);
  const devicePanelHeight =
    deviceLayout(deviceState.devices).panelHeight +
    (deviceHasHint ? DEVICE_HINT_HEIGHT : 0);
  // A transient banner floats over the panel bottom; make room for it.
  const panelHasBanner = expanded && display === "notice" && !!notice;
  function toggleIslandLyrics() {
    const next = !appearance.islandLyrics;
    setAppearance((current) => ({ ...current, islandLyrics: next }));
    if (isTauri()) {
      void emitTo("main", "island-lyrics-changed", next).catch(() => {});
    }
  }
  async function copyCode(code: string, expiresAt: number) {
    if (Date.now() >= expiresAt) {
      setCopyStatus({ code, message: t("已过期") });
      return;
    }
    try {
      await invoke("copy_mail_code", { code });
      setCopyStatus({ code, message: t("已复制") });
      // Let the check mark land before the capsule returns to its normal state.
      window.setTimeout(dismissHighlight, 900);
    } catch {
      setCopyStatus({ code, message: t("复制失败") });
    }
  }
  // Copy feedback is transient; the button falls back to "复制".
  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  return (
    <div
      className={`desktop-island ${expanded ? "is-expanded" : ""} ${timer.status === "finished" ? "timer-finished" : ""}`}
      data-shape={appearance.expandedShape}
      data-page={expanded ? activeTab : undefined}
    >
      <ReminderBeam
        enabled={!!alertKind && appearance.reminderStyle === "beam"}
      >
        <div
          ref={panel}
          className={`island-panel ${display === "notice" ? "is-notice" : ""} ${panelHasBanner ? "has-banner" : ""} ${display === "water" ? `is-water-reminder tone-${waterToneValue}` : ""} ${popping && alertKind ? "is-popping" : ""}`}
          data-alert={alertKind ?? undefined}
          data-reminder={alertKind ? appearance.reminderStyle : undefined}
          style={
            {
              width: panelWidth,
              ...(alertKind === "water"
                ? { "--alert-color": waterToneColor }
                : {}),
              ...(expanded && activeTab === "device"
                ? { "--panel-h": `${devicePanelHeight}px` }
                : {}),
            } as CSSProperties
          }
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handlePanelLeave}
          onPointerDownCapture={releaseReminderHold}
          onFocusCapture={() => {
            releaseReminderHold();
            cancelAutoCollapse();
          }}
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              scheduleAutoCollapse();
          }}
        >
          {alertKind && appearance.reminderStyle !== "beam" && (
            <span className="island-alert-ring" aria-hidden="true" />
          )}
          <button
            className="island-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? t("收起灵动岛") : t("展开灵动岛")}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => {
              // A drag is not a click.
              if (dragMoved.current) {
                dragMoved.current = false;
                return;
              }
              cancelHoverExpand();
              openReminderPage();
              void toggleExpanded();
            }}
          >
            {expanded ? null : display === "notice" && notice ? (
              <span className="island-current system-notice" role="status">
                <NoticeIcon kind={notice.kind} />
                <span className="system-notice-label">{notice.label}</span>
                <strong>{notice.value}</strong>
              </span>
            ) : display === "water" ? (
              <span
                className={`island-current island-water-current ${waterToneValue === "low" ? "is-low" : ""}`}
                role="status"
              >
                <img
                  className="water-indicator water-drop-icon"
                  src={waterDrop}
                  alt=""
                  draggable={false}
                />
                <span className="compact-copy">
                  <span className="compact-primary">{t("该喝水了")}</span>
                  <span className="compact-secondary">
                    {todayWater} / {water.goalMl} ml ·{" "}
                    {waterCups(todayWater, water.cupMl)} {t("杯")}
                  </span>
                </span>
              </span>
            ) : display === "mail" && capsuleMail ? (
              <span
                key={mailKey}
                className={`island-current island-mail-current ${capsuleMail.code ? "has-code" : ""}`}
                role="status"
              >
                {/* Icon on the left; account above the code, both centered. */}
                <Mail
                  className={`island-mail-icon ${capsuleMail.code ? "" : "is-new"}`}
                  size={15}
                  aria-hidden="true"
                />
                <span className="compact-copy island-mail-copy">
                  <span className="island-mail-line">
                    <span className="island-mail-account">
                      {capsuleMail.account}
                    </span>
                  </span>
                  <span
                    className={`compact-primary ${capsuleMail.code ? "island-code" : "island-mail-title"}`}
                  >
                    {capsuleMail.code ? (
                      <>
                        <span className="island-code-digits" aria-hidden="true">
                          {[...capsuleMail.code].map((digit, index) => (
                            <span
                              key={index}
                              style={{ "--i": index } as CSSProperties}
                            >
                              {digit}
                            </span>
                          ))}
                        </span>
                        <span className="sr-only">{capsuleMail.code}</span>
                      </>
                    ) : (
                      capsuleMail.subject || t("新邮件")
                    )}
                  </span>
                </span>
              </span>
            ) : display === "timer" || display === "finished" ? (
              <span className="island-current compact-timer timer-only">
                {isPomodoroMode ? (
                  <img
                    className="timer-indicator tomato-photo"
                    src={pomodoroClock}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <Timer
                    className="timer-indicator"
                    size={15}
                    aria-hidden="true"
                  />
                )}
                <span className="compact-copy">
                  <span className="compact-primary">
                    {timerModeLabel()} ·{" "}
                    {t(
                      timer.status === "paused"
                        ? "已暂停"
                        : timer.status === "finished"
                          ? "已结束 · 按 Esc 关闭"
                          : "进行中",
                    )}
                  </span>
                </span>
                <span className={`island-timer-value mode-${timerMode}`}>
                  {timer.status === "finished" ? t("时间到") : remaining}
                </span>
              </span>
            ) : display === "media" && media?.title ? (
              <span className="island-current island-media-current">
                <span
                  className={`compact-art ${media.playing && artwork?.key === mediaKey && artwork.src ? "is-spinning" : ""}`}
                >
                  {artwork?.key === mediaKey && artwork.src ? (
                    <img src={artwork.src} alt="" />
                  ) : (
                    <Music2 size={14} aria-hidden="true" />
                  )}
                </span>
                <span className="compact-copy">
                  <span className="compact-primary">{media.title}</span>
                  <span className="compact-secondary">
                    {appearance.islandLyrics && currentLyric
                      ? currentLyric
                      : media.artist || t("未知艺术家")}
                  </span>
                </span>
                <span className="media-playing-mark">
                  <MediaWave playing={media.playing} compact />
                  {mediaPosition !== null && (
                    <span className="media-time">
                      {formatMediaTime(mediaPosition)}
                    </span>
                  )}
                  <span className="media-mark-slot" key={mediaBadgeShown}>
                    {mediaBadgeShown === "quota" && idleData.quota ? (
                      <QuotaRings
                        items={idleData.quota.items}
                        compact
                        provider={idleData.quota.provider}
                      />
                    ) : mediaBadgeShown === "water" ? (
                      <span
                        className="media-badge"
                        role="img"
                        aria-label={`${t("喝水进度")} ${waterPercentToday}%`}
                        title={`${t("喝水进度")} ${waterPercentToday}%`}
                        style={
                          {
                            "--badge-percent": `${waterPercentToday}%`,
                            "--badge-color": waterToneColor,
                          } as CSSProperties
                        }
                      >
                        <img src={waterDrop} alt="" />
                      </span>
                    ) : (
                      <span
                        className="media-badge"
                        role="img"
                        aria-label={`${t("番茄进度")} ${pomodoroBadgePercent}%`}
                        title={`${t("番茄进度")} ${pomodoroBadgePercent}%`}
                        style={
                          {
                            "--badge-percent": `${pomodoroBadgePercent}%`,
                            "--badge-color": pomodoroBadgeColor,
                          } as CSSProperties
                        }
                      >
                        <img src={pomodoroClock} alt="" />
                      </span>
                    )}
                  </span>
                </span>
              </span>
            ) : (
              <IdleWidgets
                key={appearance.idleWidgets.join(",")}
                appearance={appearance}
                data={idleData}
                onWidthChange={setIdleWidth}
              />
            )}
          </button>
          {!expanded && display === "water" && (
            <button
              className={`island-copy island-water-add ${waterToneValue === "low" ? "is-low" : ""}`}
              aria-label={t("喝一杯")}
              title={`${t("喝一杯")}（${water.cupMl} ml）`}
              onClick={() => void drinkWater(water.cupMl)}
            >
              <img
                className="water-drop-sm"
                src={waterDrop}
                alt=""
                draggable={false}
              />
            </button>
          )}
          {!expanded && display === "mail" && capsuleMail?.code && (
            <button
              className={`island-copy has-label ${capsuleCopied ? "is-copied" : ""}`}
              aria-label={capsuleCopied ? t("已复制") : t("复制验证码")}
              title={capsuleCopied ? t("已复制") : t("复制验证码")}
              onClick={() =>
                void copyCode(capsuleMail.code!, capsuleMail.expiresAt)
              }
            >
              {capsuleCopied ? <Check size={12} /> : <Copy size={12} />}
              <span>{capsuleCopied ? t("已复制") : t("复制")}</span>
            </button>
          )}
          {!expanded && display === "mail" && capsuleMail && (
            <span
              key={`ring-${mailKey}`}
              className="island-mail-ring"
              aria-hidden="true"
            />
          )}
          {expanded && display === "notice" && notice && (
            <div className="system-notice-banner" role="status">
              <NoticeIcon kind={notice.kind} />
              <span>{notice.label}</span>
              <strong>{notice.value}</strong>
            </div>
          )}
          <div
            className="island-details"
            aria-hidden={!expanded}
            inert={!expanded}
            onWheel={handlePageWheel}
          >
            <div
              className="island-head"
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className={`island-page-title is-${activeTab}`}>
                {t(
                  ISLAND_PAGES.find((page) => page.id === activeTab)?.label ??
                    "计时器",
                )}
              </span>
              <span className="island-head-clock">
                {appearance.language === "en-US"
                  ? new Date(now).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      weekday: "short",
                    })
                  : `${new Date(now).getMonth() + 1}月${new Date(now).getDate()}日 ${new Date(now).toLocaleDateString("zh-CN", { weekday: "short" })}`}{" "}
                {new Date(now).toLocaleTimeString(appearance.language, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <div className="island-actions">
                {activeTab === "music" && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={appearance.islandLyrics}
                    aria-label={t("岛上显示歌词")}
                    title={
                      appearance.islandLyrics
                        ? t("关闭岛上歌词")
                        : t("开启岛上歌词")
                    }
                    className={appearance.islandLyrics ? "is-on" : ""}
                    onClick={toggleIslandLyrics}
                  >
                    {appearance.islandLyrics ? (
                      <Captions size={15} aria-hidden="true" />
                    ) : (
                      <CaptionsOff size={15} aria-hidden="true" />
                    )}
                  </button>
                )}
                {activeTab === "ai" && (
                  <button
                    aria-label={t("刷新额度")}
                    title={t("刷新额度")}
                    onClick={() => void ai.reload()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                )}
                {activeTab === "device" && (
                  <button
                    aria-label={t("刷新设备")}
                    title={t("刷新设备")}
                    onClick={() => void deviceState.refresh()}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                )}
                {/* Without auto-collapse or hover mode this is the only way out
                  of the expanded panel, so it stays for that case. */}
                {appearance.expandTrigger !== "hover" &&
                  appearance.autoCollapseSeconds === 0 && (
                    <button
                      aria-label={t("收起灵动岛")}
                      title={t("收起灵动岛")}
                      onClick={() => void toggleExpanded()}
                    >
                      <ChevronUp size={15} aria-hidden="true" />
                    </button>
                  )}
                <button
                  aria-label={t("打开设置")}
                  title={t("打开设置")}
                  onClick={() => void run("open_settings")}
                >
                  <Settings2 size={15} aria-hidden="true" />
                </button>
                <button
                  aria-label={t("退出应用")}
                  title={t("退出应用")}
                  onClick={() => void run("quit_app")}
                >
                  <Power size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="island-page" key={activeTab}>
              {activeTab === "water" ? (
                <WaterPage
                  water={water}
                  waterPercentToday={waterPercentToday}
                  waterToneValue={waterToneValue}
                  waterToneColor={waterToneColor}
                  waterAdded={waterAdded}
                  waterAddedMl={waterAddedMl}
                  todayWater={todayWater}
                  waterCupsToday={waterCupsToday}
                  customWaterOpen={customWaterOpen}
                  setCustomWaterOpen={setCustomWaterOpen}
                  customWaterMl={customWaterMl}
                  setCustomWaterMl={setCustomWaterMl}
                  waterError={waterError}
                  setWaterError={setWaterError}
                  drinkWater={drinkWater}
                />
              ) : activeTab === "ai" ? (
                <QuotaPage
                  accounts={ai.accounts}
                  selectedAi={selectedAi}
                  selectedAiResult={selectedAiResult}
                  selectedItems={selectedItems}
                  selectedRings={selectedRings}
                  setSelectedAiId={setSelectedAiId}
                  language={appearance.language}
                />
              ) : activeTab === "mail" ? (
                <MailPage
                  selectedMail={selectedMail}
                  recentMail={recentMail}
                  mailIndex={mailIndex}
                  setMailIndex={setMailIndex}
                  currentCopyStatus={currentCopyStatus}
                  setCopyStatus={setCopyStatus}
                  copyCode={copyCode}
                />
              ) : activeTab === "music" ? (
                <MusicPage mediaState={mediaState} />
              ) : activeTab === "device" ? (
                <DevicePage deviceState={deviceState} />
              ) : countdownOpen ? (
                <div className="countdown-picker">
                  {durationCountdowns.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      className="countdown-row"
                      onClick={() => startCountdown(item)}
                    >
                      <span>{item.label}</span>
                      <span className="countdown-row-value">
                        {formatDurationSeconds(item.durationSeconds ?? 0)}
                      </span>
                    </button>
                  ))}
                  {durationCountdowns.length === 0 && (
                    <span className="countdown-empty">
                      {t("设置里还没有时长倒计时")}
                    </span>
                  )}
                  <div className="countdown-picker-actions">
                    <button
                      onClick={() => {
                        setCountdownOpen(false);
                        setCustomTimerOpen(true);
                      }}
                    >
                      {t("临时倒计时")}
                    </button>
                    <button onClick={() => setCountdownOpen(false)}>
                      {t("返回")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="timer-view">
                  <div className="timer-status">
                    <span>{timerModeLabel()}</span>
                    <i aria-hidden="true" />
                    <span>
                      {t(
                        timer.status === "finished"
                          ? "已结束 · 按 Esc 关闭"
                          : timer.status === "paused"
                            ? "已暂停"
                            : timer.status === "running"
                              ? "进行中"
                              : "选择时长",
                      )}
                    </span>
                  </div>
                  <div className="timer-main">
                    {isPomodoroMode && (
                      <img
                        className="pomodoro-face"
                        src={pomodoroClock}
                        alt=""
                        draggable={false}
                      />
                    )}
                    <div
                      className={`timer-clock is-${timer.status} mode-${timerMode}`}
                    >
                      {timer.status === "finished"
                        ? t("时间到")
                        : timer.status === "idle"
                          ? formatRemaining(
                              customTimerOpen
                                ? (parseDuration(minutes, seconds) ?? 0)
                                : presetMilliseconds() ||
                                    (parseDuration(minutes, seconds) ?? 0),
                            )
                          : remaining}
                    </div>
                  </div>
                  {isPomodoroMode && (
                    <div className="timer-pomodoro">
                      <span
                        className="pomodoro-tomatoes"
                        role="img"
                        aria-label={`${t("本轮")} ${Math.min(
                          pomodoroProgress.cycle,
                          pomodoro.longBreakEvery,
                        )}/${pomodoro.longBreakEvery}`}
                      >
                        {Array.from(
                          { length: pomodoro.longBreakEvery },
                          (_, index) =>
                            index <
                            Math.min(
                              pomodoroProgress.cycle,
                              pomodoro.longBreakEvery,
                            ) ? (
                              <img
                                key={index}
                                className="pomodoro-tomato"
                                src={pomodoroClock}
                                alt=""
                                draggable={false}
                              />
                            ) : (
                              <img
                                key={index}
                                className="pomodoro-tomato is-off"
                                src={pomodoroClock}
                                alt=""
                                draggable={false}
                              />
                            ),
                        )}
                      </span>
                      <i aria-hidden="true" />
                      <span>
                        {t("今日")} {pomodoroProgress.completedToday}{" "}
                        {t("个番茄")}
                      </span>
                    </div>
                  )}
                  {timer.status === "idle" ? (
                    <>
                      {customTimerOpen ? (
                        <form
                          className="custom-timer"
                          noValidate
                          onSubmit={(event) => {
                            event.preventDefault();
                            const duration = parseDuration(minutes, seconds);
                            if (duration === null) {
                              setDurationError(
                                t("请输入有效时间（秒数为 0–59）"),
                              );
                              return;
                            }
                            setTimerMode("timer");
                            setCountdownLabel(null);
                            setCountdownId(null);
                            startTimer(duration, Date.now());
                            setCustomTimerOpen(false);
                          }}
                        >
                          <label>
                            <input
                              aria-label={t("分钟")}
                              inputMode="numeric"
                              placeholder="00"
                              value={minutes}
                              maxLength={3}
                              onChange={(event) => {
                                setMinutes(event.target.value);
                                setDurationError("");
                              }}
                            />
                            <span>{t("分")}</span>
                          </label>
                          <span className="time-separator">:</span>
                          <label>
                            <input
                              aria-label={t("秒")}
                              inputMode="numeric"
                              placeholder="00"
                              value={seconds}
                              maxLength={2}
                              onChange={(event) => {
                                setSeconds(event.target.value);
                                setDurationError("");
                              }}
                            />
                            <span>{t("秒")}</span>
                          </label>
                          <button type="submit">{t("开始")}</button>
                          <button
                            type="button"
                            className="is-ghost"
                            onClick={() => setCustomTimerOpen(false)}
                          >
                            {t("返回")}
                          </button>
                        </form>
                      ) : (
                        <div className="timer-presets">
                          <button
                            className="timer-preset"
                            onClick={() => {
                              beginFocus(pomodoro.focusMinutes * 60_000);
                              setCustomTimerOpen(false);
                            }}
                          >
                            <span className="timer-preset-label">
                              {t("专注")}
                            </span>
                            <span className="timer-preset-value">
                              {pomodoro.focusMinutes} {t("分")}
                            </span>
                          </button>
                          <button
                            className="timer-preset"
                            onClick={() => {
                              beginBreak("break");
                              setCustomTimerOpen(false);
                            }}
                          >
                            <span className="timer-preset-label">
                              {t("短休")}
                            </span>
                            <span className="timer-preset-value">
                              {pomodoro.shortBreakMinutes} {t("分")}
                            </span>
                          </button>
                          <button
                            className="timer-preset"
                            onClick={() => {
                              beginBreak("longBreak");
                              setCustomTimerOpen(false);
                            }}
                          >
                            <span className="timer-preset-label">
                              {t("长休")}
                            </span>
                            <span className="timer-preset-value">
                              {pomodoro.longBreakMinutes} {t("分")}
                            </span>
                          </button>
                          <button
                            className="timer-preset is-ghost"
                            onClick={() => {
                              setCustomTimerOpen(false);
                              setCountdownOpen(true);
                            }}
                          >
                            <span className="timer-preset-label">
                              {t("倒计时")}
                            </span>
                            <Hourglass
                              className="timer-preset-icon"
                              size={13}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      )}
                      {durationError && (
                        <span className="duration-error" role="alert">
                          {durationError}
                        </span>
                      )}
                    </>
                  ) : timer.status === "finished" ? (
                    <div className="timer-controls">
                      <button onClick={resetTimer}>{t("知道了")}</button>
                      <button
                        onClick={() =>
                          timerMode === "focus"
                            ? beginFocus(lastDuration)
                            : startTimer(lastDuration, Date.now())
                        }
                      >
                        {t("再计一次")}
                      </button>
                      {timerMode === "focus" ? (
                        <button
                          onClick={() =>
                            beginBreak(
                              isLongBreakDue(pomodoroProgress.cycle, pomodoro)
                                ? "longBreak"
                                : "break",
                            )
                          }
                        >
                          {isLongBreakDue(pomodoroProgress.cycle, pomodoro)
                            ? t("开始长休")
                            : t("开始短休")}
                        </button>
                      ) : timerMode === "break" || timerMode === "longBreak" ? (
                        <button
                          onClick={() =>
                            beginFocus(pomodoro.focusMinutes * 60_000)
                          }
                        >
                          {t("开始专注")}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="timer-controls">
                      <button
                        onClick={() => {
                          const now = Date.now();
                          setNow(now);
                          setTimer((current) =>
                            current.status === "running"
                              ? pauseTimer(current, now)
                              : resumeTimer(current, now),
                          );
                        }}
                      >
                        {timer.status === "running" ? t("暂停") : t("继续")}
                      </button>
                      <button onClick={resetTimer}>{t("取消")}</button>
                      <button
                        onClick={() => {
                          setTimer((current) => extendTimer(current, 60_000));
                          setLastDuration((current) => current + 60_000);
                        }}
                      >
                        {t("+1 分钟")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="island-pager">
              <div
                className="pager-tabs"
                role="tablist"
                aria-label={t("灵动岛页面")}
              >
                {ISLAND_PAGES.map((page) => (
                  <button
                    key={page.id}
                    role="tab"
                    aria-selected={activeTab === page.id}
                    aria-label={t(page.label)}
                    title={t(page.label)}
                    className={`pager-tab is-${page.id} ${activeTab === page.id ? "active" : ""}`}
                    onClick={() => selectPage(page.id)}
                  >
                    <IslandPageIcon page={page.id} />
                  </button>
                ))}
              </div>
            </div>
            {/* Edge steppers keep a fixed vertical slot, so they never move
              between pages; the wheel offers the same switching. */}
            <button
              className="pager-arrow is-left"
              aria-label={t("上一页")}
              title={t("上一页")}
              onClick={() => cyclePage(-1)}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              className="pager-arrow is-right"
              aria-label={t("下一页")}
              title={t("下一页")}
              onClick={() => cyclePage(1)}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </ReminderBeam>
      {error && (
        <span role="alert" className="island-error">
          {error}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {timer.status === "finished" ? t("倒计时结束") : ""}
      </span>
    </div>
  );
}
