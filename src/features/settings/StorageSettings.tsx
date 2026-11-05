import { SettingsCard } from "./SettingsCard";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { t } from "../../services/i18n";

export function StorageSettings({
  canSwitch,
  onChanged,
}: {
  canSwitch: boolean;
  onChanged: () => Promise<void>;
}) {
  const [directory, setDirectory] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<string>("get_data_directory")
      .then((value) => {
        if (active) setDirectory(value);
      })
      .catch(() => {
        if (active) setMessage(t("无法读取数据目录"));
      });
    return () => {
      active = false;
    };
  }, [desktop]);
  async function chooseDirectory(existing: boolean) {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("请选择数据存放目录"),
      });
      if (!selected) return;
      setBusy(true);
      const result = await invoke<string>(
        existing ? "use_existing_data_directory" : "set_data_directory",
        {
          directory: selected,
        },
      );
      setDirectory(result);
      try {
        await onChanged();
        setMessage(
          existing
            ? t("已切换到已有数据，原目录数据保留。")
            : t("数据已复制到新目录，原目录保留备份。"),
        );
      } catch {
        setMessage(t("数据目录已切换，但设置同步失败，请重启应用。"));
      }
    } catch (error) {
      setMessage(`${t("切换失败：")}${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-stack">
      <SettingsCard>
        <div className="card-head">
          <h2>{t("数据目录")}</h2>
          <span className="card-note">SQLite</span>
        </div>
        <p className="card-desc">
          {t(
            "设置、邮箱账户与 AI 账户保存在本机数据库中，安装目录与数据目录分开。",
          )}
        </p>
        <div className="storage-path">
          {desktop ? directory || t("正在读取…") : t("请在桌面应用中查看")}
        </div>
        <div className="button-row">
          <button
            className="btn btn-quiet"
            disabled={!desktop || busy || !canSwitch}
            onClick={() => void chooseDirectory(false)}
          >
            <FolderOpen size={13} />
            {busy ? t("处理中…") : t("迁移到其他目录")}
          </button>
          <button
            className="btn btn-quiet"
            disabled={!desktop || busy || !canSwitch}
            onClick={() => void chooseDirectory(true)}
          >
            {t("使用已有数据")}
          </button>
        </div>
        <p className="card-hint">
          {t("迁移会复制并校验数据库，不覆盖目标目录中的文件，原目录保留。")}
        </p>
        {message && (
          <p className="card-hint" role="status">
            {message}
          </p>
        )}
      </SettingsCard>

      <SettingsCard>
        <div className="card-head">
          <h2>{t("凭据与隐私")}</h2>
        </div>
        <dl className="about-rows">
          <div>
            <dt>{t("邮箱授权码")}</dt>
            <dd>{t("Windows 凭据管理器，不写入数据库")}</dd>
          </div>
          <div>
            <dt>{t("AI 密钥")}</dt>
            <dd>{t("当前 Windows 用户加密后入库，换用户需重新添加")}</dd>
          </div>
          <div>
            <dt>{t("邮件内容")}</dt>
            <dd>{t("仅内存保留约 5 分钟，不保存正文与验证码")}</dd>
          </div>
        </dl>
      </SettingsCard>
    </div>
  );
}
