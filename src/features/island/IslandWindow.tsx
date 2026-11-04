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
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { defaultAppearance, parseAppearance } from "../../domain/settings";
import { loadAppearance } from "../../services/settingsRepository";
import { IslandContent } from "./IslandPreview";
import {
  formatRemaining,
  parseDuration,
  pauseTimer,
  remainingMilliseconds,
  resumeTimer,
  type TimerState,
} from "../../domain/timer";
import "../../App.css";
import { useSystemNotice } from "./useSystemNotice";
import { useMail } from "../mail/useMail";

type MediaState = {
  title: string;
  artist: string;
  playing: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
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
  const [transitioning, setTransitioning] = useState(false);
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [durationError, setDurationError] = useState("");
  const [lastDuration, setLastDuration] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [media, setMedia] = useState<MediaState | null>(null);
  const [artwork, setArtwork] = useState<{
    key: string;
    src: string | null;
  } | null>(null);
  const mediaKey = media ? JSON.stringify([media.title, media.artist]) : "";
  useEffect(() => {
    if (!mediaKey) return;
    let active = true;
    void invoke<string | null>("get_media_artwork")
      .then((src) => {
        if (active) setArtwork({ key: mediaKey, src });
      })
      .catch(() => {
        if (active) setArtwork({ key: mediaKey, src: null });
      });
    return () => {
      active = false;
    };
  }, [mediaKey]);
  const [activeTab, setActiveTab] = useState<"timer" | "music" | "mail">(
    "timer",
  );
  const [mediaError, setMediaError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const state = await invoke<MediaState | null>("get_media_state");
        if (active) setMedia(state?.title ? state : null);
      } catch (error) {
        console.error("Unable to read Windows media session", error);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
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
  const remaining = formatRemaining(remainingMilliseconds(timer, now));
  async function controlMedia(action: "previous" | "toggle" | "next") {
    try {
      await invoke("control_media", { action });
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
        style={{ width: expanded ? 340 : 210 * appearance.scale }}
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
            if (
              !expanded &&
              mailHighlight &&
              recentMail.length &&
              !notice &&
              timer.status !== "finished"
            ) {
              setActiveTab("mail");
              setMailIndex(0);
              setCopyStatus(null);
            }
            void toggleExpanded();
          }}
        >
          {expanded ? (
            <span className="island-expanded-title">灵动岛</span>
          ) : notice && timer.status !== "finished" ? (
            <span className="island-current system-notice" role="status">
              <NoticeIcon kind={notice.kind} />
              <span className="system-notice-label">{notice.label}</span>
              <strong>{notice.value}</strong>
            </span>
          ) : mailHighlight &&
            recentMail.length > 0 &&
            timer.status !== "finished" ? (
            <span className="island-current system-notice" role="status">
              <Mail size={16} />
              <span className="system-notice-label">
                {recentMail[0].code ? "收到邮箱验证码" : "收到新邮件"}
              </span>
              <ChevronDown className="toggle-mark" size={15} />
            </span>
          ) : timer.status !== "idle" ? (
            <span className="island-current">
              <Timer className="timer-indicator" size={15} aria-hidden="true" />
              <span className="island-timer-value">
                {timer.status === "finished" ? "时间到" : remaining}
              </span>
              <span className="island-timer-status">
                {timer.status === "finished"
                  ? "点击查看"
                  : timer.status === "paused"
                    ? "已暂停"
                    : "计时中"}
              </span>
              <ChevronDown
                className="toggle-mark"
                size={15}
                aria-hidden="true"
              />
            </span>
          ) : media?.title ? (
            <span className="island-current island-media-current">
              <Music2
                className="timer-indicator"
                size={15}
                aria-hidden="true"
              />
              <span className="island-track-title">{media.title}</span>
              <span className="media-playing-mark">
                <MediaWave playing={media.playing} compact />
                {media.playing ? "播放中" : "已暂停"}
              </span>
              <ChevronDown
                className="toggle-mark"
                size={15}
                aria-hidden="true"
              />
            </span>
          ) : (
            <IslandContent appearance={appearance} />
          )}
        </button>
        {expanded && notice && timer.status !== "finished" && (
          <div className="system-notice-banner" role="status">
            <NoticeIcon kind={notice.kind} />
            <span>{notice.label}</span>
            <strong>{notice.value}</strong>
          </div>
        )}
        {expanded &&
          !notice &&
          mailHighlight &&
          recentMail.length > 0 &&
          timer.status !== "finished" && (
            <div className="system-notice-banner" role="status">
              <Mail size={13} />
              <span>
                {recentMail[0].code ? "收到邮箱验证码" : "收到新邮件"}
              </span>
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
          </div>
          {activeTab === "mail" ? (
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
                  <MediaWave playing={media.playing} />
                  {media.durationSeconds != null &&
                    media.positionSeconds != null && (
                      <div
                        className="media-timeline"
                        aria-label={`播放进度 ${formatMediaTime(media.positionSeconds)} / ${formatMediaTime(media.durationSeconds)}`}
                      >
                        <div className="media-progress">
                          <span
                            style={{
                              width: `${Math.min(100, Math.max(0, (media.positionSeconds / media.durationSeconds) * 100))}%`,
                            }}
                          />
                        </div>
                        <div className="media-times">
                          <span>{formatMediaTime(media.positionSeconds)}</span>
                          <span>{formatMediaTime(media.durationSeconds)}</span>
                        </div>
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
                  <strong>计时器</strong>
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
                    {[1, 5, 25].map((minutes) => (
                      <button
                        key={minutes}
                        onClick={() => startTimer(minutes * 60_000, Date.now())}
                      >
                        {minutes} 分钟
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
