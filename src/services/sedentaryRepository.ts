import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DailyStat } from "../domain/dailyStats";
import { localDay } from "../domain/pomodoro";
import {
  defaultSedentarySettings,
  emptySedentaryProgress,
  normalizeSedentaryProgress,
  parseSedentaryProgress,
  parseSedentarySettings,
  sedentaryProgressVersion,
  sedentaryVersion,
  type SedentaryProgress,
  type SedentarySettings,
} from "../domain/sedentary";

export async function loadSedentarySettings(): Promise<SedentarySettings> {
  if (!isTauri()) return defaultSedentarySettings;
  try {
    const value = await invoke<unknown | null>("load_sedentary");
    return parseSedentarySettings(value) ?? defaultSedentarySettings;
  } catch {
    return defaultSedentarySettings;
  }
}

export async function saveSedentarySettings(
  settings: SedentarySettings,
): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览不支持保存设置");
  await invoke("save_sedentary", {
    value: { version: sedentaryVersion, ...settings },
  });
}

export async function loadSedentaryProgress(
  now = Date.now(),
): Promise<SedentaryProgress> {
  if (!isTauri()) return emptySedentaryProgress(now);
  try {
    const value = await invoke<unknown | null>("load_sedentary_progress");
    return normalizeSedentaryProgress(parseSedentaryProgress(value), now);
  } catch {
    return emptySedentaryProgress(now);
  }
}

export async function saveSedentaryProgress(
  progress: SedentaryProgress,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_sedentary_progress", {
    value: { version: sedentaryProgressVersion, ...progress },
  });
}

export async function recordStand(now = Date.now()): Promise<DailyStat> {
  if (!isTauri()) throw new Error("浏览器预览不支持记录起身");
  return invoke<DailyStat>("record_sedentary", { day: localDay(now) });
}

export async function resetSedentary(now = Date.now()): Promise<DailyStat> {
  if (!isTauri()) throw new Error("浏览器预览不支持重置起身数据");
  return invoke<DailyStat>("reset_sedentary", { day: localDay(now) });
}
