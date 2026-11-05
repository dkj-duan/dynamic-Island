import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  defaultPomodoroSettings,
  emptyProgress,
  normalizeProgress,
  parsePomodoroProgress,
  parsePomodoroSettings,
  pomodoroVersion,
  type PomodoroProgress,
  type PomodoroSettings,
} from "../domain/pomodoro";

export async function loadPomodoroSettings(): Promise<PomodoroSettings> {
  if (!isTauri()) return defaultPomodoroSettings;
  try {
    const value = await invoke<unknown | null>("load_pomodoro");
    return parsePomodoroSettings(value) ?? defaultPomodoroSettings;
  } catch {
    return defaultPomodoroSettings;
  }
}

export async function savePomodoroSettings(
  settings: PomodoroSettings,
): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览不支持保存设置");
  await invoke("save_pomodoro", {
    value: { version: pomodoroVersion, ...settings },
  });
}

export async function loadPomodoroProgress(
  now = Date.now(),
): Promise<PomodoroProgress> {
  if (!isTauri()) return emptyProgress(now);
  try {
    const value = await invoke<unknown | null>("load_pomodoro_progress");
    return normalizeProgress(parsePomodoroProgress(value), now);
  } catch {
    return emptyProgress(now);
  }
}

export async function savePomodoroProgress(
  progress: PomodoroProgress,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_pomodoro_progress", {
    value: { version: pomodoroVersion, ...progress },
  });
}
