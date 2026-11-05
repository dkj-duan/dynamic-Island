import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Clock3, Music2 } from "lucide-react";
import { quotaRings } from "../../domain/aiQuota";
import type { AppearanceSettings, IdleWidgetId } from "../../domain/settings";
import { QuotaRings } from "../ai/QuotaRings";
import { ProviderIcon } from "../ai/ProviderIcon";
import { availableIdleWidgets, type IdleData } from "./idleWidgetData";
import waterDrop from "../../assets/water-drop.webp";
import pomodoroClock from "../../assets/pomodoro-clock.png";

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
}: {
  appearance: AppearanceSettings;
  data: IdleData;
  onReorder?: (widgets: IdleWidgetId[]) => void;
  onWidthChange?: (width: number) => void;
}) {
  const [dragId, setDragId] = useState<IdleWidgetId | null>(null);
  const [overId, setOverId] = useState<IdleWidgetId | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  useEffect(() => {
    const element = rootRef.current;
    if (!onWidthChange || !element) return;
    const report = () => {
      const width = element.offsetWidth;
      if (width > 0) onWidthChange(width);
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, [onWidthChange]);

  const widgets = availableIdleWidgets(appearance, data);
  const music = useIdleMusic(data.music);
  const style = { width: "fit-content" } as const;

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
      <div className="island idle-widgets is-empty" style={style} ref={rootRef}>
        <span className="idle-brand">Dynamic Island</span>
      </div>
    );
  }
  return (
    <div className="island idle-widgets" style={style} ref={rootRef}>
      {widgets.map((id) => (
        <span
          className={`idle-widget idle-widget-${id} ${onReorder ? "is-draggable" : ""} ${dragId === id ? "is-dragging" : ""} ${overId === id ? "is-drop-target" : ""}`}
          key={id}
          data-idle-widget={id}
          title={
            id === "music" ? `${music.title} · ${music.artist}` : undefined
          }
          draggable={false}
          onPointerDown={(event) => startDrag(event, id)}
        >
          {id === "clock" && (
            <>
              <Clock3 size={16} aria-hidden="true" />
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
                <ProviderIcon provider={data.quota.provider} size="normal" />
              )}
            </>
          )}
          {id === "water" && data.water && (
            <>
              <img className="idle-widget-drop" src={waterDrop} alt="" />
              <span>{data.water.percent}%</span>
            </>
          )}
          {id === "pomodoro" && data.pomodoros != null && (
            <>
              <img className="idle-widget-tomato" src={pomodoroClock} alt="" />
              <span>{data.pomodoros}</span>
            </>
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
                  <Music2 size={14} aria-hidden="true" />
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
      ))}
    </div>
  );
}
