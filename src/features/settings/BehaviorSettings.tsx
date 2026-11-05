import { SettingsCard } from "./SettingsCard";
import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppearanceSettings } from "../../domain/settings";
import { t } from "../../services/i18n";
export function BehaviorSettings({
  appearance,
  onAppearanceChange,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  canEdit: boolean;
}) {
  const [positionReset, setPositionReset] = useState(false);
  return (
    <div className="settings-stack">
      <SettingsCard>
        <div className="card-head">
          <div>
            <h2>{t("展开方式")}</h2>
            <p>{t("悬停模式把指针移到胶囊上就会展开，不用点击。")}</p>
          </div>
        </div>
        <div className="segmented" role="group" aria-label={t("展开方式")}>
          {[
            { value: "click", label: "点击展开" },
            { value: "hover", label: "悬停展开" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!canEdit}
              aria-pressed={appearance.expandTrigger === option.value}
              className={
                appearance.expandTrigger === option.value ? "active" : ""
              }
              onClick={() =>
                onAppearanceChange({
                  ...appearance,
                  expandTrigger: option.value as "click" | "hover",
                })
              }
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <div className="setting-row">
          <span className="setting-row-copy">
            <strong>{t("灵动岛位置")}</strong>
            <small>
              {t("按住胶囊或面板顶栏即可拖动，松手后位置会被记住。")}
            </small>
          </span>
          <button
            className="btn btn-quiet"
            type="button"
            disabled={!isTauri() || positionReset}
            onClick={() => {
              void invoke("reset_island_position")
                .then(() => {
                  setPositionReset(true);
                  window.setTimeout(() => setPositionReset(false), 1600);
                })
                .catch(() => undefined);
            }}
          >
            {positionReset ? t("已恢复") : t("恢复默认位置")}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <div>
            <h2>{t("鼠标离开后自动收起")}</h2>
            <p>
              {t(
                "点击或悬停展开后都生效；鼠标移出面板后按设定时间折叠，选择「立即」则马上收起，计时不会中断。",
              )}
            </p>
          </div>
        </div>
        <div
          className="segmented"
          role="group"
          aria-label={t("鼠标离开后自动收起")}
        >
          {[
            { value: 0, label: "立即" },
            { value: 1, label: "1 秒" },
            { value: 3, label: "3 秒" },
            { value: 5, label: "5 秒" },
            { value: 10, label: "10 秒" },
            { value: 15, label: "15 秒" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!canEdit}
              aria-pressed={appearance.autoCollapseSeconds === option.value}
              className={
                appearance.autoCollapseSeconds === option.value ? "active" : ""
              }
              onClick={() =>
                onAppearanceChange({
                  ...appearance,
                  autoCollapseSeconds: option.value,
                })
              }
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className="card-hint">
          {t("鼠标移回胶囊会取消收起计时；自动收起不会停止正在进行的倒计时。")}
        </p>
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <div>
            <h2>{t("音乐")}</h2>
            <p>{t("控制收起胶囊里显示的内容。")}</p>
          </div>
        </div>
        <label className="setting-row">
          <span className="setting-row-copy">
            <strong>{t("岛上显示歌词")}</strong>
            <small>{t("关闭时显示歌手；歌词仍可在展开的音乐页查看。")}</small>
          </span>
          <input
            className="toggle-input"
            type="checkbox"
            disabled={!canEdit}
            checked={appearance.islandLyrics}
            onChange={(event) =>
              onAppearanceChange({
                ...appearance,
                islandLyrics: event.target.checked,
              })
            }
          />
        </label>
      </SettingsCard>
    </div>
  );
}
