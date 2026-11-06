import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Typography,
} from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { dailyValues, recentDays, statForDay } from "../../domain/dailyStats";
import {
  defaultPomodoroSettings,
  parsePomodoroSettings,
  pomodoroVersion,
  type PomodoroSettings as PomodoroSettingsValue,
} from "../../domain/pomodoro";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
} from "../../services/pomodoroRepository";
import { useDailyStats } from "../stats/useDailyStats";
import { DailyChart } from "../stats/DailyChart";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";
import pomodoroClock from "../../assets/pomodoro-clock.png";

const fields: { key: keyof PomodoroSettingsValue; label: string }[] = [
  { key: "focusMinutes", label: "专注时长（分钟）" },
  { key: "shortBreakMinutes", label: "短休息（分钟）" },
  { key: "longBreakMinutes", label: "长休息（分钟）" },
  { key: "longBreakEvery", label: "每几轮长休一次" },
];

export function PomodoroSettings() {
  const { message } = App.useApp();
  const desktop = isTauri();
  const [settings, setSettings] = useState<PomodoroSettingsValue>(
    defaultPomodoroSettings,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { stats, today: todayDay } = useDailyStats(30);
  const today = statForDay(stats, todayDay);
  const doneToday = today?.pomodoros ?? 0;
  const focusMinutes = Math.round((today?.focusSeconds ?? 0) / 60);
  const totalPomodoros = stats.reduce((sum, stat) => sum + stat.pomodoros, 0);
  const activeDays = stats.filter((stat) => stat.pomodoros > 0).length;
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

  async function save() {
    const parsed = parsePomodoroSettings({
      version: pomodoroVersion,
      ...settings,
    });
    if (!parsed) {
      message.error(t("时长超出允许范围，未保存"));
      return;
    }
    setBusy(true);
    try {
      await savePomodoroSettings(parsed);
      await emitTo("island", "pomodoro-changed", {
        version: pomodoroVersion,
        ...parsed,
      });
      setSettingsOpen(false);
      message.success(t("已保存"));
    } catch (error) {
      message.error(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="antd-stack">
      <Card className="antd-plain-card">
        <Button
          className="antd-hero-settings"
          type="text"
          icon={<SettingOutlined />}
          aria-label={t("番茄钟设置")}
          title={t("番茄钟设置")}
          onClick={() => setSettingsOpen(true)}
        />
        <div className="settings-pomodoro-hero">
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
        </div>
      </Card>

      <Section
        title={t("专注统计")}
        description={t("近 30 天的完成情况，今天高亮显示。")}
      >
        <div className="settings-stats-strip">
          <div>
            <span>{t("近 30 天")}</span>
            <strong>
              {totalPomodoros} {t("个番茄")}
            </strong>
          </div>
          <div>
            <span>{t("今日")}</span>
            <strong>{doneToday}</strong>
          </div>
          <div>
            <span>{t("有记录的天数")}</span>
            <strong>
              {activeDays} {t("天")}
            </strong>
          </div>
        </div>
        <DailyChart
          values={values}
          color="#ff7d6e"
          format={(value) => `${value} ${t("个番茄")}`}
          label={t("近 30 天番茄")}
        />
      </Section>

      <Modal
        open={settingsOpen}
        title={t("番茄钟设置")}
        okText={t("保存")}
        cancelText={t("取消")}
        confirmLoading={busy}
        width={520}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => void save()}
        destroyOnHidden
      >
        <Form layout="vertical" requiredMark={false}>
          <Row gutter={12}>
            {fields.map((field) => (
              <Col span={12} key={field.key}>
                <Form.Item label={t(field.label)}>
                  <Input
                    inputMode="numeric"
                    maxLength={3}
                    disabled={!desktop}
                    value={settings[field.key]}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        [field.key]: Number(
                          event.target.value.replace(/\D/g, ""),
                        ),
                      }))
                    }
                  />
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              "专注自然结束后记为一个番茄；休息时长由已完成轮数决定，进度会在重启后保留。",
            )}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
