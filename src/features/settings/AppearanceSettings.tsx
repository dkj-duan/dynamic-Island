import { Divider, Segmented, Space, Switch } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BellOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CustomerServiceOutlined,
  FieldTimeOutlined,
  FireOutlined,
  HourglassOutlined,
  PlusOutlined,
  PoweroffOutlined,
  RobotOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { Section } from "./ui/Section";
import {
  MAX_IDLE_WIDGETS,
  type AppearanceSettings,
  type IdleWidgetId,
  type PomodoroIdleView,
} from "../../domain/settings";
import { t } from "../../services/i18n";

const idleWidgetOptions: {
  id: IdleWidgetId;
  label: string;
  icon: ReactNode;
}[] = [
  { id: "clock", label: "时钟", icon: <ClockCircleOutlined /> },
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
  const available = idleWidgetOptions.filter(
    (option) => !appearance.idleWidgets.includes(option.id),
  );
  const limitReached = appearance.idleWidgets.length >= MAX_IDLE_WIDGETS;

  function toggleIdleWidget(id: IdleWidgetId) {
    const enabled = appearance.idleWidgets.includes(id);
    if (!enabled && limitReached) return;
    const widgets = enabled
      ? appearance.idleWidgets.filter((item) => item !== id)
      : [...appearance.idleWidgets, id];
    onAppearanceChange({ ...appearance, idleWidgets: widgets });
  }

  function moveIdleWidget(id: IdleWidgetId, delta: -1 | 1) {
    const widgets = [...appearance.idleWidgets];
    const from = widgets.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= widgets.length) return;
    [widgets[from], widgets[to]] = [widgets[to], widgets[from]];
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
        description={t("最多同时显示 6 个，没有数据的组件自动隐藏。")}
        extra={
          <span className="section-inline-note">
            {appearance.idleWidgets.length} / {MAX_IDLE_WIDGETS}
          </span>
        }
      >
        <div className="antd-widget-group">
          <div className="antd-widget-group-label">{t("已显示")}</div>
          <div className="antd-widget-chips">
            {appearance.idleWidgets.map((id, index) => {
              const option = idleWidgetOptions.find((item) => item.id === id)!;
              return (
                <div className="antd-widget-chip is-on" key={id}>
                  <span className="antd-widget-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="antd-widget-label">{t(option.label)}</span>
                  <span className="antd-chip-actions">
                    <button
                      type="button"
                      className="antd-chip-btn"
                      aria-label={t("上移")}
                      title={t("上移")}
                      disabled={!canEdit || index === 0}
                      onClick={() => moveIdleWidget(id, -1)}
                    >
                      <ArrowUpOutlined />
                    </button>
                    <button
                      type="button"
                      className="antd-chip-btn"
                      aria-label={t("下移")}
                      title={t("下移")}
                      disabled={
                        !canEdit || index === appearance.idleWidgets.length - 1
                      }
                      onClick={() => moveIdleWidget(id, 1)}
                    >
                      <ArrowDownOutlined />
                    </button>
                    <button
                      type="button"
                      className="antd-chip-btn is-remove"
                      aria-label={t("移除")}
                      title={t("移除")}
                      disabled={!canEdit}
                      onClick={() => toggleIdleWidget(id)}
                    >
                      <CloseOutlined />
                    </button>
                  </span>
                </div>
              );
            })}
            {appearance.idleWidgets.length === 0 && (
              <span className="antd-widget-empty">
                {t("还没有选择组件，空闲时只显示灵动岛名称。")}
              </span>
            )}
          </div>
        </div>

        {available.length > 0 && (
          <div className="antd-widget-group">
            <div className="antd-widget-group-label">{t("可添加")}</div>
            <div className="antd-widget-more">
              <div className="antd-widget-chips">
                {available.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className="antd-widget-chip is-off"
                    disabled={!canEdit || limitReached}
                    title={`${t("添加")} ${t(option.label)}`}
                    onClick={() => toggleIdleWidget(option.id)}
                  >
                    <span className="antd-widget-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="antd-widget-label">{t(option.label)}</span>
                    <PlusOutlined className="antd-chip-add" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <Divider style={{ margin: "16px 0 12px" }} />
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">{t("番茄组件显示")}</div>
            <span className="antd-setting-desc">
              {t("选择番茄进度在胶囊里显示今日个数、专注分钟或本轮轮次。")}
            </span>
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

        <Divider style={{ margin: "16px 0 12px" }} />
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">{t("岛上显示歌词")}</div>
            <span className="antd-setting-desc">
              {t("关闭时显示歌手；歌词仍可在展开的音乐页查看。")}
            </span>
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
