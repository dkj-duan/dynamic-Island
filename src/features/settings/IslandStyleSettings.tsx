import { ColorPicker, Segmented, Space } from "antd";
import { Section } from "./ui/Section";
import {
  expandedShapes,
  idleStyles,
  islandMaterials,
  automaticIslandText,
  defaultAppearance,
  defaultIslandBackground,
  type AppearanceSettings,
  type ExpandedShape,
  type IdleStyle,
} from "../../domain/settings";
import { t } from "../../services/i18n";

const shapeLabels: Record<ExpandedShape, string> = {
  classic: "经典",
  asymmetric: "灵动",
};

const idleStyleLabels: Record<IdleStyle, string> = {
  capsule: "经典胶囊",
  card: "圆角卡片",
  grouped: "分组组件",
  minimal: "极简细条",
};

const idleStyleShortLabels: Record<IdleStyle, string> = {
  capsule: "胶囊",
  card: "卡片",
  grouped: "分组",
  minimal: "细条",
};

const backgrounds = [
  { label: "经典黑", color: null },
  { label: "云白", color: "#e3e3e7" },
  { label: "琥珀", color: "#f0b26b" },
  { label: "青瓷", color: "#7fd4c3" },
  { label: "绛紫", color: "#b3a2f8" },
  { label: "雾蓝", color: "#8fc0f2" },
  { label: "绯红", color: "#ef9bb4" },
];

export function IslandStyleSection({
  appearance,
  onAppearanceChange,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  canEdit: boolean;
}) {
  const { islandBackgroundColor, islandTextColor } = appearance;
  const textColor =
    islandTextColor ?? automaticIslandText(islandBackgroundColor);
  const canResetColors =
    islandBackgroundColor !== null ||
    islandTextColor !== null ||
    appearance.islandAccent !== defaultAppearance.islandAccent;

  return (
    <Section
      title={t("灵动岛样式")}
      extra={
        <Space size={6}>
          <span className="section-inline-note">{t("材质")}</span>
          <Segmented
            size="small"
            aria-label={t("材质")}
            value={appearance.islandMaterial}
            disabled={!canEdit}
            options={islandMaterials.map((value) => ({
              value,
              label: t(value === "glass" ? "毛玻璃" : "实色"),
            }))}
            onChange={(islandMaterial) =>
              onAppearanceChange({ ...appearance, islandMaterial })
            }
          />
        </Space>
      }
    >
      <div className="appearance-style-grid">
        <div className="appearance-style-group">
          <span className="section-inline-note">{t("收起样式")}</span>
          <div
            className="island-style-cards idle-style-cards"
            role="radiogroup"
            aria-label={t("收起样式")}
          >
            {idleStyles.map((style) => {
              const on = appearance.idleStyle === style;
              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t(idleStyleLabels[style])}
                  disabled={!canEdit}
                  className={`island-style-card ${on ? "is-on" : ""}`}
                  title={t(idleStyleLabels[style])}
                  onClick={() =>
                    onAppearanceChange({ ...appearance, idleStyle: style })
                  }
                >
                  <span
                    className={`idle-style-chip idle-chip-${style}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="island-style-label">
                    {t(idleStyleShortLabels[style])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="appearance-style-group">
          <span className="section-inline-note">{t("展开样式")}</span>
          <div
            className="island-style-cards"
            role="radiogroup"
            aria-label={t("展开样式")}
          >
            {expandedShapes.map((shape) => {
              const on = appearance.expandedShape === shape;
              return (
                <button
                  key={shape}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canEdit}
                  className={`island-style-card ${on ? "is-on" : ""}`}
                  title={t(shapeLabels[shape])}
                  onClick={() =>
                    onAppearanceChange({ ...appearance, expandedShape: shape })
                  }
                >
                  <span
                    className={`island-style-chip chip-${shape}`}
                    aria-hidden="true"
                  />
                  <span className="island-style-label">
                    {t(shapeLabels[shape])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="island-colors">
          <span className="section-inline-note">{t("灵动岛配色")}</span>
          <div
            className="island-color-presets"
            role="group"
            aria-label={t("背景色预设")}
          >
            {backgrounds.map(({ label, color }) => (
              <button
                key={label}
                type="button"
                aria-pressed={islandBackgroundColor === color}
                aria-label={t(label)}
                title={t(label)}
                disabled={!canEdit}
                className="island-color-dot"
                style={{ backgroundColor: color ?? defaultIslandBackground }}
                onClick={() =>
                  onAppearanceChange({
                    ...appearance,
                    islandBackgroundColor: color,
                  })
                }
              />
            ))}
          </div>
          <div className="island-color-controls">
            <IslandColorPicker
              label={t("背景颜色")}
              value={islandBackgroundColor ?? defaultIslandBackground}
              disabled={!canEdit}
              onChange={(color) =>
                onAppearanceChange({
                  ...appearance,
                  islandBackgroundColor: color,
                })
              }
            />
            <IslandColorPicker
              label={t("文字颜色")}
              value={textColor}
              disabled={!canEdit}
              onChange={(color) =>
                onAppearanceChange({ ...appearance, islandTextColor: color })
              }
            />
            <button
              type="button"
              className="island-color-reset"
              disabled={!canEdit || !canResetColors}
              onClick={() =>
                onAppearanceChange({
                  ...appearance,
                  islandAccent: defaultAppearance.islandAccent,
                  islandBackgroundColor: null,
                  islandTextColor: null,
                })
              }
            >
              {t("恢复默认配色")}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function IslandColorPicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <ColorPicker
      value={value}
      disabled={disabled}
      disabledAlpha
      disabledFormat
      format="hex"
      onChange={(color) => onChange(color.toHexString())}
    >
      <button type="button" className="island-color-field" disabled={disabled}>
        {label}
        <span aria-hidden="true" style={{ backgroundColor: value }} />
      </button>
    </ColorPicker>
  );
}
