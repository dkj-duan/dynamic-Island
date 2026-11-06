import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useMemo, type ReactNode } from "react";
import type { Language } from "../../services/i18n";

const fontFamily =
  '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';

const baseTheme = {
  token: {
    fontFamily,
    fontSize: 13,
    borderRadius: 10,
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
} satisfies ThemeConfig;

const lightTheme: ThemeConfig = {
  ...baseTheme,
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...baseTheme.token,
    colorBgLayout: "#ffffff",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
  },
  components: {
    ...baseTheme.components,
    Layout: { siderBg: "#ffffff", bodyBg: "#ffffff" },
  },
};

const darkTheme: ThemeConfig = {
  ...baseTheme,
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseTheme.token,
    colorBgLayout: "#141414",
    colorBgContainer: "#1c1c1f",
    colorBgElevated: "#232327",
  },
  components: {
    ...baseTheme.components,
    Layout: { siderBg: "#18181b", bodyBg: "#141414" },
  },
};

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
  // Keep one theme object per mode; rebuilding it on every keystroke makes
  // antd recompute every token and can flash the whole page.
  const theme = useMemo(() => (dark ? darkTheme : lightTheme), [dark]);
  return (
    <ConfigProvider locale={language === "en-US" ? enUS : zhCN} theme={theme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
