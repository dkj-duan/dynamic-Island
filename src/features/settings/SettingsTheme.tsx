import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import type { ReactNode } from "react";
import type { Language } from "../../services/i18n";

const fontFamily =
  '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';

/** Ant Design theme shared by every settings page. */
export function SettingsTheme({
  dark,
  language,
  children,
}: {
  dark: boolean;
  language: Language;
  children: ReactNode;
}) {
  return (
    <ConfigProvider
      locale={language === "en-US" ? enUS : zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          fontFamily,
          fontSize: 13,
          borderRadius: 10,
          colorBgLayout: dark ? "#141414" : "#ffffff",
          colorBgContainer: dark ? "#1c1c1f" : "#ffffff",
          colorBgElevated: dark ? "#232327" : "#ffffff",
        },
        components: {
          Card: {
            headerFontSize: 14,
            headerHeight: 44,
            paddingLG: 18,
          },
          Menu: {
            itemHeight: 34,
            itemBorderRadius: 8,
            itemMarginInline: 8,
            iconSize: 15,
            groupTitleFontSize: 11,
          },
          Layout: {
            siderBg: dark ? "#18181b" : "#ffffff",
            bodyBg: dark ? "#141414" : "#ffffff",
          },
          Button: {
            controlHeight: 30,
            fontWeight: 500,
          },
          Input: {
            controlHeight: 32,
          },
          Select: {
            controlHeight: 32,
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
