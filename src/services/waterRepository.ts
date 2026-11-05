import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DailyStat } from "../domain/dailyStats";
import { localDay } from "../domain/pomodoro";
import {
  defaultWaterSettings,
  parseWaterSettings,
  waterVersion,
  type WaterSettings,
} from "../domain/water";

export async function loadWaterSettings(): Promise<WaterSettings> {
  if (!isTauri()) return defaultWaterSettings;
  try {
    const value = await invoke<unknown | null>("load_water");
    return parseWaterSettings(value) ?? defaultWaterSettings;
  } catch {
    return defaultWaterSettings;
  }
}

export async function saveWaterSettings(
  settings: WaterSettings,
): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览不支持保存设置");
  await invoke("save_water", {
    value: { version: waterVersion, ...settings },
  });
}

export async function addWater(
  amountMl: number,
  now = Date.now(),
): Promise<DailyStat> {
  if (!isTauri()) throw new Error("浏览器预览不支持记录饮水");
  return invoke<DailyStat>("add_water", {
    day: localDay(now),
    amountMl,
  });
}

export async function resetWater(now = Date.now()): Promise<DailyStat> {
  if (!isTauri()) throw new Error("浏览器预览不支持重置饮水");
  return invoke<DailyStat>("reset_water", { day: localDay(now) });
}

export async function recordPomodoro(
  focusMinutes: number,
  now = Date.now(),
): Promise<DailyStat> {
  if (!isTauri()) throw new Error("浏览器预览不支持记录专注");
  return invoke<DailyStat>("record_pomodoro", {
    day: localDay(now),
    focusMinutes,
  });
}

export async function loadDailyStats(limit = 30): Promise<DailyStat[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<DailyStat[]>("get_daily_stats", { limit });
  } catch {
    return [];
  }
}
