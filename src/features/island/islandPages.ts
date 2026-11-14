export const ISLAND_PAGES = [
  { id: "timer", label: "计时器" },
  { id: "music", label: "音乐" },
  { id: "mail", label: "邮件" },
  { id: "water", label: "喝水" },
  { id: "sedentary", label: "久坐" },
  { id: "ai", label: "AI 额度" },
  { id: "device", label: "设备" },
  { id: "wechat", label: "微信" },
  { id: "notice", label: "通知" },
] as const;

export type IslandTab = (typeof ISLAND_PAGES)[number]["id"];
