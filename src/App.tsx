import { useEffect, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { IslandPreview } from "./features/island/IslandPreview";
import { SettingsPage } from "./features/settings/SettingsPage";
import { defaultAppearance } from "./domain/settings";
import {
  hasDesktopStorage,
  loadAppearance,
  saveAppearance,
} from "./services/settingsRepository";
import "./App.css";

export default function App() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [status, setStatus] = useState("正在读取设置…");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
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
      await emitTo("island", "appearance-changed", { version: 2, ...value });
    } catch {
      setStatus("预览已更新，灵动岛将在保存后同步");
    }
  }
  async function save() {
    setSaving(true);
    try {
      await saveAppearance(appearance);
      try {
        await emitTo("island", "appearance-changed", {
          version: 2,
          ...appearance,
        });
        setDirty(false);
        setStatus("设置已保存并同步到灵动岛");
      } catch {
        setStatus("设置已保存，但灵动岛同步失败；重启应用后生效。");
      }
    } catch {
      setStatus("保存失败，请检查应用数据目录的访问权限后重试。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <SettingsPage
      appearance={appearance}
      onAppearanceChange={(value) => void updateAppearance(value)}
      preview={<IslandPreview appearance={appearance} />}
      status={status}
      canEdit={ready && !saving}
      canSave={ready && hasDesktopStorage && !saving}
      onSave={save}
    />
  );
}
