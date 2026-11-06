import {
  defaultLanguage,
  parseLanguage,
  type Language,
} from "../services/i18n";

export type ExpandTrigger = "click" | "hover";

export const idleWidgetIds = [
  "clock",
  "quota",
  "water",
  "pomodoro",
  "music",
  "battery",
  "focus",
  "streak",
  "volume",
  "bluetooth",
  "waterTimer",
  "countdown",
  "mascot",
] as const;
export type IdleWidgetId = (typeof idleWidgetIds)[number];

/** The capsule is 338px wide; six compact widgets are the safe ceiling. */
export const MAX_IDLE_WIDGETS = 6;

export const pomodoroIdleViews = ["count", "focus", "cycle"] as const;
export type PomodoroIdleView = (typeof pomodoroIdleViews)[number];

/** How the capsule draws attention when a reminder arrives. */
export const reminderStyles = [
  "breathe",
  "sweep",
  "pulse",
  "beam",
  "none",
] as const;
export type ReminderStyle = (typeof reminderStyles)[number];
/** Version 9 predates the travelling border beam. */
const legacyReminderStyles: readonly ReminderStyle[] = [
  "breathe",
  "sweep",
  "pulse",
  "none",
];

export const expandedShapes = [
  "classic",
  "soft",
  "asymmetric",
  "oval",
] as const;
export type ExpandedShape = (typeof expandedShapes)[number];

/** A recorded global hotkey; `null` disables the action. */
export type HotkeySetting = { combo: string; double: boolean };
/** The keys a recording accepts, normalized the way Rust parses them. */
export const hotkeyKeyPattern =
  /^(?:[A-Z0-9]|F(?:1[0-9]?|2[0-4]|[1-9])|Space)$/;

export interface AppearanceSettings {
  expandedShape: ExpandedShape;
  theme: "system" | "light" | "dark";
  scale: number;
  showClock: boolean;
  autoCollapseSeconds: number;
  /** How the collapsed capsule opens: clicking it, or pointing at it. */
  expandTrigger: ExpandTrigger;
  /** UI language for both windows. */
  language: Language;
  /** Ordered pieces shown in the capsule while the island is idle. */
  idleWidgets: IdleWidgetId[];
  /** What the pomodoro idle widget reports. */
  pomodoroView: PomodoroIdleView;
  /** Show the current lyric instead of the artist in the music capsule. */
  islandLyrics: boolean;
  /** Reminder attention effect. */
  reminderStyle: ReminderStyle;
  /** Open the panel by itself when a reminder arrives. */
  reminderAutoExpand: boolean;
  /** Global shortcut that starts, pauses or resumes a focus session. */
  hotkeyFocus: HotkeySetting | null;
  /** Global shortcut that logs one cup of water. */
  hotkeyWater: HotkeySetting | null;
  /** Global shortcut that expands or collapses the island. */
  hotkeyIsland: HotkeySetting | null;
  /** Forward desktop toast notifications to the island capsule. */
  forwardNotifications: boolean;
}
export const defaultAppearance: AppearanceSettings = {
  expandedShape: "classic",
  theme: "system",
  scale: 1,
  showClock: true,
  autoCollapseSeconds: 3,
  expandTrigger: "click",
  language: defaultLanguage,
  idleWidgets: ["clock", "quota"],
  pomodoroView: "count",
  islandLyrics: false,
  reminderStyle: "breathe",
  reminderAutoExpand: false,
  hotkeyFocus: { combo: "Ctrl+Alt+P", double: false },
  hotkeyWater: { combo: "Ctrl+Alt+W", double: false },
  hotkeyIsland: { combo: "Ctrl+Alt+E", double: false },
  forwardNotifications: false,
};

function parseHotkey(value: unknown): HotkeySetting | null {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) {
    throw new Error("快捷键设置无效");
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.combo !== "string" ||
    item.combo.length === 0 ||
    item.combo.length > 32 ||
    !comboShapeValid(item.combo) ||
    typeof item.double !== "boolean"
  ) {
    throw new Error("快捷键设置无效");
  }
  return { combo: item.combo, double: item.double };
}

/** The combo must be modifiers plus exactly one non-modifier key. */
function comboShapeValid(combo: string): boolean {
  const parts = combo.split("+").map((part) => part.trim());
  if (parts.length < 1 || parts.length > 5) return false;
  const key = parts[parts.length - 1];
  if (!hotkeyKeyPattern.test(key)) return false;
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  if (
    modifiers.length !== new Set(modifiers).size ||
    !modifiers.every((part) => ["ctrl", "shift", "alt", "win"].includes(part))
  ) {
    return false;
  }
  // A bare letter, digit or Space would swallow normal typing system-wide.
  if (/^[A-Z0-9]$/.test(key) || key === "Space") return modifiers.length >= 1;
  return true;
}

