import { useEffect, useState } from "react";
import {
  App,
  Button,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Tag,
  Typography,
} from "antd";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HourglassOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import {
  MAX_COUNTDOWNS,
  defaultCountdowns,
  formatDurationSeconds,
  type CountdownItem,
  type CountdownKind,
  type CountdownSettings as CountdownSettingsValue,
} from "../../domain/countdown";
import {
  loadCountdowns,
  saveCountdowns,
} from "../../services/countdownRepository";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";

type Draft = {
  id: string | null;
  label: string;
  kind: CountdownKind;
  targetTime: string;
  minutes: string;
  seconds: string;
};

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour).padStart(2, "0"),
  label: String(hour).padStart(2, "0"),
}));

const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({
  value: String(minute).padStart(2, "0"),
  label: String(minute).padStart(2, "0"),
}));

function draftFor(item?: CountdownItem): Draft {
  if (!item) {
    return {
      id: null,
      label: "",
      kind: "target",
      targetTime: "18:00",
      minutes: "",
      seconds: "00",
    };
  }
  if (item.kind === "target") {
    return {
      id: item.id,
      label: item.label,
      kind: "target",
      targetTime: item.targetTime ?? "18:00",
      minutes: "",
      seconds: "00",
    };
  }
  const seconds = item.durationSeconds ?? 60;
  return {
    id: item.id,
    label: item.label,
    kind: "duration",
    targetTime: "18:00",
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60).padStart(2, "0"),
  };
}

