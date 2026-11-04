import { useEffect, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Mail, Trash2 } from "lucide-react";
import type { MailAccount } from "../mail/types";

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
      setMessage("无法读取邮箱账户，请检查数据目录。");
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
        if (active) setMessage("无法读取邮箱账户，请检查数据目录。");
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
      setMessage("请填写有效的邮箱、服务器、端口和授权码。");
      return;
    }
    setBusy(true);
    setMessage("正在连接邮箱并验证授权码…");
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
      setMessage("邮箱已添加，将提醒之后收到的新邮件。");
    } catch (error) {
      setMessage(`添加失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  async function remove(account: MailAccount) {
    if (!window.confirm(`移除 ${account.email}？已保存的授权码也会删除。`))
      return;
    setBusy(true);
    try {
      await invoke("remove_mail_account", { id: account.id });
      await refresh();
      await signalChange();
      setMessage("邮箱已移除。");
    } catch (error) {
      setMessage(`移除失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-card mail-settings">
        <div className="settings-card-heading">
          <span className="behavior-icon">
            <Mail size={17} />
          </span>
          <div>
            <span className="card-kicker">MAIL ACCOUNTS</span>
            <h2>已添加的邮箱</h2>
          </div>
        </div>
        <p>
          约每 30 秒检查收件箱，不改变邮件已读状态；识别到验证码时可点击复制。
        </p>
        {accounts.length ? (
          <div className="mail-account-list">
            {accounts.map((account) => (
              <div className="mail-account" key={account.id}>
                <div>
                  <strong>{account.email}</strong>
                  <small>
                    {account.host}:{account.port} ·{" "}
                    {monitorStatus[account.id] || "等待首次检查"}
                  </small>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void remove(account)}
                  aria-label={`移除 ${account.email}`}
                  title="移除邮箱"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mail-empty">
            {desktop ? "尚未添加邮箱" : "请在桌面应用中添加邮箱"}
          </p>
        )}
      </section>
      <section className="settings-card mail-settings">
        <div className="settings-card-heading">
          <div>
            <span className="card-kicker">ADD ACCOUNT</span>
            <h2>添加邮箱</h2>
          </div>
        </div>
        <form onSubmit={(event) => void add(event)} className="mail-form">
          <label>
            邮箱服务商
            <select
              value={provider}
              disabled={busy || !desktop}
              onChange={(event) => {
                const selected = providers.find(
                  (item) => item.id === event.target.value,
                )!;
                setProvider(selected.id);
                setHost(selected.host);
                setPort("993");
              }}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            邮箱地址
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
          <div className="mail-server-fields">
            <label>
              IMAP 服务器
              <input
                required
                value={host}
                disabled={busy || !desktop || provider !== "custom"}
                onChange={(event) => setHost(event.target.value)}
                placeholder="imap.example.com"
              />
            </label>
            <label>
              SSL 端口
              <input
                required
                type="number"
                min="1"
                max="65535"
                value={port}
                disabled={busy || !desktop}
                onChange={(event) => setPort(event.target.value)}
              />
            </label>
          </div>
          <label>
            邮箱授权码
            <input
              type="password"
              required
              autoComplete="off"
              value={secret}
              disabled={busy || !desktop}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="请输入邮箱服务商生成的授权码"
            />
          </label>
          <p>
            请先在邮箱服务商开启 IMAP 并获取授权码。仅支持 SSL/TLS
            与授权码登录；需要 OAuth 的账户暂不支持。授权码存放在 Windows
            凭据管理器中。
          </p>
          <div className="mail-form-footer">
            <span role="status">{message}</span>
            <button type="submit" disabled={busy || !desktop}>
              {busy ? "处理中…" : "连接并添加"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
