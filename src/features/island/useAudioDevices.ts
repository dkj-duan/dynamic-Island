import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AudioDevice } from "../../domain/systemNotices";
import { t } from "../../services/i18n";

type Feedback = { text: string; error: boolean } | null;

export function useAudioDevices(active: boolean) {
  const [devices, setDevices] = useState<AudioDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [switching, setSwitching] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  // A refresh that started before a switch must not overwrite the new state.
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!isTauri()) {
      setFailed(true);
      return;
    }
    const current = generation.current;
    try {
      const list = await invoke<AudioDevice[]>("get_audio_devices");
      if (current !== generation.current) return;
      setDevices(list);
      setFailed(false);
    } catch (error) {
      console.error("Unable to read audio devices", error);
      if (current === generation.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active, load]);

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  async function switchDevice(device: AudioDevice) {
    if (!isTauri() || switching || device.isDefault) return;
    generation.current += 1;
    setSwitching(device.id);
    setFeedback(null);
    try {
      await invoke("set_audio_device", { deviceId: device.id });
      setDevices(
        (current) =>
          current?.map((item) =>
            item.direction === device.direction
              ? { ...item, isDefault: item.id === device.id }
              : item,
          ) ?? current,
      );
      await load();
      setFeedback({
        text: t(
          device.direction === "input" ? "已切换输入设备" : "已切换输出设备",
        ),
        error: false,
      });
    } catch (error) {
      await load();
      setFeedback({
        text: typeof error === "string" ? error : t("切换音频设备失败，请重试"),
        error: true,
      });
    } finally {
      setSwitching("");
    }
  }

  return { devices, failed, switching, feedback, refresh: load, switchDevice };
}
