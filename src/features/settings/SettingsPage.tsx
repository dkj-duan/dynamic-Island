import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AppWindow,
  CircleHelp,
  MousePointer2,
  Palette,
  Bell,
  Database,
  Mail,
  Bot,
  Check,
} from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
import { StatusSettings } from "./StatusSettings";
import { StorageSettings } from "./StorageSettings";
import { MailSettings } from "./MailSettings";
import { AiSettings } from "./AiSettings";

type Page =
  "appearance" | "behavior" | "status" | "mail" | "ai" | "storage" | "about";

const pageMeta: Record<Page, { title: string; description: string }> = {
  appearance: {
    title: "外观",
    description: "主题、胶囊尺寸与桌面预览，改动会立即同步到灵动岛。",
  },
  behavior: {
    title: "交互",
    description: "选择展开方式、自动收起时长，以及灵动岛停靠的位置。",
  },
  status: {
    title: "状态提醒",
    description: "读取音量、亮度、电源与蓝牙的变化，在灵动岛上短暂提示。",
  },
  mail: {
    title: "邮箱提醒",
    description: "通过 IMAP 检查新邮件，识别到验证码后可在灵动岛复制。",
  },
  ai: {
    title: "AI 额度",
    description: "查询账户余额与订阅周期额度，可选择一个常驻灵动岛。",
  },
  storage: {
    title: "数据与存储",
    description: "设置、邮箱账户与 AI 密钥的存放位置和迁移方式。",
  },
  about: {
    title: "关于",
    description: "版本与项目信息。",
  },
};

interface Props {
  appearance: AppearanceSettings;
  onAppearanceChange: (value: AppearanceSettings) => void;
  preview: ReactNode;
  status: string;
  canEdit: boolean;
  canSwitchStorage: boolean;
  onStorageChanged: () => Promise<void>;
}

const navItems: { id: Page; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "behavior", label: "交互", icon: MousePointer2 },
  { id: "status", label: "状态", icon: Bell },
  { id: "mail", label: "邮箱", icon: Mail },
  { id: "ai", label: "AI 额度", icon: Bot },
  { id: "storage", label: "存储", icon: Database },
  { id: "about", label: "关于", icon: CircleHelp },
];

const themeOptions = [
  {
    value: "system" as const,
    label: "跟随系统",
    hint: "随 Windows 深浅色切换",
  },
  { value: "light" as const, label: "浅色", hint: "明亮低对比" },
  { value: "dark" as const, label: "深色", hint: "夜间使用" },
];

