export interface AppearanceSettings {
  theme: "system" | "light" | "dark";
  scale: number;
  showClock: boolean;
  autoCollapseSeconds: number;
}
export const defaultAppearance: AppearanceSettings = {
  theme: "system",
  scale: 1,
  showClock: true,
  autoCollapseSeconds: 3,
};

/** Reject malformed or future data instead of silently overwriting it. */
export function parseAppearance(value: unknown): AppearanceSettings {
  if (typeof value !== "object" || value === null)
    throw new Error("设置格式无效");
  const item = value as Record<string, unknown>;
  if (
    (item.version !== 1 && item.version !== 2 && item.version !== 3) ||
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
  const theme = item.version === 3 ? item.theme : "system";
  if (theme !== "system" && theme !== "light" && theme !== "dark")
    throw new Error("主题设置无效");
  return {
    theme,
    scale: item.scale,
    showClock: item.showClock,
    autoCollapseSeconds,
  };
}
