import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  defaultAppearance,
  parseAppearance,
  type AppearanceSettings,
} from "../domain/settings";

export const hasDesktopStorage = isTauri();

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
    version: 12,
    ...appearance,
    showClock: appearance.idleWidgets.includes("clock"),
  };
  parseAppearance(value);
  await invoke("save_appearance", { value });
}
