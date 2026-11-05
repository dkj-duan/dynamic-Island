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
] as const;
export type IdleWidgetId = (typeof idleWidgetIds)[number];

export interface AppearanceSettings {
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
  /** Show the current lyric instead of the artist in the music capsule. */
  islandLyrics: boolean;
}
export const defaultAppearance: AppearanceSettings = {
  theme: "system",
  scale: 1,
  showClock: true,
  autoCollapseSeconds: 3,
  expandTrigger: "click",
  language: defaultLanguage,
  idleWidgets: ["clock", "quota"],
  islandLyrics: false,
};

function parseIdleWidgets(value: unknown): IdleWidgetId[] {
  if (!Array.isArray(value)) throw new Error("闲时内容无效");
  const widgets: IdleWidgetId[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !idleWidgetIds.includes(item as IdleWidgetId) ||
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
      item.version !== 7) ||
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
      ? parseIdleWidgets(item.idleWidgets)
      : item.showClock
        ? ["clock", "quota"]
        : ["quota"];
  let islandLyrics = false;
  if (item.version === 7) {
    if (typeof item.islandLyrics !== "boolean")
      throw new Error("岛上歌词设置无效");
    islandLyrics = item.islandLyrics;
  }
  return {
    theme,
    scale: item.scale,
    showClock: idleWidgets.includes("clock"),
    autoCollapseSeconds,
    expandTrigger,
    language,
    idleWidgets,
    islandLyrics,
  };
}
