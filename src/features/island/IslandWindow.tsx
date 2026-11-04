import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Power, Settings2, Timer } from "lucide-react";
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
  scheduleCollapseRef.current = scheduleAutoCollapse;
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
          onClick={() => void toggleExpanded()}
        >
          {timer.status === "idle" ? (
            <IslandContent appearance={appearance} />
          ) : (
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
              {expanded ? (
                <ChevronUp
                  className="toggle-mark"
                  size={15}
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="toggle-mark"
                  size={15}
                  aria-hidden="true"
                />
              )}
            </span>
          )}
        </button>
        <div
          className="island-details"
          aria-hidden={!expanded}
          inert={!expanded}
        >
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
              <button onClick={() => setTimer({ status: "idle" })}>取消</button>
            </div>
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
