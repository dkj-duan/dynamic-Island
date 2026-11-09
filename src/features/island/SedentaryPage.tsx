import type { SedentarySettings, SedentaryTone } from "../../domain/sedentary";
import { t } from "../../services/i18n";
import { StandRing } from "../sedentary/StandRing";
import sedentaryChair from "../../assets/island/away-chair.png";

type Props = {
  sedentary: SedentarySettings;
  sittingMin: number;
  tone: SedentaryTone;
  toneColor: string;
  sedentaryAdded: number;
  todayBreaks: number;
  standNow: () => Promise<void>;
  standError: string;
  setStandError: (error: string) => void;
};

export function SedentaryPage({
  sedentary,
  sittingMin,
  tone,
  toneColor,
  sedentaryAdded,
  todayBreaks,
  standNow,
  standError,
  setStandError,
}: Props) {
  const percent = Math.round((sittingMin / sedentary.reminderMinutes) * 100);
  return (
    <div className="stand-view">
      <div className="stand-hero">
        <StandRing
          percent={percent}
          tone={tone}
          size="island"
          title={`${t("已坐")} ${sittingMin} ${t("分钟")}`}
          art={sedentaryChair}
        />
        <div className="stand-copy">
          <strong>
            {todayBreaks}
            <span>
              {" "}
              / {sedentary.goalBreaks} {t("次")}
            </span>
          </strong>
          <span className="stand-meta">
            <i
              className="stand-tone-dot"
              style={{ background: toneColor }}
              aria-hidden="true"
            />
            <span style={{ color: toneColor }}>
              {t("已坐")} {sittingMin} {t("分钟")}
            </span>
            <span>
              ·{" "}
              {todayBreaks >= sedentary.goalBreaks
                ? t("今日目标已完成")
                : `${t("还差")} ${sedentary.goalBreaks - todayBreaks} ${t("次")}`}
            </span>
          </span>
        </div>
      </div>
      <div className="stand-actions">
        <button
          className="stand-add"
          onClick={() => {
            setStandError("");
            void standNow();
          }}
        >
          {t("起身一下")}
        </button>
      </div>
      {standError && (
        <span className="duration-error" role="alert">
          {standError}
        </span>
      )}
      {sedentaryAdded > 0 && (
        <span
          key={`sedentary-flash-${sedentaryAdded}`}
          className="stand-flash"
          aria-hidden="true"
        >
          +1
        </span>
      )}
    </div>
  );
}
