import type { Dispatch, SetStateAction } from "react";
import { Mail, Check, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import type { RecentMail } from "../mail/useMail";
import { IslandEmpty } from "./IslandParts";
import { t } from "../../services/i18n";

type Props = {
  selectedMail: RecentMail | undefined;
  recentMail: RecentMail[];
  mailIndex: number;
  setMailIndex: Dispatch<SetStateAction<number>>;
  currentCopyStatus: string | null;
  setCopyStatus: Dispatch<
    SetStateAction<{ code: string; message: string } | null>
  >;
  copyCode: (code: string, expiresAt: number) => Promise<void>;
};

export function MailPage({
  selectedMail,
  recentMail,
  mailIndex,
  setMailIndex,
  currentCopyStatus,
  setCopyStatus,
  copyCode,
}: Props) {
  return (
    <div className="island-mail-view">
      {selectedMail ? (
        <>
          <div className="island-mail-top">
            <span className="mail-avatar" aria-hidden="true">
              <Mail size={16} />
            </span>
            <div className="island-mail-heading">
              <strong className="island-mail-subject">
                {selectedMail.subject || t("新邮件")}
              </strong>
              <span>
                {selectedMail.account} · {t("最近提醒")}
              </span>
            </div>
          </div>
          {/* Fixed regions: the pager stays put across mails. */}
          <div className="island-mail-body">
            {selectedMail.code ? (
              <div className="island-mail-code">
                <div className="island-mail-code-text">
                  <span className="island-mail-code-label">{t("验证码")}</span>
                  <strong>{selectedMail.code}</strong>
                </div>
                <button
                  className={`island-mail-code-copy ${currentCopyStatus ? "is-copied" : ""}`}
                  onClick={() =>
                    void copyCode(selectedMail.code!, selectedMail.expiresAt)
                  }
                >
                  {currentCopyStatus === t("已复制") ? (
                    <Check size={13} />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span>{currentCopyStatus || t("复制")}</span>
                </button>
              </div>
            ) : (
              <p className="island-mail-empty">{t("这封邮件未识别到验证码")}</p>
            )}
          </div>
          <div className="island-mail-navigation">
            {recentMail.length > 1 && (
              <>
                <button
                  aria-label={t("上一条提醒")}
                  disabled={mailIndex <= 0}
                  onClick={() => {
                    setMailIndex((value) => Math.max(0, value - 1));
                    setCopyStatus(null);
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {Math.min(mailIndex + 1, recentMail.length)} /{" "}
                  {recentMail.length}
                </span>
                <button
                  aria-label={t("下一条提醒")}
                  disabled={mailIndex >= recentMail.length - 1}
                  onClick={() => {
                    setMailIndex((value) =>
                      Math.min(recentMail.length - 1, value + 1),
                    );
                    setCopyStatus(null);
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <IslandEmpty
          tone="mail"
          icon={<Mail size={14} />}
          title={t("暂无新邮件提醒")}
          hint={t("在设置中添加邮箱后，新邮件会显示在这里。")}
        />
      )}
    </div>
  );
}
