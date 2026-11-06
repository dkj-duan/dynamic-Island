export const ISLAND_PAGES = [
  { id: "timer", label: "计时器" },
  { id: "music", label: "音乐" },
  { id: "mail", label: "邮件" },
  { id: "water", label: "喝水" },
  { id: "ai", label: "AI 额度" },
] as const;

export type IslandTab = (typeof ISLAND_PAGES)[number]["id"];
