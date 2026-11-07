import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { dailyValues, recentDays, statForDay } from "../../domain/dailyStats";
import {
  defaultSedentarySettings,
  parseSedentarySettings,
  sedentaryTone,
  sedentaryToneColors,
  sedentaryVersion,
  sittingMinutes,
  type SedentarySettings as SedentarySettingsValue,
} from "../../domain/sedentary";
import {
  loadSedentaryProgress,
  loadSedentarySettings,
  recordStand,
  resetSedentary,
  saveSedentarySettings,
} from "../../services/sedentaryRepository";
import { useDailyStats } from "../stats/useDailyStats";
import { DailyChart } from "../stats/DailyChart";
import { StandRing } from "../sedentary/StandRing";
import sedentaryChair from "../../assets/island/away-chair.png";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";

const hourOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => {
    const hour = from + index;
    return {
      value: String(hour),
      label: `${String(hour).padStart(2, "0")}:00`,
    };
  });

export function SedentarySettings() {
  const { message } = App.useApp();
  const desktop = isTauri();
  const { stats, today } = useDailyStats(30);
  const [settings, setSettings] = useState<SedentarySettingsValue>(
    defaultSedentarySettings,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standStatus, setStandStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastBreakAt, setLastBreakAt] = useState(() => Date.now());
  // A slow tick keeps the ring honest while the page stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([loadSedentarySettings(), loadSedentaryProgress()]).then(
      ([stored, progress]) => {
        if (!active) return;
        setSettings(stored);
        setLastBreakAt(progress.lastBreakAt);
        setNow(Date.now());
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const todayBreaks = statForDay(stats, today)?.sedentaryBreaks ?? 0;
  const sitting = sittingMinutes(lastBreakAt, now);
  const percent = Math.min(
    100,
    Math.round((sitting / settings.reminderMinutes) * 100),
  );
  const tone = sedentaryTone(lastBreakAt, now, settings.reminderMinutes);
  const toneColor = sedentaryToneColors[tone];
  const values = dailyValues(
    stats,
    recentDays(30),
    (stat) => stat.sedentaryBreaks,
  );
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  const average = Math.round(total / Math.max(1, values.length));
  const reachedDays = values.filter(
    (entry) => entry.value >= settings.goalBreaks,
  ).length;
  const reached = todayBreaks >= settings.goalBreaks;

  async function stand() {
    try {
      setStandStatus("");
      await recordStand();
      const at = Date.now();
      setLastBreakAt(at);
      setNow(at);
      message.success(t("已记录起身"));
    } catch (error) {
      setStandStatus(String(error));
      message.error(String(error));
    }
  }

  async function save() {
    const parsed = parseSedentarySettings({
      version: sedentaryVersion,
      ...settings,
    });
    if (!parsed) {
      message.error(t("久坐设置超出允许范围，未保存"));
      return;
    }
    setBusy(true);
    try {
      await saveSedentarySettings(parsed);
      await emitTo("island", "sedentary-changed", {
        version: sedentaryVersion,
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

  async function resetToday() {
    try {
      await resetSedentary();
      message.success(t("已重置今日起身"));
    } catch (error) {
      message.error(String(error));
    }
  }

  return (
    <div className="antd-stack is-fill">
      <Card className="antd-plain-card">
        <Button
          className="antd-hero-settings"
          type="text"
          icon={<SettingOutlined />}
          aria-label={t("久坐提醒设置")}
          title={t("久坐提醒设置")}
          onClick={() => setSettingsOpen(true)}
        />
        <div className="settings-sedentary-hero">
          <div className="settings-sedentary-ring-wrap">
            <StandRing
              percent={percent}
              tone={tone}
              size="settings"
              title={`${t("已坐")} ${sitting} ${t("分钟")}`}
              art={sedentaryChair}
            />
          </div>
          <div className="settings-sedentary-copy">
            <span className="settings-eyebrow">{t("今日起身")}</span>
            <div className="settings-sedentary-value">
              <strong>{todayBreaks}</strong>
              <span>
                / {settings.goalBreaks} {t("次")}
              </span>
            </div>
            <div className="settings-sedentary-meta">
              <span style={{ color: toneColor }}>
                {t("已坐")} {sitting} {t("分钟")}
              </span>
              <i aria-hidden="true" />
              <span style={reached ? { color: toneColor } : undefined}>
                {reached
                  ? t("今日目标已完成")
                  : `${t("还差")} ${settings.goalBreaks - todayBreaks} ${t("次")}`}
              </span>
            </div>
          </div>
          <div className="settings-sedentary-actions">
            <Button
              type="primary"
              disabled={!desktop}
              onClick={() => void stand()}
            >
              {t("起身一下")}
            </Button>
            {standStatus && (
              <Typography.Text type="warning" className="settings-water-status">
                {standStatus}
              </Typography.Text>
            )}
          </div>
        </div>
      </Card>

      <Section
        className="section-grow"
        title={t("近 30 天起身")}
        description={t("虚线为每日目标，今天高亮显示。")}
      >
        <div className="settings-stats-strip">
          <div>
            <span>{t("30 天总量")}</span>
            <strong>
              {total} {t("次")}
            </strong>
          </div>
          <div>
            <span>{t("日均")}</span>
            <strong>
              {average} {t("次")}
            </strong>
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
          goal={settings.goalBreaks}
          color="#6fd39a"
          format={(value) => `${value} ${t("次")}`}
          label={t("近 30 天起身")}
        />
      </Section>

      <Modal
        open={settingsOpen}
        title={t("久坐提醒设置")}
        okText={t("保存")}
        cancelText={t("取消")}
        confirmLoading={busy}
        width={520}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => void save()}
        destroyOnHidden
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="antd-modal-footer">
            <Popconfirm
              title={t("重置今日起身？")}
              description={t("清零今天的起身次数，统计历史不受影响。")}
              okText={t("确认重置")}
              cancelText={t("取消")}
              okButtonProps={{ danger: true }}
              onConfirm={() => void resetToday()}
            >
              <Button danger type="text">
                {t("重置今日起身")}
              </Button>
            </Popconfirm>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
      >
        <Form layout="vertical" requiredMark={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label={t("每日目标（次）")}>
                <Input
                  inputMode="numeric"
                  maxLength={2}
                  disabled={!desktop}
                  value={settings.goalBreaks}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      goalBreaks: Number(event.target.value.replace(/\D/g, "")),
                    }))
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t("久坐提醒间隔（分钟）")}
                extra={t("连续静坐达到该时长后提醒，起身记录会重新计时。")}
              >
                <Input
                  inputMode="numeric"
                  maxLength={3}
                  disabled={!desktop || !settings.enabled}
                  value={settings.reminderMinutes}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      reminderMinutes: Number(
                        event.target.value.replace(/\D/g, ""),
                      ),
                    }))
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label={t("提醒开始时间")}>
                <Select
                  value={String(settings.activeStart)}
                  disabled={!desktop || !settings.enabled}
                  options={hourOptions(0, 23)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      activeStart: Number(value),
                    }))
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t("提醒结束时间")}>
                <Select
                  value={String(settings.activeEnd)}
                  disabled={!desktop || !settings.enabled}
                  options={hourOptions(1, 24)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      activeEnd: Number(value),
                    }))
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <div className="antd-setting-row">
            <div className="antd-setting-copy">
              <div className="antd-setting-title">{t("开启久坐提醒")}</div>
              <span className="antd-setting-desc">
                {t(
                  "提醒只在灵动岛显示，不会弹系统通知；每日目标仅用于统计展示。",
                )}
              </span>
            </div>
            <Switch
              checked={settings.enabled}
              disabled={!desktop}
              onChange={(checked) =>
                setSettings((current) => ({ ...current, enabled: checked }))
              }
            />
          </div>
        </Form>
      </Modal>
    </div>
  );
}
