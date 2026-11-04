import { isTauri } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import {
  defaultAppearance,
  parseAppearance,
  type AppearanceSettings,
} from "../domain/settings";

const key = "appearance";
export const hasDesktopStorage = isTauri();

export async function loadAppearance(): Promise<AppearanceSettings> {
  if (!hasDesktopStorage) return defaultAppearance;
  const store = await load("settings.json", { autoSave: false });
  const value = await store.get<unknown>(key);
  return value === undefined ? defaultAppearance : parseAppearance(value);
}

export async function saveAppearance(
  appearance: AppearanceSettings,
): Promise<void> {
  if (!hasDesktopStorage) throw new Error("浏览器预览不支持保存设置");
  const value = { version: 2, ...appearance };
  parseAppearance(value);
  const store = await load("settings.json", { autoSave: false });
  await store.set(key, value);
  await store.save();
}
