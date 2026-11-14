import {
  App,
  Button,
  InputNumber,
  Segmented,
  Space,
  Switch,
  Typography,
} from "antd";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppearanceSettings,
  ExpandedShape,
  HotkeySetting,
} from "../../domain/settings";
import { Section, SettingRow } from "./ui/Section";
import { t } from "../../services/i18n";

/** Maps a captured key to the normalized form Rust parses, or null to wait. */
function capturedKey(event: KeyboardEvent): string | null {
  const key = event.key;
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F(?:1[0-9]?|2[0-4]|[1-9])$/.test(key)) return key;
  if (key === " ") return "Space";
  return null;
}

/** Same window the native layer uses to decide a double press. */
const DOUBLE_PRESS_WINDOW = 700;
const collapsePresets = [0, 1, 3, 5, 10, 15];

/** Maps a lone modifier keydown to its recorded name, or null to ignore it.
 * Win is excluded: its double press fights the Start menu. */
function modifierFromKey(key: string): string | null {
  if (key === "Control") return "Ctrl";
  if (key === "Shift") return "Shift";
  if (key === "Alt") return "Alt";
  return null;
}

/** A lone modifier recorded as a double press reads as「双击 Alt」. */
function formatHotkey(setting: HotkeySetting): string {
  if (setting.double && /^(?:Ctrl|Shift|Alt)$/i.test(setting.combo)) {
    return `${t("双击")} ${setting.combo}`;
  }
  return `${setting.combo}${setting.double ? t("（双击）") : ""}`;
}

const hotkeyTitles: Record<string, string> = {
  focus: t("开始 / 暂停专注"),
  water: t("记一杯水"),
  island: t("展开 / 收起灵动岛"),
};

