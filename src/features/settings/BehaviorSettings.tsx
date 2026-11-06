import { Button, Segmented } from "antd";
import { useState } from "react";
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
      </Section>
    </div>
  );
}
