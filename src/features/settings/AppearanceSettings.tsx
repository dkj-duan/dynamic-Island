import { SettingsCard } from "./SettingsCard";
import type { ReactNode } from "react";
import {
  BatteryMedium,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Droplets,
  Flame,
  Headphones,
  Hourglass,
  Music2,
  Palette,
  Timer,
  Volume2,
  Bot,
} from "lucide-react";
import {
  MAX_IDLE_WIDGETS,
  type AppearanceSettings,
  type IdleWidgetId,
  type PomodoroIdleView,
} from "../../domain/settings";
import { languageOptions, t } from "../../services/i18n";
const idleWidgetOptions: {
  id: IdleWidgetId;
  label: string;
  icon: typeof Palette;
}[] = [
  { id: "clock", label: "时钟", icon: Clock3 },
  { id: "quota", label: "常驻额度", icon: Bot },
  { id: "water", label: "喝水进度", icon: Droplets },
  { id: "pomodoro", label: "番茄进度", icon: Timer },
  { id: "music", label: "正在播放", icon: Music2 },
  { id: "battery", label: "电池与充电", icon: BatteryMedium },
  { id: "focus", label: "今日专注", icon: Flame },
  { id: "streak", label: "连续专注", icon: CalendarCheck },
  { id: "volume", label: "音量与静音", icon: Volume2 },
  { id: "bluetooth", label: "蓝牙耳机电量", icon: Headphones },
  { id: "waterTimer", label: "喝水倒计时", icon: Hourglass },
  { id: "countdown", label: "倒计时", icon: Hourglass },
];

const pomodoroViewOptions: { value: PomodoroIdleView; label: string }[] = [
  { value: "count", label: "今日个数" },
  { value: "focus", label: "专注分钟" },
  { value: "cycle", label: "本轮轮次" },
];

const themeOptions = [
  {
    value: "system" as const,
    label: "跟随系统",
    hint: "随 Windows 深浅色切换",
  },
  { value: "light" as const, label: "浅色", hint: "明亮低对比" },
  { value: "dark" as const, label: "深色", hint: "夜间使用" },
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
  const idleWidgetOrder = [
    ...appearance.idleWidgets,
    ...idleWidgetOptions
      .map((option) => option.id)
      .filter((id) => !appearance.idleWidgets.includes(id)),
  ];

  const idleWidgetLimitReached =
    appearance.idleWidgets.length >= MAX_IDLE_WIDGETS;

  function toggleIdleWidget(id: IdleWidgetId) {
    const enabled = appearance.idleWidgets.includes(id);
    if (!enabled && idleWidgetLimitReached) return;
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
    <div className="settings-stack">
      <SettingsCard className="preview-card">
        <div className="card-head">
          <h2>{t("桌面预览")}</h2>
          <span className="card-note">{t("实时同步")}</span>
        </div>
        <div className="preview-stage">{preview}</div>
        <div className="preview-caption">
          <span>{t("屏幕顶部 · 居中")}</span>
          <span>{t("拖动组件可调整顺序")}</span>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <h2>{t("界面主题")}</h2>
          <span className="card-note">{t("仅影响设置窗口")}</span>
        </div>
        <div
          className="theme-options"
          role="radiogroup"
          aria-label={t("界面主题")}
        >
          {themeOptions.map((option) => {
            const active = appearance.theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEdit}
                className={`theme-option ${active ? "active" : ""}`}
                onClick={() =>
                  onAppearanceChange({
                    ...appearance,
                    theme: option.value,
                  })
                }
              >
                <span
                  className={`theme-option-preview theme-option-preview-${option.value}`}
                  aria-hidden="true"
                />
                <span className="theme-option-copy">
                  <strong>{t(option.label)}</strong>
                  <small>{t(option.hint)}</small>
                </span>
                <span className="theme-option-check" aria-hidden="true">
                  {active && <Check size={13} strokeWidth={2.6} />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="setting-row">
          <span className="setting-row-copy">
            <strong>{t("界面语言")}</strong>
            <small>{t("界面语言选择后立即生效，两个窗口一起切换。")}</small>
          </span>
          <div className="segmented" role="group" aria-label={t("界面语言")}>
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!canEdit}
                aria-pressed={appearance.language === option.value}
                className={appearance.language === option.value ? "active" : ""}
                onClick={() =>
                  onAppearanceChange({
                    ...appearance,
                    language: option.value,
                  })
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <h2>{t("胶囊")}</h2>
        </div>
        <div className="idle-widget-block">
          <div className="setting-row-copy">
            <strong>{t("闲时内容")}</strong>
            <small>{t("在预览中拖动组件，或使用箭头调整顺序。")}</small>
          </div>
          <ul className="idle-widget-list">
            {idleWidgetOrder.map((id) => {
              const option = idleWidgetOptions.find((item) => item.id === id)!;
              const Icon = option.icon;
              const index = appearance.idleWidgets.indexOf(id);
              const enabled = index >= 0;
              return (
                <li
                  key={id}
                  className={`idle-widget-row ${enabled ? "" : "is-off"}`}
                >
                  <label className="idle-widget-toggle">
                    <input
                      type="checkbox"
                      disabled={
                        !canEdit || (!enabled && idleWidgetLimitReached)
                      }
                      checked={enabled}
                      onChange={() => toggleIdleWidget(id)}
                    />
                    <Icon size={15} aria-hidden="true" />
                    <span>{t(option.label)}</span>
                  </label>
                  <span className="idle-widget-actions">
                    <button
                      type="button"
                      aria-label={t("上移")}
                      disabled={!canEdit || !enabled || index === 0}
                      onClick={() => moveIdleWidget(id, -1)}
                    >
                      <ChevronUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("下移")}
                      disabled={
                        !canEdit ||
                        !enabled ||
                        index === appearance.idleWidgets.length - 1
                      }
                      onClick={() => moveIdleWidget(id, 1)}
                    >
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="form-note">
            {t(
              "常驻额度仅在有常驻 AI 账户时显示；最多同时显示 6 个，没有数据的组件自动隐藏。",
            )}
          </p>
          <div className="setting-row">
            <span className="setting-row-copy">
              <strong>{t("番茄组件显示")}</strong>
              <small>{t("选择番茄组件在胶囊上展示的信息。")}</small>
            </span>
            <div
              className="segmented"
              role="group"
              aria-label={t("番茄组件显示")}
            >
              {pomodoroViewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={appearance.pomodoroView === option.value}
                  className={
                    appearance.pomodoroView === option.value ? "active" : ""
                  }
                  onClick={() =>
                    onAppearanceChange({
                      ...appearance,
                      pomodoroView: option.value,
                    })
                  }
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
