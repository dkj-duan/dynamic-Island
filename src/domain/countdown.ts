export const COUNTDOWN_VERSION = 1;
export const MAX_COUNTDOWNS = 8;

export type CountdownKind = "target" | "duration";

export type CountdownItem = {
  id: string;
  label: string;
  kind: CountdownKind;
  /** HH:mm for target countdowns. */
  targetTime: string | null;
  /** Whole seconds for duration countdowns. */
  durationSeconds: number | null;
};

export type CountdownSettings = {
  version: 1;
  items: CountdownItem[];
  islandId: string | null;
};

export const defaultCountdowns: CountdownSettings = {
  version: COUNTDOWN_VERSION,
  items: [],
  islandId: null,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SECONDS = 999 * 60 + 59;

export function parseCountdowns(value: unknown): CountdownSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("倒计时设置无效");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== COUNTDOWN_VERSION || !Array.isArray(record.items)) {
    throw new Error("倒计时设置版本无效");
  }
  if (record.items.length > MAX_COUNTDOWNS) {
    throw new Error("倒计时数量过多");
  }
  const ids = new Set<string>();
  const items: CountdownItem[] = [];
  for (const raw of record.items) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("倒计时项目无效");
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!id || ids.has(id) || !label || label.length > 24) {
      throw new Error("倒计时名称或标识无效");
    }
    ids.add(id);
    if (entry.kind === "target") {
      if (
        typeof entry.targetTime !== "string" ||
        !TIME_PATTERN.test(entry.targetTime)
      ) {
        throw new Error("倒计时时间无效");
      }
      items.push({
        id,
        label,
        kind: "target",
        targetTime: entry.targetTime,
        durationSeconds: null,
      });
    } else if (entry.kind === "duration") {
      const seconds = entry.durationSeconds;
      if (
        typeof seconds !== "number" ||
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > MAX_SECONDS
      ) {
        throw new Error("倒计时时长无效");
      }
      items.push({
        id,
        label,
        kind: "duration",
        targetTime: null,
        durationSeconds: seconds,
      });
    } else {
      throw new Error("倒计时类型无效");
    }
  }
  const islandId = record.islandId;
  if (
    islandId !== null &&
    (typeof islandId !== "string" || !ids.has(islandId))
  ) {
    throw new Error("岛上倒计时选择无效");
  }
  return {
    version: COUNTDOWN_VERSION,
    items,
    islandId: islandId as string | null,
  };
}

/** Today's target timestamp for a target countdown. */
export function targetTimestamp(
  item: CountdownItem,
  now: number,
): number | null {
  if (item.kind !== "target" || !item.targetTime) return null;
  const [hours, minutes] = item.targetTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return target.getTime();
}

export function targetRemainingMilliseconds(
  item: CountdownItem,
  now: number,
): number {
  const target = targetTimestamp(item, now);
  return target === null ? 0 : Math.max(0, target - now);
}

/** "1:38" above an hour (seconds stop mattering), "13:05" below. */
export function formatCountdown(milliseconds: number): string {
  const total = Math.ceil(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const tail = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : tail;
}

export function formatDurationSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
