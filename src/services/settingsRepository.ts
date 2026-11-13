import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  defaultAppearance,
  parseAppearance,
  type AppearanceSettings,
} from "../domain/settings";

export const hasDesktopStorage = isTauri();

/** Current appearance schema version; payloads to other windows must carry
 *  it, or their newer fields fall back to defaults on parse. */
export const APPEARANCE_VERSION = 19;

export async function loadAppearance(): Promise<AppearanceSettings> {
  if (!hasDesktopStorage) return defaultAppearance;
  const value = await invoke<unknown | null>("load_appearance");
  return value === null ? defaultAppearance : parseAppearance(value);
}

export async function saveAppearance(
  appearance: AppearanceSettings,
): Promise<void> {
  if (!hasDesktopStorage) throw new Error("浏览器预览不支持保存设置");
  const value = {
    version: APPEARANCE_VERSION,
    ...appearance,
    showClock: appearance.idleWidgets.includes("clock"),
  };
  parseAppearance(value);
  await invoke("save_appearance", { value });
}
