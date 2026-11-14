import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Power,
  Settings2,
  Captions,
  CaptionsOff,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import { defaultAppearance, parseAppearance } from "../../domain/settings";
import { loadAppearance } from "../../services/settingsRepository";
import { isLargeDisplay, watchDisplayTier } from "../../services/display";
import type { IdleData } from "./idleWidgetData";
import { useIdleChanges, type IdleChangeKeys } from "./useIdleChanges";
import { useMascotReaction } from "./useMascotReaction";
import { CapsuleContent, type MediaBadge } from "./CapsuleContent";
import { TimerPage } from "./TimerPage";
import { idleCountdownView } from "../../domain/countdown";
import {
  notificationDisplayPolicy,
  shouldShowNotificationFlash,
} from "../../domain/systemNotices";
import { timerProgress } from "../../domain/timer";
import "../../styles/index.css";
import {
  alertKindFor,
  alertTokenFor,
  selectIslandDisplay,
  shouldBlockHoverExpansion,
} from "../../domain/islandDisplay";
import { useSystemNotice } from "./useSystemNotice";
import { useAudioDevices } from "./useAudioDevices";
import { useIslandMedia } from "./useIslandMedia";
import { useIslandTimer } from "./useIslandTimer";
import { useIslandWater } from "./useIslandWater";
import { useIslandSedentary } from "./useIslandSedentary";
import { useExpandCollapse } from "./useExpandCollapse";
import { ReminderBeam } from "./ReminderBeam";
import { WaterPage } from "./WaterPage";
import { SedentaryPage } from "./SedentaryPage";
import { QuotaPage } from "./QuotaPage";
import { MailPage } from "./MailPage";
import { NoticePage } from "./NoticePage";
import { WechatPage } from "./WechatPage";
import { WechatIcon } from "./WechatIcon";
import { MusicPage } from "./MusicPage";
import { DevicePage } from "./DevicePage";
import { DEVICE_HINT_HEIGHT, deviceLayout } from "./deviceLayout";
import { ISLAND_PAGES, type IslandTab } from "./islandPages";
import { IslandPageIcon, NoticeIcon } from "./IslandParts";
import { useMail } from "../mail/useMail";
import { useAiQuota } from "../ai/useAiQuota";
import { quotaRings } from "../../domain/aiQuota";
import {
  waterCups,
  waterPercent,
  waterTone,
  waterToneColors,
} from "../../domain/water";
import { sedentaryTone, sedentaryToneColors } from "../../domain/sedentary";
import { useDailyStats } from "../stats/useDailyStats";
import { focusStreak } from "../../domain/dailyStats";
import { setLanguage, t } from "../../services/i18n";
import waterDrop from "../../assets/water-drop.webp";
import sedentaryChair from "../../assets/island/away-chair.png";

