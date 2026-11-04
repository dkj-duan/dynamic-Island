import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import { useAiQuota } from "../ai/useAiQuota";
import { ProviderIcon } from "../ai/ProviderIcon";

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
  const { accounts, results, error, reload } = useAiQuota();
  const [provider, setProvider] = useState<string>(providers[0].id);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [port, setPort] = useState("58627");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();
  async function changed() {
    try {
      await emitTo("island", "ai-accounts-changed");
    } catch {
      setMessage("已保存；灵动岛将在下次刷新时更新");
    }
    await reload();
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
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
      setSecret("");
      setName("");
      setMessage("账户已保存并开始查询");
      await changed();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function action(command: string, id: string) {
    setBusy(true);
    setMessage("");
    try {
      await invoke(command, { id });
      await changed();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="settings-card ai-settings">
        <div className="status-settings-heading">
          <div>
            <span className="card-kicker">AI QUOTA</span>
            <h2>AI 账户额度</h2>
            <p>
              显示服务商提供的账户余额或订阅额度，每两分钟刷新。常驻账户会显示在灵动岛。
            </p>
          </div>
          <button
            className="status-refresh"
            disabled={!desktop || busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
        {!desktop && <p>请在桌面应用中配置 AI 账户。</p>}
        {desktop && accounts.length === 0 && (
          <p className="ai-empty">尚未添加账户。</p>
        )}
        {error && <p role="alert">{error}</p>}
        {accounts.map((account) => (
          <div className="ai-account" key={account.id}>
            <ProviderIcon provider={account.provider} size="large" />
            <div className="ai-account-copy">
              <strong>{account.name}</strong>
              <small>
                {providers.find((p) => p.id === account.provider)?.label ??
                  account.provider}
              </small>
              <span>
                {results[account.id]?.quota?.items
                  .map((item) => `${item.label} ${item.value}`)
                  .join(" · ") ??
                  results[account.id]?.error ??
                  "正在查询…"}
              </span>
            </div>
            <div className="ai-account-actions">
              <button
                disabled={busy || account.pinned}
                onClick={() => void action("pin_ai_account", account.id)}
              >
                {account.pinned ? "已常驻" : "设为常驻"}
              </button>
              <button
                disabled={busy}
                onClick={() => void action("remove_ai_account", account.id)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="settings-card mail-settings">
        <div className="settings-card-heading">
          <div>
            <span className="card-kicker">ADD ACCOUNT</span>
            <h2>添加 AI 账户</h2>
          </div>
        </div>
        <form className="mail-form" onSubmit={(event) => void add(event)}>
          <label>
            服务
            <select
              value={provider}
              disabled={!desktop || busy}
              onChange={(event) => {
                setProvider(event.target.value);
                setSecret("");
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            账户名称
            <input
              value={name}
              maxLength={40}
              disabled={!desktop || busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：个人账户"
              required
            />
          </label>
          {provider === "kimi-local" && (
            <label>
              本地服务端口
              <input
                type="number"
                min="1"
                max="65535"
                value={port}
                disabled={!desktop || busy}
                onChange={(event) => setPort(event.target.value)}
                required
              />
            </label>
          )}
          {provider !== "codex-local" && (
            <label>
              {provider === "kimi-local" ? "本地访问令牌" : "查询密钥"}
              <input
                type="password"
                value={secret}
                autoComplete="off"
                disabled={!desktop || busy}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="输入该服务的密钥"
                required
              />
            </label>
          )}
          <p>
            {providers.find((p) => p.id === provider)?.hint}{" "}
            {provider !== "codex-local" &&
              "密钥由当前 Windows 用户加密后存入数据库；换电脑或 Windows 用户后需重新添加。"}
          </p>
          <div className="mail-form-footer">
            <span role="status">{message}</span>
            <button
              disabled={
                !desktop ||
                busy ||
                !name.trim() ||
                (provider !== "codex-local" && !secret)
              }
            >
              添加账户
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
