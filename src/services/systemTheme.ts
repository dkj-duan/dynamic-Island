import { invoke, isTauri } from "@tauri-apps/api/core";

export type ResolvedTheme = "light" | "dark";

/**
 * The OS preference. WebView2's media query can lag or stay light in a Win32
 * host, so the desktop app asks Windows directly and only falls back to it.
 */
export async function readSystemTheme(): Promise<ResolvedTheme> {
  if (isTauri()) {
    try {
      const value = await invoke<string>("get_system_theme");
      if (value === "dark" || value === "light") return value;
    } catch {
      /* fall back to the media query */
    }
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(
  preference: "system" | "light" | "dark",
  system: ResolvedTheme,
): ResolvedTheme {
  return preference === "system" ? system : preference;
}

/** Polls the OS preference (4 s) and on focus; returns the unsubscribe. */
export function watchSystemTheme(
  onChange: (theme: ResolvedTheme) => void,
): () => void {
  let active = true;
  let last: ResolvedTheme | null = null;
  const check = async () => {
    const next = await readSystemTheme();
    if (active && next !== last) {
      last = next;
      onChange(next);
    }
  };
  void check();
  const timer = window.setInterval(() => void check(), 4000);
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  return () => {
    active = false;
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  };
}
