import { type CSSProperties } from "react";
import { Music2, Mail, Timer } from "lucide-react";
import { t } from "../../services/i18n";
import type { IslandDisplay } from "../../domain/islandDisplay";
import type { SystemNotice } from "../../domain/systemNotices";
import type { AppearanceSettings } from "../../domain/settings";
import type { TimerMode, TimerState } from "../../domain/timer";
import type { WaterSettings, WaterTone } from "../../domain/water";
import type { SedentarySettings } from "../../domain/sedentary";
import type { RecentMail } from "../mail/useMail";
import { IdleWidgets } from "./IdleWidgets";
import type { IdleChangeShownAt, IdleData } from "./idleWidgetData";
import type { MascotReaction } from "../../domain/mascotReaction";
import type { MediaState } from "./useIslandMedia";
import { QuotaRings } from "../ai/QuotaRings";
import { MediaWave, NoticeIcon } from "./IslandParts";
import { formatMediaTime } from "./islandFormat";
import pomodoroClock from "../../assets/pomodoro-clock.png";
import waterDrop from "../../assets/water-drop.webp";
import sedentaryChair from "../../assets/island/away-chair.png";

/** The media capsule has one spare slot; these are the candidates. */
export type MediaBadge = "pomodoro" | "water" | "quota";

type CapsuleContentProps = {
  appearance: AppearanceSettings;
  display: IslandDisplay;
  displayNotice: SystemNotice | null;
  onWidthChange?: (width: number) => void;
  idleData: IdleData;
  mascotReaction?: MascotReaction | null;
  reservedWidth?: number;
  /** Change-tier idle widget tracking; see IdleWidgets. */
  changeShownAt?: IdleChangeShownAt;
  changeWindowMs?: number;
  now?: number;
  // Timer capsule.
  isPomodoroMode: boolean;
  timerStatus: TimerState["status"];
  timerMode: TimerMode;
  timerModeLabel: string;
  timerProgress: number | null;
  remaining: string;
  // Water capsule.
  water: WaterSettings;
  waterToneValue: WaterTone;
  waterToneColor: string;
  waterPercentToday: number;
  waterCupsToday: number;
  todayWater: number;
  waterAdded: number;
  waterAddedMl: number;
  // Sedentary capsule.
  sedentary: SedentarySettings;
  sedentarySitting: number;
  sedentaryAdded: number;
  todaySedentaryBreaks: number;
  // Mail capsule.
  capsuleMail: RecentMail | null;
  mailKey: string;
  // Media capsule.
  media: MediaState | null;
  mediaKey: string;
  artwork: { key: string; src: string | null } | null;
  currentLyric: string | null;
  mediaPosition: number | null;
  mediaBadgeShown: MediaBadge;
  pomodoroBadgePercent: number;
  pomodoroBadgeColor: string;
};

/**
 * Whatever the collapsed capsule shows: the current reminder, timer, media
 * or the idle widget strip. Pure presentation — every value arrives via
 * props so the island window keeps owning the state.
 */
