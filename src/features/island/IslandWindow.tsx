import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Music2,
  Pause,
  Play,
  Power,
  Settings2,
  SkipBack,
  SkipForward,
  Timer,
  Volume2,
  PlugZap,
  Sun,
  Bluetooth,
  Mail,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Bot,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { defaultAppearance, parseAppearance } from "../../domain/settings";
import { loadAppearance } from "../../services/settingsRepository";
import { isLargeDisplay, watchDisplayTier } from "../../services/display";
import {
  IDLE_QUOTA_WIDTH,
  IDLE_WIDTH,
  IdleQuota,
  IslandContent,
} from "./IslandPreview";
import {
  formatRemaining,
  extendTimer,
  parseDuration,
  pauseTimer,
  remainingMilliseconds,
  resumeTimer,
  type TimerState,
} from "../../domain/timer";
import "../../styles/index.css";
import { selectIslandDisplay } from "../../domain/islandDisplay";
import { useSystemNotice } from "./useSystemNotice";
import { useMail } from "../mail/useMail";
import { lyricAt, parseLyrics } from "../../domain/lyrics";
import { useAiQuota } from "../ai/useAiQuota";
import { QuotaRings } from "../ai/QuotaRings";
import { ProviderIcon } from "../ai/ProviderIcon";
import { aiProviderName, quotaRings } from "../../domain/aiQuota";

type MediaState = {
  title: string;
  artist: string;
  playing: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  canSeek: boolean;
};

const ISLAND_PAGES = [
  { id: "timer", label: "计时器" },
  { id: "music", label: "音乐" },
  { id: "mail", label: "邮件" },
  { id: "ai", label: "AI 额度" },
] as const;

function formatMediaTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function NoticeIcon({
  kind,
}: {
  kind: "volume" | "power" | "brightness" | "bluetooth";
}) {
  const Icon =
    kind === "volume"
      ? Volume2
      : kind === "power"
        ? PlugZap
        : kind === "brightness"
          ? Sun
          : Bluetooth;
  return <Icon size={15} aria-hidden="true" />;
}

