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
      fontWeight: 500,
    },
    Input: {
      controlHeight: 32,
    },
    Select: {
      controlHeight: 32,
    },
    Switch: {
      trackHeight: 24,
      trackMinWidth: 44,
      handleSize: 20,
      trackPadding: 2,
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
    Segmented: {
      trackBg: "#f2f2f5",
      trackPadding: 3,
      itemColor: "#5f5f68",
      itemHoverBg: "#e9e9ef",
      itemHoverColor: "#1f1f24",
      itemSelectedBg: "#ffffff",
      itemSelectedColor: "#1f1f24",
    },
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
    Segmented: {
      trackBg: "#242429",
      trackPadding: 3,
      itemColor: "#a5a5b0",
      itemHoverBg: "#303038",
      itemHoverColor: "#f0f0f4",
      itemSelectedBg: "#3a3a43",
      itemSelectedColor: "#f5f5f8",
    },
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