export function CapsuleContent({
  appearance,
  display,
  displayNotice,
  onWidthChange,
  idleData,
  mascotReaction,
  reservedWidth,
  changeShownAt,
  changeWindowMs,
  now,
  isPomodoroMode,
  timerStatus,
  timerMode,
  timerModeLabel,
  timerProgress,
  remaining,
  water,
  waterToneValue,
  waterToneColor,
  waterPercentToday,
  waterCupsToday,
  todayWater,
  waterAdded,
  waterAddedMl,
  sedentary,
  sedentarySitting,
  sedentaryAdded,
  todaySedentaryBreaks,
  capsuleMail,
  mailKey,
  media,
  mediaKey,
  artwork,
  currentLyric,
  mediaPosition,
  mediaBadgeShown,
  pomodoroBadgePercent,
  pomodoroBadgeColor,
}: CapsuleContentProps) {
  return (
    <>
      {display === "notice" && displayNotice ? (
        <span
          key={displayNotice.eventId}
          className="island-current system-notice"
          data-kind={displayNotice.kind}
          data-source={displayNotice.source}
          role="status"
        >
          <NoticeIcon kind={displayNotice.kind} source={displayNotice.source} />
          <span className="system-notice-label">{displayNotice.label}</span>
          <strong>{displayNotice.value}</strong>
        </span>
      ) : display === "water" ? (
        <span
          className={`island-current island-water-current ${waterToneValue === "low" ? "is-low" : ""}`}
          role="status"
        >
          <img
            className="water-indicator water-drop-icon"
            src={waterDrop}
            alt=""
            draggable={false}
          />
          <span className="compact-copy">
            <span className="compact-primary">{t("该喝水了")}</span>
            <span className="compact-secondary">
              {todayWater} / {water.goalMl} ml · {waterCupsToday} {t("杯")}
            </span>
          </span>
        </span>
      ) : display === "waterLogged" ? (
        <span
          key={`water-logged-${waterAdded}`}
          className="island-current island-water-current is-logged"
          role="status"
        >
          <img
            className="water-indicator water-drop-icon"
            src={waterDrop}
            alt=""
            draggable={false}
          />
          <span className="compact-copy">
            <span className="compact-primary">{t("已记录一杯水")}</span>
            <span className="compact-secondary">
              +{waterAddedMl} ml · {todayWater} / {water.goalMl} ml
            </span>
          </span>
        </span>
      ) : display === "sedentary" ? (
        <span className="island-current island-sedentary-current" role="status">
          <img
            className="water-indicator sedentary-indicator"
            src={sedentaryChair}
            alt=""
            draggable={false}
          />
          <span className="compact-copy">
            <span className="compact-primary">{t("该起身活动了")}</span>
            <span className="compact-secondary">
              {t("已坐")} {sedentarySitting} {t("分钟")}
            </span>
          </span>
        </span>
      ) : display === "sedentaryLogged" ? (
        <span
          key={`sedentary-logged-${sedentaryAdded}`}
          className="island-current island-sedentary-current is-logged"
          role="status"
        >
          <img
            className="water-indicator sedentary-indicator"
            src={sedentaryChair}
            alt=""
            draggable={false}
          />
          <span className="compact-copy">
            <span className="compact-primary">{t("已记录起身")}</span>
            <span className="compact-secondary">
              {t("今日")} {todaySedentaryBreaks} / {sedentary.goalBreaks}{" "}
              {t("次")}
            </span>
          </span>
        </span>
      ) : display === "mail" && capsuleMail ? (
        <span
          key={mailKey}
          className={`island-current island-mail-current ${capsuleMail.code ? "has-code" : ""}`}
          role="status"
        >
          {/* Icon on the left; account above the code, both centered. */}
          <Mail
            className={`island-mail-icon ${capsuleMail.code ? "" : "is-new"}`}
            size={15}
            aria-hidden="true"
          />
          <span className="compact-copy island-mail-copy">
            <span className="island-mail-line">
              <span className="island-mail-account">{capsuleMail.account}</span>
            </span>
            <span
              className={`compact-primary ${capsuleMail.code ? "island-code" : "island-mail-title"}`}
            >
              {capsuleMail.code ? (
                <>
                  <span className="island-code-digits" aria-hidden="true">
                    {[...capsuleMail.code].map((digit, index) => (
                      <span
                        key={index}
                        style={{ "--i": index } as CSSProperties}
                      >
                        {digit}
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">{capsuleMail.code}</span>
                </>
              ) : (
                capsuleMail.subject || t("新邮件")
              )}
            </span>
          </span>
        </span>
      ) : display === "timer" || display === "finished" ? (
        <span
          className={`island-current compact-timer timer-only mode-${timerMode} is-${timerStatus}`}
          style={
            {
              "--timer-progress": `${(timerProgress ?? 0) * 100}%`,
            } as CSSProperties
          }
        >
          <span className="compact-timer-icon" aria-hidden="true">
            {isPomodoroMode ? (
              <img
                className="timer-indicator tomato-photo"
                src={pomodoroClock}
                alt=""
                draggable={false}
              />
            ) : (
              <Timer className="timer-indicator" size={15} aria-hidden="true" />
            )}
          </span>
          <span className="compact-copy">
            <span className="compact-primary">
              {timerModeLabel}
              {timerStatus === "running" ? (
                <svg
                  className="compact-timer-ecg"
                  viewBox="0 0 73 18"
                  role="img"
                  aria-label={t("进行中")}
                >
                  <path
                    className="compact-timer-ecg-base"
                    d="M1 10h12l3-3 3 6 4-11 5 15 4-7h12l3-3 3 6 4-11 5 15 4-7h9"
                  />
                  <path
                    className="compact-timer-ecg-pulse"
                    d="M1 10h12l3-3 3 6 4-11 5 15 4-7h12l3-3 3 6 4-11 5 15 4-7h9"
                    pathLength="100"
                  />
                </svg>
              ) : (
                <span className="compact-timer-state">
                  {t(timerStatus === "paused" ? "已暂停" : "已结束")}
                </span>
              )}
            </span>
          </span>
          <span className={`island-timer-value mode-${timerMode}`}>
            {timerStatus === "finished" ? t("时间到") : remaining}
          </span>
          {timerProgress !== null && (
            <span className="compact-timer-track" aria-hidden="true" />
          )}
        </span>
      ) : display === "media" && media?.title ? (
        <span className="island-current island-media-current">
          <span
            className={`compact-art ${media.playing && artwork?.key === mediaKey && artwork.src ? "is-spinning" : ""}`}
          >
            {artwork?.key === mediaKey && artwork.src ? (
              <img src={artwork.src} alt="" />
            ) : (
              <Music2 size={14} aria-hidden="true" />
            )}
          </span>
          <span className="compact-copy">
            <span className="compact-primary">{media.title}</span>
            <span className="compact-secondary">
              {appearance.islandLyrics && currentLyric
                ? currentLyric
                : media.artist || t("未知艺术家")}
            </span>
          </span>
          <span className="media-playing-mark">
            <MediaWave playing={media.playing} compact />
            {mediaPosition !== null && (
              <span className="media-time">
                {formatMediaTime(mediaPosition)}
              </span>
            )}
            <span className="media-mark-slot" key={mediaBadgeShown}>
              {mediaBadgeShown === "quota" && idleData.quota ? (
                <QuotaRings
                  items={idleData.quota.items}
                  compact
                  provider={idleData.quota.provider}
                />
              ) : mediaBadgeShown === "water" ? (
                <span
                  className="media-badge"
                  role="img"
                  aria-label={`${t("喝水进度")} ${waterPercentToday}%`}
                  title={`${t("喝水进度")} ${waterPercentToday}%`}
                  style={
                    {
                      "--badge-percent": `${waterPercentToday}%`,
                      "--badge-color": waterToneColor,
                    } as CSSProperties
                  }
                >
                  <img src={waterDrop} alt="" />
                </span>
              ) : (
                <span
                  className="media-badge"
                  role="img"
                  aria-label={`${t("番茄进度")} ${pomodoroBadgePercent}%`}
                  title={`${t("番茄进度")} ${pomodoroBadgePercent}%`}
                  style={
                    {
                      "--badge-percent": `${pomodoroBadgePercent}%`,
                      "--badge-color": pomodoroBadgeColor,
                    } as CSSProperties
                  }
                >
                  <img src={pomodoroClock} alt="" />
                </span>
              )}
            </span>
          </span>
        </span>
      ) : (
        <IdleWidgets
          key={`${appearance.idleWidgets.join(",")}:${reservedWidth ?? 0}`}
          appearance={appearance}
          data={idleData}
          mascotReaction={mascotReaction}
          reservedWidth={reservedWidth}
          onWidthChange={onWidthChange}
          changeShownAt={changeShownAt}
          changeWindowMs={changeWindowMs}
          now={now}
        />
      )}
    </>
  );
}
