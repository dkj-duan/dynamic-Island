import { Divider, Segmented, Space, Switch } from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CustomerServiceOutlined,
  FieldTimeOutlined,
  FireOutlined,
  HourglassOutlined,
  PlusOutlined,
  PoweroffOutlined,
  RobotOutlined,
  RiseOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  WifiOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { Section } from "./ui/Section";
import {
  type AppearanceSettings,
  type IdleWidgetId,
  type PomodoroIdleView,
} from "../../domain/settings";
import {
  IDLE_WIDGET_MODES,
  type IdleWidgetMode,
} from "../island/idleWidgetData";
import { t } from "../../services/i18n";

const idleWidgetOptions: {
  id: IdleWidgetId;
  label: string;
  icon: ReactNode;
}[] = [
  { id: "clock", label: "时钟", icon: <ClockCircleOutlined /> },
  { id: "mascot", label: "小岛伙伴", icon: <SmileOutlined /> },
  { id: "quota", label: "常驻额度", icon: <RobotOutlined /> },
  { id: "water", label: "喝水进度", icon: <ThunderboltOutlined /> },
  { id: "pomodoro", label: "番茄进度", icon: <FieldTimeOutlined /> },
  { id: "music", label: "正在播放", icon: <CustomerServiceOutlined /> },
  { id: "battery", label: "电池与充电", icon: <PoweroffOutlined /> },
  { id: "focus", label: "今日专注", icon: <FireOutlined /> },
  { id: "streak", label: "连续专注", icon: <CalendarOutlined /> },
  { id: "volume", label: "音量与静音", icon: <SoundOutlined /> },
  { id: "bluetooth", label: "蓝牙耳机电量", icon: <WifiOutlined /> },
  { id: "waterTimer", label: "喝水倒计时", icon: <BellOutlined /> },
  { id: "countdown", label: "倒计时", icon: <HourglassOutlined /> },
  { id: "sedentary", label: "久坐时长", icon: <RiseOutlined /> },
];

const pomodoroViewOptions: { value: PomodoroIdleView; label: string }[] = [
  { value: "count", label: "今日个数" },
  { value: "focus", label: "专注分钟" },
  { value: "cycle", label: "本轮轮次" },
];

const islandSizeOptions = [
  { value: 0.8, label: "特小" },
  { value: 0.9, label: "小" },
  { value: 1, label: "适中" },
  { value: 1.1, label: "大" },
  { value: 1.2, label: "特大" },
];

const idleChangeMinutesOptions = [
  { value: 1, label: "1 分钟" },
  { value: 3, label: "3 分钟" },
  { value: 5, label: "5 分钟" },
  { value: 10, label: "10 分钟" },
  { value: 15, label: "15 分钟" },
];

const idleWidgetGroups: { key: IdleWidgetMode; label: string; hint: string }[] =
  [
    { key: "persistent", label: "常驻显示", hint: "有数据即显示" },
    { key: "active", label: "活跃显示", hint: "随状态出现" },
    { key: "change", label: "变化显示", hint: "数值变化后短暂出现" },
  ];

export function AppearancePage({
  appearance,
  onAppearanceChange,
  preview,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  preview: ReactNode;
  canEdit: boolean;
}) {
  function toggleIdleWidget(id: IdleWidgetId) {
    const enabled = appearance.idleWidgets.includes(id);
    const widgets = enabled
      ? appearance.idleWidgets.filter((item) => item !== id)
      : [...appearance.idleWidgets, id];
    onAppearanceChange({ ...appearance, idleWidgets: widgets });
  }

  return (
    <div className="antd-stack">
      <Section
        title={t("桌面预览")}
        extra={
          <Space size={8}>
            <span className="section-inline-note">{t("灵动岛大小")}</span>
            <Segmented
              value={appearance.scale}
              disabled={!canEdit}
              onChange={(value) =>
                onAppearanceChange({ ...appearance, scale: value as number })
              }
              options={islandSizeOptions.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
            />
          </Space>
        }
      >
        <div className="preview-stage">{preview}</div>
      </Section>

      <Section
        title={t("胶囊")}
        description={t(
          "组件在桌面预览中拖动排序，前 6 个显示在灵动岛，其余排队备用；变化组件在数值变化后插队出现，数分钟后自动让位。",
        )}
        extra={
          <span className="section-inline-note">
            {appearance.idleWidgets.length} / {idleWidgetOptions.length}
          </span>
        }
      >
        {/* Widgets grouped by how they earn their slot: click a chip to put
            it on the island, click again to take it off. Order is adjusted
            by dragging inside the desktop preview above. */}
        {idleWidgetGroups.map((group) => (
          <div key={group.key} className="antd-widget-group">
            <div className="antd-widget-group-label">
              {t(group.label)}
              <span className="section-inline-note"> {t(group.hint)}</span>
            </div>
            <div className="antd-widget-chips is-unified">
              {idleWidgetOptions
                .filter((option) => IDLE_WIDGET_MODES[option.id] === group.key)
                .map((option) => {
                  const on = appearance.idleWidgets.includes(option.id);
                  return (
                    <div
                      role="button"
                      tabIndex={canEdit ? 0 : -1}
                      key={option.id}
                      className={`antd-widget-chip is-widget-toggle ${
                        on ? "is-on" : "is-off"
                      }`}
                      aria-pressed={on}
                      title={
                        on
                          ? `${t("移除")} ${t(option.label)}`
                          : `${t("添加")} ${t(option.label)}`
                      }
                      onClick={() => {
                        if (!canEdit) return;
                        toggleIdleWidget(option.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (!canEdit) return;
                        toggleIdleWidget(option.id);
                      }}
                    >
                      <span className="antd-widget-icon" aria-hidden="true">
                        {option.icon}
                      </span>
                      <span className="antd-widget-label">
                        {t(option.label)}
                      </span>
                      {on ? null : <PlusOutlined className="antd-chip-add" />}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}

        <Divider style={{ margin: "12px 0 8px" }} />
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">{t("变化组件显示时长")}</div>
          </div>
          <Segmented
            value={appearance.idleChangeDisplayMinutes}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                idleChangeDisplayMinutes: value as number,
              })
            }
            options={idleChangeMinutesOptions.map((option) => ({
              value: option.value,
              label: t(option.label),
            }))}
          />
        </div>

        <Divider style={{ margin: "12px 0 8px" }} />
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">{t("番茄组件显示")}</div>
          </div>
          <Segmented
            value={appearance.pomodoroView}
            disabled={!canEdit}
            onChange={(value) =>
              onAppearanceChange({
                ...appearance,
                pomodoroView: value as PomodoroIdleView,
              })
            }
            options={pomodoroViewOptions.map((option) => ({
              value: option.value,
              label: t(option.label),
            }))}
          />
        </div>

        <Divider style={{ margin: "12px 0 8px" }} />
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">{t("岛上显示歌词")}</div>
          </div>
          <Switch
            checked={appearance.islandLyrics}
            disabled={!canEdit}
            onChange={(checked) =>
              onAppearanceChange({ ...appearance, islandLyrics: checked })
            }
          />
        </div>
      </Section>
    </div>
  );
}
