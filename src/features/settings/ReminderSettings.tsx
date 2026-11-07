import { Button, Divider, Segmented, Switch } from "antd";
import { CheckCircleFilled, SoundOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppearanceSettings, ReminderStyle } from "../../domain/settings";
import { Section, SettingRow } from "./ui/Section";
import { t } from "../../services/i18n";
import { ReminderBeam } from "../island/ReminderBeam";

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
  const [notificationAccess, setNotificationAccess] = useState<
    "allowed" | "denied" | "unspecified" | null
  >(null);
  const refreshNotificationAccess = useCallback(() => {
    if (!isTauri()) return;
    void invoke<"allowed" | "denied" | "unspecified">("get_notification_access")
      .then((value) => setNotificationAccess(value))
      .catch(() => setNotificationAccess(null));
  }, []);
  useEffect(() => {
    refreshNotificationAccess();
  }, [refreshNotificationAccess]);
  return (
    <div className="antd-stack">
      <Section title={t("提醒动效")}>
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
                <ReminderBeam enabled={option.value === "beam"}>
                  <span
                    className="reminder-style-stage"
                    data-reminder={option.value}
                    style={{ "--alert-color": "#f0b26b" } as CSSProperties}
                  >
                    {option.value !== "beam" && (
                      <span className="island-alert-ring" aria-hidden="true" />
                    )}
                    <SoundOutlined />
                    <span>{t("亮度")}</span>
                    <strong>75%</strong>
                  </span>
                </ReminderBeam>
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
        <Divider style={{ margin: "10px 0 8px" }} />
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
        <SettingRow
          title={t("提醒显示时长")}
          description={t(
            "喝水、新邮件等提醒的停留时间；验证码保持到过期，计时完成等你确认。",
          )}
        >
          <Segmented
            value={appearance.reminderDisplaySeconds}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                reminderDisplaySeconds: value as number,
              })
            }
            options={[
              { value: 10, label: t("10 秒") },
              { value: 20, label: t("20 秒") },
              { value: 30, label: t("30 秒") },
              { value: 60, label: t("60 秒") },
            ]}
          />
        </SettingRow>
      </Section>

      <Section
        title={t("应用通知转发")}
        description={t(
          "把系统通知转发到灵动岛胶囊，内容只在本地显示；需要在系统设置中授予通知访问权限。",
        )}
      >
        <SettingRow title={t("转发系统通知")}>
          <Switch
            checked={appearance.forwardNotifications}
            disabled={!canEdit}
            onChange={(checked) => {
              onAppearanceChange({
                ...appearance,
                forwardNotifications: checked,
              });
              refreshNotificationAccess();
            }}
          />
        </SettingRow>
        <SettingRow title={t("收到通知时")}>
          <Segmented
            value={appearance.noticeExpand ? "expand" : "capsule"}
            disabled={!canEdit || !appearance.forwardNotifications}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                noticeExpand: value === "expand",
              })
            }
            options={[
              { value: "capsule", label: t("显示在胶囊上") },
              { value: "expand", label: t("展开灵动岛") },
            ]}
          />
        </SettingRow>
        <SettingRow title={t("显示消息内容")}>
          <Switch
            checked={appearance.noticeShowText}
            disabled={!canEdit || !appearance.forwardNotifications}
            onChange={(checked) =>
              onAppearanceChange({ ...appearance, noticeShowText: checked })
            }
          />
        </SettingRow>
        <SettingRow title={t("通知显示时长")}>
          <Segmented
            value={appearance.noticeDisplaySeconds}
            disabled={!canEdit || !appearance.forwardNotifications}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                noticeDisplaySeconds: value as number,
              })
            }
            options={[
              { value: 3, label: t("3 秒") },
              { value: 5, label: t("5 秒") },
              { value: 10, label: t("10 秒") },
              { value: 15, label: t("15 秒") },
            ]}
          />
        </SettingRow>
        <SettingRow
          title={t("通知访问权限")}
          description={
            notificationAccess === null
              ? t("正在读取权限状态…")
              : notificationAccess === "allowed"
                ? t("已授权，新通知会显示在岛上。")
                : t("未授权，请在系统设置中允许应用访问通知。")
          }
        >
          {notificationAccess !== "allowed" && (
            <Button
              disabled={!isTauri()}
              onClick={() =>
                void invoke("open_notification_settings").catch(() => undefined)
              }
            >
              {t("打开系统设置")}
            </Button>
          )}
        </SettingRow>
      </Section>
    </div>
  );
}
