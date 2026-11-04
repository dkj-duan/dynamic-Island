import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
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
import { languageOptions, setLanguage, t } from "../../services/i18n";
import appIcon from "../../assets/app-icon.png";

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

type NavItem = { id: Page; label: string; icon: typeof Palette };

const navItems: NavItem[] = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "behavior", label: "交互", icon: MousePointer2 },
  { id: "status", label: "状态", icon: Bell },
  { id: "mail", label: "邮箱", icon: Mail },
  { id: "ai", label: "AI 额度", icon: Bot },
  { id: "storage", label: "存储", icon: Database },
  { id: "about", label: "关于", icon: CircleHelp },
];

/* Grouped so the sidebar reads: island itself, its sources, then system. */
const navGroups: { label: string; ids: Page[] }[] = [
  { label: "通用", ids: ["appearance", "behavior"] },
  { label: "提醒源", ids: ["status", "mail", "ai"] },
  { label: "系统", ids: ["storage", "about"] },
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
  setLanguage(appearance.language);
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
            <img src={appIcon} alt="" />
          </span>
          <span className="settings-brand-text">
            <strong>{t("灵动岛")}</strong>
            <small>{t("设置")}</small>
          </span>
        </div>

        <nav className="settings-nav" aria-label={t("设置分区")}>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-title">{t(group.label)}</span>
              {group.ids.map((id) => {
                const item = navItems.find((nav) => nav.id === id)!;
                const Icon = item.icon;
                const label = t(item.label);
                return (
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
                );
              })}
            </div>
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
            <h1>{t(meta.title)}</h1>
            <p>{t(meta.description)}</p>
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
                    <h2>{t("桌面预览")}</h2>
                    <span className="card-note">{t("实时同步")}</span>
                  </div>
                  <div className="preview-stage">{preview}</div>
                  <div className="preview-caption">
                    <span>{t("屏幕顶部 · 居中")}</span>
                    <span>{t("随主题与缩放即时更新")}</span>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="card-head">
                    <h2>{t("界面主题")}</h2>
                    <span className="card-note">{t("仅影响设置窗口")}</span>
                  </div>
                  <div
                    className="theme-options"
                    role="radiogroup"
                    aria-label={t("界面主题")}
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
                            <strong>{t(option.label)}</strong>
                            <small>{t(option.hint)}</small>
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

                  <div className="setting-row">
                    <span className="setting-row-copy">
                      <strong>{t("界面语言")}</strong>
                      <small>
                        {t("界面语言选择后立即生效，两个窗口一起切换。")}
                      </small>
                    </span>
                    <div
                      className="segmented"
                      role="group"
                      aria-label={t("界面语言")}
                    >
                      {languageOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canEdit}
                          aria-pressed={appearance.language === option.value}
                          className={
                            appearance.language === option.value ? "active" : ""
                          }
                          onClick={() =>
                            onAppearanceChange({
                              ...appearance,
                              language: option.value,
                            })
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="card-head">
                    <h2>{t("胶囊")}</h2>
                  </div>
                  <label className="setting-row">
                    <span className="setting-row-copy">
                      <strong>{t("显示尺寸")}</strong>
                      <small>{t("收起状态下灵动岛的宽度")}</small>
                    </span>
                    <span className="range-control">
                      <input
                        aria-label={t("胶囊大小")}
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
                      <strong>{t("显示当前时间")}</strong>
                      <small>{t("收起时显示数字时钟与日期")}</small>
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
                    <h2>{t("展开方式")}</h2>
                    <p>{t("悬停模式把指针移到胶囊上就会展开，不用点击。")}</p>
                  </div>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label={t("展开方式")}
                >
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
                      {t(option.label)}
                    </button>
                  ))}
                </div>
                <div className="setting-row">
                  <span className="setting-row-copy">
                    <strong>{t("灵动岛位置")}</strong>
                    <small>
                      {t("按住胶囊或面板顶栏即可拖动，松手后位置会被记住。")}
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
                    {positionReset ? t("已恢复") : t("恢复默认位置")}
                  </button>
                </div>
              </section>
            )}

            {page === "behavior" && (
              <section className="settings-card">
                <div className="card-head">
                  <div>
                    <h2>{t("鼠标离开后自动收起")}</h2>
                    <p>
                      {t("展开后鼠标移出面板，按设定时间折叠；计时不会中断。")}
                    </p>
                  </div>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label={t("鼠标离开后自动收起")}
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
                      {t(option.label)}
                    </button>
                  ))}
                </div>
                <p className="card-hint">
                  {t(
                    "鼠标移回胶囊会取消收起计时；自动收起不会停止正在进行的倒计时。",
                  )}
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
                    <img src={appIcon} alt="" />
                  </span>
                  <div>
                    <h2>{t("灵动岛")}</h2>
                    <p>{t("为 Windows 桌面打造的状态提醒与快捷操作入口。")}</p>
                  </div>
                </div>
                <dl className="about-rows">
                  <div>
                    <dt>{t("版本")}</dt>
                    <dd>0.1.0</dd>
                  </div>
                  <div>
                    <dt>{t("技术栈")}</dt>
                    <dd>Tauri 2 · React 19 · Rust</dd>
                  </div>
                  <div>
                    <dt>{t("运行环境")}</dt>
                    <dd>Windows 10/11 · WebView2</dd>
                  </div>
                  <div>
                    <dt>{t("数据")}</dt>
                    <dd>{t("本机 SQLite，凭据使用 Windows 用户加密")}</dd>
                  </div>
                  <div>
                    <dt>{t("项目地址")}</dt>
                    <dd>
                      <a
                        className="about-link"
                        href="https://github.com/dkj-duan/dynamic-Island"
                        target="_blank"
                        rel="noreferrer"
                      >
                        github.com/dkj-duan/dynamic-Island
                      </a>
                    </dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button
                    className="btn btn-quiet"
                    type="button"
                    onClick={() => setPage("storage")}
                  >
                    {t("查看数据目录")}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
