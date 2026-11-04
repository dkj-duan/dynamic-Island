import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  items: { label: string; value: string }[];
};
export type AiResult = { quota?: AiQuota; error?: string; updatedAt: number };
export function useAiQuota() {
  const [accounts, setAccounts] = useState<AiAccount[]>([]);
  const [results, setResults] = useState<Record<string, AiResult>>({});
  const [error, setError] = useState("");
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
            }
          }),
        );
      }
    } catch {
      if (active.current) setError("无法读取 AI 账户");
    } finally {
      running.current = false;
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
    let unlisten: (() => void) | undefined;
    if (isTauri())
      void listen("ai-accounts-changed", () => void reload())
        .then((fn) => {
          if (active.current) unlisten = fn;
          else fn();
        })
        .catch(() => {});
    return () => {
      active.current = false;
      window.clearInterval(timer);
      unlisten?.();
    };
  }, [reload]);
  return { accounts, results, error, reload };
}