function parseIdleWidgets(value: unknown, version: number): IdleWidgetId[] {
  if (!Array.isArray(value)) throw new Error("闲时内容无效");
  const widgets: IdleWidgetId[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !idleWidgetIds.includes(item as IdleWidgetId) ||
      (item === "mascot" && version < 11) ||
      widgets.includes(item as IdleWidgetId)
    ) {
      throw new Error("闲时内容无效");
    }
    widgets.push(item as IdleWidgetId);
  }
  return widgets;
}

/** Reject malformed or future data instead of silently overwriting it. */
export function parseAppearance(value: unknown): AppearanceSettings {
  if (typeof value !== "object" || value === null)
    throw new Error("设置格式无效");
  const item = value as Record<string, unknown>;
  if (
    (item.version !== 1 &&
      item.version !== 2 &&
      item.version !== 3 &&
      item.version !== 4 &&
      item.version !== 5 &&
      item.version !== 6 &&
      item.version !== 7 &&
      item.version !== 8 &&
      item.version !== 9 &&
      item.version !== 10 &&
      item.version !== 11 &&
      item.version !== 12 &&
      item.version !== 13) ||
    typeof item.scale !== "number" ||
    !Number.isFinite(item.scale) ||
    item.scale < 0.8 ||
    item.scale > 1.2 ||
    typeof item.showClock !== "boolean"
  ) {
    throw new Error("设置版本或内容无效");
  }
  const autoCollapseSeconds =
    item.version === 1
      ? defaultAppearance.autoCollapseSeconds
      : item.autoCollapseSeconds;
  if (
    typeof autoCollapseSeconds !== "number" ||
    ![0, 1, 3, 5, 10, 15].includes(autoCollapseSeconds)
  ) {
    throw new Error("自动收起时长无效");
  }
  const theme = item.version >= 3 ? item.theme : "system";
  if (theme !== "system" && theme !== "light" && theme !== "dark")
    throw new Error("主题设置无效");
  const expandTrigger =
    item.version >= 4 ? item.expandTrigger : defaultAppearance.expandTrigger;
  if (expandTrigger !== "click" && expandTrigger !== "hover")
    throw new Error("展开方式无效");
  const language =
    item.version >= 5
      ? parseLanguage(item.language)
      : defaultAppearance.language;
  const idleWidgets: IdleWidgetId[] =
    item.version >= 6
      ? parseIdleWidgets(item.idleWidgets, item.version as number)
      : item.showClock
        ? ["clock", "quota"]
        : ["quota"];
  let islandLyrics = false;
  if (item.version >= 7) {
    if (typeof item.islandLyrics !== "boolean")
      throw new Error("岛上歌词设置无效");
    islandLyrics = item.islandLyrics;
  }
  let pomodoroView = defaultAppearance.pomodoroView;
  if (item.version >= 8) {
    if (!pomodoroIdleViews.includes(item.pomodoroView as PomodoroIdleView))
      throw new Error("番茄组件显示方式无效");
    pomodoroView = item.pomodoroView as PomodoroIdleView;
  }
  let reminderStyle = defaultAppearance.reminderStyle;
  let reminderAutoExpand = defaultAppearance.reminderAutoExpand;
  if (item.version >= 9) {
    const styles = item.version >= 10 ? reminderStyles : legacyReminderStyles;
    if (!styles.includes(item.reminderStyle as ReminderStyle))
      throw new Error("提醒动效无效");
    reminderStyle = item.reminderStyle as ReminderStyle;
    if (typeof item.reminderAutoExpand !== "boolean")
      throw new Error("提醒展开设置无效");
    reminderAutoExpand = item.reminderAutoExpand;
  }
  const expandedShape = item.version >= 12 ? item.expandedShape : "classic";
  if (!expandedShapes.includes(expandedShape as ExpandedShape))
    throw new Error("展开样式无效");
  let hotkeyFocus = defaultAppearance.hotkeyFocus;
  let hotkeyWater = defaultAppearance.hotkeyWater;
  let hotkeyIsland = defaultAppearance.hotkeyIsland;
  let forwardNotifications = defaultAppearance.forwardNotifications;
  if (item.version >= 13) {
    hotkeyFocus = parseHotkey(item.hotkeyFocus);
    hotkeyWater = parseHotkey(item.hotkeyWater);
    hotkeyIsland = parseHotkey(item.hotkeyIsland);
    if (typeof item.forwardNotifications !== "boolean") {
      throw new Error("通知转发设置无效");
    }
    forwardNotifications = item.forwardNotifications;
  }
  return {
    expandedShape:
      expandedShape === "oval" || expandedShape === "soft"
        ? "classic"
        : (expandedShape as ExpandedShape),
    theme,
    scale: item.scale,
    showClock: idleWidgets.includes("clock"),
    autoCollapseSeconds,
    expandTrigger,
    language,
    idleWidgets,
    pomodoroView,
    islandLyrics,
    reminderStyle,
    reminderAutoExpand,
    hotkeyFocus,
    hotkeyWater,
    hotkeyIsland,
    forwardNotifications,
  };
}
