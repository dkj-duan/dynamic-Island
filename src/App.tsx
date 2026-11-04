import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import {
  IslandPreview,
  type PreviewQuota,
} from "./features/island/IslandPreview";
import { SettingsPage } from "./features/settings/SettingsPage";
import { defaultAppearance } from "./domain/settings";
import {
  hasDesktopStorage,
  loadAppearance,
  saveAppearance,
} from "./services/settingsRepository";
import "./styles/index.css";

export default function App() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [status, setStatus] = useState("正在读取设置…");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
  // The preview mirrors what the island actually shows: the pinned account's
  // ring. One read when settings open, no polling.
  const [previewQuota, setPreviewQuota] = useState<PreviewQuota | null>(null);
  useEffect(() => {
    if (!hasDesktopStorage) return;
    let active = true;
    void (async () => {
      try {
        const accounts =
          await invoke<{ id: string; provider: string; pinned: boolean }[]>(
            "list_ai_accounts",
          );
        const pinned = accounts.find((account) => account.pinned);
        if (!pinned) return;
        const quota = await invoke<{
          items: { label: string; value: string }[];
        }>("query_ai_quota", { id: pinned.id });
        if (active)
          setPreviewQuota({
            provider: pinned.provider,
            items: quota.items ?? [],
          });
      } catch {
        if (active) setPreviewQuota(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    loadAppearance()
      .then((value) => {
        if (!active) return;
        setAppearance(value);
        setReady(true);
        setStatus(
          hasDesktopStorage ? "设置已读取" : "浏览器预览：设置不会保存",
        );
      })
      .catch(() => {
        if (active)
          setStatus("设置读取失败，已暂停保存以保护原有数据。请检查配置文件。");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !dirty) return;
    const currentRevision = revision.current;
    const timeout = window.setTimeout(async () => {
      setSaving(true);
      try {
        await saveAppearance(appearance);
        if (revision.current === currentRevision) {
          setDirty(false);
          setStatus("已自动保存并同步");
        }
      } catch {
        setStatus("自动保存失败，请重试");
      } finally {
        setSaving(false);
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [appearance, dirty, ready]);
  async function updateAppearance(value: typeof appearance) {
    setAppearance(value);
    setDirty(true);
    revision.current += 1;
    setStatus("正在同步…");
    try {
      await emitTo("island", "appearance-changed", { version: 4, ...value });
    } catch {
      setStatus("预览已更新，灵动岛将在保存后同步");
    }
  }
  async function reloadFromStorage() {
    const value = await loadAppearance();
    revision.current += 1;
    setAppearance(value);
    setDirty(false);
    setStatus("已切换数据目录");
    await Promise.all([
      emitTo("island", "appearance-changed", { version: 4, ...value }),
      emitTo("island", "mail-accounts-changed"),
      emitTo("island", "ai-accounts-changed"),
    ]);
  }
  return (
    <SettingsPage
      appearance={appearance}
      onAppearanceChange={(value) => void updateAppearance(value)}
      preview={<IslandPreview appearance={appearance} quota={previewQuota} />}
      status={status}
      canEdit={ready && !saving}
      canSwitchStorage={ready && !saving && !dirty}
      onStorageChanged={reloadFromStorage}
    />
  );
}
