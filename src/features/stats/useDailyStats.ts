import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DailyStat } from "../../domain/dailyStats";
import { localDay } from "../../domain/pomodoro";
import { loadDailyStats } from "../../services/waterRepository";

export function useDailyStats(limit = 30) {
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [today, setToday] = useState(() => localDay(Date.now()));
  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await loadDailyStats(limit);
      if (!active) return;
      setToday(localDay(Date.now()));
      setStats(next);
    };
    void load();
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void listen<DailyStat>("daily-stats-changed", ({ payload }) => {
        if (!active) return;
        setToday(localDay(Date.now()));
        setStats((current) => {
          const next = current.filter((stat) => stat.day !== payload.day);
          next.push(payload);
          next.sort((a, b) => (a.day < b.day ? 1 : -1));
          return next.slice(0, limit);
        });
      })
        .then((dispose) => {
          if (active) unlisten = dispose;
          else dispose();
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      unlisten?.();
    };
  }, [limit]);
  return { stats, today };
}
