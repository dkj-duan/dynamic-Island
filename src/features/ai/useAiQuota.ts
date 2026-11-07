import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { QuotaItem } from "../../domain/aiQuota";
export type AiAccount = {
  id: string;
  provider: string;
  name: string;
  pinned: boolean;
};
export type AiQuota = {
  id: string;
  name: string;
  provider: string;
  items: QuotaItem[];
};
export type AiResult = { quota?: AiQuota; error?: string; updatedAt: number };
type AiQuotaUpdate = { id: string; quota: AiQuota; updatedAt: number };
export function useAiQuota() {
  const [accounts, setAccounts] = useState<AiAccount[]>([]);
  const [results, setResults] = useState<Record<string, AiResult>>({});
  const [error, setError] = useState("");
  /** True while a full query cycle is in progress (the refresh spinner). */
  const [refreshing, setRefreshing] = useState(false);
  /** Accounts with a query in flight, so rows can show live feedback. */
  const [querying, setQuerying] = useState<string[]>([]);
  const active = useRef(false);
  const running = useRef(false);
  const pending = useRef(false);
  const reload = useCallback(async () => {
    if (!isTauri()) return;
    if (running.current) {
      pending.current = true;
      return;
    }
    running.current = true;
    setRefreshing(true);
    try {
      const list = await invoke<AiAccount[]>("list_ai_accounts");
      if (!active.current) return;
      setAccounts(list);
      setError("");
      setResults((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([id]) => list.some((a) => a.id === id)),
        ),
      );
      for (let i = 0; i < list.length && active.current; i += 3) {
        await Promise.all(
          list.slice(i, i + 3).map(async (account) => {
            setQuerying((old) =>
              old.includes(account.id) ? old : [...old, account.id],
            );
            try {
              const quota = await invoke<AiQuota>("query_ai_quota", {
                id: account.id,
              });
              if (active.current)
                setResults((old) => ({
                  ...old,
                  [account.id]: { quota, updatedAt: Date.now() },
                }));
            } catch (error) {
              if (active.current)
                setResults((old) => ({
                  ...old,
                  [account.id]: { error: String(error), updatedAt: Date.now() },
                }));
            } finally {
              setQuerying((old) => old.filter((id) => id !== account.id));
            }
          }),
        );
      }
    } catch {
      if (active.current) setError("无法读取 AI 账户");
    } finally {
      running.current = false;
      setRefreshing(false);
      if (pending.current && active.current) {
        pending.current = false;
        void reload();
      }
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void reload();
    const timer = window.setInterval(() => void reload(), 120_000);
    const unlisteners: (() => void)[] = [];
    const track = (pending: Promise<() => void>) => {
      void pending
        .then((fn) => {
          if (active.current) unlisteners.push(fn);
          else fn();
        })
        .catch(() => {});
    };
    if (isTauri()) {
      track(listen("ai-accounts-changed", () => void reload()));
      // Any window that refreshed a quota shares the result, so a successful
      // refresh in settings shows up on the island immediately.
      track(
        listen<AiQuotaUpdate>("ai-quota-updated", (event) => {
          if (!active.current) return;
          const { id, quota, updatedAt } = event.payload;
          setResults((old) => ({ ...old, [id]: { quota, updatedAt } }));
        }),
      );
    }
    return () => {
      active.current = false;
      window.clearInterval(timer);
      unlisteners.forEach((fn) => fn());
    };
  }, [reload]);
  return { accounts, results, error, reload, refreshing, querying };
}
