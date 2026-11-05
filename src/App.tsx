import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  IslandPreview,
  type PreviewQuota,
} from "./features/island/IslandPreview";
import { SettingsPage } from "./features/settings/SettingsPage";
import { defaultAppearance } from "./domain/settings";
import { statForDay } from "./domain/dailyStats";
import { waterPercent } from "./domain/water";
import { useDailyStats } from "./features/stats/useDailyStats";
import {
  hasDesktopStorage,
  loadAppearance,
  saveAppearance,
} from "./services/settingsRepository";
import { loadWaterSettings } from "./services/waterRepository";
import { setLanguage, t } from "./services/i18n";
import {
  displayWidth,
  settingsZoomForWidth,
  watchDisplayTier,
} from "./services/display";
import "./styles/index.css";

// The settings window is created hidden so startup resizes happen off
// screen. Once the page has real content (or a readable error) to show, we
// reveal it at its final size and start the entrance animation. This runs
// once per app start; later show/hide cycles from the tray reuse the page.
let settingsWindowRevealed = false;
function revealSettingsWindow() {
  if (settingsWindowRevealed) return;
  settingsWindowRevealed = true;
  document.documentElement.classList.add("settings-booted");
  void invoke("show_settings_window").catch(() => undefined);
}

export default function App() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [status, setStatus] = useState(() => t("正在读取设置…"));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Language feeds the shared string table; the theme drives the native
  // title bar so it follows the light/dark setting (including "system").
  setLanguage(appearance.language);
  useEffect(() => {
    return watchDisplayTier(() => {
      document.documentElement.style.zoom = String(
        settingsZoomForWidth(displayWidth()),
      );
    });
  }, []);
  useEffect(() => {
    if (!hasDesktopStorage) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme =
        appearance.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appearance.theme;
      void invoke("set_window_theme", { theme }).catch(() => undefined);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance.theme]);
  const revision = useRef(0);
  const dailyStats = useDailyStats(30);
  const [waterGoal, setWaterGoal] = useState(2000);
  useEffect(() => {
    if (!hasDesktopStorage) return;
    let active = true;
    void loadWaterSettings().then((settings) => {
      if (active) setWaterGoal(settings.goalMl);
    });
    return () => {
      active = false;
    };
  }, []);
  const todayStat = statForDay(dailyStats.stats, dailyStats.today);
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
          hasDesktopStorage ? t("设置已读取") : t("浏览器预览：设置不会保存"),
        );
        revealSettingsWindow();
      })
      .catch(() => {
        if (active) {
          setStatus(
            t("设置读取失败，已暂停保存以保护原有数据。请检查配置文件。"),
          );
          revealSettingsWindow();
        }
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
          setStatus(t("已自动保存并同步"));
        }
      } catch {
        setStatus(t("自动保存失败，请重试"));
      } finally {
        setSaving(false);
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [appearance, dirty, ready]);
  async function updateAppearance(value: typeof appearance) {
    const normalized = {
      ...value,
      showClock: value.idleWidgets.includes("clock"),
    };
    setAppearance(normalized);
    setDirty(true);
    revision.current += 1;
    setStatus(t("正在同步…"));
    try {
      await emitTo("island", "appearance-changed", {
        version: 8,
        ...normalized,
      });
    } catch {
      setStatus(t("预览已更新，灵动岛将在保存后同步"));
    }
  }
  const appearanceRef = useRef(appearance);
  const updateAppearanceRef = useRef(updateAppearance);
  useEffect(() => {
    appearanceRef.current = appearance;
    updateAppearanceRef.current = updateAppearance;
  });
  useEffect(() => {
    if (!hasDesktopStorage) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<boolean>("island-lyrics-changed", ({ payload }) => {
      if (active) {
        void updateAppearanceRef.current({
          ...appearanceRef.current,
          islandLyrics: !!payload,
        });
      }
    })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);
  async function reloadFromStorage() {
    const value = await loadAppearance();
    revision.current += 1;
    setAppearance(value);
    setDirty(false);
    setStatus(t("已切换数据目录"));
    await Promise.all([
      emitTo("island", "appearance-changed", { version: 8, ...value }),
      emitTo("island", "mail-accounts-changed"),
      emitTo("island", "ai-accounts-changed"),
    ]);
  }
  return (
    <SettingsPage
      appearance={appearance}
      onAppearanceChange={(value) => void updateAppearance(value)}
      preview={
        <IslandPreview
          appearance={appearance}
          quota={previewQuota}
          water={{
            percent: waterPercent(todayStat?.waterMl ?? 0, waterGoal),
          }}
          pomodoros={todayStat?.pomodoros ?? 0}
          onReorder={(widgets) =>
            void updateAppearance({ ...appearance, idleWidgets: widgets })
          }
        />
      }
      status={status}
      canEdit={ready && !saving}
      canSwitchStorage={ready && !saving && !dirty}
      onStorageChanged={reloadFromStorage}
    />
  );
}
