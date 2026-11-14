import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check } from "lucide-react";
import { quotaRings } from "../../domain/aiQuota";
import {
  MAX_IDLE_WIDGETS,
  type AppearanceSettings,
  type IdleWidgetId,
} from "../../domain/settings";
import { QuotaRings } from "../ai/QuotaRings";
import { ProviderIcon } from "../ai/ProviderIcon";
import { formatCountdown } from "../../domain/countdown";
import { t } from "../../services/i18n";
import {
  availableIdleWidgets,
  previewIdleWidgets,
  type IdleChangeShownAt,
  type IdleData,
} from "./idleWidgetData";
import batteryIcon from "../../assets/island/battery.png";
import bluetoothIcon from "../../assets/island/bluetooth.png";
import clockIcon from "../../assets/island/clock.png";
import countdownIcon from "../../assets/island/countdown.png";
import focusIcon from "../../assets/island/focus.png";
import musicIcon from "../../assets/island/music.png";
import streakIcon from "../../assets/island/streak.png";
import volumeIcon from "../../assets/island/volume.png";
import waterTimerIcon from "../../assets/island/water-timer.png";
import sedentaryChair from "../../assets/island/away-chair.png";
import waterDrop from "../../assets/water-drop.webp";
import pomodoroClock from "../../assets/pomodoro-clock.png";
import mascotIdle from "../../assets/mascot/idle.png";
import mascotListening from "../../assets/mascot/listening.png";
import mascotWater from "../../assets/mascot/water.png";
import mascotCelebrate from "../../assets/mascot/celebrate.png";
import mascotAttention from "../../assets/mascot/attention.png";
import type { MascotReaction } from "../../domain/mascotReaction";

function CompactClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="compact-clock">
      {now.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </span>
  );
}

function IdleArt({
  src,
  className = "idle-widget-img",
}: {
  src: string;
  className?: string;
}) {
  return (
    <span className="idle-art-frame" aria-hidden="true">
      <img className={className} src={src} alt="" draggable={false} />
    </span>
  );
}

const MAX_IDLE_WIDTH = 338;
const mascotPoses = {
  listening: mascotListening,
  water: mascotWater,
  celebrate: mascotCelebrate,
  attention: mascotAttention,
};

const demoMusic = [
  { title: "Midnight Drive", artist: "Nova Lane" },
  { title: "晚风漫游", artist: "Luna" },
  { title: "Ocean Lights", artist: "Kite" },
  { title: "Starlit Avenue", artist: "Echo Park" },
];

/** Real media when available; otherwise rotate through sample tracks. */
function useIdleMusic(
  real?: { title: string; artist: string; artwork?: string | null } | null,
) {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * demoMusic.length),
  );
  useEffect(() => {
    if (real) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (demoMusic.length < 2) return current;
        let next = current;
        while (next === current) {
          next = Math.floor(Math.random() * demoMusic.length);
        }
        return next;
      });
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [real]);
  return real ?? demoMusic[index];
}

