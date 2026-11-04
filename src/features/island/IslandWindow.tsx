import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
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
  Bot,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { defaultAppearance, parseAppearance } from "../../domain/settings";
import { loadAppearance } from "../../services/settingsRepository";
import { CompactClock, IslandContent } from "./IslandPreview";
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
  const pinnedAiItem = pinnedAiResult?.quota?.items[0];
  const [selectedAiId, setSelectedAiId] = useState("");
  const selectedAi =
    ai.accounts.find((account) => account.id === selectedAiId) ??
    pinnedAi ??
    ai.accounts[0];
  const selectedAiResult = selectedAi ? ai.results[selectedAi.id] : undefined;
  const selectedItems = selectedAiResult?.quota?.items ?? [];
  const selectedRings = quotaRings(selectedItems);
  const { recent: recentMail, highlight: mailHighlight } = useMail();
  const [copyStatus, setCopyStatus] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [mailIndex, setMailIndex] = useState(0);
  const selectedMail = recentMail[Math.min(mailIndex, recentMail.length - 1)];
  const currentCopyStatus =
    selectedMail?.code === copyStatus?.code ? copyStatus?.message : "";
  const [appearance, setAppearance] = useState(defaultAppearance);
  const panel = useRef<HTMLDivElement>(null);
  const collapseTimeout = useRef<number | null>(null);
  const scheduleCollapseRef = useRef<() => void>(() => {});
  const [expanded, setExpanded] = useState(false);
  const [largeDisplay, setLargeDisplay] = useState(
    () => window.screen.width >= 2304,
  );
  useEffect(() => {
    const update = () => setLargeDisplay(window.screen.width >= 2304);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
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
    const delay = appearance.autoCollapseSeconds;
    if (!expanded || delay === 0 || transitioning) return;
    collapseTimeout.current = window.setTimeout(() => {
      collapseTimeout.current = null;
      if (!panel.current?.matches(":hover")) {
        void toggleExpanded();
      }
    }, delay * 1000);
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
    media: !!media?.title,
  });
  const remaining = formatRemaining(remainingMilliseconds(timer, now));
  async function controlMedia(action: "previous" | "toggle" | "next") {
    try {
      const applied = await invoke<boolean>("control_media", { action });
      if (!applied) throw new Error("Media action rejected");
      setMediaError("");
      window.setTimeout(async () => {
        try {
          setMedia(await invoke("get_media_state"));
        } catch {
          /* next poll will retry */
        }
      }, 250);
    } catch {
      setMediaError("当前播放器暂不支持此操作");
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
    } catch {
      setCopyStatus({ code, message: "复制失败" });
    }
  }
  return (
    <div
      className={`desktop-island ${expanded ? "is-expanded" : ""} ${timer.status === "finished" ? "timer-finished" : ""}`}
    >
      <div
        ref={panel}
        className="island-panel"
        style={{
          width: expanded ? 340 : (largeDisplay ? 240 : 210) * appearance.scale,
        }}
        onMouseEnter={cancelAutoCollapse}
        onMouseLeave={scheduleAutoCollapse}
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
          onClick={() => {
            if (!expanded && display === "mail") {
              setActiveTab("mail");
              setMailIndex(0);
              setCopyStatus(null);
            }
            void toggleExpanded();
          }}
        >
          {expanded ? (
            <span className="island-expanded-title">灵动岛</span>
          ) : display === "notice" && notice ? (
            <span className="island-current system-notice" role="status">
              <NoticeIcon kind={notice.kind} />
              <span className="system-notice-label">{notice.label}</span>
              <strong>{notice.value}</strong>
            </span>
          ) : display === "mail" ? (
            <span className="island-current system-notice" role="status">
              <Mail size={16} />
              <span className="system-notice-label">
                {recentMail[0].code ? "收到邮箱验证码" : "收到新邮件"}
              </span>
              <ChevronDown className="toggle-mark" size={15} />
            </span>
          ) : display === "timer" || display === "finished" ? (
            <span className="island-current compact-timer">
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
                <span className="compact-secondary">
                  {media?.title
                    ? `♫ ${media.title}`
                    : pinnedAi && pinnedAiItem
                      ? `${pinnedAi.name} · ${pinnedAiItem.value}`
                      : timer.status === "finished"
                        ? "点击查看"
                        : "点击管理计时"}
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
                {mediaPosition !== null ? (
                  formatMediaTime(mediaPosition)
                ) : (
                  <MediaWave playing={media.playing} compact />
                )}
                <span>
                  {pinnedAi && pinnedAiItem
                    ? `${pinnedAi.name} ${pinnedAiItem.value}`
                    : media.playing
                      ? "播放中"
                      : "已暂停"}
                </span>
              </span>
              {pinnedAiItem &&
                quotaRings(pinnedAiResult?.quota?.items ?? []).length > 0 && (
                  <QuotaRings
                    items={pinnedAiResult?.quota?.items ?? []}
                    compact
                    provider={pinnedAi?.provider}
                  />
                )}
            </span>
          ) : pinnedAi ? (
            <span className="island-current compact-timer compact-idle-quota">
              {appearance.showClock && <CompactClock />}
              {quotaRings(pinnedAiResult?.quota?.items ?? []).length ? (
                <QuotaRings
                  items={pinnedAiResult?.quota?.items ?? []}
                  compact
                  provider={pinnedAi.provider}
                />
              ) : (
                <ProviderIcon provider={pinnedAi.provider} size="normal" />
              )}
              <span className="compact-copy">
                <span className="compact-primary">{pinnedAi.name}</span>
                <span className="compact-secondary">
                  {pinnedAiItem?.label ??
                    (pinnedAiResult?.error ? "查询失败" : "正在查询…")}
                </span>
              </span>
              <span className="island-timer-value">
                {pinnedAiItem?.value ?? "—"}
              </span>
            </span>
          ) : (
            <IslandContent appearance={appearance} />
          )}
        </button>
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
          <div className="island-tabs" role="tablist" aria-label="灵动岛功能">
            <button
              role="tab"
              aria-selected={activeTab === "timer"}
              className={activeTab === "timer" ? "active" : ""}
              onClick={() => setActiveTab("timer")}
            >
              <Timer size={13} />
              计时器
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "music"}
              className={activeTab === "music" ? "active" : ""}
              onClick={() => setActiveTab("music")}
            >
              <Music2 size={13} />
              音乐
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "mail"}
              className={activeTab === "mail" ? "active" : ""}
              onClick={() => {
                setActiveTab("mail");
                setMailIndex(0);
                setCopyStatus(null);
              }}
            >
              <Mail size={13} />
              邮件{recentMail.length > 0 && <span className="mail-tab-dot" />}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "ai"}
              className={activeTab === "ai" ? "active" : ""}
              onClick={() => setActiveTab("ai")}
            >
              <Bot size={13} />
              额度
            </button>
          </div>
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
                    className="quota-account-picker"
                    role="group"
                    aria-label="选择 AI 账户"
                  >
                    {ai.accounts.map((account) => (
                      <button
                        key={account.id}
                        className={
                          account.id === selectedAi?.id ? "selected" : ""
                        }
                        aria-pressed={account.id === selectedAi?.id}
                        title={`${account.name} · ${aiProviderName(account.provider)}`}
                        onClick={() => setSelectedAiId(account.id)}
                      >
                        <ProviderIcon
                          provider={account.provider}
                          size="normal"
                        />
                        <span>
                          {account.name} · {aiProviderName(account.provider)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="quota-detail">
                    {selectedRings.length ? (
                      <QuotaRings items={selectedItems} />
                    ) : (
                      <div className="quota-balance-icon">
                        <ProviderIcon
                          provider={selectedAi?.provider ?? ""}
                          size="large"
                        />
                      </div>
                    )}
                    <div className="quota-detail-copy">
                      <div className="quota-detail-heading">
                        <ProviderIcon
                          provider={selectedAi?.provider ?? ""}
                          size="normal"
                        />
                        {selectedAi?.name}{" "}
                        <span>
                          {selectedAi
                            ? aiProviderName(selectedAi.provider)
                            : ""}
                          {selectedAi?.pinned ? " · 常驻" : ""}
                        </span>
                      </div>
                      {selectedItems.length ? (
                        <div className="quota-metrics">
                          {selectedItems.map((item, index) => (
                            <div
                              className="quota-metric"
                              key={`${item.label}-${index}`}
                            >
                              <span className="quota-metric-label">
                                {selectedRings.some(
                                  (ring) => ring.item === item,
                                ) && (
                                  <i
                                    className={`quota-dot quota-dot-${selectedRings.findIndex((ring) => ring.item === item)}`}
                                  />
                                )}
                                {item.label}
                              </span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="quota-message">
                          {selectedAiResult?.error ?? "正在查询额度…"}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : activeTab === "mail" ? (
            <div className="island-mail-view">
              {selectedMail ? (
                <>
                  <div className="island-mail-heading">
                    <span>{selectedMail.account}</span>
                    <small>最近提醒 · 5 分钟内</small>
                  </div>
                  <strong className="island-mail-subject">
                    {selectedMail.subject || "新邮件"}
                  </strong>
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
                    <p className="island-mail-empty">这封邮件未识别到验证码</p>
                  )}
                  {recentMail.length > 1 && (
                    <div className="island-mail-navigation">
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
                    </div>
                  )}
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
                              setSeekPreview(Number(event.currentTarget.value))
                            }
                            onPointerUp={(event) =>
                              void seekMedia(Number(event.currentTarget.value))
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
                          <span>{formatMediaTime(media.durationSeconds)}</span>
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
                      {media.playing ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
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
            <>
              <div className="timer-heading">
                <div>
                  <strong>
                    {timerMode === "focus"
                      ? "专注"
                      : timerMode === "break"
                        ? "休息"
                        : "计时器"}
                  </strong>
                  <span>
                    {timer.status === "finished"
                      ? "倒计时已结束"
                      : timer.status === "paused"
                        ? "已暂停"
                        : timer.status === "running"
                          ? "进行中"
                          : "选择时长"}
                  </span>
                </div>
                <div className="timer-time">
                  {timer.status === "idle" ? "00:00" : remaining}
                </div>
              </div>
              {timer.status === "idle" ? (
                <>
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
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
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
                    }}
                  >
                    <label>
                      <span>分</span>
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
                    </label>
                    <span className="time-separator">:</span>
                    <label>
                      <span>秒</span>
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
                    </label>
                    <button type="submit">开始</button>
                  </form>
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
                  <button onClick={() => startTimer(lastDuration, Date.now())}>
                    再计一次
                  </button>
                  {timerMode !== "timer" && (
                    <button
                      onClick={() => {
                        const next = timerMode === "focus" ? "break" : "focus";
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
            </>
          )}
        </div>
        <div
          className="island-actions"
          aria-hidden={!expanded}
          inert={!expanded}
        >
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
