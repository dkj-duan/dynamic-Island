import type { CSSProperties } from "react";
import {
  automaticIslandText,
  type AppearanceSettings,
} from "../../domain/settings";

export function islandColorStyle(
  appearance: AppearanceSettings,
): CSSProperties {
  const background = appearance.islandBackgroundColor;
  const contrastInk = background ? automaticIslandText(background) : undefined;
  return {
    "--island-custom-background": background ?? undefined,
    "--island-contrast-ink": contrastInk,
    "--island-custom-text": appearance.islandTextColor ?? contrastInk,
  } as CSSProperties;
}
