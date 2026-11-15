import bluetoothArt from "../../assets/island/bluetooth.png";
import volumeArt from "../../assets/island/volume.png";
import batteryArt from "../../assets/island/battery.png";
import audioArt from "../../assets/island/audio-device.png";
import brightnessArt from "../../assets/island/brightness.png";
import awayChairArt from "../../assets/island/away-chair.png";
import clockArt from "../../assets/island/clock.png";
import musicArt from "../../assets/island/music.png";
import mailArt from "../../assets/island/mail.png";
import aiArt from "../../assets/island/ai-quota.png";
import messagesArt from "../../assets/island/messages.png";
import noticeArt from "../../assets/island/notice.png";
import waterDropArt from "../../assets/water-drop.webp";
import type { NotificationSource } from "../../domain/systemNotices";
import type { IslandTab } from "./islandPages";
import { QQIcon } from "./QQIcon";
import { WechatIcon } from "./WechatIcon";

export function NoticeIcon({
  kind,
  source,
}: {
  kind:
    "volume" | "power" | "brightness" | "bluetooth" | "audio" | "notification";
  source?: NotificationSource;
}) {
  if (kind === "notification" && source === "wechat") {
    return <WechatIcon size={15} />;
  }
  if (kind === "notification" && source === "qq") {
    return <QQIcon size={15} />;
  }
  const art = {
    volume: volumeArt,
    power: batteryArt,
    brightness: brightnessArt,
    audio: audioArt,
    notification: noticeArt,
    bluetooth: bluetoothArt,
  }[kind];
  return (
    <img
      className="system-notice-art"
      src={art}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Shared empty page state with the same artwork as the page switcher. */
export function IslandEmpty({
  page,
  title,
  hint,
}: {
  page: "music" | "mail" | "ai" | "messages" | "notice";
  title: string;
  hint: string;
}) {
  return (
    <div className="island-empty">
      <span className="island-empty-icon" aria-hidden="true">
        <img src={PAGE_ART[page]} alt="" draggable={false} />
      </span>
      <strong>{title}</strong>
      <span className="island-empty-hint">{hint}</span>
    </div>
  );
}

/** Pages whose tab carries the island's own art; the rest keep line glyphs. */
const PAGE_ART: Record<IslandTab, string> = {
  timer: clockArt,
  music: musicArt,
  water: waterDropArt,
  sedentary: awayChairArt,
  device: bluetoothArt,
  mail: mailArt,
  ai: aiArt,
  messages: messagesArt,
  notice: noticeArt,
};

/** Glyph for the bottom page switcher: one icon per island page. */
export function IslandPageIcon({ page }: { page: IslandTab }) {
  return (
    <img
      className="pager-tab-img"
      src={PAGE_ART[page]}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
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