export function IslandWindow() {
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
  const [copyStatus, setCopyStatus] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [mailIndex, setMailIndex] = useState(0);
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [taskbarActive, setTaskbarActive] = useState(false);
  const {
    recent: recentMail,
    highlight: mailHighlight,
    dismissHighlight,
  } = useMail({ highlightSeconds: appearance.reminderDisplaySeconds });
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
  const {
    notice,
    system,
    devices,
    notifications,
    wechatNotifications,
    wechatAttention,
    wechatArrival,
    acknowledgeWechat,
    clearNotifications,
    clearWechatNotifications,
  } = useSystemNotice({
    notificationSeconds: appearance.noticeDisplaySeconds,
    wechatSeconds: appearance.wechatDisplaySeconds,
    wechatShowText: appearance.wechatShowText,
  });
  const [largeDisplay, setLargeDisplay] = useState(isLargeDisplay);
  const [idleWidth, setIdleWidth] = useState<number | null>(null);
  useEffect(() => watchDisplayTier(setLargeDisplay), []);
  const {
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
  } = useIslandTimer();
  const dailyStats = useDailyStats(30);
  const todayStat = dailyStats.stats.find(
    (stat) => stat.day === dailyStats.today,
  );
  const todayWater = todayStat?.waterMl ?? 0;
  const todayPomodoros =
    todayStat?.pomodoros ?? pomodoroProgress.completedToday;
  const todayFocusMinutes = Math.floor((todayStat?.focusSeconds ?? 0) / 60);
  const focusDays = focusStreak(dailyStats.stats, dailyStats.today);
  const {
    water,
    waterReminder,
    setWaterReminder,
    waterAdded,
    waterAddedMl,
    waterLogged,
    customWaterOpen,
    setCustomWaterOpen,
    customWaterMl,
    setCustomWaterMl,
    waterError,
    setWaterError,
    drinkWater,
    snoozeWater,
    waterTimerState,
  } = useIslandWater(
    todayWater,
    now,
    appearance.language,
    appearance.reminderDisplaySeconds,
  );
  const {
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
  } = useIslandSedentary(now, appearance.reminderDisplaySeconds);
  const mediaState = useIslandMedia();
  const { media, mediaKey, artwork, mediaPosition, currentLyric } = mediaState;
  const [mediaBadge, setMediaBadge] = useState<MediaBadge>("quota");
  const [activeTab, setActiveTab] = useState<IslandTab>("timer");
  const [error, setError] = useState("");
  // Failure banners are hints, not persistent states; a fresh error restarts
  // the window, and clearing it frees the capsule for the next message.
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 6_000);
    return () => window.clearTimeout(timeout);
  }, [error]);
  // Hidden WeChat messages use only the attention icon; other hidden
  // notifications still show the app name with a generic label.
  const noticePolicy = notificationDisplayPolicy(notice?.source, appearance);
  const displayNotice =
    notice &&
    notice.kind === "notification" &&
    !shouldShowNotificationFlash(notice.source, noticePolicy.showText)
      ? null
      : notice && notice.kind === "notification" && !noticePolicy.showText
        ? { ...notice, value: t("新通知") }
        : notice;
  const display = selectIslandDisplay({
    timer: timer.status,
    mail: !!(mailHighlight && recentMail.length),
    notice: !!displayNotice,
    water: waterReminder,
    waterLogged,
    sedentary: sedentaryReminder,
    sedentaryLogged,
    // Paused media stays in the panel but gives the island back. When island
    // lyrics are off, music only appears through the idle music widget.
    media: !!(media?.title && media.playing && appearance.islandLyrics),
  });
  // Reminder-aware chrome: the capsule pops once when a reminder arrives and
  // keeps a colour-coded breathing ring until it is acknowledged. Forwarded
  // notifications are their own kind so they can auto-expand on their own
  // switch, while volume and brightness notices never do.
  const alertKind = alertKindFor(display, displayNotice?.kind);
  const alertToken = alertTokenFor(
    alertKind,
    mailKey,
    displayNotice?.label ?? "",
    displayNotice?.value ?? "",
    displayNotice?.eventId,
  );
  // Fullscreen avoidance: the native watcher hides the window while a
  // fullscreen app owns the screen; reminders must not auto-expand then.
  const [fullscreenHidden, setFullscreenHidden] = useState(false);
  useEffect(() => {
    void invoke("set_fullscreen_avoid", {
      enabled: appearance.fullscreenAvoid,
    }).catch(() => {});
  }, [appearance.fullscreenAvoid]);
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<boolean>(
      "fullscreen-changed",
      ({ payload }) => {
        if (active) setFullscreenHidden(!!payload);
      },
      { target: "island" },
    )
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
  const {
    expanded,
    panel,
    notePageSwitch,
    handleToggleClick,
    cancelAutoCollapse,
    cancelHoverExpand,
    scheduleAutoCollapse,
    releaseReminderHold,
    handlePanelEnter,
    handlePanelLeave,
    beginDrag,
    moveDrag,
    endDrag,
    toggleExpanded,
  } = useExpandCollapse({
    expandTrigger: appearance.expandTrigger,
    autoCollapseSeconds: appearance.autoCollapseSeconds,
    reminderAutoExpand: appearance.reminderAutoExpand,
    noticeAutoExpand: noticePolicy.expand,
    noticeDisplaySeconds: noticePolicy.seconds,
    reminderDisplaySeconds: appearance.reminderDisplaySeconds,
    fullscreenSuppressed: fullscreenHidden,
    scale: appearance.scale,
    taskbarMode: taskbarActive,
    openReminderPage,
    onError: (message) => setError(message),
    alertToken,
    alertKind,
    blockHoverExpand: shouldBlockHoverExpansion(display, displayNotice?.kind),
  });
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke("set_taskbar_mode", { enabled: appearance.taskbarMode })
      .then(() => {
        if (active) setTaskbarActive(appearance.taskbarMode);
      })
      .catch(() => {
        if (active) {
          setTaskbarActive(false);
          setError(t("无法放置到任务栏，请检查任务栏位置和灵动岛大小。"));
        }
      });
    return () => {
      active = false;
    };
  }, [appearance.taskbarMode]);
  // Global hotkeys re-apply whenever the switches change; combos another
  // program already holds come back as failures and are surfaced in settings.
  useEffect(() => {
    void invoke("apply_hotkeys", {
      config: {
        focus: appearance.hotkeyFocus,
        water: appearance.hotkeyWater,
        island: appearance.hotkeyIsland,
      },
    }).catch(() => {});
  }, [appearance.hotkeyFocus, appearance.hotkeyWater, appearance.hotkeyIsland]);
  // Notification forwarding follows the settings switch; the island applies
  // the runtime flag on every change, including startup.
  useEffect(() => {
    void invoke("set_notification_forwarding", {
      enabled: appearance.forwardNotifications,
    }).catch(() => {});
  }, [appearance.forwardNotifications]);
  useEffect(() => {
    void invoke("set_wechat_notifications", {
      enabled: appearance.wechatNotifications,
    }).catch(() => {});
  }, [appearance.wechatNotifications]);
  // Hotkey actions must read the latest state, so the dispatch lives in a
  // per-render ref while the listener registers only once.
  const hotkeyDispatch = useRef<(action: string) => void>(() => {});
  useEffect(() => {
    hotkeyDispatch.current = (action: string) => {
      if (action === "focus") {
        if (timer.status === "idle") beginFocus(pomodoro.focusMinutes * 60_000);
        else if (timer.status === "finished") resetTimer();
        else pauseOrResumeTimer();
      } else if (action === "water") {
        void drinkWater(water.cupMl);
      } else if (action === "island") {
        // The pointer is wherever it was; engagement starts on first touch.
        void toggleExpanded(false, false);
      }
    };
  });
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<string>(
      "global-hotkey",
      ({ payload }) => {
        if (active) hotkeyDispatch.current(payload);
      },
      { target: "island" },
    )
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
  const deviceState = useAudioDevices(expanded && activeTab === "device");
  function selectPage(tab: IslandTab) {
    setActiveTab(tab);
    notePageSwitch();
    if (tab === "wechat") {
      acknowledgeWechat(wechatNotifications[0]?.id ?? null);
    }
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
    if (target.closest("input, textarea, select, .island-notice-text")) return;
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
  async function run(command: string) {
    try {
      await invoke(command);
    } catch {
      setError(t("操作失败，请重试"));
    }
  }
  async function openWechat() {
    const viewedId = wechatNotifications[0]?.id ?? null;
    try {
      await invoke("open_wechat");
      acknowledgeWechat(viewedId);
    } catch {
      setError(t("无法打开微信，请确认微信已运行并允许切换窗口。"));
    }
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
    } else if (display === "water" || display === "waterLogged") {
      setActiveTab("water");
    } else if (display === "sedentary" || display === "sedentaryLogged") {
      setActiveTab("sedentary");
    } else if (display === "notice" && displayNotice?.kind === "notification") {
      setActiveTab(displayNotice.source === "wechat" ? "wechat" : "notice");
      if (acknowledge && displayNotice.source === "wechat") {
        acknowledgeWechat(wechatNotifications[0]?.id ?? null);
      }
    } else if (display === "finished") {
      setActiveTab("timer");
    }
  }
  useEffect(() => {
    if (!alertKind) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (alertKind === "timer") resetTimer();
      else if (alertKind === "mail") dismissHighlight();
      else if (alertKind === "water") setWaterReminder(false);
      else if (alertKind === "sedentary") setSedentaryReminder(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    alertKind,
    dismissHighlight,
    resetTimer,
    setWaterReminder,
    setSedentaryReminder,
  ]);

  const waterPercentToday = waterPercent(todayWater, water.goalMl);
  const waterCupsToday = waterCups(todayWater, water.cupMl);
  const waterToneValue = waterTone(todayWater, water.goalMl);
  const waterToneColor = waterToneColors[waterToneValue];
  const todaySedentaryBreaks = todayStat?.sedentaryBreaks ?? 0;
  const sedentaryWidget = sedentaryWidgetState();
  const sedentarySitting = sedentaryWidget?.minutes ?? 0;
  const sedentaryToneValue = sedentaryTone(
    lastBreakAt,
    now,
    sedentary.reminderMinutes,
  );
  const sedentaryToneColor = sedentaryToneColors[sedentaryToneValue];
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
  const idleCountdown = idleCountdownView(
    islandCountdown,
    timerMode,
    countdownId,
    timer,
    now,
  );
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
    sedentary: sedentaryWidget,
    pomodoroCycle: {
      done: Math.min(pomodoroProgress.cycle, pomodoro.longBreakEvery),
      total: pomodoro.longBreakEvery,
    },
  };
  const mascotReaction = useMascotReaction(
    {
      waterMl: todayStat?.waterMl ?? null,
      waterActions: waterAdded,
      pomodoros: todayStat?.pomodoros ?? null,
      focusFinished: timer.status === "finished" && timerMode === "focus",
      countdownReached: idleCountdown?.reached ?? null,
      sedentaryOver: sedentaryWidget?.over ?? null,
    },
    display === "idle" && !expanded,
  );
  // Change-tier idle widgets speak briefly after their value moves. Volume
  // keys follow every adjustment; battery speaks on plug/unplug and when the
  // charge crosses into the low state, ignoring slow discharge creep.
  const idleChangeKeys: IdleChangeKeys = {
    volume:
      system?.volume != null
        ? `${system.volume}-${system.muted ? 1 : 0}`
        : null,
    battery:
      system?.battery != null
        ? `${system.charging ? 1 : 0}-${system.battery <= 20 ? 1 : 0}`
        : null,
    bluetooth: devices?.bluetooth
      ? JSON.stringify(
          devices.bluetooth.map((device) => [device.id, device.battery]),
        )
      : null,
    focus: `${todayFocusMinutes}`,
    streak: `${focusDays}`,
  };
  const idleChangeShownAt = useIdleChanges(idleChangeKeys);
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
  // Idle capsules shrink to their measured content; a numeric width lets the
  // panel animate smoothly into the expanded layout. Resolution scaling is
  // applied natively (webview zoom), so these widths stay in base CSS pixels.
  const showWechatAttention =
    !expanded &&
    !!wechatAttention &&
    (display === "idle" || display === "media" || display === "timer");
  const wechatIndicatorWidth = showWechatAttention ? 30 : 0;
  const roomyReminder =
    display === "water" ||
    display === "waterLogged" ||
    display === "sedentary" ||
    display === "sedentaryLogged" ||
    display === "mail" ||
    display === "finished" ||
    (display === "notice" && displayNotice?.kind === "notification");
  const panelWidth = expanded
    ? 340
    : roomyReminder
      ? display === "notice"
        ? 356
        : 316
      : display === "idle"
        ? idleWidth === null
          ? "fit-content"
          : Math.min(356, idleWidth + 2 + wechatIndicatorWidth)
        : largeDisplay
          ? 240 + wechatIndicatorWidth
          : 232 + wechatIndicatorWidth;
  // The banner lane adds 34px; the layout cap keeps the tallest panel inside
  // the 320px island viewport instead of clipping the pager.
  const deviceHasHint =
    deviceState.devices !== null &&
    (!!deviceState.feedback || deviceState.failed);
  const devicePanelHeight =
    deviceLayout(deviceState.devices).panelHeight +
    (deviceHasHint ? DEVICE_HINT_HEIGHT : 0);
  // Keep the current page in place and offer a banner for new notifications.
  const panelHasBanner =
    expanded &&
    display === "notice" &&
    !!displayNotice &&
    (displayNotice.kind !== "notification" ||
      activeTab !== (displayNotice.source === "wechat" ? "wechat" : "notice"));
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
      data-placement={taskbarActive ? "taskbar" : "desktop"}
      data-shape={appearance.expandedShape}
      data-page={expanded ? activeTab : undefined}
    >
      <ReminderBeam
        enabled={!!alertKind && appearance.reminderStyle === "beam"}
      >
        <div
          ref={panel}
          className={`island-panel ${display === "notice" ? "is-notice" : ""} ${panelHasBanner ? "has-banner" : ""} ${showWechatAttention ? "has-wechat-attention" : ""} ${display === "water" ? `is-water-reminder tone-${waterToneValue}` : ""} ${display === "sedentary" ? "is-sedentary-reminder" : ""}`}
          data-alert={alertKind ?? undefined}
          data-roomy-reminder={!expanded && roomyReminder ? "true" : undefined}
          data-notice-source={displayNotice?.source}
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
          onPointerDownCapture={() => {
            cancelHoverExpand();
            releaseReminderHold();
          }}
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
            onClick={handleToggleClick}
          >
            {expanded ? null : (
              <CapsuleContent
                appearance={appearance}
                display={display}
                displayNotice={displayNotice}
                onWidthChange={setIdleWidth}
                idleData={idleData}
                changeShownAt={idleChangeShownAt}
                mascotReaction={mascotReaction}
                reservedWidth={wechatIndicatorWidth}
                changeWindowMs={appearance.idleChangeDisplayMinutes * 60_000}
                now={now}
                isPomodoroMode={isPomodoroMode}
                timerStatus={timer.status}
                timerMode={timerMode}
                timerModeLabel={timerModeLabel()}
                timerProgress={timerProgress(timer, lastDuration, now)}
                remaining={remaining}
                water={water}
                waterToneValue={waterToneValue}
                waterToneColor={waterToneColor}
                waterPercentToday={waterPercentToday}
                waterCupsToday={waterCupsToday}
                todayWater={todayWater}
                waterAdded={waterAdded}
                waterAddedMl={waterAddedMl}
                sedentary={sedentary}
                sedentarySitting={sedentarySitting}
                sedentaryAdded={sedentaryAdded}
                todaySedentaryBreaks={todaySedentaryBreaks}
                capsuleMail={capsuleMail ?? null}
                mailKey={mailKey}
                media={media}
                mediaKey={mediaKey}
                artwork={artwork}
                currentLyric={currentLyric}
                mediaPosition={mediaPosition}
                mediaBadgeShown={mediaBadgeShown}
                pomodoroBadgePercent={pomodoroBadgePercent}
                pomodoroBadgeColor={pomodoroBadgeColor}
              />
            )}
          </button>
          {showWechatAttention && (
            <button
              type="button"
              className="island-wechat-attention"
              aria-label={t(
                wechatAttention?.preview
                  ? "微信演示提醒，点击查看"
                  : "有微信提醒，点击查看",
              )}
              title={t(
                wechatAttention?.preview
                  ? "微信演示提醒，点击查看"
                  : "有微信提醒，点击查看",
              )}
              onMouseEnter={cancelHoverExpand}
              onMouseLeave={(event) => {
                if (
                  event.relatedTarget instanceof Node &&
                  event.currentTarget.parentElement?.contains(
                    event.relatedTarget,
                  )
                ) {
                  handlePanelEnter();
                }
              }}
              onClick={() => {
                const viewedId = wechatNotifications[0]?.id ?? null;
                setActiveTab("wechat");
                notePageSwitch();
                void toggleExpanded().then((opened) => {
                  if (opened) acknowledgeWechat(viewedId);
                });
              }}
            >
              <span
                className="wechat-attention-mark"
                key={wechatArrival}
                aria-hidden="true"
              >
                <WechatIcon size={18} />
                <span className="island-wechat-dot" />
              </span>
            </button>
          )}
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
          {!expanded && (display === "water" || display === "sedentary") && (
            <button
              className="island-copy island-snooze"
              aria-label={t("10 分钟后再提醒")}
              title={t("10 分钟后再提醒")}
              onClick={display === "water" ? snoozeWater : snoozeSedentary}
            >
              {t("稍后")}
            </button>
          )}
          {!expanded && display === "sedentary" && (
            <button
              className="island-copy island-sedentary-add"
              aria-label={t("起身一下")}
              title={t("起身一下")}
              onClick={() => void standNow()}
            >
              <img
                className="sedentary-chair-sm"
                src={sedentaryChair}
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
          {panelHasBanner &&
            displayNotice &&
            (displayNotice.kind === "notification" ? (
              <button
                key={displayNotice.eventId}
                type="button"
                className={`system-notice-banner is-actionable ${displayNotice.source === "wechat" ? "is-wechat" : ""}`}
                onClick={() =>
                  selectPage(
                    displayNotice.source === "wechat" ? "wechat" : "notice",
                  )
                }
                aria-label={`${displayNotice.label} · ${displayNotice.value}`}
              >
                <NoticeIcon
                  kind={displayNotice.kind}
                  source={displayNotice.source}
                />
                <span>{displayNotice.label}</span>
                <strong>{displayNotice.value}</strong>
              </button>
            ) : (
              <div className="system-notice-banner" role="status">
                <NoticeIcon kind={displayNotice.kind} />
                <span>{displayNotice.label}</span>
                <strong>{displayNotice.value}</strong>
              </div>
            ))}
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
                {activeTab === "notice" && notifications.length > 0 && (
                  <button
                    aria-label={t("清空通知")}
                    title={t("清空通知")}
                    onClick={clearNotifications}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
                {activeTab === "wechat" && wechatNotifications.length > 0 && (
                  <button
                    aria-label={t("清空微信消息")}
                    title={t("清空微信消息")}
                    onClick={clearWechatNotifications}
                  >
                    <Trash2 size={15} aria-hidden="true" />
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
                  onSnooze={
                    waterReminder
                      ? () => {
                          snoozeWater();
                          void toggleExpanded();
                        }
                      : undefined
                  }
                />
              ) : activeTab === "sedentary" ? (
                <SedentaryPage
                  sedentary={sedentary}
                  sittingMin={sedentarySitting}
                  tone={sedentaryToneValue}
                  toneColor={sedentaryToneColor}
                  sedentaryAdded={sedentaryAdded}
                  todayBreaks={todaySedentaryBreaks}
                  standNow={standNow}
                  onSnooze={
                    sedentaryReminder
                      ? () => {
                          snoozeSedentary();
                          void toggleExpanded();
                        }
                      : undefined
                  }
                  standError={sedentaryError}
                  setStandError={setSedentaryError}
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
              ) : activeTab === "wechat" ? (
                <WechatPage
                  notifications={wechatNotifications}
                  enabled={
                    appearance.wechatNotifications ||
                    appearance.forwardNotifications
                  }
                  showText={appearance.wechatShowText}
                  language={appearance.language}
                  onOpenWechat={openWechat}
                />
              ) : activeTab === "notice" ? (
                <NoticePage
                  notifications={notifications}
                  forwardingEnabled={appearance.forwardNotifications}
                  showText={appearance.noticeShowText}
                  language={appearance.language}
                />
              ) : (
                <TimerPage
                  timer={timer}
                  timerMode={timerMode}
                  timerModeLabel={timerModeLabel()}
                  isPomodoroMode={isPomodoroMode}
                  remaining={remaining}
                  minutes={minutes}
                  seconds={seconds}
                  setMinutes={setMinutes}
                  setSeconds={setSeconds}
                  durationError={durationError}
                  setDurationError={setDurationError}
                  lastDuration={lastDuration}
                  customTimerOpen={customTimerOpen}
                  setCustomTimerOpen={setCustomTimerOpen}
                  countdownOpen={countdownOpen}
                  setCountdownOpen={setCountdownOpen}
                  presetMilliseconds={presetMilliseconds()}
                  durationCountdowns={durationCountdowns}
                  startCountdown={startCountdown}
                  startManualTimer={startManualTimer}
                  startTimer={startTimer}
                  resetTimer={resetTimer}
                  beginFocus={beginFocus}
                  beginBreak={beginBreak}
                  pauseOrResumeTimer={pauseOrResumeTimer}
                  extendOneMinute={extendOneMinute}
                  pomodoro={pomodoro}
                  pomodoroProgress={pomodoroProgress}
                />
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
                    aria-label={
                      page.id === "wechat" && wechatAttention
                        ? t("有微信提醒，点击查看")
                        : t(page.label)
                    }
                    title={
                      page.id === "wechat" && wechatAttention
                        ? t("有微信提醒，点击查看")
                        : t(page.label)
                    }
                    className={`pager-tab is-${page.id} ${activeTab === page.id ? "active" : ""}`}
                    onClick={() => selectPage(page.id)}
                  >
                    <IslandPageIcon page={page.id} />
                    {page.id === "wechat" && wechatAttention && (
                      <span className="pager-wechat-dot" aria-hidden="true" />
                    )}
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
