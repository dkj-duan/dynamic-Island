import {
  wechatMessageView,
  type AppNoticeItem,
} from "../../domain/systemNotices";
import { t } from "../../services/i18n";
import { IslandEmpty } from "./IslandParts";
import { WechatIcon } from "./WechatIcon";

export function WechatPage({
  notifications,
  enabled,
  showText,
  language,
  onOpenWechat,
}: {
  notifications: AppNoticeItem[];
  enabled: boolean;
  showText: boolean;
  language: string;
  onOpenWechat: () => void;
}) {
  const latest = notifications[0];
  if (!latest) {
    return (
      <div className="wechat-empty">
        <IslandEmpty
          tone="music"
          icon={<WechatIcon size={16} />}
          title={t("暂无微信消息")}
          hint={
            enabled
              ? t("新的微信消息会显示在这里。")
              : t("在提醒设置中开启微信消息上岛。")
          }
        />
        <button
          className="wechat-open-button"
          type="button"
          onClick={onOpenWechat}
        >
          {t("打开微信")}
        </button>
      </div>
    );
  }
  const { sender, text } = wechatMessageView(latest.text, showText);
  return (
    <div className="island-notice-view is-wechat" key={latest.id}>
      <div className="island-notice-head">
        <span className="island-notice-icon" aria-hidden="true">
          <WechatIcon size={17} />
        </span>
        <strong className="island-notice-app">{sender || t("微信")}</strong>
        <span className="island-notice-time">
          {new Date(latest.at).toLocaleTimeString(language, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </div>
      <p className="island-notice-text wechat-message" tabIndex={0}>
        {text ?? t("新通知")}
      </p>
      <button
        className="wechat-open-button"
        type="button"
        onClick={onOpenWechat}
      >
        {t("打开微信")}
      </button>
    </div>
  );
}