function MediaWave({
  playing,
  compact = false,
}: {
  playing: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`media-wave ${compact ? "media-wave-compact" : ""} ${playing ? "is-playing" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: compact ? 4 : 32 }, (_, index) => (
        <i
          key={index}
          style={{
            height: `${32 + ((index * 37 + 19) % 65)}%`,
            animationDuration: `${0.8 + ((index * 29 + 13) % 85) / 100}s`,
            animationDelay: `${-((index * 47 + 11) % 130) / 100}s`,
          }}
        />
      ))}
    </span>
  );
}

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
  const notice = useSystemNotice();
  const ai = useAiQuota();
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
    copyStatus.message === "已复制";
  const mailKey = capsuleMail
    ? `${capsuleMail.accountId}|${capsuleMail.subject}|${capsuleMail.code ?? ""}`
    : "";
  const currentCopyStatus =
    selectedMail?.code === copyStatus?.code ? copyStatus?.message : "";
  const [appearance, setAppearance] = useState(defaultAppearance);
  const panel = useRef<HTMLDivElement>(null);
  const collapseTimeout = useRef<number | null>(null);
  const hoverTimeout = useRef<number | null>(null);
  const dragState = useRef<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const dragMoved = useRef(false);
  const scheduleCollapseRef = useRef<() => void>(() => {});
  const [expanded, setExpanded] = useState(false);
  const [largeDisplay, setLargeDisplay] = useState(isLargeDisplay);
  useEffect(() => watchDisplayTier(setLargeDisplay), []);
  const [transitioning, setTransitioning] = useState(false);
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [durationError, setDurationError] = useState("");
  const [lastDuration, setLastDuration] = useState(0);
  const [timerMode, setTimerMode] = useState<"timer" | "focus" | "break">(
    "timer",
  );
  const [now, setNow] = useState(() => Date.now());
  const [media, setMedia] = useState<MediaState | null>(null);
  const mediaSample = useRef(Date.now());
  const [mediaNow, setMediaNow] = useState(Date.now);
  const [lyrics, setLyrics] = useState<{
    key: string;
    text: string;
    synced: boolean;
  } | null>(null);
  const [lyricsError, setLyricsError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [artwork, setArtwork] = useState<{
    key: string;
    src: string | null;
  } | null>(null);
  const mediaKey = media ? JSON.stringify([media.title, media.artist]) : "";
  useEffect(() => {
    if (!media?.title || !media.artist) return;
    let active = true;
    const key = JSON.stringify([media.title, media.artist]);
    void invoke<{ text: string; synced: boolean }>("get_lyrics", {
      title: media.title,
      artist: media.artist,
      duration: media.durationSeconds,
    })
      .then((value) => {
        if (active) setLyrics({ key, ...value });
      })
      .catch((error: unknown) => {
        if (active) setLyricsError({ key, message: String(error) });
      });
    return () => {
      active = false;
    };
  }, [media?.title, media?.artist, media?.durationSeconds]);
  useEffect(() => {
    if (!media?.playing) return;
    const timer = window.setInterval(() => setMediaNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [media?.playing]);
  const mediaPosition =
    media?.positionSeconds == null
      ? null
      : Math.min(
          media.durationSeconds ?? Infinity,
          media.positionSeconds +
            (media.playing
              ? Math.max(0, mediaNow - mediaSample.current) / 1000
              : 0),
        );
  const currentLyrics = lyrics?.key === mediaKey ? lyrics : null;
  const currentLyric =
    currentLyrics?.synced && mediaPosition !== null
      ? lyricAt(parseLyrics(currentLyrics.text), mediaPosition)
      : null;
  useEffect(() => {
    if (!mediaKey) return;
    let active = true;
    let retry: number | undefined;
    const [title, artist] = JSON.parse(mediaKey) as [string, string];
    async function refreshArtwork() {
      let src: string | null = null;
      try {
        src = await invoke<string | null>("get_media_artwork", {
          title,
          artist,
        });
      } catch {
        /* retry later */
      }
      if (!active) return;
      setArtwork({ key: mediaKey, src });
      if (!src) retry = window.setTimeout(() => void refreshArtwork(), 15_000);
    }
    void refreshArtwork();
    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, [mediaKey]);
  const [activeTab, setActiveTab] = useState<"timer" | "music" | "mail" | "ai">(
    "timer",
  );
  function selectPage(tab: "timer" | "music" | "mail" | "ai") {
    setActiveTab(tab);
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
  const [customTimerOpen, setCustomTimerOpen] = useState(false);
  const [mediaError, setMediaError] = useState("");
  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    const refresh = async () => {
      try {
        const state = await invoke<MediaState | null>("get_media_state");
        if (active) {
          mediaSample.current = Date.now();
          setMediaNow(mediaSample.current);
          setMedia(state?.title ? state : null);
        }
      } catch (error) {
        console.error("Unable to read Windows media session", error);
      } finally {
        if (active) timeout = window.setTimeout(() => void refresh(), 2000);
      }
    };
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    if (timer.status !== "running") return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= timer.endsAt) setTimer({ status: "finished" });
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timer]);
  // The panel header shows a live clock, so it needs its own beat.
  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expanded]);
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
              if (active) setAppearance(next);
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
        if (active && !receivedUpdate) setAppearance(stored);
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
  function cancelAutoCollapse() {
    if (collapseTimeout.current !== null) {
      window.clearTimeout(collapseTimeout.current);
      collapseTimeout.current = null;
    }
  }
  function scheduleAutoCollapse() {
    cancelAutoCollapse();
    const hoverMode = appearance.expandTrigger === "hover";
    const delay = appearance.autoCollapseSeconds;
    if (!expanded || transitioning) return;
    // Hover mode opens on its own, so it must also close on its own even when
    // the timed auto-collapse is switched off.
    if (delay === 0 && !hoverMode) return;
    const wait = delay === 0 ? 600 : delay * 1000;
    collapseTimeout.current = window.setTimeout(() => {
      collapseTimeout.current = null;
      if (!panel.current?.matches(":hover")) {
        void toggleExpanded();
      }
    }, wait);
  }
  useEffect(() => {
    scheduleCollapseRef.current = scheduleAutoCollapse;
  });
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
      setError("操作失败，请重试");
    }
  }
  function cancelHoverExpand() {
    if (hoverTimeout.current !== null) {
      window.clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
  }
  function handlePanelEnter() {
    cancelAutoCollapse();
    if (appearance.expandTrigger !== "hover") return;
    if (expanded || transitioning || dragState.current?.active) return;
    if (hoverTimeout.current !== null) return;
    // A short dwell keeps the panel from popping up when the pointer just
    // crosses the top of the screen.
    hoverTimeout.current = window.setTimeout(() => {
      hoverTimeout.current = null;
      void toggleExpanded();
    }, 180);
  }
  function handlePanelLeave() {
    cancelHoverExpand();
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
    void invoke("start_island_drag").catch(() => {
      dragMoved.current = false;
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
      setError("窗口调整失败，请重试");
    } finally {
      setTransitioning(false);
    }
  }
  function startTimer(durationMs: number, current: number) {
    setNow(current);
    setLastDuration(durationMs);
    setDurationError("");
    setTimer({ status: "running", endsAt: current + durationMs });
  }
  const display = selectIslandDisplay({
    timer: timer.status,
    mail: !!(mailHighlight && recentMail.length),
    notice: !!notice,
    // Paused media stays in the panel but gives the island back.
    media: !!(media?.title && media.playing),
  });
  const remaining = formatRemaining(remainingMilliseconds(timer, now));
  // The mail capsule needs a little more room for the account line.
  // Only the capsule grows with the size setting; type stays the same.
  const collapsedBase =
    display === "idle" ? (pinnedAi ? IDLE_QUOTA_WIDTH : IDLE_WIDTH) : 232;
  const panelWidth = expanded
    ? 340
    : (largeDisplay && display !== "idle" ? 240 : collapsedBase) *
      appearance.scale;
  // A transient banner floats over the panel bottom; make room for it.
  const panelHasBanner =
    expanded && ((display === "notice" && !!notice) || display === "mail");
  async function refreshMedia() {
    try {
      const state = await invoke<MediaState | null>("get_media_state");
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
      setMedia(state?.title ? state : null);
    } catch {
      /* the 2s poll retries */
    }
  }
  async function controlMedia(action: "previous" | "toggle" | "next") {
    const previous = media;
    // Flip the button before the player answers, then reconcile.
    if (action === "toggle" && previous) {
      setMedia({ ...previous, playing: !previous.playing });
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
    }
    try {
      const applied = await invoke<boolean>("control_media", { action });
      if (!applied) throw new Error("播放器未响应此操作");
      setMediaError("");
      window.setTimeout(() => void refreshMedia(), 120);
      window.setTimeout(() => void refreshMedia(), 600);
    } catch (error) {
      if (action === "toggle") setMedia(previous);
      setMediaError(
        typeof error === "string" && error
          ? error
          : error instanceof Error
            ? error.message
            : "媒体控制失败",
      );
    }
  }
  async function seekMedia(positionSeconds: number) {
    try {
      const applied = await invoke<boolean>("seek_media", { positionSeconds });
      if (!applied) throw new Error("Seek unsupported");
      setMediaError("");
      const state = await invoke<MediaState | null>("get_media_state");
      mediaSample.current = Date.now();
      setMediaNow(mediaSample.current);
      setMedia(state);
    } catch {
      setMediaError("当前播放器暂不支持调整进度");
    } finally {
      setSeekPreview(null);
    }
  }
  async function copyCode(code: string, expiresAt: number) {
    if (Date.now() >= expiresAt) {
      setCopyStatus({ code, message: "已过期" });
      return;
    }
    try {
      await invoke("copy_mail_code", { code });
      setCopyStatus({ code, message: "已复制" });
      // Let the check mark land before the capsule returns to its normal state.
      window.setTimeout(dismissHighlight, 900);
    } catch {
      setCopyStatus({ code, message: "复制失败" });
    }
  }
  // Copy feedback is transient; the button falls back to "复制验证码".
  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  return (
    <div
      className={`desktop-island ${expanded ? "is-expanded" : ""} ${timer.status === "finished" ? "timer-finished" : ""}`}
      data-page={expanded ? activeTab : undefined}
    >
      <div
        ref={panel}
        className={`island-panel ${display === "notice" ? "is-notice" : ""} ${panelHasBanner ? "has-banner" : ""}`}
        style={{ width: panelWidth }}
        onMouseEnter={handlePanelEnter}
        onMouseLeave={handlePanelLeave}
        onFocusCapture={cancelAutoCollapse}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            scheduleAutoCollapse();
        }}
      >
        <button
          className="island-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "收起灵动岛" : "展开灵动岛"}
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
            if (!expanded && display === "mail") {
              setActiveTab("mail");
              setMailIndex(0);
              setCopyStatus(null);
              // Opening the panel counts as handling the reminder.
              dismissHighlight();
            }
            void toggleExpanded();
          }}
        >
          {expanded ? null : display === "notice" && notice ? (
            <span className="island-current system-notice" role="status">
              <NoticeIcon kind={notice.kind} />
              <span className="system-notice-label">{notice.label}</span>
              <strong>{notice.value}</strong>
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
                    capsuleMail.subject || "新邮件"
                  )}
                </span>
              </span>
            </span>
          ) : display === "timer" || display === "finished" ? (
            <span className="island-current compact-timer timer-only">
              <Timer className="timer-indicator" size={15} aria-hidden="true" />
              <span className="compact-copy">
                <span className="compact-primary">
                  {timerMode === "focus"
                    ? "专注"
                    : timerMode === "break"
                      ? "休息"
                      : "计时器"}{" "}
                  ·{" "}
                  {timer.status === "paused"
                    ? "已暂停"
                    : timer.status === "finished"
                      ? "已结束"
                      : "进行中"}
                </span>
              </span>
              <span className="island-timer-value">
                {timer.status === "finished" ? "时间到" : remaining}
              </span>
            </span>
          ) : display === "media" && media?.title ? (
            <span className="island-current island-media-current">
              <span className="compact-art">
                {artwork?.key === mediaKey && artwork.src ? (
                  <img src={artwork.src} alt="" />
                ) : (
                  <Music2 size={14} aria-hidden="true" />
                )}
              </span>
              <span className="compact-copy">
                <span className="compact-primary">{media.title}</span>
                <span className="compact-secondary">
                  {currentLyric || media.artist || "未知艺术家"}
                </span>
              </span>
              <span className="media-playing-mark">
                {pinnedAi &&
                  quotaRings(pinnedAiResult?.quota?.items ?? []).length > 0 && (
                    <QuotaRings
                      items={pinnedAiResult?.quota?.items ?? []}
                      compact
                      provider={pinnedAi.provider}
                    />
                  )}
                {mediaPosition !== null ? (
                  <span className="media-time">
                    {formatMediaTime(mediaPosition)}
                  </span>
                ) : (
                  <MediaWave playing={media.playing} compact />
                )}
              </span>
            </span>
          ) : pinnedAi ? (
            <IdleQuota
              appearance={appearance}
              provider={pinnedAi.provider}
              items={pinnedAiResult?.quota?.items ?? []}
            />
          ) : (
            <IslandContent appearance={appearance} />
          )}
        </button>
        {!expanded && display === "mail" && capsuleMail?.code && (
          <button
            className={`island-copy ${capsuleCopied ? "is-copied" : ""}`}
            aria-label={capsuleCopied ? "验证码已复制" : "复制验证码"}
            title={capsuleCopied ? "已复制" : "复制验证码"}
            onClick={() =>
              void copyCode(capsuleMail.code!, capsuleMail.expiresAt)
            }
          >
            {capsuleCopied ? <Check size={13} /> : <Copy size={13} />}
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
        {expanded && display === "mail" && (
          <div className="system-notice-banner" role="status">
            <Mail size={13} />
            <span>{recentMail[0].code ? "收到邮箱验证码" : "收到新邮件"}</span>
          </div>
        )}
        <div
          className="island-details"
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <div
            className="island-head"
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className={`island-page-title is-${activeTab}`}>
              {activeTab === "timer"
                ? "计时器"
                : activeTab === "music"
                  ? "音乐"
                  : activeTab === "mail"
                    ? "邮件"
                    : "AI 额度"}
            </span>
            <span className="island-head-clock">
              {new Date(now).getMonth() + 1}月{new Date(now).getDate()}日{" "}
              {new Date(now).toLocaleDateString("zh-CN", {
                weekday: "short",
              })}{" "}
              {new Date(now).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <div className="island-actions">
              <button
                aria-label="收起灵动岛"
                title="收起"
                onClick={() => void toggleExpanded()}
              >
                <ChevronUp size={15} aria-hidden="true" />
              </button>
              <button
                aria-label="打开设置"
                title="打开设置"
                onClick={() => void run("open_settings")}
              >
                <Settings2 size={15} aria-hidden="true" />
              </button>
              <button
                aria-label="退出应用"
                title="退出应用"
                onClick={() => void run("quit_app")}
              >
                <Power size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="island-page" key={activeTab}>
            {activeTab === "ai" ? (
              <div className="quota-view">
                {ai.accounts.length === 0 ? (
                  <div className="media-empty">
                    <Bot size={20} />
                    <strong>尚未添加 AI 账户</strong>
                    <span>在设置的 AI 额度页面添加。</span>
                  </div>
                ) : (
                  <>
                    <div
                      className="quota-switcher"
                      role="group"
                      aria-label="选择 AI 账户"
                    >
                      {ai.accounts.map((account) => (
                        <button
                          key={account.id}
                          className={
                            account.id === selectedAi?.id ? "active" : ""
                          }
                          aria-pressed={account.id === selectedAi?.id}
                          title={`${account.name} · ${aiProviderName(account.provider)}`}
                          onClick={() => setSelectedAiId(account.id)}
                        >
                          <ProviderIcon
                            provider={account.provider}
                            size="normal"
                          />
                          <span>{account.name}</span>
                        </button>
                      ))}
                    </div>
                    <div
                      className={`quota-hero ${selectedRings.length ? "" : "is-balance"}`}
                      key={selectedAi?.id ?? "none"}
                    >
                      {selectedRings.length ? (
                        <QuotaRings items={selectedItems} compact={false} />
                      ) : (
                        <div className="quota-balance-icon">
                          <ProviderIcon
                            provider={selectedAi?.provider ?? ""}
                            size="large"
                          />
                        </div>
                      )}
                      <div className="quota-hero-copy">
                        <div className="quota-hero-line">
                          <strong>{selectedAi?.name}</strong>
                          <span className="quota-hero-meta">
                            {selectedAi &&
                            aiProviderName(
                              selectedAi.provider,
                            ).toLowerCase() !== selectedAi.name.toLowerCase()
                              ? aiProviderName(selectedAi.provider)
                              : ""}
                            {selectedAi?.pinned && <em>常驻</em>}
                          </span>
                        </div>
                        <div className="quota-metrics">
                          {selectedItems.length ? (
                            selectedItems.map((item, index) => {
                              const ringIndex = selectedRings.findIndex(
                                (ring) => ring.item === item,
                              );
                              const percent =
                                ringIndex >= 0
                                  ? selectedRings[ringIndex].percent
                                  : null;
                              return (
                                <div
                                  className="quota-metric"
                                  key={`${item.label}-${index}`}
                                >
                                  <div className="quota-metric-head">
                                    <span className="quota-metric-label">
                                      {ringIndex >= 0 && (
                                        <i
                                          className={`quota-dot quota-dot-${ringIndex}`}
                                        />
                                      )}
                                      {item.label}
                                    </span>
                                    <strong>{item.value}</strong>
                                  </div>
                                  {percent !== null && (
                                    <span
                                      className="quota-metric-track"
                                      aria-hidden="true"
                                    >
                                      <span
                                        className={`quota-metric-fill quota-fill-${ringIndex}`}
                                        style={
                                          {
                                            "--fill": `${percent}%`,
                                          } as CSSProperties
                                        }
                                      />
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="quota-message">
                              {selectedAiResult?.error ?? "正在查询额度…"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : activeTab === "mail" ? (
              <div className="island-mail-view">
                {selectedMail ? (
                  <>
                    <div className="island-mail-top">
                      <span className="mail-avatar" aria-hidden="true">
                        <Mail size={16} />
                      </span>
                      <div className="island-mail-heading">
                        <strong className="island-mail-subject">
                          {selectedMail.subject || "新邮件"}
                        </strong>
                        <span>{selectedMail.account} · 最近提醒</span>
                      </div>
                    </div>
                    {/* Fixed regions: the pager stays put across mails. */}
                    <div className="island-mail-body">
                      {selectedMail.code ? (
                        <div className="island-mail-code">
                          <span>{selectedMail.code}</span>
                          <button
                            onClick={() =>
                              void copyCode(
                                selectedMail.code!,
                                selectedMail.expiresAt,
                              )
                            }
                          >
                            {currentCopyStatus === "已复制" ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            {currentCopyStatus || "复制验证码"}
                          </button>
                        </div>
                      ) : (
                        <p className="island-mail-empty">
                          这封邮件未识别到验证码
                        </p>
                      )}
                    </div>
                    <div className="island-mail-navigation">
                      {recentMail.length > 1 && (
                        <>
                          <button
                            aria-label="上一条提醒"
                            disabled={mailIndex <= 0}
                            onClick={() => {
                              setMailIndex((value) => Math.max(0, value - 1));
                              setCopyStatus(null);
                            }}
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span>
                            {Math.min(mailIndex + 1, recentMail.length)} /{" "}
                            {recentMail.length}
                          </span>
                          <button
                            aria-label="下一条提醒"
                            disabled={mailIndex >= recentMail.length - 1}
                            onClick={() => {
                              setMailIndex((value) =>
                                Math.min(recentMail.length - 1, value + 1),
                              );
                              setCopyStatus(null);
                            }}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="media-empty">
                    <Mail size={20} />
                    <strong>暂无新邮件提醒</strong>
                    <span>在设置中添加邮箱后，新邮件会显示在这里。</span>
                  </div>
                )}
              </div>
            ) : activeTab === "music" ? (
              <div className="media-view">
                {media ? (
                  <>
                    <div className="media-top">
                      <div className="media-track">
                        <div className="media-art">
                          {artwork?.key === mediaKey && artwork.src ? (
                            <img src={artwork.src} alt="" />
                          ) : (
                            <Music2 size={21} />
                          )}
                        </div>
                        <div className="media-copy">
                          <strong>{media.title}</strong>
                          <span>{media.artist || "未知艺术家"}</span>
                        </div>
                      </div>
                      <div className="music-lyric" aria-live="off">
                        {currentLyric ||
                          (currentLyrics?.synced
                            ? mediaPosition === null
                              ? "暂无播放进度，无法同步歌词"
                              : currentLyric === ""
                                ? "♪ 间奏"
                                : "♪ 前奏"
                            : currentLyrics
                              ? "暂无同步歌词"
                              : lyricsError?.key === mediaKey
                                ? lyricsError.message
                                : "正在查找歌词…")}
                      </div>
                    </div>
                    {media.durationSeconds != null &&
                      media.positionSeconds != null && (
                        <div
                          className="media-timeline"
                          aria-label={`播放进度 ${formatMediaTime(media.positionSeconds)} / ${formatMediaTime(media.durationSeconds)}`}
                        >
                          {media.canSeek && media.durationSeconds > 0 ? (
                            <input
                              className="media-seek"
                              type="range"
                              min={0}
                              max={media.durationSeconds}
                              step={1}
                              value={Math.min(
                                media.durationSeconds,
                                seekPreview ??
                                  mediaPosition ??
                                  media.positionSeconds,
                              )}
                              aria-label="调整播放进度"
                              onChange={(event) =>
                                setSeekPreview(
                                  Number(event.currentTarget.value),
                                )
                              }
                              onPointerUp={(event) =>
                                void seekMedia(
                                  Number(event.currentTarget.value),
                                )
                              }
                              onKeyUp={(event) => {
                                if (
                                  [
                                    "ArrowLeft",
                                    "ArrowRight",
                                    "ArrowUp",
                                    "ArrowDown",
                                    "Home",
                                    "End",
                                    "PageUp",
                                    "PageDown",
                                  ].includes(event.key)
                                )
                                  void seekMedia(
                                    Number(event.currentTarget.value),
                                  );
                              }}
                              onPointerCancel={() => setSeekPreview(null)}
                            />
                          ) : (
                            <div className="media-progress">
                              <span
                                style={{
                                  width: `${Math.min(100, Math.max(0, ((mediaPosition ?? media.positionSeconds) / media.durationSeconds) * 100))}%`,
                                }}
                              />
                            </div>
                          )}
                          <div className="media-times">
                            <span>
                              {formatMediaTime(
                                seekPreview ??
                                  mediaPosition ??
                                  media.positionSeconds,
                              )}
                            </span>
                            <span>
                              {formatMediaTime(media.durationSeconds)}
                            </span>
                          </div>
                        </div>
                      )}
                    {(media.durationSeconds == null ||
                      media.positionSeconds == null) && (
                      <div className="media-timeline-unavailable">
                        播放器未提供播放进度
                      </div>
                    )}
                    <div className="media-controls">
                      <button
                        aria-label="上一首"
                        onClick={() => void controlMedia("previous")}
                      >
                        <SkipBack size={16} fill="currentColor" />
                      </button>
                      <button
                        aria-label={media.playing ? "暂停" : "播放"}
                        className="media-play"
                        onClick={() => void controlMedia("toggle")}
                      >
                        <span
                          key={media.playing ? "pause" : "play"}
                          className="media-play-icon"
                        >
                          {media.playing ? (
                            <Pause size={17} fill="currentColor" />
                          ) : (
                            <Play size={17} fill="currentColor" />
                          )}
                        </span>
                      </button>
                      <button
                        aria-label="下一首"
                        onClick={() => void controlMedia("next")}
                      >
                        <SkipForward size={16} fill="currentColor" />
                      </button>
                    </div>
                    {mediaError && (
                      <span className="duration-error" role="alert">
                        {mediaError}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="media-empty">
                    <Music2 size={21} />
                    <strong>没有正在播放的媒体</strong>
                    <span>开始播放音乐后，这里会显示曲目信息和控制按钮。</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="timer-view">
                <div className="timer-status">
                  <span>
                    {timerMode === "focus"
                      ? "专注"
                      : timerMode === "break"
                        ? "休息"
                        : "计时器"}
                  </span>
                  <i aria-hidden="true" />
                  <span>
                    {timer.status === "finished"
                      ? "已结束"
                      : timer.status === "paused"
                        ? "已暂停"
                        : timer.status === "running"
                          ? "进行中"
                          : "选择时长"}
                  </span>
                </div>
                <div className={`timer-clock is-${timer.status}`}>
                  {timer.status === "finished"
                    ? "时间到"
                    : timer.status === "idle"
                      ? formatRemaining(parseDuration(minutes, seconds) ?? 0)
                      : remaining}
                </div>
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
                            setDurationError("请输入有效时间（秒数为 0–59）");
                            return;
                          }
                          setTimerMode("timer");
                          startTimer(duration, Date.now());
                          setCustomTimerOpen(false);
                        }}
                      >
                        <label>
                          <input
                            aria-label="分钟"
                            inputMode="numeric"
                            placeholder="00"
                            value={minutes}
                            maxLength={3}
                            onChange={(event) => {
                              setMinutes(event.target.value);
                              setDurationError("");
                            }}
                          />
                          <span>分</span>
                        </label>
                        <span className="time-separator">:</span>
                        <label>
                          <input
                            aria-label="秒"
                            inputMode="numeric"
                            placeholder="00"
                            value={seconds}
                            maxLength={2}
                            onChange={(event) => {
                              setSeconds(event.target.value);
                              setDurationError("");
                            }}
                          />
                          <span>秒</span>
                        </label>
                        <button type="submit">开始</button>
                        <button
                          type="button"
                          className="is-ghost"
                          onClick={() => setCustomTimerOpen(false)}
                        >
                          返回
                        </button>
                      </form>
                    ) : (
                      <div className="timer-controls">
                        {(
                          [
                            { minutes: 1, mode: "timer", label: "1 分钟" },
                            { minutes: 5, mode: "break", label: "休息 5 分" },
                            { minutes: 25, mode: "focus", label: "专注 25 分" },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.mode}
                            onClick={() => {
                              setTimerMode(preset.mode);
                              startTimer(preset.minutes * 60_000, Date.now());
                              setCustomTimerOpen(false);
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                        <button
                          className="is-ghost"
                          onClick={() => setCustomTimerOpen(true)}
                        >
                          自定义
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
                    <button onClick={() => setTimer({ status: "idle" })}>
                      知道了
                    </button>
                    <button
                      onClick={() => startTimer(lastDuration, Date.now())}
                    >
                      再计一次
                    </button>
                    {timerMode !== "timer" && (
                      <button
                        onClick={() => {
                          const next =
                            timerMode === "focus" ? "break" : "focus";
                          setTimerMode(next);
                          startTimer(
                            (next === "focus" ? 25 : 5) * 60_000,
                            Date.now(),
                          );
                        }}
                      >
                        {timerMode === "focus" ? "开始休息" : "开始专注"}
                      </button>
                    )}
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
                      {timer.status === "running" ? "暂停" : "继续"}
                    </button>
                    <button onClick={() => setTimer({ status: "idle" })}>
                      取消
                    </button>
                    <button
                      onClick={() => {
                        setTimer((current) => extendTimer(current, 60_000));
                        setLastDuration((current) => current + 60_000);
                      }}
                    >
                      +1 分钟
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="island-pager">
            <button
              className="pager-arrow is-left"
              aria-label="上一页"
              title="上一页"
              onClick={() => cyclePage(-1)}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <div className="pager-dots" role="tablist" aria-label="灵动岛页面">
              {ISLAND_PAGES.map((page) => (
                <button
                  key={page.id}
                  role="tab"
                  aria-selected={activeTab === page.id}
                  aria-label={page.label}
                  title={page.label}
                  className={activeTab === page.id ? "active" : ""}
                  onClick={() => selectPage(page.id)}
                />
              ))}
            </div>
            <button
              className="pager-arrow is-right"
              aria-label="下一页"
              title="下一页"
              onClick={() => cyclePage(1)}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {error && (
        <span role="alert" className="island-error">
          {error}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {timer.status === "finished" ? "倒计时结束" : ""}
      </span>
    </div>
  );
}
