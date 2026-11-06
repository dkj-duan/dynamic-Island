import { Button, Divider, Segmented, Switch } from "antd";
import { useState, type CSSProperties } from "react";
import { ReloadOutlined, SunOutlined } from "@ant-design/icons";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppearanceSettings } from "../../domain/settings";
import { Section, SettingRow } from "./ui/Section";
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
  const [previewKey, setPreviewKey] = useState(0);
  return (
    <div className="antd-stack">
      <Section
        title={t("胶囊交互")}
        description={t("悬停模式把指针移到胶囊上就会展开，不用点击。")}
      >
        <SettingRow title={t("展开方式")}>
          <Segmented
            value={appearance.expandTrigger}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                expandTrigger: value as "click" | "hover",
              })
            }
            options={[
              { value: "click", label: t("点击展开") },
              { value: "hover", label: t("悬停展开") },
            ]}
          />
        </SettingRow>
        <SettingRow
          title={t("鼠标离开后自动收起")}
          description={t(
            "鼠标移回胶囊会取消收起计时；自动收起不会停止正在进行的倒计时。",
          )}
        >
          <Segmented
            value={appearance.autoCollapseSeconds}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                autoCollapseSeconds: value as number,
              })
            }
            options={[
              { value: 0, label: t("立即") },
              { value: 1, label: t("1 秒") },
              { value: 3, label: t("3 秒") },
              { value: 5, label: t("5 秒") },
              { value: 10, label: t("10 秒") },
              { value: 15, label: t("15 秒") },
            ]}
          />
        </SettingRow>
        <SettingRow
          title={t("灵动岛位置")}
          description={t("按住胶囊或面板顶栏即可拖动，松手后位置会被记住。")}
        >
          <Button
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
          </Button>
        </SettingRow>
        <Divider style={{ margin: "4px 0 6px" }} />
        <SettingRow
          title={t("岛上显示歌词")}
          description={t("关闭时显示歌手；歌词仍可在展开的音乐页查看。")}
        >
          <Switch
            checked={appearance.islandLyrics}
            disabled={!canEdit}
            onChange={(checked) =>
              onAppearanceChange({ ...appearance, islandLyrics: checked })
            }
          />
        </SettingRow>
      </Section>

      <Section
        title={t("提醒动效")}
        description={t("提醒出现时胶囊的提示方式，可以在下面预览。")}
      >
        <Segmented
          block
          value={appearance.reminderStyle}
          disabled={!canEdit}
          onChange={(value) => {
            setPreviewKey((key) => key + 1);
            onAppearanceChange({
              ...appearance,
              reminderStyle: value as AppearanceSettings["reminderStyle"],
            });
          }}
          options={[
            { value: "breathe", label: t("呼吸描边") },
            { value: "sweep", label: t("光晕扫过") },
            { value: "pulse", label: t("脉冲闪烁") },
            { value: "beam", label: t("边框流光") },
            { value: "none", label: t("仅颜色") },
          ]}
        />
        <div className="reminder-preview-row">
          <div
            key={previewKey}
            className="reminder-preview"
            data-reminder={appearance.reminderStyle}
            style={{ "--alert-color": "#f0b26b" } as CSSProperties}
          >
            <span className="island-alert-ring" aria-hidden="true" />
            <SunOutlined />
            <span>{t("演示 · 亮度")}</span>
            <strong>75%</strong>
          </div>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => setPreviewKey((key) => key + 1)}
          >
            {t("重新播放")}
          </Button>
        </div>
        <Divider style={{ margin: "12px 0 10px" }} />
        <SettingRow
          title={t("提醒时自动展开")}
          description={t("验证码、喝水和计时结束时会自动打开面板。")}
        >
          <Switch
            checked={appearance.reminderAutoExpand}
            disabled={!canEdit}
            onChange={(checked) =>
              onAppearanceChange({
                ...appearance,
                reminderAutoExpand: checked,
              })
            }
          />
        </SettingRow>
      </Section>
    </div>
  );
}
