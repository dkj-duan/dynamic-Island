import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MailAccount, MailNotice } from "./types";

export type RecentMail = MailNotice & { expiresAt: number };

/** A code waits for the user (the notice itself lives for five minutes);
 *  plain mail only gets a short heads-up. */
const CODE_HIGHLIGHT_MS = 300_000;
const MAIL_HIGHLIGHT_MS = 10_000;

export function useMail() {
  const [recent, setRecent] = useState<RecentMail[]>([]);
  const [highlight, setHighlight] = useState(false);
  const highlightTimer = useRef<number | undefined>(undefined);
  /** Called when the user copies the code or opens the panel. */
  const dismissHighlight = useCallback(() => {
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = undefined;
    setHighlight(false);
  }, []);
  useEffect(() => {
    let active = true;
    let running = false;
    let requested = false;
    let pollTimer: number | undefined;
    let unlisten: (() => void) | undefined;
    async function poll() {
      if (running) {
        requested = true;
        return;
      }
      running = true;
      window.clearTimeout(pollTimer);
      try {
        const accounts = await invoke<MailAccount[]>("list_mail_accounts");
        if (!active) return;
        setRecent((current) =>
          current.filter((item) =>
            accounts.some((account) => account.id === item.accountId),
          ),
        );
        async function pollAccount(account: MailAccount) {
          try {
            const notices = await invoke<MailNotice[]>("poll_mail", {
              id: account.id,
            });
            if (!active || notices.length === 0) return;
            const expiresAt = Date.now() + 5 * 60_000;
            setRecent((current) =>
              [
                ...notices
                  .slice()
                  .reverse()
                  .map((item) => ({ ...item, expiresAt })),
                ...current,
              ].slice(0, 10),
            );
            setHighlight(true);
            window.clearTimeout(highlightTimer.current);
            const duration = notices.some((item) => item.code)
              ? CODE_HIGHLIGHT_MS
              : MAIL_HIGHLIGHT_MS;
            highlightTimer.current = window.setTimeout(() => {
              highlightTimer.current = undefined;
              setHighlight(false);
            }, duration);
          } catch (error) {
            console.error("邮件检查失败", error);
          }
        }
        for (let index = 0; index < accounts.length && active; index += 3) {
          await Promise.all(accounts.slice(index, index + 3).map(pollAccount));
        }
      } catch (error) {
        console.error("邮箱账户读取失败", error);
      } finally {
        running = false;
        if (active) {
          const delay = requested ? 0 : 8_000;
          requested = false;
          pollTimer = window.setTimeout(() => void poll(), delay);
        }
      }
    }
    void listen("mail-accounts-changed", () => void poll(), {
      target: "island",
    })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch((error) => console.error("邮箱更新监听失败", error));
    const expiry = window.setInterval(
      () =>
        setRecent((current) =>
          current.filter((item) => item.expiresAt > Date.now()),
        ),
      10_000,
    );
    void poll();
    return () => {
      active = false;
      unlisten?.();
      window.clearTimeout(pollTimer);
      window.clearTimeout(highlightTimer.current);
      window.clearInterval(expiry);
    };
  }, []);
  return { recent, highlight, dismissHighlight };
}
