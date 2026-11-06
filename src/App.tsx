import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  IslandPreview,
  type PreviewQuota,
} from "./features/island/IslandPreview";
import {
  SettingsPage,
  type SettingsStatus,
} from "./features/settings/SettingsPage";
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
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "./services/systemTheme";
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

/** A login launch stays in the island; only manual launches open settings. */
async function revealSettingsWhenAllowed() {
  try {
    if (await invoke<boolean>("is_autostart_launch")) return;
  } catch {
    // Browser preview or an older build: keep the normal reveal.
  }
  revealSettingsWindow();
}

export default function App() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [status, setStatus] = useState<SettingsStatus>(() => ({
    text: t("正在读取设置…"),
    error: false,
  }));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The theme drives the native title bar so it follows the light/dark
  // setting (including "system"); the language is synced inside the handlers
  // below before they trigger the render that reads the string table.
  useEffect(() => {
    return watchDisplayTier(() => {
      document.documentElement.style.zoom = String(
        settingsZoomForWidth(displayWidth()),
      );
    });
  }, []);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  useEffect(() => watchSystemTheme(setSystemTheme), []);
  useEffect(() => {
    if (!hasDesktopStorage) return;
    void invoke("set_window_theme", {
      theme: resolveTheme(appearance.theme, systemTheme),
    }).catch(() => undefined);
  }, [appearance.theme, systemTheme]);
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
        // Apply the stored language before writing the status text so the
        // first message already uses it.
        setLanguage(value.language);
        setStatus({
          text: hasDesktopStorage
            ? t("设置已读取")
            : t("浏览器预览：设置不会保存"),
          error: false,
        });
        void revealSettingsWhenAllowed();
      })
      .catch(() => {
        if (active) {
          setStatus({
            text: t("设置读取失败，已暂停保存以保护原有数据。请检查配置文件。"),
            error: true,
          });
          void revealSettingsWhenAllowed();
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
          setStatus({ text: t("已自动保存并同步"), error: false });
        }
      } catch {
        setStatus({ text: t("自动保存失败，请重试"), error: true });
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
    // Sync the string table before the render this triggers, so t() calls
    // already see the new language.
    setLanguage(normalized.language);
    setAppearance(normalized);
    setDirty(true);
    revision.current += 1;
    setStatus({ text: t("正在同步…"), error: false });
    try {
      await emitTo("island", "appearance-changed", {
        version: 12,
        ...normalized,
      });
    } catch {
      setStatus({ text: t("预览已更新，灵动岛将在保存后同步"), error: false });
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
    setLanguage(value.language);
    setAppearance(value);
    setDirty(false);
    setStatus({ text: t("已切换数据目录"), error: false });
    await Promise.all([
      emitTo("island", "appearance-changed", { version: 12, ...value }),
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
      canEdit={ready}
      canSwitchStorage={ready && !saving && !dirty}
      onStorageChanged={reloadFromStorage}
    />
  );
}