export function SettingsPage({
  appearance,
  onAppearanceChange,
  preview,
  status,
  canEdit,
  canSwitchStorage,
  onStorageChanged,
}: Props) {
  const [page, setPage] = useState<Page>("appearance");
  const [positionReset, setPositionReset] = useState(false);
  const meta = pageMeta[page];
  const hasError = status.includes("失败");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.settingsTheme =
        appearance.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appearance.theme);
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      delete document.documentElement.dataset.settingsTheme;
    };
  }, [appearance.theme]);

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <span className="settings-brand-mark" aria-hidden="true">
            <AppWindow size={15} />
          </span>
          <span className="settings-brand-text">
            <strong>灵动岛</strong>
            <small>设置</small>
          </span>
        </div>

        <nav className="settings-nav" aria-label="设置分区">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              className={`settings-nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div
          className={`settings-status ${hasError ? "is-error" : ""}`}
          role="status"
        >
          <i aria-hidden="true" />
          <span>{status}</span>
        </div>
      </aside>

      <main className="settings-main">
        <div className="settings-content">
          <header className="settings-header">
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </header>

          <div
            key={page}
            className="settings-page"
            data-page={page}
            role="tabpanel"
            aria-label={meta.title}
          >
            {page === "appearance" && (
              <div className="settings-stack">
                <section className="settings-card preview-card">
                  <div className="card-head">
                    <h2>桌面预览</h2>
                    <span className="card-note">实时同步</span>
                  </div>
                  <div className="preview-stage">{preview}</div>
                  <div className="preview-caption">
                    <span>屏幕顶部 · 居中</span>
                    <span>随主题与缩放即时更新</span>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="card-head">
                    <h2>界面主题</h2>
                    <span className="card-note">仅影响设置窗口</span>
                  </div>
                  <div
                    className="theme-options"
                    role="radiogroup"
                    aria-label="界面主题"
                  >
                    {themeOptions.map((option) => {
                      const active = appearance.theme === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!canEdit}
                          className={`theme-option ${active ? "active" : ""}`}
                          onClick={() =>
                            onAppearanceChange({
                              ...appearance,
                              theme: option.value,
                            })
                          }
                        >
                          <span
                            className={`theme-option-preview theme-option-preview-${option.value}`}
                            aria-hidden="true"
                          />
                          <span className="theme-option-copy">
                            <strong>{option.label}</strong>
                            <small>{option.hint}</small>
                          </span>
                          <span
                            className="theme-option-check"
                            aria-hidden="true"
                          >
                            {active && <Check size={13} strokeWidth={2.6} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="settings-card">
                  <div className="card-head">
                    <h2>胶囊</h2>
                  </div>
                  <label className="setting-row">
                    <span className="setting-row-copy">
                      <strong>显示尺寸</strong>
                      <small>收起状态下灵动岛的宽度</small>
                    </span>
                    <span className="range-control">
                      <input
                        aria-label="胶囊大小"
                        type="range"
                        disabled={!canEdit}
                        min="0.8"
                        max="1.2"
                        step="0.05"
                        value={appearance.scale}
                        style={
                          {
                            "--range-progress": `${((appearance.scale - 0.8) / 0.4) * 100}%`,
                          } as CSSProperties
                        }
                        onChange={(e) =>
                          onAppearanceChange({
                            ...appearance,
                            scale: Number(e.target.value),
                          })
                        }
                      />
                      <output>{Math.round(appearance.scale * 100)}%</output>
                    </span>
                  </label>
                  <label className="setting-row">
                    <span className="setting-row-copy">
                      <strong>显示当前时间</strong>
                      <small>收起时显示数字时钟与日期</small>
                    </span>
                    <input
                      className="toggle-input"
                      type="checkbox"
                      disabled={!canEdit}
                      checked={appearance.showClock}
                      onChange={(e) =>
                        onAppearanceChange({
                          ...appearance,
                          showClock: e.target.checked,
                        })
                      }
                    />
                  </label>
                </section>
              </div>
            )}

            {page === "behavior" && (
              <section className="settings-card">
                <div className="card-head">
                  <div>
                    <h2>展开方式</h2>
                    <p>悬停模式把指针移到胶囊上就会展开，不用点击。</p>
                  </div>
                </div>
                <div className="segmented" role="group" aria-label="展开方式">
                  {[
                    { value: "click", label: "点击展开" },
                    { value: "hover", label: "悬停展开" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={appearance.expandTrigger === option.value}
                      className={
                        appearance.expandTrigger === option.value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        onAppearanceChange({
                          ...appearance,
                          expandTrigger: option.value as "click" | "hover",
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="setting-row">
                  <span className="setting-row-copy">
                    <strong>灵动岛位置</strong>
                    <small>
                      按住胶囊或面板顶栏即可拖动，松手后位置会被记住。
                    </small>
                  </span>
                  <button
                    className="btn btn-quiet"
                    type="button"
                    disabled={!isTauri() || positionReset}
                    onClick={() => {
                      void invoke("reset_island_position")
                        .then(() => {
                          setPositionReset(true);
                          window.setTimeout(
                            () => setPositionReset(false),
                            1600,
                          );
                        })
                        .catch(() => undefined);
                    }}
                  >
                    {positionReset ? "已恢复" : "恢复默认位置"}
                  </button>
                </div>
              </section>
            )}

            {page === "behavior" && (
              <section className="settings-card">
                <div className="card-head">
                  <div>
                    <h2>鼠标离开后自动收起</h2>
                    <p>展开后鼠标移出面板，按设定时间折叠；计时不会中断。</p>
                  </div>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label="自动收起等待时间"
                >
                  {[
                    { value: 0, label: "关闭" },
                    { value: 1, label: "1 秒" },
                    { value: 3, label: "3 秒" },
                    { value: 5, label: "5 秒" },
                    { value: 10, label: "10 秒" },
                    { value: 15, label: "15 秒" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={
                        appearance.autoCollapseSeconds === option.value
                      }
                      className={
                        appearance.autoCollapseSeconds === option.value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        onAppearanceChange({
                          ...appearance,
                          autoCollapseSeconds: option.value,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="card-hint">
                  鼠标移回胶囊会取消收起计时；自动收起不会停止正在进行的倒计时。
                </p>
              </section>
            )}

            {page === "status" && <StatusSettings />}
            {page === "storage" && (
              <StorageSettings
                canSwitch={canSwitchStorage}
                onChanged={onStorageChanged}
              />
            )}
            {page === "mail" && <MailSettings />}
            {page === "ai" && <AiSettings />}
            {page === "about" && (
              <section className="settings-card">
                <div className="about-head">
                  <span className="about-mark" aria-hidden="true">
                    <AppWindow size={20} />
                  </span>
                  <div>
                    <h2>灵动岛</h2>
                    <p>为 Windows 桌面打造的状态提醒与快捷操作入口。</p>
                  </div>
                </div>
                <dl className="about-rows">
                  <div>
                    <dt>版本</dt>
                    <dd>0.1.0</dd>
                  </div>
                  <div>
                    <dt>技术栈</dt>
                    <dd>Tauri 2 · React 19 · Rust</dd>
                  </div>
                  <div>
                    <dt>数据</dt>
                    <dd>本机 SQLite，凭据使用 Windows 用户加密</dd>
                  </div>
                </dl>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
