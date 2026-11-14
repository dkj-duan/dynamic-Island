import { Button, Segmented, Switch } from "antd";
import { useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import type {
  AppearanceSettings,
  NotificationSourceId,
} from "../../domain/settings";
import { Section, SettingRow } from "./ui/Section";
import { t } from "../../services/i18n";

type SourceMeta = {
  id: NotificationSourceId;
  label: string;
  description: string;
  demoValue: string;
};

const SOURCE_META: SourceMeta[] = [
  {
    id: "wechat",
    label: "微信消息提醒",
    description:
      "读取微信会话列表中的未读状态和摘要，仅在本地处理。微信需运行并保留会话列表；不同版本或界面状态可能漏报。",
    demoValue: "示例联系人：这是一条微信消息演示。",
  },
  {
    id: "qq",
    label: "QQ消息提醒",
    description:
      "读取QQ会话列表中的未读状态和摘要，仅在本地处理。QQ需运行并保留会话列表；不同版本或界面状态可能漏报。",
    demoValue: "示例好友：这是一条QQ消息演示。",
  },
];

/**
 * One settings page for every watched message source. Adding a source is a
 * new entry in SOURCE_META — the controls and layout are shared.
 */
export function MessagesSettings({
  appearance,
  onAppearanceChange,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  canEdit: boolean;
}) {
  const [previewStatus, setPreviewStatus] = useState("");
  async function previewSource(source: NotificationSourceId) {
    const meta = SOURCE_META.find((entry) => entry.id === source);
    if (!meta) return;
    try {
      await emitTo("island", "system-notice-preview", {
        kind: "notification",
        label: t(meta.label.replace("消息提醒", "")),
        value: t(meta.demoValue),
        source,
      });
      setPreviewStatus(t("示例通知已发送到灵动岛。"));
    } catch {
      setPreviewStatus(t("演示发送失败，请确认灵动岛正在运行。"));
    }
  }
  return (
    <div className="antd-stack">
      {SOURCE_META.map((meta) => {
        const source = appearance.notificationSources[meta.id];
        const active = source.enabled || appearance.forwardNotifications;
        return (
          <Section
            key={meta.id}
            title={t(meta.label)}
            description={t(meta.description)}
          >
            <SettingRow title={t("消息上岛")}>
              <Switch
                checked={source.enabled}
                disabled={!canEdit}
                onChange={(checked) =>
                  onAppearanceChange({
                    ...appearance,
                    notificationSources: {
                      ...appearance.notificationSources,
                      [meta.id]: { ...source, enabled: checked },
                    },
                  })
                }
              />
            </SettingRow>
            <SettingRow title={t("收到消息时")}>
              <Segmented
                value={source.expand ? "expand" : "capsule"}
                disabled={!canEdit || !source.showText || !active}
                onChange={(value) =>
                  onAppearanceChange({
                    ...appearance,
                    notificationSources: {
                      ...appearance.notificationSources,
                      [meta.id]: { ...source, expand: value === "expand" },
                    },
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
                checked={source.showText}
                disabled={!canEdit || !active}
                onChange={(checked) =>
                  onAppearanceChange({
                    ...appearance,
                    notificationSources: {
                      ...appearance.notificationSources,
                      [meta.id]: { ...source, showText: checked },
                    },
                  })
                }
              />
            </SettingRow>
            <SettingRow title={t("消息显示时长")}>
              <Segmented
                value={source.seconds}
                disabled={!canEdit || !source.showText || !active}
                onChange={(value) =>
                  onAppearanceChange({
                    ...appearance,
                    notificationSources: {
                      ...appearance.notificationSources,
                      [meta.id]: { ...source, seconds: value as number },
                    },
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
              title={t("消息演示")}
              description={previewStatus || t("使用示例内容预览消息提醒。")}
            >
              <Button
                disabled={!isTauri()}
                onClick={() => void previewSource(meta.id)}
              >
                {t("演示")}
              </Button>
            </SettingRow>
          </Section>
        );
      })}
    </div>
  );
}
