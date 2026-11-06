import { App, Button, Segmented, Switch } from "antd";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppearanceSettings, ExpandedShape } from "../../domain/settings";
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
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const { message } = App.useApp();
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<boolean>("get_autostart")
      .then((value) => {
        if (active) setAutostart(value);
      })
      .catch(() => {
        if (active) setAutostart(null);
      });
    return () => {
      active = false;
    };
  }, []);
  // The tray menu has its own toggle; keep this switch in step with it.
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<boolean>("autostart-changed", ({ payload }) => {
      if (active) setAutostart(!!payload);
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
  async function toggleAutostart(enabled: boolean) {
    setAutostartBusy(true);
    try {
      await invoke("set_autostart", { enabled });
      setAutostart(enabled);
      message.success(t(enabled ? "已开启开机自启动" : "已关闭开机自启动"));
    } catch {
      message.error(t("开机自启动设置失败"));
      void invoke<boolean>("get_autostart")
        .then(setAutostart)
        .catch(() => undefined);
    } finally {
      setAutostartBusy(false);
    }
  }
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
        <SettingRow title={t("展开样式")} description={t("选择展开面板的轮廓")}>
          <Segmented
            value={appearance.expandedShape}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                expandedShape: value as ExpandedShape,
              })
            }
            options={[
              { value: "classic", label: t("经典") },
              { value: "asymmetric", label: t("灵动") },
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

      <Section
        title={t("启动")}
        description={t(
          "登录 Windows 后自动启动；开机启动只显示岛上小窗，不打开设置页。",
        )}
      >
        <SettingRow title={t("开机自启动")}>
          <Switch
            checked={!!autostart}
            disabled={!canEdit || autostartBusy || autostart === null}
            loading={autostartBusy}
            onChange={(checked) => void toggleAutostart(checked)}
          />
        </SettingRow>
      </Section>
    </div>
  );
}
