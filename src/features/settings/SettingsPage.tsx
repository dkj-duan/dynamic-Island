import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  AppWindow,
  CircleHelp,
  MousePointer2,
  Palette,
  TimerReset,
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
    description: "主题、胶囊样式与桌面预览，让灵动岛贴合你的桌面。",
  },
  behavior: {
    title: "交互与行为",
    description: "鼠标移出后何时收起，以及面板如何响应。",
  },
  status: {
    title: "状态提醒",
    description: "系统状态读取结果，以及提醒演示。",
  },
  mail: {
    title: "邮箱提醒",
    description: "IMAP 账户、检查频率与验证码识别。",
  },
  ai: {
    title: "AI 额度",
    description: "本机或 API 账户的余额与周期额度。",
  },
  storage: {
    title: "数据与存储",
    description: "数据库位置、迁移与凭据存储说明。",
  },
  about: {
    title: "应用信息",
    description: "版本与桌面工具说明。",
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
    hint: "随 Windows 深浅色",
    swatch: "system",
  },
  {
    value: "light" as const,
    label: "浅色",
    hint: "明亮低对比",
    swatch: "light",
  },
  {
    value: "dark" as const,
    label: "深色",
    hint: "夜间更舒适",
    swatch: "dark",
  },
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
      <header className="settings-topbar">
        <div className="settings-brand">
          <span className="settings-brand-mark" aria-hidden="true">
            <AppWindow size={17} />
          </span>
          <span className="settings-brand-text">
            <strong>灵动岛</strong>
            <small>设置</small>
          </span>
        </div>

        <nav className="settings-tabs" aria-label="设置分区">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`settings-tab ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={15} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div
          className={`settings-topbar-status ${hasError ? "is-error" : ""}`}
          role="status"
        >
          <i aria-hidden="true" />
          <span>{status}</span>
        </div>
      </header>

      <main className="settings-main">
        <header className="settings-header">
          <div className="settings-header-copy">
            <p className="settings-eyebrow">设置</p>
            <h1>{meta.title}</h1>
            <p className="settings-desc">{meta.description}</p>
          </div>
        </header>

        <div
          key={page}
          className="settings-page"
          data-page={page}
          role="tabpanel"
          aria-label={meta.title}
        >
          {page === "appearance" && (
            <div className="appearance-layout">
              <section className="appearance-preview-card appearance-hero">
                <div className="card-topline">
                  <div>
                    <span className="card-kicker">LIVE PREVIEW</span>
                    <h2>桌面胶囊</h2>
                  </div>
                  <span className="preview-live">
                    <i />
                    实时预览
                  </span>
                </div>
                <div className="preview-stage preview-stage-hero">
                  {preview}
                </div>
                <div className="preview-caption">
                  <span>屏幕顶部 · 居中</span>
                  <span>随主题与缩放即时更新</span>
                </div>
              </section>

              <div className="appearance-grid">
                <section className="settings-card theme-panel">
                  <div className="settings-card-heading">
                    <div>
                      <span className="card-kicker">THEME</span>
                      <h2>界面主题</h2>
                    </div>
                  </div>
                  <div
                    className="theme-cards"
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
                          className={`theme-card-option ${active ? "active" : ""}`}
                          onClick={() =>
                            onAppearanceChange({
                              ...appearance,
                              theme: option.value,
                            })
                          }
                        >
                          <span
                            className={`theme-swatch theme-swatch-${option.swatch}`}
                            aria-hidden="true"
                          >
                            {active && (
                              <span className="theme-swatch-check">
                                <Check size={12} strokeWidth={3} />
                              </span>
                            )}
                          </span>
                          <span className="theme-card-copy">
                            <strong>{option.label}</strong>
                            <small>{option.hint}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="settings-card personalize-panel">
                  <div className="settings-card-heading">
                    <div>
                      <span className="card-kicker">PERSONALIZE</span>
                      <h2>胶囊样式</h2>
                    </div>
                  </div>
                  <label className="preference-row">
                    <span>
                      <strong>胶囊大小</strong>
                      <small>收起状态下的显示宽度</small>
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
                  <label className="preference-row">
                    <span>
                      <strong>显示当前时间</strong>
                      <small>收起时显示数字时钟</small>
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
            </div>
          )}

          {page === "behavior" && (
            <section className="settings-card behavior-card">
              <div className="settings-card-heading">
                <div className="behavior-icon">
                  <TimerReset size={17} />
                </div>
                <div>
                  <span className="card-kicker">INTERACTION</span>
                  <h2>鼠标离开后自动收起</h2>
                  <p>展开后鼠标移出面板，按设定时间折叠；计时器不会中断。</p>
                </div>
              </div>
              <div
                className="delay-options"
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
              <div className="behavior-hint">
                <MousePointer2 size={15} />
                <span>鼠标移回胶囊即可重新展开。</span>
              </div>
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
            <section className="settings-card about-card">
              <div className="about-mark">
                <AppWindow size={24} />
              </div>
              <h2>灵动岛</h2>
              <p>为 Windows 桌面打造的轻量状态与快捷操作入口。</p>
              <div className="about-version">
                版本 <span>0.1.0</span>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
