import type { ReactNode } from "react";
import {
  Bluetooth,
  Bot,
  Droplet,
  Headphones,
  Mail,
  Music2,
  PlugZap,
  Sun,
  Timer,
  Volume2,
} from "lucide-react";
import type { IslandTab } from "./islandPages";

export function NoticeIcon({
  kind,
}: {
  kind: "volume" | "power" | "brightness" | "bluetooth" | "audio";
}) {
  const Icon =
    kind === "volume"
      ? Volume2
      : kind === "power"
        ? PlugZap
        : kind === "brightness"
          ? Sun
          : kind === "audio"
            ? Headphones
            : Bluetooth;
  return <Icon size={15} aria-hidden="true" />;
}

/** Shared empty page state: tinted glyph, title and a bounded hint line. */
export function IslandEmpty({
  tone,
  icon,
  title,
  hint,
}: {
  tone: "music" | "mail" | "ai";
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className={`island-empty is-${tone}`}>
      <span className="island-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{title}</strong>
      <span className="island-empty-hint">{hint}</span>
    </div>
  );
}

/** Glyph for the bottom page switcher: one icon per island page. */
export function IslandPageIcon({ page }: { page: IslandTab }) {
  const Icon =
    page === "timer"
      ? Timer
      : page === "music"
        ? Music2
        : page === "mail"
          ? Mail
          : page === "water"
            ? Droplet
            : page === "device"
              ? Headphones
              : Bot;
  return <Icon size={13} aria-hidden="true" />;
}

export function MediaWave({
  playing,
  compact = false,
}: {
  playing: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`media-wave ${compact ? "media-wave-compact" : ""} ${playing ? "is-playing" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: compact ? 4 : 32 }, (_, index) => (
        <i
          key={index}
          style={{
            height: `${32 + ((index * 37 + 19) % 65)}%`,
            animationDuration: `${0.8 + ((index * 29 + 13) % 85) / 100}s`,
            animationDelay: `${-((index * 47 + 11) % 130) / 100}s`,
          }}
        />
      ))}
    </span>
  );
}
