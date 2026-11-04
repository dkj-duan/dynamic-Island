import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import { useAiQuota } from "../ai/useAiQuota";
import { ProviderIcon } from "../ai/ProviderIcon";
import { Select } from "./Select";

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
    <div className="settings-columns">
      <section className="settings-card">
        <div className="card-head">
          <h2>账户与额度</h2>
          <button
            className="btn btn-quiet"
            disabled={!desktop || busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={13} />
            刷新
          </button>
        </div>
        <p className="card-desc">
          每两分钟自动刷新一次，常驻账户的额度会显示在灵动岛上。
        </p>
        {!desktop && <p className="empty-state">请在桌面应用中配置账户。</p>}
        {desktop && accounts.length === 0 && (
          <p className="empty-state">尚未添加账户。</p>
        )}
        {error && (
          <p className="form-note is-error" role="alert">
            {error}
          </p>
        )}
        {accounts.length > 0 && (
          <div className="settings-list">
            {accounts.map((account) => (
              <div className="settings-list-row" key={account.id}>
                <ProviderIcon provider={account.provider} size="normal" />
                <div className="settings-list-copy">
                  <strong>
                    {account.name}
                    {account.pinned && <span className="tag">常驻</span>}
                  </strong>
                  <small>
                    {providers.find((p) => p.id === account.provider)?.label ??
                      account.provider}
                  </small>
                  <span className="settings-list-value">
                    {results[account.id]?.quota?.items
                      .map((item) => `${item.label} ${item.value}`)
                      .join(" · ") ??
                      results[account.id]?.error ??
                      "正在查询…"}
                  </span>
                </div>
                <div className="settings-list-actions">
                  <button
                    className="btn btn-quiet"
                    disabled={busy || account.pinned}
                    onClick={() => void action("pin_ai_account", account.id)}
                  >
                    {account.pinned ? "已常驻" : "常驻"}
                  </button>
                  <button
                    className="btn btn-quiet"
                    disabled={busy}
                    onClick={() => void action("remove_ai_account", account.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card">
        <div className="card-head">
          <h2>添加账户</h2>
        </div>
        <form className="form" onSubmit={(event) => void add(event)}>
          <div className="field">
            <span>服务</span>
            <Select
              ariaLabel="AI 服务"
              value={provider}
              disabled={!desktop || busy}
              options={providers.map((p) => ({ value: p.id, label: p.label }))}
              onChange={(next) => {
                setProvider(next);
                setSecret("");
              }}
            />
          </div>
          <label className="field">
            <span>账户名称</span>
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
            <label className="field">
              <span>本地服务端口</span>
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
            <label className="field">
              <span>
                {provider === "kimi-local" ? "本地访问令牌" : "查询密钥"}
              </span>
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
          <p className="form-note">
            {providers.find((p) => p.id === provider)?.hint}
            {provider !== "codex-local" &&
              " 密钥由当前 Windows 用户加密后存入数据库，换电脑或 Windows 用户后需重新添加。"}
          </p>
          <div className="form-footer">
            <span role="status">{message}</span>
            <button
              className="btn btn-primary"
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
    </div>
  );
}
