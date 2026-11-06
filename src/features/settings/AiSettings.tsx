import { useState } from "react";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { useAiQuota, type AiAccount } from "../ai/useAiQuota";
import { ProviderIcon } from "../ai/ProviderIcon";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";

const providers = [
  {
    id: "codex-local",
    label: "Codex（本机登录）",
    hint: "使用已登录的本机 Codex CLI 查询 ChatGPT 额度，不需要复制密钥。",
  },
  {
    id: "kimi-local",
    label: "Kimi Code（本地服务）",
    hint: "先启动并登录 kimi web，再填写本地服务的端口和访问令牌；只连接本机。",
  },
  {
    id: "deepseek",
    label: "DeepSeek API 余额",
    hint: "使用 DeepSeek API 密钥。",
  },
  {
    id: "openrouter",
    label: "OpenRouter 积分",
    hint: "需要 OpenRouter 管理密钥（Management Key），普通推理密钥无法查询账户积分。",
  },
  {
    id: "minimax-cn",
    label: "MiniMax Token Plan（中国）",
    hint: "使用中国区 Token Plan 订阅密钥。",
  },
  {
    id: "minimax-global",
    label: "MiniMax Token Plan（国际）",
    hint: "使用国际区 Token Plan 订阅密钥。",
  },
] as const;

export function AiSettings() {
  const { message } = App.useApp();
  const { accounts, results, error, reload } = useAiQuota();
  const desktop = isTauri();
  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState<string>(providers[0].id);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [port, setPort] = useState("58627");
  const [busy, setBusy] = useState(false);

  async function changed() {
    try {
      await emitTo("island", "ai-accounts-changed");
    } catch {
      /* the island refreshes on its own */
    }
    await reload();
  }

  function openAdd() {
    setProvider(providers[0].id);
    setName("");
    setSecret("");
    setPort("58627");
    setAddOpen(true);
  }

  async function add() {
    if (!desktop || busy) return;
    setBusy(true);
    try {
      await invoke("add_ai_account", {
        provider,
        name: name.trim(),
        secret:
          provider === "codex-local"
            ? "local"
            : provider === "kimi-local"
              ? `${port}:${secret}`
              : secret,
      });
      setAddOpen(false);
      message.success(t("账户已保存并开始查询"));
      await changed();
    } catch (value) {
      message.error(String(value));
    } finally {
      setBusy(false);
    }
  }

  async function pin(account: AiAccount) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke("pin_ai_account", { id: account.id });
      await changed();
    } catch (value) {
      message.error(String(value));
    } finally {
      setBusy(false);
    }
  }

  async function remove(account: AiAccount) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke("remove_ai_account", { id: account.id });
      message.success(t("账户已删除"));
      await changed();
    } catch (value) {
      message.error(String(value));
    } finally {
      setBusy(false);
    }
  }

  const currentHint = providers.find((item) => item.id === provider)?.hint;

  return (
    <div className="antd-stack">
      <Section
        title={t("账户与额度")}
        description={t(
          "每两分钟自动刷新一次，常驻账户的额度会显示在灵动岛上。",
        )}
        extra={
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={!desktop || busy}
              onClick={() => void reload()}
            >
              {t("刷新")}
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              disabled={!desktop || busy}
              onClick={openAdd}
            >
              {t("添加账户")}
            </Button>
          </Space>
        }
      >
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
        {!desktop ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("请在桌面应用中配置账户")}
          />
        ) : accounts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("还没有 AI 账户")}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              {t("添加账户")}
            </Button>
          </Empty>
        ) : (
          <List
            dataSource={accounts}
            renderItem={(account) => (
              <List.Item
                actions={[
                  <Button
                    key="pin"
                    size="small"
                    disabled={busy || account.pinned}
                    onClick={() => void pin(account)}
                  >
                    {account.pinned ? t("已常驻") : t("常驻")}
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title={t("删除账户？")}
                    description={`${account.name} ${t("的密钥会一并删除，之后需要重新添加才能查询。")}`}
                    okText={t("删除账户")}
                    cancelText={t("取消")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void remove(account)}
                  >
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      disabled={busy}
                      aria-label={`${t("删除")} ${account.name}`}
                    />
                  </Popconfirm>,
                ]}
              >
                <div className="antd-list-row">
                  <ProviderIcon provider={account.provider} size="normal" />
                  <div className="antd-list-copy">
                    <strong>
                      {account.name}
                      {account.pinned && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>
                          {t("常驻")}
                        </Tag>
                      )}
                    </strong>
                    <small>
                      {providers.find((item) => item.id === account.provider)
                        ? t(
                            providers.find(
                              (item) => item.id === account.provider,
                            )!.label,
                          )
                        : account.provider}
                    </small>
                    <span className="antd-list-value">
                      {results[account.id]?.quota?.items
                        .map((item) => `${item.label} ${item.value}`)
                        .join(" · ") ??
                        results[account.id]?.error ??
                        t("正在查询…")}
                    </span>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Section>

      <Section title={t("灵动岛上的额度显示")}>
        <Typography.Paragraph type="secondary">
          {t("常驻账户以圆环加进度条显示剩余额度，收起时也能看到。")}
          <br />
          {t("每两分钟自动查询一次，可随时手动刷新。")}
        </Typography.Paragraph>
      </Section>

      <Modal
        open={addOpen}
        title={t("添加 AI 账户")}
        okText={t("添加账户")}
        cancelText={t("取消")}
        confirmLoading={busy}
        onCancel={() => setAddOpen(false)}
        onOk={() => void add()}
        okButtonProps={{
          disabled:
            !desktop || !name.trim() || (provider !== "codex-local" && !secret),
        }}
        destroyOnHidden
      >
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label={t("服务")}>
            <Select
              value={provider}
              onChange={(value) => {
                setProvider(value);
                setSecret("");
              }}
              options={providers.map((item) => ({
                value: item.id,
                label: t(item.label),
              }))}
            />
          </Form.Item>
          <Form.Item label={t("账户名称")}>
            <Input
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("例如：个人账户")}
            />
          </Form.Item>
          {provider === "kimi-local" && (
            <Form.Item label={t("本地服务端口")}>
              <Input
                inputMode="numeric"
                maxLength={5}
                value={port}
                onChange={(event) =>
                  setPort(event.target.value.replace(/\D/g, ""))
                }
              />
            </Form.Item>
          )}
          {provider !== "codex-local" && (
            <Form.Item
              label={
                provider === "kimi-local" ? t("本地访问令牌") : t("查询密钥")
              }
            >
              <Input.Password
                value={secret}
                autoComplete="off"
                onChange={(event) => setSecret(event.target.value)}
                placeholder={t("输入该服务的密钥")}
              />
            </Form.Item>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {currentHint ? t(currentHint) : ""}
            {provider !== "codex-local" &&
              t(
                " 密钥由当前 Windows 用户加密后存入数据库，换电脑或 Windows 用户后需重新添加。",
              )}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