function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CountdownSettings() {
  const { message } = App.useApp();
  const desktop = isTauri();
  const [settings, setSettings] =
    useState<CountdownSettingsValue>(defaultCountdowns);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCountdowns().then((stored) => {
      if (active) setSettings(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  async function persist(next: CountdownSettingsValue) {
    setBusy(true);
    try {
      await saveCountdowns(next);
      setSettings(next);
      if (isTauri()) {
        void emitTo("island", "countdowns-changed").catch(() => {});
      }
      return true;
    } catch (value) {
      message.error(typeof value === "string" ? value : t("保存失败，请重试"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      message.error(t("请输入名称"));
      return;
    }
    let item: CountdownItem;
    const id = draft.id ?? newId();
    if (draft.kind === "target") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.targetTime)) {
        message.error(t("请输入有效时间，例如 18:00"));
        return;
      }
      item = {
        id,
        label,
        kind: "target",
        targetTime: draft.targetTime,
        durationSeconds: null,
      };
    } else {
      const minutes = Number(draft.minutes || "0");
      const seconds = Number(draft.seconds || "0");
      if (
        !/^\d{0,3}$/.test(draft.minutes) ||
        !/^\d{0,2}$/.test(draft.seconds) ||
        seconds > 59 ||
        (minutes === 0 && seconds === 0)
      ) {
        message.error(t("请输入有效时长（秒数为 0–59）"));
        return;
      }
      item = {
        id,
        label,
        kind: "duration",
        targetTime: null,
        durationSeconds: minutes * 60 + seconds,
      };
    }
    const exists = settings.items.some((entry) => entry.id === id);
    const items = exists
      ? settings.items.map((entry) => (entry.id === id ? item : entry))
      : [...settings.items, item];
    if (items.length > MAX_COUNTDOWNS) {
      message.error(t("最多添加 8 个倒计时"));
      return;
    }
    const saved = await persist({
      ...settings,
      items,
      islandId: settings.islandId ?? (items.length === 1 ? id : null),
    });
    if (saved) {
      setDraft(null);
      message.success(t("已保存"));
    }
  }

  async function remove(item: CountdownItem) {
    if (busy) return;
    const saved = await persist({
      ...settings,
      items: settings.items.filter((entry) => entry.id !== item.id),
      islandId: settings.islandId === item.id ? null : settings.islandId,
    });
    if (saved) message.success(t("已删除"));
  }

  const islandItem = settings.items.find(
    (item) => item.id === settings.islandId,
  );
  const [draftHour = "00", draftMinute = "00"] = (
    draft?.targetTime ?? "00:00"
  ).split(":");

  return (
    <div className="antd-stack">
      <Section
        title={t("倒计时")}
        description={t("空闲胶囊只显示选中的一条。")}
        extra={
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            disabled={
              !desktop || busy || settings.items.length >= MAX_COUNTDOWNS
            }
            onClick={() => setDraft(draftFor())}
            title={t("添加倒计时")}
            aria-label={t("添加倒计时")}
          />
        }
      >
        <div className="antd-setting-row">
          <div className="antd-setting-copy">
            <div className="antd-setting-title">
              {islandItem
                ? `${t("空闲胶囊显示")} ${islandItem.label}`
                : t("空闲胶囊不显示倒计时")}
            </div>
          </div>
          {islandItem && (
            <Button
              disabled={!desktop || busy}
              onClick={() => void persist({ ...settings, islandId: null })}
            >
              {t("取消显示")}
            </Button>
          )}
        </div>
        {settings.items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("还没有倒计时")}
          >
            {desktop && settings.items.length < MAX_COUNTDOWNS && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setDraft(draftFor())}
              >
                {t("添加倒计时")}
              </Button>
            )}
          </Empty>
        ) : (
          <div className="countdown-grid">
            {settings.items.map((item) => {
              const onIsland = islandItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`countdown-card ${onIsland ? "is-island" : ""}`}
                >
                  <div className="countdown-card-head">
                    <span className="antd-list-icon">
                      {item.kind === "target" ? (
                        <ClockCircleOutlined />
                      ) : (
                        <HourglassOutlined />
                      )}
                    </span>
                    <strong className="countdown-card-title">
                      {item.label}
                    </strong>
                    {onIsland && <Tag color="blue">{t("显示在岛上")}</Tag>}
                  </div>
                  <small className="countdown-card-time">
                    {item.kind === "target"
                      ? `${t("目标时间")} ${item.targetTime}`
                      : `${t("时长")} ${formatDurationSeconds(item.durationSeconds ?? 0)}`}
                  </small>
                  <div className="countdown-card-actions">
                    {!onIsland && (
                      <Button
                        type="link"
                        size="small"
                        disabled={!desktop || busy}
                        onClick={() =>
                          void persist({ ...settings, islandId: item.id })
                        }
                      >
                        {t("显示在岛上")}
                      </Button>
                    )}
                    <span className="countdown-card-tools">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        disabled={!desktop || busy}
                        aria-label={`${t("编辑")} ${item.label}`}
                        title={`${t("编辑")} ${item.label}`}
                        onClick={() => setDraft(draftFor(item))}
                      />
                      <Popconfirm
                        title={t("删除倒计时？")}
                        description={`${item.label} ${t("会从列表和空闲胶囊中移除。")}`}
                        okText={t("删除")}
                        cancelText={t("取消")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void remove(item)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={!desktop || busy}
                          aria-label={`${t("删除")} ${item.label}`}
                          title={`${t("删除")} ${item.label}`}
                        />
                      </Popconfirm>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Modal
        open={!!draft}
        title={draft?.id ? t("编辑倒计时") : t("添加倒计时")}
        okText={t("保存")}
        cancelText={t("取消")}
        confirmLoading={busy}
        onCancel={() => setDraft(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        {draft && (
          <Form layout="vertical" requiredMark={false}>
            <Form.Item label={t("名称")}>
              <Input
                value={draft.label}
                maxLength={24}
                placeholder={t("例如：下班、午休")}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
                autoFocus
              />
            </Form.Item>
            <Form.Item label={t("倒计时类型")}>
              <Segmented
                value={draft.kind}
                onChange={(kind) =>
                  setDraft({ ...draft, kind: kind as CountdownKind })
                }
                options={[
                  { value: "target", label: t("目标时间") },
                  { value: "duration", label: t("时长") },
                ]}
              />
            </Form.Item>
            {draft.kind === "target" ? (
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item label={t("小时")}>
                    <Select
                      value={draftHour}
                      options={hourOptions}
                      onChange={(hour) =>
                        setDraft({
                          ...draft,
                          targetTime: `${hour}:${draftMinute}`,
                        })
                      }
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={t("分钟")}>
                    <Select
                      value={draftMinute}
                      options={minuteOptions}
                      onChange={(minute) =>
                        setDraft({
                          ...draft,
                          targetTime: `${draftHour}:${minute}`,
                        })
                      }
                    />
                  </Form.Item>
                </Col>
              </Row>
            ) : (
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item label={t("分钟")}>
                    <Input
                      inputMode="numeric"
                      maxLength={3}
                      value={draft.minutes}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          minutes: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={t("秒")}>
                    <Input
                      inputMode="numeric"
                      maxLength={2}
                      value={draft.seconds}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          seconds: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("目标时间到点提醒，或从开始起倒数的固定时长。")}
            </Typography.Text>
          </Form>
        )}
      </Modal>
    </div>
  );
}