export function IdleWidgets({
  appearance,
  data,
  onReorder,
  onWidthChange,
  changeShownAt,
  changeWindowMs,
  now,
  preview,
  mascotReaction,
  reservedWidth = 0,
}: {
  appearance: AppearanceSettings;
  data: IdleData;
  onReorder?: (widgets: IdleWidgetId[]) => void;
  onWidthChange?: (width: number) => void;
  /** Change-tier tracking from the island window; the preview omits it. */
  changeShownAt?: IdleChangeShownAt;
  changeWindowMs?: number;
  now?: number;
  /** Settings preview: every enabled ambient widget, no change widgets. */
  preview?: boolean;
  mascotReaction?: MascotReaction | null;
  reservedWidth?: number;
}) {
  const [dragId, setDragId] = useState<IdleWidgetId | null>(null);
  const [overId, setOverId] = useState<IdleWidgetId | null>(null);
  const [fitLevel, setFitLevel] = useState(0);
  const fitLevelRef = useRef(0);
  const stopDrag = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const widgets = preview
    ? previewIdleWidgets(appearance)
    : availableIdleWidgets(
        appearance,
        data,
        changeShownAt !== undefined &&
          changeWindowMs !== undefined &&
          now !== undefined
          ? { now, changeWindowMs, changeShownAt }
          : undefined,
      );
  const music = useIdleMusic(data.music);
  const mascotPose = mascotReaction ?? (data.music ? "listening" : null);
  const widgetKey = widgets.join(",");
  const reportedWidth = useRef(0);
  // The preview is not bound by the island's on-screen width; its wider cap
  // keeps every ambient widget readable for drag ordering.
  const widthCap = preview
    ? 720
    : Math.min(MAX_IDLE_WIDTH, 354 - reservedWidth);
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const padding =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap || style.gap) || 0;
    const children = Array.from(element.children) as HTMLElement[];
    const content =
      children.reduce((sum, child) => sum + child.offsetWidth, 0) +
      gap * Math.max(0, children.length - 1);
    const desired = Math.min(widthCap, Math.ceil(content + padding));
    if (desired > 0 && desired !== reportedWidth.current) {
      reportedWidth.current = desired;
      onWidthChange?.(desired);
    }
    // The panel otherwise keeps the width from the first render and clips the
    // tail once a value gets longer, so compact before that can happen.
    if (content + padding > widthCap + 0.5 && fitLevelRef.current < 2) {
      fitLevelRef.current += 1;
      setFitLevel(fitLevelRef.current);
    }
  }, [widgetKey, fitLevel, data, onWidthChange, widthCap]);
  const style = { width: "fit-content", maxWidth: widthCap } as const;

  function applyMove(from: IdleWidgetId, to: IdleWidgetId) {
    if (!onReorder || from === to) return;
    const order = [...appearance.idleWidgets];
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, from);
    onReorder(order);
  }

  function startDrag(event: ReactPointerEvent, id: IdleWidgetId) {
    if (!onReorder || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let target: IdleWidgetId | null = null;
    const move = (current: PointerEvent) => {
      if (
        !moved &&
        Math.hypot(current.clientX - startX, current.clientY - startY) < 4
      ) {
        return;
      }
      moved = true;
      current.preventDefault();
      setDragId(id);
      const element = document
        .elementFromPoint(current.clientX, current.clientY)
        ?.closest<HTMLElement>("[data-idle-widget]");
      const next =
        (element?.dataset.idleWidget as IdleWidgetId | undefined) ?? null;
      target = next && next !== id ? next : null;
      setOverId(target);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      stopDrag.current = null;
      if (moved && target) applyMove(id, target);
      setDragId(null);
      setOverId(null);
    };
    stopDrag.current?.();
    stopDrag.current = finish;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  if (!widgets.length) {
    return (
      <div
        className={`island idle-widgets ${preview ? "is-preview" : ""} is-empty`}
        style={style}
        ref={rootRef}
      >
        <span className="idle-brand">Dynamic Island</span>
      </div>
    );
  }
  function widgetTitle(id: IdleWidgetId): string | undefined {
    if (id === "mascot") return t("小岛伙伴");
    if (id === "music") return `${music.title} · ${music.artist}`;
    if (id === "water" && data.water) {
      return `${t("喝水进度")} ${data.water.percent}%`;
    }
    if (id === "pomodoro") {
      if (appearance.pomodoroView === "focus" && data.focusMinutes != null) {
        return `${t("今日专注")} ${data.focusMinutes} ${t("分钟")}`;
      }
      if (appearance.pomodoroView === "cycle" && data.pomodoroCycle) {
        return `${t("本轮")} ${data.pomodoroCycle.done}/${data.pomodoroCycle.total}`;
      }
      return data.pomodoros != null
        ? `${t("今日番茄")} ${data.pomodoros}`
        : undefined;
    }
    if (id === "battery" && data.battery) {
      return `${t("电池")} ${data.battery.percent}%${data.battery.charging ? ` · ${t("充电中")}` : ""}`;
    }
    if (id === "focus" && data.focusMinutes != null) {
      return `${t("今日专注")} ${data.focusMinutes} ${t("分钟")}`;
    }
    if (id === "streak" && data.streak != null) {
      return `${t("连续专注")} ${data.streak} ${t("天")}`;
    }
    if (id === "volume" && data.volume) {
      return data.volume.muted
        ? t("已静音")
        : `${t("音量")} ${data.volume.percent}%`;
    }
    if (id === "bluetooth" && data.bluetooth) {
      return `${data.bluetooth.name} · ${data.bluetooth.battery}%`;
    }
    if (id === "countdown" && data.countdown) {
      return `${data.countdown.label} · ${data.countdown.reached ? t("已到") : formatCountdown(data.countdown.remainingMs)}`;
    }
    if (id === "waterTimer" && data.waterTimer) {
      if ("done" in data.waterTimer) return t("今日饮水已达标");
      if ("soon" in data.waterTimer) {
        return `${t("下次喝水提醒")} ${t("即将")}`;
      }
      if ("minutes" in data.waterTimer) {
        return `${t("下次喝水提醒")} ${data.waterTimer.minutes} ${t("分")}`;
      }
      return `${t("下次喝水提醒")} · ${data.waterTimer.tomorrow ? `${t("明天")} ` : ""}${data.waterTimer.at}`;
    }
    if (id === "sedentary" && data.sedentary) {
      return `${t("已坐")} ${data.sedentary.minutes} ${t("分钟")}`;
    }
    return undefined;
  }
  return (
    <div
      className={`island idle-widgets ${preview ? "is-preview" : ""} ${fitLevel === 1 ? "is-compact-1" : fitLevel === 2 ? "is-compact-2" : ""}`}
      style={style}
      ref={rootRef}
    >
      {widgets.map((id, index) => {
        const lowBattery =
          id === "battery" && (data.battery?.percent ?? 100) <= 20;
        const waterDone =
          id === "waterTimer" && !!data.waterTimer && "done" in data.waterTimer;
        const countdownDone = id === "countdown" && !!data.countdown?.reached;
        const sedentaryNear =
          id === "sedentary" && !!data.sedentary && !data.sedentary.over;
        const sedentaryOver = id === "sedentary" && !!data.sedentary?.over;
        // Preview only: widgets past the island's six visible slots wait in
        // the queue — dim them and mark the boundary with a divider.
        const queued = preview && index >= MAX_IDLE_WIDGETS;
        return (
          <Fragment key={id}>
            {preview && index === MAX_IDLE_WIDGETS && (
              <span className="idle-queued-divider" aria-hidden="true" />
            )}
            <span
              className={`idle-widget idle-widget-${id} ${lowBattery ? "is-low" : ""} ${waterDone || countdownDone ? "is-done" : ""} ${sedentaryNear ? "is-near" : ""} ${sedentaryOver ? "is-over" : ""} ${onReorder ? "is-draggable" : ""} ${dragId === id ? "is-dragging" : ""} ${overId === id ? "is-drop-target" : ""} ${queued ? "is-queued" : ""}`}
              key={id}
              data-idle-widget={id}
              title={widgetTitle(id)}
              draggable={false}
              onPointerDown={(event) => startDrag(event, id)}
            >
              {id === "clock" && (
                <>
                  <IdleArt src={clockIcon} />
                  <CompactClock />
                </>
              )}
              {id === "quota" && data.quota && (
                <>
                  {quotaRings(data.quota.items).length ? (
                    <QuotaRings
                      items={data.quota.items}
                      compact
                      provider={data.quota.provider}
                    />
                  ) : (
                    <ProviderIcon
                      provider={data.quota.provider}
                      size="normal"
                    />
                  )}
                </>
              )}
              {id === "water" && data.water && (
                <>
                  <span
                    className="idle-water-progress"
                    aria-hidden="true"
                    style={
                      {
                        "--idle-water-progress": `${Math.max(0, Math.min(100, data.water.percent))}%`,
                      } as React.CSSProperties
                    }
                  >
                    <img className="idle-widget-drop" src={waterDrop} alt="" />
                  </span>
                  <span>{data.water.percent}%</span>
                </>
              )}
              {id === "pomodoro" && (
                <>
                  <IdleArt className="idle-widget-tomato" src={pomodoroClock} />
                  <span>
                    {appearance.pomodoroView === "focus" &&
                    data.focusMinutes != null
                      ? `${data.focusMinutes}${t("分")}`
                      : appearance.pomodoroView === "cycle" &&
                          data.pomodoroCycle
                        ? `${data.pomodoroCycle.done}/${data.pomodoroCycle.total}`
                        : (data.pomodoros ?? 0)}
                  </span>
                </>
              )}
              {id === "battery" && data.battery && (
                <>
                  <IdleArt src={batteryIcon} />
                  <span>{data.battery.percent}%</span>
                </>
              )}
              {id === "focus" && data.focusMinutes != null && (
                <>
                  <IdleArt src={focusIcon} />
                  <span>{`${data.focusMinutes}${t("分")}`}</span>
                </>
              )}
              {id === "streak" && data.streak != null && (
                <>
                  <IdleArt src={streakIcon} />
                  <span>{`${data.streak}${t("天")}`}</span>
                </>
              )}
              {id === "volume" && data.volume && (
                <>
                  <IdleArt src={volumeIcon} />
                  <span>
                    {data.volume.muted ? t("静音") : `${data.volume.percent}%`}
                  </span>
                </>
              )}
              {id === "bluetooth" && data.bluetooth && (
                <>
                  <IdleArt src={bluetoothIcon} />
                  <span>{data.bluetooth.battery}%</span>
                </>
              )}
              {id === "countdown" && data.countdown && (
                <>
                  {data.countdown.reached ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <IdleArt src={countdownIcon} />
                  )}
                  <span>
                    {data.countdown.reached
                      ? t("已到")
                      : formatCountdown(data.countdown.remainingMs)}
                  </span>
                </>
              )}
              {id === "waterTimer" && data.waterTimer && (
                <>
                  {"done" in data.waterTimer ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <IdleArt src={waterTimerIcon} />
                  )}
                  <span>
                    {"done" in data.waterTimer
                      ? t("已达标")
                      : "soon" in data.waterTimer
                        ? t("即将")
                        : "minutes" in data.waterTimer
                          ? `${data.waterTimer.minutes}${t("分")}`
                          : data.waterTimer.at}
                  </span>
                </>
              )}
              {id === "sedentary" && data.sedentary && (
                <>
                  <IdleArt src={sedentaryChair} />
                  <span>{`${data.sedentary.minutes}${t("分")}`}</span>
                </>
              )}
              {id === "mascot" && (
                <span
                  className={`idle-mascot ${mascotReaction ? `is-${mascotReaction}` : data.music ? "is-listening" : ""}`}
                  aria-hidden="true"
                >
                  <img src={mascotIdle} alt="" draggable={false} />
                  {mascotPose && (
                    <img
                      className="idle-mascot-pose"
                      src={mascotPoses[mascotPose]}
                      alt=""
                      draggable={false}
                    />
                  )}
                </span>
              )}
              {id === "music" && (
                <>
                  {data.music?.artwork ? (
                    <img
                      className="idle-widget-cover"
                      src={data.music.artwork}
                      alt=""
                    />
                  ) : (
                    <span className="idle-widget-cover is-empty">
                      <img className="idle-widget-img" src={musicIcon} alt="" />
                    </span>
                  )}
                  <span className="idle-widget-wave" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </>
              )}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
