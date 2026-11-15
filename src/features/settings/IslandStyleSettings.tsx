import { Section } from "./ui/Section";
import {
  expandedShapes,
  islandAccents,
  type AppearanceSettings,
  type ExpandedShape,
  type IslandAccent,
} from "../../domain/settings";
import { t } from "../../services/i18n";

const shapeLabels: Record<ExpandedShape, string> = {
  classic: "经典",
  asymmetric: "灵动",
};

const accentLabels: Record<IslandAccent, string> = {
  white: "云白",
  amber: "琥珀",
  teal: "青瓷",
  violet: "绛紫",
  blue: "雾蓝",
  rose: "绯红",
};

/** Island shell style (outline + material) and accent tint pickers. */
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
    <Section
      title={t("展开样式")}
      description={t(
        "选择展开面板的轮廓与材质，收起胶囊保持深色底；强调色出现在描边微光、页标题与激活页签上。",
      )}
    >
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

      <div className="antd-setting-row">
        <div className="antd-setting-copy">
          <div className="antd-setting-title">{t("强调色")}</div>
          <span className="section-inline-note">
            {t(accentLabels[appearance.islandAccent])}
          </span>
        </div>
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
                  onAppearanceChange({ ...appearance, islandAccent: accent })
                }
              />
            );
          })}
        </div>
      </div>
    </Section>
  );
}
