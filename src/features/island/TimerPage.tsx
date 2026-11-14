import { Hourglass } from "lucide-react";
import { t } from "../../services/i18n";
import {
  formatRemaining,
  parseDuration,
  type TimerMode,
  type TimerState,
} from "../../domain/timer";
import {
  formatDurationSeconds,
  type CountdownItem,
} from "../../domain/countdown";
import {
  isLongBreakDue,
  type PomodoroProgress,
  type PomodoroSettings,
} from "../../domain/pomodoro";
import pomodoroClock from "../../assets/pomodoro-clock.png";

type TimerPageProps = {
  timer: TimerState;
  timerMode: TimerMode;
  timerModeLabel: string;
  isPomodoroMode: boolean;
  remaining: string;
  minutes: string;
  seconds: string;
  setMinutes: (value: string) => void;
  setSeconds: (value: string) => void;
  durationError: string;
  setDurationError: (value: string) => void;
  lastDuration: number;
  customTimerOpen: boolean;
  setCustomTimerOpen: (open: boolean) => void;
  countdownOpen: boolean;
  setCountdownOpen: (open: boolean) => void;
  presetMilliseconds: number;
  durationCountdowns: CountdownItem[];
  startCountdown: (item: CountdownItem) => void;
  startManualTimer: (durationMs: number) => void;
  startTimer: (durationMs: number, current: number) => void;
  resetTimer: () => void;
  beginFocus: (durationMs: number) => void;
  beginBreak: (kind: "break" | "longBreak") => void;
  pauseOrResumeTimer: () => void;
  extendOneMinute: () => void;
  pomodoro: PomodoroSettings;
  pomodoroProgress: PomodoroProgress;
};

/**
 * The island's timer page: the running timer view plus the countdown and
 * custom-duration pickers. Pure presentation over the timer hook's state.
 */
