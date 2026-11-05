import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  COUNTDOWN_VERSION,
  defaultCountdowns,
  parseCountdowns,
  type CountdownSettings,
} from "../domain/countdown";
import { parsePersistedTimer, type PersistedTimer } from "../domain/timer";

export async function loadCountdowns(): Promise<CountdownSettings> {
  if (!isTauri()) return defaultCountdowns;
  try {
    const value = await invoke<unknown | null>("load_countdowns");
    return value === null ? defaultCountdowns : parseCountdowns(value);
  } catch {
    return defaultCountdowns;
  }
}

export async function saveCountdowns(
  settings: CountdownSettings,
): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览不支持保存倒计时");
  const value = { ...settings, version: COUNTDOWN_VERSION };
  parseCountdowns(value);
  await invoke("save_countdowns", { value });
}

export async function loadPersistedTimer(): Promise<PersistedTimer | null> {
  if (!isTauri()) return null;
  try {
    const value = await invoke<unknown | null>("load_timer");
    return value === null ? null : parsePersistedTimer(value);
  } catch {
    return null;
  }
}

export async function savePersistedTimer(
  timer: PersistedTimer | null,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_timer", { value: timer });
}
