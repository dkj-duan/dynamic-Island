import { Section } from "./ui/Section";
import {
  expandedShapes,
  idleStyles,
  islandAccents,
  type AppearanceSettings,
  type ExpandedShape,
  type IdleStyle,
  type IslandAccent,
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
  glass: "毛玻璃",
};

const accentLabels: Record<IslandAccent, string> = {
  white: "云白",
  amber: "琥珀",
  teal: "青瓷",
  violet: "绛紫",
  blue: "雾蓝",
  rose: "绯红",
};

/** Collapsed shell picker, expanded panel style and accent tint picker. */
export function IslandStyleSection({
  appearance,
  onAppearanceChange,
  canEdit,
}: {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  canEdit: boolean;
}) {
  return (
    <>
      <Section title={t("收起样式")}>
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
                  {t(idleStyleLabels[style])}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t("展开样式")}>
        <div className="expand-style-row">
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

          <div className="expand-accent">
            <span className="section-inline-note">
              {t("强调色")} · {t(accentLabels[appearance.islandAccent])}
            </span>
            <div
              className="island-accent-row"
              role="radiogroup"
              aria-label={t("强调色")}
            >
              {islandAccents.map((accent) => {
                const on = appearance.islandAccent === accent;
                return (
                  <button
                    key={accent}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={t(accentLabels[accent])}
                    title={t(accentLabels[accent])}
                    disabled={!canEdit}
                    className={`island-accent-dot accent-${accent} ${on ? "is-on" : ""}`}
                    onClick={() =>
                      onAppearanceChange({
                        ...appearance,
                        islandAccent: accent,
                      })
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
