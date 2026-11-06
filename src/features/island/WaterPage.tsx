import type { Dispatch, SetStateAction } from "react";
import type { WaterSettings, WaterTone } from "../../domain/water";
import { WaterGlass } from "../water/WaterGlass";
import { t } from "../../services/i18n";
import waterDrop from "../../assets/water-drop.webp";

type Props = {
  water: WaterSettings;
  waterPercentToday: number;
  waterToneValue: WaterTone;
  waterToneColor: string;
  waterAdded: number;
  waterAddedMl: number;
  todayWater: number;
  waterCupsToday: number;
  customWaterOpen: boolean;
  setCustomWaterOpen: Dispatch<SetStateAction<boolean>>;
  customWaterMl: string;
  setCustomWaterMl: Dispatch<SetStateAction<string>>;
  waterError: string;
  setWaterError: Dispatch<SetStateAction<string>>;
  drinkWater: (amount: number) => Promise<void>;
};

export function WaterPage({
  water,
  waterPercentToday,
  waterToneValue,
  waterToneColor,
  waterAdded,
  waterAddedMl,
  todayWater,
  waterCupsToday,
  customWaterOpen,
  setCustomWaterOpen,
  customWaterMl,
  setCustomWaterMl,
  waterError,
  setWaterError,
  drinkWater,
}: Props) {
  return (
    <div className="water-view">
      <div className="water-hero">
        <WaterGlass
          percent={waterPercentToday}
          tone={waterToneValue}
          size="island"
          splashKey={waterAdded}
        />
        <div className="water-copy">
          <strong>
            {todayWater}
            <span> / {water.goalMl} ml</span>
          </strong>
          <span className="water-meta">
            <i
              className="water-tone-dot"
              style={{ background: waterToneColor }}
              aria-hidden="true"
            />
            <span style={{ color: waterToneColor }}>{waterPercentToday}%</span>
            <span>
              · {waterCupsToday} {t("杯")} ·{" "}
              {todayWater >= water.goalMl
                ? t("今日目标已完成")
                : `${t("还差")} ${water.goalMl - todayWater} ml`}
            </span>
          </span>
        </div>
      </div>
      {customWaterOpen ? (
        <form
          className="water-custom-inline"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(customWaterMl);
            if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
              setWaterError(t("请输入 1–5000 毫升"));
              return;
            }
            void drinkWater(amount);
            setCustomWaterOpen(false);
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="300"
            aria-label={t("自定义毫升")}
            value={customWaterMl}
            onChange={(event) => {
              setCustomWaterMl(event.target.value.replace(/\D/g, ""));
              setWaterError("");
            }}
          />
          <span>ml</span>
          <button type="submit" className="water-custom-add">
            {t("添加")}
          </button>
          <button
            type="button"
            className="water-custom-cancel"
            onClick={() => {
              setCustomWaterOpen(false);
              setWaterError("");
            }}
          >
            {t("取消")}
          </button>
        </form>
      ) : (
        <div className="water-actions">
          <button
            className="water-add"
            onClick={() => void drinkWater(water.cupMl)}
          >
            <img
              className="water-drop-sm"
              src={waterDrop}
              alt=""
              draggable={false}
            />
            {t("喝一杯")} · {water.cupMl} ml
          </button>
          <button
            className="water-more"
            onClick={() => setCustomWaterOpen(true)}
          >
            {t("自定义")}
          </button>
        </div>
      )}
      {waterError && (
        <span className="duration-error" role="alert">
          {waterError}
        </span>
      )}
      {waterAdded > 0 && (
        <span
          key={`water-flash-${waterAdded}`}
          className="water-flash"
          aria-hidden="true"
        >
          <img
            className="water-flash-drop"
            src={waterDrop}
            alt=""
            draggable={false}
          />
          +{waterAddedMl} ml
        </span>
      )}
    </div>
  );
}
