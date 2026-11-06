import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Layout,
  Menu,
  Segmented,
  Tooltip,
  Typography,
} from "antd";
import {
  BgColorsOutlined,
  BellOutlined,
  DesktopOutlined,
  MoonOutlined,
  SunOutlined,
  TranslationOutlined,
  ControlOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  HourglassOutlined,
  InfoCircleOutlined,
  MailOutlined,
  NotificationOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { AppearanceSettings } from "../../domain/settings";
import { AppearancePage } from "./AppearanceSettings";
import { BehaviorSettings } from "./BehaviorSettings";
import { ReminderSettings } from "./ReminderSettings";
import { AboutSettings } from "./AboutSettings";
import { CountdownSettings } from "./CountdownSettings";
import { StatusSettings } from "./StatusSettings";
import { StorageSettings } from "./StorageSettings";
import { MailSettings } from "./MailSettings";
import { AiSettings } from "./AiSettings";
import { PomodoroSettings } from "./PomodoroSettings";
import { WaterSettings } from "./WaterSettings";
import { SettingsTheme } from "./SettingsTheme";
import { setLanguage, t } from "../../services/i18n";
import {
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "../../services/systemTheme";
import appIcon from "../../assets/app-icon.png";

type Page =
  | "appearance"
  | "behavior"
  | "reminder"
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
  reminder: { title: "提醒" },
  pomodoro: { title: "番茄钟" },
  status: { title: "系统状态" },
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

const navGroups: { label: string; ids: Page[]; icon: ReactNode }[] = [
  {
    label: "通用",
    ids: ["appearance", "behavior", "reminder"],
    icon: <BgColorsOutlined />,
  },
  {
    label: "功能",
    ids: ["pomodoro", "water", "countdown"],
    icon: <ThunderboltOutlined />,
  },
  { label: "服务", ids: ["mail", "ai"], icon: <MailOutlined /> },
  {
    label: "系统",
    ids: ["status", "storage", "about"],
    icon: <InfoCircleOutlined />,
  },
];

const navIcons: Record<Page, ReactNode> = {
  appearance: <BgColorsOutlined />,
  behavior: <ControlOutlined />,
  reminder: <BellOutlined />,
  pomodoro: <FieldTimeOutlined />,
  water: <ThunderboltOutlined />,
  countdown: <HourglassOutlined />,
  status: <NotificationOutlined />,
  mail: <MailOutlined />,
  ai: <RobotOutlined />,
  storage: <DatabaseOutlined />,
  about: <InfoCircleOutlined />,
};

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
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  useEffect(() => watchSystemTheme(setSystemTheme), []);
  const dark = resolveTheme(appearance.theme, systemTheme) === "dark";
  setLanguage(appearance.language);

  useEffect(() => {
    document.documentElement.dataset.settingsTheme = dark ? "dark" : "light";
    return () => {
      delete document.documentElement.dataset.settingsTheme;
    };
  }, [dark]);

  const menuItems = useMemo(
    () =>
      navGroups.map((group) => ({
        type: "group" as const,
        label: t(group.label, appearance.language),
        children: group.ids.map((id) => ({
          key: id,
          icon: navIcons[id],
          label: t(pageMeta[id].title, appearance.language),
        })),
      })),
    [appearance.language],
  );

  const meta = pageMeta[page];
  const hasError = status.includes("失败");

  return (
    <SettingsTheme dark={dark} language={appearance.language}>
      <Layout className="antd-settings" data-theme={dark ? "dark" : "light"}>
        <Layout.Sider
          width={228}
          className="antd-sider"
          theme={dark ? "dark" : "light"}
        >
          <div className="antd-brand">
            <img src={appIcon} alt="" />
            <div>
              <strong>{t("灵动岛")}</strong>
              <span>{t("设置")}</span>
            </div>
          </div>
          <Menu
            theme={dark ? "dark" : "light"}
            mode="inline"
            selectedKeys={[page]}
            items={menuItems}
            onClick={({ key }) => setPage(key as Page)}
            className="antd-menu"
          />
          <div className="antd-quick-settings">
            <Segmented
              block
              size="small"
              value={appearance.theme}
              onChange={(value) =>
                onAppearanceChange({
                  ...appearance,
                  theme: value as AppearanceSettings["theme"],
                })
              }
              options={[
                {
                  value: "system",
                  label: (
                    <Tooltip title={t("跟随系统")}>
                      <DesktopOutlined />
                    </Tooltip>
                  ),
                },
                {
                  value: "light",
                  label: (
                    <Tooltip title={t("浅色")}>
                      <SunOutlined />
                    </Tooltip>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <Tooltip title={t("深色")}>
                      <MoonOutlined />
                    </Tooltip>
                  ),
                },
              ]}
            />
            <Tooltip
              title={
                appearance.language === "zh-CN"
                  ? "Switch to English"
                  : "切换到中文"
              }
            >
              <Button
                size="small"
                icon={<TranslationOutlined />}
                aria-label={t("界面语言")}
                onClick={() =>
                  onAppearanceChange({
                    ...appearance,
                    language:
                      appearance.language === "zh-CN" ? "en-US" : "zh-CN",
                  })
                }
              />
            </Tooltip>
          </div>
          <div className="antd-status">
            <Badge
              status={hasError ? "error" : "processing"}
              text={status}
              style={{ width: "100%" }}
            />
          </div>
        </Layout.Sider>

        <Layout.Content className="antd-content">
          <div className="antd-page">
            <Typography.Title level={3} className="antd-page-title">
              {t(meta.title)}
            </Typography.Title>
            <div key={page} className="antd-page-body">
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
              {page === "reminder" && (
                <ReminderSettings
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
        </Layout.Content>
      </Layout>
    </SettingsTheme>
  );
}
