import { BellRing } from "lucide-react";
import type { AppNoticeItem } from "../../domain/systemNotices";
import { IslandEmpty } from "./IslandParts";
import { t } from "../../services/i18n";

/**
 * The island's notification page: the latest forwarded toast as a detail
 * view. Long text scrolls inside the page without changing tabs.
 */
export function NoticePage({
  notifications,
  forwardingEnabled,
  showText,
  language,
}: {
  notifications: AppNoticeItem[];
  forwardingEnabled: boolean;
  showText: boolean;
  language: string;
}) {
  const latest = notifications[0];
  if (!latest) {
    return (
      <IslandEmpty
        tone="mail"
        icon={<BellRing size={14} />}
        title={t("暂无通知")}
        hint={
          forwardingEnabled
            ? t("转发到灵动岛的系统通知会显示在这里。")
            : t("在提醒设置中开启通知转发后，系统通知会显示在这里。")
        }
      />
    );
  }
  return (
    <div className="island-notice-view is-system-notice" key={latest.id}>
      <article className="notice-card">
        <div className="island-notice-head">
          <span className="island-notice-icon" aria-hidden="true">
            <BellRing size={14} />
          </span>
          <strong className="island-notice-app">{latest.app}</strong>
          <span className="island-notice-time">
            {new Date(latest.at).toLocaleTimeString(language, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        </div>
        <p className="island-notice-text" tabIndex={0}>
          {showText ? latest.text : t("新通知")}
        </p>
      </article>
    </div>
  );
}
