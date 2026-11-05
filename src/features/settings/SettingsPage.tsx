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

const pageMeta: Record<Page, { title: string }> = {
  appearance: { title: "外观" },
  behavior: { title: "交互" },
  pomodoro: { title: "番茄钟" },
  status: { title: "状态提醒" },
  water: { title: "喝水提醒" },
  countdown: { title: "倒计时" },
  mail: { title: "邮箱提醒" },
  ai: { title: "AI 额度" },
  storage: { title: "数据与存储" },
  about: { title: "关于" },
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
