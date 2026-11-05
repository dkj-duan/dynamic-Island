import { SettingsCard } from "./SettingsCard";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { dailyValues, recentDays, statForDay } from "../../domain/dailyStats";
import {
  defaultWaterSettings,
  parseWaterSettings,
  waterCups,
  waterPercent,
  waterTone,
  waterToneColors,
  waterVersion,
  type WaterSettings as WaterSettingsValue,
} from "../../domain/water";
import {
  addWater,
  loadWaterSettings,
  resetWater,
  saveWaterSettings,
} from "../../services/waterRepository";
import { useDailyStats } from "../stats/useDailyStats";
import { DailyChart } from "../stats/DailyChart";
import { WaterGlass } from "../water/WaterGlass";
import { Select } from "./Select";
import { t } from "../../services/i18n";
import waterDrop from "../../assets/water-drop.webp";

const hourOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => {
    const hour = from + index;
    return {
      value: String(hour),
      label: `${String(hour).padStart(2, "0")}:00`,
    };
  });

export function WaterSettings() {
  const desktop = isTauri();
  const { stats, today } = useDailyStats(30);
  const [settings, setSettings] =
    useState<WaterSettingsValue>(defaultWaterSettings);
  const [customMl, setCustomMl] = useState("300");
  const [customOpen, setCustomOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [drinkStatus, setDrinkStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  useEffect(() => {
    let active = true;
    void loadWaterSettings().then((stored) => {
      if (active) setSettings(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const todayMl = statForDay(stats, today)?.waterMl ?? 0;
  const percent = waterPercent(todayMl, settings.goalMl);
  const waterToneValue = waterTone(todayMl, settings.goalMl);
  const waterToneColor = waterToneColors[waterToneValue];
  const cups = waterCups(todayMl, settings.cupMl);
  const values = dailyValues(stats, recentDays(30), (stat) => stat.waterMl);
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  const average = Math.round(total / Math.max(1, values.length));
  const reachedDays = values.filter(
    (entry) => entry.value >= settings.goalMl,
  ).length;
  const reached = todayMl >= settings.goalMl;

  async function drink(amount: number) {
    try {
      setDrinkStatus("");
      await addWater(amount);
      setAdded((count) => count + 1);
    } catch (error) {
      setDrinkStatus(String(error));
    }
  }

  async function resetToday() {
    try {
      setResetStatus("");
      await resetWater();
      setConfirmReset(false);
      setResetStatus(t("已重置今日饮水"));
    } catch (error) {
      setResetStatus(String(error));
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseWaterSettings({
      version: waterVersion,
      ...settings,
    });
    if (!parsed) {
      setStatus(t("喝水设置超出允许范围，未保存"));
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await saveWaterSettings(parsed);
      await emitTo("island", "water-changed", {
        version: waterVersion,
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
      <SettingsCard className="settings-water-hero">
        <div className="settings-water-glass-wrap">
          <WaterGlass
            percent={percent}
            tone={waterToneValue}
            size="settings"
            splashKey={added}
          />
          <img
            className="settings-water-drop"
            src={waterDrop}
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="settings-water-copy">
          <span className="settings-eyebrow">{t("今日饮水")}</span>
          <div className="settings-water-value">
            <strong>{todayMl}</strong>
            <span>/ {settings.goalMl} ml</span>
          </div>
          <div
            className={`settings-water-progress tone-${waterToneValue}`}
            aria-hidden="true"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="settings-water-meta">
            <span style={{ color: waterToneColor }}>{percent}%</span>
            <i aria-hidden="true" />
            <span>
              {cups} {t("杯")}
            </span>
            <i aria-hidden="true" />
            <span style={reached ? { color: waterToneColor } : undefined}>
              {reached
                ? t("今日目标已完成")
                : `${t("还差")} ${settings.goalMl - todayMl} ml`}
            </span>
          </div>
        </div>
        <div className="settings-water-actions">
          <button
            className="btn btn-primary settings-water-drink"
            disabled={!desktop}
            onClick={() => void drink(settings.cupMl)}
          >
            <img
              className="water-drop-btn"
              src={waterDrop}
              alt=""
              aria-hidden="true"
            />
            {t("喝一杯")} · {settings.cupMl} ml
          </button>
          <button
            className="btn btn-quiet"
            disabled={!desktop}
            onClick={() => setCustomOpen((open) => !open)}
          >
            {t("自定义毫升")}
          </button>
          {customOpen && (
            <form
              className="settings-water-custom"
              onSubmit={(event) => {
                event.preventDefault();
                const amount = Number(customMl);
                if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
                  setDrinkStatus(t("请输入 1–5000 毫升"));
                  return;
                }
                void drink(amount);
                setCustomOpen(false);
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="300"
                aria-label={t("自定义毫升")}
                value={customMl}
                onChange={(event) =>
                  setCustomMl(event.target.value.replace(/\D/g, ""))
                }
              />
              <span>ml</span>
              <button className="btn btn-primary" disabled={!desktop}>
                {t("添加")}
              </button>
            </form>
          )}
          {drinkStatus && (
            <span className="settings-water-status" role="status">
              {drinkStatus}
            </span>
          )}
        </div>
      </SettingsCard>

      <div className="settings-columns is-stretch">
        <SettingsCard>
          <div className="card-head">
            <div>
              <h2>{t("目标与提醒")}</h2>
              <p>{t("提醒只在灵动岛显示，不会弹系统通知。")}</p>
            </div>
          </div>
          <form className="form" onSubmit={(event) => void save(event)}>
            <div className="field-row">
              <label className="field">
                <span>{t("每日目标（毫升）")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  disabled={busy || !desktop}
                  value={settings.goalMl}
                  onChange={(event) => {
                    setStatus("");
                    setSettings((current) => ({
                      ...current,
                      goalMl: Number(event.target.value.replace(/\D/g, "")),
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span>{t("每杯水量（毫升）")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  disabled={busy || !desktop}
                  value={settings.cupMl}
                  onChange={(event) => {
                    setStatus("");
                    setSettings((current) => ({
                      ...current,
                      cupMl: Number(event.target.value.replace(/\D/g, "")),
                    }));
                  }}
                />
              </label>
            </div>
            <label className="field">
              <span>{t("提醒间隔（分钟）")}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={busy || !desktop || !settings.enabled}
                value={settings.reminderMinutes}
                onChange={(event) => {
                  setStatus("");
                  setSettings((current) => ({
                    ...current,
                    reminderMinutes: Number(
                      event.target.value.replace(/\D/g, ""),
                    ),
                  }));
                }}
              />
            </label>
            <div className="field-row">
              <div className="field">
                <span>{t("提醒时段")}</span>
                <Select
                  ariaLabel={t("提醒开始时间")}
                  value={String(settings.activeStart)}
                  disabled={busy || !desktop || !settings.enabled}
                  options={hourOptions(0, 23)}
                  onChange={(value) => {
                    setStatus("");
                    setSettings((current) => ({
                      ...current,
                      activeStart: Number(value),
                    }));
                  }}
                />
              </div>
              <div className="field">
                <span>{t("结束时间")}</span>
                <Select
                  ariaLabel={t("提醒结束时间")}
                  value={String(settings.activeEnd)}
                  disabled={busy || !desktop || !settings.enabled}
                  options={hourOptions(1, 24)}
                  onChange={(value) => {
                    setStatus("");
                    setSettings((current) => ({
                      ...current,
                      activeEnd: Number(value),
                    }));
                  }}
                />
              </div>
            </div>
            <label className="setting-row">
              <span className="setting-row-copy">
                <strong>{t("开启喝水提醒")}</strong>
                <small>{t("到达间隔且今日未达标时在灵动岛提示")}</small>
              </span>
              <input
                className="toggle-input"
                type="checkbox"
                disabled={busy || !desktop}
                checked={settings.enabled}
                onChange={(event) => {
                  setStatus("");
                  setSettings((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }));
                }}
              />
            </label>
            <div className="form-footer">
              <span role="status">{status}</span>
              <button className="btn btn-primary" disabled={busy || !desktop}>
                {busy ? t("保存中…") : t("保存")}
              </button>
            </div>
          </form>
          <div className="settings-danger-row">
            <div>
              <strong>{t("重置今日饮水")}</strong>
              <span>
                {resetStatus || t("清零今天的饮水量和杯数，统计历史不受影响。")}
              </span>
            </div>
            {confirmReset ? (
              <div className="settings-danger-actions">
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setConfirmReset(false);
                    setResetStatus("");
                  }}
                >
                  {t("取消")}
                </button>
                <button
                  className="btn btn-danger"
                  disabled={!desktop}
                  onClick={() => void resetToday()}
                >
                  {t("确认重置")}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-quiet"
                disabled={!desktop}
                onClick={() => {
                  setResetStatus("");
                  setConfirmReset(true);
                }}
              >
                {t("重置今日饮水")}
              </button>
            )}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="card-head">
            <div>
              <h2>{t("近 30 天饮水")}</h2>
              <p>{t("虚线为每日目标，今天高亮显示。")}</p>
            </div>
          </div>
          <div className="settings-stats-strip">
            <div>
              <span>{t("30 天总量")}</span>
              <strong>{(total / 1000).toFixed(1)} L</strong>
            </div>
            <div>
              <span>{t("日均")}</span>
              <strong>{average} ml</strong>
            </div>
            <div>
              <span>{t("达标天数")}</span>
              <strong>
                {reachedDays} {t("天")}
              </strong>
            </div>
          </div>
          <DailyChart
            values={values}
            goal={settings.goalMl}
            color="#5aa7f0"
            format={(value) => `${value} ml`}
            label={t("近 30 天饮水")}
          />
        </SettingsCard>
      </div>
    </div>
  );
}
