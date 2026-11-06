import { Divider, Switch } from "antd";
import { CheckCircleFilled, SoundOutlined } from "@ant-design/icons";
import type { CSSProperties } from "react";
import type { AppearanceSettings, ReminderStyle } from "../../domain/settings";
import { Section, SettingRow } from "./ui/Section";
import { t } from "../../services/i18n";

const styleOptions: { value: ReminderStyle; label: string }[] = [
  { value: "breathe", label: "呼吸描边" },
  { value: "sweep", label: "光晕扫过" },
  { value: "pulse", label: "脉冲闪烁" },
  { value: "beam", label: "边框流光" },
  { value: "none", label: "仅颜色" },
];

export function ReminderSettings({
  appearance,
  onAppearanceChange,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  canEdit: boolean;
}) {
  return (
    <div className="antd-stack">
      <Section
        title={t("提醒动效")}
        description={t("提醒出现时胶囊的提示方式，每张卡片会实时预览。")}
      >
        <div
          className="reminder-style-grid"
          role="radiogroup"
          aria-label={t("提醒动效")}
        >
          {styleOptions.map((option) => {
            const selected = appearance.reminderStyle === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`reminder-style-tile ${selected ? "is-selected" : ""}`}
                disabled={!canEdit}
                onClick={() =>
                  onAppearanceChange({
                    ...appearance,
                    reminderStyle: option.value,
                  })
                }
              >
                <span
                  className="reminder-style-stage"
                  data-reminder={option.value}
                  style={{ "--alert-color": "#f0b26b" } as CSSProperties}
                >
                  <span className="island-alert-ring" aria-hidden="true" />
                  <SoundOutlined />
                  <span>{t("亮度")}</span>
                  <strong>75%</strong>
                </span>
                <span className="reminder-style-name">
                  {t(option.label)}
                  <CheckCircleFilled
                    className={`reminder-style-check ${selected ? "" : "is-hidden"}`}
                    aria-hidden="true"
                  />
                </span>
              </button>
            );
          })}
        </div>
        <Divider style={{ margin: "16px 0 12px" }} />
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
