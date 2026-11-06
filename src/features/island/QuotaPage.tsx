import type { CSSProperties } from "react";
import { Bot } from "lucide-react";
import {
  aiProviderName,
  type QuotaItem,
  quotaRings,
} from "../../domain/aiQuota";
import type { AiAccount, AiResult } from "../ai/useAiQuota";
import { QuotaRings } from "../ai/QuotaRings";
import { ProviderIcon } from "../ai/ProviderIcon";
import { IslandEmpty } from "./IslandParts";
import { t } from "../../services/i18n";
import { formatResetMoment } from "./islandFormat";

type Props = {
  accounts: AiAccount[];
  selectedAi: AiAccount | undefined;
  selectedAiResult: AiResult | undefined;
  selectedItems: QuotaItem[];
  selectedRings: ReturnType<typeof quotaRings>;
  setSelectedAiId: (id: string) => void;
  language: string;
};

export function QuotaPage({
  accounts,
  selectedAi,
  selectedAiResult,
  selectedItems,
  selectedRings,
  setSelectedAiId,
  language,
}: Props) {
  return (
    <div className="quota-view">
      {accounts.length === 0 ? (
        <IslandEmpty
          tone="ai"
          icon={<Bot size={14} />}
          title={t("尚未添加 AI 账户")}
          hint={t("在设置的 AI 额度页面添加。")}
        />
      ) : (
        <div
          className={`quota-hero ${selectedRings.length ? "" : "is-balance"}`}
          key={selectedAi?.id ?? "none"}
        >
          {selectedRings.length ? (
            <QuotaRings items={selectedItems} compact={false} />
          ) : (
            <div className="quota-balance-icon">
              <ProviderIcon
                provider={selectedAi?.provider ?? ""}
                size="large"
              />
            </div>
          )}
          <div className="quota-hero-copy">
            <div className="quota-hero-line">
              {accounts.length > 1 ? (
                <div
                  className="quota-switcher"
                  role="group"
                  aria-label={t("选择 AI 账户")}
                >
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      className={account.id === selectedAi?.id ? "active" : ""}
                      aria-pressed={account.id === selectedAi?.id}
                      title={`${account.name} · ${aiProviderName(account.provider)}`}
                      onClick={() => setSelectedAiId(account.id)}
                    >
                      <ProviderIcon provider={account.provider} size="tiny" />
                      <span>{account.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <ProviderIcon
                    provider={selectedAi?.provider ?? ""}
                    size="tiny"
                  />
                  <strong>{selectedAi?.name}</strong>
                  {selectedAi &&
                    aiProviderName(selectedAi.provider).toLowerCase() !==
                      selectedAi.name.toLowerCase() && (
                      <span className="quota-hero-provider">
                        {aiProviderName(selectedAi.provider)}
                      </span>
                    )}
                </>
              )}
              {selectedAi?.pinned && (
                <em className="quota-hero-pin">{t("常驻")}</em>
              )}
            </div>
            <div className="quota-metrics">
              {selectedItems.length ? (
                selectedItems.map((item, index) => {
                  const ringIndex = selectedRings.findIndex(
                    (ring) => ring.item === item,
                  );
                  const percent =
                    ringIndex >= 0 ? selectedRings[ringIndex].percent : null;
                  // A lone ring already shows its percentage in the
                  // middle, so that row carries the reset time
                  // instead of repeating the number.
                  const percentInRing =
                    selectedRings.length === 1 && ringIndex === 0;
                  const resetLabel =
                    item.resetAt != null
                      ? formatResetMoment(item.resetAt, language)
                      : null;
                  // Only a lone ring frees the row's tail for the
                  // reset stamp; otherwise the value keeps that slot
                  // and the stamp lives in the tooltip.
                  const resetInRow =
                    resetLabel !== null && selectedRings.length === 1;
                  return (
                    <div
                      className="quota-metric"
                      key={`${item.label}-${index}`}
                      title={
                        resetLabel ? `${t("重置")} ${resetLabel}` : undefined
                      }
                    >
                      <div className="quota-metric-head">
                        <span className="quota-metric-label">
                          {ringIndex >= 0 && (
                            <i className={`quota-dot quota-dot-${ringIndex}`} />
                          )}
                          {item.label}
                        </span>
                        {percent !== null && (
                          <span
                            className="quota-metric-track"
                            aria-hidden="true"
                          >
                            <span
                              className={`quota-metric-fill quota-fill-${ringIndex}`}
                              style={
                                {
                                  "--fill": `${percent}%`,
                                } as CSSProperties
                              }
                            />
                          </span>
                        )}
                        {resetInRow ? (
                          <span className="quota-metric-reset">
                            {`${t("重置")} ${resetLabel ?? ""}`}
                          </span>
                        ) : percentInRing ? null : (
                          <strong>{item.value}</strong>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="quota-message">
                  {selectedAiResult?.error ?? t("正在查询额度…")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
