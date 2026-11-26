import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import appIcon from "../../assets/app-icon.png";
import { t } from "../../services/i18n";

const settingsWindow = isTauri() ? getCurrentWindow() : null;

export function SettingsTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!settingsWindow) return;
    const window = settingsWindow;
    let active = true;
    let unlisten: (() => void) | undefined;
    const syncState = () => {
      void window
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    };
    void window
      .onResized(syncState)
      .then((dispose) => {
        if (active) {
          unlisten = dispose;
          syncState();
        } else {
          dispose();
        }
      })
      .catch(syncState);
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const maximizeLabel = t(maximized ? "还原窗口" : "最大化");
  return (
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag" data-tauri-drag-region>
        <img src={appIcon} alt="" draggable={false} data-tauri-drag-region />
        <strong data-tauri-drag-region>{t("灵动岛")}</strong>
        <span className="settings-titlebar-caption" data-tauri-drag-region>
          {t("设置")}
        </span>
      </div>
      {settingsWindow && (
        <div className="settings-window-actions">
          <button
            type="button"
            title={t("最小化")}
            aria-label={t("最小化")}
            onClick={() => void settingsWindow.minimize().catch(() => {})}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title={maximizeLabel}
            aria-label={maximizeLabel}
            onClick={() => void settingsWindow.toggleMaximize().catch(() => {})}
          >
            {maximized ? (
              <Copy size={13} aria-hidden="true" />
            ) : (
              <Square size={13} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="settings-window-close"
            title={t("关闭设置")}
            aria-label={t("关闭设置")}
            onClick={() => void settingsWindow.close().catch(() => {})}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </header>
  );
}
