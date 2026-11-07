import { useEffect, useState } from "react";
import {
  App,
  Button,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { DeleteOutlined, MailOutlined, PlusOutlined } from "@ant-design/icons";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { MailAccount } from "../mail/types";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";

const providers = [
  { id: "163", name: "网易 163", host: "imap.163.com" },
  { id: "126", name: "网易 126", host: "imap.126.com" },
  { id: "qq", name: "QQ 邮箱", host: "imap.qq.com" },
  { id: "gmail", name: "Gmail", host: "imap.gmail.com" },
  { id: "custom", name: "其他 IMAP 邮箱", host: "" },
];

export function MailSettings() {
  const { message } = App.useApp();
  const desktop = isTauri();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [monitorStatus, setMonitorStatus] = useState<Record<string, string>>(
    {},
  );
  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState("163");
  const [host, setHost] = useState("imap.163.com");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [port, setPort] = useState("993");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setAccounts(await invoke<MailAccount[]>("list_mail_accounts"));
    } catch {
      message.error(t("无法读取邮箱账户，请检查数据目录。"));
    }
  }

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<MailAccount[]>("list_mail_accounts")
      .then((value) => {
        if (active) setAccounts(value);
      })
      .catch(() => {
        if (active) message.error(t("无法读取邮箱账户，请检查数据目录。"));
      });
    return () => {
      active = false;
    };
  }, [desktop, message]);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let timer: number | undefined;
    async function poll() {
      try {
        const states = await invoke<Record<string, string>>(
          "get_mail_monitor_status",
        );
        if (active) setMonitorStatus(states);
      } catch {
        /* account configuration remains usable if status is unavailable */
      } finally {
        if (active) timer = window.setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [desktop]);

  async function signalChange() {
    try {
      await emitTo("island", "mail-accounts-changed");
    } catch {
      /* the island also refreshes periodically */
    }
  }

  function openAdd() {
    setProvider("163");
    setHost("imap.163.com");
    setPort("993");
    setEmail("");
    setSecret("");
    setAddOpen(true);
  }

  async function add() {
    if (!desktop || busy) return;
    const parsedPort = Number(port);
    if (
      !email.trim() ||
      !host.trim() ||
      !secret ||
      !Number.isInteger(parsedPort) ||
      parsedPort < 1 ||
      parsedPort > 65535
    ) {
      message.error(t("请填写有效的邮箱、服务器、端口和授权码。"));
      return;
    }
    setBusy(true);
    try {
      await invoke("add_mail_account", {
        input: {
          email: email.trim(),
          host: host.trim(),
          port: parsedPort,
          secret,
        },
      });
      setAddOpen(false);
      setSecret("");
      setEmail("");
      await refresh();
      await signalChange();
      message.success(t("邮箱已添加，将提醒之后收到的新邮件。"));
    } catch (error) {
      message.error(`${t("添加失败：")}${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(account: MailAccount) {
    if (busy) return;
    setBusy(true);
    try {
      await invoke("remove_mail_account", { id: account.id });
      await refresh();
      await signalChange();
      message.success(t("邮箱已移除。"));
    } catch (error) {
      message.error(`${t("移除失败：")}${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="antd-stack">
      <Section
        title={t("已添加的邮箱")}
        description={t("约每 8 秒检查一次收件箱，不改变邮件已读状态。")}
        extra={
          <Space>
            <span className="section-inline-note">
              {accounts.length ? `${accounts.length} ${t("个")}` : t("未添加")}
            </span>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              disabled={!desktop || busy}
              onClick={openAdd}
              title={t("添加邮箱")}
              aria-label={t("添加邮箱")}
            />
          </Space>
        }
      >
        {accounts.length ? (
          <List
            dataSource={accounts}
            renderItem={(account) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="delete"
                    title={t("移除邮箱？")}
                    description={`${account.email} ${t("的授权码也会从凭据管理器删除。")}`}
                    okText={t("删除")}
                    cancelText={t("取消")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void remove(account)}
                  >
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      disabled={busy}
                      aria-label={`${t("移除 ")}${account.email}`}
                      title={`${t("删除")} ${account.email}`}
                    />
                  </Popconfirm>,
                ]}
              >
                <div className="antd-list-row">
                  <span className="antd-list-icon">
                    <MailOutlined />
                  </span>
                  <div className="antd-list-copy">
                    <strong>{account.email}</strong>
                    <small>
                      {account.host}:{account.port} ·{" "}
                      {monitorStatus[account.id] || t("等待首次检查")}
                    </small>
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              desktop ? t("还没有邮箱账户") : t("请在桌面应用中添加邮箱")
            }
          >
            {desktop && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                {t("添加邮箱")}
              </Button>
            )}
          </Empty>
        )}
      </Section>

      <Modal
        open={addOpen}
        title={t("添加邮箱")}
        okText={t("连接并添加")}
        cancelText={t("取消")}
        confirmLoading={busy}
        width={560}
        onCancel={() => setAddOpen(false)}
        onOk={() => void add()}
        destroyOnHidden
      >
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label={t("邮箱服务商")}>
            <Select
              value={provider}
              onChange={(next) => {
                const selected = providers.find((item) => item.id === next)!;
                setProvider(selected.id);
                setHost(selected.host);
                setPort("993");
              }}
              options={providers.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Form.Item>
          <Form.Item label={t("邮箱地址")}>
            <Input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item label={t("IMAP 服务器")}>
                <Input
                  value={host}
                  disabled={provider !== "custom"}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="imap.example.com"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t("SSL 端口")}>
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  value={port}
                  onChange={(event) =>
                    setPort(event.target.value.replace(/\D/g, ""))
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t("邮箱授权码")}>
            <Input.Password
              value={secret}
              autoComplete="off"
              onChange={(event) => setSecret(event.target.value)}
              placeholder={t("邮箱服务商生成的授权码")}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              "需在服务商开启 IMAP 并使用授权码；授权码存放在 Windows 凭据管理器，换 Windows 用户后需要重新添加。",
            )}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
