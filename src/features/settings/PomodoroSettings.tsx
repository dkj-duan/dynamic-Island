import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { dailyValues, recentDays, statForDay } from "../../domain/dailyStats";
import {
  defaultPomodoroSettings,
  parsePomodoroSettings,
  pomodoroVersion,
  type PomodoroSettings,
} from "../../domain/pomodoro";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
} from "../../services/pomodoroRepository";
import { useDailyStats } from "../stats/useDailyStats";
import { DailyChart } from "../stats/DailyChart";
import { t } from "../../services/i18n";
import pomodoroClock from "../../assets/pomodoro-clock.png";

const fields: {
  key: keyof PomodoroSettings;
  label: string;
}[] = [
  { key: "focusMinutes", label: "专注时长（分钟）" },
  { key: "shortBreakMinutes", label: "短休息（分钟）" },
  { key: "longBreakMinutes", label: "长休息（分钟）" },
  { key: "longBreakEvery", label: "每几轮长休一次" },
];

export function PomodoroSettings() {
  const desktop = isTauri();
  const [settings, setSettings] = useState<PomodoroSettings>(
    defaultPomodoroSettings,
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const { stats, today: todayDay } = useDailyStats(30);
  const today = statForDay(stats, todayDay);
  const doneToday = today?.pomodoros ?? 0;
  const focusMinutes = Math.round((today?.focusSeconds ?? 0) / 60);
  const totalPomodoros = stats.reduce((sum, stat) => sum + stat.pomodoros, 0);
  const values = dailyValues(stats, recentDays(30), (stat) => stat.pomodoros);
  const focusText =
    focusMinutes < 60
      ? `${focusMinutes} ${t("分钟")}`
      : focusMinutes % 60
        ? `${Math.floor(focusMinutes / 60)} ${t("小时")} ${focusMinutes % 60} ${t("分钟")}`
        : `${Math.floor(focusMinutes / 60)} ${t("小时")}`;

  useEffect(() => {
    let active = true;
    void loadPomodoroSettings().then((stored) => {
      if (active) setSettings(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parsePomodoroSettings({
      version: pomodoroVersion,
      ...settings,
    });
    if (!parsed) {
      setStatus(t("时长超出允许范围，未保存"));
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await savePomodoroSettings(parsed);
      await emitTo("island", "pomodoro-changed", {
        version: pomodoroVersion,
        ...parsed,
      });
      setStatus(t("已保存"));
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <section className="settings-card settings-pomodoro-hero">
        <div className="settings-pomodoro-art">
          <img src={pomodoroClock} alt="" draggable={false} />
        </div>
        <div className="settings-pomodoro-copy">
          <span className="settings-eyebrow">{t("今日专注")}</span>
          <div className="settings-pomodoro-value">
            <strong>{doneToday}</strong>
            <span>{t("个番茄")}</span>
          </div>
          <div className="settings-pomodoro-meta">
            <span>{focusText}</span>
            <i aria-hidden="true" />
            <span>
              {t("近 30 天")} {totalPomodoros} {t("个番茄")}
            </span>
          </div>
        </div>
        <div className="settings-pomodoro-chips">
          <span>
            {t("专注")} · {settings.focusMinutes} {t("分钟")}
          </span>
          <span>
            {t("短休")} · {settings.shortBreakMinutes} {t("分钟")}
          </span>
          <span>
            {t("长休")} · {settings.longBreakMinutes} {t("分钟")}
          </span>
        </div>
      </section>

      <div className="settings-columns is-stretch">
        <section className="settings-card">
          <div className="card-head">
            <div>
              <h2>{t("番茄钟")}</h2>
              <p>
                {t(
                  "专注自然结束后记为一个番茄；休息时长由已完成轮数决定，进度会在重启后保留。",
                )}
              </p>
            </div>
          </div>
          <form className="form" onSubmit={(event) => void save(event)}>
            <div className="field-row">
              {fields.slice(0, 2).map((field) => (
                <label className="field" key={field.key}>
                  <span>{t(field.label)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    disabled={busy || !desktop}
                    value={settings[field.key]}
                    onChange={(event) => {
                      setStatus("");
                      setSettings((current) => ({
                        ...current,
                        [field.key]: Number(
                          event.target.value.replace(/\D/g, ""),
                        ),
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="field-row">
              {fields.slice(2).map((field) => (
                <label className="field" key={field.key}>
                  <span>{t(field.label)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    disabled={busy || !desktop}
                    value={settings[field.key]}
                    onChange={(event) => {
                      setStatus("");
                      setSettings((current) => ({
                        ...current,
                        [field.key]: Number(
                          event.target.value.replace(/\D/g, ""),
                        ),
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="form-note">
              {t(
                "只有自然结束的专注会累计番茄；手动取消不计入。达到长休间隔后，下一次休息自动使用长休时长。",
              )}
            </p>
            <div className="form-footer">
              <span role="status">{status}</span>
              <button className="btn btn-primary" disabled={busy || !desktop}>
                {busy ? t("保存中…") : t("保存")}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card">
          <div className="card-head">
            <div>
              <h2>{t("专注统计")}</h2>
              <p>{t("近 30 天的完成情况，今天高亮显示。")}</p>
            </div>
          </div>
          <DailyChart
            values={values}
            color="#ff7d6e"
            format={(value) => `${value} ${t("个番茄")}`}
            label={t("近 30 天番茄")}
          />
        </section>
      </div>
    </div>
  );
}
