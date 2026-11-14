import { messageView, type AppNoticeItem } from "../../domain/systemNotices";
import { t } from "../../services/i18n";
import { IslandEmpty } from "./IslandParts";
import { QQIcon } from "./QQIcon";
import { WechatIcon } from "./WechatIcon";

/** One watched chat app: label, brand icon and its open-window action. */
type MessageAppMeta = {
  label: string;
  icon: React.ReactNode;
  openLabel: string;
  enableHint: string;
};

const MESSAGE_APPS: Record<"wechat" | "qq", MessageAppMeta> = {
  wechat: {
    label: t("微信"),
    icon: <WechatIcon size={16} />,
    openLabel: t("打开微信"),
    enableHint: t("在消息提醒设置中开启微信消息上岛。"),
  },
  qq: {
    label: t("QQ"),
    icon: <QQIcon size={16} />,
    openLabel: t("打开QQ"),
    enableHint: t("在消息提醒设置中开启QQ消息上岛。"),
  },
};

/**
 * The aggregated messages page: one compact row per watched chat app, so the
 * page fits the island panel no matter how many sources are watched. A row
 * click brings that app's window forward.
 */
export function MessagesPage({
  messages,
  sources,
  language,
  onOpenApp,
}: {
  messages: Record<"wechat" | "qq", AppNoticeItem[]>;
  sources: Record<"wechat" | "qq", { enabled: boolean; showText: boolean }>;
  language: string;
  onOpenApp: (source: "wechat" | "qq") => void;
}) {
  const entries = (["wechat", "qq"] as const).flatMap((source) => {
    const latest = messages[source][0];
    if (!latest) return [];
    const meta = MESSAGE_APPS[source];
    const showText = sources[source]?.showText ?? true;
    const { sender, text } = messageView(latest.text, showText);
    return [
      {
        source,
        latest,
        sender: sender || meta.label,
        text: text ?? t("新通知"),
        time: new Date(latest.at).toLocaleTimeString(language, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      },
    ];
  });
  entries.sort((a, b) => b.latest.at - a.latest.at);
  if (entries.length === 0) {
    const anyEnabled = (["wechat", "qq"] as const).some(
      (source) => sources[source]?.enabled,
    );
    return (
      <div className="wechat-empty">
        <IslandEmpty
          tone="music"
          icon={<WechatIcon size={16} />}
          title={t("暂无新消息")}
          hint={
            anyEnabled
              ? t("新的微信消息会显示在这里。")
              : t("在消息提醒设置中开启消息上岛。")
          }
        />
      </div>
    );
  }
  return (
    <div className="island-message-list">
      {entries.map((entry) => {
        const meta = MESSAGE_APPS[entry.source];
        return (
          <button
            key={entry.source}
            type="button"
            className={`island-message-row is-${entry.source}`}
            title={meta.openLabel}
            onClick={() => onOpenApp(entry.source)}
          >
            <span className="island-notice-icon" aria-hidden="true">
              {meta.icon}
            </span>
            <span className="island-message-copy">
              <strong className="island-message-sender">{entry.sender}</strong>
              <span className="island-message-preview">{entry.text}</span>
            </span>
            <span className="island-message-time">{entry.time}</span>
          </button>
        );
      })}
    </div>
  );
}