export function TimerPage({
  timer,
  timerMode,
  timerModeLabel,
  isPomodoroMode,
  remaining,
  minutes,
  seconds,
  setMinutes,
  setSeconds,
  durationError,
  setDurationError,
  lastDuration,
  customTimerOpen,
  setCustomTimerOpen,
  countdownOpen,
  setCountdownOpen,
  presetMilliseconds,
  durationCountdowns,
  startCountdown,
  startManualTimer,
  startTimer,
  resetTimer,
  beginFocus,
  beginBreak,
  pauseOrResumeTimer,
  extendOneMinute,
  pomodoro,
  pomodoroProgress,
}: TimerPageProps) {
  return countdownOpen ? (
    <div className="countdown-picker">
      {durationCountdowns.slice(0, 3).map((item) => (
        <button
          key={item.id}
          className="countdown-row"
          onClick={() => startCountdown(item)}
        >
          <span>{item.label}</span>
          <span className="countdown-row-value">
            {formatDurationSeconds(item.durationSeconds ?? 0)}
          </span>
        </button>
      ))}
      {durationCountdowns.length === 0 && (
        <span className="countdown-empty">{t("设置里还没有时长倒计时")}</span>
      )}
      <div className="countdown-picker-actions">
        <button
          onClick={() => {
            setCountdownOpen(false);
            setCustomTimerOpen(true);
          }}
        >
          {t("临时倒计时")}
        </button>
        <button onClick={() => setCountdownOpen(false)}>{t("返回")}</button>
      </div>
    </div>
  ) : (
    <div className="timer-view">
      <div className="timer-status">
        <span>{timerModeLabel}</span>
        <i aria-hidden="true" />
        <span>
          {t(
            timer.status === "finished"
              ? "已结束 · 按 Esc 关闭"
              : timer.status === "paused"
                ? "已暂停"
                : timer.status === "running"
                  ? "进行中"
                  : "选择时长",
          )}
        </span>
      </div>
      <div className="timer-main">
        {isPomodoroMode && (
          <img
            className="pomodoro-face"
            src={pomodoroClock}
            alt=""
            draggable={false}
          />
        )}
        <div className={`timer-clock is-${timer.status} mode-${timerMode}`}>
          {timer.status === "finished"
            ? t("时间到")
            : timer.status === "idle"
              ? formatRemaining(
                  customTimerOpen
                    ? (parseDuration(minutes, seconds) ?? 0)
                    : presetMilliseconds ||
                        (parseDuration(minutes, seconds) ?? 0),
                )
              : remaining}
        </div>
      </div>
      {isPomodoroMode && (
        <div className="timer-pomodoro">
          <span
            className="pomodoro-tomatoes"
            role="img"
            aria-label={`${t("本轮")} ${Math.min(
              pomodoroProgress.cycle,
              pomodoro.longBreakEvery,
            )}/${pomodoro.longBreakEvery}`}
          >
            {Array.from({ length: pomodoro.longBreakEvery }, (_, index) =>
              index <
              Math.min(pomodoroProgress.cycle, pomodoro.longBreakEvery) ? (
                <img
                  key={index}
                  className="pomodoro-tomato"
                  src={pomodoroClock}
                  alt=""
                  draggable={false}
                />
              ) : (
                <img
                  key={index}
                  className="pomodoro-tomato is-off"
                  src={pomodoroClock}
                  alt=""
                  draggable={false}
                />
              ),
            )}
          </span>
          <i aria-hidden="true" />
          <span>
            {t("今日")} {pomodoroProgress.completedToday} {t("个番茄")}
          </span>
        </div>
      )}
      {timer.status === "idle" ? (
        <>
          {customTimerOpen ? (
            <form
              className="custom-timer"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const duration = parseDuration(minutes, seconds);
                if (duration === null) {
                  setDurationError(t("请输入有效时间（秒数为 0–59）"));
                  return;
                }
                startManualTimer(duration);
                setCustomTimerOpen(false);
              }}
            >
              <label>
                <input
                  aria-label={t("分钟")}
                  inputMode="numeric"
                  placeholder="00"
                  value={minutes}
                  maxLength={3}
                  onChange={(event) => {
                    setMinutes(event.target.value);
                    setDurationError("");
                  }}
                />
                <span>{t("分")}</span>
              </label>
              <span className="time-separator">:</span>
              <label>
                <input
                  aria-label={t("秒")}
                  inputMode="numeric"
                  placeholder="00"
                  value={seconds}
                  maxLength={2}
                  onChange={(event) => {
                    setSeconds(event.target.value);
                    setDurationError("");
                  }}
                />
                <span>{t("秒")}</span>
              </label>
              <button type="submit">{t("开始")}</button>
              <button
                type="button"
                className="is-ghost"
                onClick={() => setCustomTimerOpen(false)}
              >
                {t("返回")}
              </button>
            </form>
          ) : (
            <div className="timer-presets">
              <button
                className="timer-preset"
                onClick={() => {
                  beginFocus(pomodoro.focusMinutes * 60_000);
                  setCustomTimerOpen(false);
                }}
              >
                <span className="timer-preset-label">{t("专注")}</span>
                <span className="timer-preset-value">
                  {pomodoro.focusMinutes} {t("分")}
                </span>
              </button>
              <button
                className="timer-preset"
                onClick={() => {
                  beginBreak("break");
                  setCustomTimerOpen(false);
                }}
              >
                <span className="timer-preset-label">{t("短休")}</span>
                <span className="timer-preset-value">
                  {pomodoro.shortBreakMinutes} {t("分")}
                </span>
              </button>
              <button
                className="timer-preset"
                onClick={() => {
                  beginBreak("longBreak");
                  setCustomTimerOpen(false);
                }}
              >
                <span className="timer-preset-label">{t("长休")}</span>
                <span className="timer-preset-value">
                  {pomodoro.longBreakMinutes} {t("分")}
                </span>
              </button>
              <button
                className="timer-preset is-ghost"
                onClick={() => {
                  setCustomTimerOpen(false);
                  setCountdownOpen(true);
                }}
              >
                <span className="timer-preset-label">{t("倒计时")}</span>
                <Hourglass
                  className="timer-preset-icon"
                  size={13}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
          {durationError && (
            <span className="duration-error" role="alert">
              {durationError}
            </span>
          )}
        </>
      ) : timer.status === "finished" ? (
        <div className="timer-controls">
          <button onClick={resetTimer}>{t("知道了")}</button>
          <button
            onClick={() =>
              timerMode === "focus"
                ? beginFocus(lastDuration)
                : startTimer(lastDuration, Date.now())
            }
          >
            {t("再计一次")}
          </button>
          {timerMode === "focus" ? (
            <button
              onClick={() =>
                beginBreak(
                  isLongBreakDue(pomodoroProgress.cycle, pomodoro)
                    ? "longBreak"
                    : "break",
                )
              }
            >
              {isLongBreakDue(pomodoroProgress.cycle, pomodoro)
                ? t("开始长休")
                : t("开始短休")}
            </button>
          ) : timerMode === "break" || timerMode === "longBreak" ? (
            <button onClick={() => beginFocus(pomodoro.focusMinutes * 60_000)}>
              {t("开始专注")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="timer-controls">
          <button onClick={pauseOrResumeTimer}>
            {timer.status === "running" ? t("暂停") : t("继续")}
          </button>
          <button onClick={resetTimer}>{t("取消")}</button>
          <button onClick={extendOneMinute}>{t("+1 分钟")}</button>
        </div>
      )}
    </div>
  );
}
