import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
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
import { Section } from "./ui/Section";
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
  const { message } = App.useApp();
  const desktop = isTauri();
  const { stats, today } = useDailyStats(30);
  const [settings, setSettings] =
    useState<WaterSettingsValue>(defaultWaterSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customMl, setCustomMl] = useState("300");
  const [customOpen, setCustomOpen] = useState(false);
  const [drinkStatus, setDrinkStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

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
      message.success(`${t("已记录")} ${amount} ml`);
    } catch (error) {
      setDrinkStatus(String(error));
      message.error(String(error));
    }
  }

  async function save() {
    const parsed = parseWaterSettings({ version: waterVersion, ...settings });
    if (!parsed) {
      message.error(t("喝水设置超出允许范围，未保存"));
      return;
    }
    setBusy(true);
    try {
      await saveWaterSettings(parsed);
      await emitTo("island", "water-changed", {
        version: waterVersion,
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
      await resetWater();
      message.success(t("已重置今日饮水"));
    } catch (error) {
      message.error(String(error));
    }
  }

  const customAmount = Number(customMl);
  const customValid =
    Number.isInteger(customAmount) && customAmount >= 1 && customAmount <= 5000;

  return (
    <div className="antd-stack">
      <Card className="antd-plain-card">
        <Button
          className="antd-hero-settings"
          type="text"
          icon={<SettingOutlined />}
          aria-label={t("饮水设置")}
          title={t("饮水设置")}
          onClick={() => setSettingsOpen(true)}
        />
        <div className="settings-water-hero">
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
            <Button
              type="primary"
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
            </Button>
            <Popover
              trigger="click"
              placement="bottomRight"
              open={customOpen}
              onOpenChange={setCustomOpen}
              title={t("自定义毫升")}
              content={
                <Space.Compact>
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="300"
                    aria-label={t("自定义毫升")}
                    value={customMl}
                    onChange={(event) =>
                      setCustomMl(event.target.value.replace(/\D/g, ""))
                    }
                    onPressEnter={() => {
                      if (!customValid) {
                        setDrinkStatus(t("请输入 1–5000 毫升"));
                        return;
                      }
                      void drink(customAmount);
                      setCustomOpen(false);
                    }}
                    style={{ width: 96 }}
                  />
                  <Button
                    type="primary"
                    disabled={!desktop || !customValid}
                    onClick={() => {
                      void drink(customAmount);
                      setCustomOpen(false);
                    }}
                  >
                    {t("添加")}
                  </Button>
                </Space.Compact>
              }
            >
              <Button disabled={!desktop}>{t("自定义毫升")}</Button>
            </Popover>
            {drinkStatus && (
              <Typography.Text type="warning" className="settings-water-status">
                {drinkStatus}
              </Typography.Text>
            )}
          </div>
        </div>
      </Card>

      <Section
        title={t("近 30 天饮水")}
        description={t("虚线为每日目标，今天高亮显示。")}
      >
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
      </Section>

      <Modal
        open={settingsOpen}
        title={t("饮水设置")}
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
              title={t("重置今日饮水？")}
              description={t("清零今天的饮水量和杯数，统计历史不受影响。")}
              okText={t("确认重置")}
              cancelText={t("取消")}
              okButtonProps={{ danger: true }}
              onConfirm={() => void resetToday()}
            >
              <Button danger type="text">
                {t("重置今日饮水")}
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
              <Form.Item label={t("每日目标（毫升）")}>
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  disabled={!desktop}
                  value={settings.goalMl}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      goalMl: Number(event.target.value.replace(/\D/g, "")),
                    }))
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t("每杯水量（毫升）")}>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  disabled={!desktop}
                  value={settings.cupMl}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      cupMl: Number(event.target.value.replace(/\D/g, "")),
                    }))
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t("提醒间隔（分钟）")}>
            <Input
              inputMode="numeric"
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
              <div className="antd-setting-title">{t("开启喝水提醒")}</div>
              <span className="antd-setting-desc">
                {t("提醒只在灵动岛显示，不会弹系统通知。")}
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
