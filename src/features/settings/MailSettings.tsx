import { SettingsCard } from "./SettingsCard";
import { useEffect, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Mail, Trash2 } from "lucide-react";
import type { MailAccount } from "../mail/types";
import { Select } from "./Select";
import { t } from "../../services/i18n";

const providers = [
  { id: "163", name: "网易 163", host: "imap.163.com" },
  { id: "126", name: "网易 126", host: "imap.126.com" },
  { id: "qq", name: "QQ 邮箱", host: "imap.qq.com" },
  { id: "gmail", name: "Gmail", host: "imap.gmail.com" },
  { id: "custom", name: "其他 IMAP 邮箱", host: "" },
];

export function MailSettings() {
  const desktop = isTauri();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [monitorStatus, setMonitorStatus] = useState<Record<string, string>>(
    {},
  );
  const [provider, setProvider] = useState("163");
  const [host, setHost] = useState("imap.163.com");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [port, setPort] = useState("993");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    try {
      setAccounts(await invoke<MailAccount[]>("list_mail_accounts"));
    } catch {
      setMessage(t("无法读取邮箱账户，请检查数据目录。"));
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
        if (active) setMessage(t("无法读取邮箱账户，请检查数据目录。"));
      });
    return () => {
      active = false;
    };
  }, [desktop]);
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
  async function add(event: FormEvent) {
    event.preventDefault();
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
      setMessage(t("请填写有效的邮箱、服务器、端口和授权码。"));
      return;
    }
    setBusy(true);
    setMessage(t("正在连接邮箱并验证授权码…"));
    try {
      await invoke("add_mail_account", {
        input: {
          email: email.trim(),
          host: host.trim(),
          port: parsedPort,
          secret,
        },
      });
      setSecret("");
      setEmail("");
      await refresh();
      await signalChange();
      setMessage(t("邮箱已添加，将提醒之后收到的新邮件。"));
    } catch (error) {
      setMessage(`${t("添加失败：")}${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  async function remove(account: MailAccount) {
    if (
      !window.confirm(
        `${t("移除 ")}${account.email}${t("？已保存的授权码也会删除。")}`,
      )
    )
      return;
    setBusy(true);
    try {
      await invoke("remove_mail_account", { id: account.id });
      await refresh();
      await signalChange();
      setMessage(t("邮箱已移除。"));
    } catch (error) {
      setMessage(`${t("移除失败：")}${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-stack">
      <div className="settings-columns">
        <SettingsCard>
          <div className="card-head">
            <h2>{t("已添加的邮箱")}</h2>
            <span className="card-note">
              {accounts.length ? `${accounts.length} ${t("个")}` : t("未添加")}
            </span>
          </div>
          <p className="card-desc">
            {t("约每 8 秒检查一次收件箱，不改变邮件已读状态。")}
          </p>
          {accounts.length ? (
            <div className="settings-list">
              {accounts.map((account) => (
                <div className="settings-list-row" key={account.id}>
                  <span className="settings-list-icon" aria-hidden="true">
                    <Mail size={15} />
                  </span>
                  <div className="settings-list-copy">
                    <strong>{account.email}</strong>
                    <small>
                      {account.host}:{account.port} ·{" "}
                      {monitorStatus[account.id] || t("等待首次检查")}
                    </small>
                  </div>
                  <button
                    className="icon-button danger"
                    disabled={busy}
                    onClick={() => void remove(account)}
                    aria-label={`${t("移除 ")}${account.email}`}
                    title={t("移除邮箱")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {desktop
                ? t("还没有邮箱账户。添加后会在这里显示检查状态。")
                : t("请在桌面应用中添加邮箱。")}
            </p>
          )}
        </SettingsCard>

        <SettingsCard>
          <div className="card-head">
            <h2>{t("添加邮箱")}</h2>
          </div>
          <form onSubmit={(event) => void add(event)} className="form">
            <div className="field">
              <span>{t("邮箱服务商")}</span>
              <Select
                ariaLabel={t("邮箱服务商")}
                value={provider}
                disabled={busy || !desktop}
                options={providers.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(next) => {
                  const selected = providers.find((item) => item.id === next)!;
                  setProvider(selected.id);
                  setHost(selected.host);
                  setPort("993");
                }}
              />
            </div>
            <label className="field">
              <span>{t("邮箱地址")}</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                disabled={busy || !desktop}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>{t("IMAP 服务器")}</span>
                <input
                  required
                  value={host}
                  disabled={busy || !desktop || provider !== "custom"}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="imap.example.com"
                />
              </label>
              <label className="field field-port">
                <span>{t("SSL 端口")}</span>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  value={port}
                  disabled={busy || !desktop}
                  onChange={(event) =>
                    setPort(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>{t("邮箱授权码")}</span>
              <input
                type="password"
                required
                autoComplete="off"
                value={secret}
                disabled={busy || !desktop}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={t("邮箱服务商生成的授权码")}
              />
            </label>
            <p className="form-note">
              {t(
                "需在服务商开启 IMAP 并使用授权码；仅支持 SSL/TLS，需要 OAuth 的账户暂不支持。授权码存放在 Windows 凭据管理器。",
              )}
            </p>
            <div className="form-footer">
              <span role="status">{message}</span>
              <button className="btn btn-primary" disabled={busy || !desktop}>
                {busy ? t("处理中…") : t("连接并添加")}
              </button>
            </div>
          </form>
        </SettingsCard>
      </div>

      <SettingsCard>
        <div className="card-head">
          <h2>{t("灵动岛上的邮件提醒")}</h2>
        </div>
        <dl className="about-rows">
          <div>
            <dt>{t("提醒方式")}</dt>
            <dd>
              {t(
                "收到新邮件时，胶囊直接显示验证码或主题；展开面板可一键复制。",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("多账户")}</dt>
            <dd>{t("可添加多个邮箱，最近一封新邮件优先显示。")}</dd>
          </div>
          <div>
            <dt>{t("隐私保护")}</dt>
            <dd>{t("不保存邮件正文，提醒只在内存保留约 5 分钟。")}</dd>
          </div>
        </dl>
      </SettingsCard>
    </div>
  );
}
