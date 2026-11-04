export type QuotaItem = { label: string; value: string };
export function aiProviderName(provider: string): string {
  return (
    (
      {
        "codex-local": "Codex",
        "kimi-local": "Kimi",
        deepseek: "DeepSeek",
        openrouter: "OpenRouter",
        "minimax-cn": "MiniMax",
        "minimax-global": "MiniMax 国际",
      } as Record<string, string>
    )[provider] ?? provider
  );
}

/** Only an explicit, valid percentage is a quota ring; currency is not. */
export function quotaPercent(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (!match) return null;
  const valueNumber = Number(match[1]);
  return Number.isFinite(valueNumber) && valueNumber >= 0 && valueNumber <= 100
    ? valueNumber
    : null;
}
export function quotaRings(
  items: QuotaItem[],
): { item: QuotaItem; percent: number }[] {
  return items
    .flatMap((item) => {
      const percent = quotaPercent(item.value);
      return percent === null ? [] : [{ item, percent }];
    })
    .slice(0, 2);
}
