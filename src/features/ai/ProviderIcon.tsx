import { Bot } from "lucide-react";
import codex from "../../assets/ai/codex.svg";
import kimi from "../../assets/ai/kimi.svg";
import deepseek from "../../assets/ai/deepseek.svg";
import minimax from "../../assets/ai/minimax.svg";
import openrouter from "../../assets/ai/openrouter.svg";

const icons: Record<string, { image: string; tone: string }> = {
  "codex-local": { image: codex, tone: "codex" },
  "kimi-local": { image: kimi, tone: "kimi" },
  deepseek: { image: deepseek, tone: "deepseek" },
  "minimax-cn": { image: minimax, tone: "minimax" },
  "minimax-global": { image: minimax, tone: "minimax" },
  openrouter: { image: openrouter, tone: "openrouter" },
};
export function ProviderIcon({
  provider,
  size = "normal",
}: {
  provider: string;
  size?: "tiny" | "normal" | "large";
}) {
  const icon = icons[provider];
  return (
    <span
      className={`provider-icon provider-icon-${size} provider-icon-${icon?.tone ?? "unknown"}`}
      aria-hidden="true"
    >
      {icon ? <img src={icon.image} alt="" /> : <Bot />}
    </span>
  );
}