function HotkeyRow({
  title,
  fallback,
  setting,
  disabled,
  onChange,
}: {
  title: string;
  fallback: HotkeySetting;
  setting: HotkeySetting | null;
  disabled: boolean;
  onChange: (next: HotkeySetting | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  // A lone modifier waits for a quick second press; without one the gesture
  // is discarded, because a single modifier cannot be a global hotkey.
  const [pendingModifier, setPendingModifier] = useState<string | null>(null);
  const modifierTimer = useRef<number | null>(null);
  function clearPendingModifier() {
    if (modifierTimer.current !== null) {
      window.clearTimeout(modifierTimer.current);
      modifierTimer.current = null;
    }
    setPendingModifier(null);
  }
  function stopRecording() {
    clearPendingModifier();
    setRecording(false);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stopRecording();
      return;
    }
    // Held keys auto-repeat and would fake a double press.
    if (event.repeat) return;
    const key = capturedKey(event);
    if (key !== null) {
      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push("Ctrl");
      if (event.shiftKey) modifiers.push("Shift");
      if (event.altKey) modifiers.push("Alt");
      if (event.metaKey) modifiers.push("Win");
      // A bare letter, digit or Space would swallow normal typing system-wide.
      if (
        (/^[A-Z0-9]$/.test(key) || key === "Space") &&
        modifiers.length === 0
      ) {
        clearPendingModifier();
        return;
      }
      clearPendingModifier();
      onChange({ combo: [...modifiers, key].join("+"), double: false });
      setRecording(false);
      return;
    }
    const modifier = modifierFromKey(event.key);
    if (modifier === null) return;
    if (pendingModifier === modifier) {
      clearPendingModifier();
      onChange({ combo: modifier, double: true });
      setRecording(false);
      return;
    }
    clearPendingModifier();
    setPendingModifier(modifier);
    modifierTimer.current = window.setTimeout(() => {
      modifierTimer.current = null;
      setPendingModifier(null);
    }, DOUBLE_PRESS_WINDOW + 50);
  }
  // Recording state dies with the row; only the pending timer must be
  // cleared so a late fire cannot touch an unmounted component.
  useEffect(() => {
    const timer = modifierTimer;
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);
  return (
    <SettingRow
      title={title}
      description={setting ? formatHotkey(setting) : t("已关闭")}
    >
      <Space size={8}>
        {recording ? (
          <Button
            size="small"
            type="primary"
            autoFocus
            onKeyDown={handleKeyDown}
            onBlur={stopRecording}
          >
            {pendingModifier
              ? t("再按一次录为双击，等待则取消")
              : t("按下组合键，Esc 取消")}
          </Button>
        ) : (
          <Button
            size="small"
            style={{ minWidth: 132 }}
            disabled={disabled || !setting}
            onClick={() => setRecording(true)}
          >
            {setting ? formatHotkey(setting) : t("录制")}
          </Button>
        )}
        <Switch
          size="small"
          disabled={disabled}
          checked={!!setting}
          onChange={(checked) => onChange(checked ? fallback : null)}
        />
      </Space>
    </SettingRow>
  );
}

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
  const [customCollapse, setCustomCollapse] = useState(
    () => !collapsePresets.includes(appearance.autoCollapseSeconds),
  );
  const showCustomCollapse =
    customCollapse || !collapsePresets.includes(appearance.autoCollapseSeconds);
  const [taskbarError, setTaskbarError] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [hotkeyFailures, setHotkeyFailures] = useState<
    { action: string; combo: string }[]
  >([]);
  const { message } = App.useApp();
  // Applying here too shows which combos another program already holds; the
  // island applies the same configuration for its own runtime.
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void invoke<{ action: string; combo: string }[]>("apply_hotkeys", {
      config: {
        focus: appearance.hotkeyFocus,
        water: appearance.hotkeyWater,
        island: appearance.hotkeyIsland,
      },
    })
      .then((failures) => {
        if (active) setHotkeyFailures(failures ?? []);
      })
      .catch(() => {
        if (active) setHotkeyFailures([]);
      });
    return () => {
      active = false;
    };
  }, [appearance.hotkeyFocus, appearance.hotkeyWater, appearance.hotkeyIsland]);
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
    <div className="antd-stack settings-adaptive-grid behavior-layout">
      <Section title={t("胶囊交互")}>
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
        <SettingRow title={t("展开样式")}>
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
        <SettingRow title={t("全屏时隐藏灵动岛")}>
          <Switch
            checked={appearance.fullscreenAvoid}
            disabled={!canEdit}
            onChange={(checked) =>
              onAppearanceChange({ ...appearance, fullscreenAvoid: checked })
            }
          />
        </SettingRow>
        <SettingRow title={t("鼠标离开后自动收起")}>
          <Space wrap size="small">
            <Segmented
              value={
                showCustomCollapse ? "custom" : appearance.autoCollapseSeconds
              }
              disabled={!canEdit}
              onChange={(value) => {
                if (value === "custom") {
                  setCustomCollapse(true);
                  return;
                }
                setCustomCollapse(false);
                onAppearanceChange({
                  ...appearance,
                  autoCollapseSeconds: value as number,
                });
              }}
              options={[
                { value: 0, label: t("立即") },
                { value: 1, label: t("1 秒") },
                { value: 3, label: t("3 秒") },
                { value: 5, label: t("5 秒") },
                { value: 10, label: t("10 秒") },
                { value: 15, label: t("15 秒") },
                { value: "custom", label: t("自定义") },
              ]}
            />
            {showCustomCollapse && (
              <InputNumber
                key={appearance.autoCollapseSeconds}
                aria-label={t("自定义收起时长（秒）")}
                min={0}
                max={60}
                step={0.1}
                precision={1}
                defaultValue={appearance.autoCollapseSeconds}
                disabled={!canEdit}
                onBlur={(event) => {
                  const input = event.currentTarget.value.trim();
                  const collapseDraft = Number(input);
                  if (!input || !Number.isFinite(collapseDraft)) return;
                  const seconds =
                    Math.round(Math.max(0, Math.min(60, collapseDraft)) * 10) /
                    10;
                  if (seconds !== appearance.autoCollapseSeconds)
                    onAppearanceChange({
                      ...appearance,
                      autoCollapseSeconds: seconds,
                    });
                }}
                onPressEnter={(event) => event.currentTarget.blur()}
                addonAfter={t("秒")}
                style={{ width: 116 }}
              />
            )}
          </Space>
        </SettingRow>
        <SettingRow title={t("任务栏模式")}>
          <Switch
            checked={appearance.taskbarMode}
            disabled={!canEdit || !isTauri()}
            onChange={(checked) => {
              setTaskbarError(false);
              if (!checked) {
                onAppearanceChange({ ...appearance, taskbarMode: false });
                return;
              }
              void invoke("check_taskbar_mode")
                .then(() => {
                  onAppearanceChange({ ...appearance, taskbarMode: true });
                })
                .catch(() => {
                  setTaskbarError(true);
                });
            }}
          />
          {taskbarError && (
            <span role="alert">
              {t("无法放置到任务栏，请检查任务栏位置和灵动岛大小。")}
            </span>
          )}
        </SettingRow>
        <SettingRow title={t("灵动岛位置")}>
          <Button
            disabled={!isTauri() || positionReset}
            onClick={() => {
              if (appearance.taskbarMode)
                onAppearanceChange({ ...appearance, taskbarMode: false });
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

      <Section title={t("全局快捷键")}>
        <HotkeyRow
          title={t("开始 / 暂停专注")}
          fallback={{ combo: "Ctrl+Alt+P", double: false }}
          disabled={!canEdit}
          setting={appearance.hotkeyFocus}
          onChange={(hotkeyFocus) =>
            onAppearanceChange({ ...appearance, hotkeyFocus })
          }
        />
        <HotkeyRow
          title={t("记一杯水")}
          fallback={{ combo: "Ctrl+Alt+W", double: false }}
          disabled={!canEdit}
          setting={appearance.hotkeyWater}
          onChange={(hotkeyWater) =>
            onAppearanceChange({ ...appearance, hotkeyWater })
          }
        />
        <HotkeyRow
          title={t("展开 / 收起灵动岛")}
          fallback={{ combo: "Ctrl+Alt+E", double: false }}
          disabled={!canEdit}
          setting={appearance.hotkeyIsland}
          onChange={(hotkeyIsland) =>
            onAppearanceChange({ ...appearance, hotkeyIsland })
          }
        />
        {hotkeyFailures.length > 0 && (
          <Typography.Text type="warning" className="antd-hint">
            {t("注册失败，可能被其他程序占用：")}
            {hotkeyFailures
              .map(
                (failure) => `${hotkeyTitles[failure.action]} ${failure.combo}`,
              )
              .join("、")}
          </Typography.Text>
        )}
      </Section>

      <Section title={t("启动")}>
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
