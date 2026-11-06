import { invoke } from "@tauri-apps/api/core";
import type { AudioDevice } from "../domain/systemNotices";
import { t } from "./i18n";

/** Sets the default device and returns the freshly enumerated list. */
export async function switchDefaultAudioDevice(
  device: AudioDevice,
): Promise<AudioDevice[]> {
  await invoke("set_audio_device", { deviceId: device.id });
  return invoke<AudioDevice[]>("get_audio_devices");
}

/** User-facing outcome of a switch; backend messages pass through verbatim. */
export function audioSwitchMessage(
  direction: AudioDevice["direction"],
  error?: unknown,
): string {
  if (error === undefined) {
    return t(direction === "input" ? "已切换输入设备" : "已切换输出设备");
  }
  return typeof error === "string" ? error : t("切换音频设备失败，请重试");
}
