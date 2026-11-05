import { useEffect, useState, type ReactNode } from "react";
import {
  CircleHelp,
  MousePointer2,
  Palette,
  Bell,
  Database,
  Mail,
  Bot,
  Timer,
  Droplets,
  Hourglass,
} from "lucide-react";
import type { AppearanceSettings } from "../../domain/settings";
import { AppearancePage } from "./AppearanceSettings";
import { BehaviorSettings } from "./BehaviorSettings";
import { AboutSettings } from "./AboutSettings";
import { CountdownSettings } from "./CountdownSettings";
import { StatusSettings } from "./StatusSettings";
import { StorageSettings } from "./StorageSettings";
import { MailSettings } from "./MailSettings";
import { AiSettings } from "./AiSettings";
import { PomodoroSettings } from "./PomodoroSettings";
import { WaterSettings } from "./WaterSettings";
import { setLanguage, t } from "../../services/i18n";
import appIcon from "../../assets/app-icon.png";

type Page =
  | "appearance"
  | "behavior"
  | "pomodoro"
  | "status"
  | "water"
  | "countdown"
  | "mail"
  | "ai"
  | "storage"
  | "about";

const pageMeta: Record<Page, { title: string; description: string }> = {
  appearance: {
    title: "外观",
    description: "主题、胶囊尺寸与桌面预览，改动会立即同步到灵动岛。",
  },
  behavior: {
    title: "交互",
    description: "选择展开方式、自动收起时长，以及灵动岛停靠的位置。",
  },
  pomodoro: {
    title: "番茄钟",
    description: "配置专注与休息时长，进度会跨应用重启保留。",
  },
  status: {
    title: "状态提醒",
    description: "读取音量、亮度、电源与蓝牙的变化，在灵动岛上短暂提示。",
  },
  water: {
    title: "喝水提醒",
    description: "设置每日目标与提醒时段，记录饮水并查看近 30 天数据。",
  },
  countdown: {
    title: "倒计时",
    description: "配置下班、午休等倒计时，并选择一条显示在空闲胶囊。",
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
  { id: "pomodoro", label: "番茄钟", icon: Timer },
  { id: "status", label: "状态", icon: Bell },
  { id: "water", label: "喝水", icon: Droplets },
  { id: "countdown", label: "倒计时", icon: Hourglass },
  { id: "mail", label: "邮箱", icon: Mail },
  { id: "ai", label: "AI 额度", icon: Bot },
  { id: "storage", label: "存储", icon: Database },
  { id: "about", label: "关于", icon: CircleHelp },
];

/* Grouped so the sidebar reads: island itself, its tools, its sources, then system. */
const navGroups: { label: string; ids: Page[] }[] = [
  { label: "通用", ids: ["appearance", "behavior"] },
  { label: "功能", ids: ["pomodoro", "water", "countdown"] },
  { label: "服务", ids: ["mail", "ai"] },
  { label: "系统", ids: ["status", "storage", "about"] },
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
              <AppearancePage
                appearance={appearance}
                onAppearanceChange={onAppearanceChange}
                preview={preview}
                canEdit={canEdit}
              />
            )}
            {page === "behavior" && (
              <BehaviorSettings
                appearance={appearance}
                onAppearanceChange={onAppearanceChange}
                canEdit={canEdit}
              />
            )}
            {page === "pomodoro" && <PomodoroSettings />}
            {page === "status" && <StatusSettings />}
            {page === "water" && <WaterSettings />}
            {page === "countdown" && <CountdownSettings />}
            {page === "storage" && (
              <StorageSettings
                canSwitch={canSwitchStorage}
                onChanged={onStorageChanged}
              />
            )}
            {page === "mail" && <MailSettings />}
            {page === "ai" && <AiSettings />}
            {page === "about" && (
              <AboutSettings onStorage={() => setPage("storage")} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
